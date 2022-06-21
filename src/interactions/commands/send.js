const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction, MessageButton, MessageActionRow } = require('discord.js');
const utils = require('../../utils');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('send')
        .setDescription('test')
        .addStringOption(option => option
            .setName('text')
            .setDescription('Message content to be sent')
            .setRequired(true)),
    /**
     * @param {CommandInteraction} interaction 
     */
	async execute(interaction) {
        const message = await interaction.channel.send({ content: interaction.options.getString('text') });

        const edit_button = new MessageButton()
            .setLabel('Edit')
            .setStyle(utils.buttons.gray)
            .setCustomId(`editSentMessage|${message.id}`);

        await interaction.reply({
            content: 'Message sent',
            components: [new MessageActionRow().addComponents([edit_button])],
            ephemeral: true
        });
	}
};