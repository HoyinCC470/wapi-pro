require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// 1. 引入路由文件 (把 aiRoutes 移到这里)
const authRoutes = require('./src/routes/auth');
const chatRoutes = require('./src/routes/chat');
const aiRoutes = require('./src/routes/ai'); // 👈 【移到顶部】
const RegistrationCode = require('./src/models/RegistrationCode'); // 引入注册码模型

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 请求日志
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// 初始化默认注册码
async function initDefaultRegistrationCode() {
    try {
        const defaultCode = 'WAPIAI408';
        const existingCode = await RegistrationCode.findOne({ code: defaultCode });
        
        if (!existingCode) {
            const newCode = new RegistrationCode({
                code: defaultCode,
                used: false,
                createdAt: new Date()
            });
            await newCode.save();
            console.log(`✅ 默认注册码已创建: ${defaultCode}`);
        } else {
            console.log(`ℹ️  默认注册码已存在: ${defaultCode}`);
        }
    } catch (err) {
        console.error('❌ 初始化默认注册码失败:', err);
    }
}

// 2. 注册路由 (把 aiRoutes 加在这里，务必在兜底路由之前！)
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ai', aiRoutes); // 👈 【移到这里】

// 状态检查
app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', time: new Date() });
});

// 3. 页面兜底 (这必须是最后一条 GET 路由)
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 数据库连接 - 等待连接成功后再启动服务器
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB 数据库连接成功');
    // 初始化默认注册码
    await initDefaultRegistrationCode();
    
    // 仅在 MongoDB 连接成功后启动服务器
    app.listen(PORT, () => {
        console.log(`🚀 服务已启动: http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB 连接失败:', err);
    process.exit(1); // 如果连接失败，退出进程
  });