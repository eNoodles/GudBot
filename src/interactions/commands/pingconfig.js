const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits, ButtonStyle } = require('discord-api-types/v10');
const { CommandInteraction, MessageEmbed, MessageButton, MessageActionRow } = require('discord.js');
const { fetchOrCreatePingData, pinger_types } = require('../../managers/pingManager');
const { createErrorEmbed, ids, colors } = require('../../utils');
const { ping_configs } = require('../../database/dbObjects');

const cooldown_choices = [
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
    { name: '12 hours', value: 43200 }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pingconfig')
        .setDescription('Configure \/ping usage or list current configurations.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand => subcommand
            .setName('add')
            .setDescription('Add a \/ping configuration for the selected role.')
            .addRoleOption(option => option
                .setName('role')
                .setDescription('Which role this configuration is for.')
                .setRequired(true)
            )
            .addMentionableOption(option => option
                .setName('pinger')
                .setDescription('Role or user who can ping the selected role.')
                .setRequired(true)
            )
            .addChannelOption(option => option
                .setName('channel')
                .setDescription('Channel in which selected role can be pinged.')
                .setRequired(true)
            )
            .addIntegerOption(option => option
                .setName('cooldown')
                .setDescription('How often the selected role may be pinged.')
                .setMinValue(0)
                .setMaxValue(43200)
                .setChoices(...cooldown_choices)
                .setRequired(true)
            )
            .addBooleanOption(option => option
                .setName('ephemeral')
                .setDescription('Set to true if you want the reply to be only visible to you.')
            )
        )
        .addSubcommand(subcommand => subcommand
            .setName('remove')
            .setDescription('Remove a \/ping configuration for the selected role.')
            .addRoleOption(option => option
                .setName('role')
                .setDescription('Which role this configuration is for.')
                .setRequired(true)
            )
            .addMentionableOption(option => option
                .setName('pinger')
                .setDescription('Role or user who can ping the selected role.')
                .setRequired(true)
            )
            .addChannelOption(option => option
                .setName('channel')
                .setDescription('Channel in which selected role can be pinged.')
                .setRequired(true)
            )
            .addIntegerOption(option => option
                .setName('cooldown')
                .setDescription('How often the selected role may be pinged.')
                .setMinValue(0)
                .setMaxValue(43200)
                .setChoices(...cooldown_choices)
                .setRequired(true)
            )
            .addBooleanOption(option => option
                .setName('ephemeral')
                .setDescription('Set to true if you want the reply to be only visible to you.')
            )
        )
        .addSubcommand(subcommand => subcommand
            .setName('list')
            .setDescription('List \/ping configurations for the selected role.')
            .addRoleOption(option => option
                .setName('role')
                .setDescription('Which role to fetch configurations for.')
                .setRequired(true)
            )
            .addBooleanOption(option => option
                .setName('ephemeral')
                .setDescription('Set to true if you want the reply to be only visible to you.')
            )
        ),

    /**
     * @param {CommandInteraction} interaction 
     */
    async execute(interaction) {
        const { options } = interaction;
        const subcommand = options.getSubcommand();

        //get the selected role for which configuration is for
        const role = options.getRole('role');
        const role_id = role.id;
        //fetch or create ping data for selected role
        const data = await fetchOrCreatePingData(role);
        //format role's mention (otherwise @everyone will look like @@everyone)
        const role_mention = role_id === ids.guild ? '@everyone' : `<@&${role_id}>`;

        if (!data) {
            await interaction.reply({
                embeds: [createErrorEmbed(`Something has gone wrong, failed to fetch/create PingData for ${role_mention}`)],
                ephemeral: true
            });

            return;
        }

        switch (subcommand) {
            case 'add': {
                //get the user or role who can ping the selected role
                const pinger = options.getMentionable('pinger');
                const pinger_id = pinger.id;
                //determine whether role or user was entered by checking 'position' property (only roles have it)
                const pinger_type = pinger.position ? pinger_types.role : pinger_types.user;

                //get id of channel in which selected role may be pinged (could also be a category channel)
                const channel_id = options.getChannel('channel').id;

                //get the cooldown time in seconds
                const cooldown = options.getInteger('cooldown');

                //for unique model IDs- combine role_id, pinger_id and channel_id
                const config_id = `${role_id}${pinger_id}${channel_id}`;

                //check for duplicates
                const existing_config = data.configs.find(c => c.id === config_id);   

                if (existing_config) {
                    const embed = new MessageEmbed()
                        .setTitle('Ping configuration already exists')
                        .setDescription(`</ping:${ids.commands.ping}> ${role_mention} may be used by ${existing_config.getDescription()}\n\nUpdate cooldown to \`${cooldown_choices.find(choice => choice.value === cooldown)?.name}\`?`)
                        .setColor(colors.purple);

                    const yes_button = new MessageButton()
                        .setLabel('Yes')
                        .setStyle(ButtonStyle.Success)
                        .setCustomId(`pingconfigUpdateCooldown|${role_id}|${pinger_id}|${channel_id}|${cooldown}`);

                    const no_button = new MessageButton()
                        .setLabel('No')
                        .setStyle(ButtonStyle.Danger)
                        .setCustomId(`pingconfigList|${role_id}`);

                    await interaction.reply({
                        embeds: [embed],
                        components: [new MessageActionRow().addComponents([yes_button, no_button])]
                    });

                    return;
                }

                //create config in database
                const config = await ping_configs
                    .create({
                        id: config_id,
                        role_id: role_id,
                        pinger_id: pinger_id,
                        pinger_type: pinger_type,
                        channel_id: channel_id,
                        cooldown: cooldown
                    })
                    //shouldnt happen since we check for dups earlier but just in case
                    .catch(e => {
                        if (e.name === 'SequelizeUniqueConstraintError') {
                            
                            interaction.reply({
                                embeds: [createErrorEmbed(`Something has gone wrong, ping data for ${role_mention} is out of sync with the database. Please contact <@${ids.users.eNoodles}>`)],
                                ephemeral: true
                            }).catch(console.error);
                        }
                        else console.error(e);
                    });

                if (config) {
                    //update ping data
                    data.addConfig(config);

                    //show updated configuration
                    await interaction.reply({
                        embeds: [data.generateConfigEmbed('Updated ping configurations for')],
                        ephemeral: options.getBoolean('ephemeral')
                    });
                }
                
                break;
            }
            case 'remove': {
                //get id of user or role who can ping the selected role
                const pinger_id = options.getMentionable('pinger').id;

                //get id of channel in which selected role may be pinged (could also be a category channel)
                const channel_id = options.getChannel('channel').id;

                //for unique model IDs- combine role_id, pinger_id and channel_id
                const config_id = `${role_id}${pinger_id}${channel_id}`;

                //find matching config's index
                const config_idx = data.configs.findIndex(c => c.id === config_id);
                
                //if found
                if (config_idx > -1) {
                    //delete config from ping data
                    const config = data.configs.splice(config_idx, 1)[0];
                    //delete config from database
                    config.entry.destroy();

                    //show updated configuration
                    await interaction.reply({
                        embeds: [data.generateConfigEmbed('Updated ping configurations for')],
                        ephemeral: options.getBoolean('ephemeral')
                    });
                }
                else {
                    //notify that configuration was not found and list current configs for reference
                    await interaction.reply({
                        embeds: [data.generateConfigEmbed('No such configuration found for')],
                        ephemeral: options.getBoolean('ephemeral')
                    });
                }

                break;
            }
            //case 'list':
            default:
                await interaction.reply({
                    embeds: [data.generateConfigEmbed()],
                    ephemeral: options.getBoolean('ephemeral')
                });
        }
    }
};