const { Client, Message } = require('discord.js');
const { getBlacklist, checkWhitelists } = require('../managers/censorManager');
const { logUnless, ids } = require('../utils');

module.exports = {
    /**
     * @param {Client} client 
     * @param {Message} old_message 
     * @param {Message} new_message 
     */
	async execute(client, old_message, new_message) {
        if (new_message.author.bot) return;

        if (new_message.content !== old_message.content) {
            const regexp = getBlacklist();

            //if anyone tries to be a smartass and edit in uncensored words, just delete the message
            //check whitelist and make sure regexp isnt empty
            if (!checkWhitelists(new_message) && regexp.source !== '(?:)' && new_message.content.search(regexp) > -1) {
                new_message.delete().catch(e => logUnless(e, ids.errors.unknown_message));
            }
        }
	}
};