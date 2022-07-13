const { ButtonInteraction, TextInputComponent, MessageActionRow, Modal } = require('discord.js');
const { getMessageGroup } = require('../../managers/spamManager');
const { createErrorEmbed } = require('../../utils');

module.exports = {
    /**
     * @param {ButtonInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const group_id = args[1];
        const group = getMessageGroup(group_id);

        if (!group) {
            await interaction.reply({
                embeds: [createErrorEmbed(`Message Group \`#${group_id}\` has expired.`)],
                ephemeral: true
            });

            return;
        }

        const jail_reason = new TextInputComponent()
            .setCustomId('jail_reason')
            .setLabel('Reason for jailing:')
            .setValue('Spam')
            .setMaxLength(512)
            .setMinLength(3)
            .setStyle(2);

        const jail_minutes = new TextInputComponent()
            .setCustomId('jail_minutes')
            .setLabel('Minutes:')
            .setPlaceholder('0')
            .setMaxLength(2)
            .setStyle(1);

        const jail_hours = new TextInputComponent()
            .setCustomId('jail_hours')
            .setLabel('Hours:')
            .setPlaceholder('0')
            .setMaxLength(2)
            .setStyle(1);

        const jail_days = new TextInputComponent()
            .setCustomId('jail_days')
            .setLabel('Days:')
            .setPlaceholder('0')
            .setMaxLength(2)
            .setStyle(1);

        const modal = new Modal()
            .setCustomId(`spamActionJail|${group_id}`)
            .setTitle('Jail senders?')
            .addComponents(
                new MessageActionRow().addComponents(jail_reason),
                new MessageActionRow().addComponents(jail_minutes),
                new MessageActionRow().addComponents(jail_hours),
                new MessageActionRow().addComponents(jail_days),
            );

        await interaction.showModal(modal);
	}
};