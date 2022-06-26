const { generateBlacklistRegExp, generateWhitelists } = require('../utils');

module.exports = {
	once: true,
	async execute(client) {
		console.log(`Logged in as ${client.user.tag}`);

		generateBlacklistRegExp();
		generateWhitelists();
	},
};