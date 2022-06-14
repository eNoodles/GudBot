const { Client, Intents, MessageAttachment, MessageEmbed, MessageActionRow, MessageButton, MessageSelectMenu, Constants } = require('discord.js');
const client = new Client({ 
    intents: [
        Intents.FLAGS.GUILDS, 
        Intents.FLAGS.GUILD_MEMBERS, 
        Intents.FLAGS.GUILD_BANS,
        Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS, 
        Intents.FLAGS.GUILD_INTEGRATIONS, 
        Intents.FLAGS.GUILD_INVITES,
        Intents.FLAGS.GUILD_PRESENCES, 
        Intents.FLAGS.GUILD_MESSAGES, 
        Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
        Intents.FLAGS.GUILD_MESSAGE_TYPING,
        Intents.FLAGS.DIRECT_MESSAGES,
        Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
        Intents.FLAGS.DIRECT_MESSAGE_TYPING],
    partials: ['MESSAGE', 'CHANNEL', 'REACTION']
});
const Sequelize = require('sequelize');
const sequelize = new Sequelize('mysql://u3235_x1sQdjX1UK:MX@!S+1DX2mkA^3cmGRNDaw+@138.201.82.201:3306/s3235_gudbot', {logging: false});
const Op = Sequelize.Op;
const Tatsu = require('tatsu');
const weebo = new Tatsu(process.env.TATSU_TOKEN);
const dotenv = require('dotenv').config();
//const Canvas = require('canvas');

const wordbank = sequelize.define('wordbank', {
    word: Sequelize.STRING,
    type: Sequelize.STRING,
    addedBy: Sequelize.STRING
});
const whitelist = sequelize.define('whitelist', {
    id: {
        type: Sequelize.STRING(185),
        unique: true,
        primaryKey: true,
    },
    type: Sequelize.STRING,
    addedBy: Sequelize.STRING
});
const starboard = sequelize.define('starboards', {
    id: {
        type: Sequelize.STRING(185),
        unique: true,
        primaryKey: true,
    },
    original_id: {
        type: Sequelize.STRING(185),
        unique: true
    },
    channel_id: Sequelize.STRING(185),
    author_id: Sequelize.STRING(185),
    count: Sequelize.INTEGER,
    hasImage: Sequelize.BOOLEAN,
    hasAttachment: Sequelize.BOOLEAN,
    url: Sequelize.STRING
});
const rolebank = sequelize.define('rolebank', {
    user_id: Sequelize.STRING,
    role_id: Sequelize.STRING,
    role_name: Sequelize.STRING
});

/*
860181373468540948 - GM admin casual chat
828322073256132669 - KGB privatetest
*/

const gm_gID = '364164445657890816';

const intro_chID = '883882213714837514';//'883882213714837514';
const rules_chID = '552982479212904448';
const dl_chID = '486202559951011870';
const dldb_chID = '607310581053128717';
const mod_chID = '860181373468540948';
const star_chID = '888515334015942676';

const lurker_rID = '523883593978609704';
const gmteam_rID = '409531885119864832';
const intern_rID = '746694387752501249';
const jailed_rID = '603983150011514979';
const muted_rID = '606870055770390538';
const blankicon_rID = '894731175216701450';

const red = 0xff0000;
const green = 0x33cc33;
const gray = 0x999999;
const purple = 0x9f36c2;

const img_regex = /https?:\/\/\S+\.(?:png|jpg|jpeg|gif)\S*/i;

let gudmods;

let thresholds = {
    warn_messages : 4, //text sent in X amount of messages
    warn_channels : 3, //text sent in X amount of channels
    extr_messages : 8,
    extr_channels : 6
};

let potential_words = '';

let extreme_words = '';

client.once('ready', async () => {
	wordbank.sync();
    whitelist.sync();
    starboard.sync();
    rolebank.sync();

    const potential = await wordbank.findAll({ where: { type: 'potential' } });
    const extreme = await wordbank.findAll({ where: { type: 'extreme' } });

    for (let i = 0; i < potential.length; i++) {
        potential_words += `${i === 0 ? '' : '|'}${potential[i].get('word')}`;
    }
    for (let i = 0; i < extreme.length; i++) {
        extreme_words += `${i === 0 ? '' : '|'}${extreme[i].get('word')}`;
    }

    gudmods = client.guilds.cache.get(gm_gID);
    //gudmods?.commands.set([]);
    gudmods?.commands.create({
        name: 'detector-add',
        description: 'Adds word to database.',
        options: [
            {
                name: 'word',
                description: 'The word or regular expression you want to add to the wordbank.',
                type: Constants.ApplicationCommandOptionTypes.STRING,
                required: true
            },
            {
                name: 'type',
                description: 'extreme/potential ("extreme" words are autodeleted, "potential" just emit warnings)',
                type: Constants.ApplicationCommandOptionTypes.STRING,
                choices: [{ name: 'extreme', value: 'extreme' }, { name: 'potential', value: 'potential' }],
                required: true
            }
        ],
        defaultPermission: false
    })/* .then(command => JannifyCommand(command)) */;

    gudmods?.commands.create({
        name: 'detector-remove',
        description: 'Removes word from database.',
        options: [
            {
                name: 'word',
                description: 'The word or regular expression you want to add to the wordbank.',
                type: Constants.ApplicationCommandOptionTypes.STRING,
                required: true
            }
        ],
        defaultPermission: false
    })/* .then(command => JannifyCommand(command)) */;

    gudmods?.commands.create({
        name: 'detector-whitelist',
        description: 'Adds user/channel to whitelist.',
        options: [
            {
                name: 'what',
                description: 'The user or channel you want to whitelist.',
                type: Constants.ApplicationCommandOptionTypes.STRING,
                required: true
            }
        ],
        defaultPermission: false
    })/* .then(command => JannifyCommand(command)) */;

    gudmods?.commands.create({
        name: 'detector-unwhitelist',
        description: 'Removes user/channel from whitelist.',
        options: [
            {
                name: 'what',
                description: 'The user or channel you want to unwhitelist.',
                type: Constants.ApplicationCommandOptionTypes.STRING,
                required: true
            }
        ],
        defaultPermission: false
    })/* .then(command => JannifyCommand(command)) */;

    gudmods?.commands.create({
        name: 'detector-list',
        description: 'Displays all data from offensive language detector database.',
        options: [
            {
                name: 'ephemeral',
                description: 'Set this to true if you want the reply to only be visible to you.',
                type: Constants.ApplicationCommandOptionTypes.BOOLEAN
            }
        ],
        defaultPermission: false
    })/* .then(command => JannifyCommand(command)) */;

    /* gudmods?.commands.create({
        name: 'test',
        description: 'nothin to see here',
        defaultPermission: false
    }).then(command => {
        const permissions = [
            {
                id: '206024596997144576',
                type: 'USER',
                permission: true
            },
        ];
        command.permissions.add({permissions});
    }); */

    gudmods?.commands.create({
        name: 'jail',
        description: 'Jail user and strip them of their roles / Unjail and restore their roles',
        options: [
            {
                name: 'user',
                description: 'Server member to jail/unjail.',
                type: Constants.ApplicationCommandOptionTypes.USER,
                required: true
            },
            {
                name: 'reason',
                description: 'Reason for jailing, will be visible in audit log.',
                type: Constants.ApplicationCommandOptionTypes.STRING
            }
        ],
        //defaultPermission: false
    })/* .then(command => JannifyCommand(command)) */;

    gudmods?.commands.create({
        name: 'Toggle role icon',
        type: 'USER'
    });

    gudmods?.commands.create({
        name: 'Jail',
        type: 'USER',
        defaultPermission: false
    })/* .then(command => JannifyCommand(command)) */;

    console.log(`Logged in as ${client.user.tag}`);
});

