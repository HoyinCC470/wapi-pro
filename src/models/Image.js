const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    prompt: {
        type: String,
        required: true
    },
    model: {
        type: String,
        default: 'Kwai-Kolors/Kolors'
    },
    resolution: String,
    style: String,
    imageUrl: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// 添加索引优化查询性能
imageSchema.index({ userId: 1, createdAt: -1 });
imageSchema.index({ userId: 1, model: 1, createdAt: -1 });
imageSchema.index({ style: 1, createdAt: -1 });
imageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Image', imageSchema);