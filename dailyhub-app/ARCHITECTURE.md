# 技术架构文档

本文档详细介绍日历日程管理应用的技术架构、模块组织和数据流。

## 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                          用户界面层                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  日历视图    │  │  待办面板    │  │  日程侧边栏  │         │
│  │ CalendarApp  │  │  TodoList    │  │   Sidebar    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
├─────────────────────────────────────────────────────────────────┤
│                          业务逻辑层                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  主应用控制  │  │  日历逻辑    │  │  待办逻辑    │         │
│  │    app.js    │  │ calendar.js  │  │ todolist.js  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
├─────────────────────────────────────────────────────────────────┤
│                          数据访问层                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  存储抽象    │  │  云同步      │  │  备份管理    │         │
│  │ CalendarDB   │  │  CloudSync   │  │ LocalBackup  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
├─────────────────────────────────────────────────────────────────┤
│                          存储层                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  IndexedDB   │  │ LocalStorage │  │  云端 API    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐                                               │
│  │ 文件系统 API │                                               │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
```

## 模块组织

### 核心模块

#### 1. 主应用模块 (app.js)

主应用模块负责初始化应用、绑定事件和协调各个子模块。

```javascript
// 主要类和函数
class CalendarApp { }           // 日历应用主类
function initApp()              // 应用初始化
function bindEvents()           // 事件绑定
function openModal()            // 模态框管理
function performSync()          // 云同步执行
```

**职责**：
- 应用初始化和生命周期管理
- 全局事件绑定
- 模态框管理
- 同步流程控制
- UI 状态更新

#### 2. 日历模块 (calendar.js)

负责日历视图的生成和交互。

```javascript
class CalendarApp {
    render()                   // 渲染日历
    renderGrid()              // 渲染日期网格
    renderDayCell()           // 渲染单个日期
    showEventsForDate()       // 显示指定日期的日程
    prevMonth() / nextMonth() // 月份切换
    goToday()                 // 返回今天
}
```

**职责**：
- 日历网格生成
- 日期单元格渲染
- 月份导航
- 日程展示
- 日期选择处理

#### 3. 存储模块 (storage.js)

提供统一的数据访问接口。

```javascript
class CalendarDB {            // 日程数据库
    init()                    // 初始化数据库
    addEvent()                // 添加日程
    updateEvent()             // 更新日程
    deleteEvent()             // 删除日程
    getEvent()                // 获取单个日程
    getEventsByDate()         // 获取指定日期的日程
    getAllEvents()            // 获取所有日程
    biDirectionalSync()       // 双向同步
}

class CloudSync {             // 云同步管理
    login() / register()      // 用户认证
    uploadEvent()             // 上传事件
    fetchAllEvents()          // 获取云端事件
    batchUpload()             // 批量上传
    processServerTombstones() // 处理服务器墓碑
}

class LocalBackup {           // 本地备份
    saveBackup()              // 保存备份
    getAllBackups()           // 获取所有备份
    restoreBackup()           // 恢复备份
    deleteBackup()            // 删除备份
}

class AccountManager {        // 账号管理
    addAccount()              // 添加账号
    removeAccount()           // 移除账号
    switchAccount()           // 切换账号
}
```

#### 4. 待办事项模块 (todolist.js)

管理待办事项的增删改查和 UI 交互。

```javascript
class TodoDB {                // 待办数据库
    addTodo()                 // 添加待办
    toggleTodo()              // 切换完成状态
    deleteTodo()              // 删除待办
    updateTodo()              // 更新待办
    getAllTodos()             // 获取所有待办
}

class TodoList {              // 待办列表 UI
    render()                  // 渲染列表
    buildTodoTree()           // 构建层级树
    editTodoInline()          // 行内编辑
    handleDragStart()         // 拖拽开始
    handleDrop()              // 拖拽放置
}
```

#### 5. 习惯打卡模块 (habitTracker.js)

管理习惯的增删改查、打卡和热力图展示。

```javascript
class HabitTracker {          // 习惯打卡管理
    loadData()                // 加载习惯数据
    checkin()                 // 打卡
    saveHabit()               // 保存习惯
    deleteHabit()             // 删除习惯
    renderHabitList()         // 渲染习惯列表
    renderHeatmap()           // 渲染热力图
    calculateStats()          // 计算统计数据
}
```

#### 6. 时间追踪模块 (timeTracker.js)

管理时间记录的增删改查和计时功能。

```javascript
class TimeTracker {           // 时间追踪管理
    loadData()                // 加载时间记录
    startTimeEntry()          // 开始计时
    stopTimeEntry()           // 停止计时
    saveTimeEntry()           // 保存时间记录
    deleteTimeEntry()         // 删除时间记录
    render()                  // 渲染时间列表
    calculateTotalDuration()  // 计算总时长
}
```

#### 7. 备份模块 (backup.js)

处理文件夹备份功能。

```javascript
class FolderBackup {
    selectFolder()            // 选择备份文件夹
    saveBackup()              // 保存备份到文件夹
    cleanOldBackups()         // 清理旧备份
    init()                    // 初始化
}
```

#### 6. 工具模块 (utils.js)

提供通用工具函数。

```javascript
function formatDate()          // 格式化日期
function parseDate()           // 解析日期
function generateId()          // 生成唯一ID
function showToast()           // 显示提示
function exportToFile()        // 导出文件
function readFile()            // 读取文件
```

## 数据流

### 用户操作流程

```
用户操作 → 事件监听器 → 业务逻辑 → 数据访问层 → 存储层
                ↓
            UI 更新 ← 业务逻辑 ← 数据返回
