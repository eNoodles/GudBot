const { SelectMenuInteraction } = require('discord.js');
const { updateThresholdPrompt, thresholds_cache } = require('../../managers/spamManager');

module.exports = {
    /**
     * @param {SelectMenuInteraction} interaction 
     */
    async execute(interaction) {
        //get currently selected action type
        const type_value = interaction.values[0];

        //check if threshold for this action already exists
        const threshold = thresholds_cache.get(type_value);
        const message_value = threshold?.message_count.toString();
        const channel_value = threshold?.channel_count.toString();
        const extra_value = threshold?.extra.toString();

        await updateThresholdPrompt(interaction, {
            type_value: type_value,
            message_value: message_value,
            channel_value: channel_value,
            extra_value: extra_value
        });
    }
};