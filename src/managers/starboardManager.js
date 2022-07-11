const { ButtonStyle } = require('discord-api-types/v10');
const { MessageReaction, User, MessageEmbed, MessageButton, MessageActionRow, Collection, Message, MessageSelectMenu, CommandInteraction, ButtonInteraction, SelectMenuInteraction } = require("discord.js");
const { ids, colors, extractImageUrls, prependFakeReply, generateFileLinks, findLastSpaceIndex, trimWhitespace, addEllipsisDots, getUnixTimestamp, createErrorEmbed } = require("../utils");
const { starboard } = require('../database/dbObjects');

const star_count = 2;

/**
 * K: original_id
 * V: Model instance
 * @type {Collection<string, Model>}
 */
const starboard_cache = new Collection();

/**@type {boolean} Whether or not ALL entries from database have been cached*/
let is_cache_uptodate = false;

/**
 * Fetches starboard entry from local cache or database (caches it in the latter case)
 * @param {string} original_id ID of original starred message
 * @returns {Model} Model instance of starboard entry
 */
async function fetchStarboardEntry(original_id) {
    //first check local cache
    let entry = starboard_cache.get(original_id);
    if (entry) return entry;

    //otherwise fetch from db and cache
    entry = await starboard.findOne({ where: { original_id: original_id } });
    if (entry) {
        starboard_cache.set(original_id, entry);
        return entry; 
    }

    //doesnt exist
    return null;
}

/**
 * @param {Message} message Original starred message
 * @param {number} count \# of star reactions
 * @returns {Promise<MessageEmbed>}
 */
async function createStarboardEmbed(message, count) {
    let { content, member, author } = message;

    const embed = new MessageEmbed()
        .setColor(member?.displayHexColor ?? colors.gray)
        .setTitle(`#${message.channel.name}`)
        .setAuthor({
            name: member?.displayName ?? author.username,
            iconURL: member?.displayAvatarURL() ?? author.displayAvatarURL()
        })
        .setFooter({
            text: `⭐${count}`,
            //iconURL: 'https://media.discordapp.net/attachments/828322073256132669/891494179375554580/discordstarsvg.png'
        })
        .setTimestamp(message.createdTimestamp);

    //if message had an image attachment, we want to prioritize that as the embed's image
    const image = message.attachments?.find(file => file.contentType.startsWith('image'));
    if (image)
        embed.setImage(image.proxyURL);
    //otherwise we check for image urls in the text content (they would have been embedded normally)
    else {
        const extract_images = extractImageUrls(content);
        if (extract_images) {
            embed.setImage(extract_images.urls[0]);
            content = extract_images.content; //this is the message content with removed urls        
        }
    }

    //prepend fake reply to beginning of message content
    if (message.type === 'REPLY') {
        //catch exception if reply isnt found (non critical error)
        const replied_msg = await message.fetchReference().catch(console.error);
        content = prependFakeReply(content, replied_msg);
    }

    const file_links = generateFileLinks(message);

    //make sure content isn't over 4092 chars
    content = trimWhitespace(content);
    //the actual limit is 4096 but we want to account for possible linebreaks and dots
    const max_length = 4089 - file_links.length;
    if (content.length > max_length) {
        const cutoff_index = findLastSpaceIndex(content, max_length);
        content = content.substring(0, cutoff_index);
        content = addEllipsisDots(content);
    }

    //add non image attachments as hyperlinks to the end of the message
    if (file_links) {
        //add linebreaks between existing message content and links
        if (content !== '') content += '\n\n';
        //add links
        content += file_links;
    }

    //set finalized content as embed description
    return embed.setDescription(content);
}

/**
 * @param {MessageReaction} reaction 
 * @param {User} user 
 */
async function updateStarboard(reaction, user) {
    //original starred message
    const { message, count } = reaction;

    //no self starring
    // if (user.id === message.author.id) {
    //     await reaction.users.remove(user.id);
    //     return;
    // }

    //fetch starboard channel
    const star_ch = await message.guild.channels.fetch(ids.star_ch);
    if (!star_ch) return;

    //fetch starboard entry from cache or db
    const starboard_entry = await fetchStarboardEntry(message.id);

    //reaction count is less than minimum
    if (count < star_count) {
        //starboard entry exists, meaning it had enough stars before, but now a star has been removed
        if (starboard_entry) {
            //delete entry from db
            await starboard_entry.destroy();
            //delete from cache
            starboard_cache.delete(message.id);
            //fetch and delete the starboard message
            const starboard_message = await star_ch.messages.fetch(starboard_entry.id);
            await starboard_message.delete();
        }
        return;
    }
    //reaction is equal to or above minimum:

    const embed = await createStarboardEmbed(message, count);

    //update existing starboard entry
    if (starboard_entry) {
        //fetch starboard message
        const starboard_message = await star_ch.messages.fetch(starboard_entry.id);
        if (!starboard_message) return;
        //update message with edited embed
        await starboard_message.edit({ embeds: [embed] }).catch(console.error);
        //update star count in db
        const new_entry = await starboard_entry.update({ count: count });
        //update cache
        starboard_cache.set(message.id, new_entry);
    }
    //create new starboard entry
    else {
        //create link to original message
        const link = new MessageButton()
            .setLabel('Open')
            .setStyle(ButtonStyle.Link)
            .setURL(message.url);
        //send new message in starboard channel
        const sent = await star_ch.send({ 
            embeds: [embed],
            components: [new MessageActionRow().addComponents([link])]
        });
        if (!sent) return;
        //create new entry in db
        const new_entry = await starboard.create({
            id: sent.id,
            original_id: message.id,
            channel_id: message.channel.id,
            author_id: message.author.id,
            count: count,
            timestamp: Math.floor(message.createdTimestamp / 1000), //convert ms to seconds
            url: message.url
        }).catch(e => {
            //in case something goes wrong, delete message from starboard channel
            console.error(e);
            sent.delete().catch(e => e.code === 10008 ? {} : console.error(e));
        });
        //cache new starboard entry
        if (new_entry) starboard_cache.set(message.id, new_entry);
    }
}

