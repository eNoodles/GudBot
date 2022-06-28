const { Message, MessageButton, MessageEmbed, GuildMember, MessageActionRow, TextChannel, Webhook, User, Collection } = require('discord.js');
const { PermissionFlagsBits } = require('discord-api-types/v10');
const { Op, jail_records, jailed_roles, blacklist, whitelist } = require('./database/dbObjects');

const webhooks_cache = new Collection(); //K: Snowflake representing channel id, V: gudbot's webhook for that channel
const censored_cache = new Collection(); //K: Snowflake representing message id, V: Snowflake representing original message author's id 

const ids = {
    client: '822565220190650379',
    guild: '822148574032298064',

    intro_ch: '883882213714837514',
    rules_ch: '552982479212904448',
    dl_ch: '486202559951011870',
    dldb_ch: '607310581053128717',
    mod_ch: '860181373468540948',
    star_ch: '888515334015942676',
    records_ch: '986712503935447130',

    lurker_role: '523883593978609704',
    gmteam_role: '409531885119864832',
    jailed_role: '865603749393334283',
    muted_role: '606870055770390538',
    blankicon_role: '894731175216701450',
};

// GudMods
// const ids = {
//     client: '822565220190650379',
//     guild: '364164445657890816',

//     intro_ch: '883882213714837514',
//     rules_ch: '552982479212904448',
//     dl_ch: '486202559951011870',
//     dldb_ch: '607310581053128717',
//     mod_ch: '860181373468540948',
//     star_ch: '888515334015942676',
//     records_ch: '746696906314612807',

//     lurker_role: '523883593978609704',
//     gmteam_role: '409531885119864832',
//     jailed_role: '603983150011514979',
//     muted_role: '606870055770390538',
//     blankicon_role: '894731175216701450',
// };

const colors = {
    red: 16711680,
    green: 3394611,
    gray: 10066329,
    purple: 10434242,
};

const buttons = {
    blurple: 1, //PRIMARY
    gray: 2,    //SECONDARY
    green: 3,   //SUCCESS
    red: 4,     //DANGER
    link: 5,    //LINK
};

/**
 * @returns Current time in Unix system - seconds passed since 1/1/1970
 */
function getCurrentTimestamp() {
    return Math.floor(new Date().getTime() / 1000);
}

/**
 * @param {GuildMember} member 
 * @param {*} role Role's ID or name
 * @returns {boolean} True if member has role matching name or ID.
 */
function hasRole(member, role) {
    return member?.roles.cache.some(r => 
        r.id === role ||
        r.name === role
    );
}

/**
 * @param {GuildMember} member 
 * @returns {boolean} True if member has administrator perms.
 */
