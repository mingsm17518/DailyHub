# 开发者指南

本文档为日历日程管理应用的开发者提供详细的开发指南，包括代码风格、开发流程、测试方法和常见问题解决方案。

## 代码风格指南

### JavaScript 代码规范

#### 命名规范

```javascript
// 类名使用 PascalCase
class CalendarApp { }
class TodoList { }

// 函数名使用 camelCase
function formatDate() { }
function renderGrid() { }

// 常量使用 UPPER_SNAKE_CASE
const DB_NAME = 'CalendarAppDB';
const API_BASE_URL = 'http://...';

// 私有方法使用下划线前缀
function _privateMethod() { }

// 布尔值返回的函数使用 is/has 前缀
function isLoggedIn() { }
function hasEvents() { }
```

#### 变量声明

```javascript
// 优先使用 const，需要重新赋值时使用 let
const db = new CalendarDB();
let currentDate = new Date();

// 避免使用 var
```

#### 函数定义

```javascript
// 箭头函数（适合短函数和回调）
const addTodo = async (text) => {
    await todoDB.addTodo(text);
};

// 普通函数（适合需要 this 的方法）
async function handleSync() {
    await performSync();
}

// 类方法
class MyClass {
    myMethod() {
        // 方法实现
    }
}
```

#### 异步处理

```javascript
// 使用 async/await 而非 Promise 链
async function loadData() {
    try {
        const events = await db.getAllEvents();
        const todos = await todoDB.getAllTodos();
        return { events, todos };
    } catch (err) {
        console.error('加载失败:', err);
        throw err;
    }
}

// 避免过深的嵌套
// 不好：
async function bad() {
    const a = await getA();
    const b = await getB();
    const c = await getC();
    const d = await getD();
}

// 好：
async function good() {
    const [a, b, c, d] = await Promise.all([
        getA(), getB(), getC(), getD()
    ]);
}
```

#### 错误处理

```javascript
// 总是捕获异步错误
async function safeOperation() {
    try {
        await riskyOperation();
    } catch (err) {
        console.error('操作失败:', err);
        showToast('操作失败', 'error');
        // 根据情况决定是否重新抛出
        // throw err;
    }
}

// Promise 错误处理
promise.catch(err => {
    console.error('错误:', err);
});
```

### CSS 代码规范

#### 命名规范

```css
/* 使用 BEM 命名规范（可选） */
.todo-item { }
.todo-item--done { }
.todo-item__text { }
.todo-item__delete-btn { }

/* 或使用简单的连字符命名 */
.day-cell { }
.day-cell.selected { }
.day-cell-number { }
```

#### CSS 变量

```css
/* 定义 CSS 变量 */
:root {
    --primary-color: #4285f4;
    --border-radius: 8px;
    --transition: all 0.3s ease;
}

/* 使用变量 */
.button {
    background: var(--primary-color);
    border-radius: var(--border-radius);
    transition: var(--transition);
}
```

#### 选择器优先级

```css
/* 避免过深的嵌套 */
/* 不好 */
.todo-panel .todo-list .todo-item .todo-text { }

/* 好 */
.todo-text { }

/* 使用类选择器而非标签选择器 */
/* 不好 */
div > ul > li { }

/* 好 */
.todo-item { }
```

### HTML 代码规范

#### 结构规范

```html
<!-- 使用语义化标签 -->
<header class="calendar-header">
    <h1>标题</h1>
</header>

<main class="main-content">
    <div class="calendar-grid">
        <!-- 内容 -->
    </div>
</main>

<aside class="sidebar">
    <!-- 侧边栏内容 -->
</aside>
```

#### 属性顺序

```html
<div
    id="unique-id"
    class="class-name"
    data-value="value"
    title="提示文本"
    aria-label="无障碍标签">
    内容
</div>
```

## 添加新功能

### 功能开发流程

1. **需求分析**
   - 明确功能需求
   - 设计用户界面
   - 规划数据结构

2. **创建分支**
   ```bash
   git checkout -b feature/new-feature
   ```

3. **开发功能**
   - 编写 HTML 结构
   - 添加 CSS 样式
   - 实现 JavaScript 逻辑

4. **测试功能**
   - 手动测试各种场景
   - 检查边界情况
   - 测试错误处理

5. **提交代码**
   ```bash
   git add .
   git commit -m "feat: 添加新功能描述"
   ```

### 示例：添加新功能

假设要添加"日程提醒"功能：

#### 1. 定义数据结构

```javascript
// 在 storage.js 中扩展事件数据结构
const event = {
    // ... 现有字段
    reminder: {
        enabled: true,
        minutes: 15,  // 提前15分钟
        method: 'notification'  // 'notification' | 'sound' | 'both'
    }
};
```

#### 2. 添加 UI 元素

```html
<!-- 在事件表单中添加提醒设置 -->
<div class="form-group">
    <label>提醒</label>
    <div class="reminder-settings">
        <label>
            <input type="checkbox" id="eventReminderEnabled">
            启用提醒
        </label>
        <select id="eventReminderTime" disabled>
            <option value="0">准时</option>
            <option value="5">提前5分钟</option>
            <option value="15">提前15分钟</option>
            <option value="30">提前30分钟</option>
            <option value="60">提前1小时</option>
        </select>
    </div>
</div>
```

