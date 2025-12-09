const express = require('express');
const router = express.Router();
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');

const authMiddleware = require('../middleware/authMiddleware');
const Image = require('../models/Image');
const { validatePrompt } = require('../middleware/validator');
const { sendSuccess } = require('../utils/response');
const { AppError, ValidationError } = require('../utils/errors');

router.use(authMiddleware);

// === 常量配置 ===
const MAX_TEXT_LENGTH = 15000;
const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB

// 配置 multer (内存存储)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: FILE_SIZE_LIMIT },
    fileFilter: (req, file, cb) => {
        // 修复中文文件名编码问题
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
        
        const allowedMimes = [
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'application/pdf'
        ];
        const allowedExts = ['.doc', '.docx', '.txt', '.pdf'];
        
        const ext = path.extname(file.originalname).toLowerCase();
        console.log('文件检查:', { originalname: file.originalname, mimetype: file.mimetype, ext });
        
        if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new ValidationError(`仅支持 doc、docx、txt、pdf 文档，不支持的类型: ${file.mimetype} (${ext})`), false);
        }
    }
});

const ASYNC_POLLING_CONFIG = {
    MAX_RETRIES: 60,           // 最大重试次数
    INITIAL_POLL_INTERVAL: 1000, // 初始轮询间隔（毫秒）
    MAX_POLL_INTERVAL: 5000,   // 最大轮询间隔（毫秒）
    BACKOFF_MULTIPLIER: 1.2,    // 退避倍数
    TIMEOUT_MS: 120000,        // 总超时时间（毫秒）
    FAILURE_THRESHOLD: 3,     // 连续失败阈值
    NETWORK_TIMEOUT: 10000    // 网络请求超时时间
};

const IMAGE_HISTORY_LIMIT = 50; // 图片历史记录限制

// === 风格提示词字典 ===
const STYLE_PRESETS = {
    "none": "",
    "cinematic": ", cinematic lighting, movie grain, dramatic atmosphere, highly detailed, 8k, hyperrealistic",
    "cyberpunk": ", cyberpunk style, neon lights, synthwave, futuristic city, high contrast, sci-fi, detailed",
    "ink": ", traditional chinese ink painting, black and white, abstract, artistic, brush strokes, masterpiece",
    "3d": ", 3d render, blender, c4d, unreal engine, octane render, clay material, soft lighting"
};

// 辅助函数：休眠等待
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 辅助函数：处理 Z-Image-Turbo 的智能异步轮询
async function handleAsyncImageGeneration(taskId, apiKey, baseUrl) {
    const maxRetries = ASYNC_POLLING_CONFIG.MAX_RETRIES;
    const startTime = Date.now();
    let attempts = 0;
    let currentInterval = ASYNC_POLLING_CONFIG.INITIAL_POLL_INTERVAL;
    let consecutiveFailures = 0;

    console.log(`🔄 开始智能轮询任务 ${taskId}...`);

    while (attempts < maxRetries) {
        // 检查总超时时间
        if (Date.now() - startTime > ASYNC_POLLING_CONFIG.TIMEOUT_MS) {
            throw new Error("图片生成超时");
        }

        attempts++;
        console.log(`📡 轮询任务 ${taskId} (第 ${attempts} 次, 间隔: ${currentInterval}ms)...`);

        try {
            const checkUrl = `${baseUrl}/tasks/${taskId}`;
            
            // 设置网络请求超时
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), ASYNC_POLLING_CONFIG.NETWORK_TIMEOUT);

            const response = await fetch(checkUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'X-ModelScope-Task-Type': 'image_generation'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP错误 ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const status = data.task_status;

            // 重置连续失败计数器
            consecutiveFailures = 0;

            if (status === 'SUCCEED') {
                console.log(`✅ 任务 ${taskId} 完成，耗时: ${Date.now() - startTime}ms`);
                
                // 尝试从不同字段获取图片URL
                if (data.output_images && data.output_images.length > 0) {
                    return data.output_images[0];
                }
                if (data.results && data.results.length > 0) {
                    return data.results[0].url;
                }
                if (data.images && data.images.length > 0) {
                    return data.images[0].url;
                }
                
                throw new Error("任务成功但未找到图片链接");
            } else if (status === 'FAILED') {
                console.error(`❌ 任务 ${taskId} 失败:`, data);
                throw new Error(`图片生成任务失败: ${data.message || '未知错误'}`);
            } else if (status === 'RUNNING' || status === 'PENDING') {
                // 任务仍在运行，继续轮询
                console.log(`⏳ 任务状态: ${status}`);
            } else {
                console.log(`🔄 未知状态: ${status}，继续轮询`);
            }

        } catch (error) {
            consecutiveFailures++;
            
            if (error.name === 'AbortError') {
                console.warn(`⚠️  网络请求超时 (连续失败 ${consecutiveFailures} 次)`);
            } else {
                console.warn(`⚠️  轮询错误 (连续失败 ${consecutiveFailures} 次):`, error.message);
            }

            // 连续失败次数达到阈值时，增加轮询间隔
            if (consecutiveFailures >= ASYNC_POLLING_CONFIG.FAILURE_THRESHOLD) {
                currentInterval = Math.min(
                    currentInterval * ASYNC_POLLING_CONFIG.BACKOFF_MULTIPLIER * 2,
                    ASYNC_POLLING_CONFIG.MAX_POLL_INTERVAL
                );
                console.log(`🔧 连续失败 ${consecutiveFailures} 次，调整轮询间隔至 ${currentInterval}ms`);
            }
        }

        // 使用指数退避算法调整轮询间隔
        if (consecutiveFailures === 0) {
            // 没有失败时，正常指数退避
            currentInterval = Math.min(
                currentInterval * ASYNC_POLLING_CONFIG.BACKOFF_MULTIPLIER,
                ASYNC_POLLING_CONFIG.MAX_POLL_INTERVAL
            );
        }

        // 等待下一次轮询
        await sleep(currentInterval);
    }

    throw new Error(`图片生成失败: 达到最大重试次数 ${maxRetries}`);
}

