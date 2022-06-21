const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageActionRow, CommandInteraction, MessageButton } = require('discord.js');
const utils = require('../../utils');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('jail')
		.setDescription('Jail user and strip them of their roles.')
        .addUserOption(option => option
            .setName('user')
            .setDescription('Server member to jail.')
            .setRequired(true))
        .addStringOption(option => option
            .setName('reason')
            .setDescription('Reason for jailing.')),
    /**
     * @param {CommandInteraction} interaction 
     */
	async execute(interaction) {
        const member = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason');

        //no jailing admins
        if (utils.isAdmin(member) || !member.manageable) {  
            await interaction.reply({ content: 'https://media.discordapp.net/attachments/840211595186536478/889653037201760326/nochamp.gif', ephemeral: true });
            return;
        }

        try {
            const jail_message = await utils.jailMember(member, interaction.user, reason);
            const channel = await interaction.client.channels.fetch(utils.ids.records_ch);
            const sent = await channel.send(jail_message);

            //send interaction reply confirming success
            const embed = new MessageEmbed()
                .setDescription(`Jailed <@${member.id}>`)
                .setColor(utils.colors.green);
            
            const view_button = new MessageButton()
                .setLabel('View record')
                .setStyle(utils.buttons.link)
                .setURL(sent.url);
                
            await interaction.reply({
                embeds: [embed],
                components: [new MessageActionRow().addComponents([view_button])],
                ephemeral: true
            });
        }
        catch (e) {
            console.error(e);

            interaction.reply({
                embeds: [utils.createErrorEmbed(`Something has gone wrong, failed to jail <@${member.id}>`)], 
                ephemeral: true
            });
        }
	}
};