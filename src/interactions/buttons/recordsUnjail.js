const { MessageEmbed, ButtonInteraction } = require('discord.js');
const { getJailDataByRecord, unjailMember } = require('../../managers/jailManager');
const { createErrorEmbed, colors } = require('../../utils');

module.exports = {
    /**
     * @param {ButtonInteraction} interaction 
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

        await unjailMember(data, interaction.user);

        //send interaction reply confirming success
        const embed = new MessageEmbed()
            .setDescription(`Unjailed <@${data.member.id}>`)
            .setColor(colors.green);

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
	}
};