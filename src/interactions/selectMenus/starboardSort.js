const { SelectMenuInteraction } = require('discord.js');
const { updateStarboardViewer } = require('../../managers/starboardManager');

module.exports = {
    /**
     * @param {SelectMenuInteraction} interaction 
     */
    async execute(interaction) {
        //get currently selected sorting option
        const selected_sort_value = interaction.values[0];
        //get user and channel ids
        const select_args = interaction.customId.split('|');
        const user_id = select_args[1];
        const channel_id = select_args[2];
        
        await updateStarboardViewer(interaction, {
            user_id: user_id,
            channel_id: channel_id,
            selected_sort_value: selected_sort_value
        });
    }
};