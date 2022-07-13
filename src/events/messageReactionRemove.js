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
        if (reaction.message.partial) await reaction.message.fetch();
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.guild.id !== ids.guild) return;
        if (user.bot) return;

        if (reaction.emoji.name === '⭐') await updateStarboard(reaction, user);
    }
};