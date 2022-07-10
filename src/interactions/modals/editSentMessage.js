const { MessageButton, MessageActionRow, ModalSubmitInteraction, MessageEmbed } = require('discord.js');
const { ButtonStyle } = require('discord-api-types/v10');
const { colors } = require('../../utils');

module.exports = {
    /**
     * @param {ModalSubmitInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const message_id = args[1];

        const message = await interaction.channel.messages.fetch(message_id);

        await message.edit({ content: interaction.fields.getTextInputValue('new_content') });

        const embed = new MessageEmbed()
            .setDescription('Message edited')
            .setColor(colors.blurple);

        const edit_button = new MessageButton()
            .setLabel('Edit')
            .setStyle(ButtonStyle.Secondary)
            .setCustomId(`editSentMessage|${message.id}`);

        await interaction.update({
            embeds: [embed],
            components: [new MessageActionRow().addComponents([edit_button])],
            ephemeral: true
        }); 
	}
};