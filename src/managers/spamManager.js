const { ButtonStyle } = require("discord-api-types/v10");
const { Message, Collection, GuildMember, TextChannel, MessageEmbed, MessageButton, MessageActionRow, ButtonInteraction, SelectMenuInteraction, MessageSelectMenu } = require("discord.js");
const { ids, logUnless, colors, getCachedChannel, isAdmin, generateIntegerOptions } = require("../utils");
const { jailMember } = require("./jailManager");
const { thresholds } = require('../database/dbObjects');

/**
 * K: Action type
 * V: Threshold data
 * @type {Collection<string,{ type: string; set_by: string; message_count: integer; channel_count: integer; extra: integer; }>}
 */
const thresholds_cache = new Collection();

/**
 * Fetch all action thresholds from database and cache them for use.
 */
async function generateThresholds() {
    await thresholds
        .findAll()
        .then(entries => {
            //reset cache
            thresholds_cache.clear();
            //cache updated thresholds
            entries.forEach(entry => 
                thresholds_cache.set(entry.type, {
                    type: entry.type,
                    set_by: entry.set_by,
                    message_count: entry.message_count,
                    channel_count: entry.channel_count,
                    extra: entry.extra
                })
            );
        })
        .catch(console.error);
}

/**
 * Currently circulating message groups
 * @type {MessageGroup[]} 
 */
let temp_groups = [];
/**
 * @type {number}
 */
const max_temp_groups = 10;

/**
 * Out-of-circulation message groups that have passed some spam threshold
 * and are being kept around for action handling purposes
 * @type {MessageGroup[]}
 */
let spam_groups = [];

class MessageGroup {
    /**
     * @param {Message} message 
     * @param {string} sterilized_content
     */
    constructor(message, sterilized_content) {
        //group's ID = first message's ID
        this.id = message.id;
        //unmodified content of first message
        this.original_content = message.content;
        //sterilized content to compare new messages to
        this.sterilized_content = sterilized_content;
        //counter of total messages in group (sum of channel_data/sender_data counts)
        this.total_count = 1;
        //creation time of first message
        this.created_timestamp = message.createdTimestamp;
        //creation time of last message added (for first message it is the same)
        this.updated_timestamp = message.createdTimestamp;

        /**
         * K: Channel ID
         * V: Channel data containing TextChannel object, count (# of times sent), and array of messages that have yet to be deleted
         * @type {Collection<string,{ channel: TextChannel, count: number; messages: Message[]; }>}
         */
        this.channels = new Collection();
        this.channels.set(message.channel.id, {
            channel: message.channel,
            count: 1,
            messages: [message]
        });

        /**
         * K: GuildMember ID
         * V: Sender data containing GuildMember object and count (# of times sent)
         * @type {Collection<string,{ member: GuildMember; count: number; }>} 
         */
        this.senders = new Collection();
        this.senders.set(message.author.id, {
            member: message.member,
            count: 1
        });

        //delete MessageGroup after 5 minutes of inactivity
        this.expiration_time = 300000;

        //whether or not group is actively circulating among temp groups
        this.active = true;

        //spam-handling action's status, activator user id, extra data
        this.notify_action = { 
            active: false
        };
        this.delete_action = {
            active: false,
            user_id: ''
        };
        this.jail_action = {
            active: false,
            user_id: '',
            reason: '',
            duration: 0
        };
        this.ban_action = {
            active: false,
            user_id: '',
            reason: '',
            days: 0
        };
        this.ignore_action = {
            active: false,
            user_id: ''
        };

        /**@type {Message|null} Info embed sent in admin channel*/
        this.info_message = null;
    }

    /**Returns true if any action has been taken*/
    someAction() {
        //determine which actions have been activated by user id, not by active status (because Ignore might've overwritten their status)
        return [this.notify_action, this.delete_action, this.jail_action, this.ban_action, this.ignore_action].some(action => action.active || action.user_id);
    }

