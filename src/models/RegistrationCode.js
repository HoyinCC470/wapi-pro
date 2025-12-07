const mongoose = require('mongoose');

const RegistrationCodeSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    used: { type: Boolean, default: false }, // 是否已使用
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // 被哪个用户使用
    usedAt: { type: Date, default: null }, // 使用时间
    createdBy: { type: String, default: 'admin' }, // 创建者（可选）
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null } // 过期时间（可选，null表示永不过期）
});

module.exports = mongoose.model('RegistrationCode', RegistrationCodeSchema);

