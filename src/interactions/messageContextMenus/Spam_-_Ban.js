const { ContextMenuCommandBuilder } = require('@discordjs/builders');
const { MessageContextMenuInteraction, Modal, TextInputComponent, MessageActionRow } = require('discord.js');
const { PermissionFlagsBits } = require('discord-api-types/v10');
const { createErrorEmbed } = require('../../utils');
const { getMessageGroupById, getMessageGroupByContent } = require('../../managers/spamManager');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Spam - Ban')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setType(3),

    /**
     * @param {MessageContextMenuInteraction} interaction 
     */
    async execute(interaction) {
        const message = interaction.targetMessage;
        const group = getMessageGroupById(message.id) ?? getMessageGroupByContent(message.content);

        if (!group) {
            await interaction.reply({
                embeds: [createErrorEmbed(`Message Group not found, it has most likely expired.`)],
                ephemeral: true
            });

            return;
        }

        const ban_reason = new TextInputComponent()
            .setCustomId('ban_reason')
            .setLabel('Reason for ban:')
            .setValue('Spam')
            .setMaxLength(512)
            .setMinLength(3)
            .setStyle(2);

        const ban_days = new TextInputComponent()
            .setCustomId('ban_days')
            .setLabel('Clear message history:')
            .setPlaceholder('For [0-7] days')
            .setMaxLength(2)
            .setStyle(1);

        const modal = new Modal()
            .setCustomId(`spamActionBan|${group.id}`)
            .setTitle('Ban senders?')
            .addComponents(
                new MessageActionRow().addComponents(ban_reason),
                new MessageActionRow().addComponents(ban_days)
            );

        await interaction.showModal(modal);
    }
};