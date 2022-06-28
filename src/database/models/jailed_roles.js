module.exports = (sequelize, DataTypes) => {
	return sequelize.define('0000_jailed_roles', {
		user_id: DataTypes.STRING,
        role_id: DataTypes.STRING
	}, {
		timestamps: false,
	});
};