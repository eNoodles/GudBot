const { Client, Message, MessageEmbed } = require('discord.js');
const { censored_authors_cache } = require('../managers/censorManager');
const { cacheDeletedMessage, getJailDataByMessage } = require('../managers/jailManager');
const { fetchStarboardEntry, starboard_cache } = require('../managers/starboardManager');
const { ids, colors, getCachedChannel, logUnless } = require('../utils');
const { starboard } = require('../database/dbObjects');

module.exports = {
    /**
     * @param {Client} client 
     * @param {Message} message 
     */
	async execute(client, message) {
        //potential jail record deletion by user
        if (message.author?.bot && message.channelId === ids.channels.records) {
            //check if JailData for this message exists
            const data = await getJailDataByMessage(message, message.guild);
            if (data) {
                //messageDelete doesn't emit executor data unfortunately, so we have to look it up in the audit log
                const audit_logs = await message.guild.fetchAuditLogs({
                    type: 72, //MessageDelete
                    limit: 1
                });

                //make sure we got the right one:
                //message deleted mustve been sent by gudbot
                //mustve been in #criminal-records
                //current time and deletion time must be within 1 second OR 5 minutes if count greater than 1 (merged deletion logs)
                const current_time = new Date().getTime();
                const message_delete_entry = audit_logs.entries.find(entry =>
                    entry.target.bot && 
                    entry.target.id === ids.client &&
                    entry.extra.channel.id === ids.channels.records && (
                        current_time - entry.createdTimestamp <= 1000 || 
                        entry.extra.count > 1 && current_time - entry.createdTimestamp <= 300000
                    )
                );
                const deleter = message_delete_entry?.executor; // ?? message.author;

                //make sure member is unjailed
                if (!data.record.unjailed) await data.unjailMember(deleter).catch(console.error);

                //delete jail record
                await data.deleteRecord().catch(console.error);

                //if deleter can be determined, send notification
                if (deleter) {
                    const embed = new MessageEmbed()
                        .setDescription(`<@${deleter.id}> deleted <@${data.member.id}>'s jail record from <t:${data.record.jail_timestamp}:f>`)
                        .setColor(colors.red);

                    await getCachedChannel(ids.channels.records).send({ embeds: [embed] });
                }

                //no need to cache this message
                return;
            }
        }

        //censored messages were originally sent by a user, but message author will be marked as bot
        const censored_message = message.webhookId && !message.interaction && censored_authors_cache.get(message.id);
        //cache user sent messages
        //if message is uncached, author will be null
        if ((message.author && !message.author.bot) || censored_message)
            cacheDeletedMessage(message);

        // I decided that I dont want to delete starboard posts when the original messages are deleted
        // since they cant be reacted to, it doesn't necessarily break anything, as the viewer accounts for deleted messages

        // //check if message was on the starboard (dont await)
        // fetchStarboardEntry(message.id)
        //     .then(entry => {
        //         if (entry) {
        //             getCachedChannel(ids.channels.starboard)?.messages
        //                 //fetch starboard message
        //                 .fetch(entry.id)
        //                 //delete it
        //                 .then(message => message.delete().catch(e => logUnless(e, ids.errors.unknown_message)))
        //                 .catch(e => logUnless(e, ids.errors.unknown_message));

        //             //delete entry from database
        //             entry.destroy().catch(console.error);
        //             //delete entry from cache
        //             starboard_cache.delete(message.id);
        //         }
        //     })
        //     .catch(console.error);

        //delete starboard posts when a #starboard message is deleted
        if (message.channelId === ids.channels.starboard) {
            //no need to await any of this, since it's deleted it's useless
            starboard
                //find entry matching id of #starboard message
                .findOne({ where: { id: message.id } })
                .then(entry => {
                    //if found
                    if (entry) {
                        //delete entry from cache
                        starboard_cache.delete(entry.original_id);
                        //delete entry from database
                        entry.destroy().catch(console.error);
                    }
                })
                .catch(console.error);
        }
	}
};