    /**Update info embed, check thresholds and perform necessary actions*/
    async handleSpam() {
        //automatically activate Notify action
        this.notify_action.active = true;

        //if Ignore is active, deactivate other actions
        this.delete_action.active = this.delete_action.active && !this.ignore_action.active;
        this.jail_action.active = this.jail_action.active && !this.ignore_action.active;
        this.ban_action.active = this.ban_action.active && !this.ignore_action.active;

        let channels_field = ``;
        this.channels.forEach((channel_data, channel_id) => {
            //format channels field
            channels_field += `<#${channel_id}> - ${channel_data.count} ${channel_data.count === 1 ? 'time' : 'times'}\n`;

            //if delete action taken, bulk delete messages from this channel
            if (this.delete_action.active) {
                channel_data.channel.bulkDelete(channel_data.messages).catch(e => logUnless(e, ids.errors.unknown_message));
            }
        });
        
        let senders_field = '';
        this.senders.forEach((sender_data, sender_id) => {
            //format senders field
            senders_field += `<@${sender_id}> - ${sender_data.count} ${sender_data.count === 1 ? 'time' : 'times'}\n`;

            const { member } = sender_data;

            //if ban action taken, ban senders
            if (this.ban_action.active && member.manageable && !isAdmin(member)) {
                member.ban({
                    reason: this.ban_action.reason,
                    days: this.ban_action.days
                }).catch(console.error);
            }
            //otherwise if jail action taken, jail senders
            else if (this.jail_action.active && !member.roles.cache.has(ids.roles.jailed) && member.manageable && !isAdmin(member)) {
                jailMember(
                    member, 
                    { id: ids.client, tag: 'GudBot#4788' },
                    this.jail_action.reason,
                    this.jail_action.duration
                ).catch(console.error);
            }
        });

        //format original content as quote if not done so already
        this.content_quote = this.content_quote ?? `> ${this.original_content.trim().replace(/\n/g, '\n> ')}`;

        //create info embed
        const embed = new MessageEmbed()
            .setColor(
                this.ignore_action.active ? colors.gray :
                this.ban_action.active ? colors.black : 
                this.jail_action.active ? colors.green :
                this.delete_action.active ? colors.red :
                colors.blurple
            )
            .setTitle("Potential spam detected")
            .setDescription(`${this.content_quote}\n\nTotal times sent: ${this.total_count}`)
            .addField('Channels', channels_field)
            .addField('Senders', senders_field)
            .setFooter({text: 'First message sent'})
            .setTimestamp(this.created_timestamp);

        //determine which actions have been activated by user id, not by active status (because Ignore might've overwritten their status)
        let actions_field_str = '';
        if (this.delete_action.user_id) actions_field_str += `Delete - <@${this.delete_action.user_id}>\n`;
        if (this.jail_action.user_id) actions_field_str += `Jail - <@${this.jail_action.user_id}>\n`;
        if (this.ban_action.user_id) actions_field_str += `Ban - <@${this.ban_action.user_id}>\n`;
        if (this.ignore_action.user_id) actions_field_str += `Ignore - <@${this.ignore_action.user_id}>\n`;

        //add/update Actions field
        if (actions_field_str) {
            //get rid of unnecessary linebreak at the end
            //actions_field_str = actions_field_str.trim();

            //see if Actions field already exists
            if (embed.fields[2]) {
                //update field value
                embed.spliceFields(2, 1, {
                    name: 'Actions',
                    value: actions_field_str
                });
            }
            //add Actions field
            else embed.addField('Actions', actions_field_str);
        }

        //disable action buttons if they are already active, or Ignore is active
        const del = new MessageButton()
            .setLabel('Delete')
            .setStyle(ButtonStyle.Danger)
            .setCustomId(`spamActionDelete|${this.id}`)
            .setDisabled(this.delete_action.active || this.ignore_action.active);

        const jail = new MessageButton()
            .setLabel('Jail')
            .setStyle(ButtonStyle.Success)
            .setCustomId(`spamActionJail|${this.id}`)
            .setDisabled(this.jail_action.active || this.ignore_action.active || this.ban_action.active); //disable jail button if ban action is active

        const ban = new MessageButton()
            .setLabel('Ban')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`spamActionBan|${this.id}`)
            .setDisabled(this.ban_action.active || this.ignore_action.active);

