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
        const data = await getJailDataByRecord(record_id);

        if (!data) {
            await interaction.reply({
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

        //if reason existed, we set it as the value so it was easier for the user to edit it
        if (record.reason) {
            jail_reason.setValue(record.reason);
        }
        //otherwise set a placeholder, since we don't want to annoy the user with placeholder text that has to be deleted
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