function isAdmin(member) {
    return member?.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * @param {GuildMember} member 
 * @returns {string} Member's server name in the form of "nickname (username)" or "username" if no nickname exists
 */
function getMemberFullName(member) {
    if (!member)
        return 'Member not found';

    return `${member.nickname ? `${member.nickname} (${member.user.username})` : member.user.username}`;
}

/**
 * @param {string} message Description of embed.
 * @param {string} [footer] Footer of embed.
 * @returns {MessageEmbed} Embed with red border, default footer, and inputted message.
 */
function createErrorEmbed(message, footer = 'User satisfaction is not guaranteed.') {
    return new MessageEmbed()
        .setDescription(message)
        .setFooter({text: footer})
        .setColor(colors.red);
}

/**
 * @param {Number} min 
 * @param {Number} max 
 * @returns Array of choices for SlashCommandIntegerOption
 */
function generateIntegerChoices(min=0, max=9) {
    const temp_array = [];
    const iterations = max - min;

    for (let i = 0; i <= iterations; i++) {
        let val = min + i;
        temp_array[i] = { name: `${val}`, value: val };
    }

    return temp_array;
}

/**
 * @param {number} minutes 
 * @param {number} hours 
 * @param {number} days 
 * @returns {number|null} Combined duration in seconds.
 */
function getDurationSeconds(minutes, hours, days) {
    return minutes || hours || days ? days * 86400 + hours * 3600 + minutes * 60 : null;
}

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

const jail_data_cache = new Collection(); //K: release timestamp, V: JailData

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
    const jail_timestamp = getCurrentTimestamp();
    const release_timestamp = duration ? jail_timestamp + duration : null;

    const roles = member.roles.cache.filter(role => role.id !== ids.guild && role.id !== ids.jailed_role); //ignore base @@everyone role and jailed role
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
    await member.roles.add(ids.jailed_role, audit_log_msg);

    //main info embed to be sent in #criminal-records
    const main_embed = new MessageEmbed()
        .setColor(colors.green)
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
        .setStyle(buttons.green)
        .setCustomId(`recordsUnjail|${jail_record.id}`);

    const timer_button = new MessageButton()
        .setLabel('Set time')
        .setStyle(buttons.blurple)
        .setCustomId(`recordsSetJailTime|${jail_record.id}`);
    
    const edit_button = new MessageButton()
        .setLabel('Edit')
        .setStyle(buttons.gray)
        .setCustomId(`recordsEdit|${jail_record.id}`);

    const del_button = new MessageButton()
        .setLabel('Delete record')
        .setStyle(buttons.red)
        .setCustomId(`recordsDelete|${jail_record.id}`)
        .setDisabled();

    //send generated jail message to #criminal-records
    const channel = await member.guild.channels.fetch(ids.records_ch);
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
            member = await member.roles.add( role_ids, audit_log_msg ).then(console.log('restored roles'));

            //removed jailed role
            member = await member.roles.remove(ids.jailed_role, audit_log_msg);
        }
    }

    //update time of release with current timestamp
    const current_timestamp = getCurrentTimestamp();

    record = await record.update({ unjailed: true, release_timestamp: current_timestamp });

    //update main embed of records message
    const embeds = message.embeds;
    const new_embed = new MessageEmbed(embeds[0])
        .spliceFields(6, 1, {
            name: 'Time of release:',
            value: `<t:${current_timestamp}:f>` //change the release time display format from relative to full
        });

    //update buttons
    const components = message.components[0].components;
    const unjail_button = new MessageButton(components[0]).setDisabled();
    const timer_button = new MessageButton(components[1]).setDisabled();
    const edit_button = new MessageButton(components[2]);
    const del_button = new MessageButton(components[3]).setDisabled(false);

    //update #criminal-records message
    message = await message.edit({
        embeds: embeds.splice(0, 1, new_embed), //we want to preserve the reference message embed if it existed
        components: [new MessageActionRow().addComponents([unjail_button, timer_button, edit_button, del_button])]
    });

    //update cache
    jail_data_cache.set(record.id, new JailData(record, [], member, message));
}

function checkJailCache() {
    const current_timestamp = getCurrentTimestamp();
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

        const records_ch = await guild.channels.fetch(ids.records_ch);
        const regexp = record.url.match(/(\d+)$/);
        const message_id = regexp[1];
        const message = await records_ch.messages.fetch(message_id);

        const data = new JailData(record, role_entries, member, message)
        jail_data_cache.set(record.id, data);

        return data;
    }
}

async function cacheJailData(guild) {
    const current_timestamp = getCurrentTimestamp();

    const records = await jail_records.findAll({
        where: {
            jail_timestamp: { [Op.gte]: current_timestamp - 86400 } //cache records no older than one day
        }
    });

    //create and cache jail data
    records.forEach(record => getJailData(guild, record) );
}

/**
 * @param {TextChannel} channel
 * @returns {Webhook} Fetched or newly created GudBot-owned webhook
 */
async function fetchOrCreateHook(channel) {
    const hook = 
        (await channel.fetchWebhooks()).find(hook => hook.owner.id === ids.client) || //fetch channel's webhooks and fine the one created by GudBut
        await channel.createWebhook('GudBot'); //if it doesn't exist, create it

    webhooks_cache.set(channel.id, hook); //map to cache

    return hook;
}

