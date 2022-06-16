const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const fs = require('fs');
require('dotenv').config();
const utils = require('./src/utils.js');

const commands = [];
const command_files = fs.readdirSync('./src/commands/').filter(file => file.endsWith('.js'));

for (const file of command_files) {
	const command = require(`./src/commands/${file}`);
    commands.push(command.data.toJSON());
}

const rest = new REST({ version: '9' }).setToken(process.env.token);

rest.put(Routes.applicationGuildCommands(utils.ids.client, utils.ids.guild), { body: commands })
	.then(() => console.log('Successfully registered application commands.'))
	.catch(console.error);