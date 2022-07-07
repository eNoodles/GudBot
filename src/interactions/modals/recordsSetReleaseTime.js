const { MessageEmbed, ModalSubmitInteraction } = require('discord.js');
const { getJailDataByRecord, updateDuration } = require('../../managers/jailManager');
const { createErrorEmbed, getDurationSeconds, colors } = require('../../utils');

module.exports = {
    /**
     * @param {ModalSubmitInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const record_id = args[1];
        const data = await getJailDataByRecord(record_id, interaction.guild);
        
        if (!data) {
            interaction.reply({
                embeds: [createErrorEmbed(`Jail record \`#${record_id}\` not found.`)],
                ephemeral: true
            });

            return;
        }

        const minutes = parseInt(interaction.fields.getTextInputValue('jail_minutes'), 10) || 0;
        const hours = parseInt(interaction.fields.getTextInputValue('jail_hours'), 10) || 0;
        const days = parseInt(interaction.fields.getTextInputValue('jail_days'), 10) || 0;

        const duration = getDurationSeconds(minutes, hours, days);

        if (duration) {

            await updateDuration(data, duration, interaction.user);

            //send interaction reply confirming success
            const embed = new MessageEmbed()
                .setDescription(`Updated release time of <@${data.member.id}>`)
                .setColor(colors.green);

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }
        else {
            await interaction.reply({
                embeds: [createErrorEmbed('Please enter a valid duration.')],
                ephemeral: true
            });
        }
	}
};