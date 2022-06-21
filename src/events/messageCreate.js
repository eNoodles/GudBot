const { censorMessage } = require('../utils');

module.exports = {
	name: 'messageCreate',
	async execute(client, message) {
        if (message.author.bot) return;

        if (message.content === '!testbruh') {

            let str = 'roles:\n';
            const roles = message.member.roles.cache;
            roles.forEach(role => {
                str += `<@&${role.id}> - ${role.id}\n`;
            });

            message.channel.send({
                content: str
            });
        }

        censorMessage(message);
	}
};