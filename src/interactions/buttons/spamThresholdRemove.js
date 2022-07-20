const { ButtonStyle } = require('discord-api-types/v10');
const { ButtonInteraction, MessageButton, MessageActionRow } = require('discord.js');
const { thresholds } = require('../../database/dbObjects');
const { generateThresholds, generateThresholdsEmbed } = require('../../managers/spamManager');

module.exports = {
    /**
     * @param {ButtonInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const type_value = args[1];

        //returns # of deleted rows
        const deleted = await thresholds.destroy({ where: { type: type_value } });

        //if number equals 0
        if (!deleted) {
			await interaction.reply({
				embeds: [createErrorEmbed('There was an error accessing the database.')],
				ephemeral: true
			});

            return;
        }

        await generateThresholds();

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