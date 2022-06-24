module.exports = (sequelize, DataTypes) => {
	return sequelize.define('0000_jail_records', {
        offender_id: DataTypes.STRING,
        jailer_id: DataTypes.STRING,
        reason: DataTypes.STRING(512),
        jail_timestamp: DataTypes.INTEGER,
        release_timestamp: DataTypes.INTEGER,
        url: DataTypes.STRING
    }, {
        timestamps: false
    });
};