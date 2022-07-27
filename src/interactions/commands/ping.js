const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits } = require('discord-api-types/v10');
const { CommandInteraction, MessageEmbed } = require('discord.js');
const { fetchPingData } = require('../../managers/pingManager');
const { colors, getUnixTimestamp } = require('../../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Ping a role.')
        .addRoleOption(option => option
            .setName('role')
            .setDescription('Which role to ping')
            .setRequired(true)
        ),

    /**
     * @param {CommandInteraction} interaction 
     */
    async execute(interaction) {
        const { options, channelId, member, commandId } = interaction;
        const role = options.getRole('role', true);
        const data = await fetchPingData(role);

        //users with this permission may ping any role, any time
        if (member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
            //update last ping time if data exists, otherwise it doesnt matter since the cooldown would be none by default
            if (data) data.last_ping = getUnixTimestamp();
            //defer reply, then instantly delete it and send a normal message that pings the role
            //do this because interaction replies are webhook and use @everyone perms, meaning they cant mention everyone even if the bot itself can
            //it is unnecessary to await any of this
            interaction
                .deferReply()
                .then(() => {
                    interaction
                        .deleteReply()
                        .catch(console.error);
                    interaction.channel
                        .send({
                            content: `<@${member.id}> used </ping:${commandId}> <@&${role.id}>`,
                            allowedMentions: { parse: ['roles'] } //only ping the role, not the command user
                        })
                        .catch(console.error);
                })
                .catch(console.error);
        }
        //if user meets the criteria to ping this role
        else if (data?.canPing(channelId, member.id, member.roles.cache)) {
            //if role is on cooldown, deny command usage but state when cooldown ends
            if (data.onCooldown()) {
                const embed = new MessageEmbed()
                    .setTitle('Ping denied')
                    .setDescription(`</ping:${commandId}> <@&${role.id}> is on cooldown, you will be able to use it <t:${data.last_ping + data.cooldown}:R>`)
                    .setColor(colors.blurple);

                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });
            }
            else {
                //update last ping time
                data.last_ping = getUnixTimestamp();
                //defer reply, then instantly delete it and send a normal message that pings the role
                //do this because interaction replies are webhook and use @everyone perms, meaning they cant mention everyone even if the bot itself can
                //it is unnecessary to await any of this
                interaction
                    .deferReply()
                    .then(() => {
                        interaction
                            .deleteReply()
                            .catch(console.error);
                        interaction.channel
                            .send({
                                content: `<@${member.id}> used </ping:${commandId}> <@&${role.id}>`,
                                allowedMentions: { parse: ['roles'] } //only ping the role, not the command user
                            })
                            .catch(console.error);
                    })
                    .catch(console.error);
            }
        }
        //if criteria isn't met or ping configuration for this role does not exist, deny command usage
        else {
            const embed = new MessageEmbed()
                .setTitle('Ping denied')
                .setDescription(`You are not allowed to ping <@&${role.id}>`)
                .setColor(colors.red);

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }
    }
};