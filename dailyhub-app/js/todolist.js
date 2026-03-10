// 待办事项列表管理

const TODO_DB_NAME = 'CalendarTodoDB';
const TODO_STORE_NAME = 'todos';

/**
 * 待办事项数据库类
 */
class TodoDB {
    constructor() {
        this.db = null;
    }

    /**
     * 初始化数据库
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(TODO_DB_NAME, 1);

            request.onerror = () => {
                console.error('Todo数据库打开失败:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(TODO_STORE_NAME)) {
                    const store = db.createObjectStore(TODO_STORE_NAME, { keyPath: 'id' });
                    store.createIndex('done', 'done', { unique: false });
                }
            };
        });
    }

    /**
     * 添加待办事项
     */
    async addTodo(text, dueDate = null, parentId = null, position = null, reminder = null, priority = null) {
        // 计算position
        let finalPosition = position;
        if (finalPosition === null) {
            const allTodos = await this.getAllTodos();
            const siblings = allTodos.filter(t => t.parentId === parentId);
            finalPosition = siblings.length > 0 ? Math.max(...siblings.map(t => t.position || 0)) + 1 : 0;
        }

        const todo = {
            id: generateId(),
            text: text,
            done: false,
            dueDate: dueDate,
            parentId: parentId,
            position: finalPosition,
            reminder: reminder,
            priority: priority, // 'low', 'medium', 'high'
            createdAt: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([TODO_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(TODO_STORE_NAME);
            const request = store.add(todo);

            request.onsuccess = async () => {
                // 自动上传到云端
                if (db.cloudSync && db.cloudSync.isLoggedIn()) {
                    try {
                        const result = await db.cloudSync.uploadTodo(todo);
                        if (result && result.id) {
                            // 上传成功后，用云端返回的数据更新本地
                            // 这确保了本地和云端的 updated_at 时间戳一致
                            await this.addTodoWithoutSync(result);
                            resolve(result);
                        } else {
                            resolve(todo);
                        }
                    } catch (err) {
                        console.warn('自动上传待办失败:', err);
                        resolve(todo);
                    }
                } else {
                    resolve(todo);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 切换完成状态
     */
    async toggleTodo(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([TODO_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(TODO_STORE_NAME);

            store.get(id).onsuccess = async (event) => {
                const todo = event.target.result;
                todo.done = !todo.done;
                todo.updated_at = new Date().toISOString();
                store.put(todo).onsuccess = async () => {
                    // 自动上传到云端
                    if (db.cloudSync && db.cloudSync.isLoggedIn()) {
                        try {
                            const result = await db.cloudSync.uploadTodo(todo);
                            if (result && result.id) {
                                // 上传成功后，用云端返回的数据更新本地
                                await this.updateTodoWithoutSync(result);
                                resolve(result);
                            } else {
                                resolve(todo);
                            }
                        } catch (err) {
                            console.warn('自动上传待办失败:', err);
                            resolve(todo);
                        }
                    } else {
                        resolve(todo);
                    }
                };
            };
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * 删除待办事项
     */
    async deleteTodo(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([TODO_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(TODO_STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = async () => {
                // Log deletion for debugging
                console.log(`[TodoDB] Deleted todo: ${id}`);

                // 从云端删除
                if (db.cloudSync && db.cloudSync.isLoggedIn()) {
                    db.cloudSync.deleteTodo(id).catch(err => {
                        console.warn('云端删除待办失败:', err);
                    });
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 删除待办事项（不触发云端同步）
     * 用于处理服务端同步的删除操作
     */
    async deleteTodoWithoutSync(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([TODO_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(TODO_STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => {
                console.log(`[TodoDB] Deleted todo without sync: ${id}`);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取所有待办事项
     */
    async getAllTodos() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([TODO_STORE_NAME], 'readonly');
            const store = transaction.objectStore(TODO_STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const todos = request.result || [];
                // 排序：未完成的在前，已完成的在后
                // 同层级按 position 排序，根级任务在前
                todos.sort((a, b) => {
                    // 1. 首先按完成状态：未完成在前
                    if (a.done !== b.done) {
                        return a.done ? 1 : -1;
                    }
                    // 2. 同一完成状态，按 parentId 分组
                    if (a.parentId !== b.parentId) {
                        // 根级任务在前
                        if (a.parentId === null) return -1;
                        if (b.parentId === null) return 1;
                        return 0;
                    }
                    // 3. 同层级按 position 排序
                    const posA = a.position || 0;
                    const posB = b.position || 0;
                    return posA - posB;
                });
                resolve(todos);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 根据ID获取待办事项
     */
    async getTodoById(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([TODO_STORE_NAME], 'readonly');
            const store = transaction.objectStore(TODO_STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 删除所有已完成的待办事项
     */
    async deleteCompletedTodos() {
        const allTodos = await this.getAllTodos();
        const completedTodos = allTodos.filter(t => t.done);

        for (const todo of completedTodos) {
            await this.deleteTodo(todo.id);
        }

        return completedTodos.length;
    }

    /**
     * 添加待办事项（不自动触发渲染，用于同步）
     */
    async addTodoWithoutSync(todo) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([TODO_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(TODO_STORE_NAME);

            // 确保字段名称一致
            const todoData = {
                id: todo.id,
                text: todo.text,
                done: todo.done,
                dueDate: todo.dueDate || null,
                parentId: todo.parentId || null,
                position: todo.position || 0,
                reminder: todo.reminder || null,
                priority: todo.priority || null,
                createdAt: todo.createdAt,
                updated_at: todo.updated_at
            };

            // 首先检查是否已存在（防止重复添加）
            const checkRequest = store.get(todo.id);
            checkRequest.onsuccess = () => {
                const existing = checkRequest.result;

                if (existing) {
                    // 已存在，更新
                    const request = store.put(todoData);
                    request.onsuccess = () => resolve(todo);
                    request.onerror = () => reject(request.error);
                } else {
                    // 不存在，添加
                    const request = store.add(todoData);
                    request.onsuccess = () => resolve(todo);
                    request.onerror = () => reject(request.error);
                }
            };

            checkRequest.onerror = () => reject(checkRequest.error);
        });
    }

    /**
     * 更新待办事项（不自动触发渲染，用于同步）
     */
    async updateTodoWithoutSync(todo) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([TODO_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(TODO_STORE_NAME);

            // 确保字段名称一致
            const todoData = {
                id: todo.id,
                text: todo.text,
                done: todo.done,
                dueDate: todo.dueDate || null,
                parentId: todo.parentId || null,
                position: todo.position || 0,
                reminder: todo.reminder || null,
                priority: todo.priority || null,
                createdAt: todo.createdAt,
                updated_at: todo.updated_at
            };

            const request = store.put(todoData);

            request.onsuccess = () => resolve(todo);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 更新待办事项
     */
    async updateTodo(id, updates) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([TODO_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(TODO_STORE_NAME);

            store.get(id).onsuccess = async (event) => {
                const todo = event.target.result;
                Object.assign(todo, updates);
                todo.updated_at = new Date().toISOString();
                store.put(todo).onsuccess = async () => {
                    // 自动上传到云端
                    if (db.cloudSync && db.cloudSync.isLoggedIn()) {
                        try {
                            const result = await db.cloudSync.uploadTodo(todo);
                            if (result && result.id) {
                                // 保留本地 priority，避免被云端数据覆盖（云端没有 priority 字段）
                                result.priority = todo.priority;
                                await this.updateTodoWithoutSync(result);
                                resolve(result);
                            } else {
                                resolve(todo);
                            }
                        } catch (err) {
                            console.warn('自动上传待办失败:', err);
                            resolve(todo);
                        }
                    } else {
                        resolve(todo);
                    }
                };
            };
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * 更新待办事项的父任务
     */
    async updateTodoParent(id, parentId, position) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([TODO_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(TODO_STORE_NAME);

            store.get(id).onsuccess = async (event) => {
                const todo = event.target.result;
                todo.parentId = parentId;
                todo.position = position;
                todo.updated_at = new Date().toISOString();
                store.put(todo).onsuccess = async () => {
                    // 自动上传到云端
                    if (db.cloudSync && db.cloudSync.isLoggedIn()) {
                        try {
                            const result = await db.cloudSync.uploadTodo(todo);
                            if (result && result.id) {
                                // 上传成功后，用云端返回的数据更新本地
                                await this.updateTodoWithoutSync(result);
                                resolve(result);
                            } else {
                                resolve(todo);
                            }
                        } catch (err) {
                            console.warn('自动上传待办失败:', err);
                            resolve(todo);
                        }
                    } else {
                        resolve(todo);
                    }
                };
            };
            transaction.onerror = () => reject(transaction.error);
        });
    }
}

/**
 * 待办事项列表UI类
 */
class TodoList {
    constructor() {
        this.todoDB = new TodoDB();
        this.todos = [];
        this.collapsed = new Set(); // 存储折叠的父任务ID
        this.completedCollapsed = localStorage.getItem('todo_completed_collapsed') === 'true'; // 已完成区域折叠状态
        this.draggedItem = null;

        // 移动端触摸拖拽相关
        this.touchDraggedItem = null;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchElementClone = null;
        this.touchDropTarget = null;
        this.isTouchDragging = false;
    }

    /**
     * 初始化
     */
    async init() {
        await this.todoDB.init();
        await this.loadTodos();
        this.render();
    }

    /**
     * 加载待办事项
     */
    async loadTodos() {
        this.todos = await this.todoDB.getAllTodos();
    }

    /**
     * 渲染列表
     */
    render() {
        const container = document.getElementById('todoListContainer');
        const btnClearCompleted = document.getElementById('btnClearCompleted');

        if (!container) return;

        container.innerHTML = '';

        if (this.todos.length === 0) {
            container.innerHTML = '<p class="todo-empty">暂无待办事项</p>';
            if (btnClearCompleted) {
                btnClearCompleted.style.display = 'none';
            }
            return;
        }

        // 分离未完成和已完成的待办事项
        const pendingTodos = this.todos.filter(t => !t.done);
        const completedTodos = this.todos.filter(t => t.done);

        // 渲染未完成的待办事项
        if (pendingTodos.length > 0) {
            const pendingTree = this.buildFilteredTree(pendingTodos);
            this.renderTodoTree(container, pendingTree, 0);
        }

        // 渲染分隔线和已完成区域
        if (completedTodos.length > 0) {
            // 添加分隔线
            const divider = document.createElement('div');
            divider.className = 'todo-divider';
            container.appendChild(divider);

            // 添加已完成区域标题（可折叠）
            const completedHeader = document.createElement('div');
            completedHeader.className = 'todo-completed-header';
            completedHeader.dataset.collapsed = this.completedCollapsed;
            completedHeader.innerHTML = `
                <span class="todo-collapse-icon">${this.completedCollapsed ? '▶' : '▼'}</span>
                <span class="todo-completed-title">已完成 (${completedTodos.length})</span>
            `;
            container.appendChild(completedHeader);

            // 渲染已完成的待办事项（如果未折叠）
            if (!this.completedCollapsed) {
                const completedTree = this.buildFilteredTree(completedTodos);
                this.renderTodoTree(container, completedTree, 0, true);
            }
        }

        // 显示/隐藏清除已完成按钮
        if (btnClearCompleted) {
            if (completedTodos.length > 0) {
                btnClearCompleted.style.display = 'block';
            } else {
                btnClearCompleted.style.display = 'none';
            }
        }

        // 绑定折叠/展开事件
        this.bindCollapseEvents();
    }

    /**
     * 构建待办事项树
     */
    buildTodoTree() {
        const todoMap = new Map();
        const rootTodos = [];

        // 先创建所有节点的映射
        this.todos.forEach(todo => {
            todoMap.set(todo.id, { ...todo, children: [] });
        });

        // 构建树结构
        todoMap.forEach(todo => {
            if (todo.parentId && todoMap.has(todo.parentId)) {
                todoMap.get(todo.parentId).children.push(todo);
            } else {
                rootTodos.push(todo);
            }
        });

        return rootTodos;
    }

    /**
     * 构建过滤后的待办事项树（用于分离已完成和未完成）
     */
    buildFilteredTree(filteredTodos) {
        const todoMap = new Map();
        const rootTodos = [];
        const filteredIds = new Set(filteredTodos.map(t => t.id));

        // 先创建所有节点的映射
        filteredTodos.forEach(todo => {
            todoMap.set(todo.id, { ...todo, children: [] });
        });

        // 构建树结构（只包含在过滤列表中的节点）
        todoMap.forEach(todo => {
            // 检查父任务是否也在过滤列表中
            if (todo.parentId && filteredIds.has(todo.parentId) && todoMap.has(todo.parentId)) {
                todoMap.get(todo.parentId).children.push(todo);
            } else if (!todo.parentId || !filteredIds.has(todo.parentId)) {
                // 没有父任务，或父任务不在过滤列表中，作为根节点
                rootTodos.push(todo);
            }
        });

        return rootTodos;
    }

    /**
     * 递归渲染待办事项树
     */
    renderTodoTree(container, todos, level, isCompletedSection = false) {
        todos.forEach(todo => {
            const hasChildren = todo.children && todo.children.length > 0;
            const isCollapsed = this.collapsed.has(todo.id);

            const item = document.createElement('div');
            item.className = `todo-item ${todo.done ? 'done' : ''}${isCompletedSection ? ' completed-section' : ''}`;
            item.dataset.todoId = todo.id;
            item.dataset.level = level;
            item.style.paddingLeft = `${level * 20 + 8}px`;

            // 检查是否过期
            const isOverdue = !todo.done && todo.dueDate && this.isOverdue(todo.dueDate);
            if (isOverdue) {
                item.classList.add('overdue');
            }

            // 拖拽属性
            item.draggable = true;
            item.dataset.parentId = todo.parentId || '';

            // 格式化截止日期显示
            let dueDateHtml = '';
            if (todo.dueDate) {
                const dueDateClass = isOverdue ? 'todo-item-due-date overdue' : 'todo-item-due-date';
                dueDateHtml = `<span class="${dueDateClass}">📅 ${this.formatDueDate(todo.dueDate)}</span>`;
            }

            // 优先级显示
            const priority = todo.priority || null;
            const priorityLabels = { 'high': '🔴 高', 'medium': '🟠 中', 'low': '🟢 低', 'null': '⚪ 无' };
            const priorityClass = priority ? priority : 'none';
            const priorityHtml = `<span class="todo-item-priority ${priorityClass}" data-todo-id="${todo.id}" data-current-priority="${priority || ''}" title="点击修改优先级">${priorityLabels[priority]}</span>`;

            // 折叠按钮
            const collapseHtml = hasChildren
                ? `<button class="todo-collapse" data-id="${todo.id}">${isCollapsed ? '▶' : '▼'}</button>`
                : '<span class="todo-collapse-placeholder"></span>';

            item.innerHTML = `
                ${collapseHtml}
                <input type="checkbox" class="todo-checkbox" ${todo.done ? 'checked' : ''}>
                <span class="todo-text">${this.escapeHtml(todo.text)}</span>
                ${priorityHtml}
                ${dueDateHtml}
                <button class="todo-delete" title="删除">×</button>
            `;

            // 拖拽事件
            item.addEventListener('dragstart', (e) => {
                this.handleDragStart(e, todo);
            });
            item.addEventListener('dragend', (e) => {
                this.handleDragEnd(e);
            });
            item.addEventListener('dragover', (e) => {
                this.handleDragOver(e);
            });
            item.addEventListener('drop', (e) => {
                this.handleDrop(e, todo);
            });
            item.addEventListener('dragleave', (e) => {
                this.handleDragLeave(e);
            });

            // 移动端触摸拖拽事件
            item.addEventListener('touchstart', (e) => {
                this.handleTouchStart(e, todo, item);
            }, { passive: false });
            item.addEventListener('touchmove', (e) => {
                this.handleTouchMove(e, todo);
            }, { passive: false });
            item.addEventListener('touchend', (e) => {
                this.handleTouchEnd(e, todo);
            });

            // 阻止子元素干扰拖拽
            const childElements = item.querySelectorAll('.todo-checkbox, .todo-delete, .todo-collapse, .todo-item-priority, button');
            childElements.forEach(el => {
                el.addEventListener('mousedown', (e) => e.stopPropagation());
            });

            // 双击待办文字进行行内编辑
            const todoText = item.querySelector('.todo-text');
            todoText.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.editTodoInline(item, todo);
            });

            // 点击日期进行修改
            const dueDateSpan = item.querySelector('.todo-item-due-date');
            if (dueDateSpan && todo.dueDate) {
                dueDateSpan.style.cursor = 'pointer';
                dueDateSpan.title = '点击修改截止日期';

                dueDateSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.editTodoDate(item, todo);
                });
            }

            // 点击优先级进行修改
            const prioritySpan = item.querySelector('.todo-item-priority');
            if (prioritySpan) {
                prioritySpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.cycleTodoPriority(todo.id);
                });
            }

            // 折叠按钮事件
            const collapseBtn = item.querySelector('.todo-collapse');
            if (collapseBtn) {
                collapseBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleCollapse(todo.id);
                });
            }

            // 复选框事件
            const checkbox = item.querySelector('.todo-checkbox');
            checkbox.addEventListener('change', async () => {
                await this.todoDB.toggleTodo(todo.id);
                await this.loadTodos();
                this.render();
            });

            // 删除按钮事件
            const deleteBtn = item.querySelector('.todo-delete');
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('确定要删除这个待办事项吗？' + (hasChildren ? ' 子任务也会被删除。' : ''))) {
                    await this.deleteTodoRecursive(todo);
                    await this.loadTodos();
                    this.render();
                }
            });

            container.appendChild(item);

            // 递归渲染子任务
            if (hasChildren && !isCollapsed) {
                this.renderTodoTree(container, todo.children, level + 1, isCompletedSection);
            }
        });
    }

    /**
     * 递归删除待办事项及其子任务
     */
    async deleteTodoRecursive(todo) {
        if (todo.children) {
            for (const child of todo.children) {
                await this.deleteTodoRecursive(child);
            }
        }
        await this.todoDB.deleteTodo(todo.id);
    }

    /**
     * 切换折叠状态
     */
    toggleCollapse(todoId) {
        if (this.collapsed.has(todoId)) {
            this.collapsed.delete(todoId);
        } else {
            this.collapsed.add(todoId);
        }
        this.render();
    }

    /**
     * 切换已完成区域的折叠状态
     */
    toggleCompletedCollapsed() {
        this.completedCollapsed = !this.completedCollapsed;
        localStorage.setItem('todo_completed_collapsed', this.completedCollapsed);
        this.render();
    }

    /**
     * 绑定折叠/展开事件
     */
    bindCollapseEvents() {
        const completedHeaders = document.querySelectorAll('.todo-completed-header');
        completedHeaders.forEach(header => {
            // 移除旧的监听器（如果存在）
            const oldHandler = header._collapseHandler;
            if (oldHandler) {
                header.removeEventListener('click', oldHandler);
            }

            // 添加新的监听器
            const handler = () => {
                this.toggleCompletedCollapsed();
            };
            header._collapseHandler = handler;
            header.addEventListener('click', handler);
        });
    }

    /**
     * 拖拽开始
     */
    handleDragStart(e, todo) {
        this.draggedItem = todo;
        e.target.classList.add('dragging');

        // 修改 effectAllowed 为 copy，允许跨组件拖拽
        e.dataTransfer.effectAllowed = 'copy';

        // 传递待办数据
        e.dataTransfer.setData('application/x-todo', JSON.stringify({
            id: todo.id,
            text: todo.text,
            dueDate: todo.dueDate
        }));

        // 保留原有的数据用于待办列表内部拖拽
        e.dataTransfer.setData('text/plain', todo.id);
    }

    /**
     * 拖拽结束
     */
    handleDragEnd(e) {
        e.target.classList.remove('dragging');
        document.querySelectorAll('.todo-item.drag-over, .drag-over-child, .drag-over-sibling').forEach(el => {
            el.classList.remove('drag-over', 'drag-over-child', 'drag-over-sibling');
        });
        this.draggedItem = null;
    }

    /**
     * 拖拽经过
     */
    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();

        const targetItem = e.target.closest('.todo-item');
        const draggingItem = document.querySelector('.todo-item.dragging');

        if (!targetItem || targetItem === draggingItem) {
            return;
        }

        // 根据鼠标位置显示不同的高亮效果
        const rect = targetItem.getBoundingClientRect();
        const relX = e.clientX - rect.left;

        // 使用 40% 分割点，左侧40%为同级区域，右侧60%为子任务区域
        const splitPoint = rect.width * 0.4;

        // 清除当前目标的其他高亮类（避免重复添加）
        const isSibling = relX < splitPoint;

        // 只有当状态改变时才更新类名（避免闪烁）
        if (isSibling && !targetItem.classList.contains('drag-over-sibling')) {
            targetItem.classList.remove('drag-over-child');
            targetItem.classList.add('drag-over-sibling');
        } else if (!isSibling && !targetItem.classList.contains('drag-over-child')) {
            targetItem.classList.remove('drag-over-sibling');
            targetItem.classList.add('drag-over-child');
        }
    }

    /**
     * 拖拽离开
     */
    handleDragLeave(e) {
        const targetItem = e.target.closest('.todo-item');
        if (targetItem && !targetItem.contains(e.relatedTarget)) {
            targetItem.classList.remove('drag-over', 'drag-over-child', 'drag-over-sibling');
        }
    }

    /**
     * 放置
     */
    async handleDrop(e, targetTodo) {
        e.preventDefault();
        e.stopPropagation();

        const targetItem = e.target.closest('.todo-item');
        if (targetItem) {
            targetItem.classList.remove('drag-over', 'drag-over-child', 'drag-over-sibling');
        }

        if (!this.draggedItem || this.draggedItem.id === targetTodo.id) {
            return;
        }

        // 检查是否会导致循环引用（目标是否是拖拽项的后代）
        if (this.isDescendant(this.draggedItem.id, targetTodo.id)) {
            showToast('不能将父任务拖到其子任务下', 'error');
            return;
        }

        // 根据鼠标位置决定是作为子任务还是同级任务
        const rect = targetItem.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const splitPoint = rect.width * 0.4; // 40% 位置分割

        let newParentId;
        let newPosition;
        let message;

        if (relX < splitPoint) {
            // 左侧60%：作为同级任务（放在目标任务之后）
            newParentId = targetTodo.parentId;
            const siblings = this.todos.filter(t => t.parentId === newParentId);
            const targetIndex = siblings.findIndex(t => t.id === targetTodo.id);
            newPosition = targetIndex + 1;
            message = '已移至同级任务';
        } else {
            // 右侧40%：作为子任务
            newParentId = targetTodo.id;
            const children = this.todos.filter(t => t.parentId === newParentId);
            newPosition = children.length;
            message = '已移至子任务';
        }

        // 更新拖拽项的父任务和位置
        await this.todoDB.updateTodoParent(this.draggedItem.id, newParentId, newPosition);

        // 重新加载待办事项，确保 position 重新整理使用最新数据
        await this.loadTodos();

        // 重新整理同级待办的 position，确保连续
        await this.reorganizePositions(newParentId);

        // 再次加载以保存重新整理后的 position
        await this.loadTodos();
        this.render();
        showToast(message);
    }

    /**
     * 重新整理同级待办的 position，确保连续 (0, 1, 2, 3...)
     */
    async reorganizePositions(parentId) {
        // 获取所有同级待办（包括刚移动的项）
        const siblings = this.todos
            .filter(t => t.parentId === parentId)
            .sort((a, b) => (a.position || 0) - (b.position || 0));

        // 重新分配连续的位置
        for (let i = 0; i < siblings.length; i++) {
            const todo = siblings[i];
            if (todo.position !== i) {
                todo.position = i;
                await this.todoDB.updateTodoWithoutSync(todo);
            }
        }
    }

    /**
     * 检查是否为后代
     */
    isDescendant(ancestorId, descendantId) {
        const descendant = this.todos.find(t => t.id === descendantId);
        if (!descendant || !descendant.parentId) return false;
        if (descendant.parentId === ancestorId) return true;
        return this.isDescendant(ancestorId, descendant.parentId);
    }

    /**
     * 添加待办事项
     */
    async addTodo(text, dueDate = null, parentId = null) {
        if (!text.trim()) return;
        await this.todoDB.addTodo(text.trim(), dueDate, parentId);
        await this.loadTodos();
        this.render();
    }

    /**
     * 添加待办事项（带提醒）
     */
    async addTodoWithReminder(text, dueDate = null, reminder = null, parentId = null, priority = null) {
        if (!text.trim()) return;
        await this.todoDB.addTodo(text.trim(), dueDate, parentId, null, reminder, priority);
        await this.loadTodos();
        this.render();
    }

    /**
     * 清除已完成的待办事项
     */
    async clearCompleted() {
        const count = await this.todoDB.deleteCompletedTodos();
        await this.loadTodos();
        this.render();
        return count;
    }

    /**
     * 获取已完成待办事项数量
     */
    getCompletedCount() {
        return this.todos.filter(t => t.done).length;
    }

    /**
     * 转义HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 检查是否过期
     * @param {string} dueDate - YYYY-MM-DD 格式
     * @returns {boolean}
     */
    isOverdue(dueDate) {
        const today = formatDate(new Date());
        return dueDate < today;
    }

    /**
     * 行内编辑待办文字
     */
    editTodoInline(todoItem, todo) {
        const textSpan = todoItem.querySelector('.todo-text');
        const currentText = todo.text;

        // 创建输入框
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentText;
        input.className = 'todo-inline-edit';

        // 替换元素
        textSpan.replaceWith(input);
        input.focus();
        input.select();

        // 保存函数
        const save = async () => {
            const newText = input.value.trim() || currentText;
            if (newText !== currentText) {
                await this.todoDB.updateTodo(todo.id, { text: newText });
                await this.loadTodos();
            }
            this.render();
        };

        // 取消函数
        const cancel = () => {
            this.render();
        };

        // 事件处理
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });
    }

    /**
     * 编辑待办截止日期
     */
    editTodoDate(todoItem, todo) {
        // 创建日期输入框
        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.style.position = 'fixed';
        dateInput.style.opacity = '0.01';  // 几乎不可见但浏览器认为可见
        dateInput.style.pointerEvents = 'auto';

        // 获取被点击的日期元素位置，将 input 定位到该位置
        const dueDateSpan = todoItem.querySelector('.todo-item-due-date');
        if (dueDateSpan) {
            const rect = dueDateSpan.getBoundingClientRect();
            dateInput.style.left = rect.left + 'px';
            dateInput.style.top = rect.top + 'px';
            dateInput.style.width = Math.max(rect.width, 100) + 'px';
            dateInput.style.height = Math.max(rect.height, 30) + 'px';
            dateInput.style.fontSize = '16px';  // 确保移动端正确缩放
        }

        document.body.appendChild(dateInput);

        // 设置当前日期
        if (todo.dueDate) {
            dateInput.value = todo.dueDate;
        }

        // 确保布局完成后触发日期选择器
        requestAnimationFrame(() => {
            dateInput.showPicker ? dateInput.showPicker() : dateInput.click();
        });

        // 日期变化后保存
        const handleChange = async () => {
            const newDate = dateInput.value;
            await this.todoDB.updateTodo(todo.id, { dueDate: newDate || null });
            await this.loadTodos();
            this.render();
            cleanup();
        };

        const cleanup = () => {
            dateInput.removeEventListener('change', handleChange);
            dateInput.removeEventListener('blur', handleBlur);
            if (document.body.contains(dateInput)) {
                document.body.removeChild(dateInput);
            }
        };

        const handleBlur = () => {
            // 延迟清理，确保 change 事件先触发
            setTimeout(cleanup, 100);
        };

        dateInput.addEventListener('change', handleChange);
        dateInput.addEventListener('blur', handleBlur);
    }

    /**
     * 循环修改待办优先级
     * null -> low -> medium -> high -> null
     */
    async cycleTodoPriority(todoId) {
        // 从最新数据中获取 todo 对象
        const todo = this.todos.find(t => t.id === todoId);
        if (!todo) return;

        const priorityCycle = [null, 'low', 'medium', 'high'];
        const currentPriority = todo.priority || null;
        const currentIndex = priorityCycle.indexOf(currentPriority);
        const nextIndex = (currentIndex + 1) % priorityCycle.length;
        const newPriority = priorityCycle[nextIndex];

        await this.todoDB.updateTodo(todo.id, { priority: newPriority });
        await this.loadTodos();
        this.render();
    }

    /**
     * 格式化截止日期显示
     * @param {string} dueDate - YYYY-MM-DD 格式
     * @returns {string}
     */
    formatDueDate(dueDate) {
        const today = formatDate(new Date());
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = formatDate(tomorrow);

        if (dueDate === today) {
            return '今天';
        } else if (dueDate === tomorrowStr) {
            return '明天';
        } else {
            // 格式化为 MM月DD日
            const date = new Date(dueDate + 'T00:00:00');
            return `${date.getMonth() + 1}月${date.getDate()}日`;
        }
    }

    /**
     * 移动端触摸开始
     */
    handleTouchStart(e, todo, item) {
        // 只处理主触摸点
        if (e.touches.length !== 1) return;

        // 检查是否点击了按钮或复选框
        const target = e.target;
        if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' ||
            target.closest('button') || target.closest('input')) {
            return;
        }

        // 长按开始拖拽（300ms后）
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.touchDraggedItem = todo;

        // 设置长按定时器
        this.longPressTimer = setTimeout(() => {
            this.isTouchDragging = true;
            this.createTouchDragClone(item, e.touches[0]);
        }, 200);
    }

    /**
     * 创建触摸拖拽克隆元素
     */
    createTouchDragClone(item, touch) {
        const rect = item.getBoundingClientRect();
        this.touchElementClone = item.cloneNode(true);
        this.touchElementClone.style.position = 'fixed';
        this.touchElementClone.style.left = rect.left + 'px';
        this.touchElementClone.style.top = rect.top + 'px';
        this.touchElementClone.style.width = rect.width + 'px';
        this.touchElementClone.style.height = rect.height + 'px';
        this.touchElementClone.style.zIndex = '1000';
        this.touchElementClone.style.opacity = '0.8';
        this.touchElementClone.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
        this.touchElementClone.style.pointerEvents = 'none';
        this.touchElementClone.classList.add('dragging');
        document.body.appendChild(this.touchElementClone);

        // 添加震动反馈
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }

        // 隐藏原元素
        item.style.opacity = '0.3';
    }

    /**
     * 移动端触摸移动
     */
    handleTouchMove(e, todo) {
        if (!this.isTouchDragging || !this.touchElementClone) {
            // 检查是否移动距离过大，取消长按
            const touch = e.touches[0];
            const moveX = Math.abs(touch.clientX - this.touchStartX);
            const moveY = Math.abs(touch.clientY - this.touchStartY);
            if (moveX > 10 || moveY > 10) {
                if (this.longPressTimer) {
                    clearTimeout(this.longPressTimer);
                    this.longPressTimer = null;
                }
            }
            return;
        }

        e.preventDefault();

        const touch = e.touches[0];
        const cloneRect = this.touchElementClone.getBoundingClientRect();

        // 更新克隆位置
        this.touchElementClone.style.left = (touch.clientX - cloneRect.width / 2) + 'px';
        this.touchElementClone.style.top = (touch.clientY - cloneRect.height / 2) + 'px';

        // 查找下方的待办项
        this.touchElementClone.style.display = 'none';
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        this.touchElementClone.style.display = '';

        this.touchDropTarget = elementBelow ? elementBelow.closest('.todo-item') : null;

        // 清除所有高亮
        document.querySelectorAll('.todo-item.drag-over-child, .todo-item.drag-over-sibling').forEach(el => {
            el.classList.remove('drag-over-child', 'drag-over-sibling');
        });

        // 高亮目标
        if (this.touchDropTarget && this.touchDropTarget.dataset.todoId !== this.touchDraggedItem.id) {
            const rect = this.touchDropTarget.getBoundingClientRect();
            const relX = touch.clientX - rect.left;
            const splitPoint = rect.width * 0.4;

            if (relX < splitPoint) {
                this.touchDropTarget.classList.add('drag-over-sibling');
            } else {
                this.touchDropTarget.classList.add('drag-over-child');
            }
        }
    }

    /**
     * 移动端触摸结束
     */
    async handleTouchEnd(e, todo) {
        // 清除长按定时器
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        if (!this.isTouchDragging) {
            return;
        }

        // 移除克隆元素
        if (this.touchElementClone) {
            document.body.removeChild(this.touchElementClone);
            this.touchElementClone = null;
        }

        // 恢复原元素透明度
        document.querySelectorAll('.todo-item').forEach(el => {
            el.style.opacity = '';
        });

        // 清除所有高亮
        document.querySelectorAll('.todo-item.drag-over-child, .todo-item.drag-over-sibling').forEach(el => {
            el.classList.remove('drag-over-child', 'drag-over-sibling');
        });

        // 处理放置
        if (this.touchDropTarget && this.touchDraggedItem) {
            const targetId = this.touchDropTarget.dataset.todoId;
            const targetTodo = this.findTodoById(targetId);

            if (targetTodo && targetTodo.id !== this.touchDraggedItem.id) {
                // 检查循环引用
                if (!this.isDescendant(this.touchDraggedItem.id, targetTodo.id)) {
                    const rect = this.touchDropTarget.getBoundingClientRect();
                    const touch = e.changedTouches[0];
                    const relX = touch.clientX - rect.left;
                    const splitPoint = rect.width * 0.4;

                    let newParentId;
                    let newPosition;
                    let message;

                    if (relX < splitPoint) {
                        // 作为同级任务
                        newParentId = targetTodo.parentId;
                        const siblings = this.todos.filter(t => t.parentId === newParentId);
                        const targetIndex = siblings.findIndex(t => t.id === targetTodo.id);
                        newPosition = targetIndex + 1;
                        message = '已移至同级任务';
                    } else {
                        // 作为子任务
                        newParentId = targetTodo.id;
                        const children = this.todos.filter(t => t.parentId === newParentId);
                        newPosition = children.length;
                        message = '已移至子任务';
                    }

                    await this.todoDB.updateTodoParent(this.touchDraggedItem.id, newParentId, newPosition);
                    // 重新加载待办事项，确保 position 重新整理使用最新数据
                    await this.loadTodos();
                    // 重新整理同级待办的 position，确保连续
                    await this.reorganizePositions(newParentId);
                    // 再次加载以保存重新整理后的 position
                    await this.loadTodos();
                    this.render();
                    showToast(message);
                } else {
                    showToast('不能将父任务拖到其子任务下', 'error');
                }
            }
        }

        // 重置状态
        this.isTouchDragging = false;
        this.touchDraggedItem = null;
        this.touchDropTarget = null;
    }

    /**
     * 根据ID查找待办事项
     */
    findTodoById(id) {
        const findInTree = (todos) => {
            for (const todo of todos) {
                if (todo.id === id) return todo;
                if (todo.children) {
                    const found = findInTree(todo.children);
                    if (found) return found;
                }
            }
            return null;
        };
        return findInTree(this.buildTodoTree());
    }
}

// 创建全局待办事项实例
const todoList = new TodoList();
