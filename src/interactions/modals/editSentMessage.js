const { MessageButton, MessageActionRow, ModalSubmitInteraction } = require('discord.js');
const utils = require('../../utils');

module.exports = {
    /**
     * @param {ModalSubmitInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const message_id = args[1];

        const channel = await interaction.channel.fetch();
        const message = await channel.messages.fetch(message_id);

        await message.edit({ content: interaction.fields.getTextInputValue('new_content') });

        const edit_button = new MessageButton()
            .setLabel('Edit')
            .setStyle(utils.buttons.gray)
            .setCustomId(`editSentMessage|${message.id}`);

        await interaction.update({
            content: 'Message edited',
            components: [new MessageActionRow().addComponents([edit_button])],
            ephemeral: true
        }); 
	}
};