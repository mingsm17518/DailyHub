// 主应用逻辑

let calendar = null;
let isLoginMode = true; // true=登录, false=注册

/**
 * 初始化应用
 */
async function initApp() {
    // 初始化数据库
    await db.init();

    // 初始化本地备份
    await localBackup.init();

    // 初始化待办事项
    await todoList.init();

    // 初始化时间追踪器
    await timeTracker.init();

    // 初始化每日笔记模块
    await DailyNote.init();

    // 初始化提醒管理器
    await reminderManager.init();

    // 初始化邮件通知设置
    initEmailSettings();

    // 初始化文件夹备份（如果支持）
    if (FolderBackup.isSupported()) {
        await folderBackup.init();
    }

    // 创建日历实例
    calendar = new CalendarApp();
    calendar.render();

    // 确保全局可访问性（用于跨组件调用）
    window.calendar = calendar;
    window.todoList = todoList;
    window.timeTracker = timeTracker;
    window.reminderManager = reminderManager;
    window.habitTracker = new HabitTracker();
    await window.habitTracker.init();

    // 绑定事件
    bindEvents();

    // 初始化顶部导航（桌面端）
    initTopNavigation();

    // 注册Service Worker
    registerServiceWorker();

    // 检查是否是今天
    checkToday();

    // 更新云同步状态
    updateSyncStatus();

    // 如果已登录，自动同步
    const cloudSync = db.getCloudSync();
    if (cloudSync.isLoggedIn() && cloudSync.getCurrentAccountId()) {
        try {
            await performSync(false); // 静默同步
        } catch (err) {
            console.warn('自动同步失败:', err);
        }
    } else if (cloudSync.isLoggedIn()) {
        console.warn('[App] Logged in but account not loaded, skipping initial sync');
    }
}

/**
 * 绑定事件监听器
 */
