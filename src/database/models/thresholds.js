module.exports = (sequelize, DataTypes) => {
	return sequelize.define('0000_thresholds', {
        type: {
            type: DataTypes.STRING,
            unique: true
        },
        set_by: DataTypes.STRING,
        message_count: DataTypes.INTEGER,
        channel_count: DataTypes.INTEGER,
        extra: DataTypes.INTEGER
    }, {
        timestamps: false
    });
};