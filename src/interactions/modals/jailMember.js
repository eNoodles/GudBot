const { MessageEmbed, MessageButton, MessageActionRow, ModalSubmitInteraction } = require('discord.js');
const utils = require('../../utils');

module.exports = {
    /**
     * @param {ModalSubmitInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const member = await interaction.guild.members.fetch(args[1]);
        const reason = interaction.fields.getTextInputValue('jail_reason');

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