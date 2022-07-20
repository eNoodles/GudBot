const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits, ButtonStyle } = require('discord-api-types/v10');
const { CommandInteraction, MessageEmbed, MessageButton, MessageActionRow } = require('discord.js');
const { thresholds } = require('../../database/dbObjects');
const { generateThresholdsEmbed } = require('../../managers/spamManager');
const { colors } = require('../../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spam')
        .setDescription('Configure spam manager.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand => subcommand
            .setName('thresholds')
            .setDescription('Set thresholds for automatic spam-handling actions.')
            .addBooleanOption(option => option
                .setName('ephemeral')
                .setDescription('Set this to true if you want the reply to be only visible to you.')
            )
        ),

    /**
     * 
     * @param {CommandInteraction} interaction 
     */
    async execute(interaction) {
        const { options } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand === 'thresholds') {
            const embed = generateThresholdsEmbed();

            const edit_button = new MessageButton()
                .setLabel('Edit')
                .setStyle(ButtonStyle.Secondary)
                .setCustomId(`spamThresholdsEdit`);

            await interaction.reply({
                embeds: [embed],
                components: [new MessageActionRow().addComponents([edit_button])],
                ephemeral: options.getBoolean('ephemeral')
            });
        }
    }
};