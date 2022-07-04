const { MessageEmbed, MessageButton, MessageActionRow, ModalSubmitInteraction } = require('discord.js');
const { jailMember } = require('../../managers/jail_manager');
const utils = require('../../utils');

module.exports = {
    /**
     * @param {ModalSubmitInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const member = await interaction.guild.members.fetch(args[1]);

        //no jail overrides
        if (member.roles.cache.has(utils.ids.jailed_role)) {
            await interaction.reply({
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

        const reason = interaction.fields.getTextInputValue('jail_reason');

        const minutes = parseInt(interaction.fields.getTextInputValue('jail_minutes'), 10) || 0;
        const hours = parseInt(interaction.fields.getTextInputValue('jail_hours'), 10) || 0;
        const days = parseInt(interaction.fields.getTextInputValue('jail_days'), 10) || 0;

        const duration = utils.getDurationSeconds(minutes, hours, days);

        //jail member and get url of #criminal-records message
        //arg[2] is message id
        const jail_message_url = await jailMember(member, interaction.user, reason, duration, args[2] ?? null);

        //send interaction reply confirming success
        const embed = new MessageEmbed()
            .setDescription(`Deleted message and jailed <@${member.id}>`)
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