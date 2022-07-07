const { MessageActionRow, Modal, ButtonInteraction, TextInputComponent } = require('discord.js');
const { getJailDataByRecord } = require('../../managers/jailManager');
const { createErrorEmbed } = require('../../utils');

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

        const jail_minutes = new TextInputComponent()
            .setCustomId('jail_minutes')
            .setLabel('Minutes:')
            .setPlaceholder('0')
            .setMaxLength(2)
            .setStyle(1);

        const jail_hours = new TextInputComponent()
            .setCustomId('jail_hours')
            .setLabel('Hours:')
            .setPlaceholder('0')
            .setMaxLength(2)
            .setStyle(1);

        const jail_days = new TextInputComponent()
            .setCustomId('jail_days')
            .setLabel('Days:')
            .setPlaceholder('0')
            .setMaxLength(2)
            .setStyle(1);

        const modal = new Modal()
            .setCustomId(`recordsSetReleaseTime|${record_id}`)
            .setTitle(`Unjail ${data.member.displayName} in...`)
            .addComponents(
                new MessageActionRow().addComponents(jail_minutes),
                new MessageActionRow().addComponents(jail_hours),
                new MessageActionRow().addComponents(jail_days),
            );

        await interaction.showModal(modal);
	}
};