const { PermissionFlagsBits, ButtonStyle } = require('discord-api-types/v10');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, CommandInteraction, MessageActionRow, MessageButton } = require('discord.js');
const { getJailDataByMember } = require('../../managers/jailManager');
const { createErrorEmbed, colors, generateIntegerChoices, ids, getDurationSeconds, getCachedChannel } = require('../../utils');

module.exports = {
    data: new SlashCommandBuilder()
		.setName('unjail')
		.setDescription('Unjail user and restore their roles OR set release time.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addUserOption(option => option
            .setName('user')
            .setDescription('Server member to unjail.')
            .setRequired(true)
        )
        .addIntegerOption(option => option
            .setName('minutes')
            .setDescription('Release from jail in X minutes.')
            .setMinValue(1)
            .setMaxValue(60)
        )
        .addIntegerOption(option => option
            .setName('hours')
            .setDescription('Release from jail in X hours.')
            .setMinValue(1)
            .setMaxValue(24)
            .setChoices( ...generateIntegerChoices(1, 24) )
        )
        .addIntegerOption(option => option
            .setName('days')
            .setDescription('Release from jail in X days.')
            .setMinValue(1)
            .setMaxValue(24)
            .setChoices( ...generateIntegerChoices(1, 24) )
        ),
    /**
     * @param {CommandInteraction} interaction 
     */
	async execute(interaction) {
        const { options } = interaction;
        const member = options.getMember('user');

        //make sure member is currently jailed
        if (!member.roles.cache.has(ids.roles.jailed)) {
            await interaction.reply({
                embeds: [createErrorEmbed(`<@${member.id}> is not currently jailed.`)],
                ephemeral: true
            });

            return;
        }

        //fetch JailData for member
        const data = await getJailDataByMember(member);
        if (!data) {
            await interaction.reply({
                embeds: [createErrorEmbed(`Something has gone wrong, <@${member.id}> has the <#${ids.roles.jailed}> role, but a corresponding record was not found.`)],
                ephemeral: true
            });

            return;
        }

        const minutes = options.getInteger('minutes') || 0;
        const hours = options.getInteger('hours') || 0;
        const days = options.getInteger('days') || 0;

        const duration = getDurationSeconds(minutes, hours, days);

        //if valid duration given, update release time
        if (duration > 0) {

            await data.updateDuration(duration);

            //send notification in #criminal-records
            const embed = new MessageEmbed()
                .setDescription(`<@${interaction.user.id}> updated release time of <@${member.id}>`)
                .setColor(colors.gray);

            const notify = getCachedChannel(ids.channels.records).send({
                reply: {
                    messageReference: data.message,
                    failIfNotExists: false
                },
                embeds: [embed]
            });

            //send interaction reply confirming success
            const reply_embed = new MessageEmbed()
                .setDescription(`Updated release time of <@${member.id}>`)
                .setColor(colors.gray);
            
            const view_button = new MessageButton()
                .setLabel('View record')
                .setStyle(ButtonStyle.Link)
                .setURL(data.message.url);
                
            const send_reply = interaction.reply({
                embeds: [reply_embed],
                components: [new MessageActionRow().addComponents([view_button])],
                ephemeral: true
            });

            await Promise.allSettled([notify, send_reply]);
        }
        //otherwise, instantly unjail
        else {
            await data.unjailMember(interaction.user);

            //send notification in #criminal-records
            const embed = new MessageEmbed()
                .setDescription(`<@${interaction.user.id}> unjailed <@${member.id}>`)
                .setColor(colors.green);

            const notify = getCachedChannel(ids.channels.records).send({
                reply: {
                    messageReference: data.message,
                    failIfNotExists: false
                },
                embeds: [embed]
            });

            //send interaction reply confirming success
            const reply_embed = new MessageEmbed()
                .setDescription(`Unjailed <@${member.id}>`)
                .setColor(colors.green);
            
            const view_button = new MessageButton()
                .setLabel('View record')
                .setStyle(ButtonStyle.Link)
                .setURL(data.message.url);
                
            const send_reply =  interaction.reply({
                embeds: [reply_embed],
                components: [new MessageActionRow().addComponents([view_button])],
                ephemeral: true
            });

            await Promise.allSettled([notify, send_reply]);
        }
	}
};