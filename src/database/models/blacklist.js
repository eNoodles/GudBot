module.exports = (sequelize, DataTypes) => {
	return sequelize.define('0000_blacklist', {
        word: DataTypes.STRING,
        added_by: DataTypes.STRING
    });
};