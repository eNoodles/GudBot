const { ContextMenuCommandBuilder } = require('@discordjs/builders');
const { MessageContextMenuInteraction, MessageEmbed } = require('discord.js');
const { PermissionFlagsBits } = require('discord-api-types/v10');
const { createErrorEmbed, colors } = require('../../utils');
const { getMessageGroupById, getMessageGroupByContent } = require('../../managers/spamManager');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Spam - Delete')
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

        if (group.delete_action.user_id) {
            const embed = new MessageEmbed()
                .setTitle('Action already taken')
                .setDescription(`<@${group.delete_action.user_id}> has already activated the Delete action for this Message Group.`)
                .setColor(colors.red);

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

            return;
        }

        //configure action
        group.delete_action.active = true;
        group.delete_action.user_id = interaction.user.id;

        //update embed and take action
        await group.handleSpam();

        const embed = new MessageEmbed()
            .setTitle('Delete action taken')
            .setDescription(
                group.active ? 
                    'All current and future messages corresponding to this group will be deleted.' :
                    'All messages corresponding to this group have been deleted.'
            )
            .setColor(colors.red);

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
};