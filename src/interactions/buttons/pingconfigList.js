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

        //list current configurations
        await interaction.update({
            embeds: [data.generateConfigEmbed()],
            components: []
        });
	}
};