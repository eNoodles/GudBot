const { getBlacklist, checkWhitelists } = require('../managers/censorManager');

module.exports = {
	async execute(client, old_message, new_message) {
        if (new_message.author.bot) return;

        if (new_message.content !== old_message.content) {
            const regexp = getBlacklist();

            //if anyone tries to be a smartass and edit in uncensored words, just delete the message
            //check whitelist and make sure regexp isnt empty
            if (!checkWhitelists(new_message) && regexp.source !== '(?:)' && new_message.content.match(regexp)) {
                new_message.delete();
            }
        }
	}
};