module.exports = (sequelize, DataTypes) => {
	return sequelize.define('leave_roles', {
		user_id: DataTypes.STRING,
        role_id: DataTypes.STRING
	}, {
		timestamps: false,
	});
};