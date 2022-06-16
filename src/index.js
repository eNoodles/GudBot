const fs = require('fs');
require('dotenv').config();

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

const Sequelize = require('sequelize');
const sequelize = new Sequelize('mysql://u3235_x1sQdjX1UK:MX@!S+1DX2mkA^3cmGRNDaw+@138.201.82.201:3306/s3235_gudbot', { logging: false });

// client.wordbank = sequelize.define('0000_wordbank', {
//     word: Sequelize.STRING,
//     //type: Sequelize.STRING,
//     added_by: Sequelize.STRING
// });
// client.whitelist = sequelize.define('0000_whitelist', {
//     id: {
//         type: Sequelize.STRING(185),
//         unique: true,
//         primaryKey: true,
//     },
//     type: Sequelize.STRING,
//     added_by: Sequelize.STRING
// });
// client.starboard = sequelize.define('0000_starboard', {
//     id: {
//         type: Sequelize.STRING(185),
//         unique: true,
//         primaryKey: true,
//     },
//     original_id: {
//         type: Sequelize.STRING(185),
//         unique: true
//     },
//     channel_id: Sequelize.STRING(185),
//     author_id: Sequelize.STRING(185),
//     count: Sequelize.INTEGER,
//     hasImage: Sequelize.BOOLEAN,
//     hasAttachment: Sequelize.BOOLEAN,
//     url: Sequelize.STRING
// });
client.rolebank = sequelize.define('0000_rolebank', {
    user_id: Sequelize.STRING,
    role_id: Sequelize.STRING
}, {
    timestamps: false
});

client.jail_records = sequelize.define('0000_jail_records', {
    offender_id: Sequelize.STRING,
    jailer_id: Sequelize.STRING,
    reason: Sequelize.STRING(512),
    jail_timestamp: Sequelize.DATE,
    release_timestamp: Sequelize.DATE
}, {
    timestamps: false
});

client.commands = new Collection();
client.user_context_menus = new Collection();
client.message_context_menus = new Collection();
client.buttons = new Collection();
client.modals = new Collection();

const event_files = fs.readdirSync('./src/events/').filter(file => file.endsWith('.js'));
const command_files = fs.readdirSync('./src/commands/').filter(file => file.endsWith('.js'));
const user_context_menu_files = fs.readdirSync('./src/contextMenus/user/').filter(file => file.endsWith('.js'));
const message_context_menu_files = fs.readdirSync('./src/contextMenus/message/').filter(file => file.endsWith('.js'));
const button_files = fs.readdirSync('./src/buttons/').filter(file => file.endsWith('.js'));
const modal_files = fs.readdirSync('./src/modals/').filter(file => file.endsWith('.js'));

for (const file of event_files) {
    const event = require(`./events/${file}`);
    if (event.once)
        client.once(event.name, (...args) => event.execute(client, ...args));
    else
        client.on(event.name, (...args) => event.execute(client, ...args));
}

for (const file of command_files) {
	const command = require(`./commands/${file}`);
	client.commands.set(command.data.name, command);
}

for (const file of user_context_menu_files) {
	const context_menu = require(`./contextMenus/user/${file}`);
	client.user_context_menus.set(context_menu.name, context_menu);
}

for (const file of message_context_menu_files) {
	const context_menu = require(`./contextMenus/message/${file}`);
	client.message_context_menu_files.set(context_menu.name, context_menu);
}

for (const file of button_files) {
	const button = require(`./buttons/${file}`);
	client.buttons.set(button.name, button);
}

for (const file of modal_files) {
	const modal = require(`./modals/${file}`);
	client.modals.set(modal.name, modal);
}

client.login(process.env.token);