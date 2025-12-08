/**
 * 统一错误处理中间件
 * 应该放在所有路由之后
 */
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

module.exports = function(err, req, res, next) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isKnownError = err instanceof AppError;

    logger.error(`${req.method} ${req.url} - ${err.message}`, {
        type: isKnownError ? err.type : err.name,
        stack: isDevelopment ? err.stack : undefined,
        url: req.url,
        method: req.method
    });

    let statusCode = isKnownError ? err.statusCode : err.status || err.statusCode || 500;
    let message = err.message || '服务器错误';
    let code = isKnownError ? err.type : 'INTERNAL_SERVER_ERROR';

    // Mongoose 验证错误（仅当包含详细 errors 信息时处理）
    if (err.name === 'ValidationError' && err.errors && typeof err.errors === 'object') {
        statusCode = 400;
        message = Object.values(err.errors).map(e => e.message).join(', ');
        code = 'MONGOOSE_VALIDATION_ERROR';
    }

    // Mongoose 重复键错误
    if (err.code === 11000) {
        statusCode = 400;
        message = '数据已存在';
        code = 'DUPLICATE_KEY_ERROR';
    }

    // JWT 错误
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token 无效或已过期';
        code = 'JWT_ERROR';
    }

    if (!isDevelopment && statusCode === 500) {
        message = '服务器内部错误';
    }

    res.status(statusCode).json({
        success: false,
        code,
        message,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
        ...(isDevelopment && { stack: err.stack })
    });
};


