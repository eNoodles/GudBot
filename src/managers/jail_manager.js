const { MessageButton, MessageEmbed, GuildMember, MessageActionRow, User, Collection } = require('discord.js');
const { Op, jail_records, jailed_roles} = require('../database/dbObjects');
const utils = require('../utils');

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
 * @param {MessageEmbed} [ref_msg_embed] Message on which context command was used on
 * @returns {Promise<string>} URL of message sent in criminal-records
 */
async function jailMember(member, jailer_user, reason, duration, ref_msg_embed) {

    const offender_id = member.id;
    const jailer_id = jailer_user.id;
    const jail_timestamp = utils.getCurrentTimestamp();
    const release_timestamp = duration ? jail_timestamp + duration : null;

    //get collection of member's roles, apart from base @@everyone role and jailed role
    const roles = member.roles.cache.filter(role => role.id !== utils.ids.guild && role.id !== utils.ids.jailed_role);
    //used for cached JailData
    const role_entries = [];
    //used for main embed
    let roles_str = '';

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
    let jail_record = await jail_records.create({
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
    await member.roles.remove( roles, audit_log_msg );
    //add jailed role
    await member.roles.add(utils.ids.jailed_role, audit_log_msg);

    //create main info embed to be sent in #criminal-records
    const main_embed = new MessageEmbed()
        .setColor(utils.colors.green)
        .addFields([
            {
                name: 'Jailed:',
                value: `<@${offender_id}>`,
                inline: true
            },
            {
                name: 'By:',
                value: `<@${jailer_id}>`,
                inline: true
            },
            {
                name: 'Reason:',
                value: reason || 'Not given.'
            },
            {
                name: 'Removed roles:',
                value: roles_str || 'None.'
            },
            {
                name: 'Prior offenses:',
                value: prior_offenses_str || 'None.'
            },
            {
                name: 'Time of jail:',
                value: `<t:${jail_timestamp}:f>`
            },
            {
                name: 'Time of release:',
                value: release_timestamp ? `<t:${release_timestamp}:R>` : 'Not given.'
            }
        ]);

    //array for MessageOptions
    const embeds = [main_embed];
    //add reference message to embed array (this is jail command was used from message context menu)
    if (ref_msg_embed)
        embeds.push(ref_msg_embed);

    //create buttons for managing jail instance
    const unjail_button = new MessageButton()
        .setLabel('Unjail user')
        .setStyle(utils.buttons.green)
        .setCustomId(`recordsUnjail|${jail_record.id}`);

    const timer_button = new MessageButton()
        .setLabel('Set release time')
        .setStyle(utils.buttons.blurple)
        .setCustomId(`recordsSetReleaseTime|${jail_record.id}`);
    
    const edit_button = new MessageButton()
        .setLabel('Edit reason')
        .setStyle(utils.buttons.gray)
        .setCustomId(`recordsEdit|${jail_record.id}`);

    const del_button = new MessageButton()
        .setLabel('\u200b Delete record  \u200b')
        .setStyle(utils.buttons.red)
        .setCustomId(`recordsDelete|${jail_record.id}`)
        .setDisabled();

    //send generated jail message to #criminal-records
    const channel = await member.guild.channels.fetch(utils.ids.records_ch);
    const records_msg = await channel.send({
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

/**
 * @param {JailData} data JailData Object
 * @param {User} [unjailer_user] User who performed manual unjailing
 * @returns {Promise<string>} URL of message sent in criminal-records
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
        member = await member.roles.remove(utils.ids.jailed_role, audit_log_msg);
    }

    //update time of release with current timestamp
    const current_timestamp = utils.getCurrentTimestamp();
    //mark jail record as unjailed so it isn't checked next time
    record = await record.update({ unjailed: true, release_timestamp: current_timestamp });

    //update main embed of records message
    const embeds = message.embeds;
    const new_embed = new MessageEmbed(embeds[0])
        .setColor(utils.colors.blurple)
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
    });

    //update cache
    jail_data_cache.set(record.id, new JailData(record, [], member, message));

    //to ensure things went well
    return message.url;
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
    const current_timestamp = utils.getCurrentTimestamp();
    const release_timestamp = current_timestamp + duration;
    record = await record.update({ release_timestamp: release_timestamp });

    //update main embed of records message
    const embeds = message.embeds;
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
    const embeds = message.embeds;
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
 * @param {User} [unjailer_user] User who deleted record
 */
 async function deleteRecord(data, reason, updater_user) {
    //deconstruct JailData object
    let { record, role_entries, member, message } = data;

    //delete record from db
    await record.destroy();

    //delete #criminal-records message
    await message.delete();

    //remove data from cache
    jail_data_cache.delete(record.id);
}

/**
 * @param {Guild} guild Guild to fetch member from if necessary
 * @param {Model|string} record_resolvable jail_records Model instance or ID
 * @returns {JailData} JailData from cache if it exists, otherwise it is created and cached
 */
async function getJailData(guild, record_resolvable) {
    //check if an ID string was passed instead of an actual record Model instance
    const is_resolvable_id = typeof record_resolvable === 'string';
    //try to find ID in cache
    const cached_data = is_resolvable_id ? jail_data_cache.get(record_resolvable) : false ?? false;

    //return cached_data if it was found
    if (cached_data) {
        return cached_data;
    }
    //otherwise create new JailData
    else {
        //fetch record from db if ID was passed, otherwise use the given Model instance
        const record = is_resolvable_id ? await jail_records.findOne({ where: { id: record_resolvable } }) : record_resolvable;
        //fetch guild member
        const member = await guild.members.fetch(record.offender_id);
        //fetch member's saved roles if he exists (it's possible he has left the server since being jailed), otherwise use empty array
        const role_entries = member ? await jailed_roles.findAll({ where: { user_id: member.id } }) : [];
        //fetch message from #criminal-records
        const records_ch = await guild.channels.fetch(utils.ids.records_ch);
        const regexp = record.url.match(/(\d+)$/);
        const message_id = regexp[1];
        const message = await records_ch.messages.fetch(message_id);
        //create new JailData
        const data = new JailData(record, role_entries, member, message)
        //cache it
        jail_data_cache.set(record.id, data);

        return data;
    }
}

/**
 * Checks jail_data_cache for members that need to be unjailed
 */
 function checkJailCache() {
    const current_timestamp = utils.getCurrentTimestamp();
    //check for records that have not been marked as unjailed and whose release time has been passed
    jail_data_cache
        .filter(data => !data.record.unjailed && data.record.release_timestamp !== null && current_timestamp >= data.record.release_timestamp)
        .forEach(data => unjailMember(data));
}

async function cacheJailData(guild) {
    const current_timestamp = utils.getCurrentTimestamp();
    //fetch records no older than one day
    const records = await jail_records.findAll({
        where: {
            jail_timestamp: { [Op.gte]: current_timestamp - 86400 }
        }
    });
    //create and cache jail data
    records.forEach(record => getJailData(guild, record) );
}

module.exports = {
    jailMember,
    unjailMember,
    updateDuration,
    updateReason,
    deleteRecord,
    getJailData,
    checkJailCache,
    cacheJailData
}