const MIN_JWT_SECRET_LENGTH = 32;

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error('JWT_SECRET 环境变量未设置，请在 .env 文件中配置');
    }

    if (secret === 'fallback_secret' || secret.length < MIN_JWT_SECRET_LENGTH) {
        throw new Error('JWT_SECRET 必须设置且长度至少 32 个字符，不能使用默认值');
    }

    return secret;
}

function ensureJwtSecretOrExit(logger = console) {
    try {
        getJwtSecret();
    } catch (error) {
        if (logger && typeof logger.error === 'function') {
            logger.error(`❌ ${error.message}`);
        } else {
            console.error(`❌ ${error.message}`);
        }
        process.exit(1);
    }
}

module.exports = {
    getJwtSecret,
    ensureJwtSecretOrExit,
};