function JannifyCommand(command) {
    const permissions = [
        {
            id: gmteam_rID,
            type: 'ROLE',
            permission: true
        },
        {
            id: intern_rID,
            type: 'ROLE',
            permission: true
        },
    ];
    command.permissions.add({permissions});
}

function HasRole(member, id) {
    if (!member) return false;

    return member.roles.cache.some(r => 
        r.id === id
    );
}

async function HasJannyRole(id) {
    //find guild member with given id
    const member = await gudmods.members.fetch(id);

    if (!member) return false;

    return member.roles.cache.some(role => 
        role.name === "The GM Team" ||
        role.name === "The GM Interns" ||
        role.name === "Hackerman" ||
        role.name === "Bob the Builder"
    );
}

async function JailMemberInteraction(interaction) {
    const member = interaction.options.getMember('user');

    //no jailing GM Team (or interns jailing themselves)
    if ( HasRole(member, gmteam_rID) || HasRole(member, intern_rID) && !HasRole(interaction.member, gmteam_rID) ) {  
        interaction.reply({ content: 'https://media.discordapp.net/attachments/840211595186536478/889653037201760326/nochamp.gif', ephemeral: true });
        return;
    }

    //unjail
    if ( HasRole(member, jailed_rID) ) {
        const reason = `Unjailed by ${interaction.user.tag} ${interaction.options?.getString('reason') ? `for: ${interaction.options.getString('reason')}` : ''}`;

        //assign member's saved role IDs to an array
        let role_ids = [];
        const rolebank_entries = await rolebank.findAll({ where: { user_id: member.id } });
        if (rolebank_entries.length > 0) {
            for (let i = 0; i<rolebank_entries.length; i++) {
                role_ids.push( rolebank_entries[i].get('role_id') );
            }
        }

        //restore member's saved roles
        member.roles.add( role_ids, reason ).then(member => {
            //if all roles successfully added, remove jailed role
            member.roles.remove(jailed_rID, reason).then(member => {
                const embed = new MessageEmbed()
                    .setDescription(`Unjailed <@${member.id}> and restored roles.`)
                    .setColor(green);
                interaction.reply({ embeds: [embed], ephemeral: true });
            })
            .catch(error => {
                console.log(error);
    
                const embed = new MessageEmbed()
                    .setDescription(`Something has gone wrong, failed to remove role <@&${jailed_rID}> from <@${member.id}>`)
                    .setFooter('User satisfaction is not guaranteed.')
                    .setColor(red);
                interaction.reply({ embeds: [embed], ephemeral: true });
            }); 
        }).catch(error => {
            console.log(error);

            const embed = new MessageEmbed()
                .setDescription(`Something has gone wrong, failed to restore <@${member.id}>'s roles.`)
                .setFooter('User satisfaction is not guaranteed.')
                .setColor(red);
            interaction.reply({ embeds: [embed], ephemeral: true });
        });
    }
    //jail
    else {
        const reason = `Jailed by ${interaction.user.tag} ${interaction.options?.getString('reason') ? `for: ${interaction.options.getString('reason')}` : ''}`;

        //save member's roles in DB (clear beforehand), if something goes wrong return
        await rolebank.destroy({ where: { user_id: member.id } }).catch(error => {
            console.log(error);

            const embed = new MessageEmbed()
                .setDescription(`Something has gone wrong, failed to save <@${member.id}>'s roles in database before jailing.`)
                .setFooter('User satisfaction is not guaranteed.')
                .setColor(red);
            interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        });

        const roles = member.roles.cache;
        roles.forEach( async role => {
            await rolebank.create({
                user_id: member.id,
                role_id: role.id,
                role_name: role.name
            }).catch(error => {
                console.log(error);

                const embed = new MessageEmbed()
                    .setDescription(`Something has gone wrong, failed to save <@${member.id}>'s roles in database before jailing.`)
                    .setFooter('User satisfaction is not guaranteed.')
                    .setColor(red);
                interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            });
        });
        
        //remove member's roles
        member.roles.remove( member.roles.cache, reason ).then(member => {
            //if all roles successfully removed, add jailed role
            member.roles.add(jailed_rID, reason).then(member => {
                const embed = new MessageEmbed()
                    .setDescription(`Stripped and jailed <@${member.id}>`)
                    .setColor(green);
                interaction.reply({ embeds: [embed], ephemeral: true });
            })
            .catch(error => {
                console.log(error);
    
                const embed = new MessageEmbed()
                    .setDescription(`Something has gone wrong, failed to add role <@&${jailed_rID}> to <@${member.id}>`)
                    .setFooter('User satisfaction is not guaranteed.')
                    .setColor(red);
                interaction.reply({ embeds: [embed], ephemeral: true });
            }); 
        }).catch(error => {
            console.log(error);

            const embed = new MessageEmbed()
                .setDescription(`Something has gone wrong, failed to strip <@${member.id}> of his roles.`)
                .setFooter('User satisfaction is not guaranteed.')
                .setColor(red);
            interaction.reply({ embeds: [embed], ephemeral: true });
        });
    }
}

function GetMemberFullName(member) {
    if (!member)
        return 'member not found';

    return `${member.nickname ? `${member.nickname} (${member.user.username})` : member.user.username}`;
}

/*client.on("guildMemberAdd", async member => {
    if (member.user.bot) return;

    const embed = new MessageEmbed()
        .setColor(purple)
        .setTitle(`Welcome to GudMods™!`)
        .setAuthor(
            member.user.username, 
            member.user.avatarURL() ? member.user.avatarURL() : 'https://cdn.discordapp.com/embed/avatars/1.png'
        )
        .setThumbnail('https://media.discordapp.net/attachments/552982479212904448/870766766228377670/Logo2.png')
        .setDescription(`At first, you'll only be able to interact in a minimal amount of channels, but don't worry - post in <#${intro_chID}> and an admin will be with you and grant you access to the rest of the server as soon as possible.\n\nIn the meantime, please acquaint yourself with the <#${rules_chID}> and, if you are here looking for a specific file, take a look at <#${dl_chID}> or <#${dldb_chID}>, which are filled with all the mods and lexars you could ever dream of. Oh, and give the [GudMods™️ theme song](https://discord.com/channels/364164445657890816/888383950702149662/888476181752598579) a listen!\n\n**Thank you for coming and we hope you enjoy your stay <@${member.id}>!**`)
        .setImage('https://media.discordapp.net/attachments/606876183832952918/882324441781121104/redarrow.png')
        .setTimestamp(member.user.createdTimestamp);

    if ( member.joinedAt - member.user.createdAt <= 604800000 )
        embed.setFooter('Account created', 'https://cdn.discordapp.com/attachments/409507333824315392/864636785564844103/image0.gif');
    else
        embed.setFooter('Account created');

    client.channels.fetch(intro_chID).then(async channel => {
        await channel.send({embeds: [embed]}).catch(console.error);
        ghostping = await channel.send({content: `<@${member.id}>`}).catch(console.error);
        await new Promise(r => setTimeout(r, 100));
        ghostping.delete().catch(console.error);
    }).catch(console.error);
});*/

