const { ButtonInteraction  } = require('discord.js');
const { updateStarboardViewer } = require('../../managers/starboardManager');

module.exports = {
    /**
     * @param {ButtonInteraction} interaction 
     */
	async execute(interaction) {
        //get select menu
        const select_menu_row = interaction.message.components?.at(0);
        const select_menu = select_menu_row?.components?.find(c => c.type === 'SELECT_MENU');
        //get currently selected sorting option
        const selected_sort = select_menu?.options.find(option => option.default);
        //get user and channel ids
        const select_args = select_menu.customId.split('|');
        const user_id = select_args[1];
        const channel_id = select_args[2];

        await updateStarboardViewer(interaction, {
            user_id: user_id,
            channel_id: channel_id,
            selected_sort_value: selected_sort?.value
        });
	}
};