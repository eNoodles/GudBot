const { ButtonStyle } = require("discord-api-types/v10");
const { Message, Collection, GuildMember, TextChannel, MessageEmbed, MessageButton, MessageActionRow } = require("discord.js");
const { ids, logUnlessUnknown, colors, getCachedChannel, isAdmin } = require("../utils");
const { jailMember } = require("./jailManager");

const thresholds = {
    /**Warn if text sent in X amount of messages*/
    message_warn: 4,
    /**Delete if text sent in X amount of messages*/
    message_extr: 8,
    /**Warn if text sent in X amount of channels*/
    channel_warn: 3,
    /**Delete if text sent in X amount of messages*/
    channel_extr: 6
};

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

        //if thresholds have been reached
        this.extr_exceeded = false;
        this.warn_exceeded = false;

        //delete MessageGroup after 5 minutes of inactivity
        this.expiration_time = 300000;

        //whether or not group is actively circulating among temp groups
        this.active = true;

        //action status and activator user's ID
        this.delete = { active: false, user_id: '' };
        this.jail = { active: false, user_id: '' };
        this.ban = { active: false, user_id: '' };
        this.ignore = { active: false, user_id: '' };

        /**@type {Message} Info embed sent in admin channel*/
        this.info_message = null;
    }

    /**Update info embed, check thresholds and perform necessary actions*/
    async handleSpam() {
        //if Ignore is active, deactivate other actions
        this.delete.active = this.delete.active && !this.ignore.active;
        this.jail.active = this.jail.active && !this.ignore.active;
        this.ban.active = this.ban.active && !this.ignore.active;

        let channels_field = ``;
        this.channels.forEach((channel_data, channel_id) => {
            //format channels field
            channels_field += `<#${channel_id}> - ${channel_data.count} ${channel_data.count === 1 ? 'time' : 'times'}\n`;

            //if delete action taken, bulk delete messages from this channel
            if (this.delete.active) {
                channel_data.channel.bulkDelete(channel_data.messages).catch(logUnlessUnknown);
            }
        });

        //store promise calls
        const promises = [];
        
        let senders_field = '';
        this.senders.forEach(async (sender_data, sender_id) => {
            //format senders field
            senders_field += `<@${sender_id}> - ${sender_data.count} ${sender_data.count === 1 ? 'time' : 'times'}\n`;

            const { member } = sender_data;

            //if ban action taken, ban senders
            if (this.ban.active && member.manageable && !isAdmin(member)) {
                promises.push(
                    member.ban({
                        reason: this.ban.reason,
                        days: this.ban.days
                    }).catch(console.error)
                );
            }
            //otherwise if jail action taken, jail senders
            else if (this.jail.active && !member.roles.cache.has(ids.roles.jailed) && member.manageable && !isAdmin(member)) {
                promises.push(
                    jailMember(
                        member, 
                        { id: ids.client, tag: 'GudBot#4788' },
                        this.jail.reason,
                        this.jail.duration
                    ).catch(console.error)
                );
            }
        });

        //format original content as quote if not done so already
        this.content_quote = this.content_quote ?? `> ${this.original_content.trim().replace(/\n/g, '\n> ')}`;

        //create info embed
        const embed = new MessageEmbed()
            .setColor(
                this.ignore.active ? colors.gray :
                this.ban.active ? colors.black : 
                this.jail.active ? colors.green :
                this.delete.active ? colors.red :
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
        if (this.delete.user_id) actions_field_str += `Delete - <@${this.delete.user_id}>\n`;
        if (this.jail.user_id) actions_field_str += `Jail - <@${this.jail.user_id}>\n`;
        if (this.ban.user_id) actions_field_str += `Ban - <@${this.ban.user_id}>\n`;
        if (this.ignore.user_id) actions_field_str += `Ignore - <@${this.ignore.user_id}>\n`;

        //add/update Actions field
        if (actions_field_str) {
            //get rid of unnecessary linebreak at the end
            actions_field_str = actions_field_str.trim();

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
            .setDisabled(this.delete.active || this.ignore.active);

        const jail = new MessageButton()
            .setLabel('Jail')
            .setStyle(ButtonStyle.Success)
            .setCustomId(`spamActionJail|${this.id}`)
            .setDisabled(this.jail.active || this.ignore.active || this.ban.active); //disable jail button if ban action is active

        const ban = new MessageButton()
            .setLabel('Ban')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`spamActionBan|${this.id}`)
            .setDisabled(this.ban.active || this.ignore.active);

        const ignore = new MessageButton()
            .setLabel('Ignore')
            .setStyle(ButtonStyle.Secondary)
            .setCustomId(`spamActionIgnore|${this.id}`)
            .setDisabled(this.ignore.active);

        //update existing info message
        if (this.info_message) {
            promises.push(
                this.info_message
                    .edit({
                        embeds: [embed],
                        components: [new MessageActionRow().addComponents([del, jail, ban, ignore])]
                    })
                    .catch(console.error)
            );
        }
        //send new info message
        else {
            promises.push(
                getCachedChannel(ids.channels.admin)
                    .send({
                        embeds: [embed],
                        components: [new MessageActionRow().addComponents([del, jail, ban, ignore])]
                    })
                    .then(message => this.info_message = message)
                    .catch(console.error)
            );
        }

        await Promise.all(promises);
    }

    /**
     * Add message to group and update
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

        const channel_count = this.channels.size;
        //check extreme threshold
        if (!this.extr_exceeded) 
            this.extr_exceeded = this.total_count >= thresholds.message_extr || channel_count >= thresholds.channel_extr;
        //check warning threshold
        if (!this.warn_exceeded) 
            this.warn_exceeded = this.total_count >= thresholds.message_warn || channel_count >= thresholds.channel_warn;

        //only do any kind of actions if warning threshold reached, since otherwise there wouldve been no way to interact with message group
        if (this.warn_exceeded) {

            //if extreme threshold exceeded and Ignore action not taken
            if (this.extr_exceeded && !this.ignore.active) {
                //activate Delete action
                this.delete.active = true;
                this.delete.user_id = ids.client;
            }

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
        .replace(/(?:\s|<:\w+:\d+>|\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu, '');

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
        .replace(/(?:\s|<:\w+:\d+>|\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu, '');

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
            //console.log(group);

            //if group has passed some spam threshold
            if (group?.warn_exceeded) {
                //increase expiration time to 24 hours
                group.expiration_time = 86400000;
                //mark group as inactive
                group.active = false;
                //add to spam groups
                spam_groups.push(group);
            }
        }
    }
    //console.log(temp_groups);
    //console.log('\n');
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

module.exports = {
    getMessageGroupById,
    getMessageGroupByContent,
    addToMessageGroups,
    filterMessageGroups
};