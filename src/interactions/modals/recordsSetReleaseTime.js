const { MessageEmbed, ModalSubmitInteraction } = require('discord.js');
const { getJailData, updateDuration } = require('../../managers/jail_manager');
const utils = require('../../utils');

module.exports = {
    /**
     * @param {ModalSubmitInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const record_id = args[1];
        const data = await getJailData(interaction.guild, record_id);
        const { member } = data;

        const minutes = parseInt(interaction.fields.getTextInputValue('jail_minutes'), 10) || 0;
        const hours = parseInt(interaction.fields.getTextInputValue('jail_hours'), 10) || 0;
        const days = parseInt(interaction.fields.getTextInputValue('jail_days'), 10) || 0;

        const duration = utils.getDurationSeconds(minutes, hours, days);

        if (duration) {
            //await to catch exceptions
            await updateDuration(data, duration, interaction.user);

            //send interaction reply confirming success
            const embed = new MessageEmbed()
                .setDescription(`Updated release time of <@${member.id}>`)
                .setColor(utils.colors.green);

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }
        else {
            await interaction.reply({
                embeds: [utils.createErrorEmbed('Please enter a valid duration.')],
                ephemeral: true
            });
        }
	}
};