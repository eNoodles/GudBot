const { ButtonStyle } = require('discord-api-types/v10');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction, MessageButton, MessageActionRow, MessageEmbed } = require('discord.js');
const { colors } = require('../../utils');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('send')
        .setDescription('test')
        .setDefaultMemberPermissions(0) //admin only
        .addStringOption(option => option
            .setName('text')
            .setDescription('Message content to be sent')
            .setRequired(true)),
    /**
     * @param {CommandInteraction} interaction 
     */
	async execute(interaction) {
        const { options } = interaction;
        const message = await interaction.channel.send({ content: options.getString('text') });

        const embed = new MessageEmbed()
            .setDescription('Message sent')
            .setColor(colors.green);
        
        const edit_button = new MessageButton()
            .setLabel('Edit')
            .setStyle(ButtonStyle.Secondary)
            .setCustomId(`editSentMessage|${message.id}`);

        await interaction.reply({
            embeds: [embed],
            components: [new MessageActionRow().addComponents([edit_button])],
            ephemeral: true
        });
	}
};