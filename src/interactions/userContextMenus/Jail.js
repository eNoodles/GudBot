const { ContextMenuCommandBuilder } = require('@discordjs/builders');
const { UserContextMenuInteraction, TextInputComponent, Modal, MessageActionRow } = require('discord.js');
const utils = require('../../utils');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Jail')
        .setType(2),

    /**
     * @param {UserContextMenuInteraction} interaction 
     */
    async execute(interaction) {
        const member = interaction.options.getMember('user');

        try {
            const jail_reason = new TextInputComponent()
                .setCustomId('jail_reason')
                .setLabel('Reason for jailing:')
                .setPlaceholder('[Optional]')
                .setStyle(utils.textinput.long);

            const modal = new Modal()
                .setCustomId(`jailMember|${member.id}`)
                .setTitle(`Jail ${member.displayName}?`)
                .addComponents(new MessageActionRow().addComponents([jail_reason]));

            await interaction.showModal(modal);
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