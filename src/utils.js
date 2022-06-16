const { MessageEmbed, Permissions, GuildMember } = require('discord.js');

module.exports = {
    ids: {
        client: '822565220190650379',
        guild: '822148574032298064', //'364164445657890816',

        intro_ch: '883882213714837514',
        rules_ch: '552982479212904448',
        dl_ch: '486202559951011870',
        dldb_ch: '607310581053128717',
        mod_ch: '860181373468540948',
        star_ch: '888515334015942676',
        records_ch: '986712503935447130', //746696906314612807

        lurker_role: '523883593978609704',
        gmteam_role: '409531885119864832',
        jailed_role: '865603749393334283', //603983150011514979
        muted_role: '606870055770390538',
        blankicon_role: '894731175216701450',
    },
    colors: {
        red: 16711680,
        green: 3394611,
        gray: 10066329,
        purple: 10434242,
    },
    buttons: {
        blurple: 1,//'PRIMARY',
        gray: 2,//'SECONDARY',
        green: 3,//'SUCCESS',
        red: 4,//'DANGER',
        link: 5,//'LINK',
    },
    textinput: {
        short: 1,
        long: 2
    },
    hasRole(member, id) {
        if (!member) return false;
    
        return member.roles.cache.some(r => 
            r.id === id
        );
    },
    isAdmin(member) {
        if (!member) return false;

        return member.permissions.has(Permissions.FLAGS.ADMINISTRATOR);
    },
    getMemberFullName(member) {
        if (!member)
            return 'Member not found';
    
        return `${member.nickname ? `${member.nickname} (${member.user.username})` : member.user.username}`;
    },
    /**
     * @param {string} message Description of embed.
     * @param {string} [footer] Footer of embed.
     * @returns {MessageEmbed} Embed with red border, default footer, and inputted message.
     */
    createErrorEmbed(message, footer = 'User satisfaction is not guaranteed.') {
        return new MessageEmbed()
            .setDescription(message)
            .setFooter({text: footer})
            .setColor(this.colors.red);
    },
    /**
     * @param {GuildMember} member
     * @param {Model} jail_record Model instance of jail event.
     * @param {array} role_ids IDs of member's roles before they were removed.
     * @param {number} prior_offenses Count of member's previous jail instances.
     * @returns {MessageEmbed} Embed with user handles and fields describing reason, roles, prior offenses, time of jail/release.
     */
    createJailEmbed(member, jail_record, role_ids, prior_offenses) {

        const offender_id = jail_record.offender_id;
        const jailer_id = jail_record.jailer_id;
        const reason = jail_record.reason;
        const jail_timestamp = Math.floor(new Date(jail_record.jail_timestamp).getTime() / 1000);
        const release_timestamp = jail_record.release_timestamp ? Math.floor(new Date(jail_record.release_timestamp).getTime() / 1000) : null;

        // const embed = new MessageEmbed()
        //     .setAuthor({
        //         name: member.user.tag,
        //         iconURL: member.avatarURL()
        //     })
        //     .setColor(this.colors.green)
        //     .setDescription(`<@${offender_id}> jailed by <@${jailer_id}>`);

        const embed = new MessageEmbed().setColor(this.colors.green);

        const fields = [];

        fields.push({
            name: 'Jailed:',
            value: `<@${offender_id}>`,
            inline: true
        });

        fields.push({
            name: 'By:',
            value: `<@${jailer_id}>`,
            inline: true
        });

        fields.push({
            name: 'Reason:',
            value: reason || 'Not given.'
        });
        
        let roles_str = '';
        for (let i = 0; i < role_ids.length; i++) {
            roles_str += `<@&${role_ids[i]}> `;
        }

        fields.push({
            name: 'Removed roles:',
            value: roles_str || 'None.'
        });

        fields.push({
            name: 'Prior offenses:',
            value: `${prior_offenses}` || 'None.'
        });

        fields.push({
            name: 'Time of jail:',
            value: `<t:${jail_timestamp}:f>`
        });

        if (release_timestamp) {
            fields.push({
                name: 'Time of release:',
                value: `<t:${release_timestamp}:R>`
            });
        }

        return embed.addFields(fields);
    }
};