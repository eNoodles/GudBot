const { ButtonStyle } = require('discord-api-types/v10');
const { MessageButton, MessageEmbed, Message, GuildMember, MessageActionRow, User, Collection } = require('discord.js');
const { Model } = require('sequelize');
const { Op, jail_records, jailed_roles} = require('../database/dbObjects');
const { ids, colors, getUnixTimestamp, extractImageUrls, prependFakeReply, generateFileLinks, findLastSpaceIndex, addEllipsisDots, logUnlessUnknown, getCachedChannel } = require('../utils');

/**
 * K: record ID
 * V: JailData
 * @type {Collection<string,JailData>} 
 */
const jail_data_cache = new Collection();

class JailData {
    /**
     * @param {Model} record 
     * @param {Model[]} role_entries 
     * @param {GuildMember} member 
     * @param {Message} message 
     */
    constructor(record, role_entries, member, message) {
        this.record = record;
        this.role_entries = role_entries;
        this.member = member;
        this.message = message;
    }

    /**
     * @param {User} [unjailer_user] User who performed manual unjailing
     */
    async unjailMember(unjailer_user) {
        //make sure user hasnt already been unjailed
        if (this.record.unjailed) throw 'Jail record already marked as unjailed!';

        //message displayed in audit log
        const audit_log_msg = unjailer_user ? `Unjailed by ${unjailer_user.tag}` : 'Unjailed automatically';

        //removed jailed role and restore saved roles
        const set_roles = this.member.roles
            .set(
                this.role_entries.map(entry => entry.role_id), 
                audit_log_msg
            )
            .then(member => this.member = member)
            .catch(console.error);

        //update time of release with current timestamp
        const current_timestamp = getUnixTimestamp();
        //mark jail record as unjailed so it isn't checked next time
        const update_record = this.record
            .update({ unjailed: true, release_timestamp: current_timestamp })
            .then(model => this.record = model)
            .catch(console.error);

        //update main embed of records message
        const { embeds } = this.message;
        const new_embed = new MessageEmbed(embeds[0])
            .setColor(colors.blurple)
            .spliceFields(6, 1, {
                name: 'Time of release:',
                value: `<t:${current_timestamp}:f>` //change the release time display format from relative to full
            });

        //we want to preserve the reference message embed if it existed
        embeds.splice(0, 1, new_embed);

        //update buttons
        //const components = message.components[0].components; //components[0] is the MessageActionRow, all of its components are buttons
        const first_row = this.message.components[0].components;
        const second_row = this.message.components[1].components;
        const unjail_button = new MessageButton(first_row[0]).setDisabled();
        const timer_button = new MessageButton(first_row[1]).setDisabled();
        const edit_button = new MessageButton(second_row[0]);
        const del_button = new MessageButton(second_row[1]).setDisabled(false);

        //update #criminal-records message
        const edit_message = this.message
            .edit({
                embeds: embeds,
                components: [
                    new MessageActionRow().addComponents([unjail_button, timer_button]),
                    new MessageActionRow().addComponents([edit_button, del_button])
                ]
            })
            .then(message => this.message = message)
            .catch(logUnlessUnknown);
        
        //await all promises
        await Promise.all([set_roles, update_record, edit_message]);
    }

    /**
     * @param {number} duration Jail duration in seconds
     */
    async updateDuration(duration) {
        //make sure user hasnt already been unjailed
        if (this.record.unjailed) throw 'Jail record already marked as unjailed!';

        //release time must be after jail time/current time
        if (duration <= 0) throw 'Duration must be greater than 0!';

        //update time of release
        const current_timestamp = getUnixTimestamp();
        const release_timestamp = current_timestamp + duration;
        const update_record = this.record
            .update({ release_timestamp: release_timestamp })
            .then(model => this.record = model)
            .catch(console.error);

        //update main embed of records message
        const { embeds } = this.message;
        const new_embed = new MessageEmbed(embeds[0])
            .spliceFields(6, 1, {
                name: 'Time of release:',
                value: `<t:${release_timestamp}:R>`
            });

        //we want to preserve the reference message embed if it existed
        embeds.splice(0, 1, new_embed);

        //update #criminal-records message
        const edit_message = this.message
            .edit({ embeds: embeds })
            .then(message => this.message = message)
            .catch(logUnlessUnknown);

        //await all promises
        await Promise.all([update_record, edit_message]);
    }