function bindEvents() {
    // 月份导航
    const btnPrevMonth = document.getElementById('btnPrevMonth');
    const btnNextMonth = document.getElementById('btnNextMonth');
    const btnToday = document.getElementById('btnToday');

    if (btnPrevMonth) {
        btnPrevMonth.addEventListener('click', () => calendar.prevMonth());
    }

    if (btnNextMonth) {
        btnNextMonth.addEventListener('click', () => calendar.nextMonth());
    }

    if (btnToday) {
        btnToday.addEventListener('click', () => calendar.goToday());
    }

    // 添加日程按钮
    const btnAdd = document.getElementById('btnAdd');
    if (btnAdd) {
        btnAdd.addEventListener('click', () => openModal());
    }

    // 移动端添加日程按钮
    const btnAddInlineMobile = document.getElementById('btnAddInlineMobile');
    if (btnAddInlineMobile) {
        btnAddInlineMobile.addEventListener('click', () => openModalForDate(formatDate(calendar.selectedDate)));
    }

    // 模态框关闭
    const btnCloseModal = document.getElementById('btnCloseModal');
    const btnCancel = document.getElementById('btnCancel');
    const modal = document.getElementById('eventModal');

    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', closeModal);
    }

    if (btnCancel) {
        btnCancel.addEventListener('click', closeModal);
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    // 表单提交
    const eventForm = document.getElementById('eventForm');
    if (eventForm) {
        eventForm.addEventListener('submit', handleFormSubmit);
    }

    // 提醒设置复选框切换
    const eventReminderEnabled = document.getElementById('eventReminderEnabled');
    const eventReminderConfig = document.getElementById('eventReminderConfig');
    if (eventReminderEnabled && eventReminderConfig) {
        eventReminderEnabled.addEventListener('change', () => {
            eventReminderConfig.style.display = eventReminderEnabled.checked ? 'block' : 'none';
        });
    }

    // 删除按钮
    const btnDeleteEvent = document.getElementById('btnDeleteEvent');
    if (btnDeleteEvent) {
        btnDeleteEvent.addEventListener('click', handleDeleteEvent);
    }

    // 数据管理
    const btnDataMenu = document.getElementById('btnDataMenu');
    const dataModal = document.getElementById('dataModal');
    const btnCloseDataModal = document.getElementById('btnCloseDataModal');
    const btnExport = document.getElementById('btnExport');
    const btnImport = document.getElementById('btnImport');
    const importFile = document.getElementById('importFile');

    if (btnDataMenu) {
        btnDataMenu.addEventListener('click', async () => {
            dataModal.classList.add('active');
            // 加载备份列表
            loadBackupList();
            // 检查是否是管理员并加载邀请码列表
            await checkAdminAndLoadInvitations();
        });
    }

    if (btnCloseDataModal) {
        btnCloseDataModal.addEventListener('click', () => {
            dataModal.classList.remove('active');
        });
    }

    if (dataModal) {
        dataModal.addEventListener('click', (e) => {
            if (e.target === dataModal) {
                dataModal.classList.remove('active');
            }
        });
    }

    // 选项卡切换
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            switchTab(tabName);
        });
    });

    // 导出按钮点击事件 - 显示下拉菜单
    if (btnExport) {
        btnExport.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = document.getElementById('exportDropdown');
            dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        });
    }

    // 导出选项点击事件
    const exportAll = document.getElementById('exportAll');
    const exportTimeCSV = document.getElementById('exportTimeCSV');
    const exportTimeMDTable = document.getElementById('exportTimeMDTable');
    const exportTimeMDList = document.getElementById('exportTimeMDList');

    if (exportAll) {
        exportAll.addEventListener('click', exportAllData);
    }
    if (exportTimeCSV) {
        exportTimeCSV.addEventListener('click', exportTimeEntriesCSV);
    }
    if (exportTimeMDTable) {
        exportTimeMDTable.addEventListener('click', exportTimeEntriesMarkdownTable);
    }
    if (exportTimeMDList) {
        exportTimeMDList.addEventListener('click', exportTimeEntriesMarkdownList);
    }

    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', () => {
        const dropdown = document.getElementById('exportDropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    });

    // 阻止下拉菜单内部点击关闭菜单
    const exportDropdown = document.getElementById('exportDropdown');
    if (exportDropdown) {
        exportDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    if (btnImport) {
        btnImport.addEventListener('click', () => {
            importFile.click();
        });
        importFile.addEventListener('change', importData);
    }

    // 备份列表刷新按钮
    const btnRefreshBackups = document.getElementById('btnRefreshBackups');
    if (btnRefreshBackups) {
        btnRefreshBackups.addEventListener('click', loadBackupList);
    }

    // 备份查看模态框
    const btnCloseBackupView = document.getElementById('btnCloseBackupView');
    const backupViewModal = document.getElementById('backupViewModal');

    if (btnCloseBackupView) {
        btnCloseBackupView.addEventListener('click', () => {
            backupViewModal.classList.remove('active');
        });
    }

    if (backupViewModal) {
        backupViewModal.addEventListener('click', (e) => {
            if (e.target === backupViewModal) {
                backupViewModal.classList.remove('active');
            }
        });
    }

    // 文件夹备份相关
    if (FolderBackup.isSupported()) {
        const btnChangeFolder = document.getElementById('btnChangeFolder');
        const btnClearFolder = document.getElementById('btnClearFolder');

        if (btnChangeFolder) {
            btnChangeFolder.addEventListener('click', () => folderBackup.selectFolder());
        }

        if (btnClearFolder) {
            btnClearFolder.addEventListener('click', () => folderBackup.clearFolder());
        }
    }

    // 待办事项相关
    const todoInput = document.getElementById('todoInput');
    const btnAddTodo = document.getElementById('btnAddTodo');
    const btnClearCompleted = document.getElementById('btnClearCompleted');
    const btnTodoDatePicker = document.getElementById('btnTodoDatePicker');
    const todoDueDateDisplay = document.getElementById('todoDueDateDisplay');
    const todoDueDate = document.getElementById('todoDueDate');

    if (todoInput) {
        // 自动调整输入框高度
        const autoResize = () => {
            todoInput.style.height = 'auto';
            todoInput.style.height = Math.min(todoInput.scrollHeight, 120) + 'px';
        };
        todoInput.addEventListener('input', autoResize);

        todoInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAddTodo();
            }
        });
    }

    if (btnAddTodo) {
        btnAddTodo.addEventListener('click', handleAddTodo);
    }

    if (btnClearCompleted) {
        btnClearCompleted.addEventListener('click', handleClearCompleted);
    }

    // 日历日期选择事件
    if (todoDueDate && todoDueDateDisplay) {
        // 日期选择后更新显示
        todoDueDate.addEventListener('change', () => {
            if (todoDueDate.value) {
                const date = new Date(todoDueDate.value + 'T00:00:00');
                const month = date.getMonth() + 1;
                const day = date.getDate();
                todoDueDateDisplay.value = `${month}月${day}日`;
                todoDueDateDisplay.style.color = 'var(--primary-color)';
                todoDueDateDisplay.style.borderColor = 'var(--primary-color)';
                // 显示提醒设置
                const reminderSettings = document.getElementById('todoReminderSettings');
                if (reminderSettings) reminderSettings.style.display = 'flex';
            } else {
                todoDueDateDisplay.value = '';
                todoDueDateDisplay.placeholder = '无截止日期';
                todoDueDateDisplay.style.color = 'var(--text-secondary)';
                todoDueDateDisplay.style.borderColor = 'var(--border-color)';
                // 隐藏提醒设置
                const reminderSettings = document.getElementById('todoReminderSettings');
                if (reminderSettings) reminderSettings.style.display = 'none';
            }
        });

        // 显示输入框点击也触发日期选择
        if (todoDueDateDisplay) {
            todoDueDateDisplay.addEventListener('click', () => {
                todoDueDate.showPicker ? todoDueDate.showPicker() : todoDueDate.click();
            });
        }
    }

    // 云同步相关
    const btnSync = document.getElementById('btnSync');
    if (btnSync) {
        btnSync.addEventListener('click', handleSyncClick);
    }

    // 登录/注册模态框
    const btnCloseAuthModal = document.getElementById('btnCloseAuthModal');
    const btnCancelAuth = document.getElementById('btnCancelAuth');
    const btnToggleAuthMode = document.getElementById('btnToggleAuthMode');
    const authModal = document.getElementById('authModal');
    const authForm = document.getElementById('authForm');

    if (btnCloseAuthModal) {
        btnCloseAuthModal.addEventListener('click', closeAuthModal);
    }

    if (btnCancelAuth) {
        btnCancelAuth.addEventListener('click', closeAuthModal);
    }

    if (authModal) {
        authModal.addEventListener('click', (e) => {
            if (e.target === authModal) {
                closeAuthModal();
            }
        });
    }

    if (btnToggleAuthMode) {
        btnToggleAuthMode.addEventListener('click', toggleAuthMode);
    }

    if (authForm) {
        authForm.addEventListener('submit', handleAuthSubmit);
    }

    // 邀请码管理相关
    const btnGenerateCode = document.getElementById('btnGenerateCode');
    const btnCreateInviteCode = document.getElementById('btnCreateInviteCode');
    const btnRefreshInvitations = document.getElementById('btnRefreshInvitations');

    if (btnGenerateCode) {
        btnGenerateCode.addEventListener('click', generateInviteCode);
    }

    if (btnCreateInviteCode) {
        btnCreateInviteCode.addEventListener('click', handleCreateInviteCode);
    }

    if (btnRefreshInvitations) {
        btnRefreshInvitations.addEventListener('click', loadInvitationCodes);
    }

    // 移动端侧边栏切换
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (btnToggleSidebar && sidebar) {
        btnToggleSidebar.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            sidebarOverlay.classList.toggle('active');
        });

        // 点击日历网格关闭侧边栏
        document.getElementById('calendarGrid').addEventListener('click', () => {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });

        // 点击遮罩层关闭侧边栏
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => {
                sidebar.classList.remove('active');
                sidebarOverlay.classList.remove('active');
            });
        }
    }

    // 移动端底部Tab切换
    const bottomTabs = document.querySelectorAll('.tab-item');
    bottomTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;

            // 更新tab状态
            bottomTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // 切换内容显示
            const mainContent = document.querySelector('.main-content');
            const todoPanel = document.querySelector('.todo-panel');
            const timeTrackerPanel = document.querySelector('.time-tracker-panel');
            const habitPanel = document.querySelector('.habit-panel');

            if (tabName === 'calendar') {
                mainContent.classList.add('active');
                todoPanel.classList.remove('active');
                timeTrackerPanel.classList.remove('active');
                if (habitPanel) habitPanel.classList.remove('active');
                // 隐藏计时视图容器（移动端需要）
                const timerView = document.getElementById('timerView');
                if (timerView) timerView.classList.remove('active');
                // 隐藏笔记面板
                const notesPanel = document.getElementById('notesPanel');
                if (notesPanel) notesPanel.classList.remove('active');
            } else if (tabName === 'todos') {
                mainContent.classList.remove('active');
                todoPanel.classList.add('active');
                timeTrackerPanel.classList.remove('active');
                if (habitPanel) habitPanel.classList.remove('active');
                // 隐藏计时视图容器（移动端需要）
                const timerView = document.getElementById('timerView');
                if (timerView) timerView.classList.remove('active');
                // 隐藏笔记面板
                const notesPanel = document.getElementById('notesPanel');
                if (notesPanel) notesPanel.classList.remove('active');
            } else if (tabName === 'timer') {
                mainContent.classList.remove('active');
                todoPanel.classList.remove('active');
                timeTrackerPanel.classList.add('active');
                if (habitPanel) habitPanel.classList.remove('active');
                // 隐藏笔记面板
                const notesPanel = document.getElementById('notesPanel');
                if (notesPanel) notesPanel.classList.remove('active');
                // 显示计时视图容器（移动端需要）
                const timerView = document.getElementById('timerView');
                if (timerView) timerView.classList.add('active');
                // 刷新时间追踪器显示
                timeTracker.render();
            } else if (tabName === 'habits') {
                mainContent.classList.remove('active');
                todoPanel.classList.remove('active');
                timeTrackerPanel.classList.remove('active');
                // 隐藏计时视图容器（移动端需要）
                const timerView = document.getElementById('timerView');
                if (timerView) timerView.classList.remove('active');
                // 隐藏笔记面板
                const notesPanel = document.getElementById('notesPanel');
                if (notesPanel) notesPanel.classList.remove('active');
                if (habitPanel) {
                    habitPanel.classList.add('active');
                    // 初始化习惯追踪器（如果还没有初始化）
                    if (!window.habitTracker) {
                        window.habitTracker = new HabitTracker();
                        window.habitTracker.init();
                    }
                }
            } else if (tabName === 'notes') {
                mainContent.classList.remove('active');
                todoPanel.classList.remove('active');
                timeTrackerPanel.classList.remove('active');
                if (habitPanel) habitPanel.classList.remove('active');
                // 隐藏计时视图容器（移动端需要）
                const timerView = document.getElementById('timerView');
                if (timerView) timerView.classList.remove('active');
                // 显示笔记面板
                const notesPanel = document.getElementById('notesPanel');
                if (notesPanel) {
                    notesPanel.classList.add('active');
                    // 初始化移动端笔记
                    if (window.MobileNotes && window.MobileNotes.init) {
                        window.MobileNotes.init();
                    }
                }
            }
        });
    });

    // 初始化：默认显示日历tab
    if (window.innerWidth <= 768) {
        const calendarTab = document.querySelector('.tab-item[data-tab="calendar"]');
        if (calendarTab) {
            calendarTab.click();
        }
    }
}