/**
 * @param {string} [user_id] ID of user for which to filter starboard entries
 * @param {string} [channel_id] ID of channel for which to filter starboard entries
 * @param {string} selected_sort_value Select Menu's selected option value
 * @param {number} entry ID of entry relative to which to get previous/next entry
 * @param {boolean} next True if looking for next entry, false if looking for previous
 */
async function getNextEntry(user_id, channel_id, selected_sort_value, entry_id, next) {
    //make sure cache has all entries from database
    if (!is_cache_uptodate) {
        const entries = await starboard.findAll();
        if (entries?.length > 0) {
            entries.forEach(entry => starboard_cache.set(entry.original_id, entry));
            is_cache_uptodate = true;
        }
    }

    //if cache is empty, there is nothing to find
    if (starboard_cache.size === 0) return null;

    //if should sort by star count
    const top = selected_sort_value?.startsWith('top');

    //entry timestamps should be greater than this
    let starting_timestamp = -1;

    //get starting timestamp if sorting by top
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
                starting_timestamp = getUnixTimestamp(date);
                break;
            case 'top_month':
                //get the first day of current month
                date.setDate(0);
                //convert to unix
                starting_timestamp = getUnixTimestamp(date);
                break;
            case 'top_week':
                //get the first day of current week
                const current_date = date.getDate();
                const current_day = date.getDay() || 7; //convert 0 (sunday) to 7
                date.setDate(current_date - current_day + 1);
                //convert to unix
                starting_timestamp = getUnixTimestamp(date);
        }
    }

    //comparator function for sorting by highest star count
    const sort_top = top ? (a,b) => b.count - a.count : () => 0;

    //filter and sort cache, convert to array
    const sorted = Array.from(starboard_cache
        .filter(entry => 
            //only get entries after given timestamp
            entry.timestamp >= starting_timestamp &&
            //if user_id is given, only get entries with matching author_id
            (!user_id || entry.author_id === user_id) &&
            //if channel_id is given, only get entries with matching channel_id
            (!channel_id || entry.channel_id === channel_id)
        )
        //prioritize sorting by star count (IF top is true), if star count is equal or irrelevant- sort by newest
        .sort((a,b) => sort_top(a,b) || b.timestamp - a.timestamp)
        .values()
    );

    //find index of given entry among sorted array
    let index = entry_id ? sorted.findIndex(entry => entry.id === entry_id) : -1;
    //get index of next or previous entry
    index += next ? 1 : -1;

    //clamp index within array size
    index = Math.min(Math.max(index, 0), sorted.length - 1);

    //if entry isn't found, the index will either be 
    //-1 - 1 = -2, which gets clamped to 0
    //-1 + 1 = 0
    //either way we get 0, the first element of the array

    return {
        entry: sorted[index], //next/previous entry
        is_first: index === 0, //if entry is first (disable prev button)
        is_last: index === sorted.length - 1 //if entry is last (disable next button)
    };
}

/**
 * @param {CommandInteraction|ButtonInteraction|SelectMenuInteraction} interaction 
 * @param {{ user_id: string; channel_id: string; selected_sort_value: string; entry_id: number; next: boolean; }} starboard_options
 */
async function updateStarboardViewer(interaction, starboard_options = {}) {
    const { user_id, channel_id } = starboard_options;
    const selected_sort_value = starboard_options.selected_sort_value ?? 'newest';
    const entry_id = starboard_options.entry_id ?? 0;
    const next = starboard_options.next ?? true;

    //reply to command (initial use), update if clicked button or select menu
    const replyOrUpdate = interaction.isCommand() ? 
        (...args) => interaction.reply(...args) : 
        (...args) => interaction.update(...args);

    //get first starboard entry
    const { entry, is_first, is_last } = await getNextEntry(user_id, channel_id, selected_sort_value, entry_id, next);

    //refresh button for retrying to fetch starboard entries
    const refresh_button = new MessageButton()
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Primary)
        .setCustomId(`starboardRefresh`);

    //select menu for sorting options
    const sort_select = new MessageSelectMenu()
        .setCustomId(`starboardSort|${user_id ?? ''}|${channel_id ?? ''}`)
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
            //set selected value as default option
            option.default = option.value === selected_sort_value;
            return option;
        }));

    //invalid entry, most likely the cache is empty
    if (!entry) {
        await replyOrUpdate({
            embeds: [createErrorEmbed('No starboard entry found.')],
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
        await replyOrUpdate({
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
        await replyOrUpdate({
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

    await replyOrUpdate({
        embeds: [embed],
        components: [
            new MessageActionRow().addComponents([sort_select]),
            new MessageActionRow().addComponents([prev_button, next_button, link_button])
        ],
        ephemeral: true
    });
}

module.exports = {
    updateStarboard,
    updateStarboardViewer
}