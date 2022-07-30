module.exports = (sequelize, DataTypes) => {
	return sequelize.define('jailed_roles', {
		user_id: DataTypes.STRING,
        role_id: DataTypes.STRING
	}, {
		timestamps: false,
	});
};