    /**
     * @param {string} reason Jail duration in seconds
     */
    async updateReason(reason) {
        //update time of release
        const update_record = this.record
            .update({ reason: reason })
            .then(model => this.record = model)
            .catch(console.error);

        //update main embed of records message
        const { embeds } = this.message;
        const new_embed = new MessageEmbed(embeds[0])
            .spliceFields(2, 1, {
                name: 'Reason:',
                value: reason || 'Not given.'
            });

        //we want to preserve the reference message embed if it existed
        embeds.splice(0, 1, new_embed);

        //update #criminal-records message
        const edit_message = this.message
            .edit({ embeds: embeds })
            .then(message => this.message = message)
            .catch(logUnlessUnknown);

        //await all promises
        await Promise.all([update_record, edit_message]);
    }

    /**
     * @param {string} deleted_message Message the "Delete & jail" context command was used on
     */
    async addDeletedMessage(deleted_message) {
        //add deleted message to embed array
        const { embeds } = this.message;
        const embed = await createDeletedMessageEmbed(deleted_message);
        embeds.push(embed);

        //update #criminal-records message
        this.message = await this.message.edit({ embeds: embeds });

        //dispose of message from cache
        //deleted_cache.delete(deleted_message.id);
    }

    async deleteRecord() {
        console.log(`deleting record #${this.record.id}`);
        let destroy_record, delete_message;

        //delete record from db
        if (this.record instanceof Model)
            destroy_record = this.record.destroy().catch(console.error);

        //delete #criminal-records message
        if (this.message instanceof Message) 
            delete_message = this.message.delete().catch(logUnlessUnknown);

        //await all promises
        await Promise.all([destroy_record, delete_message]);

        //remove data from cache
        jail_data_cache.delete(this.record.id);
    }
}

/**
 * @param {GuildMember} member Member being jailed
 * @param {User} jailer_user User who initiated the interaction
 * @param {string} [reason] Reason for jailing (displayed in record)
 * @param {Number} [duration] Jail duration in seconds
 * @param {string} [deleted_id] ID of message that "Delete & jail" context command was used on
 * @returns {Promise<string>} URL of message sent in criminal-records
 */
