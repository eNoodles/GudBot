const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageActionRow, GuildMember, Client, CommandInteraction, MessageButton } = require('discord.js');
const utils = require('../utils.js');

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
     * @param {Client} client 
     * @param {CommandInteraction} interaction 
     */
	async execute(client, interaction) {
        /**@type {GuildMember} member being jailed */
        let member = interaction.options.getMember('user');

        const reason = `Jailed by ${interaction.user.tag}`;

        //no jailing admins
        if (utils.isAdmin(member) || !member.manageable) {  
            await interaction.reply({ content: 'https://media.discordapp.net/attachments/840211595186536478/889653037201760326/nochamp.gif', ephemeral: true });
            return;
        }

        const roles = member.roles.cache;
        const role_ids = []; //will be used in jail embed message

        try {
            //clear rolebank of member's previously saved roles (just in case)
            await client.rolebank.destroy({ where: { user_id: member.id } });

            //save member's roles in rolebank
            //dont save base @@everyone role and jailed role
            roles.filter(role => role.id !== utils.ids.guild && role.id !== utils.ids.jailed_role).forEach( async role => {
                await client.rolebank.create({
                    user_id: member.id,
                    role_id: role.id
                });

                role_ids.push( role.id );
            });

            //count prior offenses
            const prior_offenses = await client.jail_records.count({ where: { offender_id: member.id } });

            //save offender id, jailer id, reason in jail_records
            const jail_record = await client.jail_records.create({
                offender_id: member.id,
                jailer_id: interaction.user.id,
                reason: interaction.options.getString('reason'),
                jail_timestamp: new Date(),
                release_timestamp: null
            });

            //remove member's roles
            await member.roles.remove( roles, reason );

            //if all roles successfully removed, add jailed role
            await member.roles.add(utils.ids.jailed_role, reason);

            const unjail_button = new MessageButton()
                .setLabel('Unjail')
                .setStyle(utils.buttons.green)
                .setCustomId('test1');

            const timer_button = new MessageButton()
                .setLabel('Set timer')
                .setStyle(utils.buttons.blurple)
                .setCustomId('test3');
            
            const edit_button = new MessageButton()
                .setLabel('Edit')
                .setStyle(utils.buttons.gray)
                .setCustomId('test2');

            const del_button = new MessageButton()
                .setLabel('Delete record')
                .setStyle(utils.buttons.red)
                .setCustomId('test4')
                .setDisabled();

            //send full jail report to #criminal-records
            const channel = await client.channels.fetch( utils.ids.records_ch );
            const message = await channel.send({
                embeds: [utils.createJailEmbed(member, jail_record, role_ids, prior_offenses)],
                components: [new MessageActionRow().addComponents([unjail_button, timer_button, edit_button, del_button])]
            });

            //send interaction reply confirming success
            const embed = new MessageEmbed()
                .setDescription(`Jailed <@${member.id}>`)
                .setColor(utils.colors.green);
            
            const view_button = new MessageButton()
                .setLabel('View record')
                .setStyle(utils.buttons.link)
                .setURL(message.url);
                
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