const { MessageEmbed, ModalSubmitInteraction } = require('discord.js');
const { getJailData, updateReason } = require('../../managers/jail_manager');
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

        const reason = interaction.fields.getTextInputValue('jail_reason');

        //await to catch exceptions
        await updateReason(data, reason, interaction.user);

        //send interaction reply confirming success
        const embed = new MessageEmbed()
            .setDescription(`Updated reason for jailing <@${member.id}>`)
            .setColor(utils.colors.green);

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
	}
};