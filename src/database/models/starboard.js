module.exports = (sequelize, DataTypes) => {
	return sequelize.define('0000_starboard', {
        id: {
            type: DataTypes.STRING,
            unique: true,
            primaryKey: true,
        },
        original_id: {
            type: DataTypes.STRING,
            unique: true
        },
        channel_id: DataTypes.STRING,
        author_id: DataTypes.STRING,
        count: DataTypes.INTEGER,
        timestamp: DataTypes.INTEGER,
        url: DataTypes.STRING
    }, {
        timestamps: false
    });
};