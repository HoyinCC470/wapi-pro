# 环境变量配置说明

## 必需的环境变量

以下环境变量必须在 `.env` 文件中配置，否则服务器将无法启动：

### 1. MONGODB_URI
MongoDB 数据库连接字符串
```
MONGODB_URI=mongodb://localhost:27017/wapi-pro
```

### 2. JWT_SECRET
JWT 密钥，用于用户认证。**必须设置且长度至少 32 个字符**

生成方式：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

配置示例：
```
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
```

### 3. AI_SERVICE_API_KEY
AI 服务的 API 密钥
```
AI_SERVICE_API_KEY=your-ai-service-api-key
```

### 4. AI_UPSTREAM_URL
AI 服务的上游 URL
```
AI_UPSTREAM_URL=https://your-ai-service-url.com
```

## 可选的环境变量

### PORT
服务器端口（默认: 3000）
```
PORT=3000
```

### NODE_ENV
运行环境（development/production）
```
NODE_ENV=development
```

### CORS_ORIGIN
允许的 CORS 源（生产环境应配置具体域名）
- 留空：允许所有源（仅开发环境推荐）
- 多个域名用逗号分隔
```
CORS_ORIGIN=https://example.com,https://www.example.com
```

### RATE_LIMIT_MAX
速率限制：每个 IP 在 15 分钟内的最大请求数（默认: 100）
```
RATE_LIMIT_MAX=100
```

### MONGODB_POOL_SIZE
MongoDB 连接池大小（默认: 10）
```
MONGODB_POOL_SIZE=10
```

### DEFAULT_REGISTRATION_CODE
默认注册码（可选，如果设置则会在启动时自动创建）
```
DEFAULT_REGISTRATION_CODE=WAPIAI408
```

### ADMIN_USER_IDS
管理员用户 ID 列表（多个用逗号分隔）
```
ADMIN_USER_IDS=507f1f77bcf86cd799439011,507f191e810c19729de860ea
```

## 配置示例

创建 `.env` 文件：

```env
# 必需配置
MONGODB_URI=mongodb://localhost:27017/wapi-pro
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
AI_SERVICE_API_KEY=your-ai-service-api-key
AI_UPSTREAM_URL=https://your-ai-service-url.com

# 可选配置
PORT=3000
NODE_ENV=development
CORS_ORIGIN=
RATE_LIMIT_MAX=100
MONGODB_POOL_SIZE=10
DEFAULT_REGISTRATION_CODE=WAPIAI408
ADMIN_USER_IDS=
```

## 安全建议

1. **JWT_SECRET**: 必须使用强随机字符串，长度至少 32 个字符
2. **生产环境**: 设置 `NODE_ENV=production` 并配置 `CORS_ORIGIN`
3. **管理员配置**: 生产环境必须配置 `ADMIN_USER_IDS`
4. **不要提交**: `.env` 文件应添加到 `.gitignore`，不要提交到版本控制


