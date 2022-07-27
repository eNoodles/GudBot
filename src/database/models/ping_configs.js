module.exports = (sequelize, DataTypes) => {
	return sequelize.define('0000_ping_configs', {
        role_id: {
            type: DataTypes.STRING,
            unique: true,
            primaryKey: true,
        },
        cooldown: DataTypes.INTEGER,
        channel_ids: DataTypes.TEXT,
        role_ids: DataTypes.TEXT,
        user_ids: DataTypes.TEXT
    });
};