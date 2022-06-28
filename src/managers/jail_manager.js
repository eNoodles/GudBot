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
 * @returns URL of message sent in criminal-records
 */
async function jailMember(member, jailer_user, reason, duration, ref_msg_embed) {

    const offender_id = member.id;
    const jailer_id = jailer_user.id;
    const jail_timestamp = utils.getCurrentTimestamp();
    const release_timestamp = duration ? jail_timestamp + duration : null;

    const roles = member.roles.cache.filter(role => role.id !== utils.ids.guild && role.id !== utils.ids.jailed_role); //ignore base @@everyone role and jailed role
    const role_entries = [];
    let roles_str = ''; //for embed

    //clear rolebank of member's previously saved roles (just in case)
    await jailed_roles.destroy({ where: { user_id: member.id } });

    //save member's roles in db
    roles.forEach( async role => {
        role_entries.push(
            await jailed_roles.create({
                user_id: member.id,
                role_id: role.id
            })
        );

        //format role list for embed
        roles_str += `<@&${role.id}> `;
    });

    //count prior offenses
    const prior_offenses = await jail_records.count({ where: { offender_id: member.id } });

    //save offender id, jailer id, reason in jail_records
    const jail_record = await jail_records.create({
        offender_id: offender_id,
        jailer_id: jailer_id,
        reason: reason,
        jail_timestamp: jail_timestamp,
        release_timestamp: release_timestamp,
        unjailed: false,
        url: null //set after sending message
    });

    //display in audit log
    const audit_log_msg = `Jailed by ${jailer_user.tag}`;

    //remove member's roles
    await member.roles.remove( roles, audit_log_msg );

    //if all roles successfully removed, add jailed role
    await member.roles.add(utils.ids.jailed_role, audit_log_msg);

    //main info embed to be sent in #criminal-records
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
                value: `${prior_offenses}` || 'None.'
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

    const embeds = [main_embed];

    if (ref_msg_embed)
        embeds.push(ref_msg_embed);

    //buttons for managing jail instance
    const unjail_button = new MessageButton()
        .setLabel('Unjail')
        .setStyle(utils.buttons.green)
        .setCustomId(`recordsUnjail|${jail_record.id}`);

    const timer_button = new MessageButton()
        .setLabel('Set time')
        .setStyle(utils.buttons.blurple)
        .setCustomId(`recordsSetJailTime|${jail_record.id}`);
    
    const edit_button = new MessageButton()
        .setLabel('Edit')
        .setStyle(utils.buttons.gray)
        .setCustomId(`recordsEdit|${jail_record.id}`);

    const del_button = new MessageButton()
        .setLabel('Delete record')
        .setStyle(utils.buttons.red)
        .setCustomId(`recordsDelete|${jail_record.id}`)
        .setDisabled();

    //send generated jail message to #criminal-records
    const channel = await member.guild.channels.fetch(utils.ids.records_ch);
    const records_msg = await channel.send({
        embeds: embeds,
        components: [new MessageActionRow().addComponents([unjail_button, timer_button, edit_button, del_button])]
    });

    //I dont really need to await this
    jail_record.update({ url: records_msg.url }).then(record => jail_data_cache.set(record.id, new JailData(jail_record, role_entries, member, records_msg)) );

    return records_msg.url;
}

/**
 * @param {JailData} data JailData Object
 * @param {User} [unjailer_user]
 */
async function unjailMember(data, unjailer_user) {

    let { record, role_entries, member, message } = data;

    //member could have left the server since being jailed
    if (member) {
        //generate array of ids to add
        const role_ids = [];
        role_entries.forEach(entry => {
            role_ids.push(entry.role_id);
        });

        //make sure role_ids array isn't empty
        if (role_ids.length) {
            //display in audit log
            const audit_log_msg = unjailer_user ? `Unjailed by ${unjailer_user.tag}` : 'Unjailed automatically';

            //give member back his roles
            member = await member.roles.add( role_ids, audit_log_msg );

            //removed jailed role
            member = await member.roles.remove(utils.ids.jailed_role, audit_log_msg);
        }
    }

    //update time of release with current timestamp
    const current_timestamp = utils.getCurrentTimestamp();

    record = await record.update({ unjailed: true, release_timestamp: current_timestamp });

    //update main embed of records message
    const embeds = message.embeds;
    const new_embed = new MessageEmbed(embeds[0])
        .spliceFields(6, 1, {
            name: 'Time of release:',
            value: `<t:${current_timestamp}:f>` //change the release time display format from relative to full
        });

    embeds.splice(0, 1, new_embed); //we want to preserve the reference message embed if it existed

    //update buttons
    const components = message.components[0].components;
    const unjail_button = new MessageButton(components[0]).setDisabled();
    const timer_button = new MessageButton(components[1]).setDisabled();
    const edit_button = new MessageButton(components[2]);
    const del_button = new MessageButton(components[3]).setDisabled(false);

    //update #criminal-records message
    message = await message.edit({
        embeds: embeds,
        components: [new MessageActionRow().addComponents([unjail_button, timer_button, edit_button, del_button])]
    });

    //update cache
    jail_data_cache.set(record.id, new JailData(record, [], member, message));
}

function checkJailCache() {
    const current_timestamp = utils.getCurrentTimestamp();
    jail_data_cache.filter(data => !data.record.unjailed && data.record.release_timestamp <= current_timestamp).forEach( data => unjailMember(data).catch(console.error) );
}

async function getJailData(guild, record_resolvable) {
    const is_resolvable_id = typeof record_resolvable === 'string';
    const cached_data = jail_data_cache.get(record_resolvable) || false;

    if (cached_data) {
        return cached_data;
    }
    else {
        const record = is_resolvable_id ? await jail_records.findOne({ where: { id: record_resolvable } }) : record_resolvable;

        const member = await guild.members.fetch(record.offender_id);

        const role_entries = member ? await jailed_roles.findAll({ where: { user_id: member.id } }) : [];

        const records_ch = await guild.channels.fetch(utils.ids.records_ch);
        const regexp = record.url.match(/(\d+)$/);
        const message_id = regexp[1];
        const message = await records_ch.messages.fetch(message_id);

        const data = new JailData(record, role_entries, member, message)
        jail_data_cache.set(record.id, data);

        return data;
    }
}

async function cacheJailData(guild) {
    const current_timestamp = utils.getCurrentTimestamp();

    const records = await jail_records.findAll({
        where: {
            jail_timestamp: { [Op.gte]: current_timestamp - 86400 } //cache records no older than one day
        }
    });

    //create and cache jail data
    records.forEach(record => getJailData(guild, record) );
}

module.exports = {
    jailMember,
    unjailMember,
    checkJailCache,
    cacheJailData
}