const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction, MessageEmbed } = require('discord.js');
const utils = require('../../utils');
const { blacklist } = require('../../database/dbObjects');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('censor')
        .setDescription('Manage server censorship.')
        .addSubcommand(subcommand => subcommand
            .setName('add')
            .setDescription('Add a word to the blacklist.')
            .addStringOption(option => option
                .setName('word')
                .setDescription('Word (string or regular expression) that you want to be censored.')
                .setRequired(true)
            )
        )
        .addSubcommand(subcommand => subcommand
            .setName('remove')
            .setDescription('Remove a word from the blacklist.')
            .addStringOption(option => option
                .setName('word')
                .setDescription('Word (string or regular expression) that you want to remove.')
                .setRequired(true)
            )
        )
        .addSubcommand(subcommand => subcommand
            .setName('list')
            .setDescription('Lists all words on censorship detector\'s blacklsit.')
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
        
        const subcommand = interaction.options.getSubcommand();
        const user = interaction.user;

        let word = interaction.options.getString('word');

        switch (subcommand) {
            case 'add':
                //make sure string isn't too short or too long
                if (word.length < 3 || word.length > 50) {
                    interaction.reply({
                        embeds: [utils.createErrorEmbed(`Please enter a string between 3 - 50 characters.`)], 
                        ephemeral: true
                    });
                    return;
                }

                //no whitespace
                if (word.match(/\s/)) {
                    interaction.reply({
                        embeds: [utils.createErrorEmbed(`String must not contain whitespace (spaces, linebreaks, tabs).`)], 
                        ephemeral: true
                    });
                    return;
                }

                //make sure there are no capture groups
                word = word.replace(/\((?!\?:)/g, '(?:');

                await blacklist.create({
                    word: word,
                    added_by: user.id
                }).then(async entry => {

                    //update global regexp
                    utils.generateBlacklistRegExp();

                    const embed = new MessageEmbed()
                        .setTitle('Censorship database updated')
                        .setDescription(`Added \`${entry.word}\` to blacklist.`)
                        .setColor(utils.colors.green);

                    interaction.reply({ embeds: [embed] });
                }).catch(console.error);

                break;
            case 'remove':
                //fetch entry matching given word
                const entry = await blacklist.findOne({ where: { word: word } }).catch(console.error);

                if (entry) {
                    //delete entry from table
                    entry.destroy();

                    //update global regexp
                    utils.generateBlacklistRegExp();

                    const embed = new MessageEmbed()
                        .setTitle('Censorship database updated')
                        .setDescription(`Successfully removed \`${word}\` from blacklist.`)
                        .setColor(utils.colors.green);

                    interaction.reply({ embeds: [embed] });
                }
                else {
                    interaction.reply({
                        embeds: [utils.createErrorEmbed(`No entry matching \`${word}\` found in database.`)], 
                        ephemeral: true
                    });
                }

                break;
            case 'list':
                //fetch all entries from blacklist table
                const entries = await blacklist.findAll().catch(console.error);

                //format description
                let desc = '**Blacklist:**\n';

                //added_by is the id of the user that added the word
                entries.forEach(entry => {
                    desc += `\`${entry.word}\` - added by <@${entry.added_by}>\n`;
                });

                //if no words found in blacklist table
                if (entries?.length === 0) {
                    desc += 'No words found.';
                }

                const embed = new MessageEmbed()
                    .setTitle('Censorship database')
                    .setDescription(desc)
                    .setColor(utils.colors.green)
                    .setFooter({ text: 'Use /censor commands to edit' });

                interaction.reply({
                    embeds: [embed],
                    ephemeral: interaction.options.getBoolean('ephemeral')
                });

                break;
            default:
                interaction.reply({
                    embeds: [utils.createErrorEmbed(`Something has gone wrong, invalid \`/censor\` subcommand \`${subcommand}\``)], 
                    ephemeral: true
                });
        }
    }
}