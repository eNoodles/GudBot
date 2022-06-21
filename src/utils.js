const { MessageButton, MessageEmbed, Permissions, GuildMember, MessageActionRow, TextChannel, Webhook, Message, User } = require('discord.js');
const { jail_records, saved_roles } = require('./database/dbObjects');

const ids = {
    client: '822565220190650379',
    guild: '822148574032298064', //'364164445657890816',

    intro_ch: '883882213714837514',
    rules_ch: '552982479212904448',
    dl_ch: '486202559951011870',
    dldb_ch: '607310581053128717',
    mod_ch: '860181373468540948',
    star_ch: '888515334015942676',
    records_ch: '986712503935447130', //746696906314612807

    lurker_role: '523883593978609704',
    gmteam_role: '409531885119864832',
    jailed_role: '865603749393334283', //603983150011514979
    muted_role: '606870055770390538',
    blankicon_role: '894731175216701450',
};

const colors = {
    red: 16711680,
    green: 3394611,
    gray: 10066329,
    purple: 10434242,
};

const buttons = {
    blurple: 1, //PRIMARY
    gray: 2,    //SECONDARY
    green: 3,   //SUCCESS
    red: 4,     //DANGER
    link: 5,    //LINK
};

const textinput = {
    short: 1,
    long: 2
};

const regex = /ni+gg+(?:a|а|e|е|3)+r?|tr(?:a|а)+nn+(?:y|у|i+(?:e|е))|f(?:a|а)+gg*(?:o|о)*t?/i;
const webhooks_cache = new Map();

/**
 * @param {GuildMember} member 
 * @param {*} role Role's ID or name
 * @returns {boolean} True if member has role matching name or ID.
 */
function hasRole(member, role) {
    return member?.roles.cache.some(r => 
        r.id === role ||
        r.name === role
    );
}

/**
 * @param {GuildMember} member 
 * @returns {boolean} True if member has administrator perms.
 */
function isAdmin(member) {
    return member?.permissions.has(Permissions.FLAGS.ADMINISTRATOR);
}

/**
 * @param {GuildMember} member 
 * @returns {string} Member's server name in the form of "nickname (username)" or "username" if no nickname exists
 */
function getMemberFullName(member) {
    if (!member)
        return 'Member not found';

    return `${member.nickname ? `${member.nickname} (${member.user.username})` : member.user.username}`;
}

/**
 * @param {string} message Description of embed.
 * @param {string} [footer] Footer of embed.
 * @returns {MessageEmbed} Embed with red border, default footer, and inputted message.
 */
function createErrorEmbed(message, footer = 'User satisfaction is not guaranteed.') {
    return new MessageEmbed()
        .setDescription(message)
        .setFooter({text: footer})
        .setColor(colors.red);
}

/**
 * @param {GuildMember} member Member being jailed
 * @param {User} jailer_user User who initiated the interaction
 * @param {string} reason Reason for jailing (displayed in record)
 * @returns MessageOptions to send in criminal-records
 */
