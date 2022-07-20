const { MessageEmbed, ModalSubmitInteraction } = require('discord.js');
const { getMessageGroupById } = require('../../managers/spamManager');
const { createErrorEmbed, colors } = require('../../utils');

module.exports = {
    /**
     * @param {ModalSubmitInteraction} interaction 
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

        if (group.ban_action.user_id) {
            const embed = new MessageEmbed()
                .setTitle('Action already taken')
                .setDescription(`<@${group.ban_action.user_id}> has already activated the Ban action for this Message Group.`)
                .setColor(colors.black);

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

            return;
        }
        
        //configure action
        group.ban_action.active = true;
        group.ban_action.user_id = interaction.user.id;

        //this reason and days will be used for all senders that get jailed
        group.ban_action.reason = interaction.fields.getTextInputValue('ban_reason');

        const days = parseInt(interaction.fields.getTextInputValue('ban_days'), 10) || 0;
        //clamp days to [0-7]
        group.ban_action.days = Math.min(Math.max(days, 0), 7);
        
        //update embed and take action
        await group.handleSpam();

        const embed = new MessageEmbed()
            .setTitle('Ban action taken')
            .setDescription(group.active ? 
                'All current and future senders corresponding to this group will be banned.' :
                'All senders corresponding to this group have been banned.'
            )
            .setColor(colors.black);

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
	}
};