# Todo Priority Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 4-level priority system (None/Low/Medium/High) to todos with clickable emoji badges for quick priority changes.

**Architecture:**
- Add `priority` field to todo objects in IndexedDB storage
- Render clickable priority badges in todo list items
- Add priority selector in todo creation form
- Priority syncs automatically via existing cloud sync infrastructure

**Tech Stack:**
- Vanilla JavaScript (no frameworks)
- IndexedDB for local storage
- CSS for styling
- Existing cloud sync via fetch API

---

## Task 1: Add Priority Field to Data Model

**Files:**
- Modify: `js/todolist.js:44-63` (addTodo method)
- Modify: `js/todolist.js:211-248` (addTodoWithoutSync method)
- Modify: `js/todolist.js:254-277` (updateTodoWithoutSync method)

**Step 1: Update addTodo to accept priority parameter**

In `js/todolist.js`, modify the `addTodo` method signature and implementation:

```javascript
// Line 44, change:
async addTodo(text, dueDate = null, parentId = null, position = null, reminder = null) {
// To:
async addTodo(text, dueDate = null, parentId = null, position = null, reminder = null, priority = 'none') {
```

**Step 2: Add priority to todo object creation**

In `js/todolist.js`, modify the todo object creation (around line 53):

```javascript
const todo = {
    id: generateId(),
    text: text,
    done: false,
    dueDate: dueDate,
    parentId: parentId,
    position: finalPosition,
    reminder: reminder,
    priority: priority,  // Add this line
    createdAt: new Date().toISOString(),
    updated_at: new Date().toISOString()
};
```

**Step 3: Update addTodoWithoutSync to handle priority**

In `js/todolist.js:211-248`, modify the todoData object:

```javascript
const todoData = {
    id: todo.id,
    text: todo.text,
    done: todo.done,
    dueDate: todo.dueDate || null,
    parentId: todo.parentId || null,
    position: todo.position || 0,
    reminder: todo.reminder || null,
    priority: todo.priority || 'none',  // Add this line
    createdAt: todo.createdAt,
    updated_at: todo.updated_at
};
```

**Step 4: Update updateTodoWithoutSync to handle priority**

In `js/todolist.js:254-277`, modify the todoData object (same change as Step 3):

```javascript
const todoData = {
    id: todo.id,
    text: todo.text,
    done: todo.done,
    dueDate: todo.dueDate || null,
    parentId: todo.parentId || null,
    position: todo.position || 0,
    reminder: todo.reminder || null,
    priority: todo.priority || 'none',  // Add this line
    createdAt: todo.createdAt,
    updated_at: todo.updated_at
};
```

**Step 5: Test manually**

Open browser DevTools, create a new todo, check that it has `priority: 'none'` in IndexedDB.

**Step 6: Commit**

```bash
git add js/todolist.js
git commit -m "feat: add priority field to todo data model"
```

---

## Task 2: Add Priority Selector UI

**Files:**
- Modify: `index.html:77-100` (todo-input-wrapper section)
- Create: `css/style.css` (priority selector styles)

**Step 1: Add priority selector HTML**

In `index.html`, add the priority selector after the text input and before the date picker (around line 79):

```html
<div class="todo-input-wrapper">
    <input type="text" id="todoInput" placeholder="添加待办事项..." maxlength="100" class="todo-text-input">

    <!-- ADD THIS SECTION -->
    <div class="todo-priority-selector">
        <label class="priority-option">
            <input type="radio" name="todoPriority" value="none" checked>
            <span class="priority-label" data-priority="none">⚪无</span>
        </label>
        <label class="priority-option">
            <input type="radio" name="todoPriority" value="low">
            <span class="priority-label" data-priority="low">🟡低</span>
        </label>
        <label class="priority-option">
            <input type="radio" name="todoPriority" value="medium">
            <span class="priority-label" data-priority="medium">🟠中</span>
        </label>
        <label class="priority-option">
            <input type="radio" name="todoPriority" value="high">
            <span class="priority-label" data-priority="high">🔴高</span>
        </label>
    </div>
    <!-- END ADD -->

    <div class="todo-actions-row">
        <!-- existing date picker and add button -->
    </div>
    <!-- ... rest of existing code ... -->
```

