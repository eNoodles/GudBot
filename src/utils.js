const { MessageEmbed, Message, GuildMember } = require('discord.js');
const { PermissionFlagsBits } = require('discord-api-types/v10');

const ids = {
    client: '822565220190650379',
    guild: '822148574032298064',

    intro_ch: '883882213714837514',
    rules_ch: '552982479212904448',
    dl_ch: '486202559951011870',
    dldb_ch: '607310581053128717',
    mod_ch: '860181373468540948',
    star_ch: '993917733265756211',
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
    blurple: 7506394,
};

/**
 * @param {Date} [date] Date object to convert to unix timestamp. If not given, get current date.
 * @returns Get time in Unix system - seconds passed since 1/1/1970
 */
function getUnixTimestamp(date) {
    date = date ?? new Date();
    return Math.floor(date.getTime() / 1000);
}

/**
 * @param {GuildMember} member 
 * @param {string} role Role's ID or name
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
    if (!member) return 'Member not found';
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
 * @param {number} min 
 * @param {number} max 
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
 * @returns {number} Combined duration in seconds.
 */
function getDurationSeconds(minutes, hours, days) {
    return minutes || hours || days ? days * 86400 + hours * 3600 + minutes * 60 : 0;
}

/**
 * Finds image urls in text content, removes them and spits them out as an array
 * @param {string} content Original message content
 */
function extractImageUrls(content) {
    let found = false;
    const urls = [];

    //find image urls (including surrounding whitespace), add the url itself to array and replace entire match with nothing
    content = content.replace(/\s*(https?:\/\/\S+\.(?:png|jpg|jpeg|webp|gif)\S*)\s*/ig, (match, url) => {
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

/**
 * @param {string} content Message content to prepend fake reply to.
 * @param {Message} replied_msg The message being replied to.
 * @param {number} max_length Max length of fake reply.
 * @returns {string} Updated message content with fake reply.
 */
function prependFakeReply(content, replied_msg, max_length=200) {
    if (replied_msg) {
        //remove fake reply from replied_msg if it had one (we don't want fake reply chaining)
        let reply_content = replied_msg.content.replace(/> \[[\S\s]+\]\(http.+\)\n/, '');
        //if there is no message content, then it must have been an attachment-only message
        reply_content = reply_content || '*Click to see attachment*'; //🖻🗎
        //make sure it's not too long
        reply_content = trimWhitespace(reply_content);
        if (reply_content.length > max_length) {
            const cutoff_index = findLastSpaceIndex(reply_content, max_length);
            reply_content = reply_content.substring(0, cutoff_index);
            reply_content = addEllipsisDots(reply_content);
        }

        //newlines break the quote block so we must reinsert '> ' on each line
        reply_content = reply_content.replace(/\n/g, '\n> ');

        return `> [**${replied_msg.member?.displayName || replied_msg.author.username}** ${reply_content}](${replied_msg.url})\n${content}`;
    }
    else return content;
}

/**
 * @param {Message} message The message to take attachments from.
 * @returns {string} Hyperlinks to message's non image attachemnts.
 */
function generateFileLinks(message) {
    //get non image attachments
    const files = message?.attachments?.filter(file => !file.contentType.startsWith('image'));
    if (files?.size > 0) {
        let files_str = '';
        //use proxy url for videos in case original attachment has been deleted
        files.forEach(file => files_str += `[${file.name}](${file.contentType.startsWith('video') ? file.proxyURL : file.url})\n`);
        return files_str;
    }
    else return '';
}

module.exports = {
    ids,
    colors,
    getUnixTimestamp,
    hasRole,
    isAdmin,
    getMemberFullName,
    createErrorEmbed,
    generateIntegerChoices,
    getDurationSeconds,
    extractImageUrls,
    findLastSpaceIndex,
    addEllipsisDots,
    trimWhitespace,
    getGuildUploadLimit,
    prependFakeReply,
    generateFileLinks
}