```

### 日程添加流程

```
1. 用户点击添加按钮
   ↓
2. openModal() 打开模态框
   ↓
3. 用户填写表单
   ↓
4. handleFormSubmit() 处理提交
   ↓
5. db.addEvent() 保存到 IndexedDB
   ↓
6. cloudSync.uploadEvent() 上传到云端（如果已登录）
   ↓
7. calendar.render() 重新渲染日历
   ↓
8. showEventsForDate() 显示更新后的日程列表
```

### 云同步流程

```
1. 用户点击同步按钮
   ↓
2. performSync() 执行同步
   ↓
3. cloudSync.fetchAllEvents() 获取云端数据
   ↓
4. 比较本地和云端数据
   ↓
5. 处理服务器墓碑（已删除数据）
   ↓
6. 上传本地独有的数据
   ↓
7. 下载云端独有的数据
   ↓
8. 冲突解决（最后修改优先）
   ↓
9. localBackup.saveBackup() 保存本地备份
   ↓
10. folderBackup.saveBackup() 保存文件夹备份
    ↓
11. 更新 UI 显示同步结果
```

### 待办事项拖拽流程

```
1. 用户开始拖拽
   ↓
2. handleDragStart() 记录拖拽项
   ↓
3. 用户拖拽经过其他项
   ↓
4. handleDragOver() 显示放置提示
   ↓
5. 用户释放鼠标
   ↓
6. handleDrop() 处理放置
   ↓
7. 检查循环引用
   ↓
8. todoDB.updateTodoParent() 更新父任务
   ↓
9. loadTodos() + render() 重新渲染
```

## 存储策略

### IndexedDB 存储

#### 数据库结构

**CalendarAppDB** - 统一数据库
```
对象存储: events, todos, habits, habitLogs, timeEntries
索引: date, habitId

events 数据结构:
{
    id: string,              // 唯一标识
    title: string,           // 日程标题
    date: string,            // 日期 YYYY-MM-DD
    startTime: string,       // 开始时间 HH:MM
    endTime: string,         // 结束时间 HH:MM
    description: string,     // 备注
    createdAt: string,       // 创建时间 ISO
    updated_at: string       // 更新时间 ISO
}

todos 数据结构:
{
    id: string,              // 唯一标识
    text: string,            // 待办内容
    done: boolean,           // 完成状态
    dueDate: string,         // 截止日期 YYYY-MM-DD
    parentId: string,        // 父任务ID
    position: number,        // 排序位置
    createdAt: string,       // 创建时间 ISO
    updated_at: string       // 更新时间 ISO
}

habits 数据结构:
{
    id: string,              // 唯一标识
    name: string,            // 习惯名称
    description: string,     // 习惯描述
    color: string,           // 颜色
    icon: string,            // 图标
    targetCount: number,     // 每日目标次数
    created_at: string,      // 创建时间 ISO
    updated_at: string       // 更新时间 ISO
}

habitLogs 数据结构:
{
    id: string,              // 唯一标识
    habitId: string,         // 关联习惯ID
    logDate: string,         // 打卡日期 YYYY-MM-DD
    count: number,           // 打卡次数
    created_at: string       // 创建时间 ISO
}

timeEntries 数据结构:
{
    id: string,              // 唯一标识
    description: string,     // 时间记录描述
    startTime: string,       // 开始时间 ISO
    endTime: string,         // 结束时间 ISO
    created_at: string,      // 创建时间 ISO
    updated_at: string       // 更新时间 ISO
}
```

**CalendarAppDB_backup** - 备份数据库
```
对象存储: backups
索引: date

数据结构:
{
    id: string,              // 备份ID（时间戳）
    date: string,            // 备份时间 ISO
    version: string,         // 版本号
    events: Array,           // 日程数组
    todos: Array             // 待办事项数组
}
```

**CalendarBackupDB** - 文件夹备份设置
```
对象存储: settings

数据结构:
{
    key: string,             // 设置键
    directoryHandle: object, // 文件夹句柄
    lastBackupTime: string   // 上次备份时间
}
```

### LocalStorage 存储

用于存储轻量级配置和认证信息：

```javascript
// 账号管理
'calendar_accounts'          // 账号列表 JSON
'calendar_current_account'   // 当前账号ID