**Step 2: Add priority selector CSS**

In `css/style.css`, find the todo panel styles (around line 65) and add:

```css
/* Priority Selector */
.todo-priority-selector {
    display: flex;
    gap: 8px;
    margin: 8px 0;
    flex-wrap: wrap;
}

.priority-option {
    cursor: pointer;
    display: flex;
    align-items: center;
}

.priority-option input[type="radio"] {
    display: none;
}

.priority-label {
    padding: 4px 12px;
    border-radius: 16px;
    background-color: var(--bg-tertiary);
    font-size: 13px;
    transition: all 0.2s;
    border: 2px solid transparent;
}

.priority-label:hover {
    background-color: var(--bg-hover);
}

.priority-option input[type="radio"]:checked + .priority-label {
    background-color: var(--primary-light);
    border-color: var(--primary-color);
    font-weight: 500;
}

.priority-label[data-priority="high"] { color: #dc3545; }
.priority-label[data-priority="medium"] { color: #fd7e14; }
.priority-label[data-priority="low"] { color: #ffc107; }
.priority-label[data-priority="none"] { color: #adb5bd; }
```

**Step 3: Verify visually**

Open the page, check that priority selector appears and is clickable.

**Step 4: Commit**

```bash
git add index.html css/style.css
git commit -m "feat: add priority selector UI to todo input"
```

---

## Task 3: Wire Priority Selector to Add Todo

**Files:**
- Modify: `js/app.js` (find and modify the add todo button handler)

**Step 1: Find the add todo handler**

Search in `js/app.js` for the "btnAddTodo" button click handler. It should be around the todo initialization code.

**Step 2: Read priority value and pass to addTodo**

Modify the add todo handler to include priority:

```javascript
btnAddTodo.addEventListener('click', async () => {
    const input = document.getElementById('todoInput');
    const dueDateInput = document.getElementById('todoDueDate');
    const reminderEnabled = document.getElementById('todoReminderEnabled').checked;
    const reminderTime = document.getElementById('todoReminderTime').value;

    // ADD: Get selected priority
    const priorityInput = document.querySelector('input[name="todoPriority"]:checked');
    const priority = priorityInput ? priorityInput.value : 'none';

    if (!input.value.trim()) {
        showToast('请输入待办事项内容');
        return;
    }

    const reminder = reminderEnabled ? reminderTime : null;

    // MODIFY: Pass priority parameter
    await todoList.addTodo(input.value.trim(), dueDateInput.value || null, null, null, reminder, priority);

    // Reset form
    input.value = '';
    dueDateInput.value = '';
    document.getElementById('todoDueDateDisplay').value = '';
    document.getElementById('todoReminderSettings').style.display = 'none';

    // ADD: Reset priority to default (none)
    document.querySelector('input[name="todoPriority"][value="none"]').checked = true;

    showToast('待办事项已添加');
});
```

**Step 3: Test creating todos with different priorities**

1. Select "🔴高" priority
2. Enter a todo and click add
3. Check IndexedDB that priority is saved as "high"
4. Repeat for other priorities

**Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat: wire priority selector to add todo"
```

---

## Task 4: Display Priority Badge on Todo Items

**Files:**
- Modify: `js/todolist.js:511-640` (renderTodoTree method)
- Modify: `css/style.css` (add priority badge styles)

**Step 1: Add priority badge CSS**

In `css/style.css`, add styles for the priority badge (find todo item styles around line 65):

```css
/* Priority Badge on Todo Items */
.todo-priority-badge {
    display: inline-flex;
    align-items: center;
    margin-right: 6px;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: opacity 0.2s, transform 0.1s;
    user-select: none;
}

.todo-priority-badge:hover {
    opacity: 0.7;
    transform: scale(1.05);
}

.todo-priority-badge:active {
    transform: scale(0.95);
}

.todo-priority-badge[data-priority="high"] {
    color: #dc3545;
    background-color: rgba(220, 53, 69, 0.1);
}

