const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const authMiddleware = require('../middleware/authMiddleware');
const {
    AuthenticationError,
    NotFoundError,
    ValidationError
} = require('../utils/errors');
const { sendSuccess } = require('../utils/response');

router.use(authMiddleware);

function getUserId(req) {
    if (!req.user) {
        return null;
    }
    return req.user.id || req.user.userId || req.user._id;
}

// 1. 获取列表
router.get('/list', async (req, res, next) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return next(new AuthenticationError('无法获取用户ID'));
        }

        const chats = await Chat.find({ userId })
            .select('_id title updatedAt')
            .sort({ updatedAt: -1 });
        return sendSuccess(res, { message: '获取成功', data: chats });
    } catch (err) {
        next(err);
    }
});

// 2. 新建会话
router.post('/new', async (req, res, next) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return next(new AuthenticationError('用户ID无效'));
        }

        const { firstMessage } = req.body;
        let title = '新对话';
        if (firstMessage) {
            title = firstMessage.length > 20 ? `${firstMessage.substring(0, 20)}...` : firstMessage;
        }

        const newChat = new Chat({
            userId,
            title,
            messages: firstMessage ? [{ role: 'user', content: firstMessage }] : []
        });

        const savedChat = await newChat.save();
        return sendSuccess(res, { message: '创建成功', data: savedChat });
    } catch (err) {
        next(err);
    }
});

// 3. 获取详情
router.get('/:id', async (req, res, next) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return next(new AuthenticationError('无法获取用户ID'));
        }

        const chat = await Chat.findOne({
            _id: req.params.id,
            userId
        });

        if (!chat) {
            return next(new NotFoundError('会话'));
        }
        return sendSuccess(res, { message: '保存成功', data: chat });
    } catch (err) {
        next(err);
    }
});

// 4. 追加消息
router.post('/:id/message', async (req, res, next) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return next(new AuthenticationError('无法获取用户ID'));
        }

        const { role, content } = req.body;
        if (!role || !content) {
            return next(new ValidationError('消息角色和内容不能为空'));
        }

        const chat = await Chat.findOneAndUpdate(
            { _id: req.params.id, userId },
            {
                $push: { messages: { role, content } },
                $set: { updatedAt: Date.now() }
            },
            { new: true }
        );

        if (!chat) {
            return next(new NotFoundError('会话'));
        }
        return sendSuccess(res, { message: '保存成功', data: chat });
    } catch (err) {
        next(err);
    }
});

// 5. 修改标题
router.put('/:id', async (req, res, next) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return next(new AuthenticationError('无法获取用户ID'));
        }

        const { title } = req.body;
        if (!title || !title.trim()) {
            return next(new ValidationError('标题不能为空'));
        }

        const updatedChat = await Chat.findOneAndUpdate(
            { _id: req.params.id, userId },
            { title: title.trim() },
            { new: true }
        );

        if (!updatedChat) {
            return next(new NotFoundError('会话'));
        }
        return sendSuccess(res, { message: '更新成功', data: updatedChat });
    } catch (err) {
        next(err);
    }
});

// 6. 删除会话
router.delete('/:id', async (req, res, next) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return next(new AuthenticationError('无法获取用户ID'));
        }

        const deletedChat = await Chat.findOneAndDelete({
            _id: req.params.id,
            userId
        });

        if (!deletedChat) {
            return next(new NotFoundError('会话'));
        }
        return sendSuccess(res, { message: '删除成功' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
