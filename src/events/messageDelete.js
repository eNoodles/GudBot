const { censored_authors_cache } = require('../managers/censorManager');
const { cacheDeletedMessage, getJailDataByMessage, deleteRecord, unjailMember } = require('../managers/jailManager');
const { ids } = require('../utils');

module.exports = {
	async execute(client, message) {
        // //messageDelete doesn't emit executor data unfortunately, so we have to look it up in the audit log
        // const audit_logs = await message.guild.fetchAuditLogs({
        //     type: 72, //MessageDelete
        //     limit: 1
        // });

        // //make sure we got the right one by cross referencing audit log entry target and message
        // const message_delete_entry = audit_logs.entries.filter(entry => entry.target.id === message.id).first();
        // const deleter = message_delete_entry?.executor ?? message.author;

        //potential jail record deletion by user
        if (message.author.bot && message.channelId === ids.records_ch) {
            //check if JailData for this message exists
            const data = await getJailDataByMessage(message, message.guild);
            if (data) {
                //make sure memnber is unjailed
                if (!data.record.unjailed) await unjailMember(data).catch(console.error);
                //delete jail record
                await deleteRecord(data);
                //no need to cache
                return;
            }
        }

        //censored messages were originally sent by a user, but message author will be marked as bot
        const censored_message = message.webhookId && censored_authors_cache.get(message.id);
        //if sent by user, cache message
        if (!message.author.bot || censored_message)
            cacheDeletedMessage(message);
	}
};