require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { initEnv, getEnv, getEnvNumber } = require('./src/config/env');
const { sendSuccess } = require('./src/utils/response');
const logger = require('./src/utils/logger');

// 1. 环境变量初始化（必须在其他代码之前执行）
initEnv();

// 2. 引入路由文件
const authRoutes = require('./src/routes/auth');
const chatRoutes = require('./src/routes/chat');
const aiRoutes = require('./src/routes/ai');
const RegistrationCode = require('./src/models/RegistrationCode');
const User = require('./src/models/User');
const errorHandler = require('./src/middleware/errorHandler');

const defaultAdminUsername = (() => {
    const value = getEnv('DEFAULT_ADMIN_USERNAME');
    if (value && value.trim()) {
        return value.trim();
    }
    return 'Hoyin';
})();
const defaultAdminPassword = getEnv('DEFAULT_ADMIN_PASSWORD') || 'Hoyin441';
const adminUsernamesConfig = getEnv('ADMIN_USERNAMES');
const adminUsernameSet = new Set(
    adminUsernamesConfig
        ? adminUsernamesConfig.split(',').map(name => name.trim().toLowerCase()).filter(Boolean)
        : []
);
if (defaultAdminUsername) {
    adminUsernameSet.add(defaultAdminUsername.toLowerCase());
}

function isAdminUsername(username) {
    if (!username || typeof username !== 'string') {
        return false;
    }
    return adminUsernameSet.has(username.trim().toLowerCase());
}

function shouldBypassAuthRateLimit(req) {
    if (!req || req.method !== 'POST') {
        return false;
    }
    const url = req.originalUrl || '';
    if (!url.startsWith('/api/auth/login')) {
        return false;
    }
    const { username } = req.body || {};
    return isAdminUsername(username);
}

const app = express();
const PORT = getEnvNumber('PORT', 3000);

// 3. 中间件配置

// CORS 配置（允许配置允许的源）
const corsOrigin = getEnv('CORS_ORIGIN');
const corsOptions = {
    origin: corsOrigin 
        ? corsOrigin.split(',').map(origin => origin.trim())
        : true, // 开发环境允许所有源，生产环境应该配置具体域名
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// 速率限制配置
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分钟
    max: getEnvNumber('RATE_LIMIT_MAX', 100), // 限制每个 IP 15 分钟内最多 100 个请求
    message: { message: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
});

// 认证相关接口使用更严格的限制
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // 15 分钟内最多 5 次登录/注册尝试
    message: { message: '登录尝试过于频繁，请 15 分钟后再试' },
    skipSuccessfulRequests: true,
    skip: shouldBypassAuthRateLimit,
});

app.use(express.json({ limit: '10mb' })); // 限制请求体大小
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // 支持 form-data

// Session 配置（用于文档内容缓存）
const session = require('express-session');
app.use(session({
    secret: process.env.JWT_SECRET || 'wapi-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 60 * 1000 // 30分钟
    }
}));
app.use(express.static(path.join(__dirname, 'public')));

// 应用速率限制（认证接口使用更严格的限制）
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/', limiter);

// 请求日志
app.use((req, res, next) => {
    logger.request(req);
    next();
});

// 初始化默认注册码（从环境变量读取，如果没有则跳过）
async function initDefaultRegistrationCode() {
    try {
        const defaultCode = process.env.DEFAULT_REGISTRATION_CODE;
        
        // 如果没有配置默认注册码，跳过初始化
        if (!defaultCode) {
            logger.info('未配置 DEFAULT_REGISTRATION_CODE，跳过默认注册码初始化');
            return;
        }

        const normalizedCode = defaultCode.trim().toUpperCase();
        const existingCode = await RegistrationCode.findOne({ code: normalizedCode });
        
        if (!existingCode) {
            const newCode = new RegistrationCode({
                code: normalizedCode,
                used: false,
                isReusable: true,
                usageCount: 0,
                createdAt: new Date(),
                createdBy: 'system'
            });
            await newCode.save();
            logger.success(`默认注册码已创建: ${normalizedCode}`);
        } else {
            if (!existingCode.isReusable || existingCode.used) {
                existingCode.isReusable = true;
                existingCode.used = false;
                existingCode.usedBy = null;
                existingCode.usedAt = null;
                await existingCode.save();
                logger.success(`默认注册码已更新为可复用: ${normalizedCode}`);
            } else {
                logger.info(`默认注册码已存在且可复用: ${normalizedCode}`);
            }
        }
    } catch (err) {
        console.error('❌ 初始化默认注册码失败:', err);
    }
}

async function initDefaultAdminAccount() {
    try {
        if (!defaultAdminUsername || !defaultAdminPassword) {
            logger.info('未配置默认管理员凭据，跳过默认管理员初始化');
            return;
        }

        let adminUser = await User.findOne({ username: defaultAdminUsername });
        if (!adminUser) {
            const salt = await bcrypt.genSalt(12);
            const hashedPassword = await bcrypt.hash(defaultAdminPassword, salt);
            adminUser = new User({
                username: defaultAdminUsername,
                password: hashedPassword,
                isAdmin: true
            });
            await adminUser.save();
            logger.success(`默认管理员账户已创建: ${defaultAdminUsername}`);
        } else {
            let updated = false;
            if (!adminUser.isAdmin) {
                adminUser.isAdmin = true;
                updated = true;
            }
            if (updated) {
                await adminUser.save();
                logger.info(`默认管理员账户已同步: ${defaultAdminUsername}`);
            } else {
                logger.info(`默认管理员账户已存在: ${defaultAdminUsername}`);
            }
        }
    } catch (error) {
        logger.error('❌ 初始化默认管理员账户失败', error);
    }
}