/**
 * 打开添加/编辑模态框
 * @param {Object} event
 */
function openModal(event = null) {
    const modal = document.getElementById('eventModal');
    const modalTitle = document.getElementById('modalTitle');
    const eventForm = document.getElementById('eventForm');
    const btnDelete = document.getElementById('btnDeleteEvent');

    // 重置表单
    eventForm.reset();

    if (event) {
        // 编辑模式
        modalTitle.textContent = '编辑日程';
        document.getElementById('eventId').value = event.id;
        document.getElementById('eventTitle').value = event.title;
        document.getElementById('eventDate').value = event.date;
        document.getElementById('eventStartTime').value = event.startTime || '';
        document.getElementById('eventEndTime').value = event.endTime || '';
        document.getElementById('eventDescription').value = event.description || '';

        // 加载提醒设置
        if (event.reminder) {
            document.getElementById('eventReminderEnabled').checked = event.reminder.enabled !== false;
            document.getElementById('eventReminderTime').value = event.reminder.minutesBefore ?? 15;
        } else {
            // 没有设置提醒时，默认不启用
            document.getElementById('eventReminderEnabled').checked = false;
            // 保持 HTML 模板中的默认值（15分钟），无需额外设置
        }

        btnDelete.style.display = 'block';
    } else {
        // 添加模式
        modalTitle.textContent = '添加日程';
        document.getElementById('eventId').value = '';

        // 设置默认日期为选中的日期
        if (calendar) {
            const dateStr = formatDate(calendar.selectedDate);
            document.getElementById('eventDate').value = dateStr;
        }

        // 默认提醒设置
        document.getElementById('eventReminderEnabled').checked = false;
        document.getElementById('eventReminderTime').value = 15;

        btnDelete.style.display = 'none';
    }

    modal.classList.add('active');
}

/**
 * 为特定日期打开添加模态框
 * @param {string} dateStr
 */
function openModalForDate(dateStr) {
    openModal();
    document.getElementById('eventDate').value = dateStr;
}

/**
 * 关闭模态框
 */
function closeModal() {
    const modal = document.getElementById('eventModal');
    modal.classList.remove('active');
}

/**
 * 处理表单提交
 * @param {Event} e
 */
async function handleFormSubmit(e) {
    e.preventDefault();

    const eventId = document.getElementById('eventId').value;
    const now = new Date().toISOString();

    // 获取提醒设置
    const reminderEnabled = document.getElementById('eventReminderEnabled').checked;
    const reminderTime = parseInt(document.getElementById('eventReminderTime').value, 10);

    const eventData = {
        title: document.getElementById('eventTitle').value.trim(),
        date: document.getElementById('eventDate').value,
        startTime: document.getElementById('eventStartTime').value,
        endTime: document.getElementById('eventEndTime').value,
        description: document.getElementById('eventDescription').value.trim(),
        reminder: {
            enabled: reminderEnabled,
            minutesBefore: reminderTime,
            method: 'desktop'
        },
        updated_at: now
    };

    try {
        if (eventId) {
            // 更新
            eventData.id = eventId;
            await db.updateEvent(eventData);
            showToast('日程已更新');
        } else {
            // 添加
            eventData.id = generateId();
            eventData.createdAt = now;
            await db.addEvent(eventData);
            showToast('日程已添加');
        }

        closeModal();
        calendar.render();
        calendar.showEventsForDate(parseDate(eventData.date));
    } catch (err) {
        console.error('保存日程失败:', err);
        showToast('保存失败，请重试', 'error');
    }
}

/**
 * 处理删除日程
 */
async function handleDeleteEvent() {
    const eventId = document.getElementById('eventId').value;
    if (!eventId) return;

    if (!confirm('确定要删除这个日程吗？')) {
        return;
    }

    try {
        await db.deleteEvent(eventId);
        showToast('日程已删除');
        closeModal();
        calendar.render();
        calendar.showEventsForDate(calendar.selectedDate);
    } catch (err) {
        console.error('删除日程失败:', err);
        showToast('删除失败，请重试', 'error');
    }
}

/**
 * 导出所有数据为JSON格式（原有功能保持不变）
 */
async function exportAllData() {
    try {
        const events = await db.getAllEvents();
        const todos = await todoList.todoDB.getAllTodos();
        const timeEntries = await db.getAllTimeEntries();
        const timeTags = await db.getAllTimeTags();
        const now = new Date();
        const filename = `calendar_backup_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.json`;

        const exportData = {
            version: '1.0',
            exportDate: now.toISOString(),
            events: events,
            todos: todos,
            timeEntries: timeEntries,
            timeTags: timeTags
        };

        exportToFile(exportData, filename);
        showToast(`数据已导出：${events.length} 个日程，${todos.length} 个待办事项，${timeEntries.length} 条时间记录`);
    } catch (err) {
        console.error('导出失败:', err);
        showToast('导出失败', 'error');
    }
}

/**
 * 导出时间记录为CSV格式
 */
async function exportTimeEntriesCSV() {
    try {
        const entries = await db.getAllTimeEntries();
        const tags = await db.getAllTimeTags();

        if (!entries || entries.length === 0) {
            showToast('暂无时间记录可导出', 'error');
            return;
        }

        const csv = timeEntriesToCSV(entries, tags);
        const now = new Date();
        const filename = `time_entries_${formatDate(now)}.csv`;

        exportToCSV(csv, filename);
        showToast(`已导出 ${entries.length} 条时间记录`);
    } catch (err) {
        console.error('导出失败:', err);
        showToast('导出失败', 'error');
    }
}

/**
 * 导出时间记录为Markdown表格格式
 */
async function exportTimeEntriesMarkdownTable() {
    try {
        const entries = await db.getAllTimeEntries();
        const tags = await db.getAllTimeTags();

        if (!entries || entries.length === 0) {
            showToast('暂无时间记录可导出', 'error');
            return;
        }

        const content = timeEntriesToMarkdownTable(entries, tags);
        const now = new Date();
        const filename = `time_entries_${formatDate(now)}.md`;

        exportToMarkdown(content, filename);
        showToast(`已导出 ${entries.length} 条时间记录`);
    } catch (err) {
        console.error('导出失败:', err);
        showToast('导出失败', 'error');
    }
}

/**
 * 导出时间记录为Markdown列表格式
 */
async function exportTimeEntriesMarkdownList() {
    try {
        const entries = await db.getAllTimeEntries();
        const tags = await db.getAllTimeTags();

        if (!entries || entries.length === 0) {
            showToast('暂无时间记录可导出', 'error');
            return;
        }

        const content = timeEntriesToMarkdownList(entries, tags);
        const now = new Date();
        const filename = `time_entries_${formatDate(now)}.md`;

        exportToMarkdown(content, filename);
        showToast(`已导出 ${entries.length} 条时间记录`);
    } catch (err) {
        console.error('导出失败:', err);
        showToast('导出失败', 'error');
    }
}

/**
 * 导入数据
 * @param {Event} e
 */
