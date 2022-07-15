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

        //if the message was censored, original message was deleted and we dont need to do anything more with it
        if (await censorMessage(message)) return;

        //add to message groups for spam detection
        await addToMessageGroups(message);
    }
};