/**
 * Finds image urls in text content, removes them and spits them out as an array
 * @param {string} content Original message content
 */
function extractImageUrls(content) {
    let found = false;
    const urls = [];

    //find image urls (including surrounding whitespace), add the url itself to array and replace entire match with nothing
    content = content.replace(/\s*(https?:\/\/\S+\.(?:png|jpg|jpeg|webp)\S*)\s*/ig, (match, url) => {
        urls.push(url);
        found = true;
        return '';
    });

    return found ? { content: content, urls: urls } : false;
}

/**
 * Finds index of last newline or space
 * @param {string} text 
 * @param {number} max_length
 */
function findLastSpaceIndex(text, max_length) {
    const last_nline_index = text.lastIndexOf('\n', max_length);
    const last_space_index = text.lastIndexOf(' ', max_length);

    //prioritize last newline over last space, if both not found- fallback to max_length
    return last_nline_index !== -1 ? last_nline_index : last_space_index !== -1 ? last_space_index : max_length ?? text.length;
}

/**
 * If string ends with whitespace and no punctuation, replace that whitespace with '...'
 * @param {string} text 
 */
function addEllipsisDots(text) {
    return text.replace(/(\w)\s*$/, (match, last_w) => `${last_w}...`);
}

/**
 * Removes whitespace at the beginning and end of string
 * @param {string} text 
 */
function trimWhitespace(text) {
    return text.replace(/(?:^\s+)|(?:\s+$)/g, '');
}

/**
 * @param {Guild} guild 
 * @returns Maximum file upload size in bytes for given guild.
 */
function getGuildUploadLimit(guild) {
    return guild.premiumTier === 3 ? 100000000 : guild.premiumTier === 2 ? 50000000 : 8000000;
}

let blacklist_regexp = new RegExp('', 'ig');

/**
 * Finds all blacklist table entries and regenerates blacklist_regexp
 */
function generateBlacklistRegExp() {
    blacklist.findAll().then(entries => {
        const regexp_source = entries.map(e => e.word).join('|');
        blacklist_regexp = new RegExp(regexp_source, 'ig');
    }).catch(console.error);
}

/**
 * @returns cached blacklist regular expression
 */
function getBlacklistRegExp() {
    return blacklist_regexp;
}

//arrays of cached ids
let whitelisted_users = [];
let whitelisted_channels = [];
let whitelisted_roles = [];

/**
 * Finds all whitelist table entries and filters them into corresponding caches
 */
function generateWhitelists() {
    whitelist.findAll().then(entries => {
        whitelisted_users = [];
        whitelisted_roles = [];
        whitelisted_channels = [];

        entries.forEach(entry => {
            switch (entry.type) {
                case '@':
                    whitelisted_users.push(entry.id);
                    break;
                case '@&':
                    whitelisted_roles.push(entry.id);
                    break;
                case '#':
                    whitelisted_channels.push(entry.id);
            }
        });
    }).catch(console.error);
}

/**
 * @param {Message}
 * @returns True if message meets whitelist criteria
 */
function checkWhitelists(message) {
    return (
        whitelisted_users.indexOf(message.author.id) > -1 || 
        whitelisted_channels.indexOf(message.channelId) > -1 || 
        message.member?.roles.cache.some(role => whitelisted_roles.some(id => role.id === id) )
    );
}

module.exports = {
    webhooks_cache,
    censored_cache,
    ids,
    colors,
    buttons,
    getCurrentTimestamp,
    hasRole,
    isAdmin,
    getMemberFullName,
    createErrorEmbed,
    generateIntegerChoices,
    getDurationSeconds,
    jailMember,
    checkJailCache,
    cacheJailData,
    fetchOrCreateHook,
    extractImageUrls,
    findLastSpaceIndex,
    addEllipsisDots,
    trimWhitespace,
    getGuildUploadLimit,
    generateBlacklistRegExp,
    getBlacklistRegExp,
    generateWhitelists,
    checkWhitelists
}