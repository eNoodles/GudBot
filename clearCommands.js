require('dotenv').config();
const utils = require('./src/utils.js');
const { Client, Intents } = require('discord.js');
const client = new Client({ 
    intents: [
        Intents.FLAGS.GUILDS, 
        Intents.FLAGS.GUILD_INTEGRATIONS, 
    ]
});

client.login(process.env.token);

client.once('ready', () => {
    client.guilds.fetch(utils.ids.guild).then(guild => {
        guild.commands.set([])
            .then(console.log('Successfully cleared application commands.'))
            .catch(console.error);
    });

    process.exit();
});