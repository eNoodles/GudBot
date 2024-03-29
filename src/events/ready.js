const { cacheJailData, checkJailCache } = require('../managers/jailManager');
const { generateBlacklist, generateWhitelists } = require('../managers/censorManager');
const { filterMessageGroups, generateThresholds } = require('../managers/spamManager');
const { ids, cacheChannels, getCachedChannel } = require('../utils');
const { cachePingData } = require('../managers/pingManager');

module.exports = {
	once: true,
	async execute(client) {

		//generate blacklist and whitelists for censorship manager
		generateBlacklist();
		generateWhitelists();

		//generate action thresholds for spam manager
		//no need to await, exceptions are handled locally within method
		generateThresholds();

		//fetch and cache ping configuration data from database for ping manager
		client.guilds
			.fetch(ids.guild)
			.then(guild => cachePingData(guild))
			.catch(console.erro);

		//cache all channels from utils#ids
		//await before proceeding since cached channels are needed
		await cacheChannels(client);

		//fetch last 100 messages from #criminal-records
		//this is in case an old records message is deleted, which would have otherwise been uncached
		//this promise rejecting is non critical, catch it and keep going
		getCachedChannel(ids.channels.records)?.messages.fetch({ limit: 100, cache: true }).catch(console.error);

		//fetch and cache jail data from database for jail manager
		//this has to be after await cacheChannels as it relies on records channel being cached
		cacheJailData();

		//do checks every 5 seconds
		setInterval(() => {
			try {
				//unjail members whose release time has been reached
				checkJailCache();

				//delete MessageGroups that have expired
				filterMessageGroups();
			}
			catch (e) {
				console.error(e);
			}
		}, 5000);

		console.log(`Logged in as ${client.user.tag}`);
	},
};