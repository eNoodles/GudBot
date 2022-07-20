const { ButtonStyle } = require('discord-api-types/v10');
const { ButtonInteraction, MessageButton, MessageActionRow } = require('discord.js');
const { generateThresholdsEmbed } = require('../../managers/spamManager');

module.exports = {
    /**
     * @param {ButtonInteraction} interaction 
     */
	async execute(interaction) {
        const embed = generateThresholdsEmbed();

        const edit_button = new MessageButton()
            .setLabel('Edit')
            .setStyle(ButtonStyle.Secondary)
            .setCustomId(`spamThresholdsEdit`);

        await interaction.update({
            embeds: [embed],
            components: [new MessageActionRow().addComponents([edit_button])]
        });
	}
};