# 前端 API 文档

本文档详细说明日历日程管理应用的前端 API，包括云同步 API、存储 API、日历 API 和待办事项 API。

## CloudSync API

云同步管理类，负责用户认证和数据同步。

### 类初始化

```javascript
const cloudSync = new CloudSync();
```

### 认证方法

#### login(username, password)

用户登录。

```javascript
await cloudSync.login('username', 'password');
```

**参数**：
- `username` (string): 用户名，最少3个字符
- `password` (string): 密码，最少6个字符

**返回值**：
```javascript
{
    token: string,        // 认证令牌
    username: string      // 用户名
}
```

**异常**：
- `Error`: 登录失败时抛出错误

#### register(username, password)

用户注册。

```javascript
await cloudSync.register('username', 'password');
```

**参数**：
- `username` (string): 用户名，最少3个字符
- `password` (string): 密码，最少6个字符

**返回值**：
```javascript
{
    token: string,        // 认证令牌
    username: string      // 用户名
}
```

**异常**：
- `Error`: 注册失败时抛出错误

#### logout()

用户登出。

```javascript
cloudSync.logout();
```

**说明**：清除当前账号的认证信息。

#### isLoggedIn()

检查是否已登录。

```javascript
const loggedIn = cloudSync.isLoggedIn();
```

**返回值**：`boolean` - 是否已登录

### 数据同步方法

#### uploadEvent(event)

上传单个事件到云端。

```javascript
const result = await cloudSync.uploadEvent(event);
```

**参数**：
```javascript
{
    id: string,
    title: string,
    date: string,           // YYYY-MM-DD
    startTime: string,      // HH:MM
    endTime: string,        // HH:MM
    description: string,
    createdAt: string,      // ISO 8601
    updated_at: string      // ISO 8601
}
```

**返回值**：
```javascript
{
    id: string,
    // ... 其他字段
}
```

**说明**：保留原有的 `createdAt` 和 `updated_at` 时间戳。

#### uploadTodo(todo)

上传单个待办事项到云端。

```javascript
const result = await cloudSync.uploadTodo(todo);
```

**参数**：
```javascript
{
    id: string,
    text: string,
    done: boolean,
    dueDate: string,        // YYYY-MM-DD
    parentId: string,
    position: number,
    createdAt: string,
    updated_at: string
}
```

**返回值**：上传后的待办对象

#### fetchAllEvents()

从云端获取所有事件。

```javascript
const data = await cloudSync.fetchAllEvents();
```

**返回值**：
```javascript
{
    events: Array,           // 事件数组
    deleted_events: Array    // 已删除事件ID数组
}
```

#### fetchAllTodos()

从云端获取所有待办事项。

```javascript
const data = await cloudSync.fetchAllTodos();
```

**返回值**：
```javascript
{
    todos: Array,            // 待办事项数组
    deleted_todos: Array     // 已删除待办ID数组
}
```

#### batchUpload(events)

批量上传本地事件到云端。

```javascript
const allEvents = await cloudSync.batchUpload(localEvents);
```

**参数**：
- `events` (Array): 本地事件数组

**返回值**：`Array` - 所有云端事件

#### batchUploadTodos(todos)

批量上传本地待办到云端。

```javascript
const allTodos = await cloudSync.batchUploadTodos(localTodos);
```

**参数**：
- `todos` (Array): 本地待办数组

**返回值**：`Array` - 所有云端待办

#### deleteEvent(eventId)

从云端删除事件。

```javascript
const success = await cloudSync.deleteEvent(eventId);
```

**参数**：
- `eventId` (string): 事件ID

**返回值**：`boolean` - 是否删除成功

**说明**：成功删除后会添加墓碑记录。

#### deleteTodo(todoId)

从云端删除待办事项。

```javascript
const success = await cloudSync.deleteTodo(todoId);
```

**参数**：
- `todoId` (string): 待办ID

**返回值**：`boolean` - 是否删除成功

**说明**：成功删除后会添加墓碑记录。

### 墓碑管理方法

#### addTombstone(type, id)

添加墓碑记录。

```javascript
cloudSync.addTombstone('events', eventId);
```

**参数**：
- `type` (string): 'events' 或 'todos'
- `id` (string): 数据ID