.todo-priority-badge[data-priority="medium"] {
    color: #fd7e14;
    background-color: rgba(253, 126, 20, 0.1);
}

.todo-priority-badge[data-priority="low"] {
    color: #ffc107;
    background-color: rgba(255, 193, 7, 0.1);
}

.todo-priority-badge[data-priority="none"] {
    color: #adb5bd;
    background-color: rgba(173, 181, 189, 0.1);
}
```

**Step 2: Modify renderTodoTree to display priority badge**

In `js/todolist.js`, find the `renderTodoTree` method (around line 511) and modify the innerHTML construction (around line 544):

Find this section:
```javascript
item.innerHTML = `
    ${collapseHtml}
    <input type="checkbox" class="todo-checkbox" ${todo.done ? 'checked' : ''}>
    <span class="todo-text">${this.escapeHtml(todo.text)}</span>
    ${dueDateHtml}
    <button class="todo-delete" title="删除">×</button>
`;
```

Replace with:
```javascript
// Get priority label
const priorityLabels = {
    high: '🔴高',
    medium: '🟠中',
    low: '🟡低',
    none: '⚪无'
};
const todoPriority = todo.priority || 'none';
const priorityHtml = `<span class="todo-priority-badge" data-priority="${todoPriority}" data-todo-id="${todo.id}">${priorityLabels[todoPriority]}</span>`;

item.innerHTML = `
    ${collapseHtml}
    <input type="checkbox" class="todo-checkbox" ${todo.done ? 'checked' : ''}>
    ${priorityHtml}
    <span class="todo-text">${this.escapeHtml(todo.text)}</span>
    ${dueDateHtml}
    <button class="todo-delete" title="删除">×</button>
`;
```

**Step 3: Test visually**

Create todos with different priorities, verify badges appear correctly.

**Step 4: Commit**

```bash
git add js/todolist.js css/style.css
git commit -m "feat: display priority badge on todo items"
```

---

## Task 5: Add Click Handler to Cycle Priorities

**Files:**
- Modify: `js/todolist.js:511-640` (renderTodoTree method)

**Step 1: Add priority cycle method**

In `js/todolist.js`, add a new method to the `TodoList` class (add it after the `formatDueDate` method around line 1018):

```javascript
/**
 * Cycle todo priority
 */
async cycleTodoPriority(todoId) {
    const priorityOrder = ['none', 'low', 'medium', 'high'];
    const todo = this.todos.find(t => t.id === todoId);
    if (!todo) return;

    const currentPriority = todo.priority || 'none';
    const currentIndex = priorityOrder.indexOf(currentPriority);
    const nextIndex = (currentIndex + 1) % priorityOrder.length;
    const newPriority = priorityOrder[nextIndex];

    await this.todoDB.updateTodo(todoId, { priority: newPriority });
    await this.loadTodos();
    this.render();
}
```

**Step 2: Add click event listener in renderTodoTree**

In `js/todolist.js`, inside the `renderTodoTree` method, add the click handler for the priority badge. Find the section where event listeners are bound (around line 605) and add after the collapse button handler:

```javascript
// After the collapse button event handler (around line 612):

