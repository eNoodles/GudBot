const { cacheJailData, checkJailCache } = require('../managers/jail_manager');
const utils = require('../utils');

module.exports = {
	once: true,
	async execute(client) {

		utils.generateBlacklistRegExp();
		utils.generateWhitelists();

		cacheJailData(await client.guilds.fetch(utils.ids.guild));

		setInterval(checkJailCache, 10000);

		console.log(`Logged in as ${client.user.tag}`);
	},
};