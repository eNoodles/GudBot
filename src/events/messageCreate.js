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

        //append fake reply to beginning of censored message content
        if (message.type === 'REPLY') {

            const replied_msg = await message.fetchReference();
            if (replied_msg) {
                //if there is no message content, then it must have been an attachment-only message
                let reply_content = replied_msg.content || '*Click to see attachment*'; //🖻🗎

                if (reply_content.length > 500) {
                    const cutoff_index = utils.findLastSpaceIndex(reply_content, 500);
                    reply_content = reply_content.substring(0, cutoff_index);
                    reply_content = utils.trimWhitespace(reply_content);
                    reply_content = utils.addEllipsisDots(reply_content);
                }

                //newlines break the quote block so we must reinsert '> ' on each line
                reply_content = reply_content.replace('\n', '\n> ');

                censored = `> [**${replied_msg.member?.displayName || replied_msg.author.username}** ${reply_content}](${replied_msg.url})\n${censored}`;
            }
        }

        //split message if it's too big
        let censored_followup;

        const max_length = 2000 - star_count;
        if (censored.length > max_length) {

            const cutoff_index = utils.findLastSpaceIndex(censored, max_length);
            censored_followup = censored.substring( cutoff_index );

            //if cutoff point was a newline, add fake bold ** ** to preserve it in the beginning of the followup message
            if (censored_followup.startsWith('\n')) 
                censored_followup = `** **${censored_followup}`
            
            censored = censored.substring(0, cutoff_index);
        }

        //delete user's original uncensored message
        message.delete();

        //webhook cache is updated on each messageCreate, so we know it exists
        const hook = utils.webhooks_cache.get(message.channel.id);

        //mimic original author's name and pfp
        //mentions are disabled because we dont want to ping people twice
        let message_options = {
            content: censored,
            username: message.member.displayName,
            avatarURL: message.member.displayAvatarURL(),
            allowedMentions: { parse: [] }
        };

        //check if original message had attachments and filter out ones that are above the current guild's upload size limit
        const attachments = [...message.attachments?.filter(file => file.size <= utils.getGuildUploadLimit(message.guild) ).values()];
        //add the attachments to the message if there will be no followup (we dont want the attachments to between the intial and followup message)
        if (!censored_followup && attachments) message_options.files = attachments;

        //send censored message through webhook
        const new_msg = await hook.send(message_options);

        //cache the message id and corresponding original author id, so that we could use this for the jail context menu command
        utils.censored_cache.set(new_msg.id, message.author.id);
        
        //this is part 2 of large messages
        if (censored_followup) {
            //reuse the same MessageOptions, just change the text content
            message_options.content = censored_followup;
            //if attachments were not sent with first message
            if (attachments) message_options.files = attachments;
            
            //send and cache ids
            const new_msg = await hook.send(message_options);
            utils.censored_cache.set(new_msg.id, message.author.id);
        }
    }
    catch (e) {
        console.error(e);
    }
}