const { Client, Message } = require('discord.js');
const { censorMessage } = require('../managers/censorManager');

module.exports = {
    /**
     * @param {Client} client 
     * @param {Message} message  
     */
    async execute(client, message) {
        if (message.author.bot) return;

        censorMessage(message);
    }
};