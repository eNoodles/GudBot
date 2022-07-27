const { Collection, MessageEmbed, Role, Guild } = require("discord.js");
const { getUnixTimestamp, colors, ids } = require("../utils");
const { ping_configs } = require('../database/dbObjects');
const { Model } = require("sequelize");

/**
 * K: role ID
 * V: PingData
 * @type {Collection<string,PingData>} 
 */
let ping_data_cache = new Collection();

class PingData {
    /**
     * @param {Role} role Role to create PingDat for.
     * @param {Model} config Model instance of ping_configs in database
     */
    constructor(role, config) {
        //id of role this ping data is for
        this.id = role.id;
        //role name
        this.name = role.name;

        //database entry
        this.config = config;

        //cooldown time in seconds
        this.cooldown = config.cooldown;
        //unix timestamp of last ping
        this.last_ping = -1;

        //ids are saved a single string in the database (ex: 'id1|id2|id3')
        //array of ids of channels in which this role can be pinged
        this.channel_ids = config.channel_ids ? config.channel_ids.split('|') : [];
        //array of ids of roles that can ping this role
        this.role_ids = config.role_ids ? config.role_ids.split('|') : [];
        //array of ids of users that can ping this role
        this.user_ids = config.user_ids ? config.user_ids.split('|') : [];
    }

    /**Whether or not cooldown time has passed since last ping.*/
    onCooldown() {
        return getUnixTimestamp() - this.last_ping < this.cooldown;
    }

    /**Whether or not command usage meets criteria to ping.*/
    canPing(channel_id, user_id, role_cache) {
        return this.channel_ids?.includes(channel_id)
            || this.user_ids?.includes(user_id)
            || this.role_ids?.some(id => role_cache?.has(id) );
    }

    /**
     * Generates embed that displays ping configuration for this role.
     * @param {boolean} [update] If title should reflect configuration update.
     * @returns {MessageEmbed}
     */
    generateConfigEmbed(update) {
        const embed = new MessageEmbed()
            .setTitle(update ? `Updated ping configuration for ${this.name}` : `Ping configuration for ${this.name}`)
            .setDescription(`</ping:${ids.commands.ping}> <@&${this.id}> can be used...`)
            .addField('In these channels', (() => {
                let str = '';
                this.channel_ids.forEach(id => str += `\n<#${id}>`);
                return str ? str : 'None specified.';
            })())
            .addField('By these users', (() => {
                let str = '';
                this.user_ids.forEach(id => str += `\n<@${id}>`);
                return str ? str : 'None specified.';
            })())
            .addField('By these role members', (() => {
                let str = '';
                this.role_ids.forEach(id => str += `\n<@&${id}>`);
                return str ? str: 'None specified.';
            })())
            .addField('Cooldown', (() => {
                const { cooldown } = this;
                if (cooldown === 0) return '`None`';
                else if (cooldown >= 3600) {
                    const hours = Math.floor(cooldown / 3600);
                    return `\`${hours} ${hours === 1 ? 'hour' : 'hours'}\``;
                }
                else if (cooldown >= 60) {
                    const minutes =  Math.floor(cooldown / 60);
                    return `\`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}\``;
                }
                else return `\`${cooldown} ${cooldown === 1 ? 'second' : 'seconds'}\``;
            })())
            .setFooter({ text: 'Use /configping optional parameters to edit.' })
            .setColor(colors.purple);

        return embed;
    }
}

/**
 * Fetches PingData from cache or database, creates and caches it if not found.
 * @param {Role} role Role to fetch ping data for.
 * @param {boolean} create If data not found, create and cache it.
 * @returns {Promise<PingData|undefined>}
 */
async function fetchPingData(role, create) {
    //check cache
    let data = ping_data_cache.get(role.id);

    //if not found in cache
    if (!data) {
        //check database
        const config = await ping_configs.findOne({ where: { role_id: role.id } });

        //if found in db, create ping data and cache it
        if (config) {
            data = new PingData(role, config);
            ping_data_cache.set(role.id, data);
        }
        //create new ping config, add to db and cache it
        else if (create) {
            const config = await ping_configs.create({
                role_id: role.id,
                cooldown: 0,
                channel_ids: '',
                user_ids: '',
                role_ids: ''
            });

            data = new PingData(role, config);
            ping_data_cache.set(role.id, data);
        }
    }

    return data;
}

/**
 * Fetches all ping configs from database, creates PingData for them and caches it.
 * @param {Guild} guild Server to fetch roles from.
 */
function cachePingData(guild) {
    ping_configs
        .findAll()
        .then(configs => 
            configs.forEach(config => 
                guild.roles
                    //fetch role from guild
                    .fetch(config.role_id)
                    //create new ping data for role, cache it
                    .then(role => 
                        ping_data_cache.set(
                            role.id, 
                            new PingData(role, config)
                        ) 
                    )
                    .catch(console.error)
            )
        )
        .catch(console.error);
}

module.exports = {
    fetchPingData,
    cachePingData
};