#### getTombstones(type)

获取所有墓碑记录。

```javascript
const tombstones = cloudSync.getTombstones('events');
```

**参数**：
- `type` (string): 'events' 或 'todos'

**返回值**：`Object` - 墓碑记录对象 `{ id: timestamp }`

#### removeTombstone(type, id)

移除墓碑记录。

```javascript
cloudSync.removeTombstone('events', eventId);
```

#### clearOldTombstones(type)

清除旧的墓碑记录（超过30天）。

```javascript
cloudSync.clearOldTombstones('events');
```

### 状态方法

#### getSyncStatusText()

获取同步状态文本。

```javascript
const statusText = cloudSync.getSyncStatusText();
```

**返回值**：`string` - 如 "刚刚同步"、"5分钟前同步"

#### updateSyncTime()

更新同步时间。

```javascript
cloudSync.updateSyncTime();
```

### 账号管理方法

#### switchAccount(accountId)

切换账号。

```javascript
const account = cloudSync.switchAccount(accountId);
```

**参数**：
- `accountId` (string): 账号ID

**返回值**：账号对象或 `null`

#### removeAccount(accountId)

移除账号。

```javascript
cloudSync.removeAccount(accountId);
```

#### getAllAccounts()

获取所有账号。

```javascript
const accounts = cloudSync.getAllAccounts();
```

**返回值**：`Array` - 账号数组

## CalendarDB API

IndexedDB 数据库操作类。

### 初始化

```javascript
const db = new CalendarDB();
await db.init();
```

### 日程 CRUD

#### addEvent(event)

添加日程。

```javascript
await db.addEvent({
    id: 'unique-id',
    title: '会议',
    date: '2024-02-27',
    startTime: '14:00',
    endTime: '15:00',
    description: '周会'
});
```

**参数**：完整的事件对象

**返回值**：`Promise<string>` - 事件ID

**说明**：如果已登录，会自动上传到云端。

#### updateEvent(event)

更新日程。

```javascript
await db.updateEvent(event);
```

**参数**：包含更新字段的事件对象

**返回值**：`Promise<void>`

**说明**：会自动更新 `updated_at` 字段。

#### deleteEvent(id)

删除日程。

```javascript
await db.deleteEvent(eventId);
```

**参数**：
- `id` (string): 事件ID

**返回值**：`Promise<void>`

**说明**：如果已登录，会同时从云端删除。

#### getEvent(id)

获取单个日程。

```javascript
const event = await db.getEvent(eventId);
```

**返回值**：`Promise<Object|null>` - 事件对象或 null

#### getEventsByDate(date)

获取指定日期的所有日程。

```javascript
const events = await db.getEventsByDate('2024-02-27');
```

**参数**：
- `date` (string): YYYY-MM-DD 格式

**返回值**：`Promise<Array>` - 事件数组

#### getAllEvents()

获取所有日程。

```javascript
const events = await db.getAllEvents();
```

**返回值**：`Promise<Array>` - 已排序的事件数组

**说明**：按日期和时间排序。

#### getEventsInRange(startDate, endDate)

获取日期范围内的所有日程。

```javascript
const events = await db.getEventsInRange('2024-02-01', '2024-02-29');
```

**参数**：
- `startDate` (string): 开始日期 YYYY-MM-DD
- `endDate` (string): 结束日期 YYYY-MM-DD

**返回值**：`Promise<Array>` - 事件数组

### 数据管理

#### clearAll()

清空所有数据。

```javascript
await db.clearAll();
```

**返回值**：`Promise<void>`

#### importEvents(events)

批量导入日程。

```javascript
const count = await db.importEvents(eventsArray);
```

**参数**：
- `events` (Array): 事件数组

**返回值**：`Promise<number>` - 导入的数量

### 同步方法

#### syncFromCloud()

从云端同步所有事件（替换本地数据）。

```javascript
const count = await db.syncFromCloud();
```

**返回值**：`Promise<number>` - 同步的事件数量

**说明**：会清空本地数据后导入云端数据。

#### biDirectionalSync()

双向同步（合并本地和云端数据）。

```javascript
const result = await db.biDirectionalSync();
```

