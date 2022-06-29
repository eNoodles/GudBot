const { MessageEmbed, ButtonInteraction } = require('discord.js');
const { getJailData, unjailMember } = require('../../managers/jail_manager');
const utils = require('../../utils');

module.exports = {
    /**
     * @param {ButtonInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const record_id = args[1];
        const data = await getJailData(interaction.guild, record_id);
        const { member } = data;

        //await to catch exceptions
        await unjailMember(data, interaction.user);

        //send interaction reply confirming success
        const embed = new MessageEmbed()
            .setDescription(`Unjailed <@${member.id}>`)
            .setColor(utils.colors.green);

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
	}
};