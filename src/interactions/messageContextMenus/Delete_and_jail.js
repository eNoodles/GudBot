const { ContextMenuCommandBuilder } = require('@discordjs/builders');
const { MessageContextMenuInteraction, TextInputComponent, Modal, MessageActionRow, MessageEmbed, MessageButton } = require('discord.js');
const { PermissionFlagsBits } = require('discord-api-types/v10');
const { censored_authors_cache } = require('../../managers/censorManager');
const { getJailDataByMember, addDeletedMessage } = require('../../managers/jailManager');
const { createErrorEmbed, ids, colors, buttons, isAdmin } = require('../../utils');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Delete and jail')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setType(3),

    /**
     * @param {MessageContextMenuInteraction} interaction 
     */
    async execute(interaction) {
        const message = interaction.targetMessage;

        //delete message no matter what happens with the jailing process
        await message.delete();

        let member = message.member;

        //if user clicked on a webhook
        if (message.webhookId) {
            //first check cache
            const author_id = censored_authors_cache.get(message.id);

            if (author_id) {
                member = await interaction.guild.members.fetch(author_id);
            }
            //if webhook message is not in cache anymore, search for members with the same name
            else {
                const found_members = await interaction.guild.members.search({ query: message.author.username, limit: 100}); //idfk how limit works

                let embed_desc = 'This message was sent by a webhook, and data containing information about the original message author is no longer available.';
                if (found_members) {
                    embed_desc += '\n\n**Perhaps you would like to jail:**\n';

                    found_members.forEach(member => {
                        embed_desc += `<@${member.id}>\n`;
                    });
                }

                await interaction.reply({
                    embeds: [createErrorEmbed(embed_desc)], 
                    ephemeral: true
                });
    
                return;
            }
        }

        //member was not found
        //this means the message author either left the server, or it is a webhook message that could not be found in cache
        if (!member) {
            await interaction.reply({
                embeds: [createErrorEmbed(`Something has gone wrong, <@${message.author.id}> is not a member of this server.`)], 
                ephemeral: true
            });

            return;
        }

        //attach message to existing record if member is already jailed, otherwise continue with jailing procedure
        if (member.roles.cache.has(ids.jailed_role)) {
            const data = await getJailDataByMember(member);

            if (!data) {
                await interaction.reply({
                    embeds: [createErrorEmbed(`Something has gone wrong, <@${member.id}> has the <#${ids.jailed_role}> role, but a corresponding record was not found.`)], 
                    ephemeral: true
                });
                return;
            }

            await addDeletedMessage(data, message, interaction.user);

            //send interaction reply confirming success
            const embed = new MessageEmbed()
                .setDescription(`Deleted <@${member.id}>'s message.`)
                .setColor(colors.green);
            
            const view_button = new MessageButton()
                .setLabel('View record')
                .setStyle(buttons.link)
                .setURL(data.message.url);
                
            await interaction.reply({
                embeds: [embed],
                components: [new MessageActionRow().addComponents([view_button])],
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
            .setCustomId(`jailMember|${member.id}|${message.id}`)
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