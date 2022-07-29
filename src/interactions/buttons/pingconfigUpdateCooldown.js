const { ButtonInteraction } = require('discord.js');
const { ping_data_cache } = require('../../managers/pingManager');
const { ids } = require('../../utils');

module.exports = {
    /**
     * @param {ButtonInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const role_id = args[1];
        const pinger_id = args[2];
        const channel_id = args[3];
        const cooldown = parseInt(args[4], 10);

        //the data should already be cached
        const data = ping_data_cache.get(role_id);
        const role_mention = role_id === ids.guild ? '@everyone' : `<@&${role_id}>`;

        //just in case
        if (!data) {
            await interaction.reply({
                embeds: [createErrorEmbed(`Ping data for ${role_mention} not found.`)],
                ephemeral: true
            });

            return;
        }

        //get the config being updated
        const config = data.configs.find(c => c.id === `${role_id}${pinger_id}${channel_id}`);

        //update config in ping data
        config.cooldown = cooldown;
        //update config in database
        config.entry.update({
            cooldown: cooldown
        });

        //show updated configuration
        await interaction.update({
            embeds: [data.generateConfigEmbed('Updated ping configurations for')],
            components: []
        });
	}
};