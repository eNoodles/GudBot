const { Client, Message } = require('discord.js');
const { censorMessage } = require('../managers/censorManager');
const { addToMessageGroups } = require('../managers/spamManager');

module.exports = {
    /**
     * @param {Client} client 
     * @param {Message} message  
     */
    async execute(client, message) {
        if (message.author.bot) return;
        if (await censorMessage(message)) return;

        await addToMessageGroups(message);
    }
};