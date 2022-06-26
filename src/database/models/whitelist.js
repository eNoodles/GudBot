module.exports = (sequelize, DataTypes) => {
	return sequelize.define('0000_whitelist', {
        id: {
            type: DataTypes.STRING,
            unique: true,
            primaryKey: true,
        },
        type: DataTypes.STRING,
        added_by: DataTypes.STRING
    });
};