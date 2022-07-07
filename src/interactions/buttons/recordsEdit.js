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

        const { record, member } = data;

        let jail_reason = new TextInputComponent()
            .setCustomId('jail_reason')
            .setLabel('Updated reason:')
            .setMaxLength(512)
            .setStyle(2);

        if (record.reason) {
            jail_reason.setValue(record.reason);
        }
        else {
            jail_reason.setPlaceholder('Not given.');
        }

        const modal = new Modal()
            .setCustomId(`recordsEdit|${record_id}`)
            .setTitle(`Edit reason for jailing ${member.displayName}`)
            .addComponents(new MessageActionRow().addComponents([jail_reason]));

        await interaction.showModal(modal);
	}
};