const { createErrorEmbed } = require('../utils');

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
		
		response.execute(interaction).catch(e => {
			console.error(e);
			
			interaction.reply({
				embeds: [createErrorEmbed('There was an error while handling this interaction.')],
				ephemeral: true
			}).catch(console.error); //it's possible that the interaction is invalid
		});
	}
};