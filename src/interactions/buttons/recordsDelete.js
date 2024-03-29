const { ButtonStyle } = require('discord-api-types/v10');
const { MessageEmbed, MessageButton, ButtonInteraction, MessageActionRow } = require('discord.js');
const { getJailDataByRecord } = require('../../managers/jailManager');
const { createErrorEmbed, colors, logUnless, ids } = require('../../utils');

module.exports = {
    /**
     * @param {ButtonInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const record_id = args[1];
        const data = await getJailDataByRecord(record_id);

        if (!data) {
            await interaction.reply({
                embeds: [createErrorEmbed(`Jail record \`#${record_id}\` not found.`)],
                ephemeral: true
            });

            return;
        }

        //confirm action
        const embed = new MessageEmbed()
            .setTitle('Are you sure?')
            .setDescription(`This jail record's information will be permanently erased.`)
            .setColor(colors.blurple);

        const yes_button = new MessageButton()
            .setLabel('Yes')
            .setStyle(ButtonStyle.Success)
            .setCustomId(`confirmRecordsDelete`);

        const no_button = new MessageButton()
            .setLabel('No')
            .setStyle(ButtonStyle.Danger)
            .setCustomId(`cancelRecordsDelete`);

        await interaction.reply({
            embeds: [embed],
            components: [new MessageActionRow().addComponents([yes_button, no_button])],
        });
        
        //only collect interactions from original user
        const filter = i => i.user.id === interaction.user.id && (i.customId === 'confirmRecordsDelete' || i.customId === 'cancelRecordsDelete');

        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 20000, max: 1 });
        
        collector.on('collect', async i => {
            try {
                if (i.customId === 'confirmRecordsDelete') {

                    await data.deleteRecord(); 

                    const embed = new MessageEmbed()
                        .setDescription(`<@${i.user.id}> deleted <@${data.member.id}>'s jail record from <t:${data.record.jail_timestamp}:f>`)
                        .setColor(colors.red);

                    await interaction.channel.send({ embeds: [embed] });
                }
                //cancelRecordsDelete button clicked
                else {
                    //delete original confirmation message
                    await interaction.deleteReply();
                }
            }
            catch (e) {
                console.error(e);

                i.reply({
                    embeds: [createErrorEmbed('There was an error while handling this interaction.')],
                    ephemeral: true
                }).catch(console.error); //it's possible that the interaction is invalid
            }
        });

        //after button is clicked or collector expires, delete the prompt
        collector.on('end', () => { interaction.deleteReply().catch(e => logUnless(e, ids.errors.unknown_message)) } );
	}
};