const { ContextMenuCommandBuilder } = require('@discordjs/builders');
const { MessageContextMenuInteraction, MessageEmbed } = require('discord.js');
const { PermissionFlagsBits } = require('discord-api-types/v10');
const { createErrorEmbed, colors } = require('../../utils');
const { getMessageGroupById, getMessageGroupByContent } = require('../../managers/spamManager');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Spam - Ignore')
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

        group.ignore.active = true;
        group.ignore.user_id = interaction.user.id;
        await group.handleSpam();

        const embed = new MessageEmbed()
            .setTitle('Ignore action taken')
            .setDescription('All previous and subsequent spam actions will be disregarded. No deleting, no jailing, no banning. Do note, however, that this does not reverse actions that have already taken effect.')
            .setColor(colors.gray);

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
};