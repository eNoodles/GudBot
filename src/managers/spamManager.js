const { ButtonStyle } = require("discord-api-types/v10");
const { Message, Collection, GuildMember, TextChannel, MessageEmbed, MessageButton, MessageActionRow } = require("discord.js");
const { trimWhitespace, ids, logUnlessUnknown, colors, getCachedChannel, isAdmin } = require("../utils");
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
 * K: Message group ID = First Message's ID
 * V: Message group
 * @type {Collection<string,MessageGroup>}
 */
let message_groups = new Collection();

class MessageGroup {
    /**
     * @param {Message} message 
     * @param {string} sterilized_content
     */
    constructor(message, sterilized_content) {
        //group's ID = first message's ID
        this.id = message.id;
        //unmodified content of first message formatted as a quote for info embed
        this.content_quote = `> ${message.content.replace(/\n/g, '\n> ')}`;
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

        //if group is active and should still be compared to new messages
        this.active = true;

        //delete/deactivate MessageGroup after X milliseconds of inactivity
        this.expiration_time = 30000;

        //action status and activator user's ID
        this.delete = { active: false, user_id: '' };
        this.jail = { active: false, user_id: '' };
        this.ban = { active: false, user_id: '' };
        this.ignore = { active: false, user_id: '' };

        /**@type {Message} Info embed sent in admin channel*/
        this.info_message = null;
    }

    /**Update info embed, check thresholds and perform necessary actions*/
    async update() {
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
        if (this.delete.user_id) actions_field_str += `\`DELETE\` - <@${this.delete.user_id}>\n`;
        if (this.jail.user_id) actions_field_str += `\`JAIL\` - <@${this.jail.user_id}>\n`;
        if (this.ban.user_id) actions_field_str += `\`BAN\` - <@${this.ban.user_id}>\n`;
        if (this.ignore.user_id) actions_field_str += `\`IGNORE\` - <@${this.ignore.user_id}>\n`;

        //add/update Actions field
        if (actions_field_str) {
            //get rid of unnecessary linebreak at the end
            actions_field_str = trimWhitespace(actions_field_str);

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
                this.info_message.edit({
                    embeds: [embed],
                    components: [new MessageActionRow().addComponents([del, jail, ban, ignore])]
                }).catch(console.error)
            );
        }
        //send new info message
        else {
            promises.push(
                getCachedChannel(ids.channels.admin).send({
                    embeds: [embed],
                    components: [new MessageActionRow().addComponents([del, jail, ban, ignore])]
                }).catch(console.error)
            );
        }

        await Promise.all(promises);
    }

    /**
     * Add message to group and update
     * @param {Message} message 
     */
    async add(message) {
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
        //check that extreme threshold has been exceeded and Ignore action has not been taken
        if (!this.extr_exceeded && !this.ignore) 
            this.extr_exceeded = this.total_count >= thresholds.message_extr || channel_count >= thresholds.channel_extr;
        //check warning threshold
        if (!this.warn_exceeded) 
            this.warn_exceeded = this.total_count >= thresholds.message_warn || channel_count >= thresholds.channel_warn;

        //only do any kind of actions if warning threshold reached, since otherwise there wouldve been no way to interact with message group
        if (this.warn_exceeded) {
            //increase expiration time to 60 seconds
            this.expiration_time = 60000;

            //if extreme threshold exceeded
            if (this.extr_exceeded) {
                //increase expiration time to 90 seconds
                this.expiration_time = 90000;

                //if Ignore isnt active, activate Delete action
                if (!this.ignore.active) {
                    this.delete.active = true;
                    this.delete.user_id = ids.client;
                }
            }

            //update embed and take actions
            await this.update();
        }
    }
}

/**
 * @param {string} id MessageGroup ID = First Message's ID
 * @returns {MessageGroup|undefined}
 */
function getMessageGroup(id) {
    return message_groups.get(id);
}

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

    //find ACTIVE message group with matching sterilized content
    const found_group = message_groups.find(group => group.active && group.sterilized_content === sterilized_content);

    //if message group found, add this message to it
    if (found_group)
        await found_group.add(message);
    //otherwise create new message group, use message's ID as the MessageGroup's ID
    else
        message_groups.set(message.id, new MessageGroup(message, sterilized_content));
}

/**Filters out expired MessageGroups.*/
function checkMessageGroups() {
    const current_time = new Date().getTime();
    message_groups.forEach((group, id) => {
        //milliseconds passed since group was created
        const active_time = current_time - group.updated_timestamp;

        //if active time is greater than 30, 60 or 90 seconds depending on reached threshold
        const expired = active_time > group.expiration_time;

        //delete groups that did not reach the warning threshold and are beyond expiration time OR any groups that are older than 24 hours
        if (!group.warn_exceeded && expired || active_time > 86400000)
            message_groups.delete(id);
        //otherwise- group reached warning threshold, but is beyond expiration time
        else if (expired)
            group.active = false;
    });
}

module.exports = {
    getMessageGroup,
    addToMessageGroups,
    checkMessageGroups
};