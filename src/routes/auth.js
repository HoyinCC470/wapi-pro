const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret } = require('../utils/security');
const RegistrationCode = require('../models/RegistrationCode');
const { validateRegister, validateLogin } = require('../middleware/validator');
const adminMiddleware = require('../middleware/adminMiddleware');
const authMiddleware = require('../middleware/authMiddleware');
const {
    ValidationError,
    ConflictError,
    AuthenticationError
} = require('../utils/errors');
const { sendSuccess } = require('../utils/response');

// 注册
router.post('/register', validateRegister, async (req, res, next) => {
    try {
        const { username, password, registrationCode } = req.body;

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return next(new ConflictError('用户名已存在'));
        }

        const code = registrationCode.trim().toUpperCase();
        const regCode = await RegistrationCode.findOne({ code });

        if (!regCode) {
            return next(new ValidationError('注册码无效'));
        }

        const isReusableCode = Boolean(regCode.isReusable);

        if (regCode.used && !isReusableCode) {
            return next(new ValidationError('注册码已被使用'));
        }

        if (regCode.expiresAt && new Date() > regCode.expiresAt) {
            return next(new ValidationError('注册码已过期'));
        }

        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();

        if (isReusableCode) {
            regCode.used = false; // 保持可复用标记
            regCode.usedBy = null;
            regCode.usedAt = null;
            regCode.usageCount = (regCode.usageCount || 0) + 1;
            regCode.lastUsedAt = new Date();
        } else {
            regCode.used = true;
            regCode.usedBy = newUser._id;
            regCode.usedAt = new Date();
        }
        await regCode.save();

        return sendSuccess(res, { message: '注册成功', statusCode: 201 });
    } catch (err) {
        next(err);
    }
});

// 登录
router.post('/login', validateLogin, async (req, res, next) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) {
            return next(new AuthenticationError('用户不存在或密码错误'));
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return next(new AuthenticationError('用户不存在或密码错误'));
        }

        const secret = getJwtSecret();
        const token = jwt.sign({ userId: user._id }, secret, { expiresIn: '7d' });

        return sendSuccess(res, {
            message: '登录成功',
            data: { token, user: { username: user.username, id: user._id } }
        });
    } catch (err) {
        next(err);
    }
});

// 管理接口：创建注册码（需要管理员权限）
router.post('/admin/registration-codes', authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
        const { code, expiresAt, isReusable = false } = req.body;
        const reusableFlag = Boolean(isReusable);

        if (!code) {
            const generatedCode = Math.random().toString(36).substring(2, 10).toUpperCase() +
                                  Math.random().toString(36).substring(2, 10).toUpperCase();

            const newCode = new RegistrationCode({
                code: generatedCode,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                isReusable: reusableFlag
            });
            await newCode.save();

            return sendSuccess(res, {
                message: '注册码创建成功',
                data: { code: generatedCode, id: newCode._id },
                statusCode: 201
            });
        }

        const codeUpper = code.trim().toUpperCase();
        const existingCode = await RegistrationCode.findOne({ code: codeUpper });
        if (existingCode) {
            return next(new ConflictError('注册码已存在'));
        }

        const newCode = new RegistrationCode({
            code: codeUpper,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            isReusable: reusableFlag
        });
        await newCode.save();

        return sendSuccess(res, {
            message: '注册码创建成功',
            data: { code: codeUpper, id: newCode._id },
            statusCode: 201
        });
    } catch (err) {
        next(err);
    }
});

// 管理接口：获取所有注册码
router.get('/admin/registration-codes', authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
        const codes = await RegistrationCode.find().sort({ createdAt: -1 }).populate('usedBy', 'username');
        return sendSuccess(res, { message: '获取成功', data: codes });
    } catch (err) {
        next(err);
    }
});

// 管理接口：删除注册码
router.delete('/admin/registration-codes/:id', authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
        const { id } = req.params;
        await RegistrationCode.findByIdAndDelete(id);
        return sendSuccess(res, { message: '注册码删除成功' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
