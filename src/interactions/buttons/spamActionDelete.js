const { ButtonInteraction, MessageEmbed } = require('discord.js');
const { getMessageGroup } = require('../../managers/spamManager');
const { createErrorEmbed, colors } = require('../../utils');

module.exports = {
    /**
     * @param {ButtonInteraction} interaction 
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

        group.delete.active = true;
        group.delete.user_id = interaction.user.id;
        await group.update();

        const embed = new MessageEmbed()
            .setTitle('"Delete" action taken')
            .setDescription('All current and future messages corresponding to this group will be deleted.')
            .setColor(colors.red);

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
	}
};