const { AutocompleteInteraction } = require("discord.js");
const { getBlacklist } = require("../../managers/censorManager");

module.exports = {
    /**
     * @param {AutocompleteInteraction} interaction 
     */
    async execute(interaction) {
        const { commandName, options } = interaction;

        const focused_value = options.getFocused();
        //dont try to autocomplete empty strings
        if (!focused_value) return;

        //get full command name, consisting of main command name, subgroup name, and subcommand name
        const subcommand_group = options.getSubcommandGroup(false) ?? '';
        const subcommand = options.getSubcommand() ?? '';
        const fullCommandName = `${commandName}${subcommand_group}${subcommand}`;

        try {
            if (fullCommandName === 'censorblacklistremove') {
                //get blacklist source, replace inner | of individual regexp sources
                const blacklist_source = getBlacklist().source.replace(/(\((?:\?:)?[^|]*?)\|([^|]*?\))/g, (match, p1, p2) => `${p1}__OR__${p2}`);

                //get the individual regexp sources, reinsert inner |
                const sources = blacklist_source
                    .split('|')
                    .map(source => source.replace(/__OR__/g, '|'));

                //check if focused value is beginning of actual source string
                for (let i = 0; i < sources.length; i++) {
                    const source = sources[i];
                    if (source.startsWith(focused_value)) {
                        await interaction.respond([
                            { name: source, value: source }
                        ]);
                        return false;
                    }
                };

                //check if ENTIRE focused value matches PART of regexp
                for (let i = 0; i < sources.length; i++) {
                    const source = sources[i];

                    //autism 
                    //replace existing quantifier or add * quantifier to every "element" of regexp source (apart from first)
                    //(?<!^|-|{)((?<=\\).|[)\]]|\w|[^\x00-\x7F])(?!-|{|})(?<!\\)[*+?]?\??
                    //(?<!^|-|{)((?<!\[[^\]]*)(?:\w|[^\x00-\x7F])(?![^\[]*\])|[)\]]|(?<=[^\\]\\)\S)(?!-|{|})(?<![^\\]\\)[*+?]?\??
                    const partial_source = `^${source.replace(/(?<!^|-|{)((?<!(?<![^\\]\\)\[(?:.(?!(?<![^\\]\\)\]))*)(?:\w|[^\x00-\x7F]|\.)|[)\]]|(?<=[^\\]\\)\S)(?!-|{|})(?<![^\\]\\)[*+?]?\??/g, (match, element) => `${element}*`)}$`;
                    const regexp = new RegExp(partial_source, 'ig');

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