async function jailMember(member, jailer_user, reason, duration, deleted_id) {
    const offender_id = member.id;
    const jailer_id = jailer_user.id;
    const jail_timestamp = getUnixTimestamp();
    const release_timestamp = duration && duration > 0 ? jail_timestamp + duration : null;

    //get collection of member's roles, apart from base @@everyone role and jailed role
    const roles = member.roles.cache.filter(r => r.id !== ids.guild && r.id !== ids.roles.jailed);
    //for JailData.role_entries
    const create_role_entries = [];
    //used for main embed
    let roles_str = '';

    //if any errors happen here, we want to catch them separately to cleanup uncompleted jail process
    try {
        //clear role bank of member's previously saved roles
        await jailed_roles.destroy({ where: { user_id: member.id } });

        //save member's roles in db
        roles.forEach(role => {
            //create array of these model instances for the JailData cache
            create_role_entries.push(
                jailed_roles.create({
                    user_id: member.id,
                    role_id: role.id
                })
            );

            //format role list for embed
            roles_str += `<@&${role.id}> `;
        });
        const role_promises = Promise.all(create_role_entries);

        //make sure role list isn't over 1024 chars
        if (roles_str.length > 1024) {
            roles_str = roles_str.substring(
                0,
                roles_str.lastIndexOf('>', 1023) + 1
            );
        }

        //fetch existing jail records for this user
        const prior_offenses = await jail_records.findAll({
            where: { offender_id: member.id },
            order: [
                ['jail_timestamp', 'DESC'],
            ]
        });
        //format string for embed
        let prior_offenses_str = '';
        //each line is 120 characters, so having 8 or more we will go over 1024 char limit of field
        prior_offenses.slice(0, 8).forEach(record => prior_offenses_str += `[<t:${record.jail_timestamp}:f>](${record.url})\n`);
        //specify if there were more than 8 prior offenses
        if (prior_offenses.length > 8) prior_offenses_str += `+${prior_offenses.length - 8} more`;

        //create new record in db
        var jail_record = jail_records.create({
            offender_id: offender_id,
            jailer_id: jailer_id,
            reason: reason,
            jail_timestamp: jail_timestamp,
            release_timestamp: release_timestamp,
            unjailed: false,
            url: null //set after sending message
        });

        //message displayed in audit log
        const audit_log_msg = `Jailed by ${jailer_user.tag}`;
        //add jailed role and remove all others
        const set_roles = member.roles.set([ids.roles.jailed], audit_log_msg);

        //await record creation and role updates
        [jail_record, member] = await Promise.all([jail_record, set_roles]);

        //create main info embed to be sent in #criminal-records
        const main_embed = new MessageEmbed()
            .setColor(colors.green)
            .addField('Jailed:', `<@${offender_id}>`, true)
            .addField('By:', `<@${jailer_id}>`, true)
            .addField('Reason:', reason || 'Not given.')
            .addField('Removed roles:', roles_str || 'None.')
            .addField('Prior offenses:', prior_offenses_str || 'None.')
            .addField('Time of jail:', `<t:${jail_timestamp}:f>`)
            .addField('Time of release:', release_timestamp ? `<t:${release_timestamp}:R>` : 'Not given.');

        //array for MessageOptions
        const embeds = [main_embed];

        //add deleted message to embed array
        const deleted_message = deleted_id ? deleted_cache.get(deleted_id) : null;
        if (deleted_message) {
            const embed = await createDeletedMessageEmbed(deleted_message);
            embeds.push(embed);
        }

        //create buttons for managing jail instance
        const unjail_button = new MessageButton()
            .setLabel('Unjail user')
            .setStyle(ButtonStyle.Success)
            .setCustomId(`recordsUnjail|${jail_record.id}`);

        const timer_button = new MessageButton()
            .setLabel('Set release time')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`recordsSetReleaseTime|${jail_record.id}`);
        
        const edit_button = new MessageButton()
            .setLabel('Edit reason')
            .setStyle(ButtonStyle.Secondary)
            .setCustomId(`recordsEdit|${jail_record.id}`);

        const del_button = new MessageButton()
            .setLabel('\u200b Delete record  \u200b')
            .setStyle(ButtonStyle.Danger)
            .setCustomId(`recordsDelete|${jail_record.id}`)
            .setDisabled();

        //send generated jail message to #criminal-records
        var records_msg = await getCachedChannel(ids.channels.records).send({
            embeds: embeds,
            components: [
                new MessageActionRow().addComponents([unjail_button, timer_button]),
                new MessageActionRow().addComponents([edit_button, del_button])
            ]
        });

        //update jail record with url of newly sent message
        const update_jail_record = jail_record.update({ url: records_msg.url });
        jail_record = await update_jail_record;

        //make sure role entries have been created
        const role_entries = await role_promises;

        //create JailData for cache
        jail_data_cache.set(jail_record.id, new JailData(jail_record, role_entries, member, records_msg));

        return records_msg.url;
    }
    catch (e) {
        //cleanup in case something goes wrong

        //if member is valid
        if (member) {
            //message displayed in audit log
            const audit_log_msg = `Error, restoring roles`;
            //restore member's roles
            member.roles.set(roles, audit_log_msg).catch(console.error);
        }

        //if record was created
        if (jail_record) {
            //delete record from db
            jail_record.destroy().catch(console.error);
            //delete record from cache
            jail_data_cache.delete(jail_record.id);
        }

        //if message was sent
        if (records_msg) {
            records_msg.delete().catch(logUnlessUnknown);
        }

        //the command handler should still handle the error
        throw e;
    }
}

/**
 * Checks if jail record has all the data necessary to function. If not, gets rid of record automatically.
 * @param {Model} record jail_records Model instance
 * @returns {boolean}
 */
function validateRecord(record) {
    //if given record isnt even a valid object
    if (!record) return false;
    //if given record is incomplete
    else if (
        !record.url ||
        !record.offender_id ||
        !record.jailer_id ||
        !record.jail_timestamp
    ) {
        //delete record from db
        //this is asynchronous but we dont need to wait
        record.destroy();
        //delete record from cache
        jail_data_cache.delete(record.id);
        //return false to signify failed validation
        return false;
    }
    //successfully validated
    else return true;
}

