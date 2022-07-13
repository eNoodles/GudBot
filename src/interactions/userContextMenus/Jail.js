const { ContextMenuCommandBuilder } = require('@discordjs/builders');
const { UserContextMenuInteraction, TextInputComponent, Modal, MessageActionRow } = require('discord.js');
const { PermissionFlagsBits } = require('discord-api-types/v10');
const { createErrorEmbed, isAdmin, ids } = require('../../utils');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Jail')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setType(2),

    /**
     * @param {UserContextMenuInteraction} interaction 
     */
    async execute(interaction) {
        const member = interaction.targetMember;

        //no jail overrides
        if (member.roles.cache.has(ids.roles.jailed)) {
            await interaction.reply({
                embeds: [createErrorEmbed(`<@${member.id}> is already jailed.`)], 
                ephemeral: true
            });
            return;
        }

        //no jailing admins
        if (!member.manageable || isAdmin(member)) {  
            await interaction.reply({ content: 'https://media.discordapp.net/attachments/840211595186536478/889653037201760326/nochamp.gif', ephemeral: true });
            return;
        }

        const jail_reason = new TextInputComponent()
            .setCustomId('jail_reason')
            .setLabel('Reason for jailing:')
            .setPlaceholder('[Optional]')
            .setMaxLength(512)
            .setStyle(2);

        const jail_minutes = new TextInputComponent()
            .setCustomId('jail_minutes')
            .setLabel('Minutes:')
            .setPlaceholder('0')
            .setMaxLength(2)
            .setStyle(1);

        const jail_hours = new TextInputComponent()
            .setCustomId('jail_hours')
            .setLabel('Hours:')
            .setPlaceholder('0')
            .setMaxLength(2)
            .setStyle(1);

        const jail_days = new TextInputComponent()
            .setCustomId('jail_days')
            .setLabel('Days:')
            .setPlaceholder('0')
            .setMaxLength(2)
            .setStyle(1);

        const modal = new Modal()
            .setCustomId(`jailMember|${member.id}`)
            .setTitle(`Jail ${member.displayName}?`)
            .addComponents(
                new MessageActionRow().addComponents(jail_reason),
                new MessageActionRow().addComponents(jail_minutes),
                new MessageActionRow().addComponents(jail_hours),
                new MessageActionRow().addComponents(jail_days),
            );

        await interaction.showModal(modal);
    }
};