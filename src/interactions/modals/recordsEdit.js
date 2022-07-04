const { MessageEmbed, ModalSubmitInteraction } = require('discord.js');
const { getJailDataByRecord, updateReason } = require('../../managers/jail_manager');
const utils = require('../../utils');

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
                embeds: [utils.createErrorEmbed(`Jail record \`#${record_id}\` not found.`)],
                ephemeral: true
            });

            return;
        }

        const reason = interaction.fields.getTextInputValue('jail_reason');

        await updateReason(data, reason, interaction.user);

        //send interaction reply confirming success
        const embed = new MessageEmbed()
            .setDescription(`Updated reason for jailing <@${data.member.id}>`)
            .setColor(utils.colors.green);

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
	}
};