module.exports = {
	name: 'ready',
	once: true,
	async execute(client) {
		console.log(`Logged in as ${client.user.tag}`);

		// client.wordbank.sync();
		// client.whitelist.sync();
		// client.starboard.sync();
		client.rolebank.sync();
		client.jail_records.sync();
	},
};