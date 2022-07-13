const { MessageEmbed, ModalSubmitInteraction } = require('discord.js');
const { getMessageGroup } = require('../../managers/spamManager');
const { createErrorEmbed, getDurationSeconds, colors } = require('../../utils');

module.exports = {
    /**
     * @param {ModalSubmitInteraction} interaction 
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

        const minutes = parseInt(interaction.fields.getTextInputValue('jail_minutes'), 10) || 0;
        const hours = parseInt(interaction.fields.getTextInputValue('jail_hours'), 10) || 0;
        const days = parseInt(interaction.fields.getTextInputValue('jail_days'), 10) || 0;

        //this reason and duration will be used for all senders that get jailed
        group.jail.reason = interaction.fields.getTextInputValue('jail_reason');
        //duration will be checked in jailManager anyway so we dont have to do anything special here
        group.jail.duration = getDurationSeconds(minutes, hours, days);
        
        group.jail.active = true;
        group.jail.user_id = interaction.user.id;
        
        await group.update();

        const embed = new MessageEmbed()
            .setTitle('"Jail" action taken')
            .setDescription('All current and future senders corresponding to this group will be jailed.')
            .setColor(colors.green);

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
	}
};