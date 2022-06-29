const { MessageEmbed, MessageButton, ButtonInteraction, MessageActionRow } = require('discord.js');
const { getJailData, deleteRecord } = require('../../managers/jail_manager');
const utils = require('../../utils');

module.exports = {
    /**
     * @param {ButtonInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const record_id = args[1];
        const data = await getJailData(interaction.guild, record_id);
        const { record } = data;

        //confirm action
        const embed = new MessageEmbed()
            .setTitle('Are you sure?')
            .setDescription(`This jail record's information will be permanently erased.`)
            .setColor(utils.colors.blurple);

        const yes_button = new MessageButton()
            .setLabel('Yes')
            .setStyle(utils.buttons.green)
            .setCustomId(`confirmRecordsDelete`);

        const no_button = new MessageButton()
            .setLabel('No')
            .setStyle(utils.buttons.red)
            .setCustomId(`cancelRecordsDelete`);

        await interaction.reply({
            embeds: [embed],
            components: [new MessageActionRow().addComponents([yes_button, no_button])]
        });
        
        const filter = i => i.user.id === interaction.user.id && (i.customId === 'confirmRecordsDelete' || i.customId === 'cancelRecordsDelete');

        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 10000, max: 1 });
        
        collector.on('collect', async i => {
            try {
                if (i.customId === 'confirmRecordsDelete') {

                    await deleteRecord(data, interaction.user); 

                    const embed = new MessageEmbed()
                        .setDescription(`Successfully deleted jail record from <t:${record.jail_timestamp}:f>`)
                        .setColor(utils.colors.green);

                    await i.update({
                        embeds: [embed],
                        components: []
                    });
                }
                else {
                    //delete original confirmation message
                    await interaction.deleteReply();
                }
            }
            catch (e) {
                console.error(e);

                i.reply({
                    embeds: [utils.createErrorEmbed('There was an error while handling this interaction.')],
                    ephemeral: true
                }).catch(console.error); //it's possible that the interaction is invalid
            }
        });

        collector.on('end', () => { interaction.deleteReply().catch(console.error) } );
	}
};