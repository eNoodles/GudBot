const { SlashCommandBuilder } = require('@discordjs/builders');
const { CommandInteraction } = require('discord.js');
const { PermissionFlagsBits, ChannelType } = require('discord-api-types/v10');
const { updateStarboardViewer } = require('../../managers/starboardManager');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('starboard')
        .setDescription('View starred messages.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ReadMessageHistory)
        .addUserOption(option => option
            .setName('user')
            .setDescription('Only show posts from this user.')
        )
        .addChannelOption(option => option
            .setName('channel')
            .setDescription('Only show posts from this channel.')
            .addChannelTypes(ChannelType.GuildText)
        ),
    /**
     * @param {CommandInteraction} interaction 
     */
	async execute(interaction) {
        const member_id = interaction.options.getMember('user')?.id;
        const channel_id = interaction.options.getChannel('channel')?.id;

        await updateStarboardViewer(interaction, {
            user_id: member_id,
            channel_id: channel_id
        });
	}
};