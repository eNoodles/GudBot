const { AutocompleteInteraction } = require("discord.js");
const { blacklist } = require('../../database/dbObjects');

module.exports = {
    /**
     * @param {AutocompleteInteraction} interaction 
     */
    async execute(interaction) {
        const { options } = interaction;
        const subcommand = options.getSubcommand();
        const focused = options.getFocused(true);
        const focused_name = focused?.name;
        const focused_value = focused?.value.toLowerCase();

        //dont try to autocomplete empty strings
        if (!focused_value) return;

        try {
            if (subcommand === 'blacklist' && focused_name === 'add') {
                const responses = [];

                let fixed = focused_value
                    //replace character classes with latin alphabet range
                    .replace(/\\w|\\S|\\D|\./g, '[a-z]')
                    //replace capturing groups with non capturing ones
                    .replace(/\((?!\?)/g, '(?:')
                    //find non-latin-letter characters, keep supported ones, discard others
                    .replace(/(\[\^?(?=.+?\])|(?<=\[\^?.+?)\]|(?<=\[\^?.+?)-(?=.+?\])|\(\?(?::|<?[=!])(?=.+?\))|(?<=\(\?(?::|<?[=!]).+?)\)|(?<=[a-z\])])(?:{[0-9],?[0-9]?}|[*+?])\??|\|)|(?:(?<=\\)[A-Za-z]|[^A-Za-z])/g, (match, keep) => keep ? match : '')
                    //prevent infinite matching, like in 'test|', 'test(|abc)', 'test(ab||cd)'
                    //replace double || with single |
                    .replace(/\|\|/g, '|')
                    //remove | that are at beginning or end of string, or have non latin char next to them
                    .replace(/^\||\|$|\|(?=[^a-z])|(?<=[^a-z])\|/g, '')
                    //replace alternative groups with sets (ex: (?:a|b|c) => [abc] )
                    .replace(/(?:\((?:\?:)?)?([a-z]+\|[a-z]+(?:\|[a-z]+)*)\)?/g, (match, content) => {
                        //get individual alternatives (ex: (?:a|b|c) => ['a', 'b', 'c'] )
                        const alts = content.split('|');
                        //check if each alt is a single character or a surrogate pair (this is why I use a spread operator)
                        //I actually dont know why I check for surrogate pairs, since they get removed earlier but whatever
                        return alts.every(str => [...str].length === 1) ? `[${alts.join('')}]` : match;
                    });

                //add fixed input to responses
                responses.push({ name: fixed, value: fixed });
                
                const suggested = fixed
                    //replace with 's' or '[sz]' found at end of string, add * quantifier (or replace existing)
                    .replace(/(?:s|z|\[sz\]|\[zs\])[*+?]?$/, `[sz]*`)
                    //replace consecutive chars with proper quantifiers
                    .replace(/([a-z])(\1+)(?:(?:{([0-9])(,?)([0-9]?)}|([*+?]))(\??))?/g, (match, char, extra, min, comma, max, simple, lazy) => {
                        min = (parseInt(min, 10) || 0) + extra.length + (!min && !simple ? 1 : 0);
                        max = max ? parseInt(max, 10) + extra.length : comma ? ',' : 0;
                        switch (simple) {
                            case '*':
                                //0 or more
                                max = ',';
                                break;
                            case '+':
                                //1 or more
                                min++;
                                max = ',';
                                break;
                            case '?':
                                //0 or 1
                                max = max !== ',' ? min + 1 : max;
                                break;
                        }
                        return `${char}{${min}${max === ',' ? max : max ? `,${max}` : ''}}${lazy ?? ''}`;
                    })
                    //add + to any element without quanitifier (except from first)
                    .replace(/(?<!^)(?:\[\^?(?:[a-z]-[a-z]|[a-z])+\]|[)a-z](?![^\[]*\]))(?!(?:{[0-9],?[0-9]?}|[*+?])\??)/g, match => `${match}+`);

                if (suggested !== fixed) responses.push({ name: suggested, value: suggested });

                await interaction.respond(responses);
            }
            else if (subcommand === 'blacklist' && focused_name === 'remove') {
                // //get blacklist source, replace inner | of individual regexp sources
                // const blacklist_source = getBlacklist().source.replace(/(\((?:\?:)?[^|]*?)\|([^|]*?\))/g, (match, p1, p2) => `${p1}__OR__${p2}`);

                // //get the individual regexp sources, reinsert inner |
                // const sources = blacklist_source
                //     .split('|')
                //     .map(source => source.replace(/__OR__/g, '|'));

                const sources = (await blacklist.findAll() || []).map(e => e.word);
                if (!sources || sources.length === 0) return;

                const responses = new Set();

                //check if focused value is beginning of actual source string
                for (let i = 0; i < sources.length; i++) {
                    const source = sources[i];
                    if (source.startsWith(focused_value)) {
                        responses.add(source);
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

                    if (focused_value.search(regexp) > -1) {
                        //display actual source string, not partial regexp source
                        responses.add(source);
                    }
                }

                await interaction.respond([...responses].map(e => ({ name: e, value: e }) ));
            }
        }
        catch (e) {
            console.error(e);
            const { message } = e;
            interaction
                .respond([
                    { name: message, value: message }
                ])
                .catch(console.error);
        }
    }
};