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
        const selected_type_value = args[1];
        const selected_message_value = parseInt(args[2], 10);
        const selected_channel_value = parseInt(args[3], 10);
        const selected_jail_value = parseInt(args[4], 10);
        const selected_ban_value = parseInt(args[5], 10);

        const entry = await thresholds.upsert({
            type: selected_type_value,
            set_by: interaction.user.id,
            message_count: selected_message_value,
            channel_count: selected_channel_value,
            extra: selected_jail_value ?? selected_ban_value
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