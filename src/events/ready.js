const { cacheJailData, checkJailCache } = require('../managers/jail_manager');
const { generateBlacklistRegExp, generateWhitelists } = require('../managers/censor_manager');
const { ids } = require('../utils');

module.exports = {
	once: true,
	async execute(client) {

		//generate blacklist and whitelists for censorship manager
		generateBlacklistRegExp();
		generateWhitelists();

		//fetch and cache jail data from database for jail manager
		cacheJailData(await client.guilds.fetch(ids.guild));

		setInterval(() => {
			try {
				//check jail data for unjailing every 5 secs
				checkJailCache();
			}
			catch (e) {
				console.error(e);
			}
		}, 5000);

		console.log(`Logged in as ${client.user.tag}`);
	},
};