const User = require('../models/User');
const { AuthenticationError, AuthorizationError, AppError } = require('../utils/errors');

/**
 * 管理员权限验证中间件
 * 检查用户是否为管理员（通过环境变量 ADMIN_USER_IDS 配置）
 */
module.exports = async function(req, res, next) {
    try {
        if (!req.user || !req.user.userId) {
            return next(new AuthenticationError('请先登录'));
        }

        // 从环境变量获取管理员用户 ID 列表
        const adminUserIds = process.env.ADMIN_USER_IDS 
            ? process.env.ADMIN_USER_IDS.split(',').map(id => id.trim())
            : [];

        // 如果未配置管理员，则拒绝访问
        if (adminUserIds.length === 0) {
            console.warn('⚠️  警告: ADMIN_USER_IDS 未配置，管理接口将被禁用');
            return next(new AuthorizationError('管理员功能未启用'));
        }

        const userId = req.user.userId.toString();
        
        // 检查用户是否为管理员
        if (adminUserIds.includes(userId)) {
            return next();
        }

        // 也可以检查用户模型中的 isAdmin 字段（如果存在）
        const user = await User.findById(userId);
        if (user && user.isAdmin === true) {
            return next();
        }

        return next(new AuthorizationError('需要管理员权限'));
    } catch (err) {
        console.error('管理员验证错误:', err);
        return next(err instanceof AppError ? err : new AppError('服务器错误', 500));
    }
};


