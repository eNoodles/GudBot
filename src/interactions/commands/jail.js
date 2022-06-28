const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageActionRow, CommandInteraction, MessageButton } = require('discord.js');
const { PermissionFlagsBits } = require('discord-api-types/v10');
const { jailMember } = require('../../managers/jail_manager');
const utils = require('../../utils');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('jail')
		.setDescription('Jail user and strip them of their roles.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addUserOption(option => option
            .setName('user')
            .setDescription('Server member to jail.')
            .setRequired(true)
        )
        .addStringOption(option => option
            .setName('reason')
            .setDescription('Reason for jailing.')
        )
        .addIntegerOption(option => option
            .setName('minutes')
            .setDescription('Minutes of jailtime before release.')
            .setMinValue(1)
            .setMaxValue(60)
        )
        .addIntegerOption(option => option
            .setName('hours')
            .setDescription('Hours of jailtime before release.')
            .setMinValue(1)
            .setMaxValue(24)
            .setChoices( ...utils.generateIntegerChoices(1, 24) )
        )
        .addIntegerOption(option => option
            .setName('days')
            .setDescription('Days of jailtime before release.')
            .setMinValue(1)
            .setMaxValue(24)
            .setChoices( ...utils.generateIntegerChoices(1, 24) )
        ),

    /**
     * @param {CommandInteraction} interaction 
     */
	async execute(interaction) {
        const member = interaction.options.getMember('user');

        //no jail overrides
        if (member.roles.cache.has(utils.ids.jailed_role)) {
            interaction.reply({
                embeds: [utils.createErrorEmbed(`<@${member.id}> is already jailed.`)], 
                ephemeral: true
            });
            return;
        }

        //no jailing admins
        if (!member.manageable || utils.isAdmin(member)) {  
            await interaction.reply({ content: 'https://media.discordapp.net/attachments/840211595186536478/889653037201760326/nochamp.gif', ephemeral: true });
            return;
        }

        const reason = interaction.options.getString('reason');
        
        const minutes = interaction.options.getInteger('minutes') || 0;
        const hours = interaction.options.getInteger('hours') || 0;
        const days = interaction.options.getInteger('days') || 0;

        const duration = utils.getDurationSeconds(minutes, hours, days);

        const jail_message_url = await jailMember(member, interaction.user, reason, duration);

        //send interaction reply confirming success
        const embed = new MessageEmbed()
            .setDescription(`Jailed <@${member.id}>`)
            .setColor(utils.colors.green);
        
        const view_button = new MessageButton()
            .setLabel('View record')
            .setStyle(utils.buttons.link)
            .setURL(jail_message_url);
            
        await interaction.reply({
            embeds: [embed],
            components: [new MessageActionRow().addComponents([view_button])],
            ephemeral: true
        });
	}
};