// 同步状态（已废弃，改用账号ID）
'calendar_last_sync_<id>'    // 最后同步时间

// 墓碑记录（防止删除的数据被恢复）
'calendar_tombstones_<id>_events'   // 事件墓碑
'calendar_tombstones_<id>_todos'    // 待办墓碑
```

### 云端 API 存储

通过 RESTful API 与云端服务器通信：

```
API Base URL: http://219.231.172.146:3001/api

认证相关:
POST /login                  // 用户登录
POST /register              // 用户注册

日程相关:
GET  /events                // 获取所有事件
POST /events                // 创建事件
DELETE /events/:id          // 删除事件
POST /events/batch          // 批量上传
GET  /sync?since=...        // 增量同步

待办相关:
GET  /todos                 // 获取所有待办
POST /todos                 // 创建待办
DELETE /todos/:id           // 删除待办
POST /todos/batch           // 批量上传
```

### 数据同步策略

#### 墓碑机制

当删除数据时，会在本地记录墓碑标记，防止数据被云端恢复：

```javascript
// 删除时添加墓碑
cloudSync.addTombstone('events', eventId);

// 同步时检查墓碑
const tombstones = cloudSync.getTombstones('events');
if (tombstones[eventId]) {
    // 跳过上传，这个数据已被删除
    continue;
}
```

#### 双向同步算法

```
1. 获取云端数据和本地数据
2. 处理服务器墓碑（删除本地对应数据）
3. 遍历本地数据：
   - 云端没有：检查墓碑 → 无墓碑则上传
   - 云端有：比较更新时间 → 新的覆盖旧的
4. 遍历云端数据：
   - 本地没有：直接下载
   - 本地有：已在步骤3处理
5. 更新同步时间戳
```

## PWA 实现细节

### Service Worker

Service Worker 负责资源缓存和离线支持：

```javascript
// 缓存策略
1. 安装时缓存静态资源
2. 激活时清除旧缓存
3. 请求时优先使用缓存，缓存缺失时网络请求
```

### Manifest 配置

```json
{
  "name": "日历日程管理",
  "short_name": "日历日程",
  "display": "standalone",        // 独立窗口模式
  "orientation": "portrait",      // 竖屏
  "start_url": "/",
  "theme_color": "#4285f4",
  "background_color": "#ffffff"
}
```

### 离线功能

- 静态资源缓存（HTML、CSS、JS）
- IndexedDB 数据存储
- 离线可查看和编辑数据
- 联网后自动同步

## 桌面应用集成

### Tauri 配置

Tauri 使用 Rust 后端和 WebView 前端：

```
src-tauri/
├── src/
│   └── lib.rs              // Rust 后端代码
├── tauri.conf.json         // Tauri 配置
├── Cargo.toml              // Rust 依赖
└── icons/                  // 应用图标
```

**配置要点**：
- 前端目录指向项目根目录
- 开发服务器地址配置
- 窗口大小和属性设置
- 应用信息和权限配置

### Electron 配置

Electron 使用 Node.js 后端：

```
electron/
├── main.js                 // 主进程
├── package.json            // 依赖配置
└── icons/                  // 应用图标
```

**配置要点**：
- 主进程创建窗口
- 加载本地 HTML 文件
- 窗口大小和属性设置
- 应用菜单和托盘

## 性能优化

### 数据库优化

1. **索引使用**：为常用查询字段创建索引
   ```javascript
   store.createIndex('date', 'date', { unique: false });
   ```

2. **批量操作**：使用事务批量处理数据
   ```javascript
   const transaction = db.transaction([STORE_NAME], 'readwrite');
   ```

3. **延迟加载**：按需加载数据，避免一次性加载全部

### 渲染优化

1. **虚拟列表**：大量数据时使用虚拟滚动
2. **防抖节流**：频繁操作使用防抖和节流
3. **DOM 批处理**：减少 DOM 操作次数
4. **CSS 优化**：使用 GPU 加速动画

### 缓存策略

1. **静态资源缓存**：Service Worker 缓存 CSS/JS
2. **数据缓存**：内存缓存常用数据
3. **版本管理**：资源更新时更新缓存版本

## 安全考虑

### 数据安全

1. **输入验证**：所有用户输入进行验证和转义
2. **XSS 防护**：使用 `escapeHtml()` 转义特殊字符
3. **CSRF 防护**：API 使用 Bearer Token 认证

### 认证安全

1. **密码传输**：HTTPS 加密传输
2. **Token 存储**：LocalStorage 存储（考虑迁移到 HttpOnly Cookie）
3. **会话管理**：支持多账号切换

### 数据隐私

1. **本地存储**：数据默认仅存储在本地
2. **可选云端**：云端同步需要用户主动开启
3. **数据导出**：支持导出完整数据备份