async function UpdateStarboard(reaction, user) {
    if (user.id === reaction.message.author.id) {
        reaction.users.remove(user.id).catch(console.error);
        return;
    }

    const star_ch = await client.channels.fetch(star_chID).catch(console.error);
    if (!star_ch) return;

    const starboard_entry = await starboard.findOne({ where: { original_id: reaction.message.id } });

    if (reaction.count < 3) {
        if (starboard_entry) {
            star_ch.messages.fetch( starboard_entry.get('id') ).then(message => {
                message.delete().catch(console.error);
            }).catch(console.error);
            starboard_entry.destroy();
        }
        return;
    }

    let embed = new MessageEmbed()
        .setColor(reaction.message.member ? reaction.message.member.displayHexColor : gray)
        .setTitle(`#${reaction.message.channel.name}`)
        //.setURL(reaction.message.url)
        .setAuthor(
            reaction.message.member ? GetMemberFullName(reaction.message.member) : reaction.message.author.username ? reaction.message.author.username : reaction.message.author.id, 
            reaction.message.author.avatarURL() ? reaction.message.author.avatarURL() : 'https://cdn.discordapp.com/embed/avatars/1.png'
        )
        .setDescription(reaction.message.content)
        .setFooter(`⭐${reaction.count}`/*, 'https://media.discordapp.net/attachments/828322073256132669/891494179375554580/discordstarsvg.png'*/)
        .setTimestamp(reaction.message.createdTimestamp);

    let regex;
    if (reaction.message.attachments.size > 0) {
        if (regex = reaction.message.attachments.first().url.match(img_regex)) 
        //if (reaction.message.attachments.first().contentType === 'image')
            embed.setImage(reaction.message.attachments.first().url);
        else
            embed.addField('Attachment', `[${reaction.message.attachments.first().name}](${reaction.message.attachments.first().url})`)
    }
    else if (regex = reaction.message.content.match(img_regex))
        embed.setImage(regex[0]);

    let link = new MessageButton()
        .setLabel('Open')
        .setStyle('LINK')
        .setURL(reaction.message.url);

    if (starboard_entry) {
        let message = await star_ch.messages.fetch( starboard_entry.get('id') ).catch(console.error);
        if (!message) return;
        
        message.edit({ 
            embeds: [embed],
            components: [new MessageActionRow().addComponents([link])]
        }).catch(console.error);

        starboard_entry.set('count', reaction.count);
        starboard_entry.set('hasImage', !!regex);
    }
    else {
        let sent = await star_ch.send({ 
            embeds: [embed],
            components: [new MessageActionRow().addComponents([link])]
        }).catch(console.error);

        if (!sent) return;
        
        try {
            starboard.create({
                id: sent.id,
                original_id: reaction.message.id,
                channel_id: reaction.message.channel.id,
                author_id: reaction.message.author.id,
                count: reaction.count,
                hasImage: !!regex,
                hasAttachment: reaction.message.attachments.size > 0,
                url: reaction.message.url
            });
        }
        catch (e) {
            console.log(e);
            sent.delete().catch(console.error);
        }     
    }
}

client.on("messageReactionAdd", async (reaction, user) => {
    if (reaction.message.partial) await reaction.message.fetch().catch(console.error);
    if (reaction.partial) await reaction.fetch().catch(console.error);
    if (reaction.message.guild.id !== gm_gID) return;
    if (user.bot) return;

    if (reaction.emoji.name === '⭐') UpdateStarboard(reaction, user);
});

client.on("messageReactionRemove", async (reaction, user) => {
    if (reaction.message.partial) await reaction.message.fetch().catch(console.error);
    if (reaction.partial) await reaction.fetch().catch(console.error);
    if (reaction.message.guild.id !== gm_gID) return;
    if (user.bot) return;

    if (reaction.emoji.name === '⭐') UpdateStarboard(reaction, user);
});

class MsgGroup {
    constructor(msgContent, msgID, msgChannelID, msgAuthorID, msgTimestamp/*, att_path*/) {
        //this.dups = [message]; //store all duplicate message objects (also used to get total count)
        this.id = msgID; //MsgGroup ID = ID of first message
        this.count = 1; //universal count
        this.content = msgContent;
        this.channels = {}; //key- channel ID, value- count sent in channel
        this.senders = {}; //key- sender ID, value- count sent by sender
        this.channels[msgChannelID] = [msgID];
        this.senders[msgAuthorID] = 1;
        this.timestamp = msgTimestamp;
        //this.attachment = att_path;

        let remove_emotes = msgContent.split(/<:\w+:\d+>/g).join('');
        remove_emotes = remove_emotes.split(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu).join('');
        this.emotes = !remove_emotes.match(/\w+/);

        this.actions = [false,false,false,false,false];
        /*
        [0] - delete
        [1] - jail
        [2] - mute
        [3] - ban
        [4] - ignore
        */
    }
}

class MsgGroupArray {
    constructor(max) {
        this.groups = [];
        this.max = max;
        this.pushback = function(msgGroup) { 
            //adds new msgGroup to the end of array, while mantaining length <= max

            let length = this.groups.push(msgGroup);
            
            if ( length > this.max ) {
                this.groups.shift();
            }
        };
        this.findByText = function(text) {
            //looks for MsgGroup with matching content
            //returns index if found, -1 if not

            for (let i = 0; i < this.groups.length; i++) {
                if ( this.groups[i].content.toLowerCase() === text.toLowerCase() ) {
                    return i;
                }
            }
            return -1;
        };
        this.findByID = function(ID) {
            //looks for MsgGroup with matching ID
            //returns index if found, -1 if not
    
            for (let i = 0; i < this.groups.length; i++) {
                if ( this.groups[i].content.toLowerCase() === ID.toLowerCase() ) {
                    return i;
                }
            }
            return -1;
        };
        this.increment = function(index, msgID, msgChannelID, msgAuthorID) {
            //move to top of array
            this.groups.push( this.groups[index] ); //copy MsgGroup at index to top of array
            this.groups.splice(index, 1); //remove original copy
            index = this.groups.length-1; //update index

            //add new duplicate message
            //this.groups[index].dups.push(message);

            this.groups[index].count++; //increase universal count

            //create new channel counter property or increment existing
            //rewritten to keep track of msg IDs instead of just a counter
            if ( !this.groups[index].channels[msgChannelID] )
                this.groups[index].channels[msgChannelID] = [msgID];
            else
                this.groups[index].channels[msgChannelID].push(msgID);

            //create new sender counter property or increment existing
            if ( !this.groups[index].senders[msgAuthorID] )
                this.groups[index].senders[msgAuthorID] = 1;
            else
                this.groups[index].senders[msgAuthorID]++;

            //check if thresholds have been exceeded
            let group = this.groups[index];
            let ch_count = Object.keys(group.channels).length;

            const extr_exceeded = (group.count >= thresholds.extr_messages || ch_count >= thresholds.extr_channels) && !group.emotes/* && !group.attachment*/;
            const warn_exceeded = group.count >= thresholds.warn_messages || ch_count >= thresholds.warn_channels;

            if ( warn_exceeded ) {
                /*
                if (extr_exceeded) {
                    for (let i = 0; i < group.count; i++) {
                        group.dups[i].delete().catch(console.error);
                    }
                }*/

                let channels_field = ``;
                for (const prop in group.channels) {
                    if ( group.channels.hasOwnProperty(prop) ) {
                        //generate description for channels field
                        channels_field += `<#${prop}> - ${group.channels[prop].length} ${group.channels[prop].length === 1 ? 'time' : 'times'}\n`;

                        //autodelete if extreme threshold exceeded
                        if (extr_exceeded) {
                            //property name = channel ID
                            //property value = array of message IDs
                            client.channels.fetch(prop).then(channel => {
                                channel.bulkDelete(group.channels[prop])/*.then(delete this.groups[index].channels[prop])*/.catch(error => {
                                    console.log(error);
                                    if (error.code !== 10008) {
                                        const embed = new MessageEmbed()
                                            .setColor(red)
                                            .setTitle('Error')
                                            .setDescription('Failed to bulk delete messages.');
            
                                        client.channels.fetch(mod_chID).then(channel => {
                                            channel.send({embeds: [embed]}).catch(console.error);
                                        }).catch(console.error); 
                                    }
                                });
                            }).catch(console.error);
                        }
                    }
                }

                //generate description for senders field
                let senders_field = ``;
                for (const prop in group.senders) {
                    if ( group.senders.hasOwnProperty(prop) ) {
                        senders_field += `<@${prop}> - ${group.senders[prop]} ${group.senders[prop] === 1 ? 'time' : 'times'}\n`;
                    }
                }

                /*
                0xff6363
                0xff4a4a
                0xff3b3b
                0xff2121
                0xde0000
                */
                let color;
                switch (group.count) {
                    case 4: 
                        color = 0xff6363;
                        break;
                    case 5:
                        color = 0xff4a4a;
                        break;
                    case 6:
                        color = 0xff3b3b;
                        break;
                    case 7:
                        color = 0xff2121;
                        break;
                    default:
                        color = 0xde0000;
                }

                let embed = new MessageEmbed()
                    .setColor(color)
                    .setTitle("Potential spam detected!")
                    //.setDescription(`${group.attachment ? '' : `> ${group.content}\n\n`}Total times sent: ${group.count}`) //TO-DO: CHAR COUNT CHECK
                    .setDescription(`> ${group.content}\n\nTotal times sent: ${group.count}`) //TO-DO: CHAR COUNT CHECK
                    .addField('Channels', channels_field)
                    .addField('Senders', senders_field)
                    .setFooter('First sent', 'https://cdn.discordapp.com/emojis/870653452001366057.png')
                    .setTimestamp(group.timestamp);
                
                if (group.attachment)
                    embed.setImage(group.attachment);

                let del = new MessageButton()
                    .setLabel('Delete')
                    .setStyle('DANGER')
                    .setCustomId(`gudbot_group_action_del_${group.id}`);

                let jail = new MessageButton()
                    .setLabel('Jail')
                    .setStyle('SUCCESS')
                    .setCustomId(`gudbot_group_action_jail_${group.id}`);

                let mute = new MessageButton()
                    .setLabel('Mute')
                    .setStyle('PRIMARY')
                    .setCustomId(`gudbot_group_action_mute_${group.id}`);

                let ban = new MessageButton()
                    .setLabel('Ban')
                    .setStyle('PRIMARY')
                    .setCustomId(`gudbot_group_action_ban_${group.id}`);

                let ignore = new MessageButton()
                    .setLabel('Ignore')
                    .setStyle('SECONDARY')
                    .setCustomId(`gudbot_group_action_ignore_${group.id}`);
                
                if ( group.warning_msg ) {
                    //if warning already sent, edit existing
                    group.warning_msg.edit({ 
                        embeds: [embed], 
                        components: [new MessageActionRow().addComponents([del, jail, mute, ban, ignore])] 
                    }).catch(console.error);
                }
                else {
                    //send new warning
                    client.channels.fetch(mod_chID).then(channel => {
                        channel.send({ 
                            embeds: [embed], 
                            components: [new MessageActionRow().addComponents([del, jail, mute, ban, ignore])] 
                        }).then(message => {
                            this.groups[index].warning_msg = message;
                        }).catch(console.error);
                    }).catch(console.error); 
                }
            }
        };
    }
}

