const { ButtonInteraction, MessageEmbed } = require('discord.js');
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