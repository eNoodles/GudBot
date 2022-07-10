const { ContextMenuCommandBuilder } = require('@discordjs/builders');
const { UserContextMenuInteraction, MessageActionRow, MessageEmbed, MessageButton } = require('discord.js');
const { PermissionFlagsBits, ButtonStyle } = require('discord-api-types/v10');
const { createErrorEmbed, ids, colors } = require('../../utils');
const { unjailMember, getRecordsChannel, getJailDataByMember } = require('../../managers/jailManager');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Unjail')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setType(2),

    /**
     * @param {UserContextMenuInteraction} interaction 
     */
    async execute(interaction) {
        const member = interaction.targetMember;
        //make sure member is currently jailed
        if (!member.roles.cache.has(ids.jailed_role)) {
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
                embeds: [createErrorEmbed(`Something has gone wrong, <@${member.id}> has the <#${ids.jailed_role}> role, but a corresponding record was not found.`)],
                ephemeral: true
            });

            return;
        }

        await unjailMember(data, interaction.user);

        //send notification in #criminal-records
        const embed = new MessageEmbed()
            .setDescription(`<@${interaction.user.id}> unjailed <@${member.id}>`)
            .setColor(colors.green);

        await getRecordsChannel().send({
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
            
        await interaction.reply({
            embeds: [reply_embed],
            components: [new MessageActionRow().addComponents([view_button])],
            ephemeral: true
        });
    }
};