const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 100 }, // 默认积分
    isAdmin: { type: Boolean, default: false }, // 管理员标识
    createdAt: { type: Date, default: Date.now }
});

// 添加索引优化查询性能
// 注意: username 字段已有 unique: true，会自动创建索引，无需重复定义
UserSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', UserSchema);