async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const data = await readFile(file);

        // 检查文件格式
        if (!data.events || !Array.isArray(data.events)) {
            showToast('文件格式不正确', 'error');
            return;
        }

        // 询问用户是追加还是覆盖
        const mode = await askImportMode();

        if (mode === 'cancel') {
            e.target.value = '';
            return;
        }

        let eventsImported = 0;
        let todosImported = 0;

        // 如果选择覆盖，先清空现有数据
        if (mode === 'replace') {
            await db.clearAll();
            const allTodos = await todoList.todoDB.getAllTodos();
            for (const todo of allTodos) {
                await todoList.todoDB.deleteTodo(todo.id);
            }
        }

        // 导入日程
        eventsImported = await db.importEvents(data.events);

        // 导入待办事项（如果有）
        if (data.todos && Array.isArray(data.todos)) {
            for (const todo of data.todos) {
                try {
                    await todoList.todoDB.addTodoWithoutSync(todo);
                    todosImported++;
                } catch (err) {
                    console.error('导入待办事项失败:', todo, err);
                }
            }
        }

        // 导入时间标签（如果有）
        let timeTagsImported = 0;
        if (data.timeTags && Array.isArray(data.timeTags)) {
            for (const tag of data.timeTags) {
                try {
                    await db.addTimeTag(tag);
                    timeTagsImported++;
                } catch (err) {
                    console.warn('导入时间标签失败:', tag, err);
                }
            }
        }

        // 导入时间记录（如果有）
        let timeEntriesImported = 0;
        if (data.timeEntries && Array.isArray(data.timeEntries)) {
            for (const entry of data.timeEntries) {
                try {
                    await db.addTimeEntryWithoutSync(entry);
                    timeEntriesImported++;
                } catch (err) {
                    console.warn('导入时间记录失败:', entry, err);
                }
            }
        }

        let message = `成功导入 ${eventsImported} 个日程`;
        if (todosImported > 0) {
            message += `，${todosImported} 个待办事项`;
        }
        if (timeTagsImported > 0) {
            message += `，${timeTagsImported} 个时间标签`;
        }
        if (timeEntriesImported > 0) {
            message += `，${timeEntriesImported} 条时间记录`;
        }
        showToast(message);

        document.getElementById('dataModal').classList.remove('active');
        calendar.render();
        await todoList.loadTodos();
        todoList.render();

        // 刷新时间追踪器显示
        await timeTracker.loadHistory();
        timeTracker.renderHistory();
        await timeTracker.updateStats();
    } catch (err) {
        console.error('导入失败:', err);
        showToast('导入失败，请检查文件格式', 'error');
    }

    // 清空input，允许重复导入同一文件
    e.target.value = '';
}

/**
 * 询问导入模式
 * @returns {Promise<string>} 'append' | 'replace' | 'cancel'
 */
function askImportMode() {
    return new Promise((resolve) => {
        const result = prompt(
            '请选择导入模式：\n输入 1 - 追加（保留现有数据）\n输入 2 - 覆盖（清空后导入）\n输入其他或取消 - 取消导入'
        );

        if (result === '1') {
            resolve('append');
        } else if (result === '2') {
            resolve('replace');
        } else {
            resolve('cancel');
        }
    });
}

/**
 * 检查并高亮今天
 */
function checkToday() {
    const today = formatDate(new Date());
    const todayElement = document.querySelector(`[data-date="${today}"]`);
    if (todayElement) {
        todayElement.classList.add('is-today');
    }
}

/**
 * 注册Service Worker
 */
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => {})
            .catch(err => console.error('Service Worker注册失败:', err));
    }
}

/**
 * 处理同步按钮点击
 */
async function handleSyncClick() {
    const cloudSync = db.getCloudSync();

    if (!cloudSync.isLoggedIn()) {
        // 未登录，执行本地备份
        await performLocalBackup();
    } else {
        // 已登录，执行云同步（会同时本地备份）
        await performSync(true);
    }
}

/**
 * 执行本地备份
 */
async function performLocalBackup() {
    const btnSync = document.getElementById('btnSync');
    btnSync.classList.add('syncing');

    try {
        const allEvents = await db.getAllEvents();
        const allTodos = await todoList.todoDB.getAllTodos();

        // 保存到浏览器 IndexedDB
        await localBackup.saveBackup(allEvents, allTodos);

        // 如果选择了文件夹，也保存到文件夹
        if (folderBackup.directoryHandle) {
            await folderBackup.saveBackup(allEvents, allTodos);
        }

        showToast('本地备份成功');
        btnSync.classList.add('synced');
        setTimeout(() => btnSync.classList.remove('synced'), 2000);
    } catch (err) {
        console.error('本地备份失败:', err);
        showToast('备份失败: ' + err.message, 'error');
        btnSync.classList.add('error');
        setTimeout(() => btnSync.classList.remove('error'), 2000);
    } finally {
        btnSync.classList.remove('syncing');
    }
}

/**
 * 执行云同步
 * @param {boolean} showNotification 是否显示通知
 */
async function performSync(showNotification = true) {
    const cloudSync = db.getCloudSync();
    const btnSync = document.getElementById('btnSync');
    btnSync.classList.add('syncing');

    // CRITICAL: Ensure account is loaded before ANY sync operation
    if (!cloudSync.isLoggedIn()) {
        if (showNotification) showToast('请先登录', 'error');
        btnSync.classList.remove('syncing');
        return;
    }

    if (!cloudSync.getCurrentAccountId()) {
        console.warn('[Sync] Account not loaded, skipping sync');
        if (showNotification) showToast('账户加载中，请稍后重试', 'warning');
        btnSync.classList.remove('syncing');
        return;
    }

    try {
        const result = await db.biDirectionalSync();

        if (showNotification) {
            let message = `同步完成：日程(下载${result.downloaded}，上传${result.uploaded})`;
            if (result.todoDownloaded > 0 || result.todoUploaded > 0) {
                message += `，待办(下载${result.todoDownloaded}，上传${result.todoUploaded})`;
            }
            // 显示时间记录同步结果
            if (result.timeDownloaded > 0 || result.timeUploaded > 0) {
                message += `，时间记录(下载${result.timeDownloaded}，上传${result.timeUploaded})`;
            }
            showToast(message);
        }

        btnSync.classList.add('synced');
        setTimeout(() => btnSync.classList.remove('synced'), 2000);

        // 同步成功后，保存本地备份
        try {
            const allEvents = await db.getAllEvents();
            const allTodos = await todoList.todoDB.getAllTodos();

            // 保存到浏览器 IndexedDB
            await localBackup.saveBackup(allEvents, allTodos);

            // 同时保存到文件夹
            if (folderBackup.directoryHandle) {
                await folderBackup.saveBackup(allEvents, allTodos);
            }
        } catch (err) {
            console.warn('保存本地备份失败:', err);
        }

        // 重新渲染日历
        if (calendar) {
            calendar.render();
            calendar.showEventsForDate(calendar.selectedDate);
        }

        // 重新渲染待办事项列表
        await todoList.loadTodos();
        todoList.render();

        // 刷新时间追踪历史记录
        if (window.timeTracker) {
            await window.timeTracker.renderHistoryTab();
            await window.timeTracker.renderStatsTab();
        }

        // 刷新习惯追踪数据
        if (window.habitTracker) {
            await window.habitTracker.loadData();
            window.habitTracker.render();
        }
    } catch (err) {
        console.error('同步失败:', err);
        showToast('同步失败: ' + err.message, 'error');
        btnSync.classList.add('error');
        setTimeout(() => btnSync.classList.remove('error'), 2000);
    } finally {
        btnSync.classList.remove('syncing');
        updateSyncStatus();
    }
}

