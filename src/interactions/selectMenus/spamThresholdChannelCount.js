const { SelectMenuInteraction } = require('discord.js');
const { updateThresholdPrompt } = require('../../managers/spamManager');

module.exports = {
    /**
     * @param {SelectMenuInteraction} interaction 
     */
    async execute(interaction) {
        //get currently selected channel count
        const selected_channel_value = interaction.values[0];
        
        //get preserved args
        const args = interaction.customId.split('|');
        const selected_type_value = args[1];
        const selected_message_value = args[2];
        //args[3] is old selected_channel_value
        const selected_jail_value = args[4];
        const selected_ban_value = args[5];
        
        await updateThresholdPrompt(interaction, {
            selected_type_value: selected_type_value,
            selected_message_value: selected_message_value,
            selected_channel_value: selected_channel_value,
            selected_jail_value: selected_jail_value,
            selected_ban_value: selected_ban_value
        });
    }
};