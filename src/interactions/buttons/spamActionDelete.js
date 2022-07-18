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

        group.delete.active = true;
        group.delete.user_id = interaction.user.id;
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