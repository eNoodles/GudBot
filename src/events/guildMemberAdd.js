const { Client, GuildMember, MessageEmbed } = require("discord.js");
const { ids, colors, logUnless } = require("../utils");
const { leave_roles } = require('../database/dbObjects');

module.exports = {
    /**
     * @param {Client} client 
     * @param {GuildMember} member 
     */
    async execute(client, member) {
        if (member.guild.id !== ids.guild) return;
        
        leave_roles
            //check if any roles have been saved for this user
            .findAll({ where: { user_id: member.id } })
            .then(rows => {
                //if rows found
                if (rows?.length) {
                    //restore member's roles
                    member.roles
                        .set(rows.map(row => row.role_id))
                        .catch(console.error);
                    //delete rows
                    rows.forEach(row => row.destroy().catch(console.error));
                }
                //if no roles were saved, assume member is new and send welcoming message
                else {
                    member
                        .createDM()
                        .then(channel => {
                            const embed = new MessageEmbed()
                                .setTitle('Welcome to GudMods™️')
                                .setDescription(
                                    `Feel free to browse our <#${ids.channels.downloads}> channel for various mods and reshades. ` + 
                                    `For full access to the server, we require you to have a verified account, and you must send one message in any channel to receive the \`@Lurkers\` role, ` + 
                                    `which will allow you to read message history.\n\nIf you require assistance installing and merging mods, head over to <#${ids.channels.user_help}> ` + 
                                    `and reach out to our \`@GM Tech Support\` using the </ping:${ids.commands.ping}> command. We do not recommend asking such things in <#${ids.channels.general}>, ` + 
                                    `as you may not be taken seriously. On that note, you may find some of our members to have a crude sense of humor, but we prefer not to moderate too strictly, ` + 
                                    `as long as no <#${ids.channels.rules}> are broken. As a rule of thumb, don't take anything said here personally.\n\nAnd if you feel so inclined, ` + 
                                    `check out our <#${ids.channels.screenshot_content}> and vote for your favorite submissions. You can read about how the contest works ` + 
                                    `by clicking on the channel's description at the top.`)
                                .setThumbnail('https://media.discordapp.net/attachments/888383950702149662/995056248812744715/Image_5.png') 
                                .setColor(colors.purple);

                            channel
                                .send({embeds: [embed]})
                                .catch(e => logUnless(e, ids.errors.cannot_send_to_user));
                        })
                        .catch(console.error);
                }
            })
            .catch(console.error);
    }
};