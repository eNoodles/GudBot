const { Client, GuildMember } = require("discord.js");
const { ids } = require("../utils");
const { leave_roles } = require('../database/dbObjects');

module.exports = {
    /**
     * @param {Client} client 
     * @param {GuildMember} member 
     */
    async execute(client, member) {
        if (member.guild.id !== ids.guild) return;

        //no need to await any of this, it is non critical
        leave_roles
            //clear member's previously saved roles
            .destroy({ where: { user_id: member.id } })
            .then(() => 
                member.roles.cache
                    //get collection of member's roles, apart from base @@everyone role
                    .filter(r => r.id !== ids.guild)
                    .forEach(role => 
                        //save member's roles in db
                        leave_roles
                            .create({
                                user_id: member.id,
                                role_id: role.id
                            })
                            .catch(console.error)
                    )
            )
            .catch(console.error);
    }
};