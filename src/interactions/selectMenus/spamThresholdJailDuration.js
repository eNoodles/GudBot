const { SelectMenuInteraction } = require('discord.js');
const { updateThresholdPrompt } = require('../../managers/spamManager');

module.exports = {
    /**
     * @param {SelectMenuInteraction} interaction 
     */
    async execute(interaction) {
        //get currently selected jail duration
        const extra_value = interaction.values[0];
        
        //get preserved args
        const args = interaction.customId.split('|');
        const type_value = args[1];
        const message_value = args[2];
        const channel_value = args[3];
        //args[4] is old extra_value
        
        await updateThresholdPrompt(interaction, {
            type_value: type_value,
            message_value: message_value,
            channel_value: channel_value,
            extra_value: extra_value
        });
    }
};