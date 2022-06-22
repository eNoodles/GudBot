require('dotenv').config();
const fs = require('fs');
const { Client, Collection, Intents } = require('discord.js');
const client = new Client({ 
    intents: [
        Intents.FLAGS.GUILDS, 
        Intents.FLAGS.GUILD_MEMBERS, 
        Intents.FLAGS.GUILD_BANS,
        Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS, 
        Intents.FLAGS.GUILD_INTEGRATIONS, 
        Intents.FLAGS.GUILD_INVITES,
        Intents.FLAGS.GUILD_PRESENCES, 
        Intents.FLAGS.GUILD_MESSAGES, 
        Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
        Intents.FLAGS.GUILD_MESSAGE_TYPING,
        Intents.FLAGS.DIRECT_MESSAGES,
        Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
        Intents.FLAGS.DIRECT_MESSAGE_TYPING
    ],
    partials: [
        'MESSAGE',
        'CHANNEL',
        'REACTION'
    ]
});

const event_files = fs.readdirSync('./src/events/').filter(file => file.endsWith('.js'));

for (const file of event_files) {
    const event = require(`./events/${file}`);
    const event_name = file.substring(0, file.lastIndexOf('.') );

    if (event.once)
        client.once(event_name, (...args) => event.execute(client, ...args));
    else
        client.on(event_name, (...args) => event.execute(client, ...args));
}

['commands','userContextMenus','messageContextMenus','buttons','modals'].forEach(type => {

    const interaction_files = fs.readdirSync(`./src/interactions/${type}`).filter(file => file.endsWith('.js'));

    client[type] = new Collection();

    for (const file of interaction_files) {
        const file_export = require(`./interactions/${type}/${file}`);

        //some context menu command names have spaces, which are replaced with underscores in the filenames
        const file_name = file.substring(0, file.lastIndexOf('.') ).replace('_', ' ');
        client[type].set(file_name, file_export);
    }
});

client.login(process.env.token);