async function jailMember(member, jailer_user, reason) {

    const offender_id = member.id;
    const jailer_id = jailer_user.id;
    const jail_timestamp = Math.floor(new Date().getTime() / 1000);
    const release_timestamp = null;

    const roles = member.roles.cache;
    const role_ids = []; //will be used in jail embed message

    //clear rolebank of member's previously saved roles (just in case)
    await saved_roles.destroy({ where: { user_id: member.id } });

    //save member's roles in db
    //dont save base @@everyone role and jailed role
    roles.filter(role => role.id !== ids.guild && role.id !== ids.jailed_role).forEach( async role => {
        await saved_roles.create({
            user_id: member.id,
            role_id: role.id
        });

        role_ids.push( role.id );
    });

    //count prior offenses
    const prior_offenses = await jail_records.count({ where: { offender_id: member.id } });

    //save offender id, jailer id, reason in jail_records
    await jail_records.create({
        offender_id: offender_id,
        jailer_id: jailer_id,
        reason: reason,
        jail_timestamp: jail_timestamp,
        release_timestamp: release_timestamp
    });

    //display in audit log
    const audit_log_msg = `Jailed by ${jailer_user.tag}`;

    //remove member's roles
    await member.roles.remove( roles, audit_log_msg );

    //if all roles successfully removed, add jailed role
    await member.roles.add(ids.jailed_role, audit_log_msg);

    //format list of roles
    let roles_str = '';
    for (let i = 0; i < role_ids.length; i++) {
        roles_str += `<@&${role_ids[i]}> `;
    }

    //create embed to be sent in #criminal-records
    const embed = new MessageEmbed()
        .setColor(colors.green)
        .addFields([
            {
                name: 'Jailed:',
                value: `<@${offender_id}>`,
                inline: true
            },
            {
                name: 'By:',
                value: `<@${jailer_id}>`,
                inline: true
            },
            {
                name: 'Reason:',
                value: reason || 'Not given.'
            },
            {
                name: 'Removed roles:',
                value: roles_str || 'None.'
            },
            {
                name: 'Prior offenses:',
                value: `${prior_offenses}` || 'None.'
            },
            {
                name: 'Time of jail:',
                value: `<t:${jail_timestamp}:f>`
            }
        ]);

    if (release_timestamp) {
        embed.addField(
            'Time of release:',
            `<t:${release_timestamp}:R>`
        );
    }

    //buttons for managing jail instance
    const unjail_button = new MessageButton()
        .setLabel('Unjail')
        .setStyle(buttons.green)
        .setCustomId('test1');

    const timer_button = new MessageButton()
        .setLabel('Set timer')
        .setStyle(buttons.blurple)
        .setCustomId('test3');
    
    const edit_button = new MessageButton()
        .setLabel('Edit')
        .setStyle(buttons.gray)
        .setCustomId('test2');

    const del_button = new MessageButton()
        .setLabel('Delete record')
        .setStyle(buttons.red)
        .setCustomId('test4')
        .setDisabled();

    return {
        embeds: [embed],
        components: [new MessageActionRow().addComponents([unjail_button, timer_button, edit_button, del_button])]
    };
}

/**
 * @param {string} content 
 * @returns {string|boolean} Modified content if censoring had to be done, otherwise false boolean
 */
function censor(content) {
    let modified = false;

    let uncensored;
    while ( uncensored = content.match(regex) ) { //assignment condition (I want to check if a match is found and store it for further use)

        let censored = uncensored[0][0]; //first char of first element of regex array
        for (let i = 1; i < uncensored[0].length; i++) { //for every char after the first, add one star
            censored += '\\*'; //⋆
        }

        content = content.replace(uncensored[0], censored);
        modified = true; //signifies that content was modified
    }

    return modified ? content : false;
}

/**
 * @param {TextChannel} channel
 * @returns {Webhook} Fetched or newly created GudBot-owned webhook
 */
async function fetchOrCreateHook(channel) {
    const hook = 
        (await channel.fetchWebhooks()).find(hook => hook.owner.id === ids.client) || //fetch channel's webhooks and fine the one created by GudBut
        await channel.createWebhook('GudBot'); //if it doesn't exist, create it

    webhooks_cache.set(channel.id, hook); //map to cache

    return hook;
}

/**
 * Checks if message should be censored, if necessary deletes message and sends censored version through webhook.
 * @param {Message} message
 */
async function censorMessage(message) {

    let censored = censor(message.content); //this is either modified message content or simply false
    if (censored) {
        //check cache for webhook before trying to fetch/create it (performance)
        const hook = webhooks_cache.get(message.channel.id) || await fetchOrCreateHook(message.channel);

        if (message.type === 'REPLY') {
            const replied_msg = await message.fetchReference();
            if (replied_msg) {
                censored = `> [**${replied_msg.member?.displayName || replied_msg.author.username}** ${replied_msg.content || '*Click to see attachment*'}](${replied_msg.url})\n${censored}`; //🖻🗎
            }
        }

        let censored_followup;
        if (censored.length > 1500) {
            censored_followup = censored.substring(1500);
            censored = censored.substring(0, 1500);
        }

        //delete user's original uncensored message
        message.delete().catch(console.error);

        //send censored message through webhook, mimicing user's name and pfp
        hook.send({
            content: censored,
            username: message.member.displayName,
            avatarURL: message.member.displayAvatarURL()
        }).catch(console.error);

        if (censored_followup) {
            hook.send({
                content: censored_followup,
                username: message.member.displayName,
                avatarURL: message.member.displayAvatarURL()
            }).catch(console.error);
        }
    }
}

module.exports = {
    ids,
    colors,
    buttons,
    textinput,
    hasRole,
    isAdmin,
    getMemberFullName,
    createErrorEmbed,
    jailMember,
    censorMessage
};