module.exports = (sequelize, DataTypes) => {
	return sequelize.define('blacklist', {
        word: {
            type: DataTypes.STRING,
            unique: true
        },
        added_by: DataTypes.STRING
    });
};