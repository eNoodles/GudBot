const { generateBlacklistRegExp, generateWhitelists, cacheJailData, checkJailCache, ids } = require('../utils');

module.exports = {
	once: true,
	async execute(client) {

		generateBlacklistRegExp();
		generateWhitelists();

		cacheJailData(await client.guilds.fetch(ids.guild));

		setInterval(checkJailCache, 10000);

		console.log(`Logged in as ${client.user.tag}`);
	},
};