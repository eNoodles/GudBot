const { AutocompleteInteraction } = require("discord.js");
const { blacklist } = require('../../database/dbObjects');

module.exports = {
    /**
     * @param {AutocompleteInteraction} interaction 
     */
    async execute(interaction) {
        const { commandName, options } = interaction;

        const focused_value = options.getFocused()?.toLowerCase();
        //dont try to autocomplete empty strings
        if (!focused_value) return;

        //get full command name, consisting of main command name, subgroup name, and subcommand name
        const subcommand_group = options.getSubcommandGroup(false) ?? '';
        const subcommand = options.getSubcommand() ?? '';
        const fullCommandName = `${commandName}${subcommand_group}${subcommand}`;

        try {
            if (fullCommandName === 'censorblacklistadd') {
                const responses = [];

                //replace character classes with latin alphabet range
                let fixed = focused_value.replace(/\\w|\\S|\\D|\./g, '[a-z]');

                //replace capturing groups with non capturing ones
                fixed = fixed.replace(/\((?!\?)/g, '(?:');

                //remove supported characters and save them for reinsertion
                const reinsertions = [];
                const remove_allowed = fixed.replace(/\[\^?(?=.+?\])|(?<=\[\^?.+?)\]|(?<=\[\^?.+?)-(?=.+?\])|\(\?(?::|<?[=!])(?=.+?\))|(?<=\(\?(?::|<?[=!]).+?)\)|(?<=[a-z\])])(?:{[0-9],?[0-9]?}|[*+?])\??|\|/g, (match, index) => {
                    reinsertions.push({
                        str: match,
                        idx: index
                    });
                    return '';
                });

                //remove unsupported characters
                fixed = remove_allowed.replace(/(?<=\\)[A-Za-z]|[^A-Za-z]/g, '');

                //reinsert supported characters
                reinsertions.forEach(e => fixed = fixed.substring(0, e.idx) + e.str + fixed.substring(e.idx) );

                //prevent infinite matching, like in 'test|', 'test(|abc)', 'test(ab||cd)'
                fixed = fixed
                    //replace double || with single |
                    .replace(/\|\|/g, '|')
                    //remove | that are at beginning or end of string, or have non latin char next to them
                    .replace(/^\||\|$|\|(?=[^a-z])|(?<=[^a-z])\|/g, '');

                //replace alternative groups with sets (ex: (?:a|b|c) => [abc] )
                fixed = fixed.replace(/(?:\((?:\?:)?)?([a-z]+\|[a-z]+(?:\|[a-z]+)*)\)?/g, (match, content) => {
                    //get individual alternatives (ex: (?:a|b|c) => ['a', 'b', 'c'] )
                    const alts = content.split('|');
                    //check if each alt is a single character or a surrogate pair (this is why I use a spread operator)
                    return alts.every(str => [...str].length === 1) ? `[${alts.join('')}]` : match;
                });

                //add fixed input to responses
                responses.push({ name: fixed, value: fixed });
                
                const suggested = fixed
                    //replace with 's' or '[sz]' found at end of string, add * quantifier (or replace existing)
                    .replace(/(?:s|z|\[sz\]|\[zs\])[*+?]?$/, `[sz]*`)
                    //remove consecutive chars
                    .replace(/([a-z])\1+/g, (match, char) => char)
                    //add + to any element without quanitifier (except from first)
                    .replace(/(?<!^)(?:\[\^?(?:[a-z]-[a-z]|[a-z])+\]|[)a-z](?![^\[]*\]))(?!(?:{[0-9],?[0-9]?}|[*+?])\??)/g, match => `${match}+`);

                if (suggested !== fixed) responses.push({ name: suggested, value: suggested });

                await interaction.respond(responses);
            }
            else if (fullCommandName === 'censorblacklistremove') {
                // //get blacklist source, replace inner | of individual regexp sources
                // const blacklist_source = getBlacklist().source.replace(/(\((?:\?:)?[^|]*?)\|([^|]*?\))/g, (match, p1, p2) => `${p1}__OR__${p2}`);

                // //get the individual regexp sources, reinsert inner |
                // const sources = blacklist_source
                //     .split('|')
                //     .map(source => source.replace(/__OR__/g, '|'));

                const sources = (await blacklist.findAll() || []).map(e => e.word);
                if (!sources || sources.length === 0) return;

                //check if focused value is beginning of actual source string
                for (let i = 0; i < sources.length; i++) {
                    const source = sources[i];
                    if (source.startsWith(focused_value)) {
                        await interaction.respond([
                            { name: source, value: source }
                        ]);
                        return;
                    }
                };

                //check if ENTIRE focused value matches PART of regexp
                for (let i = 0; i < sources.length; i++) {
                    const source = sources[i];

                    //autism 
                    //replace existing quantifier or add * quantifier to every "element" of regexp source (apart from first)
                    //(?<!^|-|{)((?<=\\).|[)\]]|\w|[^\x00-\x7F])(?!-|{|})(?<!\\)[*+?]?\??
                    //(?<!^|-|{)((?<!\[[^\]]*)(?:\w|[^\x00-\x7F])(?![^\[]*\])|[)\]]|(?<=[^\\]\\)\S)(?!-|{|})(?<![^\\]\\)[*+?]?\??
                    //(?<!^|-|{)((?<!(?<![^\\]\\)\[(?:.(?!(?<![^\\]\\)\]))*)(?:\w|[^\x00-\x7F]|\.)|[)\]]|(?<=[^\\]\\)\S)(?!-|{|})(?<![^\\]\\)[*+?]?\??
                    const partial_source = `^${source.toLowerCase().replace(/(?<!^)(\[\^?(?:[a-z]-[a-z]|[a-z])+\]|[)a-z])(?:{[0-9],?[0-9]?}|[*+?])?\??/g, (match, element) => `${element}*`)}$`;
                    const regexp = new RegExp(partial_source, 'g');

                    if (focused_value.match(regexp)) {
                        //display actual source string, not partial regexp source
                        await interaction.respond([
                            { name: source, value: source }
                        ]);
                        return;
                    }
                }
            }
        }
        catch (e) {
            console.error(e);

            const { message } = e;
            interaction.respond([
                { name: message, value: message }
            ]).catch(console.error);
        }
        
    }
};