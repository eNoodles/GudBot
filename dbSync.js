require('dotenv').config();
const fs = require('fs');
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

const model_files = fs.readdirSync(`./src/database/models/`).filter(file => file.endsWith('.js'));

for (const file of model_files) {
    require(`./src/database/models/${file}`)(sequelize, Sequelize.DataTypes);
}

const force = process.argv.includes('-f');

sequelize.sync({ force }).then(() => {
	console.log('Database synced');
	sequelize.close();
}).catch(console.error);