const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits } = require('discord-api-types/v10');
const { CommandInteraction, MessageEmbed } = require('discord.js');
const { blacklist, whitelist } = require('../../database/dbObjects');
const { generateBlacklist, generateWhitelists } = require('../../managers/censorManager');
const { colors, createErrorEmbed, ids } = require('../../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('censor')
        .setDescription('Manage server censorship.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand => subcommand
            .setName('blacklist')
            .setDescription('Manage blacklisted words.')
            .addStringOption(option => option
                .setName('add')
                .setDescription('Word (string or regular expression) that you want to add.')
                .setAutocomplete(true)
            )
            .addStringOption(option => option
                .setName('remove')
                .setDescription('Word (string or regular expression) that you want to remove.')
                .setAutocomplete(true)
            )
        )
        .addSubcommand(subcommand => subcommand
            .setName('whitelist')
            .setDescription('Manage whitelisted channels, users, and roles.')
            .addStringOption(option => option
                .setName('add')
                .setDescription('Channel, user, or role that you want to whitelist.')
            )
            .addStringOption(option => option
                .setName('remove')
                .setDescription('Channel, user, or role that you want to remove.')
            )
        )
        .addSubcommand(subcommand => subcommand
            .setName('list')
            .setDescription('List all entries in censorship blacklist and whitelist.')
            .addBooleanOption(option => option
                .setName('ephemeral')
                .setDescription('Set to true if you want the reply to be only visible to you.')
            )
        ),

    /**
     * 
     * @param {CommandInteraction} interaction 
     */
    async execute(interaction) {
        const { options, user } = interaction;
        const subcommand = options.getSubcommand();
        const add = options.getString('add');
        const remove = options.getString('remove');

        switch (subcommand) {
            case 'blacklist':
                if (add && remove) {
                    await interaction.reply({
                        embeds: [createErrorEmbed(`<:error:${ids.emojis.error}> Please enter these commands separately:\`\`\`/censor blacklist add:${add}\`\`\`\`\`\`/censor blacklist remove:${remove}\`\`\``)], 
                        ephemeral: true
                    });
                }
                else if (add) {
                    //make sure string isn't too short or too long
                    if (add.length < 3 || add.length > 50) {
                        await interaction.reply({
                            embeds: [createErrorEmbed(`<:error:${ids.emojis.error}> Please enter a String or Regular Expression between 3 - 50 characters.\`\`\`${add}\`\`\``)], 
                            ephemeral: true
                        });
                        return;
                    }
                    
                    //find all non-latin-letter characters, replace unsupported ones with carets, keep supported ones
                    let found_unsupported = false;
                    let unsupported = add.replace(/(\[\^?(?=.+?\])|(?<=\[\^?.+?)\]|(?<=\[\^?.+?)-(?=.+?\])|\(\?(?::|<?[=!])(?=.+?\))|(?<=\(\?(?::|<?[=!]).+?)\)|(?<=[a-z\])])(?:{[0-9],?[0-9]?}|[*+?])\??)|([\ud800-\udbff])|(?:(?<=\\)[A-Za-z|]|[^A-Za-z|])/g, (match, keep, surrogate) => {
                        if (keep) return match;
                        else {
                            found_unsupported = true;
                            //completely remove high surrogates, to maintain consistent caret indexes
                            return surrogate ? '' : '^';
                        }
                    });

                    //if unsupported chars found
                    if (found_unsupported) {
                        //replace everything but carets with spaces
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
                            .setDescription(`\`\`\`\n${add}\n${unsupported}\`\`\`\nYour String or Regular Expression may only contain:\`\`\`${allowed_info}\`\`\`\n<:error:${ids.emojis.error}> Please note that homoglyphs (different characters that are visually similar), numerical substitutes, fonts, etc. are handled internally by the censoring algorithm. It is also case insensitive.`)
                            .setColor(colors.red);

                        await interaction.reply({
                            embeds: [embed], 
                            ephemeral: true
                        });
                        return;
                    }

                    //make sure it's a valid regexp just in case
                    try {
                        new RegExp(add);
                    }
                    catch(e) {
                        await interaction.reply({
                            embeds: [createErrorEmbed(`\`${add}\` is not a valid regular expression.`)],
                            ephemeral: true
                        });

                        return;
                    }

                    //create entry, make sure it's not a duplicate
                    const entry = await blacklist
                        .create({
                            word: add,
                            added_by: user.id
                        })
                        .catch(e => {
                            if (e.name === 'SequelizeUniqueConstraintError') {
                                interaction.reply({
                                    embeds: [createErrorEmbed(`Blacklist already contains \`${add}\``)],
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
                }
                else if (remove) {
                    //make sure string isn't too short or too long
                    if (remove.length < 3 || remove.length > 50) {
                        await interaction.reply({
                            embeds: [createErrorEmbed(`<:error:${ids.emojis.error}> Please enter a String or Regular Expression between 3 - 50 characters.\`\`\`${remove}\`\`\``)], 
                            ephemeral: true
                        });
                        return;
                    }
                    
                    //fetch entry matching given string
                    const entry = await blacklist.findOne({ where: { word: remove } });

                    if (entry) {
                        //delete entry from table
                        entry.destroy();

                        //update global regexp
                        generateBlacklist();

                        const embed = new MessageEmbed()
                            .setTitle('Censorship database updated')
                            .setDescription(`Removed \`${remove}\` from blacklist.`)
                            .setColor(colors.black);

                        await interaction.reply({ embeds: [embed] });
                    }
                    else {
                        await interaction.reply({
                            embeds: [createErrorEmbed(`No entry matching \`${remove}\` found in database.`)], 
                            ephemeral: true
                        });
                    }
                }
                //if neither add nor remove specified, display the current blacklist
                else {
                    //fetch all entries from blacklist table
                    const blacklist_entries = await blacklist.findAll();  

                    const embed = new MessageEmbed()
                        .setTitle('Censorship database')
                        .setDescription((() => {
                            //format description
                            let desc = '**Blacklist:**\n';

                            //added_by is the id of the user that added the word
                            blacklist_entries.forEach(entry => 
                                desc += `\`${entry.word}\` - added by <@${entry.added_by}>\n`
                            );

                            //if no words found in blacklist table
                            if (!blacklist_entries?.length) {
                                desc += 'Nothing found.\n';
                            }

                            return desc;
                        })())
                        .setColor(colors.purple)
                        .setFooter({ text: 'Use /censor commands to edit.' });

                    await interaction.reply({
                        embeds: [embed],
                        ephemeral: options.getBoolean('ephemeral')
                    });
                }

                break;
            case 'whitelist':
                if (add && remove) {
                    await interaction.reply({
                        embeds: [createErrorEmbed(`<:error:${ids.emojis.error}> Please enter these commands separately:\`\`\`/censor whitelist add:${add}\`\`\`\`\`\`/censor whitelist remove:${remove}\`\`\``)], 
                        ephemeral: true
                    });
                }
                else if (add) {
                    //match mention of role, user or channel
                    //capture "type" and id
                    //types:
                    // @ - user (@! also works but the ! is omitted)
                    //@& - role
                    // # - channel
                    const match = add.match(/^<(@&?|#)!?([0-9]+)>/);
                    
                    if (!match) {
                        await interaction.reply({
                            embeds: [createErrorEmbed(`Please mention a channel, user or role.`)],
                            ephemeral: true
                        });

                        return;
                    }

                    const mentionable = match[0];
                    const type = match[1];
                    const id = match[2];

                    const entry = await whitelist
                        .create({
                            id: id,
                            type: type,
                            added_by: user.id
                        })
                        .catch(e => {
                            if (e.name === 'SequelizeUniqueConstraintError') {
                                interaction.reply({
                                    embeds: [createErrorEmbed(`Whitelist already contains ${mentionable}`)],
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
                        .setDescription(`Added ${mentionable} to whitelist.`)
                        .setColor(colors.white);

                    await interaction.reply({ embeds: [embed] });
                }
                else if (remove) {
                    //match mention of role, user or channel
                    //we dont need the type for this, so it is a non capture group
                    const match = remove.match(/^<(?:@&?|#)!?([0-9]+)>/);
                    
                    if (!match) {
                        await interaction.reply({
                            embeds: [createErrorEmbed(`Please mention a channel, user or role.`)],
                            ephemeral: true
                        });

                        return;
                    }
                    
                    const mentionable = match[0];
                    const id = match[1];

                    //fetch entry whose id matches given mentionable
                    const entry = await whitelist.findOne({ where: { id: id } });

                    if (entry) {
                        //delete entry from table
                        entry.destroy();

                        //update whitelists
                        generateWhitelists();

                        const embed = new MessageEmbed()
                            .setTitle('Censorship database updated')
                            .setDescription(`Removed ${mentionable} from whitelist.`)
                            .setColor(colors.white);

                        await interaction.reply({ embeds: [embed] });
                    }
                    else {
                        await interaction.reply({
                            embeds: [createErrorEmbed(`No entry matching ${mentionable}'s ID found in database.`)], 
                            ephemeral: true
                        });
                    }
                }
                //if neither add nor remove specified, display the current whitelist
                else {
                    //fetch all entries from blacklist table
                    const whitelist_entries = await whitelist.findAll();  

                    const embed = new MessageEmbed()
                        .setTitle('Censorship database')
                        .setDescription((() => {
                            //format description
                            let desc = '**Whitelist:**\n';

                            //added_by is the id of the user that added the word
                            whitelist_entries.forEach(entry => 
                                desc += `<${entry.type}${entry.id}> - added by <@${entry.added_by}>\n`
                            );

                            //if no words found in whitelist table
                            if (!whitelist_entries?.length) {
                                desc += 'Nothing found.';
                            }

                            return desc;
                        })())
                        .setColor(colors.purple)
                        .setFooter({ text: 'Use /censor commands to edit.' });

                    await interaction.reply({
                        embeds: [embed],
                        ephemeral: options.getBoolean('ephemeral')
                    });
                }

                break;
            case 'list':
                //fetch all entries from blacklist and whitelist tables
                const [blacklist_entries, whitelist_entries] = await Promise.all([blacklist.findAll(), whitelist.findAll()]);                

                const embed = new MessageEmbed()
                    .setTitle('Censorship database')
                    .setDescription((() => {
                        //format description
                        let desc = '**Blacklist:**\n';

                        //added_by is the id of the user that added the word
                        blacklist_entries.forEach(entry => 
                            desc += `\`${entry.word}\` - added by <@${entry.added_by}>\n`
                        );

                        //if no words found in blacklist table
                        if (!blacklist_entries?.length) {
                            desc += 'Nothing found.\n';
                        }

                        desc += '\n**Whitelist:**\n';
                        whitelist_entries.forEach(entry => 
                            desc += `<${entry.type}${entry.id}> - added by <@${entry.added_by}>\n`
                        );

                        if (!whitelist_entries?.length) {
                            desc += 'Nothing found.';
                        }

                        return desc;
                    })())
                    .setColor(colors.purple)
                    .setFooter({ text: 'Use /censor commands to edit.' });

                await interaction.reply({
                    embeds: [embed],
                    ephemeral: options.getBoolean('ephemeral')
                });

                break;
            default:
                await interaction.reply({
                    embeds: [createErrorEmbed(`Something has gone wrong, received invalid command \`/censor ${subcommand}\``)],
                    ephemeral: true
                });
        }
    }
};