const { Message, TextChannel, Webhook, Collection } = require('discord.js');
const { blacklist, whitelist } = require('../database/dbObjects');
const { ids, prependFakeReply, findLastSpaceIndex, getGuildUploadLimit } = require('../utils');
const { addToMessageGroups } = require('./spamManager');

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
    const channel_hooks = await channel.fetchWebhooks().catch(console.error);
    hook = channel_hooks?.find(hook => hook.owner.id === ids.client);
    if (hook) {
        //cache it
        webhooks_cache.set(channel.id, hook);
        return hook;
    }

    //if it doesn't exist, create and cache it
    hook = await channel.createWebhook('GudBot').catch(console.error);
    if (hook) {
        webhooks_cache.set(channel.id, hook);
        return hook;
    }
    
    //couldnt fetch or create
    return null;
}

/**
 * @param {string} content 
 * @returns {string|null} Censored message content or null if censorship was unnecessary
 */
function parseContent(content) {
    //let star_count = 0;
    let modified = false;

    const removed_whitespace = [];
    let discarded_count = 0;

    //remove whitespace and zero-width chars
    content = content.replace(/(\s+)|(?:[\u200b-\u200f]|[\u2060-\u2064]|[\u206a-\u206f]|[\u17b4-\u17b5]|\u00ad|\u034f|\u061c|\u180e)+/g, (match, space, offset) => {
        //if matched text was whitespace, save it for reinsertion later
        if (space) {
            removed_whitespace.push({
                whitespace: match,
                index: offset - discarded_count
            });
        }
        //zero width characters will be discarded, so we have to keep track of how many chars were removed to adjust saved whitespace indexes
        else discarded_count += match.length;

        //remove
        return '';
    });

    //replace blacklisted words with stars
    let censored = content.replace(blacklist_regexp, (word, index) => {
        //find nearest space before the word
        const space_index = content.lastIndexOf(' ', index);
        //get all the non-whitespace stuff to the left of word
        const left_of_word = content.substring(space_index + 1, index);

        //dont replace word if the match is part of a link or emoji
        if (left_of_word.includes('http') || left_of_word.includes('<:') && !left_of_word.includes('>')) return word;

        //get the first char of the word
        let censored_word = word[0];

        //for every char after the first, add one star
        for (let i = 1; i < word.length; i++) { 
            censored_word += '⋆'; // '\\*';
            
            //count total amount of stars inserted into message
            //also used to determine adjusted max_length later
            //star_count++;

            modified = true;
        }

        //replace
        return censored_word;
    });

    //no stars inserted => no censhorship was done
    //if (star_count === 0) return false;

    //if content was not modified, meaning no censorship was necessary => do not proceed further
    if (!modified) return null;

    //reinsert whitespace
    discarded_count = 0;
    removed_whitespace.forEach(e => {
        //adjust whitespace's index based on how many prior spaces were discarded
        const index = e.index - discarded_count;

        const space = e.whitespace;

        //if the next char is a star, do not reinsert space, but keep track of how many spaces were discarded
        if (censored[index] === '⋆')
            discarded_count += space.length;
        //reinsert
        else censored = censored.substring(0, index) + space + censored.substring(index);
    });

    //return the successfully censored content
    return censored;
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
    const fetch_hook = fetchOrCreateHook(channel).catch(console.error);

    //don't do anything if content is empty
    if (!message.content) return false;

    //don't do anything if regexp is empty
    if (blacklist_regexp.source === '(?:)') return false;

    //dont censor message if sent in whitelisted channel or by whitelisted user
    if (checkWhitelists(message)) return false;

    //find blacklisted words in message content and censor if necessary
    let censored = parseContent(message.content);

    //if no blacklisted words found, do not proceed further
    if (!censored) return false;

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

    //delete user's original uncensored message
    message.delete().catch(console.error);

    //await for fetch_hook resolve
    const hook = await fetch_hook;
    if (!hook) return false;

    const send = [];
    send.push(
        //send censored message through webhook
        hook.send(message_options)
            //then cache message id and corresponding author id, so that we could check this for the jail context menu command
            .then(new_message => {
                cacheAuthorId(new_message.id, message.author.id);
                
                //check newly censored message for spam
                let hybrid_message = new_message;
                hybrid_message.author = message.author;
                hybrid_message.member = message.member;
                addToMessageGroups(hybrid_message).catch(console.error);
            })
    );
    
    //this is part 2 of large messages
    if (censored_followup) {
        //reuse the same MessageOptions, just change the text content
        message_options.content = censored_followup;
        //if attachments were not sent with first message
        if (attachments.length > 0) message_options.files = attachments;
        
        send.push(
            //send censored message through webhook
            hook.send(message_options)
                //then cache message id and corresponding author id, so that we could check this for the jail context menu command
                .then(new_message => cacheAuthorId(new_message.id, message.author.id))
        );
    }

    //await both messages to be sent
    const has_sent = await Promise.all(send);

    return has_sent;
}

module.exports = {
    censored_authors_cache,
    generateBlacklist,
    getBlacklist,
    generateWhitelists,
    checkWhitelists,
    censorMessage
};