/**
 * 更新同步状态显示
 */
function updateSyncStatus() {
    const cloudSync = db.getCloudSync();
    const syncStatus = document.getElementById('syncStatus');
    const syncIcon = document.getElementById('syncIcon');
    const btnSync = document.getElementById('btnSync');

    if (syncStatus) {
        syncStatus.textContent = cloudSync.getSyncStatusText();
    }

    // 更新图标和按钮标题
    if (syncIcon) {
        if (cloudSync.isLoggedIn()) {
            syncIcon.textContent = '☁️';
            btnSync.title = '云同步';
        } else {
            syncIcon.textContent = '💾';
            btnSync.title = '本地备份';
        }
    }

    // 根据登录状态更新按钮样式
    if (btnSync) {
        if (cloudSync.isLoggedIn()) {
            btnSync.classList.remove('offline');
        } else {
            btnSync.classList.add('offline');
        }
    }

    // 更新登出按钮显示
    updateAccountSelector();
}

/**
 * 更新登出按钮显示
 */
function updateAccountSelector() {
    const cloudSync = db.getCloudSync();
    const accountStatusText = document.getElementById('accountStatusText');
    const accountActions = document.getElementById('accountActions');

    // 更新数据管理中的账号状态显示
    if (accountStatusText && accountActions) {
        if (cloudSync.isLoggedIn()) {
            accountStatusText.textContent = `已登录：${cloudSync.username}`;
            accountStatusText.classList.add('logged-in');
            accountActions.innerHTML = `
                <button class="btn-small" id="btnDataLogout">登出</button>
            `;

            // 添加登出按钮事件
            const btnDataLogout = document.getElementById('btnDataLogout');
            if (btnDataLogout) {
                btnDataLogout.addEventListener('click', handleLogout);
            }
        } else {
            accountStatusText.textContent = '未登录';
            accountStatusText.classList.remove('logged-in');
            accountActions.innerHTML = `
                <button class="btn-small" id="btnOpenAuthModal">登录账号</button>
            `;

            // 添加登录按钮事件
            const btnOpenAuthModal = document.getElementById('btnOpenAuthModal');
            if (btnOpenAuthModal) {
                btnOpenAuthModal.addEventListener('click', openAuthModal);
            }
        }
    }
}

/**
 * 登出当前账号
 */
async function handleLogout() {
    const cloudSync = db.getCloudSync();

    if (!confirm('确定要登出吗？')) {
        return;
    }

    cloudSync.logout();
    updateSyncStatus();
    showToast('已登出');

    // 重新加载日历数据
    if (calendar) {
        calendar.render();
        calendar.showEventsForDate(calendar.selectedDate);
    }
}

/**
 * 打开登录/注册对话框
 */
function openAuthModal() {
    const modal = document.getElementById('authModal');
    const title = document.getElementById('authModalTitle');
    const submitBtn = document.getElementById('btnAuthSubmit');
    const toggleBtn = document.getElementById('btnToggleAuthMode');
    const invitationCodeGroup = document.getElementById('invitationCodeGroup');
    const invitationCodeInput = document.getElementById('authInvitationCode');

    isLoginMode = true;
    title.textContent = '登录';
    submitBtn.textContent = '登录';
    toggleBtn.textContent = '没有账号？注册';

    // 确保邀请码字段在登录模式下隐藏
    invitationCodeGroup.style.display = 'none';
    invitationCodeInput.removeAttribute('required');

    modal.classList.add('active');
}

/**
 * 关闭登录/注册对话框
 */
function closeAuthModal() {
    const modal = document.getElementById('authModal');
    const form = document.getElementById('authForm');

    modal.classList.remove('active');
    form.reset();
}

/**
 * 切换登录/注册模式
 */
function toggleAuthMode() {
    const title = document.getElementById('authModalTitle');
    const submitBtn = document.getElementById('btnAuthSubmit');
    const toggleBtn = document.getElementById('btnToggleAuthMode');
    const invitationCodeGroup = document.getElementById('invitationCodeGroup');
    const invitationCodeInput = document.getElementById('authInvitationCode');

    isLoginMode = !isLoginMode;

    if (isLoginMode) {
        title.textContent = '登录';
        submitBtn.textContent = '登录';
        toggleBtn.textContent = '没有账号？注册';
        invitationCodeGroup.style.display = 'none';
        invitationCodeInput.removeAttribute('required');
    } else {
        title.textContent = '注册';
        submitBtn.textContent = '注册';
        toggleBtn.textContent = '已有账号？登录';
        invitationCodeGroup.style.display = 'block';
        invitationCodeInput.setAttribute('required', 'required');
    }
}

/**
 * 处理登录/注册表单提交
 */
async function handleAuthSubmit(e) {
    e.preventDefault();

    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value;
    const invitationCode = document.getElementById('authInvitationCode').value.trim();
    const cloudSync = db.getCloudSync();

    try {
        if (isLoginMode) {
            // 登录
            await cloudSync.login(username, password);
            showToast('登录成功');
        } else {
            // 注册
            await cloudSync.register(username, password, invitationCode);
            showToast('注册成功');
        }

        closeAuthModal();
        updateSyncStatus();

        // 登录后自动同步
        setTimeout(() => {
            performSync(true);
        }, 500);

    } catch (err) {
        console.error('认证失败:', err);
        showToast(err.message || (isLoginMode ? '登录失败' : '注册失败'), 'error');
    }
}

/**
 * 添加待办事项
 */
async function handleAddTodo() {
    const input = document.getElementById('todoInput');
    const dueDateInput = document.getElementById('todoDueDate');
    const dueDateDisplay = document.getElementById('todoDueDateDisplay');
    const reminderEnabled = document.getElementById('todoReminderEnabled');
    const reminderTime = document.getElementById('todoReminderTime');
    const priorityInput = document.querySelector('input[name="todoPriority"]:checked');

    const text = input.value.trim();
    const dueDate = dueDateInput.value || null;
    const priority = priorityInput ? (priorityInput.value || null) : null;

    if (!text) return;

    // 创建待办事项并添加提醒设置
    const reminder = dueDate ? {
        enabled: reminderEnabled ? reminderEnabled.checked : false,
        daysBefore: reminderTime ? parseInt(reminderTime.value, 10) : 1,
        method: 'desktop'
    } : null;

    await todoList.addTodoWithReminder(text, dueDate, reminder, null, priority);
    input.value = '';
    input.style.height = 'auto';
    dueDateInput.value = '';

    // 重置优先级选择
    if (priorityInput) {
        priorityInput.checked = false;
    }
    const defaultPriority = document.querySelector('input[name="todoPriority"][value=""]');
    if (defaultPriority) {
        defaultPriority.checked = true;
    }

    // 重置截止日期显示
    if (dueDateDisplay) {
        dueDateDisplay.value = '';
        dueDateDisplay.placeholder = '无截止日期';
        dueDateDisplay.style.color = 'var(--text-secondary)';
    }

    // 隐藏提醒设置
    const reminderSettings = document.getElementById('todoReminderSettings');
    if (reminderSettings) {
        reminderSettings.style.display = 'none';
    }
}

/**
 * 清除已完成的待办事项
 */
async function handleClearCompleted() {
    const completedCount = todoList.getCompletedCount();

    if (completedCount === 0) {
        showToast('没有已完成的待办事项');
        return;
    }

    if (!confirm(`确定要清除 ${completedCount} 个已完成的待办事项吗？`)) {
        return;
    }

    const count = await todoList.clearCompleted();
    showToast(`已清除 ${count} 个已完成事项`);
}

