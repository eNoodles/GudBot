const { MessageButton, MessageEmbed, Message, GuildMember, MessageActionRow, User, Collection } = require('discord.js');
const { Op, jail_records, jailed_roles} = require('../database/dbObjects');
const { ids, colors, buttons, getUnixTimestamp, extractImageUrls, prependFakeReply, generateFileLinks, trimWhitespace, findLastSpaceIndex, addEllipsisDots } = require('../utils');

/**
 * @type {Collection<string, JailData>} 
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
    const release_timestamp = duration ? jail_timestamp + duration : null;

    //get collection of member's roles, apart from base @@everyone role and jailed role
    const roles = member.roles.cache.filter(role => role.id !== ids.guild && role.id !== ids.jailed_role);
    //used for cached JailData
    const role_entries = [];
    //used for main embed
    let roles_str = '';

    //if any errors happen here, we want to catch them separately to cleanup uncompleted jail process
    try {
        //clear role bank of member's previously saved roles (just in case)
        await jailed_roles.destroy({ where: { user_id: member.id } });

        //save member's roles in db
        roles.forEach( async role => {
            //create array of these model instances for the JailData cache
            role_entries.push(
                await jailed_roles.create({
                    user_id: member.id,
                    role_id: role.id
                })
            );

            //format role list for embed
            roles_str += `<@&${role.id}> `;
        });
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
        var jail_record = await jail_records.create({
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
        //remove member's roles
        member = await member.roles.remove( roles, audit_log_msg );
        //add jailed role
        member = await member.roles.add(ids.jailed_role, audit_log_msg);

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
            .setStyle(buttons.green)
            .setCustomId(`recordsUnjail|${jail_record.id}`);

        const timer_button = new MessageButton()
            .setLabel('Set release time')
            .setStyle(buttons.blurple)
            .setCustomId(`recordsSetReleaseTime|${jail_record.id}`);
        
        const edit_button = new MessageButton()
            .setLabel('Edit reason')
            .setStyle(buttons.gray)
            .setCustomId(`recordsEdit|${jail_record.id}`);

        const del_button = new MessageButton()
            .setLabel('\u200b Delete record  \u200b')
            .setStyle(buttons.red)
            .setCustomId(`recordsDelete|${jail_record.id}`)
            .setDisabled();

        //send generated jail message to #criminal-records
        const channel = await member.guild.channels.fetch(ids.records_ch);
        var records_msg = await channel.send({
            embeds: embeds,
            components: [
                new MessageActionRow().addComponents([unjail_button, timer_button]),
                new MessageActionRow().addComponents([edit_button, del_button])
            ]
        });

        //update jail record with url of newly sent message
        jail_record = await jail_record.update({ url: records_msg.url })
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
            records_msg.delete().catch(console.error);
        }

        //the command handler should still handle the error
        throw e;
    }
}

/**
 * @param {JailData} data JailData Object
 * @param {User} [unjailer_user] User who performed manual unjailing
 */
async function unjailMember(data, unjailer_user) {
    //deconstruct JailData object
    let { record, role_entries, member, message } = data;

    //make sure user hasnt already been unjailed
    if (record.unjailed) throw 'Jail record already marked as unjailed!';

    //check member since he could have left the server since being jailed
    if (member) {
        //generate array of ids to add
        const role_ids = [];
        role_entries.forEach(entry => {
            role_ids.push(entry.role_id);
        });

        //message displayed in audit log
        const audit_log_msg = unjailer_user ? `Unjailed by ${unjailer_user.tag}` : 'Unjailed automatically';

        //make sure role_ids array isn't empty
        if (role_ids.length) {
            //give member back his roles
            member = await member.roles.add( role_ids, audit_log_msg );
        }

        //removed jailed role
        member = await member.roles.remove(ids.jailed_role, audit_log_msg);
    }

    //update time of release with current timestamp
    const current_timestamp = getUnixTimestamp();
    //mark jail record as unjailed so it isn't checked next time
    record = await record.update({ unjailed: true, release_timestamp: current_timestamp });

    //update main embed of records message
    const { embeds } = message;
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
    const first_row = message.components[0].components;
    const second_row = message.components[1].components;
    const unjail_button = new MessageButton(first_row[0]).setDisabled();
    const timer_button = new MessageButton(first_row[1]).setDisabled();
    const edit_button = new MessageButton(second_row[0]);
    const del_button = new MessageButton(second_row[1]).setDisabled(false);

    //update #criminal-records message
    message = await message.edit({
        embeds: embeds,
        components: [
            new MessageActionRow().addComponents([unjail_button, timer_button]),
            new MessageActionRow().addComponents([edit_button, del_button])
        ]
    }).catch(console.error);

    //update cache
    jail_data_cache.set(record.id, new JailData(record, [], member, message));
}

/**
 * @param {JailData} data JailData Object
 * @param {number} duration Jail duration in seconds
 * @param {User} [updater_user] User who performed manual unjailing
 */