        const ignore = new MessageButton()
            .setLabel('Ignore')
            .setStyle(ButtonStyle.Secondary)
            .setCustomId(`spamActionIgnore|${this.id}`)
            .setDisabled(this.ignore_action.active);

        //update existing info message
        if (this.info_message?.editable) {
            this.info_message
                .edit({
                    embeds: [embed],
                    components: [new MessageActionRow().addComponents([del, jail, ban, ignore])]
                })
                .catch(console.error);
        }
        //send new info message
        else {
            getCachedChannel(ids.channels.admin)
                .send({
                    embeds: [embed],
                    components: [new MessageActionRow().addComponents([del, jail, ban, ignore])]
                })
                .then(message => this.info_message = message)
                .catch(console.error);
        }
    }

    /**
     * Add message to group and handle spam if necessary
     * @param {Message} message 
     */
    async addMessage(message) {
        //increment counter
        this.total_count++;
        //update timestamp
        this.updated_timestamp = message.createdTimestamp;

        //get channel messages collection
        const channel_data = this.channels.get(message.channel.id);
        //if found, increment counter and add new message to the array
        if (channel_data) {
            channel_data.count++;
            channel_data.messages.push(message);
        }
        //otherwise, create new channel data
        else {
            this.channels.set(message.channel.id, {
                channel: message.channel,
                count: 1,
                messages: [message]
            });
        }

        //get senders collection
        const sender_data = this.senders.get(message.author.id);
        //if found, increment counter
        if (sender_data) {
            sender_data.count++;
        }
        //otherwise, create new sender data
        else {
            this.senders.set(message.author.id, {
                member: message.member,
                count: 1
            });
        }

        //check thresholds and auto trigger actions
        thresholds_cache.forEach(threshold_data => {
            const { type, message_count, channel_count, extra } = threshold_data;

            //determine which actions have been activated by user id, not by active status (because Ignore might've overwritten their status)
            if (this[type] && !this[type].user_id && (message_count && this.total_count >= message_count || channel_count && this.channels.size >= channel_count)) {
                switch (type) {
                    case 'notify_action':
                        this.notify_action.active = true;
                        break;
                    case 'delete_action':
                        if (!this.ignore_action.active) {
                            this.delete_action.active = true;
                            this.delete_action.user_id = ids.client;
                        }
                        break;
                    case 'jail_action':
                        if (!this.ignore_action.active) {
                            this.jail_action.active = true;
                            this.jail_action.user_id = ids.client;
                            this.jail_action.reason = 'Spam';
                            this.jail_action.duration = extra;
                        }
                        break;
                    case 'ban_action':
                        if (!this.ignore_action.active) {
                            this.ban_action.active = true;
                            this.ban_action.user_id = ids.client;
                            this.ban_action.reason = 'Spam';
                            this.ban_action.days = extra;
                        }
                }
            }
        });

        //if group has passed any threshold or any action has been taken
        if (this.someAction()) {
            //update embed and take actions
            await this.handleSpam();
        }
    }
}

/**
 * @param {string} id MessageGroup ID = First Message's ID
 * @returns {MessageGroup|undefined}
 */
function getMessageGroupById(id) {
    //return message_groups.get(id);
    return spam_groups.find(group => group.id === id) 
        ?? temp_groups.find(group => group.id === id);
}

/**
 * @param {string} content Message content to compare
 * @returns {MessageGroup|undefined}
 */