// Priority badge click handler
const priorityBadge = item.querySelector('.todo-priority-badge');
if (priorityBadge) {
    priorityBadge.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.cycleTodoPriority(todo.id);
    });
}
```

**Step 3: Test clicking priority badges**

1. Click on a todo's priority badge
2. Verify it cycles: ⚪无 → 🟡低 → 🟠中 → 🔴高 → ⚪无
3. Verify change persists after page refresh

**Step 4: Commit**

```bash
git add js/todolist.js
git commit -m "feat: add clickable priority badge to cycle priorities"
```

---

## Task 6: Handle Existing Todos Without Priority

**Files:**
- Modify: `js/todolist.js:159-178` (getAllTodos method)

**Step 1: Add default priority for existing todos**

In `js/todolist.js`, modify the `getAllTodos` method to ensure todos without priority field get a default:

```javascript
async getAllTodos() {
    return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([TODO_STORE_NAME], 'readonly');
        const store = transaction.objectStore(TODO_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const todos = request.result || [];
            // Add default priority for todos that don't have it
            todos.forEach(todo => {
                if (!todo.priority) {
                    todo.priority = 'none';
                }
            });
            // 未完成的在前，已完成的在后
            todos.sort((a, b) => {
                if (a.done === b.done) {
                    return new Date(b.createdAt) - new Date(a.createdAt);
                }
                return a.done ? 1 : -1;
            });
            resolve(todos);
        };
        request.onerror = () => reject(request.error);
    });
}
```

**Step 2: Test with existing data**

1. Open DevTools → Application → IndexedDB
2. Find a todo without the priority field (if any exist)
3. Refresh the page
4. Verify the todo displays with "⚪无" badge

**Step 5: Commit**

```bash
git add js/todolist.js
git commit -m "fix: handle existing todos without priority field"
```

---

## Task 7: Update CSS File Version

**Files:**
- Modify: `index.html:9` (CSS link)
- Modify: `index.html:609` (CSS link)

**Step 1: Bump CSS version**

Update the CSS file version to force cache refresh:

```html
<!-- Line 9, change: -->
<link rel="stylesheet" href="css/style.css?v=6.4">
<!-- To: -->
<link rel="stylesheet" href="css/style.css?v=6.5">

<!-- Line 609, change: -->
<link rel="stylesheet" href="css/style.css?v=6.4">
<!-- To: -->
<link rel="stylesheet" href="css/style.css?v=6.5">
```

**Step 2: Commit**

```bash
git add index.html
git commit -m "chore: bump CSS version to 6.5"
```

---

## Task 8: Update JS File Version

**Files:**
- Modify: `index.html:599-607` (JS script tags)

**Step 1: Bump JS version**

Update the JS file version to force cache refresh:

```html
<script src="js/utils.js?v=6.5"></script>
<script src="js/storage.js?v=6.5"></script>
<script src="js/todolist.js?v=6.6"></script>  <!-- Change from 6.5 to 6.6 -->
<script src="js/timeTracker.js?v=6.5"></script>
<script src="js/backup.js?v=6.5"></script>
<script src="js/reminder.js?v=6.5"></script>
<script src="js/habitTracker.js?v=6.5"></script>
<script src="js/calendar.js?v=6.5"></script>
<script src="js/app.js?v=6.6"></script>  <!-- Change from 6.5 to 6.6 -->
```

**Step 2: Commit**

```bash
git add index.html
git commit -m "chore: bump JS version for todolist and app"
```

---

## Task 9: Full Integration Testing

**Files:** N/A (manual testing)

**Step 1: Test complete flow**

1. Create a todo with each priority level (None, Low, Medium, High)
2. Verify each displays correct badge
3. Click badges to cycle through priorities
4. Refresh page - verify priorities persist
5. Check IndexedDB - verify priority field is stored
6. (If logged in) Trigger cloud sync, verify priority syncs

**Step 2: Test edge cases**

1. Create todo without selecting priority (should default to None)
2. Drag todos to reorder - verify priority doesn't affect order
3. Complete a high-priority todo - verify badge remains

**Step 3: Test cloud sync (if applicable)**

1. Login to cloud sync
2. Create a todo with priority
3. Sync to cloud
4. Check cloud data has priority field

**Step 4: Fix any issues found**

If bugs are found, create separate fix commits.

**Step 5: Create summary commit**

```bash
git add -A
git commit -m "feat: complete todo priority feature implementation

- Add 4-level priority system (None/Low/Medium/High)
- Priority selector in todo input form
- Clickable emoji badges to cycle priorities
- Automatic cloud sync of priority field
- Handle existing todos without priority

Closes #10"
```

---

## Verification Commands

```bash
# Run local server for testing
python -m http.server 8000
# or
npx serve

# Check git history
git log --oneline -10

# View IndexedDB
# Open DevTools → Application → IndexedDB → CalendarTodoDB → todos
```

---

## Notes

- Drag-and-drop reordering was already implemented - no changes needed for that part of issue #10
- Priority is purely visual/organizational - does NOT affect sort order
- Cloud sync automatically handles new priority field via existing uploadTodo() mechanism