/**
 * Gets relevant JailData from cache, or fetches it and adds to cache.
 * @param {Model|string} record_resolvable jail_records Model instance or ID
 * @returns {Promise<false|JailData>}
 */
async function getJailDataByRecord(record_resolvable) {
    //check if an ID string was passed instead of an actual record Model instance
    const is_resolvable_id = typeof record_resolvable === 'string';
    //try to find ID in cache
    const cached_data = is_resolvable_id ? jail_data_cache.get(record_resolvable) : false;

    //return cached_data if it was found
    if (cached_data) {
        return cached_data;
    }
    //otherwise create new JailData
    else {
        //fetch record from db if ID was passed, otherwise use the given Model instance
        const record = is_resolvable_id ? await jail_records.findOne({ where: { id: record_resolvable } }) : record_resolvable;
        //make sure record is valid
        if (validateRecord(record)) {
            //fetch message #criminal-records
            const regexp = record.url.match(/([0-9]+)$/);
            const message_id = regexp[1];
            const message = await getCachedChannel(ids.channels.records).messages.fetch(message_id);
            //fetch guild member
            const member = await message?.guild.members.fetch(record.offender_id);
            //fetch member's saved roles if he exists (it's possible he has left the server since being jailed), otherwise use empty array
            const role_entries = member ? await jailed_roles.findAll({ where: { user_id: member.id } }) : [];
            //create new JailData
            const data = new JailData(record, role_entries, member, message);
            //cache it
            jail_data_cache.set(record.id, data);

            return data;
        }
    }

    return false;
}

/**
 * Gets relevant JailData from cache, or fetches it and adds to cache.
 * @param {GuildMember} member 
 * @param {boolean} active If JailData should be marked as unjailed
 * @returns {Promise<false|JailData>}
 */
async function getJailDataByMember(member, active = true) {
    //check cache for entry belonging to member
    const cached_data = jail_data_cache.find(data => 
        data.member.id === member.id && 
        (!active || !data.record.unjailed) //if active record requested (default), find record that is marked as unjailed
    );

    //return cached_data if it was found
    if (cached_data) {
        return cached_data;
    }
    else {
        //if active record requested (default), find record that is marked as unjailed
        const where = { offender_id: member.id };
        if (active) where.unjailed = false;
        //fetch record from db
        const record = await jail_records.findOne({where});
        //make sure record is valid
        if (validateRecord(record)) {
            //fetch member's saved roles if he exists (it's possible he has left the server since being jailed), otherwise use empty array
            const role_entries = member ? await jailed_roles.findAll({ where: { user_id: member.id } }) : [];
            //fetch message from #criminal-records
            const regexp = record.url.match(/([0-9]+)$/);
            const message_id = regexp[1];
            const message = await getCachedChannel(ids.channels.records).messages.fetch(message_id);
            //create new JailData
            const data = new JailData(record, role_entries, member, message);
            //cache it
            jail_data_cache.set(record.id, data);

            return data;
        }
    }

    return false;
}

/**
 * Gets relevant JailData from cache, or fetches it and adds to cache.
 * @param {Message|string} message_resolvable #criminal-records message or link to it
 * @param {Guild} guild Guild to fetch message/member from if necessary
 * @returns {Promise<false|JailData>}
 */
async function getJailDataByMessage(message_resolvable, guild) {
    //check if a url string was passed instead of an actual message
    const is_resolvable_url = typeof message_resolvable === 'string';
    const url = is_resolvable_url ? message_resolvable : message_resolvable.url;
    //check cache for entry with given message
    const cached_data = jail_data_cache.find(data => data.message.url === url);

    //return cached_data if it was found
    if (cached_data) {
        return cached_data;
    }
    //otherwise create new JailData
    else {
        //fetch record from db
        const record = await jail_records.findOne({ where: { url: url } });
        //make sure record is valid
        if (validateRecord(record)) {
            //fetch message from #criminal-records if url was given
            let message = message_resolvable;
            if (is_resolvable_url) {
                const regexp = url.match(/([0-9]+)$/);
                const message_id = regexp[1];
                message = await getCachedChannel(ids.channels.records).messages.fetch(message_id);
            }
            //fetch guild member
            const member = await message?.guild.members.fetch(record.offender_id);
            //fetch member's saved roles if he exists (it's possible he has left the server since being jailed), otherwise use empty array
            const role_entries = member ? await jailed_roles.findAll({ where: { user_id: member.id } }) : [];
            //create new JailData
            const data = new JailData(record, role_entries, member, message);
            //cache it
            jail_data_cache.set(record.id, data);

            return data;
        }
    }

    return false;
}

