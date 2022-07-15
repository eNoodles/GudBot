module.exports = (sequelize, DataTypes) => {
	return sequelize.define('0000_blacklist', {
        word: {
            type: DataTypes.STRING,
            unique: true
        },
        added_by: DataTypes.STRING
    });
};