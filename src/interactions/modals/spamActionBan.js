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

        const days = parseInt(interaction.fields.getTextInputValue('ban_days'), 10) || 0;

        //this reason and days will be used for all senders that get jailed
        group.ban.reason = interaction.fields.getTextInputValue('ban_reason');
        //clamp days to [0-7]
        group.ban.days = Math.min(Math.max(days, 0), 7);
        group.ban.active = true;
        group.ban.user_id = interaction.user.id;
        
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