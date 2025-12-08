const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: '新对话' },
    messages: [
        {
            role: { type: String, required: true }, // user 或 assistant
            content: { type: String, required: true },
            timestamp: { type: Date, default: Date.now }
        }
    ],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// === 修复点：Mongoose 新版写法，去掉 next 参数 ===
ChatSchema.pre('save', function() {
    this.updatedAt = Date.now();
});

// 添加索引优化查询性能
ChatSchema.index({ userId: 1, updatedAt: -1 });
ChatSchema.index({ userId: 1, createdAt: -1 });
ChatSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Chat', ChatSchema);