const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// === 辅助函数：兼容不同的 User ID 写法 ===
function getUserId(req) {
    if (!req.user) return null;
    // 尝试获取 ID，兼容 id, userId, _id 三种常见写法
    return req.user.id || req.user.userId || req.user._id;
}

// 1. 获取列表
router.get('/list', async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            console.error("❌ 错误: req.user 中找不到 ID. req.user 内容:", req.user);
            return res.status(401).json({ message: '无法获取用户ID' });
        }

        const chats = await Chat.find({ userId: userId })
            .select('_id title updatedAt') 
            .sort({ updatedAt: -1 });
        res.json(chats);
    } catch (err) {
        console.error("获取列表失败:", err);
        res.status(500).json({ message: '服务器错误' });
    }
});

// 2. 新建会话
router.post('/new', async (req, res) => {
    try {
        const userId = getUserId(req);
        // === 调试日志 ===
        console.log("正在创建会话，当前用户:", req.user);
        console.log("解析出的 UserID:", userId);
        // ================

        if (!userId) {
            return res.status(401).json({ message: '用户ID无效' });
        }

        const { firstMessage } = req.body;
        let title = "新对话";
        if (firstMessage) {
            title = firstMessage.length > 20 ? firstMessage.substring(0, 20) + "..." : firstMessage;
        }

        const newChat = new Chat({
            userId: userId, // 使用兼容后的 ID
            title: title,
            messages: firstMessage ? [{ role: 'user', content: firstMessage }] : []
        });

        const savedChat = await newChat.save();
        console.log("✅ 会话创建成功:", savedChat._id);
        res.json(savedChat);
    } catch (err) {
        console.error("❌ 新建会话失败:", err); // 这里会打印具体的 mongoose 错误
        res.status(500).json({ message: '创建失败: ' + err.message });
    }
});

// 3. 获取详情
router.get('/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        const chat = await Chat.findOne({ 
            _id: req.params.id, 
            userId: userId 
        });

        if (!chat) return res.status(404).json({ message: '会话不存在' });
        res.json(chat);
    } catch (err) {
        console.error("获取详情失败:", err);
        res.status(500).json({ message: '服务器错误' });
    }
});

// 4. 追加消息
router.post('/:id/message', async (req, res) => {
    try {
        const userId = getUserId(req);
        const { role, content } = req.body;
        
        const chat = await Chat.findOneAndUpdate(
            { _id: req.params.id, userId: userId },
            { 
                $push: { messages: { role, content } },
                $set: { updatedAt: Date.now() }
            },
            { new: true }
        );

        if (!chat) return res.status(404).json({ message: '会话不存在' });
        res.json(chat);
    } catch (err) {
        console.error("保存消息失败:", err);
        res.status(500).json({ message: '保存失败' });
    }
});

// 5. 修改标题 (PUT)
router.put('/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        const { title } = req.body;

        const updatedChat = await Chat.findOneAndUpdate(
            { _id: req.params.id, userId: userId },
            { title: title },
            { new: true }
        );

        if (!updatedChat) return res.status(404).json({ message: '会话不存在' });
        res.json(updatedChat);
    } catch (err) {
        console.error("修改标题失败:", err);
        res.status(500).json({ message: '服务器错误' });
    }
});

// 6. 删除会话
router.delete('/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        const deletedChat = await Chat.findOneAndDelete({ 
            _id: req.params.id, 
            userId: userId 
        });

        if (!deletedChat) return res.status(404).json({ message: '会话不存在' });
        res.json({ message: '删除成功' });
    } catch (err) {
        console.error("删除会话失败:", err);
        res.status(500).json({ message: '服务器错误' });
    }
});

module.exports = router;