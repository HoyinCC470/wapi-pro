const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
    // 获取请求头里的 Token
    const token = req.header('Authorization')?.replace('Bearer ', '');

    // 如果没有 Token，直接驳回
    if (!token) {
        return res.status(401).json({ message: '无访问权限，请先登录' });
    }

    try {
        // 验证 Token 是否有效
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        req.user = decoded; // 把用户 ID 塞进请求里
        next(); // 放行
    } catch (err) {
        res.status(401).json({ message: 'Token 无效或已过期' });
    }
};