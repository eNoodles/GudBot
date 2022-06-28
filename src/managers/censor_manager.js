const { Message, TextChannel, Webhook, Collection } = require('discord.js');
const { blacklist, whitelist } = require('../database/dbObjects');
const utils = require('../utils');

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
const censored_cache = new Collection();

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

/**
 * @param {TextChannel} channel
 * @returns {Webhook} Fetched or newly created GudBot-owned webhook
 */
 async function fetchOrCreateHook(channel) {
    const hook = 
        (await channel.fetchWebhooks()).find(hook => hook.owner.id === utils.ids.client) || //fetch channel's webhooks and fine the one created by GudBut
        await channel.createWebhook('GudBot'); //if it doesn't exist, create it

    webhooks_cache.set(channel.id, hook); //map to cache

    return hook;
}

/**
 * Detects blacklisted words in message content, censors them and resends the message with a webhook so as to mimic original author's name and avatar.
 * @param {Message} message 
 */
async function censorMessage(message) {
    //threads dont have webhooks, so in that case we get the parent channel
    const is_thread = message.channel.isThread();
    const channel = is_thread ? message.channel.parent : message.channel;

    //fetch/create channel webhook if it's not in cache
    //we do this on every messageCreate, not just the ones that need to be censored, so as to populate the cache
    const hook = webhooks_cache.get(channel.id) || await fetchOrCreateHook(channel);

    //const regexp = utils.getBlacklistRegExp();
    //don't do anything if regexp is empty
    if (blacklist_regexp.source === '(?:)') return;

    //dont censor message if sent in whitelisted channel or by whitelisted user
    if (checkWhitelists(message)) return;

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
    //if (star_count === 0) return;
    if (!modified) return;

    //append fake reply to beginning of censored message content
    if (message.type === 'REPLY') {

        const replied_msg = await message.fetchReference();
        if (replied_msg) {
            //if there is no message content, then it must have been an attachment-only message
            let reply_content = replied_msg.content || '*Click to see attachment*'; //🖻🗎

            if (reply_content.length > 500) {
                const cutoff_index = utils.findLastSpaceIndex(reply_content, 500);
                reply_content = reply_content.substring(0, cutoff_index);
                reply_content = utils.trimWhitespace(reply_content);
                reply_content = utils.addEllipsisDots(reply_content);
            }

            //newlines break the quote block so we must reinsert '> ' on each line
            reply_content = reply_content.replace(/\n/g, '\n> ');

            censored = `> [**${replied_msg.member?.displayName || replied_msg.author.username}** ${reply_content}](${replied_msg.url})\n${censored}`;
        }
    }

    //split message if it's too big
    let censored_followup;

    const max_length = 2000; // - star_count;
    if (censored.length > max_length) {

        const cutoff_index = utils.findLastSpaceIndex(censored, max_length);
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
    const attachments = [...message.attachments?.filter(file => file.size <= utils.getGuildUploadLimit(message.guild) ).values()];
    //add the attachments to the message if there will be no followup (we dont want the attachments to between the intial and followup message)
    if (!censored_followup && attachments) message_options.files = attachments;

    //send censored message through webhook
    //then cache message id and corresponding author id, so that we could check this for the jail context menu command
    hook.send(message_options)
        .then(new_msg => censored_cache.set(new_msg.id, message.author.id));
    
    //this is part 2 of large messages
    if (censored_followup) {
        //reuse the same MessageOptions, just change the text content
        message_options.content = censored_followup;
        //if attachments were not sent with first message
        if (attachments) message_options.files = attachments;
        
        //send and cache ids
        hook.send(message_options)
            .then(new_msg => censored_cache.set(new_msg.id, message.author.id));
    }
}

module.exports = {
    censored_cache,
    generateBlacklistRegExp,
    getBlacklistRegExp,
    generateWhitelists,
    checkWhitelists,
    censorMessage
}