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
        const data = await getJailDataByRecord(record_id);
        
        if (!data) {
            await interaction.reply({
                embeds: [createErrorEmbed(`Jail record \`#${record_id}\` not found.`)],
                ephemeral: true
            });

            return;
        }

        //get jail duration minutes, hours, days (if text input value wasn't given, default to 0)
        const minutes = parseInt(interaction.fields.getTextInputValue('jail_minutes'), 10) || 0;
        const hours = parseInt(interaction.fields.getTextInputValue('jail_hours'), 10) || 0;
        const days = parseInt(interaction.fields.getTextInputValue('jail_days'), 10) || 0;

        const duration = getDurationSeconds(minutes, hours, days);

        //release time must be after jail time/current time
        if (duration > 0) {

            await updateDuration(data, duration);

            //send notification in #criminal-records
            const embed = new MessageEmbed()
                .setDescription(`<@${interaction.user.id}> updated release time of <@${data.member.id}>`)
                .setColor(colors.gray);

            await interaction.reply({
                embeds: [embed]
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