/**
 * 查看备份内容
 */
async function viewBackup(backupId) {
    try {
        const backup = await localBackup.restoreBackup(backupId);
        if (!backup) {
            showToast('备份不存在', 'error');
            return;
        }

        const date = new Date(backup.date);
        const dateStr = date.toLocaleString('zh-CN');

        document.getElementById('backupViewTitle').textContent = `备份内容 - ${dateStr}`;

        const content = document.getElementById('backupViewContent');

        let html = '';

        // 显示日程
        html += '<div class="backup-view-section">';
        html += `<h4>日程 (${backup.events?.length || 0})</h4>`;
        if (backup.events && backup.events.length > 0) {
            html += '<ul class="backup-view-list">';
            backup.events.forEach(event => {
                const timeStr = event.startTime ? `${event.startTime}-${event.endTime || ''}` : '全天';
                html += `
                    <li class="backup-view-item">
                        <div><strong>${escapeHtml(event.title)}</strong></div>
                        <div class="backup-view-item-date">${event.date} ${timeStr}</div>
                    </li>
                `;
            });
            html += '</ul>';
        } else {
            html += '<p style="color: var(--text-secondary); font-size: 13px;">暂无日程</p>';
        }
        html += '</div>';

        // 显示待办事项
        html += '<div class="backup-view-section">';
        html += `<h4>待办事项 (${backup.todos?.length || 0})</h4>`;
        if (backup.todos && backup.todos.length > 0) {
            html += '<ul class="backup-view-list">';
            backup.todos.forEach(todo => {
                html += `
                    <li class="backup-view-item">
                        <div class="backup-view-todo ${todo.done ? 'done' : ''}">
                            <span style="color: ${todo.done ? 'var(--success-color)' : 'var(--text-secondary)'}">
                                ${todo.done ? '☑' : '☐'}
                            </span>
                            <span class="backup-view-todo-text">${escapeHtml(todo.text)}</span>
                        </div>
                    </li>
                `;
            });
            html += '</ul>';
        } else {
            html += '<p style="color: var(--text-secondary); font-size: 13px;">暂无待办事项</p>';
        }
        html += '</div>';

        content.innerHTML = html;

        // 显示模态框
        document.getElementById('backupViewModal').classList.add('active');
    } catch (err) {
        console.error('查看备份失败:', err);
        showToast('查看失败: ' + err.message, 'error');
    }
}

/**
 * 加载备份列表
 */
async function loadBackupList() {
    const backupList = document.getElementById('backupList');
    if (!backupList) return;

    try {
        const backups = await localBackup.getAllBackups();

        if (backups.length === 0) {
            backupList.innerHTML = '<p class="backup-empty">暂无备份记录</p>';
            return;
        }

        backupList.innerHTML = '';
        backups.forEach(backup => {
            const date = new Date(backup.date);
            const dateStr = date.toLocaleString('zh-CN');
            const eventCount = backup.events ? backup.events.length : 0;
            const todoCount = backup.todos ? backup.todos.length : 0;

            const item = document.createElement('div');
            item.className = 'backup-item';
            item.innerHTML = `
                <div class="backup-item-info">
                    <div class="backup-item-date">${dateStr}</div>
                    <div class="backup-item-detail">${eventCount} 个日程，${todoCount} 个待办</div>
                </div>
                <div class="backup-item-actions">
                    <button class="backup-item-btn" onclick="viewBackup('${backup.id}')">查看</button>
                    <button class="backup-item-btn restore" onclick="restoreBackup('${backup.id}')">恢复</button>
                    <button class="backup-item-btn delete" onclick="deleteBackup('${backup.id}')">删除</button>
                </div>
            `;
            backupList.appendChild(item);
        });
    } catch (err) {
        console.error('加载备份列表失败:', err);
        backupList.innerHTML = '<p class="backup-empty">加载失败</p>';
    }
}

/**
 * 恢复备份
 */
async function restoreBackup(backupId) {
    if (!confirm('恢复备份会覆盖当前所有数据，确定要继续吗？')) {
        return;
    }

    try {
        const backup = await localBackup.restoreBackup(backupId);
        if (!backup) {
            showToast('备份不存在', 'error');
            return;
        }

        // 清空现有数据
        await db.clearAll();
        const allTodos = await todoList.todoDB.getAllTodos();
        for (const todo of allTodos) {
            await todoList.todoDB.deleteTodo(todo.id);
        }

        // 恢复日程
        for (const event of backup.events || []) {
            await db.addEventWithoutSync(event);
        }

        // 恢复待办事项
        for (const todo of backup.todos || []) {
            await todoList.todoDB.addTodoWithoutSync(todo);
        }

        showToast('备份已恢复');
        document.getElementById('dataModal').classList.remove('active');

        // 重新渲染
        if (calendar) {
            calendar.render();
            calendar.showEventsForDate(calendar.selectedDate);
        }
        await todoList.loadTodos();
        todoList.render();
    } catch (err) {
        console.error('恢复备份失败:', err);
        showToast('恢复失败: ' + err.message, 'error');
    }
}

/**
 * 下载备份为文件
 */
async function downloadBackup(backupId) {
    try {
        const backup = await localBackup.restoreBackup(backupId);
        if (!backup) {
            showToast('备份不存在', 'error');
            return;
        }

        const date = new Date(backup.date);
        const filename = `calendar_backup_${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}.json`;

        const exportData = {
            version: backup.version || '1.0',
            exportDate: backup.date,
            events: backup.events || [],
            todos: backup.todos || []
        };

        exportToFile(exportData, filename);
        showToast('备份已下载');
    } catch (err) {
        console.error('下载备份失败:', err);
        showToast('下载失败: ' + err.message, 'error');
    }
}

/**
 * 删除备份
 */
async function deleteBackup(backupId) {
    if (!confirm('确定要删除这个备份吗？')) {
        return;
    }

    try {
        await localBackup.deleteBackup(backupId);
        showToast('备份已删除');
        await loadBackupList();
    } catch (err) {
        console.error('删除备份失败:', err);
        showToast('删除失败: ' + err.message, 'error');
    }
}

/**
 * 切换选项卡
 * @param {string} tabName 选项卡名称
 */
function switchTab(tabName) {
    // 更新选项卡按钮状态
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 更新选项卡内容显示
    const backupTab = document.getElementById('backupTab');
    const invitationTab = document.getElementById('invitationTab');
    const emailTab = document.getElementById('emailTab');

    if (tabName === 'backup') {
        backupTab.style.display = 'block';
        invitationTab.style.display = 'none';
        if (emailTab) emailTab.style.display = 'none';
    } else if (tabName === 'invitation') {
        backupTab.style.display = 'none';
        invitationTab.style.display = 'block';
        if (emailTab) emailTab.style.display = 'none';
        // 加载邀请码列表
        loadInvitationCodes();
    } else if (tabName === 'email') {
        backupTab.style.display = 'none';
        invitationTab.style.display = 'none';
        if (emailTab) emailTab.style.display = 'block';
    }
}

/**
 * 检查是否是管理员并加载邀请码
 */
