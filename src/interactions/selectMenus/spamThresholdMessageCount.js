const { SelectMenuInteraction } = require('discord.js');
const { updateThresholdPrompt } = require('../../managers/spamManager');

module.exports = {
    /**
     * @param {SelectMenuInteraction} interaction 
     */
    async execute(interaction) {
        //get currently selected message count
        const message_value = interaction.values[0];
        
        //get preserved args
        const args = interaction.customId.split('|');
        const type_value = args[1];
        //args[2] is old message_value
        const channel_value = args[3];
        const extra_value = args[4];
        
        await updateThresholdPrompt(interaction, {
            type_value: type_value,
            message_value: message_value,
            channel_value: channel_value,
            extra_value: extra_value
        });
    }
};