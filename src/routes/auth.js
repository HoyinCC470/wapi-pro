const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RegistrationCode = require('../models/RegistrationCode');

// 注册
router.post('/register', async (req, res) => {
    try {
        const { username, password, registrationCode } = req.body;
        if (!username || !password) return res.status(400).json({ message: '账号密码不能为空' });
        if (!registrationCode) return res.status(400).json({ message: '注册码不能为空' });
        
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ message: '用户名已存在' });

        // 验证注册码
        const code = registrationCode.trim().toUpperCase();
        const regCode = await RegistrationCode.findOne({ code });
        
        if (!regCode) {
            return res.status(400).json({ message: '注册码无效' });
        }
        
        if (regCode.used) {
            return res.status(400).json({ message: '注册码已被使用' });
        }
        
        // 检查是否过期
        if (regCode.expiresAt && new Date() > regCode.expiresAt) {
            return res.status(400).json({ message: '注册码已过期' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();

        // 标记注册码为已使用
        regCode.used = true;
        regCode.usedBy = newUser._id;
        regCode.usedAt = new Date();
        await regCode.save();

        res.status(201).json({ message: '注册成功' });
    } catch (err) {
        console.error("注册错误:", err);
        res.status(500).json({ message: '服务器错误' });
    }
});

// 登录
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ message: '用户不存在或密码错误' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: '用户不存在或密码错误' });

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '7d' });

        res.json({ message: '登录成功', token, user: { username: user.username, id: user._id } });
    } catch (err) {
        console.error("登录错误:", err);
        res.status(500).json({ message: '服务器错误' });
    }
});

// 管理接口：创建注册码（需要管理员权限，这里简化处理，实际应用中应该添加权限验证）
router.post('/admin/registration-codes', async (req, res) => {
    try {
        const { code, expiresAt } = req.body;
        
        if (!code) {
            // 如果没有提供code，自动生成一个
            const generatedCode = Math.random().toString(36).substring(2, 10).toUpperCase() + 
                                  Math.random().toString(36).substring(2, 10).toUpperCase();
            
            const newCode = new RegistrationCode({ 
                code: generatedCode,
                expiresAt: expiresAt ? new Date(expiresAt) : null
            });
            await newCode.save();
            
            return res.status(201).json({ 
                message: '注册码创建成功', 
                code: generatedCode,
                id: newCode._id
            });
        }
        
        // 如果提供了code，使用提供的code
        const codeUpper = code.trim().toUpperCase();
        const existingCode = await RegistrationCode.findOne({ code: codeUpper });
        if (existingCode) {
            return res.status(400).json({ message: '注册码已存在' });
        }
        
        const newCode = new RegistrationCode({ 
            code: codeUpper,
            expiresAt: expiresAt ? new Date(expiresAt) : null
        });
        await newCode.save();
        
        res.status(201).json({ 
            message: '注册码创建成功', 
            code: codeUpper,
            id: newCode._id
        });
    } catch (err) {
        console.error("创建注册码错误:", err);
        res.status(500).json({ message: '服务器错误' });
    }
});

// 管理接口：获取所有注册码
router.get('/admin/registration-codes', async (req, res) => {
    try {
        const codes = await RegistrationCode.find().sort({ createdAt: -1 }).populate('usedBy', 'username');
        res.json(codes);
    } catch (err) {
        console.error("获取注册码列表错误:", err);
        res.status(500).json({ message: '服务器错误' });
    }
});

// 管理接口：删除注册码
router.delete('/admin/registration-codes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await RegistrationCode.findByIdAndDelete(id);
        res.json({ message: '注册码删除成功' });
    } catch (err) {
        console.error("删除注册码错误:", err);
        res.status(500).json({ message: '服务器错误' });
    }
});

module.exports = router;