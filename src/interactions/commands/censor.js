const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits } = require('discord-api-types/v10');
const { CommandInteraction, MessageEmbed } = require('discord.js');
const { blacklist, whitelist } = require('../../database/dbObjects');
const { generateBlacklist, generateWhitelists } = require('../../managers/censorManager');
const { colors, createErrorEmbed } = require('../../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('censor')
        .setDescription('Manage server censorship.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommandGroup(group => group
            .setName('blacklist')
            .setDescription('Commands for managing blacklisted words.')
            .addSubcommand(subcommand => subcommand
                .setName('add')
                .setDescription('Add a word to the blacklist.')
                .addStringOption(option => option
                    .setName('word')
                    .setDescription('Word (string or regular expression) that you want to be censored.')
                    .setRequired(true)
                    .setAutocomplete(true)
                )
            )
            .addSubcommand(subcommand => subcommand
                .setName('remove')
                .setDescription('Remove a word from the blacklist.')
                .addStringOption(option => option
                    .setName('word')
                    .setDescription('Word (string or regular expression) that you want to remove.')
                    .setRequired(true)
                    .setAutocomplete(true)
                )
            )
        )
        .addSubcommandGroup(group => group
            .setName('whitelist')
            .setDescription('Commands for managing whitelisted channels, users, and roles.')
            .addSubcommand(subcommand => subcommand
                .setName('add')
                .setDescription('Add a channel, user, or role to the whitelist.')
                .addStringOption(option => option
                    .setName('mentionable')
                    .setDescription('Channel, user, or role that you want to be whitelisted.')
                    .setRequired(true)
                )
            )
            .addSubcommand(subcommand => subcommand
                .setName('remove')
                .setDescription('Remove a channel, user or role from the whitelist.')
                .addStringOption(option => option
                    .setName('mentionable')
                    .setDescription('Channel, user, or role that you want to remove.')
                    .setRequired(true)
                )
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
        const { options } = interaction;
        const subcommand_group = options.getSubcommandGroup(false) ?? '';
        const subcommand = options.getSubcommand();
        const user = interaction.user;

        switch (`${subcommand_group}${subcommand}`) {
            case 'blacklistadd': {
                const word = options.getString('word');

                //make sure string isn't too short or too long
                if (word.length < 3 || word.length > 50) {
                    await interaction.reply({
                        embeds: [createErrorEmbed(`\`\`\`${word}\`\`\`<:error:1000033728531267615> Please enter a String or Regular Expression between 3 - 50 characters.`, '')], 
                        ephemeral: true
                    });
                    return;
                }
                
                //find all non-latin-letter characters, replace unsupported ones with ^ pointer, keep supported ones
                let found_unsupported = false;
                let unsupported = word.replace(/(\[\^?(?=.+?\])|(?<=\[\^?.+?)\]|(?<=\[\^?.+?)-(?=.+?\])|\(\?(?::|<?[=!])(?=.+?\))|(?<=\(\?(?::|<?[=!]).+?)\)|(?<=[a-z\])])(?:{[0-9],?[0-9]?}|[*+?])\??|\|)|(?:(?<=\\)[A-Za-z]|[^A-Za-z])/g, (match, keep) => {
                    if (keep) return match;
                    else {
                        found_unsupported = true;
                        return '^';
                    }
                });

                //if unsupported chars found
                if (found_unsupported) {
                    //replace everything but ^ pointers with spaces
                    unsupported = unsupported.replace(/[^^]/g, ' ');
                    
                    //explain to user what regexp classes are supported
                    const allowed_info = 
                        'a-z'.padEnd(12) + 'Latin alphabet\n' + 
                        '[abc]'.padEnd(12) + 'Character sets\n' + 
                        '[^abc]'.padEnd(12) + 'Negated character sets\n' + 
                        '[a-c]'.padEnd(12) + 'Character ranges\n' + 
                        '(?:abc)'.padEnd(12) + 'Non-capturing groups\n' + 
                        '(?:a|b)'.padEnd(12) + 'Alternatives within non-capturing groups\n' + 
                        '(?=abc)'.padEnd(12) + 'Positive lookahead\n' + 
                        '(?<=abc)'.padEnd(12) + 'Positive lookbehind\n' + 
                        '(?!abc)'.padEnd(12) + 'Negative lookahead\n' + 
                        '(?<!abc)'.padEnd(12) + 'Negative lookbehind\n' + 
                        'a* a+ a?'.padEnd(12) + 'Quantifiers: 0 or more, 1 or more, 0 or 1\n' + 
                        'a{n}'.padEnd(12) + 'Quantifiers: Exactly n (single digits)\n' + 
                        'a{n,}'.padEnd(12) + 'Quantifiers: n or more (single digits)\n' + 
                        'a{n,m}'.padEnd(12) + 'Quantifiers: Between n & m (single digits)\n' + 
                        'a+? a{n}?'.padEnd(12) + 'Lazy quantifiers\n';

                    //notify user
                    const embed = new MessageEmbed()
                        .setTitle('Unsupported characters detected')
                        .setDescription(`\`\`\`\n${word}\n${unsupported}\`\`\`\nYour String or Regular Expression may only contain:\`\`\`${allowed_info}\`\`\`\n<:error:1000033728531267615> Please note that homoglyphs (different characters that are visually similar), numerical substitutes, fonts, etc. are handled internally by the censoring algorithm. It is also case insensitive.`)
                        .setColor(colors.red);

                    await interaction.reply({
                        embeds: [embed], 
                        ephemeral: true
                    });
                    return;
                }

                //make sure it's a valid regexp just in case
                try {
                    new RegExp(word);
                }
                catch(e) {
                    await interaction.reply({
                        embeds: [createErrorEmbed(`\`${word}\` is not a valid regular expression.`)],
                        ephemeral: true
                    });

                    return;
                }

                //create entry, make sure it's not a duplicate
                const entry = await blacklist.create({
                    word: word,
                    added_by: user.id
                }).catch(e => {
                    if (e.name === 'SequelizeUniqueConstraintError') {
                        interaction.reply({
                            embeds: [createErrorEmbed(`Blacklist already contains \`${word}\``)],
                            ephemeral: true
                        }).catch(console.error);
                    }
                    else console.error(e);
                });

                if (!entry) return;

                //update global regexp
                generateBlacklist();

                const embed = new MessageEmbed()
                    .setTitle('Censorship database updated')
                    .setDescription(`Added \`${entry.word}\` to blacklist.`)
                    .setColor(colors.black);

                await interaction.reply({ embeds: [embed] });

                break;
            }
            case 'blacklistremove': {
                const word = options.getString('word');

                //make sure string isn't too short or too long
                if (word.length < 3 || word.length > 50) {
                    await interaction.reply({
                        embeds: [createErrorEmbed(`\`\`\`${word}\`\`\`<:error:1000033728531267615> Please enter a String or Regular Expression between 3 - 50 characters.`, '')], 
                        ephemeral: true
                    });
                    return;
                }
                
                //fetch entry matching given word
                const entry = await blacklist.findOne({ where: { word: word } });

                if (entry) {
                    //delete entry from table
                    entry.destroy();

                    //update global regexp
                    generateBlacklist();

                    const embed = new MessageEmbed()
                        .setTitle('Censorship database updated')
                        .setDescription(`Removed \`${word}\` from blacklist.`)
                        .setColor(colors.black);

                    await interaction.reply({ embeds: [embed] });
                }
                else {
                    await interaction.reply({
                        embeds: [createErrorEmbed(`No entry matching \`${word}\` found in database.`)], 
                        ephemeral: true
                    });
                }

                break;
            }
            case 'whitelistadd': {
                const mentionable = options.getString('mentionable');

                //match mention of role, user or channel
                //capture "type" and id
                // types:
                // @ - user (@! also works but the ! is omitted)
                //@& - role
                // # - channel
                const regexp = mentionable.match(/^<(@&?|#)!?([0-9]+)>/);
                
                if (!regexp) {
                    await interaction.reply({
                        embeds: [createErrorEmbed(`Please mention a channel, user or role.`)],
                        ephemeral: true
                    });

                    return;
                }

                const entry = await whitelist.create({
                    id: regexp[2],
                    type: regexp[1],
                    added_by: user.id
                }).catch(e => {
                    if (e.name === 'SequelizeUniqueConstraintError') {
                        interaction.reply({
                            embeds: [createErrorEmbed(`Whitelist already contains ${regexp[0]}`)],
                            ephemeral: true
                        }).catch(console.error);
                    }
                    else console.error(e);
                });

                if (!entry) return;

                //update whitelists
                generateWhitelists();

                const embed = new MessageEmbed()
                    .setTitle('Censorship database updated')
                    .setDescription(`Added <${entry.type}${entry.id}> to whitelist.`)
                    .setColor(colors.white);

                await interaction.reply({ embeds: [embed] });

                break;
            }
            case 'whitelistremove': {
                const mentionable = options.getString('mentionable');

                //match mention of role, user or channel
                //we dont need the type for this, so it is a non capture group
                const regexp = mentionable.match(/^<(?:@&?|#)!?([0-9]+)>/);
                
                if (!regexp) {
                    await interaction.reply({
                        embeds: [createErrorEmbed(`Please mention a channel, user or role.`)],
                        ephemeral: true
                    });

                    return;
                }
                
                //fetch entry whose id matches given mentionable
                const entry = await whitelist.findOne({ where: { id: regexp[1] } });

                if (entry) {
                    //delete entry from table
                    entry.destroy();

                    //update whitelists
                    generateWhitelists();

                    const embed = new MessageEmbed()
                        .setTitle('Censorship database updated')
                        .setDescription(`Removed ${regexp[0]} from whitelist.`)
                        .setColor(colors.white);

                    await interaction.reply({ embeds: [embed] });
                }
                else {
                    await interaction.reply({
                        embeds: [createErrorEmbed(`No entry matching \`${regexp[0]}\`'s ID found in database.`)], 
                        ephemeral: true
                    });
                }

                break;
            }
            case 'list': {
                //fetch all entries from blacklist and whitelist tables
                const [blacklist_entries, whitelist_entries] = await Promise.all([blacklist.findAll(), whitelist.findAll()]);
    
                //format description
                let desc = '**Blacklist:**\n';

                //added_by is the id of the user that added the word
                blacklist_entries.forEach(entry => 
                    desc += `\`${entry.word}\` - added by <@${entry.added_by}>\n`
                );

                //if no words found in blacklist table
                if (blacklist_entries?.length === 0) {
                    desc += 'Nothing found.\n';
                }

                //same thing for whitelist
                desc += '\n**Whitelist:**\n';
                whitelist_entries.forEach(entry => 
                    desc += `<${entry.type}${entry.id}> - added by <@${entry.added_by}>\n`
                );

                if (whitelist_entries?.length === 0) {
                    desc += 'Nothing found.';
                }

                const embed = new MessageEmbed()
                    .setTitle('Censorship database')
                    .setDescription(desc)
                    .setColor(colors.purple)
                    .setFooter({ text: 'Use /censor commands to edit' });

                await interaction.reply({
                    embeds: [embed],
                    ephemeral: options.getBoolean('ephemeral')
                });

                break;
            }
            default:
                await interaction.reply({
                    embeds: [createErrorEmbed(`Something has gone wrong, received invalid command \`/censor ${subcommand_group} ${subcommand}\``)],
                    ephemeral: true
                });
        }
    }
};