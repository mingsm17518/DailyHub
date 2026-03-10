# DailyHub

一个完整的日程管理和待办事项解决方案，支持多设备云端同步。

## 项目概述

DailyHub 是一个功能完整的日常管理系统，采用前后端分离架构：
- **前端**：原生 HTML/CSS/JavaScript PWA 应用
- **后端**：Flask + SQLite RESTful API

## 系统特性

- **日历视图**：月视图日历，支持日程的添加、编辑、删除
- **待办事项**：层级待办管理，支持拖拽排序、截止日期
- **时间追踪**：记录时间花费，支持统计分析
- **习惯打卡**：每日习惯追踪，热力图展示
- **每日笔记**：每日笔记记录
- **云端同步**：多设备数据同步，增量同步优化
- **邀请注册**：管理员创建邀请码，新用户需邀请码注册
- **PWA 支持**：可安装到桌面，支持离线使用

## 项目结构

```
DailyHub/
├── config.json              # 配置文件
├── DEPLOYMENT.md           # 部署指南
├── start-api.sh           # 后端启动脚本
├── start-web.sh           # 前端启动脚本
├── start-all.sh           # 一键启动所有服务
├── stop-all.sh            # 停止所有服务
├── dailyhub-api/          # 后端 API
│   ├── api.py            # Flask 应用
│   ├── config.py         # 配置加载
│   ├── models.py         # 数据模型
│   ├── requirements.txt  # Python 依赖
│   └── dailyhub.db      # SQLite 数据库
└── dailyhub-app/         # 前端应用
    ├── index.html       # 主页面
    ├── js/              # JavaScript
    │   ├── config.js   # 前端配置
    │   └── ...
    └── css/             # 样式文件
```

## 快速开始

### 环境要求

- Python 3.8+
- 现代浏览器

### 本地部署

1. **启动服务**
```bash
./start-all.sh
```

2. **访问**
打开浏览器访问：`http://localhost:3000`

3. **创建管理员**
参考 DEPLOYMENT.md 中的「创建管理员账号」步骤

### 服务器部署

1. 修改 `config.json` 中的配置：
   - `app.api_base_url` - 改为您的服务器地址
   - `paths.api_dir` - 后端目录路径
   - `paths.web_dir` - 前端目录路径

2. 修改 `dailyhub-app/js/config.js` 中的 API 地址

3. 启动服务
```bash
./start-all.sh
```

详细说明请参阅 [DEPLOYMENT.md](DEPLOYMENT.md)

## 功能说明

### 用户注册流程

1. 管理员创建邀请码
2. 新用户使用邀请码注册账号
3. 注册成功后自动登录

### 数据同步机制

- **增量同步**：基于时间戳的增量数据同步
- **冲突解决**：最后修改优先（Last Write Wins）
- **墓碑机制**：确保删除操作在所有设备间正确同步

## 文档

- [部署指南](DEPLOYMENT.md)
- [API 文档](dailyhub-api/doc/API.md)
- [数据库文档](dailyhub-api/doc/DATABASE.md)

## 安全建议

1. **修改 JWT 密钥**：在 `config.json` 中设置随机字符串
2. **配置 CORS**：将 `cors_origins` 改为具体域名
3. **使用 HTTPS**
4. **定期备份数据库**

## 许可证

MIT License
