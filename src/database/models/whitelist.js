module.exports = (sequelize, DataTypes) => {
	return sequelize.define('whitelist', {
        id: {
            type: DataTypes.STRING,
            unique: true,
            primaryKey: true,
        },
        type: DataTypes.STRING,
        added_by: DataTypes.STRING
    });
};