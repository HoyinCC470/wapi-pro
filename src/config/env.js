/**
 * 环境变量统一管理工具
 * 提供环境变量验证、默认值设置和配置管理
 */
const logger = require('../utils/logger');

// 必需的环境变量配置
const requiredEnvVars = {
    MONGODB_URI: {
        description: 'MongoDB数据库连接字符串',
        validator: (value) => {
            if (!value || typeof value !== 'string') return false;
            // 基本的MongoDB URI格式验证
            return value.startsWith('mongodb://') || value.startsWith('mongodb+srv://');
        }
    },
    JWT_SECRET: {
        description: 'JWT令牌签名密钥',
        validator: (value) => {
            if (!value || typeof value !== 'string') return false;
            // JWT Secret至少32个字符且不能是默认值
            return value.length >= 32 && value !== 'fallback_secret';
        }
    },
    AI_SERVICE_API_KEY: {
        description: 'AI服务API密钥',
        validator: (value) => value && typeof value === 'string' && value.length > 0
    },
    AI_UPSTREAM_URL: {
        description: 'AI服务上游URL',
        validator: (value) => {
            if (!value || typeof value !== 'string') return false;
            try {
                new URL(value);
                return true;
            } catch {
                return false;
            }
        }
    }
};

// 可选的环境变量配置（包含默认值）
const optionalEnvVars = {
    PORT: {
        description: '服务器监听端口',
        default: '3000',
        validator: (value) => {
            const port = parseInt(value);
            return !isNaN(port) && port > 0 && port <= 65535;
        }
    },
    NODE_ENV: {
        description: '运行环境',
        default: 'development',
        validator: (value) => ['development', 'production', 'test'].includes(value)
    },
    CORS_ORIGIN: {
        description: 'CORS允许的源',
        default: '*',
        validator: (value) => typeof value === 'string'
    },
    RATE_LIMIT_MAX: {
        description: '速率限制最大请求数',
        default: '100',
        validator: (value) => {
            const max = parseInt(value);
            return !isNaN(max) && max > 0;
        }
    },
    DEFAULT_REGISTRATION_CODE: {
        description: '默认注册码',
        default: '',
        validator: (value) => typeof value === 'string'
    },
    MONGODB_POOL_SIZE: {
        description: 'MongoDB连接池大小',
        default: '50',
        validator: (value) => {
            const size = parseInt(value);
            return !isNaN(size) && size > 0 && size <= 100;
        }
    },
    MONGODB_TIMEOUT: {
        description: 'MongoDB连接超时时间(毫秒)',
        default: '5000',
        validator: (value) => {
            const timeout = parseInt(value);
            return !isNaN(timeout) && timeout > 0;
        }
    }
};

/**
 * 验证所有必需的环境变量
 * @throws {Error} 当缺少必需变量或验证失败时
 */
function validateRequiredEnv() {
    const missing = [];
    const invalid = [];

    Object.entries(requiredEnvVars).forEach(([key, config]) => {
        const value = process.env[key];
        
        if (!value) {
            missing.push({ key, description: config.description });
        } else if (config.validator && !config.validator(value)) {
            invalid.push({ key, description: config.description, value });
        }
    });

    if (missing.length > 0 || invalid.length > 0) {
        if (missing.length > 0) {
            missing.forEach(({ key, description }) => {
                logger.error(`缺少必需的环境变量: ${key}`, { description });
            });
        }
        
        if (invalid.length > 0) {
            invalid.forEach(({ key, description, value }) => {
                logger.error(`环境变量验证失败: ${key}`, { description, value });
            });
        }
        
        throw new Error('环境变量配置错误，请查看日志详情');
    }
}

/**
 * 验证可选环境变量并设置默认值
 */
function validateOptionalEnv() {
    const warnings = [];

    Object.entries(optionalEnvVars).forEach(([key, config]) => {
        const value = process.env[key];
        
        if (value !== undefined && config.validator && !config.validator(value)) {
            warnings.push({ key, description: config.description, value, default: config.default });
            // 使用默认值替代无效值
            process.env[key] = config.default;
        } else if (value === undefined && config.default !== undefined) {
            // 设置默认值
            process.env[key] = config.default;
        }
    });

    if (warnings.length > 0 && process.env.NODE_ENV !== 'test') {
        warnings.forEach(({ key, description, value, default: defaultValue }) => {
            logger.warn(`环境变量 "${value}" 无效，使用默认值`, { key, description, defaultValue });
        });
    }
}

/**
 * 获取环境变量配置
 * @param {string} key 环境变量名
 * @returns {string|undefined} 环境变量值
 */
function getEnv(key) {
    return process.env[key];
}

/**
 * 获取数字类型的环境变量
 * @param {string} key 环境变量名
 * @param {number} defaultValue 默认值
 * @returns {number} 数字值
 */
function getEnvNumber(key, defaultValue = 0) {
    const value = process.env[key];
    const num = parseInt(value);
    return isNaN(num) ? defaultValue : num;
}

/**
 * 获取布尔类型的环境变量
 * @param {string} key 环境变量名
 * @param {boolean} defaultValue 默认值
 * @returns {boolean} 布尔值
 */
function getEnvBoolean(key, defaultValue = false) {
    const value = process.env[key];
    if (!value) return defaultValue;
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}

/**
 * 初始化环境变量配置
 * 在应用启动时调用
 */
function initEnv() {
    try {
        validateRequiredEnv();
        validateOptionalEnv();
        
        if (process.env.NODE_ENV !== 'test') {
            logger.success('环境变量验证通过');
            logger.info('运行环境', { env: getEnv('NODE_ENV', 'development') });
            logger.info('服务端口', { port: getEnv('PORT', '3000') });
            logger.info('数据库URI', { uri: maskSensitiveData(getEnv('MONGODB_URI', '')) });
        }
    } catch (error) {
        logger.error('环境变量初始化失败', error);
        process.exit(1);
    }
}

/**
 * 隐藏敏感信息
 * @param {string} sensitive 敏感字符串
 * @returns {string} 掩码后的字符串
 */
function maskSensitiveData(sensitive) {
    if (!sensitive || typeof sensitive !== 'string') return 'undefined';
    if (sensitive.length <= 8) return '*'.repeat(sensitive.length);
    return sensitive.substring(0, 8) + '*'.repeat(sensitive.length - 8);
}

/**
 * 获取所有配置信息（用于调试）
 * @returns {Object} 配置对象
 */
function getConfig() {
    return {
        required: Object.fromEntries(
            Object.keys(requiredEnvVars).map(key => [key, !!process.env[key]])
        ),
        optional: Object.fromEntries(
            Object.entries(optionalEnvVars).map(([key, config]) => [
                key,
                {
                    value: maskSensitiveData(process.env[key]),
                    default: config.default,
                    isDefault: process.env[key] === config.default
                }
            ])
        )
    };
}

module.exports = {
    validateRequiredEnv,
    validateOptionalEnv,
    getEnv,
    getEnvNumber,
    getEnvBoolean,
    initEnv,
    getConfig,
    requiredEnvVars,
    optionalEnvVars
};