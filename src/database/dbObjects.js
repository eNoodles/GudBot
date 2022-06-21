const fs = require('fs');
const Sequelize = require('sequelize');
const sequelize = new Sequelize(process.env.db, { logging: false, define: { freezeTableName: true } });

const model_files = fs.readdirSync(`./src/database/models/`).filter(file => file.endsWith('.js'));

for (const file of model_files) {
    const model = require(`./models/${file}`)(sequelize, Sequelize.DataTypes);
    const file_name = file.substring(0, file.lastIndexOf('.'));
    
    module.exports[file_name] = model;
}