// 4. 注册路由
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ai', aiRoutes);

// 状态检查
app.get('/api/status', (req, res) => {
    return sendSuccess(res, {
        message: '服务正常',
        data: {
            status: 'ok',
            time: new Date(),
            environment: process.env.NODE_ENV || 'development'
        }
    });
});

// 5. 页面兜底 (这必须是最后一条 GET 路由)
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 6. 统一错误处理中间件（必须放在所有路由之后）
app.use(errorHandler);

// 7. 数据库连接配置
const mongooseOptions = {
    maxPoolSize: getEnvNumber('MONGODB_POOL_SIZE', 50), // 连接池大小
    serverSelectionTimeoutMS: getEnvNumber('MONGODB_TIMEOUT', 30000), // 服务器选择超时（默认 30 秒，Atlas 可能需要更长时间）
    socketTimeoutMS: 45000, // Socket 超时
    connectTimeoutMS: 30000, // 连接超时（增加到 30 秒）
    retryWrites: true, // 启用重试写入
    w: 'majority', // 写入确认
};

// 等待连接成功后再启动服务器
logger.info('正在连接 MongoDB...');
mongoose.connect(getEnv('MONGODB_URI'), mongooseOptions)
  .then(async () => {
    logger.success('MongoDB 数据库连接成功');
    
    // 监听连接事件
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB 连接错误', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB 连接断开');
    });
    
    // 初始化默认注册码
    await initDefaultRegistrationCode();
    // 初始化默认管理员
    await initDefaultAdminAccount();
    
    // 仅在 MongoDB 连接成功后启动服务器
    app.listen(PORT, () => {
      logger.success(`服务已启动: http://localhost:${PORT}`, { port: PORT, env: getEnv('NODE_ENV', 'development') });
    });
  })
  .catch(err => {
    console.error('❌ MongoDB 连接失败');
    console.error('错误详情:', err.message);
    
    // DNS 查询超时错误（常见于 mongodb+srv://）
    if (err.message && err.message.includes('ETIMEOUT') || err.message.includes('queryTxt')) {
        console.error('\n🔍 检测到 DNS 查询超时错误');
        console.error('这通常是因为网络无法解析 MongoDB Atlas 的 SRV 记录');
        console.error('\n💡 解决方案:');
        console.error('1. 【推荐】使用标准连接字符串替代 mongodb+srv://');
        console.error('   在 MongoDB Atlas 控制台:');
        console.error('   - 点击 "Connect" -> "Connect your application"');
        console.error('   - 选择 "Driver: Node.js" 和 "Version: 5.5 or later"');
        console.error('   - 复制连接字符串，将 mongodb+srv:// 改为 mongodb://');
        console.error('   - 格式: mongodb://username:password@host1:port1,host2:port2/database');
        console.error('\n2. 检查网络连接:');
        console.error('   - 尝试访问: https://cloud.mongodb.com');
        console.error('   - 检查防火墙是否阻止 MongoDB 连接');
        console.error('   - 如果在公司/学校网络，可能需要配置代理');
        console.error('\n3. 尝试使用本地 MongoDB（开发环境）:');
        console.error('   MONGODB_URI=mongodb://localhost:27017/wapi-pro');
        console.error('\n4. 增加 DNS 超时时间:');
        console.error('   在 .env 中添加: MONGODB_TIMEOUT=60000');
    }
    // 服务器选择错误
    else if (err.name === 'MongooseServerSelectionError') {
        console.error('\n💡 可能的解决方案:');
        console.error('1. 检查 MongoDB URI 是否正确');
        console.error('2. 如果使用 MongoDB Atlas，请检查:');
        console.error('   - IP 白名单是否包含当前 IP (0.0.0.0/0 允许所有)');
        console.error('   - 数据库用户密码是否正确');
        console.error('   - 网络连接是否正常');
        console.error('3. 尝试增加超时时间: 设置环境变量 MONGODB_TIMEOUT=60000');
    }
    // 其他错误
    else {
        console.error('\n💡 请检查:');
        console.error('1. MongoDB URI 格式是否正确');
        console.error('2. 网络连接是否正常');
        console.error('3. MongoDB 服务是否运行');
    }
    
    process.exit(1); // 如果连接失败，退出进程
  });

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('收到 SIGTERM 信号，正在关闭服务器...');
    mongoose.connection.close(() => {
        console.log('MongoDB 连接已关闭');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('收到 SIGINT 信号，正在关闭服务器...');
    mongoose.connection.close(() => {
        console.log('MongoDB 连接已关闭');
        process.exit(0);
    });
});