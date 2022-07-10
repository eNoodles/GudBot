const { ButtonStyle } = require('discord-api-types/v10');
const { SelectMenuInteraction, MessageActionRow, MessageSelectMenu, MessageButton } = require('discord.js');
const { getRelativeStarboardEntry, createStarboardEmbed } = require('../../managers/starboardManager');
const { createErrorEmbed, getUnixTimestamp } = require('../../utils');

module.exports = {
    /**
     * @param {SelectMenuInteraction} interaction 
     */
    async execute(interaction) {
        //get currently selected sorting option
        const selected_sort_value = interaction.values[0];

        //should sort by star count
        const top = selected_sort_value.startsWith('top');

        //entry timestamps should be greater than this
        let timestamp = -1;

        //get beginning timestamp if sorting by top
        if (top) {
            //current time
            let date = new Date();

            //get beginning of the day
            date.setMilliseconds(0);
            date.setSeconds(0);
            date.setMinutes(0);
            date.setHours(0);

            switch (selected_sort_value) {
                case 'top_year':
                    //get first day of current year
                    date.setMonth(0);
                    date.setDate(0);
                    //convert to unix
                    timestamp = getUnixTimestamp(date);
                    break;
                case 'top_month':
                    //get the first day of current month
                    date.setDate(0);
                    //convert to unix
                    timestamp = getUnixTimestamp(date);
                    break;
                case 'top_week':
                    //get the first day of current week
                    const current_date = date.getDate();
                    const current_day = date.getDay() || 7; //convert 0 (sunday) to 7
                    date.setDate(current_date - current_day + 1);
                    //convert to unix
                    timestamp = getUnixTimestamp(date);
            }
        }
        
        //get first starboard entry
        const { entry, is_first, is_last } = await getRelativeStarboardEntry(top, timestamp);

        //refresh button for retrying to fetch starboard entries
        const refresh_button = new MessageButton()
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`starboardRefresh`);

        //select menu for selecting sorting
        const sort_select = new MessageSelectMenu()
            .setCustomId('starboardSort')
            .addOptions([
                {
                    label: 'Newest',
                    value: 'newest'
                },
                {
                    label: 'Top of all time',
                    value: 'top_all_time'
                },
                {
                    label: 'Top this year',
                    value: 'top_year',
                },
                {
                    label: 'Top this month',
                    value: 'top_month',
                },
                {
                    label: 'Top this week',
                    value: 'top_week',
                },
            ].map(option => {
                option.default = option.value === selected_sort_value;
                return option;
            }));

        //invalid entry, most likely the cache is empty
        if (!entry) {
            await interaction.update({
                embeds: [createErrorEmbed('No starboard entries found.')],
                components: [
                    new MessageActionRow().addComponents([sort_select]),
                    new MessageActionRow().addComponents([refresh_button])
                ],
                ephemeral: true
            });
            return;
        }

        //fetch channel where starred message was sent
        const channel = await interaction.guild.channels.fetch(entry.channel_id);
        if (!channel) {
            await interaction.update({
                embeds: [createErrorEmbed(`Failed to fetch channel <#${entry.channel_id}>`)],
                components: [
                    new MessageActionRow().addComponents([sort_select]),
                    new MessageActionRow().addComponents([refresh_button])
                ],
                ephemeral: true
            });
            return;
        }
        //fetch original starred message
        const message = await channel.messages.fetch(entry.original_id);
        if (!message) {
            await interaction.update({
                embeds: [createErrorEmbed(`Failed to fetch message \`#${entry.original_id}\``)],
                components: [
                    new MessageActionRow().addComponents([sort_select]),
                    new MessageActionRow().addComponents([refresh_button])
                ],
                ephemeral: true
            });
            return;
        }

        const embed = await createStarboardEmbed(message, entry.count);

        //navigational buttons
        const prev_button = new MessageButton()
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`starboardNavigate|prev|${entry.id}`)
            .setDisabled(is_first);

        const next_button = new MessageButton()
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`starboardNavigate|next|${entry.id}`)
            .setDisabled(is_last);

        //url button to original message
        const link_button = new MessageButton()
            .setLabel('Open')
            .setStyle(ButtonStyle.Link)
            .setURL(entry.url);
        
        await interaction.update({
            embeds: [embed],
            components: [
                new MessageActionRow().addComponents([sort_select]),
                new MessageActionRow().addComponents([prev_button, next_button, link_button])
            ],
            ephemeral: true
        });
    }
}