async function checkAdminAndLoadInvitations() {
    try {
        const isAdmin = await db.isAdmin();
        const invitationTabBtn = document.querySelector('.tab-btn[data-tab="invitation"]');

        if (isAdmin) {
            invitationTabBtn.style.display = 'block';
        } else {
            invitationTabBtn.style.display = 'none';
            // 如果当前在邀请码选项卡，切换回备份选项卡
            if (document.getElementById('invitationTab').style.display !== 'none') {
                switchTab('backup');
            }
        }
    } catch (err) {
        console.error('检查管理员状态失败:', err);
        // 出错时隐藏邀请码选项卡
        const invitationTabBtn = document.querySelector('.tab-btn[data-tab="invitation"]');
        invitationTabBtn.style.display = 'none';
    }
}

/**
 * 生成随机邀请码
 */
function generateInviteCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('inviteCode').value = code;
}

/**
 * 创建邀请码
 */
async function handleCreateInviteCode() {
    const code = document.getElementById('inviteCode').value.trim();
    const maxUses = parseInt(document.getElementById('maxUses').value) || 1;
    const expireDate = document.getElementById('expireDate').value;

    // 验证输入
    if (!code) {
        showToast('请输入邀请码或点击生成按钮', 'error');
        return;
    }

    if (code.length < 4) {
        showToast('邀请码至少需要4个字符', 'error');
        return;
    }

    const cloudSync = db.getCloudSync();
    if (!cloudSync.isLoggedIn()) {
        showToast('请先登录', 'error');
        return;
    }

    try {
        // 准备请求数据
        const requestData = {
            code: code,
            max_uses: maxUses
        };

        if (expireDate) {
            // 将日期转换为 ISO 格式（UTC 午夜）
            requestData.expires_at = new Date(expireDate + 'T23:59:59').toISOString();
        }

        const response = await fetch(`${API_BASE_URL}/invitation-codes`, {
            method: 'POST',
            headers: cloudSync.getAuthHeaders(),
            body: JSON.stringify(requestData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '创建失败');
        }

        showToast('邀请码创建成功');

        // 清空表单
        document.getElementById('inviteCode').value = '';
        document.getElementById('maxUses').value = '1';
        document.getElementById('expireDate').value = '';

        // 刷新列表
        await loadInvitationCodes();

    } catch (err) {
        console.error('创建邀请码失败:', err);
        showToast(err.message || '创建失败', 'error');
    }
}

/**
 * 加载邀请码列表
 */
async function loadInvitationCodes() {
    const listContainer = document.getElementById('invitationList');
    if (!listContainer) return;

    const cloudSync = db.getCloudSync();
    if (!cloudSync.isLoggedIn()) {
        listContainer.innerHTML = '<p class="invitation-empty">请先登录</p>';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/invitation-codes`, {
            method: 'GET',
            headers: cloudSync.getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error('获取邀请码列表失败');
        }

        const data = await response.json();
        const codes = data.codes || [];

        if (codes.length === 0) {
            listContainer.innerHTML = '<p class="invitation-empty">暂无邀请码</p>';
            return;
        }

        listContainer.innerHTML = '';
        codes.forEach(code => {
            const item = createInvitationItem(code);
            listContainer.appendChild(item);
        });

    } catch (err) {
        console.error('加载邀请码列表失败:', err);
        listContainer.innerHTML = '<p class="invitation-empty">加载失败</p>';
    }
}

/**
 * 创建邀请码列表项
 * @param {Object} code 邀请码数据
 * @returns {HTMLElement}
 */
function createInvitationItem(code) {
    const div = document.createElement('div');
    div.className = 'invitation-item';

    // 计算使用情况
    const usedCount = code.used_count || 0;
    const maxUses = code.max_uses || 1;
    const usageText = `${usedCount}/${maxUses} 次`;

    // 计算状态
    let statusText = '有效';
    let statusClass = 'valid';
    const now = new Date();

    if (code.expires_at && new Date(code.expires_at) < now) {
        statusText = '已过期';
        statusClass = 'expired';
    } else if (usedCount >= maxUses) {
        statusText = '已用完';
        statusClass = 'used-up';
    }

    // 格式化过期时间
    let expireText = '永不过期';
    if (code.expires_at) {
        const expireDate = new Date(code.expires_at);
        expireText = expireDate.toLocaleDateString('zh-CN');
    }

    div.innerHTML = `
        <div class="invitation-info">
            <div class="invitation-code">${escapeHtml(code.code)}</div>
            <div class="invitation-details">
                <span class="invitation-detail">${usageText}</span>
                <span class="invitation-detail">${expireText}</span>
                <span class="invitation-status ${statusClass}">${statusText}</span>
            </div>
        </div>
        <div class="invitation-actions">
            <button class="invitation-btn" onclick="deleteInvitationCode('${code.id}')">删除</button>
        </div>
    `;

    return div;
}

/**
 * 删除邀请码
 * @param {string} codeId 邀请码ID
 */
async function deleteInvitationCode(codeId) {
    if (!confirm('确定要删除这个邀请码吗？')) {
        return;
    }

    const cloudSync = db.getCloudSync();
    if (!cloudSync.isLoggedIn()) {
        showToast('请先登录', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/invitation-codes/${codeId}`, {
            method: 'DELETE',
            headers: cloudSync.getAuthHeaders()
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '删除失败');
        }

        showToast('邀请码已删除');
        await loadInvitationCodes();

    } catch (err) {
        console.error('删除邀请码失败:', err);
        showToast(err.message || '删除失败', 'error');
    }
}

// 将删除邀请码函数暴露到全局
window.deleteInvitationCode = deleteInvitationCode;

/**
 * 初始化邮件通知设置
 */
function initEmailSettings() {
    // 加载已保存的邮件设置
    const settings = emailSettings.getSettings();
    const emailConfig = localStorage.getItem('calendar_emailjs_config');

    if (emailConfig) {
        try {
            const config = JSON.parse(emailConfig);
            document.getElementById('emailjsServiceId').value = config.serviceId || '';
            document.getElementById('emailjsTemplateId').value = config.templateId || '';
            document.getElementById('emailjsPublicKey').value = config.publicKey || '';

            // 初始化 EmailJS
            if (window.reminderManager) {
                reminderManager.initEmailConfig(config);
            }
        } catch (e) {
            console.error('解析邮件配置失败:', e);
        }
    }

    // 填充通知设置
    document.getElementById('emailNotifyEnabled').checked = settings.enabled;
    document.getElementById('userEmail').value = settings.email;
    document.getElementById('emailReminderTime').value = settings.reminderMinutes;

    // 绑定保存配置按钮
    document.getElementById('btnSaveEmailConfig').addEventListener('click', saveEmailConfig);
    document.getElementById('btnClearEmailConfig').addEventListener('click', clearEmailConfig);

    // 绑定通知设置变更
    document.getElementById('emailNotifyEnabled').addEventListener('change', (e) => {
        emailSettings.updateSetting('enabled', e.target.checked);
        if (window.reminderManager) {
            reminderManager.setEmailEnabled(e.target.checked);
        }
        showToast('设置已保存', 'success');
    });

    document.getElementById('userEmail').addEventListener('change', (e) => {
        const email = e.target.value.trim();
        if (email && !isValidEmail(email)) {
            showToast('请输入有效的邮箱地址', 'error');
            return;
        }
        emailSettings.updateSetting('email', email);
        showToast('邮箱已保存', 'success');
    });

    document.getElementById('emailReminderTime').addEventListener('change', (e) => {
        emailSettings.updateSetting('reminderMinutes', parseInt(e.target.value));
        showToast('提醒时间已保存', 'success');
    });

    // 绑定测试邮件按钮
    document.getElementById('btnTestEmail').addEventListener('click', sendTestEmail);
}

/**
 * 验证邮箱格式
 */
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * 保存 EmailJS 配置
 */
