const { MessageActionRow, Modal, ButtonInteraction, TextInputComponent } = require('discord.js');
const utils = require('../../utils');

module.exports = {
    /**
     * @param {ButtonInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const message_id = args[1];

        const channel = await interaction.channel.fetch();
        const message = await channel.messages.fetch(message_id);

        const new_content = new TextInputComponent()
            .setCustomId('new_content')
            .setLabel('New message content:')
            .setValue(message.content)
            .setMinLength(1)
            .setStyle(2);

        const modal = new Modal()
            .setCustomId(`editSentMessage|${message_id}`)
            .setTitle('Edit sent message')
            .addComponents(new MessageActionRow().addComponents([new_content]));

        await interaction.showModal(modal);
	}
};