// 1. Chat 路由
router.post('/chat/completions', async (req, res, next) => {
    try {
        const apiKey = process.env.AI_SERVICE_API_KEY;
        const upstreamUrl = process.env.AI_UPSTREAM_URL;
        if (!apiKey || !upstreamUrl) {
            return next(new AppError('配置缺失', 500));
        }

        const payload = req.body;
        const response = await fetch(`${upstreamUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            return next(new AppError(errorText || 'AI 服务请求失败', response.status));
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        if (response.body.pipe) response.body.pipe(res);
        else if (response.body.getReader) {
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
            }
            res.end();
        } else {
            for await (const chunk of response.body) res.write(chunk);
            res.end();
        }
    } catch (error) {
        console.error("AI Proxy Error:", error);
        if (!res.headersSent) {
            return next(error instanceof AppError ? error : new AppError('服务器内部错误', 500));
        }
    }
});

// 2. 生图路由
router.post('/images/generations', async (req, res, next) => {
    try {
        const apiKey = process.env.AI_SERVICE_API_KEY;
        const upstreamUrl = process.env.AI_UPSTREAM_URL;
        
        if (!apiKey || !upstreamUrl) {
            return next(new AppError('AI 服务配置缺失', 500));
        }
        
        let { prompt, model, size, style } = req.body;
        const userId = req.user.id || req.user.userId || req.user._id;

        // 验证提示词
        const promptCheck = validatePrompt(prompt);
        if (!promptCheck.valid) {
            return next(new ValidationError(promptCheck.message));
        }

        // 应用风格
        if (style && STYLE_PRESETS[style]) {
            console.log(`🎨 应用风格: ${style}`);
            prompt = prompt + STYLE_PRESETS[style];
        }

        const isAsyncModel = model === 'Tongyi-MAI/Z-Image-Turbo';
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };
        if (isAsyncModel) headers['X-ModelScope-Async-Mode'] = 'true';

        console.log(`正在请求生图 (模型: ${model})...`);

        const response = await fetch(`${upstreamUrl}/images/generations`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: model || "Kwai-Kolors/Kolors",
                prompt: prompt,
                size: size || "1024x1024",
                n: 1
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("❌ 生图请求报错:", errText);
            return next(new AppError(errText || '生图请求失败', response.status));
        }

        const data = await response.json();
        let imageUrl = null;

        if (data.task_id) {
            console.log("收到异步任务 ID:", data.task_id, "开始轮询...");
            try {
                imageUrl = await handleAsyncImageGeneration(data.task_id, apiKey, upstreamUrl);
            } catch (pollErr) {
                console.error("轮询失败:", pollErr);
                return next(new AppError('图片生成超时或失败', 500));
            }
        } else if (data.data && data.data[0] && data.data[0].url) {
            imageUrl = data.data[0].url;
        } else if (data.output_images && data.output_images.length > 0) {
            imageUrl = data.output_images[0];
        } else if (data.images && data.images[0] && data.images[0].url) {
            imageUrl = data.images[0].url;
        }

        if (!imageUrl) {
            console.error("未识别的响应格式:", JSON.stringify(data));
            return next(new AppError('未获取到图片 URL (格式不匹配)', 500));
        }

        // 存入数据库
        if (userId) {
            const newImage = new Image({
                userId: userId,
                prompt: req.body.prompt, 
                model: model,
                resolution: size,
                style: style,
                imageUrl: imageUrl
            });
            await newImage.save();
            console.log("✅ 图片记录已保存:", newImage._id);
        }

        return sendSuccess(res, { message: '生成成功', data: { url: imageUrl } });

    } catch (error) {
        console.error("❌ 生图服务异常:", error);
        next(error instanceof AppError ? error : new AppError('服务器内部错误', 500));
    }
});

// 3. 【新增】获取当前用户的生图历史 (GET /api/ai/images/history)
// 👇 确保这段代码在 module.exports 之前！
router.get('/images/history', async (req, res, next) => {
    try {
        const userId = req.user.id || req.user.userId || req.user._id;
        
        // 查询数据库
        const images = await Image.find({ userId: userId })
            .sort({ createdAt: -1 })
            .limit(IMAGE_HISTORY_LIMIT);

        return sendSuccess(res, { message: '获取成功', data: images });
    } catch (error) {
        console.error("获取图片历史失败:", error);
        next(error instanceof AppError ? error : new AppError('获取失败', 500));
    }
});

// 文档解析工具函数
async function parseDocument(file) {
    const ext = path.extname(file.originalname).toLowerCase();
    let text = '';

    try {
        switch (ext) {
            case '.txt':
                text = file.buffer.toString('utf-8');
                break;
            case '.docx':
                const docxResult = await mammoth.extractRawText({ buffer: file.buffer });
                text = docxResult.value;
                break;
            case '.pdf':
                const pdfData = await pdfParse(file.buffer);
                text = pdfData.text;
                break;
            default:
                throw new Error('不支持的文件类型');
        }

        // 清理和截断
        text = text.replace(/\s+/g, ' ').trim();
        if (text.length > MAX_TEXT_LENGTH) {
            text = text.substring(0, MAX_TEXT_LENGTH) + '\n\n[内容已截断，仅展示前 15000 字符]';
        }

        return text;
    } catch (error) {
        console.error('文档解析失败:', error);
        throw new AppError(`文档解析失败: ${error.message}`, 400);
    }
}

// 4. 文档上传解析路由（不调用LLM）
router.post('/document/parse', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return next(new ValidationError('请上传文件'));
        }
        
        // 解析文档
        const documentText = await parseDocument(req.file);
        
        // 将解析内容存储到session中
        if (!req.session) {
            req.session = {};
        }
        req.session.documentContent = {
            fileName: req.file.originalname,
            content: documentText,
            truncated: documentText.length >= MAX_TEXT_LENGTH,
            timestamp: Date.now()
        };
        
        console.log(`📄 文档解析成功，长度: ${documentText.length}，已缓存到session`);

        return sendSuccess(res, {
            message: '文档解析完成',
            data: {
                originalFileName: req.file.originalname,
                documentLength: documentText.length,
                truncated: documentText.length >= MAX_TEXT_LENGTH
            }
        });

    } catch (error) {
        console.error('文档解析失败:', error);
        next(error instanceof AppError ? error : new AppError('文档解析失败', 500));
    }
});

// 5. 带文档内容的对话完成路由
router.post('/chat/with-document', async (req, res, next) => {
    try {
        const { prompt } = req.body;
        
        if (!req.session || !req.session.documentContent) {
            return next(new ValidationError('请先上传文档'));
        }
        
        const doc = req.session.documentContent;
        
        // 检查session是否过期（30分钟）
        if (Date.now() - doc.timestamp > 30 * 60 * 1000) {
            delete req.session.documentContent;
            return next(new ValidationError('文档已过期，请重新上传'));
        }
        
        // 构建给 LLM 的完整 prompt
        const fullPrompt = `用户上传了一份文档"${doc.fileName}"并提出了问题：${prompt}

请基于以下文档内容回答用户的问题：

文档内容：
${doc.content}

要求：
1. 请直接回答用户的问题
2. 基于文档内容给出准确回答
3. 如果文档内容无法回答该问题，请明确说明`;

        // 调用 LLM 服务
        const apiKey = process.env.AI_SERVICE_API_KEY;
        const upstreamUrl = process.env.AI_UPSTREAM_URL;
        
        if (!apiKey || !upstreamUrl) {
            return next(new AppError('AI 服务配置缺失', 500));
        }

        const llmResponse = await fetch(`${upstreamUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-ai/DeepSeek-V3.2',
                messages: [
                    {
                        role: 'user',
                        content: fullPrompt
                    }
                ],
                stream: false,
                max_tokens: 2000
            })
        });

        if (!llmResponse.ok) {
            const errText = await llmResponse.text();
            return next(new AppError(`LLM 请求失败: ${errText}`, 500));
        }

        const llmData = await llmResponse.json();
        const analysis = llmData.choices?.[0]?.message?.content || '分析失败';

        // 清除已使用的文档内容
        delete req.session.documentContent;

        return sendSuccess(res, {
            message: '文档分析完成',
            data: {
                analysis: analysis,
                documentFileName: doc.fileName
            }
        });

    } catch (error) {
        console.error('文档分析失败:', error);
        next(error instanceof AppError ? error : new AppError('文档分析失败', 500));
    }
});

// 👇 这一行必须在文件的最最最下面
module.exports = router;