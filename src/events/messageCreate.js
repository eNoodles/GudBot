const { censorMessage } = require('../managers/censor_manager');

module.exports = {
	async execute(client, message) {
        if (message.author.bot) return;

        censorMessage(message);
	}
};