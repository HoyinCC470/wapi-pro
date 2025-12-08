/**
 * 简化的日志工具
 * 提供统一的日志格式和级别控制
 */

class Logger {
    constructor() {
        this.isProduction = process.env.NODE_ENV === 'production';
        this.isTest = process.env.NODE_ENV === 'test';
    }

    /**
     * 信息日志
     * @param {string} message 日志消息
     * @param {any} data 附加数据
     */
    info(message, data = null) {
        if (this.isTest) return;
        
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ℹ️  ${message}`;
        
        console.log(logMessage);
        if (data) {
            console.log('   数据:', JSON.stringify(data, null, 2));
        }
    }

    /**
     * 成功日志
     * @param {string} message 日志消息
     * @param {any} data 附加数据
     */
    success(message, data = null) {
        if (this.isTest) return;
        
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ✅ ${message}`;
        
        console.log(logMessage);
        if (data) {
            console.log('   数据:', JSON.stringify(data, null, 2));
        }
    }

    /**
     * 警告日志
     * @param {string} message 日志消息
     * @param {any} data 附加数据
     */
    warn(message, data = null) {
        if (this.isTest) return;
        
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ⚠️  ${message}`;
        
        console.warn(logMessage);
        if (data) {
            console.warn('   数据:', JSON.stringify(data, null, 2));
        }
    }

    /**
     * 错误日志
     * @param {string} message 日志消息
     * @param {Error|any} error 错误对象或数据
     */
    error(message, error = null) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ❌ ${message}`;
        
        console.error(logMessage);
        if (error) {
            if (error instanceof Error) {
                console.error('   错误:', error.message);
                if (!this.isProduction) {
                    console.error('   堆栈:', error.stack);
                }
            } else {
                console.error('   数据:', JSON.stringify(error, null, 2));
            }
        }
    }

    /**
     * 调试日志（仅在非生产环境输出）
     * @param {string} message 日志消息
     * @param {any} data 附加数据
     */
    debug(message, data = null) {
        if (this.isProduction || this.isTest) return;
        
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] 🔍 ${message}`;
        
        console.log(logMessage);
        if (data) {
            console.log('   数据:', JSON.stringify(data, null, 2));
        }
    }

    /**
     * 请求日志
     * @param {Object} req Express请求对象
     */
    request(req) {
        if (this.isTest) return;
        
        const timestamp = new Date().toISOString();
        const userAgent = req.get('User-Agent') || 'Unknown';
        const ip = req.ip || req.connection.remoteAddress || 'Unknown';
        
        console.log(`[${timestamp}] 📡 ${req.method} ${req.url}`);
        console.log(`   IP: ${ip} | User-Agent: ${userAgent}`);
    }

    /**
     * 性能日志
     * @param {string} operation 操作名称
     * @param {number} duration 耗时（毫秒）
     */
    performance(operation, duration) {
        if (this.isTest) return;
        
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ⏱️  ${operation}: ${duration}ms`;
        
        if (duration > 5000) {
            console.warn(logMessage + ' (慢操作)');
        } else {
            console.log(logMessage);
        }
    }
}

// 创建单例实例
const logger = new Logger();

module.exports = logger;