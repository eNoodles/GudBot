const utils = require('../utils');

module.exports = {
	async execute(client, interaction) {

		const { commandName, customId } = interaction;

		const response = 
			interaction.isCommand() ? client.commands.get(commandName) :
			interaction.isUserContextMenu() ? client.userContextMenus.get(commandName) :
			interaction.isMessageContextMenu() ? client.messageContextMenus.get(commandName) :
			interaction.isButton() ? client.buttons.get(customId.split('|')[0]) :
			interaction.isModalSubmit() ? client.modals.get(customId.split('|')[0]) : false;

		if (!response) return;
		
		//pass client to access database models
		response.execute(interaction)
			.catch(e => {
				console.error(e);
				
				interaction.reply({
					embeds: [utils.createErrorEmbed('There was an error while executing this command.')],
					ephemeral: true
				});
			});
	}
};