# DailyHub 前端应用

一个功能强大的日程管理和待办事项 PWA 应用，支持多设备云端同步。

## 项目概述

DailyHub 前端采用原生 HTML/CSS/JavaScript 开发，无需依赖大型框架。支持 PWA 标准，可安装到桌面或移动设备，并支持离线使用。

## 主要特性

- **日历视图**：月视图日历，支持日程管理
- **待办事项**：层级待办管理，支持拖拽排序、截止日期
- **时间追踪**：记录时间花费，支持统计分析
- **习惯打卡**：每日习惯追踪，热力图展示
- **每日笔记**：每日笔记记录
- **云端同步**：多设备数据同步
- **邀请注册**：管理员创建邀请码，新用户需邀请码注册
- **PWA 支持**：可安装到桌面，离线可用
- **响应式设计**：适配桌面和移动设备

## 快速开始

### 本地开发

```bash
cd dailyhub-app
python -m http.server 3000
```

访问 `http://localhost:3000`

### 配置 API 地址

编辑 `js/config.js`：

```javascript
window.DAILYHUB_CONFIG = {
    API_BASE_URL: 'http://localhost:3001/api'
};
```

## 项目结构

```
dailyhub-app/
├── index.html       # 主页面
├── js/
│   ├── config.js   # 前端配置
│   ├── app.js     # 主应用逻辑
│   ├── storage.js # 数据存储
│   ├── calendar.js # 日历视图
│   ├── todolist.js # 待办事项
│   ├── habitTracker.js # 习惯打卡
│   ├── timeTracker.js # 时间追踪
│   └── ...
└── css/
    └── style.css  # 样式文件
```

## 数据存储

- **IndexedDB**：存储日程、待办、习惯等数据
- **LocalStorage**：存储用户认证信息和设置
- **云端 API**：可选的云同步功能

## 部署

前端是纯静态文件，可以部署到任何 Web 服务器：

```bash
# 使用 Python
python -m http.server 3000

# 或使用 Nginx
# 配置静态文件目录即可
```

详细部署说明请参阅 [DEPLOYMENT.md](../DEPLOYMENT.md)

## 许可证

MIT License
