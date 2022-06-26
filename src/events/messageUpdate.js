const { getBlacklistRegex } = require('../utils');

module.exports = {
	async execute(client, old_message, new_message) {
        if (new_message.author.bot) return;

        if (new_message.content !== old_message.content) {
            const regexp = getBlacklistRegex();

            //make sure regexp isnt empty
            if (regexp.source !== '(?:)' && new_message.content.match(regexp)) {
                new_message.delete();
            }
        }
	}
};