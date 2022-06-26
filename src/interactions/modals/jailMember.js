const { MessageEmbed, MessageButton, MessageActionRow, ModalSubmitInteraction } = require('discord.js');
const utils = require('../../utils');

module.exports = {
    /**
     * @param {ModalSubmitInteraction} interaction 
     */
	async execute(interaction) {
        const args = interaction.customId.split('|');
        const member = await interaction.guild.members.fetch(args[1]);

        //no jail overrides
        if (member.roles.cache.has(utils.ids.jailed_role)) {
            interaction.reply({
                embeds: [utils.createErrorEmbed(`<@${member.id}> is already jailed.`)], 
                ephemeral: true
            });
            return;
        }

        const reason = interaction.fields.getTextInputValue('jail_reason');

        const minutes = parseInt(interaction.fields.getTextInputValue('jail_minutes'), 10) || 0;
        const hours = parseInt(interaction.fields.getTextInputValue('jail_hours'), 10) || 0;
        const days = parseInt(interaction.fields.getTextInputValue('jail_days'), 10) || 0;

        const duration = utils.getDurationSeconds(minutes, hours, days);

        //no jailing admins
        if (!member.manageable || utils.isAdmin(member)) {  
            await interaction.reply({ content: 'https://media.discordapp.net/attachments/840211595186536478/889653037201760326/nochamp.gif', ephemeral: true });
            return;
        }

        //generate base jail message
        const jail_message = await utils.jailMember(member, interaction.user, reason, duration);

        //if a message id as passed, we want to add it as an embed to the jail message
        if (args[2]) {
            const ref_msg = await interaction.channel.messages.fetch(args[2]);
            
            const embed = new MessageEmbed()
                .setTitle('Message:')
                .setDescription(ref_msg.content)
                .setFooter({text: `#${interaction.channel.name}`})
                .setTimestamp(ref_msg.createdTimestamp);

            //if message had an image attachment, we want to prioritize that as the embed's image
            const image = ref_msg.attachments?.filter(file => file.contentType.startsWith('image')).first();
            if (image) {
                embed.setImage(image.proxyURL);
            }
            //otherwise we check for image urls in the text content (they would have been embedded normally)
            else {
                const extract_images = utils.extractImageUrls(ref_msg.content);
                if (extract_images) {
                    embed
                        .setDescription(extract_images.content) //this is the message content with removed urls
                        .setImage(extract_images.urls[0]);
                }
            }

            //add the reference message embed to our jail message
            jail_message.embeds.push(embed);
        }

        //send generated jail message to #criminal-records
        const channel = await interaction.guild.channels.fetch(utils.ids.records_ch);
        const sent = await channel.send(jail_message);

        //send interaction reply confirming success
        const embed = new MessageEmbed()
            .setDescription(`Jailed <@${member.id}>`)
            .setColor(utils.colors.green);
        
        const view_button = new MessageButton()
            .setLabel('View record')
            .setStyle(utils.buttons.link)
            .setURL(sent.url);
            
        await interaction.reply({
            embeds: [embed],
            components: [new MessageActionRow().addComponents([view_button])],
            ephemeral: true
        });
	}
};