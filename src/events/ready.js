const { cacheJailData, checkJailCache, setRecordsChannel, getRecordsChannel } = require('../managers/jailManager');
const { generateBlacklist, generateWhitelists } = require('../managers/censorManager');
const { ids } = require('../utils');

module.exports = {
	once: true,
	async execute(client) {

		//generate blacklist and whitelists for censorship manager
		generateBlacklist();
		generateWhitelists();

		//cache #criminal-records in jailManager
		await setRecordsChannel(client);

		//fetch last 100 messages from #criminal-records
		//this is in case an old records message is deleted, which would have otherwise been uncached
		//this promise rejecting is non critical, catch it and keep going
		getRecordsChannel().messages.fetch({ limit: 100, cache: true }).catch(console.error);

		//fetch and cache jail data from database for jail manager
		const guild = await client.guilds.fetch(ids.guild);
		cacheJailData(guild);

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