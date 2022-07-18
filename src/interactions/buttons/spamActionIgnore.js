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