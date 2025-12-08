function buildPayload({ success = true, message = '操作成功', data, meta }) {
    const payload = {
        success,
        message,
        timestamp: new Date().toISOString()
    };

    if (data !== undefined) {
        payload.data = data;
    }

    if (meta !== undefined && meta !== null) {
        payload.meta = meta;
    }

    return payload;
}

function sendSuccess(res, { message = '操作成功', data, meta, statusCode = 200 } = {}) {
    const payload = buildPayload({ success: true, message, data, meta });
    return res.status(statusCode).json(payload);
}

module.exports = {
    sendSuccess
};
