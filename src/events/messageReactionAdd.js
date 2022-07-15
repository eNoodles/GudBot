const { Client, MessageReaction, User } = require("discord.js");
const { updateStarboard } = require("../managers/starboardManager");
const { ids } = require("../utils");

module.exports = {
    /**
     * @param {Client} client 
     * @param {MessageReaction} reaction 
     * @param {User} user 
     */
    async execute(client, reaction, user) {
        if (user.bot) return;

        let fetch_message, fetch_reaction;
        if (reaction.message.partial) fetch_message = reaction.message.fetch();
        if (reaction.partial) fetch_reaction = reaction.fetch();
        await Promise.all([fetch_message, fetch_reaction]);

        if (reaction.message.guild.id !== ids.guild) return;

        if (reaction.emoji.name === '⭐') await updateStarboard(reaction, user);
    }
};