const mongoose = require('mongoose');

const RegistrationCodeSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    used: { type: Boolean, default: false }, // 是否已使用
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // 被哪个用户使用
    usedAt: { type: Date, default: null }, // 使用时间
    createdBy: { type: String, default: 'admin' }, // 创建者（可选）
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null }, // 过期时间（可选，null表示永不过期）
    isReusable: { type: Boolean, default: false }, // 是否可重复使用
    usageCount: { type: Number, default: 0 }, // 使用次数（仅可复用时统计）
    lastUsedAt: { type: Date, default: null } // 最后一次使用时间
});

// 添加索引优化查询性能
// 注意: code 字段已有 unique: true，会自动创建索引，无需重复定义
RegistrationCodeSchema.index({ used: 1, createdAt: -1 });
RegistrationCodeSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('RegistrationCode', RegistrationCodeSchema);

