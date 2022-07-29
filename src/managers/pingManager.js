const { Collection, MessageEmbed, Role, Guild } = require("discord.js");
const { colors, ids, getUnixTimestamp } = require("../utils");
const { ping_configs } = require('../database/dbObjects');
const { Model } = require("sequelize");

/**@enum {number}*/
const pinger_types = {
    user: 0,
    role: 1
};

class PingConfig {
    /**
     * @param {Model} config ping_configs model instance in database
     */
    constructor(config) {
        /**@type {string} ID of database entry*/
        this.id = config.id;
        /**@type {Model} Database entry*/
        this.entry = config;
        /**@type {number} Cooldown time in seconds*/
        this.cooldown = config.cooldown;
        /**@type {number} Unix timestamp of last ping*/
        this.last_ping = -1;
        /**@type {string} ID of role or user that can ping this role*/
        this.pinger_id = config.pinger_id;
        /**@type {pinger_types} */
        this.pinger_type = config.pinger_type;
        /**@type {string} ID of channel in which this role can be pinged*/
        this.channel_id = config.channel_id;
    }

    /**Get unix timestamp of when the last cooldown ended/current cooldown will end.*/
    getCooldownEnd() { 
        return this.last_ping + this.cooldown;
    }

    /**Describes this config's usage*/
    getDescription() {
        const { pinger_id, pinger_type, channel_id, cooldown } = this;

        const by = pinger_id === ids.guild ? `@everyone` : `<${pinger_type === pinger_types.user ? '@' : '@&'}${pinger_id}>`;
        const where = `in <#${channel_id}>`;
        const when = 
            !cooldown          ? '`anytime`' :
            cooldown > 3600    ? `every \`${Math.floor(cooldown / 3600)} hours\`` :
            cooldown === 3600  ? 'every `1 hour`' :
            cooldown > 60      ? `every \`${Math.floor(cooldown / 60)} minutes\`` :
            cooldown === 60    ? 'every `1 minute`' :
            cooldown > 1       ? `every \`${cooldown} seconds\`` : 
            'every \`1 second\`';

        return `${by} ${where} ${when}`;
    }
}

/**
 * K: role ID
 * V: PingData
 * @type {Collection<string,PingData>} 
 */
 let ping_data_cache = new Collection();

class PingData {
    /**
     * @param {Role} role Role to create PingData for.
     * @param {Model[]} [configs] Array of ping_configs model instances in database
     */
    constructor(role, configs) {
        /**Role id*/
        this.id = role.id;
        /**Role name*/
        this.name = role.name;
        /**Raw mention text*/
        this.mention = this.id === ids.guild ? '@everyone' : `<@&${this.id}>`;
        /**@type {PingConfig[]}*/
        this.configs = configs?.map(c => new PingConfig(c)) || [];
    }

    /**
     * Creates a PingConfig from a ping_configs model instance in database, then adds it to configs
     * @param {Model} config ping_configs model instance in database
     */
    addConfig(config) {
        this.configs.push(new PingConfig(config));
    }

    /**
     * Finds ping config that matches command usage, prioritizes config whose cooldown is inactive and will be over the soonest.
     * @param {string} channel_id ID of channel in which /ping commad was used.
     * @param {string} category_id ID of category channel in which /ping command was used.
     * @param {string} user_id ID of user who initiated /ping command.
     * @param {Collection<string,Role>} role_cache Collection of roles belonging to member who initiated /ping command.
     */
    findOptimalConfig(channel_id, category_id, user_id, role_cache) {
        //find configs that match command usage
        const matching_configs = this.configs
            .filter(c => 
                (c.channel_id === channel_id || c.channel_id === category_id) && 
                (c.pinger_type === pinger_types.user && c.pinger_id === user_id || role_cache?.has(c.pinger_id))
            );

        //if command usage does not match any configs, regardless of cooldown
        if (!matching_configs?.length) return undefined;

        //sort configs by which cooldown will be over the soonest
        const current_timestamp = getUnixTimestamp();
        const sorted_configs = matching_configs.sort((a,b) => {
            //if a is on cooldown, use the timestamp for when it ends, otherwise use current timestamp, then add cooldown duration
            const a_end = a.getCooldownEnd();
            const a_next_end = (a_end > current_timestamp ? a_end : current_timestamp) + a.cooldown;

            //same for b
            const b_end = b.getCooldownEnd();
            const b_next_end = (b_end > current_timestamp ? b_end : current_timestamp) + b.cooldown;

            //sort by ascending
            return a_next_end - b_next_end;
        });

        //find configs among sorted whose cooldowns are currently inactive
        const active_configs = sorted_configs.filter(config => current_timestamp >= config.getCooldownEnd());

        return active_configs[0] ?? sorted_configs[0];
    }

    /**
     * Generates embed that displays ping configurations for this role.
     * @param {string} title Prefix for embed title. Final title = `${title} ${this.name}`
     */
    generateConfigEmbed(title = 'Ping configurations for') {
        return new MessageEmbed()
            .setTitle(`${title} ${this.name}`)
            .setDescription(
                `</ping:${ids.commands.ping}> ${this.mention} can be used by...\n• ${['members with the `Mention @everyone` permission', ...this.configs.map(c => c.getDescription())].join('\n• ')}`
            )
            .setFooter({ text: 'Use /pingconfig add to update cooldowns.' })
            .setColor(colors.purple);
    }
}

/**
 * Fetches PingData from cache or database, creates and caches it if not found.
 * @param {Role} role Role to fetch ping data for.
 * @returns {Promise<PingData>}
 */
async function fetchOrCreatePingData(role) {
    //check cache
    let data = ping_data_cache.get(role.id);

    if (!data) {
        //check database
        const configs = await ping_configs.findAll({ where: { role_id: role.id } }).catch(console.error);

        data = new PingData(role, configs ?? []);
        ping_data_cache.set(role.id, data);
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
                    .then(role => {
                        //check if ping data already cached
                        let data = ping_data_cache.get(role.id);

                        //cache if necessary
                        if (!data) {
                            data = new PingData(role);
                            ping_data_cache.set(role.id, data);
                        }

                        data.addConfig(config);
                    })
                    .catch(console.error)
            )
        )
        .catch(console.error);
}

module.exports = {
    pinger_types,
    ping_data_cache,
    fetchOrCreatePingData,
    cachePingData
};