#### 3. 实现功能逻辑

```javascript
// 在 app.js 中添加提醒处理
function setupReminderHandlers() {
    const enabledCheckbox = document.getElementById('eventReminderEnabled');
    const timeSelect = document.getElementById('eventReminderTime');

    enabledCheckbox.addEventListener('change', (e) => {
        timeSelect.disabled = !e.target.checked;
    });
}

function scheduleReminder(event) {
    if (!event.reminder?.enabled) return;

    const reminderTime = new Date(`${event.date}T${event.startTime}`);
    reminderTime.setMinutes(reminderTime.getMinutes() - event.reminder.minutes);

    const now = new Date();
    if (reminderTime > now) {
        const delay = reminderTime - now;
        setTimeout(() => {
            showReminderNotification(event);
        }, delay);
    }
}

function showReminderNotification(event) {
    if (Notification.permission === 'granted') {
        new Notification('日程提醒', {
            body: `${event.startTime} - ${event.title}`,
            icon: '/icon.png'
        });
    }
}
```

#### 4. 添加样式

```css
.reminder-settings {
    display: flex;
    align-items: center;
    gap: 10px;
}

.reminder-settings select {
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
}
```

## 测试说明

### 手动测试清单

#### 日历功能测试

- [ ] 月份导航（上个月/下个月）
- [ ] 返回今天按钮
- [ ] 点击日期查看日程
- [ ] 双击日期添加日程
- [ ] 今天日期高亮显示
- [ ] 有日程的日期标记显示
- [ ] 跨月日期正确显示

#### 日程管理测试

- [ ] 添加新日程
- [ ] 编辑已有日程
- [ ] 删除日程
- [ ] 保存按钮正常工作
- [ ] 取消按钮关闭模态框
- [ ] 表单验证（必填字段）
- [ ] 日程列表正确显示
- [ ] 时间排序正确

#### 待办事项测试

- [ ] 添加待办事项
- [ ] 设置截止日期
- [ ] 勾选完成
- [ ] 删除待办
- [ ] 行内编辑
- [ ] 拖拽排序
- [ ] 拖拽创建子任务
- [ ] 折叠/展开子任务
- [ ] 过期待办高亮显示

#### 云同步测试

- [ ] 用户注册
- [ ] 用户登录
- [ ] 登出功能
- [ ] 手动同步
- [ ] 自动同步（登录后）
- [ ] 同步冲突解决
- [ ] 离线修改后同步
- [ ] 多设备同步

#### 备份恢复测试

- [ ] 导出数据
- [ ] 导入数据（追加模式）
- [ ] 导入数据（覆盖模式）
- [ ] 文件夹备份
- [ ] 查看备份内容
- [ ] 恢复备份
- [ ] 删除备份

#### 响应式测试

- [ ] 桌面端显示（>768px）
- [ ] 平板端显示（768px - 1024px）
- [ ] 移动端显示（<768px）
- [ ] 侧边栏在移动端的显示/隐藏
- [ ] 触摸操作正常

### 边界情况测试

```javascript
// 测试空数据
await db.getAllEvents();  // 空数组
await db.getEvent('non-existent');  // null

// 测试特殊字符
const event = {
    title: '<script>alert("xss")</script>',
    description: '测试特殊字符：& < > " \''
};

// 测试日期边界
const leapYear = '2024-02-29';  // 闰年
const invalidDate = '2024-02-30';  // 无效日期

// 测试大量数据
for (let i = 0; i < 1000; i++) {
    await db.addEvent({ ... });
}
```

### 性能测试

```javascript
// 测试大量数据渲染
console.time('render');
await calendar.render();
console.timeEnd('render');

// 测试同步性能
console.time('sync');
await db.biDirectionalSync();
console.timeEnd('sync');

// 测试存储性能
console.time('storage');
await db.addEvent(largeEvent);
console.timeEnd('storage');
```

## 调试技巧

### 浏览器开发者工具

#### Console 调试

```javascript
// 使用 console.log 输出调试信息
console.log('当前日期:', currentDate);
console.log('事件数组:', events);

// 使用 console.table 显示表格数据
console.table(events);

// 使用 console.group 分组输出
console.group('同步流程');
console.log('步骤1: 获取本地数据');
console.log('步骤2: 获取云端数据');
console.groupEnd();

// 使用 console.time 测量性能
console.time('操作名称');
// ... 执行操作
console.timeEnd('操作名称');
```

#### 断点调试

```javascript
// 在代码中设置断点
debugger;

// 条件断点
if (eventId === 'target-id') {
    debugger;
}
```

#### 检查存储

