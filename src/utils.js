const { MessageButton, MessageEmbed, Permissions, GuildMember, MessageActionRow, TextChannel, Webhook, Message, User, Collection } = require('discord.js');
const { jail_records, saved_roles } = require('./database/dbObjects');

const webhooks_cache = new Map(); //K: Snowflake representing channel id, V: gudbot's webhook for that channel
const censored_cache = new Map(); //K: Snowflake representing message id, V: Snowflake representing original message author's id 

const ids = {
    client: '822565220190650379',
    guild: '822148574032298064',

    intro_ch: '883882213714837514',
    rules_ch: '552982479212904448',
    dl_ch: '486202559951011870',
    dldb_ch: '607310581053128717',
    mod_ch: '860181373468540948',
    star_ch: '888515334015942676',
    records_ch: '986712503935447130',

    lurker_role: '523883593978609704',
    gmteam_role: '409531885119864832',
    jailed_role: '865603749393334283',
    muted_role: '606870055770390538',
    blankicon_role: '894731175216701450',
};

// GudMods
// const ids = {
//     client: '822565220190650379',
//     guild: '364164445657890816',

//     intro_ch: '883882213714837514',
//     rules_ch: '552982479212904448',
//     dl_ch: '486202559951011870',
//     dldb_ch: '607310581053128717',
//     mod_ch: '860181373468540948',
//     star_ch: '888515334015942676',
//     records_ch: '746696906314612807',

//     lurker_role: '523883593978609704',
//     gmteam_role: '409531885119864832',
//     jailed_role: '603983150011514979',
//     muted_role: '606870055770390538',
//     blankicon_role: '894731175216701450',
// };

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
 * @param {Number} min 
 * @param {Number} max 
 * @returns Array of choices for SlashCommandIntegerOption
 */
function generateIntegerChoices(min=0, max=9) {
    const temp_array = [];
    const iterations = max - min + 1;

    for (let i = 0; i < iterations; i++) {
        let val = min + i;
        temp_array[i] = { name: `${val}`, value: val };
    }

    return temp_array;
}

/**
 * @param {number} minutes 
 * @param {number} hours 
 * @param {number} days 
 * @returns {number|null} Combined duration in seconds.
 */
function getDurationSeconds(minutes, hours, days) {
    return minutes || hours || days ? days * 86400 + hours * 3600 + minutes * 60 : null;
}

/**
 * @param {GuildMember} member Member being jailed
 * @param {User} jailer_user User who initiated the interaction
 * @param {string} [reason] Reason for jailing (displayed in record)
 * @param {Number} [duration] Jail duration in seconds
 * @returns MessageOptions to send in criminal-records
 */
async function jailMember(member, jailer_user, reason, duration) {

    const offender_id = member.id;
    const jailer_id = jailer_user.id;
    const jail_timestamp = Math.floor(new Date().getTime() / 1000);
    const release_timestamp = duration ? jail_timestamp + duration : null;

    const roles = member.roles.cache.filter(role => role.id !== ids.guild && role.id !== ids.jailed_role); //ignore base @@everyone role and jailed role
    let roles_str = ''; //for embed

    //clear rolebank of member's previously saved roles (just in case)
    await saved_roles.destroy({ where: { user_id: member.id } });

    //save member's roles in db
    roles.forEach( async role => {
        await saved_roles.create({
            user_id: member.id,
            role_id: role.id
        });

        //format role list for embed
        roles_str += `<@&${role.id}> `;
    });

    //count prior offenses
    const prior_offenses = await jail_records.count({ where: { offender_id: member.id } });

    //save offender id, jailer id, reason in jail_records
    const jail_record = await jail_records.create({
        offender_id: offender_id,
        jailer_id: jailer_id,
        reason: reason,
        jail_timestamp: jail_timestamp,
        release_timestamp: release_timestamp,
        url: null //set upon unjailing
    });

    //display in audit log
    const audit_log_msg = `Jailed by ${jailer_user.tag}`;

    //remove member's roles
    await member.roles.remove( roles, audit_log_msg );

    //if all roles successfully removed, add jailed role
    await member.roles.add(ids.jailed_role, audit_log_msg);

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
        .setCustomId(`recordsUnjail|${jail_record.id}`);

    const timer_button = new MessageButton()
        .setLabel('Set time')
        .setStyle(buttons.blurple)
        .setCustomId(`recordsSetJailTime|${jail_record.id}`);
    
    const edit_button = new MessageButton()
        .setLabel('Edit')
        .setStyle(buttons.gray)
        .setCustomId(`recordsEdit|${jail_record.id}`);

    const del_button = new MessageButton()
        .setLabel('Delete record')
        .setStyle(buttons.red)
        .setCustomId(`recordsDelete|${jail_record.id}`)
        .setDisabled();

    return {
        embeds: [embed],
        components: [new MessageActionRow().addComponents([unjail_button, timer_button, edit_button, del_button])]
    };
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
 * Finds image urls in text content, removes them and spits them out as an array
 * @param {string} content Original message content
 */
function extractImageUrls(content) {
    let found = false;
    const urls = [];

    //find image urls (including surrounding whitespace), add the url itself to array and replace entire match with nothing
    content = content.replace(/\s*(https?:\/\/\S+\.(?:png|jpg|jpeg|webp)\S*)\s*/ig, (match, url) => {
        urls.push(url);
        found = true;
        return '';
    });

    return found ? { content: content, urls: urls } : false;
}

module.exports = {
    webhooks_cache,
    censored_cache,
    ids,
    colors,
    buttons,
    hasRole,
    isAdmin,
    getMemberFullName,
    createErrorEmbed,
    generateIntegerChoices,
    getDurationSeconds,
    jailMember,
    fetchOrCreateHook,
    extractImageUrls
}