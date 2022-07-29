const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits } = require('discord-api-types/v10');
const { CommandInteraction, MessageEmbed } = require('discord.js');
const { fetchOrCreatePingData } = require('../../managers/pingManager');
const { colors, getUnixTimestamp, ids } = require('../../utils');

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
        const { options, channel, member, commandId } = interaction;
        const role = options.getRole('role');
        const role_mention = role.id === ids.guild ? '@everyone' : `<@&${role.id}>`;
        const ping_mention = `</ping:${commandId}>`;

        //users with mentions perm may ping any role, any time
        if (member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
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
                            content: `<@${member.id}> used ${ping_mention} ${role_mention}`,
                            allowedMentions: { parse: ['roles', 'everyone'] } //only ping the role, not the command user
                        })
                        .catch(console.error);
                });

            return;
        }

        const data = await fetchOrCreatePingData(role);
        const config = data?.findOptimalConfig(channel.id, channel.parentId, member.id, member.roles.cache);

        //if appropriate config for command usage found
        if (config) {
            const current_timestamp = getUnixTimestamp();
            const cooldown_end = config.getCooldownEnd();

            //if config's cooldown hasn't ended, deny command usage but state when cooldown ends
            if (current_timestamp < cooldown_end) {
                const embed = new MessageEmbed()
                    .setTitle('Ping denied')
                    .setDescription(`${ping_mention} ${role_mention} is on cooldown, you will be able to use it <t:${cooldown_end}:R>`)
                    .setColor(colors.blurple);

                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });
            }
            //allow ping
            else {
                //update last ping time
                config.last_ping = current_timestamp;
                
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
                                content: `<@${member.id}> used ${ping_mention} ${role_mention}`,
                                allowedMentions: { parse: ['roles', 'everyone'] } //only ping the role, not the command user
                            })
                            .catch(console.error);
                    });
            }
        }
        //if criteria isn't met or ping configuration for this role does not exist, deny command usage
        else {
            const embed = new MessageEmbed()
                .setTitle('Ping denied')
                .setDescription(`You are not allowed to ${ping_mention} ${role_mention}`)
                .setColor(colors.red);

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }
    }
};