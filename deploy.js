require('dotenv').config();
const fs = require('fs');
const { ids } = require('./src/utils');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

const commands = [];

['commands','userContextMenus','messageContextMenus'].forEach(type => {

    const command_files = fs.readdirSync(`./src/interactions/${type}`).filter(file => file.endsWith('.js'));

    for (const file of command_files) {
        const command = require(`./src/interactions/${type}/${file}`);
        commands.push(command.data.toJSON());
    }
});

const rest = new REST({ version: '9' }).setToken(process.env.token);

rest.put(Routes.applicationGuildCommands(ids.client, ids.guild), { body: commands })
	.then(() => console.log('Successfully registered application commands.'))
	.catch(console.error);