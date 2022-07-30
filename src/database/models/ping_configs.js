module.exports = (sequelize, DataTypes) => {
	return sequelize.define('ping_configs', {
        id: {
            type: DataTypes.STRING,
            unique: true,
            primaryKey: true,
        },
        role_id: DataTypes.STRING,
        pinger_id: DataTypes.STRING,
        pinger_type: DataTypes.TINYINT(1),
        channel_id: DataTypes.STRING,
        cooldown: DataTypes.INTEGER
    });
};