const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction, MessageButton, MessageActionRow, MessageSelectMenu } = require('discord.js');
const { PermissionFlagsBits } = require('discord-api-types/v10');
const { buttons, createErrorEmbed } = require('../../utils');
const { getRelativeStarboardEntry, createStarboardEmbed } = require('../../managers/starboardManager');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('starboard')
        .setDescription('View starred messages.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ReadMessageHistory),
    /**
     * @param {CommandInteraction} interaction 
     */
	async execute(interaction) {
        //get first starboard entry
        const { entry, is_first, is_last } = await getRelativeStarboardEntry();

        //refresh button for retrying to fetch starboard entries
        const refresh_button = new MessageButton()
            .setEmoji('🔄')
            .setStyle(buttons.blurple)
            .setCustomId(`starboardRefresh`);

        //invalid entry, most likely the cache is empty
        if (!entry) {
            await interaction.reply({
                embeds: [createErrorEmbed('No starboard entries found.')],
                components: [new MessageActionRow().addComponents([refresh_button])],
                ephemeral: true
            });
            return;
        }

        //fetch channel where starred message was sent
        const channel = await interaction.guild.channels.fetch(entry.channel_id);
        if (!channel) {
            await interaction.reply({
                embeds: [createErrorEmbed(`Failed to fetch channel <#${entry.channel_id}>`)],
                components: [new MessageActionRow().addComponents([refresh_button])],
                ephemeral: true
            });
            return;
        }
        //fetch original starred message
        const message = await channel.messages.fetch(entry.original_id);
        if (!message) {
            await interaction.reply({
                embeds: [createErrorEmbed(`Failed to fetch message \`#${entry.original_id}\``)],
                components: [new MessageActionRow().addComponents([refresh_button])],
                ephemeral: true
            });
            return;
        }

        const embed = await createStarboardEmbed(message, entry.count);

        //navigational buttons
        const prev_button = new MessageButton()
            .setEmoji('◀️')
            .setStyle(buttons.blurple)
            .setCustomId(`starboardNavigate|prev|${entry.id}`)
            .setDisabled(is_first);

        const next_button = new MessageButton()
            .setEmoji('▶️')
            .setStyle(buttons.blurple)
            .setCustomId(`starboardNavigate|next|${entry.id}`)
            .setDisabled(is_last);

        //url button to original message
        const link_button = new MessageButton()
            .setLabel('Open')
            .setStyle(buttons.link)
            .setURL(entry.url);

        //select menu for selecting sorting
        const sort_select = new MessageSelectMenu()
            .setCustomId('starboardSort')
            .addOptions([
                {
                    label: 'Newest',
                    value: 'newest',
                    default: true
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
            ]);

        await interaction.reply({
            embeds: [embed],
            components: [
                new MessageActionRow().addComponents([sort_select]),
                new MessageActionRow().addComponents([prev_button, next_button, link_button])
            ],
            ephemeral: true
        });
	}
};