function getMessageGroupByContent(content) {
    //cast to lowercase, then remove emojis and whitespace
    const sterilized_content = content
        .toLowerCase()
        .replace(/(?:\s|<:\w{2,32}:[0-9]{17,19}>|\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu, '');

    return spam_groups.find(group => group.sterilized_content === sterilized_content) 
        ?? temp_groups.find(group => group.sterilized_content === sterilized_content);
}

// function compareContent(a, b) {
//     const [long_str, short_str] = a.length >= b.length ? [a, b] : [b, a];
//     const ten_percent = Math.ceil(long_str.length * 0.1);
//     const fifty_percent = Math.ceil(long_str.length * 0.5);

//     let diff_count = long_str.length - short_str.length;
//     let i = 0;
//     while (diff_count <= ten_percent) {
//         if (i >= fifty_percent && diff_count === 0 && a === b) return true;
//         if (i >= short_str.length) return true;
        
//         const char = short_str[i];
//         const long_str_index = long_str.indexOf(char, i);

//         diff_count += long_str_index === -1 ? 1 : long_str_index - i;
//         i += long_str_index === -1 ? 1 : long_str_index - i + 1;
//     }

//     return false;
// }

/**
 * Compares message content to active MessageGroups, adds it if match found, otherwise creates new MessageGroup starting with this message.
 * @param {Message} message 
 */
async function addToMessageGroups(message) {
    //ignore messages sent outside of server
    if (message.guildId !== ids.guild) return;
    //ignore messages without content
    if (!message.content) return;

    //cast to lowercase, then remove emojis and whitespace
    const sterilized_content = message.content
        .toLowerCase()
        .replace(/(?:\s|<:\w{2,32}:[0-9]{17,19}>|\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu, '');

    //make sure sterilized content isnt empty (if original message only consisted of emojis)
    if (!sterilized_content) return;

    //find group with matching sterilized content among currently circulating groups
    const found_index = temp_groups.findIndex(group => group.sterilized_content === sterilized_content);
    const found_group = temp_groups[found_index];

    //if message group found
    if (found_group) {
        //add this message to the group
        await found_group.addMessage(message);
        //move group to last position in array
        temp_groups.push(
            ...temp_groups.splice(found_index, 1)
        );
    }
    //otherwise create new message group and remove old group if necessary
    else {
        temp_groups.push(new MessageGroup(message, sterilized_content));

        //if temp groups have hit max capacity
        if (temp_groups.length > max_temp_groups) {
            //remove oldest group
            const group = temp_groups.shift();

            //if group has passed any threshold or any action has been taken
            if (group?.someAction()) {
                //increase expiration time to 24 hours
                group.expiration_time = 86400000;
                //mark group as inactive
                group.active = false;
                //add to spam groups
                spam_groups.push(group);
            }
        }
    }
}

/**Filters out expired MessageGroups.*/
function filterMessageGroups() {
    //get current time in ms
    const current_time = new Date().getTime();
    //only keep groups that have not "expired" (time passed since last update over expiration time)
    const f = group => (current_time - group.updated_timestamp) <= group.expiration_time;

    temp_groups = temp_groups.filter(f);
    spam_groups = spam_groups.filter(f);
}

/**
 * Generates embed containing info about all active thresholds
 * @returns {MessageEmbed}
 */
function generateThresholdsEmbed() {
    //if both message_count and channel_count are non-zero, divide their sum by 2, otherwise just get their sum which is equivalent to the single non-zero value
    const weighted_count = x => x.message_count && x.channel_count ? (x.message_count + x.channel_count)/2 : x.message_count + x.channel_count;
    //sort in ascending order by weighted count
    const threshold_entries = thresholds_cache.sort((a,b) => weighted_count(a) - weighted_count(b));

    //format embed
    const embed = new MessageEmbed()
        .setTitle('Spam thresholds')
        .setFooter({ text: 'Use the Edit button to add, update or remove thresholds.' })
        .setColor(colors.purple);

    //display jail duration as a string instead of number of seconds
    const getDurationString = (duration) => {
        switch (duration) {
            case 86400:
                return '24 hours';
            case 43200:
                return '12 hours';
            case 21600:
                return '6 hours';
            case 3600:
                return '1 hour';
            case 1800:
                return '30 minutes';
            default:
                return 'Indefinite';
        }
    };

    //display ban days as a string instead of number of days
    const getBanDaysString = (days) => {
        switch (days) {
            case 7:
                return 'Previous 7 days';
            case 1:
                return 'Previous 24 hours';
            default:
                return 'Don\'t delete any';
        }
    };

    //add fields containing data for each threshold
    threshold_entries.forEach(entry => 
        embed.addField(
            //format actions names (ex: jail_action => Jail)
            entry.type.substring(0, entry.type.indexOf('_')).replace(/^\w/, match => match.toUpperCase()), 
            //display threshold data in codeblock
            `\`\`\`${
            //display extra data for jail/ban actions before message/channel counts
            entry.type === 'jail_action' ? `Duration: ${getDurationString(entry.extra)}\n` : 
            entry.type === 'ban_action' ? `Remove message history: ${getBanDaysString(entry.extra)}\n` : 
            ''
            }Message count: ${entry.message_count || 'None'}\nChannel count: ${entry.channel_count || 'None'}\`\`\`Set by <@${entry.set_by}>`)
    );

    //if no entries found in threshold table
    if (threshold_entries?.size === 0) {
        embed.setDescription('No thresholds set.');
    }

    return embed;
}

/**
 * Updates message for adding/updating thresholds (initially activated by Edit button on /spam thresholds)
 * @param {ButtonInteraction|SelectMenuInteraction} interaction
 * @param {{ type_value: string; message_value: string; channel_value: string; extra_value: string; extra_value: string; }} selected 
 */
async function updateThresholdPrompt(interaction, selected = {}) {
    //get the previously selected values
    const { type_value, message_value, channel_value, extra_value } = selected;

    //add to button and select menu customIds to preserve args across multiple interactions
    const args = `${type_value ?? ''}|${message_value ?? ''}|${channel_value ?? ''}|${extra_value ?? ''}`;

    //embed explaining how thresholds and actions work
    const embed = new MessageEmbed()
        .setTitle('Edit action thresholds')
        .addField('Action type', 'The spam-handling action to automatically trigger when this threshold is exceeded.```ini\n[Notify] moderators in selected channel when potential spam is detected. Automatically activated by any other action, so it only makes sense to set this as the lowest threshold.\n\n[Delete] all current messages corresponding to the spam group, and automatically delete any new ones.\n\n[Jail] all current senders corresponding to the spam group for the configured duration, and automatically jail new senders.\n\n[Ban] all current senders corresponding to the spam group and (optionally) delete their message history. Automatically bans new senders, so USE WITH CAUTION.\n\n[Ignore] cannot be automatically triggered. Upon manual activation, it deactives all thresholds and already taken actions.```')
        .addField('Message count', 'The amount of alike "spam" messages required to trigger the selected action.')
        .addField('Channel count', 'The amount of unique channels in which spam messages were sent required to trigger the selected action.')
        .addField('\u200b', 'The action will be triggered when either message or channel threshold is exceeded. You don\'t have to configure both.')
        .setColor(colors.purple);

    //message components to send
    const components = [];

    //select menu for choosing action type
    const type_select = new MessageSelectMenu()
        .setCustomId(`spamThresholdType|${args}`)
        .setPlaceholder('Action type')
        .addOptions([
            {
                label: 'Notify',
                value: 'notify_action'
            },
            {
                label: 'Delete',
                value: 'delete_action'
            },
            {
                label: 'Jail',
                value: 'jail_action',
            },
            {
                label: 'Ban',
                value: 'ban_action'
            }
        ].map(option => {
            //set selected value as default option
            option.default = option.value === type_value;
            return option;
        }));

    components.push(new MessageActionRow().addComponents(type_select));

    //if currently selected type is jail_action, present jail duration select menu
    if (type_value === 'jail_action') {
        const jail_dur_select = new MessageSelectMenu()
            .setCustomId(`spamThresholdJailDuration|${args}`)
            .setPlaceholder('Jail duration')
            .addOptions([
                {
                    label: 'Indefinitely',
                    value: '0'
                },
                {
                    label: 'For 30 minutes',
                    value: '1800',
                },
                {
                    label: 'For 1 hour',
                    value: '3600'
                },
                {
                    label: 'For 6 hours',
                    value: '21600'
                },
                {
                    label: 'For 12 hours',
                    value: '43200'
                },
                {
                    label: 'For 24 hours',
                    value: '86400'
                }
            ].map(option => {
                //set selected value as default option
                option.default = option.value === extra_value;
                return option;
            }));

        components.push(new MessageActionRow().addComponents(jail_dur_select));
    }
    //if currently selected type is ban_action, present ban days select menu
    else if (type_value === 'ban_action') {
        const ban_select = new MessageSelectMenu()
            .setCustomId(`spamThresholdBanDays|${args}`)
            .setPlaceholder('Delete message history')
            .addOptions([
                {
                    label: 'Don\'t delete message history',
                    value: '0',
                },
                {
                    label: 'Delete previous 24 hours of message history',
                    value: '1'
                },
                {
                    label: 'Delete previous 7 days of message history',
                    value: '7'
                }
            ].map(option => {
                //set selected value as default option
                option.default = option.value === extra_value;
                return option;
            }));

        components.push(new MessageActionRow().addComponents(ban_select));
    }

    //use same options for message count and channel count menus
    const none_option = {
        label: 'None',
        value: 'none'
    };
    const integer_options = generateIntegerOptions(3, 25);
    const count_options = [none_option, ...integer_options];

    const message_select = new MessageSelectMenu()
        .setCustomId(`spamThresholdMessageCount|${args}`)
        .setPlaceholder('Message count')
        .setMinValues(0)
        .addOptions(
            count_options.map(option => {
                //set selected value as default option
                option.default = option.value === message_value;
                return option;
            })
        );

    const channel_select = new MessageSelectMenu()
        .setCustomId(`spamThresholdChannelCount|${args}`)
        .setPlaceholder('Channel count')
        .setMinValues(0)
        .addOptions(
            count_options.map(option => {
                //set selected value as default option
                option.default = option.value === channel_value;
                return option;
            })
        );

    components.push(
        new MessageActionRow().addComponents(message_select),
        new MessageActionRow().addComponents(channel_select)
    );

    //if threshold for this action exists, format this as 'Update' button, otherwise as 'Add'
    const add_button = new MessageButton()
        .setLabel(thresholds_cache.get(type_value) ? 'Update' : 'Add')
        .setStyle(thresholds_cache.get(type_value) ? ButtonStyle.Primary : ButtonStyle.Success)
        .setCustomId(`spamThresholdUpsert|${args}`)
        .setDisabled(
            //type must be selected
            !type_value ||
            //either message count or channel count must be selected
            (!message_value || message_value === 'none') && (!channel_value || channel_value === 'none') ||
            //if jail type chosen, duration must be selected
            type_value === 'jail_action' && !extra_value ||
            //if ban type chosen, days must be selected
            type_value === 'ban_action' && !extra_value
        );

    //removes existing action threshold if it exists already
    const remove_button = new MessageButton()
        .setLabel('Remove')
        .setStyle(ButtonStyle.Danger)
        .setCustomId(`spamThresholdRemove|${args}`)
        .setDisabled(!thresholds_cache.get(type_value));

    //goes back to /spam thresholds embed
    const cancel_button = new MessageButton()
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setCustomId('spamThresholdCancelEdit');

    components.push(new MessageActionRow().addComponents(add_button, remove_button, cancel_button));

    await interaction.update({
        embeds: [embed],
        components: components,
        ephemeral: true
    });
}

module.exports = {
    thresholds_cache,
    generateThresholds,
    getMessageGroupById,
    getMessageGroupByContent,
    addToMessageGroups,
    filterMessageGroups,
    generateThresholdsEmbed,
    updateThresholdPrompt
};