/**
 * Checks jail_data_cache for members that need to be unjailed
 */
function checkJailCache() {
    const current_timestamp = getUnixTimestamp();
    //check for records that have not been marked as unjailed and whose release time has been passed
    jail_data_cache
        .filter(data => !data.record.unjailed && data.record.release_timestamp !== null && current_timestamp >= data.record.release_timestamp)
        .forEach(data => data.unjailMember().catch(console.error));
}

/**
 * Fetches jail records from the past 24 hours, creates JailData for them and caches it.
 */
function cacheJailData() {
    const current_timestamp = getUnixTimestamp();
    jail_records
        .findAll({
            //fetch records no older than one day
            where: {
                jail_timestamp: { [Op.gte]: current_timestamp - 86400 }
            }
        })
        //create and cache jail data
        .then(records =>
            records.forEach(record => getJailDataByRecord(record).catch(console.error))
        )
        .catch(console.error);
}

/**
 * @type {Collection<string, Message>}
 */
const deleted_cache = new Collection();

/**
 * Caches message for later use, removes older messages if cache is too big.
 * @param {Message} message 
 */
function cacheDeletedMessage(message) {
    //cache new message
    deleted_cache.set(message.id, message);
    //keep cache under 10 elements
    if (deleted_cache.size > 10) {
        deleted_cache.delete( deleted_cache.firstKey() );
    }
}

/**
 * @param {Message} message
 * @returns {Promise<MessageEmbed>}
 */
async function createDeletedMessageEmbed(message) {
    let { content } = message;

    const embed = new MessageEmbed()
        // .setAuthor({
        //     name: message.author.tag,
        //     iconURL: message.member?.displayAvatarURL() || message.author.displayAvatarURL()
        // })
        .setFooter({text: `#${message.channel.name}`})
        .setTimestamp(message.createdTimestamp);

    //if message had an image attachment, we want to prioritize that as the embed's image
    const image = message.attachments?.find(file => file.contentType.startsWith('image'));
    if (image)
        embed.setImage(image.proxyURL);
    //otherwise we check for image urls in the text content (they would have been embedded normally)
    else {
        const extract_images = extractImageUrls(content);
        if (extract_images) {
            embed.setImage(extract_images.urls[0]);
            content = extract_images.content; //this is the message content with removed urls        
        }
    }

    //prepend fake reply to beginning of message content
    if (message.type === 'REPLY') {
        //try checking cache before fetching message
        //catch exception if reply isnt found (non critical error)
        const replied_msg = deleted_cache.get(message.reference.messageId) || await message.fetchReference().catch(console.error);
        content = prependFakeReply(content, replied_msg);
    }

    const file_links = generateFileLinks(message);

    //make sure content isn't over 2000 chars
    content = content.trim();
    //the actual limit is 4096, but I don't want these to be too long as the limit for all embeds in a message is only 6000
    const max_length = 2000 - file_links.length;
    if (content.length > max_length) {
        const cutoff_index = findLastSpaceIndex(content, max_length);
        content = content.substring(0, cutoff_index);
        content = addEllipsisDots(content);
    }

    //add non image attachments as hyperlinks to the end of the message
    if (file_links) {
        //add linebreaks between existing message content and links
        if (content !== '') content += '\n\n';
        //add links
        content += file_links;
    }

    //set finalized content as embed description
    embed.setDescription(content);

    return embed;
}

module.exports = {
    jailMember,
    getJailDataByRecord,
    getJailDataByMember,
    getJailDataByMessage,
    checkJailCache,
    cacheJailData,
    cacheDeletedMessage
};