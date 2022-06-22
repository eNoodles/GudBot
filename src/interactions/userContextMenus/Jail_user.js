const { ContextMenuCommandBuilder } = require('@discordjs/builders');
const { UserContextMenuInteraction, TextInputComponent, Modal, MessageActionRow } = require('discord.js');
const utils = require('../../utils');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Jail user')
        .setType(2),

    /**
     * @param {UserContextMenuInteraction} interaction 
     */
    async execute(interaction) {
        const member = interaction.options.getMember('user');

        const jail_reason = new TextInputComponent()
            .setCustomId('jail_reason')
            .setLabel('Reason for jailing:')
            .setPlaceholder('[Optional]')
            .setMaxLength(512)
            .setStyle(utils.textinput.long);

        const jail_minutes = new TextInputComponent()
            .setCustomId('jail_minutes')
            .setLabel('Minutes:')
            .setPlaceholder('0')
            .setMaxLength(2)
            .setStyle(utils.textinput.short);

        const jail_hours = new TextInputComponent()
            .setCustomId('jail_hours')
            .setLabel('Hours:')
            .setPlaceholder('0')
            .setMaxLength(2)
            .setStyle(utils.textinput.short);

        const jail_days = new TextInputComponent()
            .setCustomId('jail_days')
            .setLabel('Days:')
            .setPlaceholder('0')
            .setMaxLength(2)
            .setStyle(utils.textinput.short);

        const modal = new Modal()
            .setCustomId(`jailMember|${member.id}`)
            .setTitle(`Jail ${member.displayName}?`)
            .addComponents(
                new MessageActionRow().addComponents(jail_reason),
                new MessageActionRow().addComponents(jail_minutes),
                new MessageActionRow().addComponents(jail_hours),
                new MessageActionRow().addComponents(jail_days),
            );

        await interaction.showModal(modal).catch(e => {
            console.error(e);

            interaction.reply({
                embeds: [utils.createErrorEmbed(`Something has gone wrong, failed to jail <@${member.id}>`)], 
                ephemeral: true
            });
        });
    }
};