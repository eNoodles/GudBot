const utils = require('../utils');

module.exports = {
	async execute(client, message) {
        if (message.author.bot) return;

        //fetch/create channel webhook if it's not in cache
        if (!utils.webhooks_cache.has(message.channel.id)) {
            const hook = await utils.fetchOrCreateHook(message.channel);
            utils.webhooks_cache.set(message.channel.id, hook);
        }

        censorMessage(message);
	}
};

const bad_words = /ni+gg+(?:a|а|e|е|3)+r?|tr(?:a|а)+nn+(?:y|у|i+(?:e|е))|f(?:a|а)+gg*(?:o|о)*t?/ig;

async function censorMessage(message) {

    const content = message.content;
    let star_count = 0;

    let censored = content.replace(bad_words, (word, index) => {
        const space_index = content.lastIndexOf(' ', index); //nearest space to word on the left
        const left_of_word = content.substring(space_index + 1, index); //all the stuff to the left of word (non whitespace)

        //dont replace if the match is part of a link or emoji
        if (left_of_word.includes('http') || left_of_word.includes('<:') && !left_of_word.includes('>')) return word;

        let censored_word = word[0]; //first char of bad word
        for (let i = 1; i < word.length; i++) { 
            //for every char after the first, add one star
            censored_word += '\\*';
            
            //count total amount of stars inserted into message
            //also used to determine adjusted max_length later
            star_count++;
        }

        return censored_word;
    });

    //no stars inserted => no censhorship was done
    if (star_count === 0) return;

    try {

        if (message.type === 'REPLY') {
            const replied_msg = await message.fetchReference();
            if (replied_msg) {
                censored = `> [**${replied_msg.member?.displayName || replied_msg.author.username}** ${replied_msg.content || '*Click to see attachment*'}](${replied_msg.url})\n${censored}`; //🖻🗎
            }
        }

        //split message if it's too big
        let censored_followup;

        const max_length = 2000 - star_count;
        if (censored.length > max_length) {

            const last_nline_index = censored.lastIndexOf('\n', max_length);
            const last_space_index = censored.lastIndexOf(' ', max_length);
            //prioritize last newline over last space, if both not found- fallback to max_length
            const cutoff_index = last_nline_index !== -1 ? last_nline_index : last_space_index !== -1 ? last_space_index : max_length;

            //if cutoff point was a newline, add fake bold ** ** to preserve it in the beginning of the followup message
            censored_followup = `${cutoff_index === last_nline_index ? '** **' : ''}${censored.substring( cutoff_index )}`;
            censored = censored.substring(0, cutoff_index);
        }

        //delete user's original uncensored message
        message.delete();

        //webhook cache is updated on each messageCreate, so we know it exists
        const hook = utils.webhooks_cache.get(message.channel.id);

        const pfp = message.member.displayAvatarURL(); //in case it's needed twice

        //send censored message through webhook, mimicing user's name and pfp
        const new_msg = await hook.send({
            content: censored,
            username: message.member.displayName,
            avatarURL: pfp
        });

        //cache the message id and corresponding original author id, so that we could use this for the jail context menu command
        utils.censored_cache.set(new_msg.id, message.author.id);
        
        if (censored_followup) {
            const new_msg = await hook.send({
                content: censored_followup,
                username: message.member.displayName,
                avatarURL: pfp
            });

            utils.censored_cache.set(new_msg.id, message.author.id);
        }
    }
    catch (e) {
        console.error(e);
    }
}