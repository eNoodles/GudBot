const { ButtonInteraction, TextInputComponent, MessageActionRow, Modal, MessageEmbed } = require('discord.js');
const { getMessageGroupById } = require('../../managers/spamManager');
const { createErrorEmbed, colors } = require('../../utils');

module.exports = {
    /**
     * @param {ButtonInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const group_id = args[1];
        const group = getMessageGroupById(group_id);

        if (!group) {
            await interaction.reply({
                embeds: [createErrorEmbed(`Message Group \`#${group_id}\` has expired.`)],
                ephemeral: true
            });

            return;
        }

        if (group.ignore_action.active) {
            const embed = new MessageEmbed()
                .setTitle('Cannot override Ignore action')
                .setDescription(`<@${group.ignore_action.user_id}> has activated the Ignore action for this Message Group.`)
                .setColor(colors.gray);

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

            return;
        }

        if (group.jail_action.user_id) {
            const embed = new MessageEmbed()
                .setTitle('Action already taken')
                .setDescription(`<@${group.jail_action.user_id}> has already activated the Jail action for this Message Group.`)
                .setColor(colors.green);

            await interaction.reply({
                embeds: [embed],
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