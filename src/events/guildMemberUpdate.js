const { Client, GuildMember, MessageEmbed } = require('discord.js');
const { jailMember, getJailDataByMember } = require('../managers/jailManager');
const { ids, isAdmin, colors, getCachedChannel } = require('../utils');

module.exports = {
    /**
     * @param {Client} client 
     * @param {GuildMember} old_member 
     * @param {GuildMember} new_member 
     */
    async execute(client, old_member, new_member) {

        const old_roles = old_member.roles.cache;
        const new_roles = new_member.roles.cache;

        //compare old and new roles, filter out the existing ones
        const added_roles = new_roles.size > old_roles.size ? new_roles.filter(role => !old_roles.has(role.id)) : null;
        const removed_roles = old_roles.size > new_roles.size ? old_roles.filter(role => !new_roles.has(role.id)) : null;

        //if jailed role was added
        if (added_roles && added_roles.has(ids.roles.jailed)) {

            //no jailing admins
            if (!new_member.manageable || isAdmin(new_member)) {  
                await new_member.roles.remove(ids.roles.jailed);
                return;
            }

            //guildMemberUpdate doesn't emit executor data unfortunately, so we have to look it up in the audit log
            const audit_logs = await new_member.guild.fetchAuditLogs({
                type: 25, //MemberRoleUpdate
                limit: 1
            });

            //make sure we got the right one by cross referencing audit log entry target and member id
            const member_update_entry = audit_logs.entries.find(entry => entry.target.id === new_member.id);
            const jailer_user = member_update_entry?.executor;

            //only proceed if jailer can be determined
            //ignore if jailing was done by bot (to prevent recursion)
            if (jailer_user && !jailer_user.bot) {
                await jailMember(new_member, jailer_user);
            }
        }
        //role was added to currently jailed user
        else if (added_roles && new_roles.has(ids.roles.jailed) && new_member.manageable) {
            //remove added roles
            await new_member.roles.remove(added_roles);
            return;
        }
        //if jailed role was removed
        else if (removed_roles && removed_roles.has(ids.roles.jailed)) {
            const data = await getJailDataByMember(new_member);
        
            if (!data) return;

            //guildMemberUpdate doesn't emit executor data unfortunately, so we have to look it up in the audit log
            const audit_logs = await new_member.guild.fetchAuditLogs({
                type: 25, //MemberRoleUpdate
                limit: 1
            });

            //make sure we got the right one by cross referencing audit log entry target and member id
            const member_update_entry = audit_logs.entries.find(entry => entry.target.id === new_member.id);
            const jailer_user = member_update_entry?.executor;

            //only proceed if jailer can be determined
            //ignore if jailing was done by bot (to prevent recursion)
            if (jailer_user && !jailer_user.bot) {
                await data.unjailMember(jailer_user);

                //send notification in #criminal-records
                const embed = new MessageEmbed()
                    .setDescription(`<@${jailer_user.id}> unjailed <@${data.member.id}>`)
                    .setColor(colors.green);

                await getCachedChannel(ids.channels.records).send({
                    reply: {
                        messageReference: data.message,
                        failIfNotExists: false
                    },
                    embeds: [embed]
                });
            }
        }
    }
};