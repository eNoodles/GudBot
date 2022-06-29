const { MessageActionRow, Modal, ButtonInteraction, TextInputComponent } = require('discord.js');
const { getJailData } = require('../../managers/jail_manager');

module.exports = {
    /**
     * @param {ButtonInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const record_id = args[1];
        const data = await getJailData(interaction.guild, record_id);
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