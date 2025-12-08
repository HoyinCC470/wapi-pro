const { ValidationError: RequestValidationError } = require('../utils/errors');

/**
 * 输入验证中间件
 */

/**
 * 验证用户名格式
 */
function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        return { valid: false, message: '用户名不能为空' };
    }
    
    const trimmed = username.trim();
    if (trimmed.length < 3 || trimmed.length > 20) {
        return { valid: false, message: '用户名长度必须在 3-20 个字符之间' };
    }
    
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(trimmed)) {
        return { valid: false, message: '用户名只能包含字母、数字、下划线和中文' };
    }
    
    return { valid: true };
}

/**
 * 验证密码强度
 */
function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, message: '密码不能为空' };
    }
    
    if (password.length < 8) {
        return { valid: false, message: '密码长度至少 8 个字符' };
    }
    
    if (password.length > 128) {
        return { valid: false, message: '密码长度不能超过 128 个字符' };
    }
    
    // 至少包含字母和数字
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    
    if (!hasLetter || !hasNumber) {
        return { valid: false, message: '密码必须包含至少一个字母和一个数字' };
    }
    
    return { valid: true };
}

/**
 * 注册请求验证中间件
 */
function validateRegister(req, res, next) {
    const { username, password, registrationCode } = req.body;
    
    // 验证用户名
    const usernameCheck = validateUsername(username);
    if (!usernameCheck.valid) {
        return next(new RequestValidationError(usernameCheck.message));
    }
    
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
        return next(new RequestValidationError(passwordCheck.message));
    }
    
    if (!registrationCode || typeof registrationCode !== 'string' || !registrationCode.trim()) {
        return next(new RequestValidationError('注册码不能为空'));
    }
    
    next();
}

/**
 * 登录请求验证中间件
 */
function validateLogin(req, res, next) {
    const { username, password } = req.body;
    
    if (!username || typeof username !== 'string' || !username.trim()) {
        return next(new RequestValidationError('用户名不能为空'));
    }
    
    if (!password || typeof password !== 'string' || !password.trim()) {
        return next(new RequestValidationError('密码不能为空'));
    }
    
    next();
}

/**
 * 验证提示词（用于图像生成）
 */
function validatePrompt(prompt) {
    if (!prompt || typeof prompt !== 'string') {
        return { valid: false, message: '提示词不能为空' };
    }
    
    const trimmed = prompt.trim();
    if (trimmed.length < 1) {
        return { valid: false, message: '提示词不能为空' };
    }
    
    if (trimmed.length > 2000) {
        return { valid: false, message: '提示词长度不能超过 2000 个字符' };
    }
    
    return { valid: true };
}

module.exports = {
    validateRegister,
    validateLogin,
    validateUsername,
    validatePassword,
    validatePrompt
};


