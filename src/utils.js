const { MessageEmbed, Message, GuildMember, Collection, TextChannel, Client } = require('discord.js');
const { PermissionFlagsBits } = require('discord-api-types/v10');
const Sleep = require('node:timers/promises').setTimeout;

const ids = {
    client: '854851650212724748',
    guild: '364164445657890816',

    channels: {
        admin: '860181373468540948',
        starboard: '888515334015942676',
        records: '746696906314612807',
        downloads: '486202559951011870',
        user_help: '888387032043376671',
        general: '888383950702149662',
        rules: '552982479212904448',
        screenshot_content: '888386752648196116'
    },

    roles: {
        lurker: '523883593978609704',
        gmteam: '409531885119864832',
        jailed: '603983150011514979',
        blankicon: '894731175216701450'
    },

    users: {
        eNoodles: '206024596997144576'
    },

    emojis: {
        error: '1000033728531267615'
    },

    commands: {
        ping: ''
    },

    errors: {
        /**DiscordAPIError: Unknown Message*/
        unknown_message: 10008,
        /**DiscordAPIError: Missing Access*/
        missing_access: 403,
        /**DiscordAPIError: Cannot send messages to this user*/
        cannot_send_to_user: 50007
    }
};

const colors = {
    red: 16711680,
    green: 3394611,
    gray: 10066329,
    purple: 10434242,
    blurple: 7506394,
    nitro: 16741370,
    white: 16777215,
    black: 0
};

/**@type {Collection<string,TextChannel>} */
const channels_cache = new Collection();

/**
 * @param {Client} client 
 */
async function cacheChannels(client) {
    const promises = [];
    for (const prop in ids.channels) {
        const id = ids.channels[prop];
        const cache_channel = client.channels.fetch(id)
            .then(channel => channels_cache.set(id, channel))
            .catch(e => logUnless(e, ids.errors.missing_access));
        promises.push(cache_channel);
    }
    await Promise.allSettled(promises);
}
 
/**
 * @param {string} id channel ID
 * @returns {TextChannel} cached channel
 */
function getCachedChannel(id) {
    return channels_cache.get(id);
}

/**
 * @param {Date} [date] Date object to convert to unix timestamp. If not given, get current date.
 * @returns Time in Unix system (seconds passed since 1/1/1970)
 */
function getUnixTimestamp(date) {
    date = date ?? new Date();
    return Math.floor(date.getTime() / 1000);
}

/**
 * Log error unless it's code matches one of entered
 * @param {Error} e The error itself
 * @param {...number} codes
 */
function logUnless(e, ...codes) {
    if (!codes.includes(e.code)) console.error(e);
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
 * @param {number} min Inclusive
 * @param {number} max Inclusive
 * @returns Array of integer choices for SlashCommandIntegerOption
 */
function generateIntegerChoices(min = 0, max = 9) {
    const temp_array = [];
    const iterations = max - min;

    for (let i = 0; i <= iterations; i++) {
        let val = min + i;
        temp_array[i] = {
            name: `${val}`,
            value: val
        };
    }

    return temp_array;
}

/**
 * @param {number} min Inclusive
 * @param {number} max Inclusive
 * @param {string} prefix Add prefix message to options' label
 * @param {number} default_value Which integer to set as default
 * @returns Array of integer options for MessageSelectOptionData
 */
function generateIntegerOptions(min = 0, max = 9, prefix = '', default_value) {
    const temp_array = [];
    const iterations = max - min;

    for (let i = 0; i <= iterations; i++) {
        let val = `${min + i}`;
        temp_array[i] = {
            label: `${prefix}${val}`,
            value: val,
            default: val === `${default_value}`
        };
    }

    return temp_array;
}

/**
 * @param {Message} message Message to get Select Menu from
 * @param {string} id Select Menu's customId (just the name without arguments)
 */
function getSelectMenuById(message, id) {
    const action_rows = message.components;
    for (let i = 0; i < action_rows.length; i++) {
        const row_components = action_rows[i].components;

        for (let j = 0; j < row_components.length; j++) {
            const c = row_components[j];
            
            if (c.type === 'SELECT_MENU' && c.customId.startsWith(id))
                return c;
        }
    }
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
    content = content.replace(/\s*(https?:\/\/\w{2,}\S+\.(?:png|jpg|jpeg|webp|gif)\S*)\s*/ig, (match, url) => {
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
 * If string ends with whitespace and no punctuation, replace that whitespace with '…' (like ... but single char)
 * @param {string} text 
 */
function addEllipsisDots(text) {
    return text.replace(/(\w)\s*$/, (match, last_w) => `${last_w}…`);
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
        let reply_content = replied_msg.content.replace(/^> \[[\S\s]+\]\(http.+\)\n/, '');
        //if there is no message content, then it must have been an attachment-only message
        reply_content = reply_content || '*Click to see attachment*'; //🖻🗎
        //make sure it's not too long
        reply_content = reply_content.trim();
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
    cacheChannels,
    getCachedChannel,
    getUnixTimestamp,
    logUnless,
    hasRole,
    isAdmin,
    getMemberFullName,
    createErrorEmbed,
    generateIntegerChoices,
    generateIntegerOptions,
    getSelectMenuById,
    getDurationSeconds,
    extractImageUrls,
    findLastSpaceIndex,
    addEllipsisDots,
    getGuildUploadLimit,
    prependFakeReply,
    generateFileLinks,
    Sleep
};