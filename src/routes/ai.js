const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Image = require('../models/Image');

router.use(authMiddleware);

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

// 辅助函数：处理 Z-Image-Turbo 的异步轮询
async function handleAsyncImageGeneration(taskId, apiKey, baseUrl) {
    const maxRetries = 60; 
    let attempts = 0;

    while (attempts < maxRetries) {
        await sleep(2000);
        attempts++;
        console.log(`正在轮询任务 ${taskId} (第 ${attempts} 次)...`);

        const checkUrl = `${baseUrl}/tasks/${taskId}`;

        const response = await fetch(checkUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'X-ModelScope-Task-Type': 'image_generation' 
            }
        });

        if (!response.ok) {
            throw new Error("异步任务查询失败: " + response.status);
        }

        const data = await response.json();
        const status = data.task_status;

        if (status === 'SUCCEED') {
            if (data.output_images && data.output_images.length > 0) return data.output_images[0];
            if (data.results && data.results.length > 0) return data.results[0].url;
            if (data.images && data.images.length > 0) return data.images[0].url;
            throw new Error("任务成功但未找到图片链接");
        } else if (status === 'FAILED') {
            throw new Error("图片生成任务失败: " + JSON.stringify(data));
        }
    }
    throw new Error("生成超时");
}

// 1. Chat 路由
router.post('/chat/completions', async (req, res) => {
    try {
        const apiKey = process.env.AI_SERVICE_API_KEY;
        const upstreamUrl = process.env.AI_UPSTREAM_URL;
        if (!apiKey || !upstreamUrl) return res.status(500).json({ message: '配置缺失' });

        const payload = req.body;
        const response = await fetch(`${upstreamUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).send(errorText);
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
        if (!res.headersSent) res.status(500).json({ message: '服务器内部错误' });
    }
});

// 2. 生图路由
router.post('/images/generations', async (req, res) => {
    try {
        const apiKey = process.env.AI_SERVICE_API_KEY;
        const upstreamUrl = process.env.AI_UPSTREAM_URL;
        
        let { prompt, model, size, style } = req.body;
        const userId = req.user.id || req.user.userId || req.user._id;

        if (!prompt) return res.status(400).json({ message: '提示词不能为空' });

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
            return res.status(response.status).send(errText);
        }

        const data = await response.json();
        let imageUrl = null;

        if (data.task_id) {
            console.log("收到异步任务 ID:", data.task_id, "开始轮询...");
            try {
                imageUrl = await handleAsyncImageGeneration(data.task_id, apiKey, upstreamUrl);
            } catch (pollErr) {
                console.error("轮询失败:", pollErr);
                return res.status(500).json({ message: '图片生成超时或失败' });
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
            return res.status(500).json({ message: '未获取到图片 URL (格式不匹配)' });
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

        res.json({ url: imageUrl });

    } catch (error) {
        console.error("❌ 生图服务异常:", error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// 3. 【新增】获取当前用户的生图历史 (GET /api/ai/images/history)
// 👇 确保这段代码在 module.exports 之前！
router.get('/images/history', async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId || req.user._id;
        
        // 查询数据库
        const images = await Image.find({ userId: userId })
            .sort({ createdAt: -1 })
            .limit(50);

        res.json(images);
    } catch (error) {
        console.error("获取图片历史失败:", error);
        res.status(500).json({ message: '获取失败' });
    }
});

// 👇 这一行必须在文件的最最最下面
module.exports = router;