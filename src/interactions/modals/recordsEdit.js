const { MessageEmbed, ModalSubmitInteraction } = require('discord.js');
const { getJailDataByRecord } = require('../../managers/jailManager');
const { createErrorEmbed, colors } = require('../../utils');

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

        const reason = interaction.fields.getTextInputValue('jail_reason');

        await data.updateReason(reason);

        //send notification in #criminal-records
        const embed = new MessageEmbed()
            .setDescription(`<@${interaction.user.id}> updated reason for jailing <@${data.member.id}>`)
            .setColor(colors.gray);

        await interaction.reply({
            embeds: [embed]
        });
	}
};