let Recents = new MsgGroupArray(10);

client.on('interactionCreate', async interaction => {
    if (interaction.applicationId !== client.application.id) return;
    const i_user_id = interaction.user.id;

    if (interaction.isContextMenu()) {
        if ( interaction.commandName === 'context-test' ) {
            const targetMessage = interaction.options.getMessage('message');
            const embed = new MessageEmbed()
                .setDescription(targetMessage.content)
                .setAuthor(targetMessage.author.username, targetMessage.author.avatarURL())
                .setTimestamp(targetMessage.createdTimestamp);
            interaction.reply({embeds: [embed], ephemeral: true});
        }
        else if ( interaction.commandName === 'Jail' ) {
            JailMemberInteraction(interaction);
        }
        else if ( interaction.commandName === 'Toggle role icon' ) {
            const member = interaction.options.getMember('user');

            if (i_user_id === member.id || await HasJannyRole(i_user_id) ) {
                if ( HasRole(member, blankicon_rID) ) {
                    member.roles.remove(blankicon_rID, 'Toggle role icon').then(member => {
                        const embed = new MessageEmbed()
                            .setDescription(`Enabled role icon visibility for <@${member.id}>`)
                            .setColor(green);

                        interaction.reply({embeds: [embed], ephemeral: true});
                    }).catch(error => {
                        console.log(error);

                        const embed = new MessageEmbed()
                            .setDescription(`Something has gone wrong, failed to remove role <@&${blankicon_rID}> from <@${member.id}>`)
                            .setFooter('User satisfaction is not guaranteed.')
                            .setColor(red);

                        interaction.reply({embeds: [embed], ephemeral: true});
                    });
                }
                else {
                    member.roles.add(blankicon_rID, 'Toggle role icon').then(member => {
                        const embed = new MessageEmbed()
                            .setDescription(`Disabled role icon visibility for <@${member.id}>`)
                            .setColor(green);

                        interaction.reply({embeds: [embed], ephemeral: true});
                    }).catch(error => {
                        console.log(error);

                        const embed = new MessageEmbed()
                            .setDescription(`Something has gone wrong, failed to add role <@&${blankicon_rID}> to <@${member.id}>`)
                            .setFooter('User satisfaction is not guaranteed.')
                            .setColor(red);

                        interaction.reply({embeds: [embed], ephemeral: true});
                    }); 
                }
            }
            else interaction.reply({content: "https://tenor.com/view/power-lord-of-the-rings-lotr-gif-9197188", ephemeral: true});
        }
    }
    else if (interaction.isCommand()) {
        if ( interaction.commandName.startsWith('detector') ) {
            if ( await HasJannyRole(i_user_id) ) {
                const regex = interaction.commandName.match(/detector-(add|remove|whitelist|unwhitelist|list)/);
                if (regex) {
                    const add = regex[1] === 'add';
                    const remove = regex[1] === 'remove';
                    const whitelist_param = regex[1] === 'whitelist'; //not to confuse with whitelist database model
                    const unwhitelist = regex[1] === 'unwhitelist';
                    const list = regex[1] === 'list';
    
                    if (add) {
                        const word = interaction.options.getString('word');
                        const type = interaction.options.getString('type');
                        await wordbank.create({
                            word: word,
                            type: type,
                            addedBy: i_user_id
                        });

                        if (type === 'extreme')
                            extreme_words += `${extreme_words === '' ? '' : '|'}${word}`;
                        else if (type === 'potential') potential_words += `${potential_words === '' ? '' : '|'}${word}`;
                        else {
                            const embed = new MessageEmbed()
                                .setDescription(`Invalid type \`${type}\`: must be either "extreme" or "potential"`)
                                .setFooter('User satisfaction is not guaranteeed.')
                                .setColor(red);
                            interaction.reply({embeds: [embed], ephemeral: true});
                            return;
                        }

                        const embed = new MessageEmbed()
                            .setDescription(`Added **${type}** word \`${word}\` to wordbank.`)
                            .setFooter('Use "/detector-list" to see all contents of wordbank and whitelist.')
                            .setColor(green);

                        interaction.reply({embeds: [embed]});
                    }
                    else if (remove) {
                        const word = interaction.options.getString('word');
                        const word_entry = await wordbank.findOne({ where: { word: word } });

                        if (word_entry) {
                            const type = word_entry.get('type');
                            word_entry.destroy();

                            if (type === 'extreme') {
                                extreme_words = extreme_words.replace(word, '');
                                extreme_words = extreme_words.split('||').join('|');
                                if (extreme_words.startsWith('|')) extreme_words.replace('|', '');
                            }
                            else if (type === 'potential') {
                                potential_words = potential_words.replace(word, '');
                                potential_words = potential_words.split('||').join('|');
                                if (potential_words.startsWith('|')) potential_words.replace('|', '');
                            }

                            const embed = new MessageEmbed()
                                .setDescription(`Removed **${type}** word \`${word}\` from wordbank.`)
                                .setFooter('Use "/detector-list" to see all contents of wordbank and whitelist.')
                                .setColor(green);

                            interaction.reply({embeds: [embed]});
                        }
                        else {
                            const embed = new MessageEmbed()
                                .setDescription(`No word matching \`${word}\` found in wordbank.`)
                                .setFooter('Use "/detector-list" to see all contents of wordbank and whitelist.')
                                .setColor(red);
                            interaction.reply({embeds: [embed], ephemeral: true});
                        }
                    }
                    else if (whitelist_param || unwhitelist) {
                        const param = interaction.options.getString('what');
                        let param_regex = param.match(/<(@!?|#)(\d+)>/);
    
                        if (!param_regex) {
                            const embed = new MessageEmbed()
                                .setDescription(`Invalid paramter \`${param}\`. Please enter a channel or a user.`)
                                .setFooter('User satisfaction is not guaranteed.')
                                .setColor(red);
                            interaction.reply({embeds: [embed], ephemeral: true});
    
                            return;
                        }
                        if (param_regex[1] === '@!') param_regex[1] = '@';
    
                        if (whitelist_param) {
                            await whitelist.create({
                                id: param_regex[2],
                                type: param_regex[1],
                                addedBy: i_user_id
                            });
    
                            const embed = new MessageEmbed()
                                .setDescription(`Added ${param_regex[0]} to whitelist.`)
                                .setFooter('Use "/detector-list" to see all contents of wordbank and whitelist.')
                                .setColor(green);
    
                            interaction.reply({embeds: [embed]});
                        }
                        else if (unwhitelist) {
                            const whitelist_entry = await whitelist.findOne({ where: { type: param_regex[1], id: param_regex[2] } });
    
                            if (whitelist_entry) {
                                whitelist_entry.destroy();
    
                                const embed = new MessageEmbed()
                                    .setDescription(`Removed ${param_regex[0]} from whitelist.`)
                                    .setFooter('Use "/detector-list" to see all contents of wordbank and whitelist.')
                                    .setColor(green);
    
                                interaction.reply({embeds: [embed]});
                            }
                            else {
                                const embed = new MessageEmbed()
                                    .setDescription(`No user/channel with ID \`${param_regex[2]}\` found in whitelist.`)
                                    .setFooter('Use "/detector-list" to see all contents of wordbank and whitelist.')
                                    .setColor(red);
                                interaction.reply({embeds: [embed], ephemeral: true});
                            }
                        }
                    }
                    else if (list) {
                        const ephemeral_option = interaction.options.getBoolean('ephemeral');
                        const potential = await wordbank.findAll({ where: { type: 'potential' } });
                        const extreme = await wordbank.findAll({ where: { type: 'extreme' } });
                        const whitelisted_entries = await whitelist.findAll();
    
                        let potential_str = '';
                        let extreme_str = '';
                        let whitelisted_str = '';
    
                        for (let i = 0; i < potential.length; i++) {
                            potential_str += `\`${potential[i].get('word')}\` - added by <@${potential[i].get('addedBy')}>\n`;
                        }
                        for (let i = 0; i < extreme.length; i++) {
                            extreme_str += `\`${extreme[i].get('word')}\` - added by <@${extreme[i].get('addedBy')}>\n`;
                        }
                        for (let i = 0; i < whitelisted_entries.length; i++) {
                            whitelisted_str += `<${whitelisted_entries[i].get('type')}${whitelisted_entries[i].get('id')}> - added by <@${whitelisted_entries[i].get('addedBy')}>\n`;
                        }
    
                        let desc = '';
                        if (potential_str !== '') desc += `**"Potential" words:**\n${potential_str}\n`;
                        if (extreme_str !== '') desc += `**"Extreme" words:**\n${extreme_str}\n`;
                        if (whitelisted_str !== '') desc += `**Whitelist:**\n${whitelisted_str}`;
                        if (desc === '') desc = 'Looks like everything\'s empty...';
    
                        const embed = new MessageEmbed()
                            .setTitle('Offensive language detector database')
                            .setDescription(desc)
                            .setFooter('Edit with "/detector-add/remove/whitelist/unwhitelist"')
                            .setColor(purple);
    
                        interaction.reply({ embeds: [embed], ephemeral: ephemeral_option });
                    }

                }
                else {
                    const embed = new MessageEmbed()
                        .setDescription(`<@206024596997144576> fucked up`)
                        .setFooter('User satisfaction is not guaranteed.')
                        .setColor(red);
                    interaction.reply({embeds: [embed]});
                }
            }
            else interaction.reply({content: "https://tenor.com/view/power-lord-of-the-rings-lotr-gif-9197188", ephemeral: true});
        }
        else if ( interaction.commandName === 'test' ) {
            if ( i_user_id === '206024596997144576' /* await HasJannyRole(i_user_id) */ ) {
                const member = await gudmods.members.fetch( i_user_id ).catch(console.error);

                if (!member) {
                    const embed = new MessageEmbed()
                        .setDescription(`Something has gone wrong, no member with ID \`${i_user_id}\` found. Report to <@206024596997144576>.`)
                        .setFooter('User satisfaction is not guaranteed.')
                        .setColor(red);

                    interaction.reply({ embeds: [embed], ephemeral: true });
                    return;
                }

                let options = [];
                let roles = member.roles.cache;
                roles = roles.filter(role => role.color);
                roles = roles.sort((a,b) => b.position - a.position);
                roles.forEach( role => {
                    options.push({
                        default: role.id === roles[0].id,
                        label: role.name,
                        value: role.id,
                        description: role.hexColor//parseInt(roles[i].color, 10).toString(16),
                    });
                    i++;
                });

                let menu = new MessageSelectMenu()
                    //.setPlaceholder('Nothing selected')
                    .setCustomId('role_prio')
                    .setMaxValues(1)
                    .addOptions(options);

                let select = new MessageButton()
                    .setCustomId('select_placeholder')
                    .setStyle('PRIMARY')
                    .setDisabled(true)
                    .setLabel('Select');

                interaction.reply({ content: 'i wanna die', components: [new MessageActionRow().addComponents([menu]), new MessageActionRow().addComponents([select])], ephemeral: true });
            }
            else interaction.reply({content: "https://tenor.com/view/power-lord-of-the-rings-lotr-gif-9197188", ephemeral: true});
        }
        else if ( interaction.commandName === 'jail' ) {
            JailMemberInteraction(interaction);
        }
    }
    else if (interaction.isButton()) {
        if ( interaction.customId.startsWith('gudbot_group_action') ) {
            const regex = interaction.customId.match(/gudbot_group_action_(del|jail|mute|ban|ignore)_(\d+)/);
            if (regex) {
                const del = regex[1] === 'del';
                const jail = regex[1] === 'jail';
                const mute = regex[1] === 'mute';
                const ban = regex[1] === 'ban';
                const ignore = regex[1] === 'ignore';
                const group_id = regex[2];

                let group;
                //for (let i = 0; i < Recents.)

                if (del) {

                }
            }
            else {
                const embed = new MessageEmbed()
                    .setDescription(`Something has gone wrong, button id \`${interaction.customId}\` is formatted incorrectly. Report to <@206024596997144576>.`)
                    .setFooter('User satisfaction is not guaranteed.')
                    .setColor(red);
                interaction.reply({ embeds: [embed], ephemeral: true });
                console.log(`\nbutton id ${interaction.customId}: not found, attempt by ${i_user_id}`);
            }
        }
        else if ( interaction.customId.startsWith('gudbot_member_action') ) {
            const regex = interaction.customId.match(/gudbot_member_action_(jail|mute|ban)_(\d+)_(\d+)/);
            if (regex) {
                const jail = regex[1] === 'jail';
                const mute = regex[1] === 'mute';
                const ban = regex[1] === 'ban';
                const guild_id = regex[2];
                const user_id = regex[3];

                const guild = client.guilds.cache.get(guild_id);
                if (!guild) {
                    const embed = new MessageEmbed()
                        .setDescription(`Something has gone wrong, no guild with ID \`${guild_id}\` found. Report to <@206024596997144576>.`)
                        .setFooter('User satisfaction is not guaranteed.')
                        .setColor(red);

                    interaction.reply({ embeds: [embed], ephemeral: true });
                    return;
                }

                const member = await guild.members.fetch( user_id ).catch(console.error);
                if (!member) {
                    const embed = new MessageEmbed()
                        .setDescription(`Something has gone wrong, no member with ID \`${user_id}\` found. Report to <@206024596997144576>.`)
                        .setFooter('User satisfaction is not guaranteed.')
                        .setColor(red);

                    interaction.reply({ embeds: [embed], ephemeral: true });
                    return;
                }

                if (jail) {
                    const role = await guild.roles.cache.find((r) => r.id == jailed_rID);
                    member.roles.add(role).then(member => {
                        const embed = new MessageEmbed()
                            .setDescription(`<@${i_user_id}> jailed <@${user_id}>`)
                            .setColor(green);

                            interaction.reply({ embeds: [embed] });
                    }).catch(error => {
                        console.error();
                        const embed = new MessageEmbed()
                            .setDescription(`Something has gone wrong, unable to jail <@${user_id}> Report to <@206024596997144576>.`)
                            .setFooter('User satisfaction is not guaranteed.')
                            .setColor(red);

                        interaction.reply({ embeds: [embed], ephemeral: true });
                    });
                }
                else if (mute) {
                    const role = await guild.roles.cache.find((r) => r.id == muted_rID);
                    member.roles.add(role).then(member => {
                        const embed = new MessageEmbed()
                            .setDescription(`<@${i_user_id}> muted <@${user_id}>`)
                            .setColor(green);

                            interaction.reply({ embeds: [embed] });
                    }).catch(error => {
                        console.error();
                        const embed = new MessageEmbed()
                            .setDescription(`Something has gone wrong, unable to ban <@${user_id}> Report to <@206024596997144576>.`)
                            .setFooter('User satisfaction is not guaranteed.')
                            .setColor(red);

                        interaction.reply({ embeds: [embed], ephemeral: true });
                    });
                }
                else if (ban) {
                    member.ban().then(member => {
                        const embed = new MessageEmbed()
                            .setDescription(`<@${i_user_id}> banned <@${user_id}>`)
                            .setColor(green);

                        interaction.reply({ embeds: [embed] });
                    }).catch(error => {
                        console.error();
                        const embed = new MessageEmbed()
                            .setDescription(`Something has gone wrong, unable to ban <@${user_id}> Report to <@206024596997144576>.`)
                            .setFooter('User satisfaction is not guaranteed.')
                            .setColor(red);

                        interaction.reply({ embeds: [embed], ephemeral: true });
                    });
                }
            }
            else {
                const embed = new MessageEmbed()
                    .setDescription(`Something has gone wrong, button id \`${interaction.customId}\` is formatted incorrectly. Report to <@206024596997144576>.`)
                    .setFooter('User satisfaction is not guaranteed.')
                    .setColor(red);
                interaction.reply({ embeds: [embed], ephemeral: true });
                console.log(`\nbutton id ${interaction.customId}: not found, attempt by ${i_user_id}`);
            }
        }
        else if ( interaction.customId.startsWith('gudbot_message_action') ) {
            const regex = interaction.customId.match(/gudbot_message_action_(del)_(\d+)_(\d+)/);
            if (regex) {
                const del = regex[1] === 'del'; //yes i know
                const channel_id = regex[2];
                const message_id = regex[3];

                const channel = await client.channels.fetch(channel_id).catch(console.error);
                if (!channel) {
                    const embed = new MessageEmbed()
                        .setDescription(`Something has gone wrong, no channel with ID \`${channel_id}\` found. Report to <@206024596997144576>.`)
                        .setFooter('User satisfaction is not guaranteed.')
                        .setColor(red);

                    interaction.reply({ embeds: [embed], ephemeral: true });
                    return;
                }

                const message = await channel.messages.fetch( message_id ).catch(console.error);
                if (!message) {
                    const embed = new MessageEmbed()
                        .setDescription(`Something has gone wrong, no message with ID \`${message_id}\` found. Report to <@206024596997144576>.`)
                        .setFooter('User satisfaction is not guaranteed.')
                        .setColor(red);

                    interaction.reply({ embeds: [embed], ephemeral: true });
                    return;
                }

                if (del) {
                    message.delete().then(message => {
                        const embed = new MessageEmbed()
                            .setDescription(`<@${i_user_id}> deleted message #\`${message_id}\``)
                            .setColor(green);

                        interaction.reply({ embeds: [embed] });
                    }).catch(error => {
                        console.error();
                        const embed = new MessageEmbed()
                            .setDescription(`Something has gone wrong, unable to delete message #\`${message_id}\` Report to <@206024596997144576>.`)
                            .setFooter('User satisfaction is not guaranteed.')
                            .setColor(red);

                        interaction.reply({ embeds: [embed], ephemeral: true });
                    });
                }
            }
            else {
                const embed = new MessageEmbed()
                    .setDescription(`Something has gone wrong, button id \`${interaction.customId}\` is formatted incorrectly. Report to <@206024596997144576>.`)
                    .setFooter('User satisfaction is not guaranteed.')
                    .setColor(red);
                interaction.reply({ embeds: [embed], ephemeral: true });
                console.log(`\nbutton id ${interaction.customId}: not found, attempt by ${i_user_id}`);
            }
        }
    }
});

async function DetectOffensiveContent(message) {
    if (extreme_words === '' && potential_words === '') return;

    const whitelisted_user = await whitelist.findOne({ where: { id: message.author.id, type: '@'  } });
    const whitelisted_channel = await whitelist.findOne({ where: { id: message.channel.id, type: '#' } });

    if (whitelisted_user || whitelisted_channel) return;

    const regex = message.content.toLowerCase().match(`([\\S\\s]*(?:^|\\W+|\\s+))(${extreme_words !== '' ? `${extreme_words}${potential_words !== '' ? `|${potential_words}` : ''}` : potential_words})((?:$|\\W+|\\s+)[\\S\\s]*)`);
    
    if ( regex ) {
        const extreme = extreme_words !== '' && regex[2].match(extreme_words);

        if (extreme) message.delete().catch(console.error);
        
        let embed = new MessageEmbed()
            .setColor(red)
            //.setAuthor(GetMemberFullName(message.member), message.author.avatarURL() ? message.author.avatarURL() : 'https://cdn.discordapp.com/embed/avatars/1.png')
            .setTitle(extreme ? 'Offensive language detected and removed' : 'Potentially offensive language detected')
            .setDescription(`Sent by <@${message.author.id}> in <#${message.channel.id}>\n> ${regex[1]}**${regex[2]}**${regex[regex.length-1]}`) //TO-DO: CHAR COUNT CHECK
            .setFooter(message.author.tag, message.author.avatarURL() ? message.author.avatarURL() : 'https://cdn.discordapp.com/embed/avatars/1.png')
            .setTimestamp(message.createdTimestamp);

        let jail = new MessageButton()
            .setLabel('Jail')
            .setStyle('SUCCESS')
            .setCustomId(`gudbot_member_action_jail_${message.guild.id}_${message.author.id}`);

        let mute = new MessageButton()
            .setLabel('Mute')
            .setStyle('PRIMARY')
            .setCustomId(`gudbot_member_action_mute_${message.guild.id}_${message.author.id}`);

        let ban = new MessageButton()
            .setLabel('Ban')
            .setStyle('PRIMARY')
            .setCustomId(`gudbot_member_action_ban_${message.guild.id}_${message.author.id}`);

        let link = new MessageButton()
            .setLabel('Open')
            .setStyle('LINK')
            .setURL(message.url);

        let buttons = [];
        if (!extreme) {
            let del = new MessageButton()
                .setLabel('Delete')
                .setStyle('DANGER')
                .setCustomId(`gudbot_message_action_del_${message.channel.id}_${message.id}`);
            buttons.push(del);
        }
        buttons.push(jail, mute, ban, link);

        client.channels.fetch(mod_chID).then(channel => {
            channel.send({ embeds: [embed], components: [new MessageActionRow().addComponents(buttons)] }).catch(console.error);
        }).catch(console.error); 
    }
}

client.on('messageCreate', async message => {
    if (message.partial) await message.fetch().catch(console.error);
    if (message.author.bot) return;

    if ( message.content.startsWith("!welcome") ){
        const errormsg = new MessageEmbed().setColor(red);

        if ( !HasRole(message.member, gmteam_rID) && !HasRole(message.member, intern_rID) ) {
            errormsg.setDescription("You don't have the required roles to perform this action.");
            message.channel.send(errormsg).catch(console.error);
            return;
        }
        
        const regex = message.content.match(/!welcome <@!?(\d+)>/);
        const userId = regex[1];
        const member = await message.guild.members.fetch(userId).catch(console.error);
        if ( !member )
        {
            errormsg.setDescription('Please enter a valid user.');
            message.channel.send({embeds: [errormsg]}).catch(console.error);
        }
        else
        {
            weebo.getProfile(userId).then( profile => 
            {
                if ( profile.xp < 50 ) {
                    const diff = 50 - profile.xp;
                    weebo.addGuildMemberScore(gm_gID, userId, diff ).then( async ranking => {
                        if ( ranking.score >= 50 ) {
                            const role = await message.guild.roles.cache.find((r) => r.id == lurker_rID);
                            member.roles.add(role);

                            const embed = new MessageEmbed()
                                .setColor(green)
                                .setDescription(`<@${userId}> has successfully been given 50 xp and assigned the <@&${lurker_rID}> role.`);

                            message.channel.send({embeds: [embed]}).catch(console.error);
                        }
                        else {
                            errormsg.setDescription('Failed to add score.');
                            message.channel.send({embeds: [errormsg]}).catch(console.error);
                        }
                    }, function(error) {
                        console.error(error);
        
                        errormsg.setDescription('Failed to add score.');
                        message.channel.send({embeds: [errormsg]}).catch(console.error);
                    } );
                }
                else {
                    const embed = new MessageEmbed()
                        .setColor(purple)
                        .setDescription(`<@${userId}> already has 50 xp${HasRole(member, lurker_rID) ? '.' : `, assigning <@&${lurker_rID}> role.`}`);

                    message.channel.send({embeds: [embed]}).catch(console.error);
                }
            }, function(error) {
                console.error(error);

                errormsg.setDescription('Please enter a valid user.');
                message.channel.send({embeds: [errormsg]}).catch(console.error);
            } );
        }
    }
    else if ( message.content.startsWith("!tatsutest") ) {
        const errormsg = new MessageEmbed().setColor(red);

        const regex = message.content.match(/!tatsutest <@!?(\d+)>/);
        const userId = regex[1];
        const member = await message.guild.members.fetch(userId).catch(console.error);
        if ( !member ) {
            errormsg.setDescription('Please enter a valid user.');
            message.channel.send({embeds: [errormsg]}).catch(console.error);
        }
        else {
            weebo.getProfile(userId).then(async (profile) => {
                const embed = new MessageEmbed()
                    .setColor(purple)
                    .setDescription(`${profile.username}: ${profile.xp} XP`);
                await message.channel.send({embeds: [embed]}).catch(console.error);
            }, console.error);

            await weebo.addGuildMemberScore(gm_gID, userId, 50).then(console.log, console.error);

            weebo.getProfile(userId).then((profile) => {
                const embed = new MessageEmbed()
                    .setColor(purple)
                    .setDescription(`${profile.username}: ${profile.xp} XP`);
                message.channel.send({embeds: [embed]}).catch(console.error);
            }, console.error);
        }
    }
    else if ( message.content.startsWith('g!detector') ) {
        if ( HasRole(message.member, gmteam_rID) || HasRole(message.member, intern_rID) ) {
            const regex = message.content.match(/g!detector (add|remove|whitelist|unwhitelist|list|help)(?: ((?:<(?:@!?|#))?\S+>?))?(?: (potential|extreme))?/);
            if (regex) {
                const add = regex[1] === 'add';
                const remove = regex[1] === 'remove';
                const whitelist_param = regex[1] === 'whitelist'; //not to confuse with whitelist database model
                const unwhitelist = regex[1] === 'unwhitelist';
                const list = regex[1] === 'list';
                const help = regex[1] === 'help';

                if ( (add || remove) && regex[2] ) {
                    const word = regex[2];
                    const extreme = regex[3] === 'extreme' || false;

                    if (add) {
                        await wordbank.create({
                            word: word,
                            type: extreme ? 'extreme' : 'potential',
                            addedBy: message.author.id
                        });

                        if (extreme)
                            extreme_words += `${extreme_words === '' ? '' : '|'}${word}`;
                        else potential_words += `${potential_words === '' ? '' : '|'}${word}`;

                        const embed = new MessageEmbed()
                            .setDescription(`Added **${extreme ? 'extreme' : 'potential'}** word \`${word}\` to wordbank.`)
                            .setFooter('Use g!detector list to see all contents of wordbank and whitelist.')
                            .setColor(green);

                        message.channel.send({embeds: [embed]});
                    }
                    else if (remove) {
                        const word_entry = await wordbank.findOne({ where: { word: word } });

                        if (word_entry) {
                            const type = word_entry.get('type');
                            word_entry.destroy();

                            if (type === 'extreme') {
                                extreme_words = extreme_words.replace(word, '');
                                extreme_words = extreme_words.split('||').join('|');
                                if (extreme_words.startsWith('|')) extreme_words.replace('|', '');
                            }
                            else if (type === 'potential') {
                                potential_words = potential_words.replace(word, '');
                                potential_words = potential_words.split('||').join('|');
                                if (potential_words.startsWith('|')) potential_words.replace('|', '');
                            }

                            const embed = new MessageEmbed()
                                .setDescription(`Removed **${word_entry.get('type')}** word \`${word}\` from wordbank.`)
                                .setFooter('Use g!detector list to see all contents of wordbank and whitelist.')
                                .setColor(green);

                            message.channel.send({embeds: [embed]});
                        }
                        else {
                            const embed = new MessageEmbed()
                                .setDescription(`No word matching \`${word}\` found in wordbank.`)
                                .setFooter('Use g!detector list to see all contents of wordbank and whitelist.')
                                .setColor(red);
                            message.reply({embeds: [embed]});
                        }
                    }
                }
                else if ( (whitelist_param || unwhitelist) && regex[2] ) {
                    let param_regex = regex[2].match(/<(@!?|#)(\d+)>/);

                    if (!param_regex) {
                        const embed = new MessageEmbed()
                            .setDescription(`Invalid paramter \`${regex[2]}\`. Please enter a channel or a user.`)
                            .setFooter('User satisfaction is not guaranteed.')
                            .setColor(red);
                        message.reply({embeds: [embed]});

                        return;
                    }
                    if (param_regex[1] === '@!') param_regex[1] = '@';

                    if (whitelist_param) {
                        await whitelist.create({
                            id: param_regex[2],
                            type: param_regex[1],
                            addedBy: message.author.id
                        });

                        const embed = new MessageEmbed()
                            .setDescription(`Added ${param_regex[0]} to whitelist.`)
                            .setFooter('Use g!detector list to see all contents of wordbank and whitelist.')
                            .setColor(green);

                        message.channel.send({embeds: [embed]});
                    }
                    else if (unwhitelist) {
                        const whitelist_entry = await whitelist.findOne({ where: { type: param_regex[1], id: param_regex[2] } });

                        if (whitelist_entry) {
                            whitelist_entry.destroy();

                            const embed = new MessageEmbed()
                                .setDescription(`Removed ${param_regex[0]} from whitelist.`)
                                .setFooter('Use g!detector list to see all contents of wordbank and whitelist.')
                                .setColor(green);

                            message.channel.send({embeds: [embed]});
                        }
                        else {
                            const embed = new MessageEmbed()
                                .setDescription(`No user/channel with ID \`${param_regex[2]}\` found in whitelist.`)
                                .setFooter('Use g!detector list to see all contents of wordbank and whitelist.')
                                .setColor(red);
                            message.reply({embeds: [embed]});
                        }
                    }
                }
                else if (list) {
                    const potential = await wordbank.findAll({ where: { type: 'potential' } });
                    const extreme = await wordbank.findAll({ where: { type: 'extreme' } });
                    const whitelisted_entries = await whitelist.findAll();

                    let potential_str = '';
                    let extreme_str = '';
                    let whitelisted_str = '';

                    for (let i = 0; i < potential.length; i++) {
                        potential_str += `\`${potential[i].get('word')}\` - added by <@${potential[i].get('addedBy')}>\n`;
                    }
                    for (let i = 0; i < extreme.length; i++) {
                        extreme_str += `\`${extreme[i].get('word')}\` - added by <@${extreme[i].get('addedBy')}>\n`;
                    }
                    for (let i = 0; i < whitelisted_entries.length; i++) {
                        whitelisted_str += `<${whitelisted_entries[i].get('type')}${whitelisted_entries[i].get('id')}> - added by <@${whitelisted_entries[i].get('addedBy')}>\n`;
                    }

                    let desc = '';
                    if (potential_str !== '') desc += `**"Potential" words:**\n${potential_str}\n`;
                    if (extreme_str !== '') desc += `**"Extreme" words:**\n${extreme_str}\n`;
                    if (whitelisted_str !== '') desc += `**Whitelist:**\n${whitelisted_str}`;
                    if (desc === '') desc = 'Looks like everything\'s empty...';

                    const embed = new MessageEmbed()
                        .setTitle('Offensive language detector database')
                        .setDescription(desc)
                        .setFooter('Use g!detector add/remove [word] [extreme/potential](optional) to change')
                        .setColor(purple);

                    message.channel.send({embeds: [embed]});
                }
                else if (help) {
                    const embed = new MessageEmbed()
                        .setTitle('Usage cases of g!detector command')
                        .setDescription(`\`g!detector add/remove [word] [extreme/potential](optional)\`\nAdds or removes word from database. When adding a word, you may use [extreme/potential] to indicate the type. If you do not enter anything, [potential] will be the default. When removing a word, you do not need to enter this parameter.\n\n\`g!detector whitelist/unwhitelist [user/channel]\`\nAdds or removes user/channel from whitelist.\n\n\`g!detector list\`\nLists all words from database, showing their type and who added them. Also displays whitelist.`)
                        .setColor(purple);

                    message.channel.send({embeds: [embed]});
                }
                else {
                    const embed = new MessageEmbed()
                        .setDescription(`Incorrect use of command \`g!detector\`\n\nUsage cases:\n\`g!detector add/remove [word] [extreme/potential](optional)\`\n\`g!detector whitelist/unwhitelist [user/channel]\`\n\`g!detector list\`\n\`g!detector help\``)
                        .setFooter('User satisfaction is not guaranteed.')
                        .setColor(red);
                    message.reply({embeds: [embed]});
                }
            }
            else {
                const embed = new MessageEmbed()
                    .setDescription(`Incorrect use of command \`g!detector\`\n\nUsage cases:\n\`g!detector add/remove [word] [extreme/potential](optional)\`\n\`g!detector whitelist/unwhitelist [user/channel]\`\n\`g!detector list\`\n\`g!detector help\``)
                    .setFooter('User satisfaction is not guaranteed.')
                    .setColor(red);
                message.reply({embeds: [embed]});
            }
        }
        else {
            //notify pleb
            const theoden = await message.channel.send({content: "https://tenor.com/view/power-lord-of-the-rings-lotr-gif-9197188"});

            //cleanup after 4sec
            setTimeout(function()
            {
                message.delete().catch(console.error);
                theoden.delete().catch(console.error);
            }, 4000);
        }
    }
    //spam and offensive language detection
    else {
        /*
        let regex;
        let att_name;
        let att_path = '';
        //check either attachment url or content for image path, if found and filename isnt 'image0', set att_path (variable that will be checked and used everywhere else)
        if ( message.attachments.size > 0 ) {
            //att_name = message.attachments.first().url.substring( message.attachments.first().url.lastIndexOf('/')+1, message.attachments.first().url.lastIndexOf('.') );
            if ( regex = message.attachments.first().url.match(/https?:\/\/\S+\/(\w+)\.(?:png|jpg|jpeg|gif)/) ) {
                att_name = regex[1];
                if (att_name !== 'image0' && att_name !== 'unknown') att_path = regex[0];
            }
        }   
        else if ( regex = message.content.match(/https?:\/\/\S+\/(\w+)\.(?:png|jpg|jpeg|gif)/) ) {
            att_name = regex[1];
            if (att_name !== 'image0') att_path = regex[0];
        }

        //if att_path was set, assign att_name to message.content for finding duplicates
        if (att_path != '')
            message.content = att_name;
        */

        let found_index = Recents.findByText(message.content);

        if ( found_index > -1 ) {
            Recents.increment(found_index, message.id, message.channel.id, message.author.id);
        }
        else if ( message.content != ''/* || att_path != ''*/ ) {
            Recents.pushback( new MsgGroup(message.content, message.id, message.channel.id, message.author.id, message.createdTimestamp/*, att_path*/) );
        }

        DetectOffensiveContent(message);
    }
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
    if (oldMessage.partial) await oldMessage.fetch().catch(console.error);
    if (newMessage.partial) await newMessage.fetch().catch(console.error);
    if (newMessage.author.bot) return;

    if (extreme_words === '' && potential_words === '') return;
    if ( !oldMessage.content?.toLowerCase().match(`(?:^|\\W+|\\s+)(${extreme_words !== '' ? `${extreme_words}${potential_words !== '' ? `|${potential_words}` : ''}` : potential_words})(?:$|\\W+|\\s+)`) )
        DetectOffensiveContent(newMessage);
});

//for sending messages through console
let chID = "409507333824315392";
process.stdin.on('data', userInput => {
    userInput = userInput.toString();

    const msgIndex = userInput.indexOf("msg");
    const chIndex = userInput.indexOf("chID");
    const delIndex = userInput.indexOf("del");
    const logrecents = userInput.indexOf("logrecents") > -1;
    const logwords = userInput.indexOf("logwords") > -1;

    if(chIndex > -1) {
        chID = userInput.substring(0, chIndex-1);
        console.log(chID);
    }
    if(msgIndex > -1) {
        let emotes = userInput.match(/:\w+?:/g);
        if (emotes) {
            for (let i = 0; i < emotes.length; i++) {
                let emotename = emotes[i].substring( 1, emotes[i].length-1 );

                let guild = client.guilds.cache.find(guild => guild.channels.cache.find(c => c.id == chID) );
                let emote = guild.emojis.cache.find(emoji => emoji.name === emotename );
                
                if ( emote ) {
                    userInput = userInput.replace(emotes[i], `<:${emotename}:${emote.id}>`);
                }
            }
        }

        let content = userInput.substring(msgIndex+4);
        client.channels.cache.get(chID).send({content: content}).catch(console.error);
    }
    if (delIndex > -1) {
        client.channels.cache.get(chID).messages.fetch( userInput.substring(0, delIndex-1) )
        .then(message => {
            console.log(`"${message.content}" was deleted."`);
            message.delete().catch(console.error);
        }).catch(console.error);
    }

    if (logrecents) {
        console.log(Recents.groups);
    }
    if (logwords) {
        console.log(potential_words);
        console.log(extreme_words);
    }
});

client.login(process.env.CLIENT_TOKEN);

const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('ok');
});
server.listen(3000);