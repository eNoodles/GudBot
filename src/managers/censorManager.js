const { Message, TextChannel, Webhook, Collection } = require('discord.js');
const { blacklist, whitelist } = require('../database/dbObjects');
const { ids, prependFakeReply, findLastSpaceIndex, getGuildUploadLimit } = require('../utils');

let blacklist_regexp = new RegExp('', 'ig');

/**
 * K: Snowflake representing channel id
 * V: gudbot's webhook for that channel
 * @type {Collection<string,Webhook>}
 */
const webhooks_cache = new Collection();
/**
 * K: Snowflake representing message id
 * V: Snowflake representing original message author's id
 * @type {Collection<string,string>}
 */
const censored_authors_cache = new Collection();

/**
 * Caches message author id by corresponding censored message id. Used for looking up author of censored message in "Delete and jail" command.
 * @param {string} message_id ID of censored message sent by webhook
 * @param {string} author_id ID of author who sent the original uncensored message
 */
 function cacheAuthorId(message_id, author_id) {
    //message id is the key because there will be no way on knowing who the original author was later
    censored_authors_cache.set(message_id, author_id);
    //keep cache under 10000 elements
    if (censored_authors_cache.size > 10000) {
        //get first 100 keys
        const keys = censored_authors_cache.firstKey(100);
        //delete those elements
        keys.forEach(key => censored_authors_cache.delete(key));
    }
}

/**
 * Finds all blacklist table entries and regenerates blacklist_regexp
 */
function generateBlacklist() {
    blacklist.findAll().then(entries => {
        const regexp_source = entries.map(e => e.word).join('|');
        blacklist_regexp = new RegExp(regexp_source, 'ig');
    }).catch(console.error);
}

/**
 * @returns cached blacklist regular expression
 */
function getBlacklist() {
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

/**
 * @param {TextChannel} channel
 * @returns {Promise<Webhook>} Fetched or newly created GudBot-owned webhook
 */
async function fetchOrCreateHook(channel) {
    //first check local cache
    let hook = webhooks_cache.get(channel.id);
    if (hook) return hook;

    //then fetch and check channel's existing webhooks
    hook = (await channel.fetchWebhooks())?.find(hook => hook.owner.id === ids.client);
    if (hook) {
        //cache it
        webhooks_cache.set(channel.id, hook);
        return hook;
    }

    //if it doesn't exist, create and cache it
    hook = await channel.createWebhook('GudBot');
    webhooks_cache.set(channel.id, hook);
    return hook;
}

/**
 * Detects blacklisted words in message content, censors them and resends the message with a webhook so as to mimic original author's name and avatar.
 * @param {Message} message 
 * @returns {Promise<boolean>} Whether or not message was censored.
 */
async function censorMessage(message) {
    //threads dont have webhooks, so in that case we get the parent channel
    const is_thread = message.channel.isThread();
    const channel = is_thread ? message.channel.parent : message.channel;

    //fetch/create channel webhook if it's not in cache
    //we do this on every messageCreate, not just the ones that need to be censored, so as to populate the cache
    const hook = await fetchOrCreateHook(channel);

    //don't do anything if regexp is empty
    if (blacklist_regexp.source === '(?:)') return false;

    //dont censor message if sent in whitelisted channel or by whitelisted user
    if (checkWhitelists(message)) return false;

    //find blacklisted words in message content and censor them
    const content = message.content;

    //let star_count = 0;
    let modified = false;

    let censored = content.replace(blacklist_regexp, (word, index) => {
        const space_index = content.lastIndexOf(' ', index); //nearest space to word on the left
        const left_of_word = content.substring(space_index + 1, index); //all the stuff to the left of word (non whitespace)

        //dont replace if the match is part of a link or emoji
        if (left_of_word.includes('http') || left_of_word.includes('<:') && !left_of_word.includes('>')) return word;

        let censored_word = word[0]; //first char of bad word
        for (let i = 1; i < word.length; i++) { 
            //for every char after the first, add one star
            censored_word += '⋆'; // '\\*';
            
            //count total amount of stars inserted into message
            //also used to determine adjusted max_length later
            //star_count++;
            modified = true;
        }

        return censored_word;
    });

    //no stars inserted => no censhorship was done
    //if (star_count === 0) return false;
    if (!modified) return false;

    //prepend fake reply to beginning of censored message content
    if (message.type === 'REPLY') {
        //catch exception if reply isnt found (non critical error)
        const replied_msg = await message.fetchReference().catch(console.error);
        censored = prependFakeReply(censored, replied_msg);
    }

    //split message if it's too big
    let censored_followup;

    const max_length = 2000; // - star_count;
    if (censored.length > max_length) {

        const cutoff_index = findLastSpaceIndex(censored, max_length);
        censored_followup = censored.substring( cutoff_index );

        //if cutoff point was a newline, add fake bold ** ** to preserve it in the beginning of the followup message
        if (censored_followup.startsWith('\n')) 
            censored_followup = `** **${censored_followup}`
        
        censored = censored.substring(0, cutoff_index);
    }

    //delete user's original uncensored message
    message.delete();

    //mimic original author's name and pfp
    //mentions are disabled because we dont want to ping people twice
    let message_options = {
        content: censored,
        username: message.member.displayName,
        avatarURL: message.member.displayAvatarURL(),
        allowedMentions: { parse: [] },
        threadId: is_thread ? message.channelId : null
    };

    //check if original message had attachments and filter out ones that are above the current guild's upload size limit
    const attachments = [...message.attachments?.filter(file => file.size <= getGuildUploadLimit(message.guild) ).values()];
    //add the attachments to the message if there will be no followup (we dont want the attachments to between the intial and followup message)
    if (!censored_followup && attachments.length > 0) message_options.files = attachments;

    //send censored message through webhook
    const new_msg = await hook.send(message_options);
    //then cache message id and corresponding author id, so that we could check this for the jail context menu command
    cacheAuthorId(new_msg.id, message.author.id);
    
    //this is part 2 of large messages
    if (censored_followup) {
        //reuse the same MessageOptions, just change the text content
        message_options.content = censored_followup;
        //if attachments were not sent with first message
        if (attachments.length > 0) message_options.files = attachments;
        
        //send and cache ids
        const new_msg = await hook.send(message_options);
        cacheAuthorId(new_msg.id, message.author.id);
    }

    return true;
}

module.exports = {
    censored_authors_cache,
    generateBlacklist,
    getBlacklist,
    generateWhitelists,
    checkWhitelists,
    censorMessage
};