**返回值**：
```javascript
{
    uploaded: number,         // 上传数量
    downloaded: number,       // 下载数量
    deleted: number,          // 删除数量
    conflicts: number,        // 冲突数量
    todoUploaded: number,     // 待办上传数量
    todoDownloaded: number,   // 待办下载数量
    total: number             // 总数量
}
```

#### addEventWithoutSync(event)

添加事件但不触发同步。

```javascript
await db.addEventWithoutSync(event);
```

**说明**：用于同步时避免循环上传。

#### deleteEventWithoutSync(id)

删除事件但不触发同步。

```javascript
await db.deleteEventWithoutSync(id);
```

### 配置

#### setAutoSync(enabled)

设置自动同步开关。

```javascript
db.setAutoSync(true);
```

#### getCloudSync()

获取云同步实例。

```javascript
const cloudSync = db.getCloudSync();
```

## TodoList API

待办事项管理类。

### 初始化

```javascript
const todoList = new TodoList();
await todoList.init();
```

### 数据操作

#### addTodo(text, dueDate, parentId)

添加待办事项。

```javascript
await todoList.addTodo('完成任务', '2024-02-28', null);
```

**参数**：
- `text` (string): 待办内容
- `dueDate` (string): 可选，截止日期 YYYY-MM-DD
- `parentId` (string): 可选，父任务ID

**返回值**：`Promise<void>`

#### clearCompleted()

清除已完成的待办事项。

```javascript
const count = await todoList.clearCompleted();
```

**返回值**：`Promise<number>` - 清除的数量

#### getCompletedCount()

获取已完成待办事项数量。

```javascript
const count = todoList.getCompletedCount();
```

**返回值**：`number`

### UI 方法

#### render()

渲染待办事项列表。

```javascript
todoList.render();
```

#### loadTodos()

从数据库加载待办事项。

```javascript
await todoList.loadTodos();
```

### 交互方法

#### toggleCollapse(todoId)

切换折叠状态。

```javascript
todoList.toggleCollapse(todoId);
```

#### editTodoInline(todoItem, todo)

行内编辑。

```javascript
todoList.editTodoInline(domElement, todoObject);
```

#### editTodoDate(todoItem, todo)

编辑截止日期。

```javascript
todoList.editTodoDate(domElement, todoObject);
```

## TodoDB API

待办事项数据库操作类。

### 初始化

```javascript
const todoDB = new TodoDB();
await todoDB.init();
```

### CRUD 操作

#### addTodo(text, dueDate, parentId, position)

添加待办事项。

```javascript
await todoDB.addTodo('内容', '2024-02-28', null, 0);
```

**参数**：
- `text` (string): 待办内容
- `dueDate` (string): 可选，截止日期
- `parentId` (string): 可选，父任务ID
- `position` (number): 可选，排序位置

**返回值**：`Promise<Object>` - 创建的待办对象

#### toggleTodo(id)

切换完成状态。

```javascript
await todoDB.toggleTodo(todoId);
```

**返回值**：`Promise<Object>` - 更新后的待办对象

#### deleteTodo(id)

删除待办事项。

```javascript
await todoDB.deleteTodo(todoId);
```

#### updateTodo(id, updates)

更新待办事项。

```javascript
await todoDB.updateTodo(todoId, { text: '新内容' });
```

**参数**：
- `id` (string): 待办ID
- `updates` (Object): 更新字段

#### updateTodoParent(id, parentId, position)

更新待办事项的父任务。

```javascript
await todoDB.updateTodoParent(todoId, newParentId, newPosition);
```

### 查询操作

#### getAllTodos()

获取所有待办事项。

```javascript
const todos = await todoDB.getAllTodos();
```

**返回值**：`Promise<Array>` - 待办数组（已完成在后）

#### deleteCompletedTodos()

删除所有已完成的待办事项。

```javascript
const count = await todoDB.deleteCompletedTodos();
```

**返回值**：`Promise<number>` - 删除数量

### 同步方法

#### addTodoWithoutSync(todo)

添加待办但不触发同步。

```javascript
await todoDB.addTodoWithoutSync(todo);
```

#### updateTodoWithoutSync(todo)

更新待办但不触发同步。

```javascript
await todoDB.updateTodoWithoutSync(todo);
```

## HabitTracker API

习惯打卡管理类。

### 初始化

