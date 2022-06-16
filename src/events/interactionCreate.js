const utils = require('../utils.js');

module.exports = {
	name: 'interactionCreate',
	async execute(client, interaction) {
		if (interaction.applicationId !== client.application.id) return;

		const response = 
			interaction.isCommand() ? client.commands.get(interaction.commandName) :
			interaction.isUserContextMenu() ? client.userContextMenus.get(interaction.commandName) :
			interaction.isMessageContextMenu() ? client.messageContextMenus.get(interaction.commandName) :
			interaction.isModalSubmit() ? client.modals.get(interaction.customId.split('|')[0]) :
			interaction.isButton() ? client.buttons.get(interaction.customId.split('|')[0]) : false;

		if (!response) return;
		
		//pass client to access database models
		response.execute(client, interaction)
			.catch(e => {
				console.error(e);
				
				interaction.reply({
					embeds: [utils.createErrorEmbed('There was an error while executing this command.')],
					ephemeral: true
				});
			});
	}
};