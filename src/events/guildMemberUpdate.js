const { Client, GuildMember } = require('discord.js');
const { jailMember, getJailDataByMember, unjailMember } = require('../managers/jailManager');
const { ids, isAdmin } = require('../utils');

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
        if (added_roles && added_roles.has(ids.jailed_role)) {

            //no jailing admins
            if (!new_member.manageable || isAdmin(new_member)) {  
                await new_member.roles.remove(ids.jailed_role);
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
        //if jailed role was removed
        else if (removed_roles && removed_roles.has(ids.jailed_role)) {
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
                await unjailMember(data);
            }
        }
    }
}