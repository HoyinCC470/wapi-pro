const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../utils/security');
const { AuthenticationError, AppError } = require('../utils/errors');

module.exports = function(req, res, next) {
    // 获取请求头里的 Token
    const token = req.header('Authorization')?.replace('Bearer ', '');

    // 如果没有 Token，直接驳回
    if (!token) {
        return next(new AuthenticationError('无访问权限，请先登录'));
    }

    try {
        const secret = getJwtSecret();
        // 验证 Token 是否有效
        const decoded = jwt.verify(token, secret);
        req.user = decoded; // 把用户 ID 塞进请求里
        next(); // 放行
    } catch (err) {
        if (err.message.includes('JWT_SECRET')) {
            console.error('❌ JWT 配置错误:', err.message);
            return next(new AppError('服务器配置错误', 500));
        }
        return next(new AuthenticationError('Token 无效或已过期'));
    }
};