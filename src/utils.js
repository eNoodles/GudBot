const { Message, MessageEmbed, GuildMember, TextChannel, Webhook, Collection } = require('discord.js');
const { PermissionFlagsBits } = require('discord-api-types/v10');
const { blacklist, whitelist } = require('./database/dbObjects');

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