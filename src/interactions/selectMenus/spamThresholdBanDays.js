const { SelectMenuInteraction } = require('discord.js');
const { updateThresholdPrompt } = require('../../managers/spamManager');

module.exports = {
    /**
     * @param {SelectMenuInteraction} interaction 
     */
    async execute(interaction) {
        //get currently selected ban days value
        const selected_ban_value = interaction.values[0];
        
        //get preserved args
        const args = interaction.customId.split('|');
        const selected_type_value = args[1];
        const selected_message_value = args[2];
        const selected_channel_value = args[3];
        const selected_jail_value = args[4];
        //args[5] is old selected_ban_value
        
        await updateThresholdPrompt(interaction, {
            selected_type_value: selected_type_value,
            selected_message_value: selected_message_value,
            selected_channel_value: selected_channel_value,
            selected_jail_value: selected_jail_value,
            selected_ban_value: selected_ban_value
        });
    }
};