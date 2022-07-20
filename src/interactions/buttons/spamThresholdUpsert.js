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
        const message_value = parseInt(args[2], 10);
        const channel_value = parseInt(args[3], 10);
        const extra_value = parseInt(args[4], 10);

        const entry = await thresholds.upsert({
            type: type_value,
            set_by: interaction.user.id,
            message_count: message_value,
            channel_count: channel_value,
            extra: extra_value
        });

        if (!entry) {
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