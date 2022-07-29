require('dotenv').config();
const Sequelize = require('sequelize');
const sequelize = new Sequelize(
    process.env.db, 
    {
        logging: false,
        define: {
            freezeTableName: true,
            charset: 'utf8mb4'
        }
    }
);
const { Client, Intents } = require('discord.js');
const client = new Client({ 
    intents: [
        Intents.FLAGS.GUILDS, 
        Intents.FLAGS.GUILD_MEMBERS, 
        Intents.FLAGS.GUILD_MESSAGES, 
        Intents.FLAGS.GUILD_MESSAGE_REACTIONS
    ],
    partials: [
        'MESSAGE',
        'CHANNEL',
        'REACTION'
    ]
});

const old_starboard = sequelize.define('starboards', {
    id: {
        type: Sequelize.STRING(185),
        unique: true,
        primaryKey: true,
    },
    original_id: {
        type: Sequelize.STRING(185),
        unique: true
    },
    channel_id: Sequelize.STRING(185),
    author_id: Sequelize.STRING(185),
    count: Sequelize.INTEGER,
    hasImage: Sequelize.BOOLEAN,
    hasAttachment: Sequelize.BOOLEAN,
    url: Sequelize.STRING
});


const new_starboard = sequelize.define('temp_starboard', {
    id: {
        type: Sequelize.STRING,
        unique: true,
        primaryKey: true,
    },
    original_id: {
        type: Sequelize.STRING,
        unique: true
    },
    channel_id: Sequelize.STRING,
    author_id: Sequelize.STRING,
    count: Sequelize.INTEGER,
    timestamp: Sequelize.INTEGER,
    url: Sequelize.STRING
    }, {
        timestamps: false
    }
);

client.login(process.env.token);

client.once('ready', async () => {
    await new_starboard.sync();

    old_starboard
        .findAll()
        .then(entries => {
            entries?.forEach(entry => {
                client.channels
                    .fetch(entry.channel_id)
                    .then(channel => {
                        channel.messages
                            ?.fetch(entry.original_id)
                            .then(message => {
                                message?.reactions?.cache.forEach(async reaction => {
                                    if (reaction.partial) await reaction.fetch();

                                    if (reaction.emoji.name === '⭐') {
                                        new_starboard
                                            .create({
                                                id: entry.id,
                                                original_id: entry.original_id,
                                                channel_id: entry.channel_id,
                                                author_id: entry.author_id,
                                                count: reaction.count,
                                                timestamp: Math.floor(message.createdTimestamp / 1000),
                                                url: entry.url
                                            })
                                            .catch(console.error)
                                    }
                                });
                            })
                            .catch(console.error);
                    })
                    .catch(console.error);

                
            });
        })
        .catch(console.error);
});

