# DailyHub 部署指南

## 配置文件说明

首次部署前，需要复制并修改配置文件：

```bash
# 复制后端配置
cp config.json.example config.json

# 复制前端配置
cp dailyhub-app/js/config.js.example dailyhub-app/js/config.js
```

然后根据需要修改配置文件中的各项参数。

```json
{
  "api": {
    "host": "0.0.0.0",              // 监听地址，0.0.0.0 表示接受所有网卡
    "port": 3001,                    // API 服务端口
    "jwt_secret_key": "xxx",         // JWT 密钥，生产环境请修改为随机字符串
    "jwt_token_expires_days": 30,    // Token 有效期（天）
    "debug": false,                  // 调试模式
    "cors_origins": ["*"]           // CORS 允许的来源，* 表示允许所有
  },

  "app": {
    "api_base_url": "http://xxx:3001/api",  // 前端调用的 API 地址
    "db_version": 5,                 // 数据库版本号
    "web_port": 3000                 // 前端服务端口
  },

  "paths": {
    "api_dir": "/path/to/dailyhub-api",  // 后端代码目录
    "web_dir": "/path/to/dailyhub-app"   // 前端代码目录
  }
}
```

### 配置项说明

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `api.port` | API 服务端口 | 3001 |
| `app.web_port` | 前端服务端口 | 3000 |
| `app.api_base_url` | 前端调用的 API 地址，需包含端口 | http://localhost:3001/api |
| `paths.api_dir` | 后端代码目录，用于启动脚本定位 | - |
| `paths.web_dir` | 前端代码目录，用于启动脚本定位 | - |

> 注意：JSON 格式不支持注释，请直接修改对应字段值。

---

## 目录结构

```
DailyHub/
├── config.json.example     # 后端配置示例（复制为 config.json）
├── DEPLOYMENT.md           # 本文件
├── start-api.sh            # 后端启动脚本
├── start-web.sh            # 前端启动脚本
├── start-all.sh            # 一键启动所有服务
├── stop-all.sh             # 停止所有服务
├── dailyhub-api/            # 后端 API
│   ├── api.py
│   ├── config.py
│   ├── models.py
│   ├── requirements.txt
│   └── dailyhub.db
└── dailyhub-app/            # 前端应用
    ├── index.html
    ├── js/
    │   ├── config.js.example # 前端配置示例（复制为 config.js）
    │   ├── storage.js
    │   └── ...
    └── css/
```

---

## 部署方式一：本地部署 (localhost)

### 1. 启动服务

```bash
# 方式一：使用启动脚本
./start-all.sh

# 方式二：手动启动
cd dailyhub-api
pip install -r requirements.txt
python api.py

cd dailyhub-app
python -m http.server 8080
```

### 3. 访问

打开浏览器访问：`http://localhost:3000`

### 4. 创建管理员账号

首次使用需要创建一个管理员账号，用于登录和管理系统。

```bash
# 1. 进入后端目录
cd dailyhub-api

# 2. 激活虚拟环境（Windows 用户去掉 source，直接运行 venv\Scripts\activate）
source venv/bin/activate

# 3. 运行创建管理员命令（将 your-password 改为您想要的密码）
python -c "
from werkzeug.security import generate_password_hash
from models import User, Database

Database.init_db()
User.create('admin', generate_password_hash('your-password'))
print('Admin user created!')
"
```

**命令说明：**
- `generate_password_hash('your-password')` - 将密码加密存储
- `Database.init_db()` - 初始化数据库（如果不存在则创建）
- `User.create('admin', ...)` - 创建名为 admin 的用户

**常见问题：**
- 如果报错 `ModuleNotFoundError`，请确保已运行 `pip install -r requirements.txt`
- 如果数据库已存在，`Database.init_db()` 不会覆盖现有数据

### 5. 创建邀请码

```bash
sqlite3 dailyhub-api/dailyhub.db "INSERT INTO invitation_codes (code, max_uses, expires_at) VALUES ('your-code', 100, datetime('now', '+30 days'));"
```

---

## 部署方式二：服务器部署

### 1. 配置文件

需要修改以下配置：

#### config.json
修改 `config.json` 中的 `app.api_base_url` 为您的服务器地址：

```json
{
  "app": {
    "api_base_url": "http://您的服务器IP:3001/api"
  }
}
```

#### dailyhub-app/js/config.js
修改 `dailyhub-app/js/config.js`：

```javascript
window.DAILYHUB_CONFIG = {
    API_BASE_URL: 'http://您的服务器IP:3001/api'
};
```

> 详细配置说明请参考「配置文件说明」部分。

### 2. 启动服务

```bash
# 方式一：使用启动脚本
./start-all.sh

# 方式二：手动启动
cd dailyhub-api
source venv/bin/activate
gunicorn -w 4 -b 0.0.0.0:3001 api:app &

cd dailyhub-app
python3 -m http.server 3000
```

### 3. 访问

打开浏览器访问：`http://您的服务器IP:3000`

### 4. 创建管理员账号

与本地部署相同，请参考「部署方式一：本地部署」中的「创建管理员账号」步骤。

### 5. 创建邀请码

与本地部署相同，请参考「部署方式一：本地部署」中的「创建邀请码」步骤。

---

## 生产环境建议

1. **修改 JWT 密钥**：在 `config.json` 中设置强随机字符串
2. **配置 CORS**：将 `cors_origins` 改为具体的域名
3. **使用 HTTPS**：配置 Nginx + SSL 证书
4. **防火墙**：确保端口 3000 和 3001 开放

---

## 代码更新指南

更新代码后，需要重启服务才能生效：

```bash
# 1. 停止服务
./stop-all.sh

# 2. 拉取最新代码（如使用 git）
git pull

# 3. 重启服务
./start-all.sh
```

**注意**：API 服务器默认在后台运行，更新代码后必须重启，否则新端点不会生效。
