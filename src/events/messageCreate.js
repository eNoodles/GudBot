const { censorMessage } = require('../managers/censorManager');

module.exports = {
	async execute(client, message) {
        if (message.author.bot) return;

        censorMessage(message);
	}
};