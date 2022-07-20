const { MessageEmbed, ModalSubmitInteraction } = require('discord.js');
const { getMessageGroupById } = require('../../managers/spamManager');
const { createErrorEmbed, getDurationSeconds, colors } = require('../../utils');

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
        
        //configure action
        group.jail_action.active = true;
        group.jail_action.user_id = interaction.user.id;

        //this reason and duration will be used for all senders that get jailed
        group.jail_action.reason = interaction.fields.getTextInputValue('jail_reason');

        const minutes = parseInt(interaction.fields.getTextInputValue('jail_minutes'), 10) || 0;
        const hours = parseInt(interaction.fields.getTextInputValue('jail_hours'), 10) || 0;
        const days = parseInt(interaction.fields.getTextInputValue('jail_days'), 10) || 0;
        //duration will be checked in jailManager anyway so we dont have to do anything special here
        group.jail_action.duration = getDurationSeconds(minutes, hours, days);
        
        //update embed and take action
        await group.handleSpam();

        const embed = new MessageEmbed()
            .setTitle('Jail action taken')
            .setDescription(group.active ? 
                'All current and future senders corresponding to this group will be jailed.' :
                'All senders corresponding to this group have been jailed.'
            )
            .setColor(colors.green);

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
	}
};