```javascript
const habitTracker = new HabitTracker();
await habitTracker.init();
```

### 数据操作

#### loadData()

加载习惯和打卡记录数据。

```javascript
await habitTracker.loadData();
```

**说明**：优先从本地 IndexedDB 加载，如果已登录则同步云端数据。

#### checkin(habitId, date)

对指定习惯进行打卡。

```javascript
await habitTracker.checkin('habit-001', '2024-02-27');
```

**参数**：
- `habitId` (string): 习惯 ID
- `date` (string): 打卡日期 YYYY-MM-DD

#### saveHabit(e)

保存习惯（新建或更新）。

```javascript
// 在表单提交事件中调用
await habitTracker.saveHabit(event);
```

**说明**：从表单获取数据并保存到本地 IndexedDB。

#### deleteHabit(habitId)

删除习惯。

```javascript
await habitTracker.deleteHabit('habit-001');
```

### UI 方法

#### render()

渲染习惯界面。

```javascript
habitTracker.render();
```

#### renderHabitList()

渲染习惯列表。

```javascript
habitTracker.renderHabitList();
```

#### renderHeatmap()

渲染打卡热力图。

```javascript
habitTracker.renderHeatmap();
```

#### calculateStats(logsMap)

计算统计数据。

```javascript
habitTracker.calculateStats(logsMap);
```

**返回值**：
- 总打卡天数
- 当前连续打卡天数

### 属性

```javascript
habitTracker.habits          // 习惯数组
habitTracker.habitLogs       // 打卡记录 Map
habitTracker.currentView     // 当前视图（'list' 或 'heatmap'）
habitTracker.selectedHabitId // 选中的习惯 ID
```

## TimeTracker API

时间追踪管理类。

### 初始化

```javascript
const timeTracker = new TimeTracker();
await timeTracker.init();
```

### 数据操作

#### loadData()

加载时间记录数据。

```javascript
await timeTracker.loadData();
```

**说明**：优先从本地 IndexedDB 加载，如果已登录则同步云端数据。

#### startTimeEntry()

开始新的时间记录。

```javascript
await timeTracker.startTimeEntry('项目开发');
```

**参数**：
- `description` (string): 时间记录描述

#### stopTimeEntry()

停止当前计时。

```javascript
await timeTracker.stopTimeEntry();
```

**返回值**：完成的时间记录对象

#### saveTimeEntry(timeEntry)

保存时间记录（新建或更新）。

```javascript
await timeTracker.saveTimeEntry({
    id: 'te-001',
    description: '项目开发',
    startTime: '2024-02-27T09:00:00',
    endTime: '2024-02-27T12:00:00'
});
```

#### deleteTimeEntry(entryId)

删除时间记录。

```javascript
await timeTracker.deleteTimeEntry('te-001');
```

### UI 方法

#### render()

渲染时间记录列表。

```javascript
timeTracker.render();
```

#### updateTimerDisplay()

更新计时器显示。

```javascript
timeTracker.updateTimerDisplay();
```

#### calculateTotalDuration()

计算所有时间记录的总时长。

```javascript
const totalSeconds = timeTracker.calculateTotalDuration();
```

**返回值**：`number` - 总秒数

### 计时器状态

```javascript
timeTracker.isRunning         // 是否正在计时
timeTracker.currentEntry      // 当前时间记录
timeTracker.timerInterval     // 计时器间隔 ID
timeTracker.elapsedSeconds    // 已过去秒数
```

---

## CalendarApp API

日历应用主类。

### 初始化

```javascript
const calendar = new CalendarApp();
```

### 渲染方法

#### render()

渲染日历。

```javascript
calendar.render();
```

#### renderHeader()

渲染月份标题。

```javascript
calendar.renderHeader();
```

#### renderGrid()

渲染日历网格。

```javascript
calendar.renderGrid();
```

### 导航方法

#### prevMonth()

切换到上个月。

```javascript
calendar.prevMonth();
```

#### nextMonth()

切换到下个月。

```javascript
calendar.nextMonth();
```

#### goToday()

返回今天。

```javascript
calendar.goToday();
```

### 日期操作

#### onDateClick(date)

处理日期点击。

```javascript
await calendar.onDateClick(newDate);
```

#### showEventsForDate(date)