```javascript
// 检查 IndexedDB
indexedDB.open('CalendarAppDB').onsuccess = (e) => {
    const db = e.target.result;
    console.log('数据库:', db);
};

// 检查 LocalStorage
console.log('LocalStorage:', {
    accounts: localStorage.getItem('calendar_accounts'),
    currentAccount: localStorage.getItem('calendar_current_account')
});
```

### 网络调试

```javascript
// 监控 API 请求
fetch(`${API_BASE_URL}/events`)
    .then(response => {
        console.log('响应状态:', response.status);
        console.log('响应头:', response.headers);
        return response.json();
    })
    .then(data => console.log('响应数据:', data))
    .catch(error => console.error('请求失败:', error));
```

### Service Worker 调试

```javascript
// 在浏览器中查看 Service Worker 状态
// 1. 打开开发者工具
// 2. 进入 Application/应用 标签
// 3. 选择 Service Workers
// 4. 查看状态和日志

// 强制更新 Service Worker
navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => {
        registration.update();
    });
});
```

### 常见问题排查

#### 数据未保存

```javascript
// 检查 IndexedDB 是否正常
async function checkIndexedDB() {
    try {
        await db.init();
        const events = await db.getAllEvents();
        console.log('数据库正常，事件数:', events.length);
    } catch (err) {
        console.error('数据库错误:', err);
    }
}
```

#### 同步失败

```javascript
// 检查网络和认证
async function checkSyncStatus() {
    const cloudSync = db.getCloudSync();

    console.log('是否登录:', cloudSync.isLoggedIn());
    console.log('Token:', cloudSync.token);
    console.log('同步时间:', cloudSync.lastSync);

    // 测试 API 连接
    try {
        const response = await fetch(`${API_BASE_URL}/events`, {
            headers: cloudSync.getAuthHeaders()
        });
        console.log('API 状态:', response.status);
    } catch (err) {
        console.error('API 连接失败:', err);
    }
}
```

#### UI 未更新

```javascript
// 检查渲染流程
function debugRender() {
    console.log('当前月份:', calendar.currentMonth);
    console.log('当前年份:', calendar.currentYear);
    console.log('选中日期:', calendar.selectedDate);

    // 强制重新渲染
    calendar.render();
}
```

## 常见开发模式

### 事件委托

```javascript
// 使用事件委托处理动态元素
document.getElementById('todoList').addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.todo-delete');
    if (deleteBtn) {
        const todoId = deleteBtn.closest('.todo-item').dataset.todoId;
        handleDeleteTodo(todoId);
    }
});
```

### 防抖和节流

```javascript
// 防抖：延迟执行，只执行最后一次
function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// 使用示例
const handleInput = debounce((value) => {
    console.log('搜索:', value);
}, 300);

// 节流：限制执行频率
function throttle(func, delay) {
    let lastCall = 0;
    return function(...args) {
        const now = Date.now();
        if (now - lastCall >= delay) {
            lastCall = now;
            func.apply(this, args);
        }
    };
}
```

### 状态管理

```javascript
// 简单的状态管理
const state = {
    currentDate: new Date(),
    selectedDate: new Date(),
    events: [],
    todos: []
};

// 状态更新函数
function setState(updates) {
    Object.assign(state, updates);
    render();
}

// 使用示例
setState({ currentDate: new Date() });
```

### 模块化模式

```javascript
// 使用 IIFE 创建模块
const MyModule = (() => {
    // 私有变量
    let privateVar = '';

    // 私有方法
    function privateMethod() {
        // ...
    }

    // 公共 API
    return {
        publicMethod() {
            // 可以访问私有成员
        },
        publicVar: 'value'
    };
})();
```

## 发布检查清单

### 代码审查

- [ ] 代码符合规范
- [ ] 没有调试用的 console.log
- [ ] 错误处理完善
- [ ] 没有硬编码的配置

### 功能测试

- [ ] 所有功能正常工作
- [ ] 边界情况处理正确
- [ ] 错误提示友好

### 性能检查

- [ ] 没有明显的性能问题
- [ ] 大数据量测试通过
- [ ] 内存使用正常

### 兼容性检查

- [ ] Chrome 浏览器测试
- [ ] Edge 浏览器测试
- [ ] Firefox 浏览器测试
- [ ] 移动端测试

### 文档更新

- [ ] API 文档更新
- [ ] README 更新
- [ ] 更新日志添加

### 版本管理

1. 更新 `index.html` 中的资源版本号
2. 更新 `sw.js` 中的缓存版本号
3. 更新 `manifest.json` 中的版本信息（如有）
4. 提交 Git 记录

```bash
git add .
git commit -m "release: v4.5 功能更新"
git tag v4.5
git push origin main --tags
```

## 贡献指南

### 提交规范

使用语义化提交信息：

```bash
feat: 添加新功能
fix: 修复问题
docs: 文档更新
style: 代码格式调整
refactor: 重构代码
perf: 性能优化
test: 测试相关
chore: 构建/工具相关
```

### Pull Request 流程

1. Fork 项目仓库
2. 创建功能分支
3. 开发并测试
4. 提交 Pull Request
5. 等待代码审查
6. 根据反馈修改
7. 合并到主分支
