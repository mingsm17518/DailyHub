# DailyHub API

Flask RESTful API 后端服务，为 DailyHub 提供数据存储和多设备同步功能。

## 项目概述

DailyHub API 是轻量级后端服务，使用 SQLite 存储数据，提供 RESTful API 接口，支持 JWT 身份验证和墓碑模式的删除同步机制。

## 核心特性

- **多用户支持** - 每个用户拥有独立的数据空间
- **JWT 身份验证** - 30 天有效期的令牌认证
- **邀请码注册** - 管理员创建邀请码，新用户需邀请码注册
- **权限管理** - 管理员和普通用户两种角色
- **日程事件管理** - CRUD 操作
- **待办事项管理** - 支持层级结构
- **习惯打卡管理** - 打卡记录
- **时间追踪管理** - 时间记录
- **云端同步** - 增量同步 + 墓碑机制

## 快速开始

### 环境要求

- Python 3.8+
- SQLite 3

### 安装步骤

```bash
cd dailyhub-api
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 配置

配置文件位于项目根目录 `config.json`：

```json
{
  "api": {
    "port": 3001,
    "jwt_secret_key": "change-this-to-random-string"
  }
}
```

### 启动服务

```bash
python api.py
# 或使用 gunicorn
gunicorn -w 4 -b 0.0.0.0:3001 api:app
```

### 验证安装

```bash
curl http://localhost:3001/api/health
```

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/register` | POST | 用户注册 |
| `/api/login` | POST | 用户登录 |
| `/api/events` | GET/POST | 事件管理 |
| `/api/todos` | GET/POST | 待办管理 |
| `/api/habits` | GET/POST | 习惯管理 |
| `/api/time-entries` | GET/POST | 时间记录 |
| `/api/notes` | GET/POST | 笔记管理 |
| `/api/invitation-codes` | GET/POST | 邀请码管理（管理员）|

详细 API 文档请参阅 [API.md](./doc/API.md)

## 数据库

SQLite 数据库，包含以下表：

- users - 用户信息
- invitation_codes - 邀请码
- events - 日程事件
- todos - 待办事项
- habits - 习惯
- habit_logs - 打卡记录
- time_entries - 时间记录
- notes - 笔记
- deleted_* - 墓碑表

详细数据库文档请参阅 [DATABASE.md](./doc/DATABASE.md)

## 项目结构

```
dailyhub-api/
├── api.py            # Flask 应用
├── config.py         # 配置加载
├── models.py         # 数据模型
├── requirements.txt  # Python 依赖
└── dailyhub.db       # SQLite 数据库
```

## 部署

详细部署说明请参阅 [DEPLOYMENT.md](../DEPLOYMENT.md)

## 安全建议

1. **修改 JWT 密钥** - 在 config.json 中设置随机字符串
2. **配置 CORS** - 改为具体域名
3. **使用 HTTPS**
4. **定期备份数据库**

## 许可证

MIT License