async function updateDuration(data, duration, updater_user) {
    //deconstruct JailData object
    let { record, role_entries, member, message } = data;

    //make sure user hasnt already been unjailed
    if (record.unjailed) throw 'Jail record already marked as unjailed!';

    //update time of release
    const current_timestamp = getUnixTimestamp();
    const release_timestamp = current_timestamp + duration;
    record = await record.update({ release_timestamp: release_timestamp });

    //update main embed of records message
    const { embeds } = message;
    const new_embed = new MessageEmbed(embeds[0])
        .spliceFields(6, 1, {
            name: 'Time of release:',
            value: `<t:${release_timestamp}:R>`
        });

    //we want to preserve the reference message embed if it existed
    embeds.splice(0, 1, new_embed);

    //update #criminal-records message
    message = await message.edit({ embeds: embeds });

    //update cache
    jail_data_cache.set(record.id, new JailData(record, role_entries, member, message));
}

/**
 * @param {JailData} data JailData Object
 * @param {string} reason Jail duration in seconds
 * @param {User} [updater_user] User who performed manual unjailing
 */
async function updateReason(data, reason, updater_user) {
    //deconstruct JailData object
    let { record, role_entries, member, message } = data;

    //update time of release
    record = await record.update({ reason: reason });

    //update main embed of records message
    const { embeds } = message;
    const new_embed = new MessageEmbed(embeds[0])
        .spliceFields(2, 1, {
            name: 'Reason:',
            value: reason || 'Not given.'
        });

    //we want to preserve the reference message embed if it existed
    embeds.splice(0, 1, new_embed);

    //update #criminal-records message
    message = await message.edit({ embeds: embeds });

    //update cache
    jail_data_cache.set(record.id, new JailData(record, role_entries, member, message));
}

/**
 * @param {JailData} data JailData Object
 * @param {User} [deleter_user] User who deleted record
 */
async function deleteRecord(data, deleter_user) {
    //deconstruct JailData object
    let { record, role_entries, member, message } = data;

    console.log(`deleting record #${record.id}`);

    //delete record from db
    await record.destroy().catch(console.error);

    //delete #criminal-records message
    await message.delete().catch(console.error);

    //remove data from cache
    jail_data_cache.delete(record.id);
}

/**
 * @param {JailData} data JailData Object
 * @param {string} deleted_message Message the "Delete & jail" context command was used on
 * @param {User} [updater_user] Context command user
 */
async function addDeletedMessage(data, deleted_message, updater_user) {
    //deconstruct JailData object
    let { record, role_entries, member, message } = data;

    //add deleted message to embed array
    const { embeds } = message;
    const embed = await createDeletedMessageEmbed(deleted_message);
    embeds.push(embed);
    console.log(`description: ${embed.description.length}\nfooter text: ${embed.footer.text.length}\n`);

    //update #criminal-records message
    message = await message.edit({ embeds: embeds });

    //update cache
    jail_data_cache.set(record.id, new JailData(record, role_entries, member, message));

    //dispose of message from cache
    //deleted_cache.delete(deleted_message.id);
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
 * @param {Guild} guild Guild to fetch member from if necessary
 * @returns {Promise<false|JailData>}
 */
async function getJailDataByRecord(record_resolvable, guild) {
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
            //fetch guild member
            const member = await guild.members.fetch(record.offender_id);
            //fetch member's saved roles if he exists (it's possible he has left the server since being jailed), otherwise use empty array
            const role_entries = member ? await jailed_roles.findAll({ where: { user_id: member.id } }) : [];
            //fetch message #criminal-records
            const records_ch = await guild.channels.fetch(ids.records_ch);
            const regexp = record.url.match(/(\d+)$/);
            const message_id = regexp[1];
            const message = await records_ch.messages.fetch(message_id);
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
async function getJailDataByMember(member, active=true) {
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
            const records_ch = await member.guild.channels.fetch(ids.records_ch);
            const regexp = record.url.match(/(\d+)$/);
            const message_id = regexp[1];
            const message = await records_ch.messages.fetch(message_id);
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
                const records_ch = await guild.channels.fetch(ids.records_ch);
                const regexp = url.match(/(\d+)$/);
                const message_id = regexp[1];
                message = await records_ch.messages.fetch(message_id);
            }
            //get guild member
            const { member } = message;
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
        .forEach(data => unjailMember(data).catch(console.error));
}

async function cacheJailData(guild) {
    const current_timestamp = getUnixTimestamp();
    //fetch records no older than one day
    const records = await jail_records.findAll({
        where: {
            jail_timestamp: { [Op.gte]: current_timestamp - 86400 }
        }
    });
    //create and cache jail data
    records.forEach(record => getJailDataByRecord(record, guild).catch(console.error));
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
    content = trimWhitespace(content);
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
    unjailMember,
    updateDuration,
    updateReason,
    deleteRecord,
    addDeletedMessage,
    getJailDataByRecord,
    getJailDataByMember,
    getJailDataByMessage,
    checkJailCache,
    cacheJailData,
    cacheDeletedMessage
}