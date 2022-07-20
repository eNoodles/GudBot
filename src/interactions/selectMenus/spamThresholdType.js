const { SelectMenuInteraction } = require('discord.js');
const { updateThresholdPrompt, thresholds_cache } = require('../../managers/spamManager');

module.exports = {
    /**
     * @param {SelectMenuInteraction} interaction 
     */
    async execute(interaction) {
        //get currently selected action type
        const selected_type_value = interaction.values[0];
        
        //check if threshold for this action already exists
        const threshold = thresholds_cache.get(selected_type_value);
        const selected_message_value = threshold?.message_count.toString();
        const selected_channel_value = threshold?.channel_count.toString();
        const selected_jail_value = threshold?.extra.toString();
        const selected_ban_value = threshold?.extra.toString();

        await updateThresholdPrompt(interaction, {
            selected_type_value: selected_type_value,
            selected_message_value: selected_message_value,
            selected_channel_value: selected_channel_value,
            selected_jail_value: selected_jail_value,
            selected_ban_value: selected_ban_value
        });
    }
};