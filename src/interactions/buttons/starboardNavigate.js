const { ButtonInteraction } = require('discord.js');
const { updateStarboardViewer } = require('../../managers/starboardManager');
const { getSelectMenuById } = require('../../utils');

module.exports = {
    /**
     * @param {ButtonInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const entry_id = args[1];
        const offset = parseInt(args[2], 10) || 0;

        //get select menu
        const select_menu = getSelectMenuById(interaction.message, 'starboardSort');
        //get currently selected sorting option
        const selected_sort = select_menu?.options.find(option => option.default);
        //get user and channel ids
        const select_args = select_menu.customId.split('|');
        const user_id = select_args[1];
        const channel_id = select_args[2];

        await updateStarboardViewer(interaction, {
            user_id: user_id,
            channel_id: channel_id,
            selected_sort_value: selected_sort?.value,
            entry_id: entry_id,
            offset: offset
        });
	}
};