显示指定日期的日程。

```javascript
await calendar.showEventsForDate(selectedDate);
```

### 属性

```javascript
calendar.currentDate    // 当前显示的日期
calendar.selectedDate   // 当前选中的日期
calendar.currentMonth   // 当前月份（0-11）
calendar.currentYear    // 当前年份
```

## LocalBackup API

本地备份管理类。

### 初始化

```javascript
const localBackup = new LocalBackup();
await localBackup.init();
```

### 备份操作

#### saveBackup(events, todos)

保存备份。

```javascript
await localBackup.saveBackup(eventsArray, todosArray);
```

**参数**：
- `events` (Array): 日程数组
- `todos` (Array): 待办数组

**返回值**：`Promise<string>` - 备份ID

#### getAllBackups()

获取所有备份。

```javascript
const backups = await localBackup.getAllBackups();
```

**返回值**：`Promise<Array>` - 按时间倒序的备份数组

#### restoreBackup(id)

恢复备份（获取备份内容）。

```javascript
const backup = await localBackup.restoreBackup(backupId);
```

**返回值**：`Promise<Object|null>` - 备份对象

#### deleteBackup(id)

删除备份。

```javascript
await localBackup.deleteBackup(backupId);
```

## FolderBackup API

文件夹备份管理类。

### 初始化

```javascript
const folderBackup = new FolderBackup();
await folderBackup.init();
```

### 文件夹操作

#### selectFolder()

选择备份文件夹。

```javascript
const success = await folderBackup.selectFolder();
```

**返回值**：`Promise<boolean>` - 是否成功

**说明**：需要用户授权。

#### clearFolder()

清除文件夹设置。

```javascript
await folderBackup.clearFolder();
```

### 备份操作

#### saveBackup(events, todos)

保存备份到文件夹。

```javascript
await folderBackup.saveBackup(eventsArray, todosArray);
```

**参数**：
- `events` (Array): 日程数组
- `todos` (Array): 待办数组

**返回值**：`Promise<boolean>` - 是否成功

### 静态方法

#### isSupported()

检查浏览器是否支持文件夹备份。

```javascript
if (FolderBackup.isSupported()) {
    // 使用文件夹备份
}
```

**返回值**：`boolean`

## 工具函数 API

### formatDate(date)

格式化日期为 YYYY-MM-DD。

```javascript
const dateStr = formatDate(new Date());
// 返回: "2024-02-27"
```

### parseDate(dateStr)

解析日期字符串。

```javascript
const date = parseDate('2024-02-27');
```

### formatChineseDate(date)

格式化日期为中文。

```javascript
const dateStr = formatChineseDate(new Date());
// 返回: "2024年2月"
```

### generateId()

生成唯一 ID。

```javascript
const id = generateId();
```

### showToast(message, type)

显示提示消息。

```javascript
showToast('操作成功');
showToast('操作失败', 'error');
```

**参数**：
- `message` (string): 消息内容
- `type` (string): 'success' 或 'error'

### exportToFile(data, filename)

导出数据为文件。

```javascript
exportToFile({ data: '...' }, 'backup.json');
```

### readFile(file)

读取文件内容。

```javascript
const data = await readFile(fileObject);
```

**返回值**：`Promise<Object>` - 解析后的 JSON 对象

### escapeHtml(text)

转义 HTML 特殊字符。

```javascript
const safe = escapeHtml('<script>alert("xss")</script>');
```

## 事件处理模式

### DOM 事件绑定

```javascript
// 元素点击事件
element.addEventListener('click', (e) => {
    // 处理点击
});

// 表单提交事件
form.addEventListener('submit', (e) => {
    e.preventDefault();
    // 处理提交
});
```

### 异步操作模式

```javascript
// 使用 async/await
async function handleAction() {
    try {
        await db.addEvent(event);
        showToast('添加成功');
    } catch (err) {
        showToast('添加失败', 'error');
    }
}
```

### 模态框模式

```javascript
// 打开模态框
modal.classList.add('active');

// 关闭模态框
modal.classList.remove('active');
```

### 数据刷新模式

```javascript
// 1. 更新数据
await db.addEvent(event);

// 2. 重新加载数据
await calendar.loadEvents();

// 3. 重新渲染
calendar.render();
```