async function saveEmailConfig() {
    const serviceId = document.getElementById('emailjsServiceId').value.trim();
    const templateId = document.getElementById('emailjsTemplateId').value.trim();
    const publicKey = document.getElementById('emailjsPublicKey').value.trim();

    if (!serviceId || !templateId || !publicKey) {
        showToast('请填写完整的 EmailJS 配置信息', 'error');
        return;
    }

    const config = { serviceId, templateId, publicKey };
    localStorage.setItem('calendar_emailjs_config', JSON.stringify(config));

    // 初始化 EmailJS
    if (window.reminderManager) {
        if (reminderManager.initEmailConfig(config)) {
            showToast('EmailJS 配置已保存', 'success');
        } else {
            showToast('EmailJS 初始化失败，请检查配置', 'error');
        }
    } else {
        showToast('配置已保存', 'success');
    }
}

/**
 * 清除 EmailJS 配置
 */
function clearEmailConfig() {
    if (!confirm('确定要清除 EmailJS 配置吗？')) {
        return;
    }

    localStorage.removeItem('calendar_emailjs_config');
    document.getElementById('emailjsServiceId').value = '';
    document.getElementById('emailjsTemplateId').value = '';
    document.getElementById('emailjsPublicKey').value = '';

    // 禁用邮件通知
    document.getElementById('emailNotifyEnabled').checked = false;
    emailSettings.updateSetting('enabled', false);
    if (window.reminderManager) {
        reminderManager.setEmailEnabled(false);
    }

    showToast('配置已清除', 'success');
}

/**
 * 发送测试邮件
 */
async function sendTestEmail() {
    const settings = emailSettings.getSettings();
    const email = document.getElementById('userEmail').value.trim();

    if (!email) {
        showToast('请先设置接收邮箱', 'error');
        return;
    }

    if (!isValidEmail(email)) {
        showToast('请输入有效的邮箱地址', 'error');
        return;
    }

    if (!window.reminderManager || !reminderManager.emailConfig) {
        showToast('请先配置 EmailJS', 'error');
        return;
    }

    try {
        const templateParams = {
            to_email: email,
            to_name: email.split('@')[0],
            event_title: '测试提醒',
            event_date: formatDateCN(formatDate(new Date())),
            event_time: '12:00',
            reminder_type: '这是一封测试邮件',
            description: '如果您收到此邮件，说明邮件通知配置成功！'
        };

        await emailjs.send(
            reminderManager.emailConfig.serviceId,
            reminderManager.emailConfig.templateId,
            templateParams
        );

        showToast('测试邮件已发送，请检查您的邮箱', 'success');
    } catch (error) {
        console.error('发送测试邮件失败:', error);
        showToast('发送失败，请检查配置: ' + error.message, 'error');
    }
}

// ========== 顶部导航切换（桌面端） ==========
/**
 * 初始化顶部导航
 */
function initTopNavigation() {
    const topNavItems = document.querySelectorAll('.nav-item');
    const scheduleView = document.getElementById('scheduleView');
    const timerView = document.getElementById('timerView');
    const habitsView = document.getElementById('habitsView');
    let currentView = 'schedule';

    // 视图缓存机制 - 避免重复渲染
    const viewCache = {
        schedule: { isRendered: true },
        timer: { isRendered: true },
        habits: { isRendered: false }
    };

    // 获取视图元素的辅助函数
    function getViewElement(viewName) {
        switch(viewName) {
            case 'schedule': return scheduleView;
            case 'timer': return timerView;
            case 'habits': return habitsView;
            default: return scheduleView;
        }
    }

    topNavItems.forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            if (view === currentView) return;

            // 更新导航状态
            topNavItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // 视图切换动画
            const currentViewEl = getViewElement(currentView);
            const nextViewEl = getViewElement(view);

            currentViewEl.classList.add('fade-out');

            setTimeout(() => {
                // Remove active class from current view (hides it via CSS)
                currentViewEl.classList.remove('active');
                currentViewEl.classList.remove('fade-out');

                // Add active class to next view (shows it via CSS)
                nextViewEl.classList.add('active');
                nextViewEl.classList.add('fade-in');

                setTimeout(() => {
                    nextViewEl.classList.remove('fade-in');
                }, 150);

                // 切换到习惯视图时，同步数据到桌面端习惯视图（仅首次）
                if (view === 'habits') {
                    document.body.classList.add('habits-view-active');
                    // 仅首次切换到习惯视图时执行DOM同步
                    if (!viewCache.habits.isRendered) {
                        syncHabitsToDesktopView();
                        viewCache.habits.isRendered = true;
                    }
                } else {
                    document.body.classList.remove('habits-view-active');
                }

                currentView = view;
            }, 150);
        });
    });
}

/**
 * 同步习惯数据到桌面端视图
 */
function syncHabitsToDesktopView() {
    if (!window.habitTracker) return;

    const desktopContainer = document.getElementById('habitsContainerDesktop');
    const mobileContainer = document.getElementById('habitsContainer');

    if (desktopContainer && mobileContainer) {
        desktopContainer.innerHTML = mobileContainer.innerHTML;

        // 重新绑定桌面端习惯卡片的事件
        bindDesktopHabitEvents();
    }
}

/**
 * 绑定桌面端习惯卡片的事件
 */
function bindDesktopHabitEvents() {
    const desktopContainer = document.getElementById('habitsContainerDesktop');
    if (!desktopContainer) return;

    // 绑定打卡按钮 - 修正选择器
    desktopContainer.querySelectorAll('.btn-checkin').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const habitId = e.currentTarget.dataset.habitId;
            if (window.habitTracker) {
                window.habitTracker.checkin(habitId, new Date().toISOString().split('T')[0]);
                syncHabitsToDesktopView();
            }
        });
    });

    // 绑定编辑按钮 - 修正选择器
    desktopContainer.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const habitId = e.currentTarget.dataset.habitId;
            const habit = window.habitTracker.habits.find(h => h.id === habitId);
            if (habit) {
                window.habitTracker.showHabitModal(habit);
            }
        });
    });

    // 绑定删除按钮 - 修正选择器
    desktopContainer.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const habitId = e.currentTarget.dataset.habitId;
            if (window.habitTracker) {
                window.habitTracker.confirmDeleteHabit(habitId);
            }
        });
    });

    // 绑定热力图格子点击事件
    const heatmapCells = desktopContainer.querySelectorAll('.heatmap-day-mini.clickable');
    heatmapCells.forEach(cell => {
        cell.addEventListener('click', (e) => {
            const habitId = e.target.dataset.habitId;
            const date = e.target.dataset.date;
            if (window.habitTracker && habitId && date) {
                window.habitTracker.toggleCheckin(habitId, date);
                // syncHabitsToDesktopView();  // 冗余调用，toggleCheckin已处理渲染
            }
        });
    });

    // 绑定热力图滑动事件（调用 HabitTracker 的方法）
    if (window.habitTracker) {
        window.habitTracker.bindHeatmapTouch(desktopContainer);
    }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// 将备份管理函数暴露到全局，供 HTML 调用
window.viewBackup = viewBackup;
window.restoreBackup = restoreBackup;
window.downloadBackup = downloadBackup;
window.deleteBackup = deleteBackup;

// 测试提醒功能
function testReminder() {
    console.log('手动触发提醒测试...');
    if (window.reminderManager) {
        reminderManager.triggerCheck();
    } else {
        console.error('reminderManager 未找到');
    }
}

// 使其在浏览器控制台可访问
window.testReminder = testReminder;
