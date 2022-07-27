const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits } = require('discord-api-types/v10');
const { CommandInteraction } = require('discord.js');
const { fetchPingData } = require('../../managers/pingManager');
const { createErrorEmbed } = require('../../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configping')
        .setDescription('Configure \/ping')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(option => option
            .setName('role')
            .setDescription('Role to configure.')
            .setRequired(true)
        )
        .addStringOption(option => option
            .setName('add')
            .setDescription('Channel, user, or role that you want to add.')    
        )
        .addStringOption(option => option
            .setName('remove')
            .setDescription('Channel, user, or role that you want to remove.')    
        )
        .addIntegerOption(option => option
            .setName('cooldown')
            .setDescription('How often this role may be pinged.')
            .setMinValue(0)
            .setMaxValue(43200)
            .setChoices(
                { name: 'None', value: 0 },
                { name: '1 minute', value: 60 },
                { name: '2 minutes', value: 120 },
                { name: '3 minutes', value: 180 },
                { name: '4 minutes', value: 240 },
                { name: '5 minutes', value: 300 },
                { name: '10 minutes', value: 600 },
                { name: '15 minutes', value: 900 },
                { name: '30 minutes', value: 1800 },
                { name: '45 minutes', value: 2700 },
                { name: '1 hour', value: 3600 },
                { name: '2 hours', value: 7200 },
                { name: '3 hours', value: 10800 },
                { name: '4 hours', value: 14400 },
                { name: '5 hours', value: 18000 },
                { name: '6 hours', value: 21600 },
                { name: '7 hours', value: 25200 },
                { name: '8 hours', value: 28800 },
                { name: '9 hours', value: 32400 },
                { name: '10 hours', value: 36000 },
                { name: '11 hours', value: 39600 },
                { name: '12 hours', value: 43200 },
            )
        )
        .addBooleanOption(option => option
            .setName('ephemeral')
            .setDescription('Set to true if you want the reply to be only visible to you.')
        ),

    /**
     * @param {CommandInteraction} interaction 
     */
    async execute(interaction) {
        const { options } = interaction;
        const role = options.getRole('role', true);
        const data = await fetchPingData(role, true);

        if (!data) {
            await interaction.reply({
                embeds: [createErrorEmbed(`Something has gone wrong, failed to fetch/create PingData for <@&${role.id}>`)],
                ephemeral: true
            });

            return;
        }

        const add = options.getString('add');
        const remove = options.getString('remove');
        const cooldown = options.getInteger('cooldown');

        //if more than one option entered
        if ([add, remove, cooldown].filter(e => e !== null).length > 1) {
            let error_desc = '<:error:1000033728531267615> Please enter these commands separately:';
            if (add) error_desc += `\`\`\`/configping role:<@&${role.id}> add:${add}\`\`\``;
            if (remove) error_desc += `\`\`\`/configping role:<@&${role.id}> remove:${remove}\`\`\``;
            if (cooldown !== null) error_desc += `\`\`\`/configping role:<@&${role.id}> cooldown:${(() => {
                if (cooldown === 0) return 'None';
                else if (cooldown >= 3600) {
                    const hours = Math.floor(cooldown / 3600);
                    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
                }
                else if (cooldown >= 60) {
                    const minutes =  Math.floor(cooldown / 60);
                    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
                }
                else return `${cooldown} ${cooldown === 1 ? 'second' : 'seconds'}`;
            })()}\`\`\``;
            
            await interaction.reply({
                embeds: [createErrorEmbed(error_desc)], 
                ephemeral: true
            });
        }
        //cooldown could be equal to 0, which would act as false
        else if (cooldown !== null) {
            //update database
            data.config.update({ cooldown: cooldown }).catch(console.error);
            //update cached data
            data.cooldown = cooldown;

            //show updated configuration
            const embed = data.generateConfigEmbed(true);
            await interaction.reply({
                embeds: [embed],
                ephemeral: options.getBoolean('ephemeral')
            });
        }
        else if (add) {
            //match mention of role, user, channel or @everyone
            //capture "type" and id
            //types:
            // @ - user (@! also works but the ! is omitted)
            //@& - role
            // # - channel
            const matches = [...add.matchAll(/<(@&?|#)!?([0-9]+)>|(@everyone)/g)];

            if (!matches?.length) {
                await interaction.reply({
                    embeds: [createErrorEmbed(`Please mention a channel, user or role.`)],
                    ephemeral: true
                });

                return;
            }

            matches.forEach(match => {
                //if @everyone, use role type
                const type = match[3] ? '@&' : match[1];
                //@everyone uses guild id as its 'role' id
                const id = match[3] ? interaction.guildId : match[2];

                switch (type) {
                    case '@':
                        //update cached data
                        if (!data.user_ids.includes(id)) data.user_ids.push(id);
                        //update database (dont await)
                        data.config.update({ user_ids: data.user_ids.join('|') }).catch(console.error);
                        break;
                    case '@&':
                        //update cached data
                        if (!data.role_ids.includes(id)) data.role_ids.push(id);
                        //update database (dont await)
                        data.config.update({ role_ids: data.role_ids.join('|') }).catch(console.error);
                        break;
                    case '#':
                        //update cached data
                        if (!data.channel_ids.includes(id)) data.channel_ids.push(id);
                        //update database (dont await)
                        data.config.update({ channel_ids: data.channel_ids.join('|') }).catch(console.error);
                }
            });

            //show updated configuration
            const embed = data.generateConfigEmbed(true);
            await interaction.reply({
                embeds: [embed],
                ephemeral: options.getBoolean('ephemeral')
            });
        }
        else if (remove) {
            //match mention of role, user, channel or @everyone
            //capture "type" and id
            //types:
            // @ - user (@! also works but the ! is omitted)
            //@& - role
            // # - channel
            const matches = [...remove.matchAll(/<(@&?|#)!?([0-9]+)>|(@everyone)/g)];

            if (!matches?.length) {
                await interaction.reply({
                    embeds: [createErrorEmbed(`Please mention a channel, user or role.`)],
                    ephemeral: true
                });

                return;
            }

            matches.forEach(match => {
                //if @everyone, use role type
                const type = match[3] ? '@&' : match[1];
                //@everyone uses guild id as its 'role' id
                const id = match[3] ? interaction.guildId : match[2];

                switch (type) {
                    case '@':
                        //update cached data
                        data.user_ids = data.user_ids.filter(user_id => user_id !== id);
                        //update database (dont await)
                        data.config.update({ user_ids: data.user_ids.join('|') }).catch(console.error);
                        break;
                    case '@&':
                        //update cached data
                        data.role_ids = data.role_ids.filter(role_id => role_id !== id);
                        //update database (dont await)
                        data.config.update({ role_ids: data.role_ids.join('|') }).catch(console.error);
                        break;
                    case '#':
                        //update cached data
                        data.channel_ids = data.channel_ids.filter(channel_id => channel_id !== id);
                        //update database (dont await)
                        data.config.update({ channel_ids: data.channel_ids.join('|') }).catch(console.error);
                }
            });

            //show updated configuration
            const embed = data.generateConfigEmbed(true);
            await interaction.reply({
                embeds: [embed],
                ephemeral: options.getBoolean('ephemeral')
            });
        }
        //if neither add, remove nor cooldown specified, display the current configuration
        else {
            const embed = data.generateConfigEmbed();
            await interaction.reply({
                embeds: [embed],
                ephemeral: options.getBoolean('ephemeral')
            });
        }
    }
};