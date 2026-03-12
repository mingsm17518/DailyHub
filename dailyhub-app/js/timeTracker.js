// 时间追踪模块

class TimeTracker {
    constructor() {
        this.isRunning = false;
        this.isStopped = false;  // 新增：表示计时器已停止但未保存
        this.startTime = null;
        this.endTime = null;
        this.duration = 0;
        this.timerInterval = null;
        this.currentTab = 'timer';  // timer | history | stats
        this.currentActivity = '';
        this.currentTagId = null;
        this.statsSelectedDate = formatDate(new Date());  // 默认显示当天
        this.historySelectedDate = null;  // null 表示显示所有记录
        this.calendarCurrentDate = new Date();  // 日历当前显示的月份

        // 默认快捷标签
        this.defaultTags = [
            { id: 'tag-work', name: '工作', emoji: '💼' },
            { id: 'tag-study', name: '学习', emoji: '📚' },
            { id: 'tag-code', name: '写代码', emoji: '💻' },
            { id: 'tag-exercise', name: '运动', emoji: '🏃' },
            { id: 'tag-reading', name: '阅读', emoji: '📖' },
            { id: 'tag-rest', name: '休息', emoji: '☕' },
            { id: 'tag-sleep', name: '睡觉', emoji: '😴' },
            { id: 'tag-game', name: '游戏', emoji: '🎮' }
        ];

        this.tags = [];
    }

    /**
     * 初始化
     */
    async init() {
        // 加载标签
        await this.loadTags();

        // 恢复计时器状态
        this.restoreTimerState();

        // 渲染界面
        this.render();

        // 绑定事件
        this.bindEvents();

        // 如果计时器正在运行，启动更新
        if (this.isRunning) {
            this.startTimerUpdate();
        }
    }

    /**
     * 加载标签
     */
    async loadTags() {
        try {
            const storedTags = await db.getAllTimeTags();
            if (storedTags.length > 0) {
                this.tags = storedTags;
            } else {
                // 初始化默认标签
                this.tags = [...this.defaultTags];
                for (const tag of this.tags) {
                    await db.addTimeTag(tag);
                }
            }
        } catch (err) {
            console.error('加载标签失败:', err);
            this.tags = [...this.defaultTags];
        }
    }

    /**
     * 恢复计时器状态
     */
    restoreTimerState() {
        const savedState = localStorage.getItem('timerState');
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                if (state.isRunning && state.startTime) {
                    this.isRunning = true;
                    this.startTime = state.startTime;
                    this.currentActivity = state.activity || '';
                    this.currentTagId = state.tagId || null;

                    // 更新UI状态
                    this.updateTimerUI();
                }
            } catch (err) {
                console.error('恢复计时器状态失败:', err);
                localStorage.removeItem('timerState');
            }
        }
    }

    /**
     * 保存计时器状态
     */
    saveTimerState() {
        const state = {
            isRunning: this.isRunning,
            startTime: this.startTime,
            activity: this.currentActivity,
            tagId: this.currentTagId
        };
        localStorage.setItem('timerState', JSON.stringify(state));
    }

    /**
     * 清除计时器状态
     */
    clearTimerState() {
        localStorage.removeItem('timerState');
    }

    /**
     * 开始计时
     */
    startTimer() {
        this.isRunning = true;
        this.isStopped = false;
        this.startTime = new Date().toISOString();

        const activityInput = document.getElementById('timerActivity');
        this.currentActivity = activityInput.value.trim();

        this.saveTimerState();
        this.startTimerUpdate();

        // 更新UI
        this.updateTimerUI();

        showToast('计时开始', 'success');
    }

    /**
     * 停止计时
     */
    stopTimer() {
        if (!this.isRunning) return;

        this.endTime = new Date().toISOString();
        this.duration = Math.floor((new Date(this.endTime) - new Date(this.startTime)) / 1000);
        this.isRunning = false;
        this.isStopped = true;

        // 停止更新
        this.stopTimerUpdate();

        // 更新计时器显示（保持最终时长）
        const timerTime = document.getElementById('timerTime');
        if (timerTime) {
            timerTime.textContent = formatDuration(this.duration);
        }

        // 清除运行状态
        this.clearTimerState();

        // 更新UI显示保存/放弃按钮
        this.updateTimerUI();

        // 聚焦到输入框
        const activityInput = document.getElementById('timerActivity');
        if (activityInput) {
            activityInput.focus();
            // 选中所有文本方便修改
            activityInput.select();
        }
    }

    /**
     * 保存记录
     */
    saveRecord() {
        if (!this.isStopped) return;

        const activityInput = document.getElementById('timerActivity');
        const activity = activityInput.value.trim() || '未命名';

        const entry = {
            id: generateId(),
            startTime: this.startTime,
            endTime: this.endTime,
            duration: this.duration,
            activity: activity,
            tagId: this.currentTagId,
            createdAt: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        db.addTimeEntry(entry).then(() => {
            showToast(`记录已保存：${formatDurationHuman(this.duration)}`, 'success');
        }).catch(err => {
            console.error('保存时间记录失败:', err);
            showToast('保存失败', 'error');
        });

        // 重置状态
        this.resetTimer();
    }

    /**
     * 放弃记录
     */
    discardRecord() {
        if (!this.isStopped) return;

        // 重置状态
        this.resetTimer();
        showToast('已放弃记录', 'info');
    }

    /**
     * 重置计时器状态
     */
    resetTimer() {
        this.isRunning = false;
        this.isStopped = false;
        this.startTime = null;
        this.endTime = null;
        this.duration = 0;
        this.currentActivity = '';
        this.currentTagId = null;

        this.clearTimerState();
        this.stopTimerUpdate();

        // 重置UI
        document.getElementById('timerTime').textContent = '00:00:00';
        document.getElementById('timerActivity').value = '';

        // 清除标签选中状态
        document.querySelectorAll('#quickTags .tag-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        this.updateTimerUI();

        // 刷新历史记录和统计
        if (this.currentTab === 'history') {
            this.renderHistoryTab();
        } else if (this.currentTab === 'stats') {
            this.renderStatsTab();
        }
    }

    /**
     * 更新计时器UI状态
     */
    updateTimerUI() {
        const btnStart = document.getElementById('btnStartTimer');
        const btnStop = document.getElementById('btnStopTimer');
        const saveActions = document.getElementById('timerSaveActions');
        const activityInput = document.getElementById('timerActivity');

        if (this.isRunning) {
            // 计时中：只显示停止按钮
            btnStart.style.display = 'none';
            btnStop.style.display = 'block';
            saveActions.style.display = 'none';
            activityInput.value = this.currentActivity;
        } else if (this.isStopped) {
            // 已停止未保存：显示保存/放弃按钮
            btnStart.style.display = 'none';
            btnStop.style.display = 'none';
            saveActions.style.display = 'flex';
            // 输入框保持原内容可编辑
        } else {
            // 空闲状态：只显示开始按钮
            btnStart.style.display = 'block';
            btnStop.style.display = 'none';
            saveActions.style.display = 'none';
        }
    }

    /**
     * 启动计时器更新
     */
    startTimerUpdate() {
        this.updateTimerDisplay();
        this.timerInterval = setInterval(() => {
            this.updateTimerDisplay();
        }, 1000);
    }

    /**
     * 停止计时器更新
     */
    stopTimerUpdate() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    /**
     * 更新计时器显示
     */
    updateTimerDisplay() {
        if (!this.startTime) return;

        const now = new Date();
        const start = new Date(this.startTime);
        const elapsed = Math.floor((now - start) / 1000);

        const timerTime = document.getElementById('timerTime');
        if (timerTime) {
            timerTime.textContent = formatDuration(elapsed);
        }
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 开始计时按钮
        const btnStart = document.getElementById('btnStartTimer');
        if (btnStart) {
            btnStart.addEventListener('click', () => this.startTimer());
        }

        // 停止计时按钮
        const btnStop = document.getElementById('btnStopTimer');
        if (btnStop) {
            btnStop.addEventListener('click', () => this.stopTimer());
        }

        // 保存记录按钮
        const btnSaveRecord = document.getElementById('btnSaveRecord');
        if (btnSaveRecord) {
            btnSaveRecord.addEventListener('click', () => this.saveRecord());
        }

        // 放弃记录按钮
        const btnDiscardRecord = document.getElementById('btnDiscardRecord');
        if (btnDiscardRecord) {
            btnDiscardRecord.addEventListener('click', () => this.discardRecord());
        }

        // 活动输入框
        const activityInput = document.getElementById('timerActivity');
        if (activityInput) {
            activityInput.addEventListener('input', (e) => {
                this.currentActivity = e.target.value.trim();
                if (this.isRunning) {
                    this.saveTimerState();
                }
            });

            // 回车保存（仅在已停止状态下）
            activityInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && this.isStopped) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.saveRecord();
                }
            });

            // 额外添加 keyup 事件作为备份
            activityInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter' && this.isStopped) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.saveRecord();
                }
            });
        }

        // Tab切换
        const tabs = document.querySelectorAll('.tracker-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // 统计日期选择器 - 自定义日期选择器
        this.initDatePicker();

        // 绑定统计日期导航按钮
        const btnStatsPrev = document.getElementById('btnStatsPrev');
        if (btnStatsPrev) {
            btnStatsPrev.addEventListener('click', () => this.navigateStatsDate(-1));
        }

        const btnStatsNext = document.getElementById('btnStatsNext');
        if (btnStatsNext) {
            btnStatsNext.addEventListener('click', () => this.navigateStatsDate(1));
        }

        const btnStatsToday = document.getElementById('btnStatsToday');
        if (btnStatsToday) {
            btnStatsToday.addEventListener('click', () => this.goToStatsToday());
        }

        // 绑定历史记录日期导航按钮
        const btnHistoryPrev = document.getElementById('btnHistoryPrev');
        if (btnHistoryPrev) {
            btnHistoryPrev.addEventListener('click', () => this.navigateHistoryDate(-1));
        }

        const btnHistoryNext = document.getElementById('btnHistoryNext');
        if (btnHistoryNext) {
            btnHistoryNext.addEventListener('click', () => this.navigateHistoryDate(1));
        }

        const btnHistoryToday = document.getElementById('btnHistoryToday');
        if (btnHistoryToday) {
            btnHistoryToday.addEventListener('click', () => this.goToHistoryToday());
        }

        const btnHistoryAll = document.getElementById('btnHistoryAll');
        if (btnHistoryAll) {
            btnHistoryAll.addEventListener('click', () => this.showAllHistory());
        }
    }

    /**
     * 导航统计日期
     */
    navigateStatsDate(delta) {
        const current = new Date(this.statsSelectedDate);
        current.setDate(current.getDate() + delta);
        this.statsSelectedDate = formatDate(current);
        this.updateDateDisplay();
        this.renderStatsTab();
    }

    /**
     * 跳转到今天的统计
     */
    goToStatsToday() {
        this.statsSelectedDate = formatDate(new Date());
        this.updateDateDisplay();
        this.renderStatsTab();
    }

    /**
     * 导航历史记录日期
     */
    navigateHistoryDate(delta) {
        const today = formatDate(new Date());
        let current = this.historySelectedDate ? new Date(this.historySelectedDate) : new Date();

        // 如果没有选择日期，默认从今天开始导航
        if (!this.historySelectedDate) {
            current = new Date(today);
        }

        current.setDate(current.getDate() + delta);
        this.historySelectedDate = formatDate(current);
        this.updateHistoryDateDisplay();
        this.renderHistoryTab();
    }

    /**
     * 跳转到今天的历史记录
     */
    goToHistoryToday() {
        this.historySelectedDate = formatDate(new Date());
        this.updateHistoryDateDisplay();
        this.renderHistoryTab();
    }

    /**
     * 显示全部历史记录
     */
    showAllHistory() {
        this.historySelectedDate = null;
        this.updateHistoryDateDisplay();
        this.renderHistoryTab();
    }

    /**
     * 更新历史记录日期显示
     */
    updateHistoryDateDisplay() {
        const historyDateInput = document.getElementById('historyDateInput');
        if (historyDateInput) {
            historyDateInput.value = this.historySelectedDate || '';
        }
    }

    /**
     * 初始化内置日期选择器
     */
    initDatePicker() {
        const statsDateInput = document.getElementById('statsDateInput');

        if (statsDateInput) {
            // 设置初始值为当前选中日期
            statsDateInput.value = this.statsSelectedDate;

            // 监听日期变化
            statsDateInput.addEventListener('change', (e) => {
                this.statsSelectedDate = e.target.value;
                this.renderStatsTab();
            });
        }

        // 历史记录日期选择器
        const historyDateInput = document.getElementById('historyDateInput');
        if (historyDateInput) {
            // 设置初始值为今天（如果没有选择特定日期则为空）
            historyDateInput.value = this.historySelectedDate || '';

            // 监听日期变化
            historyDateInput.addEventListener('change', (e) => {
                this.historySelectedDate = e.target.value || null;
                this.renderHistoryTab();
            });
        }
    }

    /**
     * 更新日期显示
     */
    updateDateDisplay() {
        // 更新日期输入框的值
        const statsDateInput = document.getElementById('statsDateInput');
        if (statsDateInput) {
            statsDateInput.value = this.statsSelectedDate;
        }
    }

    /**
     * 切换Tab
     */
    switchTab(tabName) {
        this.currentTab = tabName;

        // 更新tab样式
        document.querySelectorAll('.tracker-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // 更新内容显示
        document.querySelectorAll('.tracker-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}Tab`);
        });

        // 渲染对应内容
        if (tabName === 'history') {
            this.renderHistoryTab();
        } else if (tabName === 'stats') {
            this.renderStatsTab();
        }
    }

    /**
     * 渲染界面
     */
    render() {
        this.renderQuickTags();
        this.renderTimerTab();
        this.renderHistoryTab();
        this.renderStatsTab();
    }

    /**
     * 渲染快捷标签
     */
    renderQuickTags() {
        const quickTagsContainer = document.getElementById('quickTags');
        if (!quickTagsContainer) return;

        quickTagsContainer.innerHTML = this.tags.map(tag => `
            <button class="tag-btn" data-tag-id="${tag.id}" title="${tag.name}">
                ${tag.emoji} ${tag.name}
            </button>
        `).join('');

        // 绑定标签点击事件
        quickTagsContainer.querySelectorAll('.tag-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tagId = btn.dataset.tagId;
                const tag = this.tags.find(t => t.id === tagId);
                if (tag) {
                    const activityInput = document.getElementById('timerActivity');
                    activityInput.value = tag.name;
                    this.currentActivity = tag.name;
                    this.currentTagId = tagId;

                    // 更新选中状态
                    quickTagsContainer.querySelectorAll('.tag-btn').forEach(b => {
                        b.classList.toggle('active', b.dataset.tagId === tagId);
                    });
                }
            });
        });
    }

    /**
     * 渲染计时器Tab
     */
    renderTimerTab() {
        // 更新UI状态
        this.updateTimerUI();

        // 更新活动输入
        const activityInput = document.getElementById('timerActivity');
        if (activityInput && this.currentActivity) {
            activityInput.value = this.currentActivity;
        }
    }

    /**
     * 渲染历史记录Tab
     */
    async renderHistoryTab() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;

        // 渲染增加记录按钮
        const addButtonHtml = `
            <div class="history-add-record-container">
                <button class="btn btn-primary history-add-btn" id="btnAddRecord">
                    ➕ 增加记录
                </button>
            </div>
        `;

        try {
            let entries = await db.getAllTimeEntries();

            // 根据选择的日期过滤记录
            if (this.historySelectedDate) {
                entries = entries.filter(e => e.startTime.startsWith(this.historySelectedDate));
            }

            if (entries.length === 0) {
                historyList.innerHTML = '<p class="empty-state">暂无记录</p>' + addButtonHtml;
                this.bindAddRecordButton();
                return;
            }

            // 按日期分组
            const grouped = this.groupEntriesByDate(entries);

            let html = '';
            for (const [date, dateEntries] of Object.entries(grouped)) {
                const dateLabel = this.formatDateLabel(date);
                html += `
                    <div class="history-date-group">
                        <div class="history-date-title">${dateLabel}</div>
                        ${dateEntries.map(entry => this.renderHistoryItem(entry)).join('')}
                    </div>
                `;
            }
            html += addButtonHtml;

            historyList.innerHTML = html;
            this.bindAddRecordButton();

            // 绑定删除事件
            historyList.querySelectorAll('.history-delete').forEach(btn => {
                btn.addEventListener('click', () => {
                    const entryId = btn.dataset.entryId;
                    this.deleteEntry(entryId);
                });
            });

            // 绑定编辑事件
            historyList.querySelectorAll('.history-edit').forEach(btn => {
                btn.addEventListener('click', () => {
                    const entryId = btn.dataset.entryId;
                    this.editEntry(entryId);
                });
            });

            // 滚动到最下方（最近的时间记录）
            historyList.scrollTop = historyList.scrollHeight;

        } catch (err) {
            console.error('加载历史记录失败:', err);
            historyList.innerHTML = '<p class="empty-state">加载失败</p>' + addButtonHtml;
            this.bindAddRecordButton();
        }
    }

    /**
     * 绑定增加记录按钮
     */
    bindAddRecordButton() {
        const btnAddRecord = document.getElementById('btnAddRecord');
        if (btnAddRecord) {
            btnAddRecord.addEventListener('click', () => this.showAddRecordForm());
        }
    }

    /**
     * 显示增加记录表单
     */
    showAddRecordForm() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;

        // 隐藏增加按钮，显示表单
        const addContainer = historyList.querySelector('.history-add-record-container');
        if (addContainer) {
            addContainer.style.display = 'none';
        }

        // 插入表单
        const formHtml = `
            <div class="history-add-form" id="addRecordForm">
                <div class="history-add-form-row">
                    <label>
                        <span class="history-add-icon">📅</span>
                        <input type="date" id="addRecordDate" value="${formatDate(new Date())}">
                    </label>
                </div>
                <div class="history-add-form-row">
                    <label>
                        <span class="history-add-icon">⏰</span>
                        <input type="time" id="addRecordStartTime" value="09:00">
                    </label>
                    <span class="history-add-separator">-</span>
                    <label>
                        <input type="time" id="addRecordEndTime" value="12:00">
                    </label>
                </div>
                <div class="history-add-form-actions">
                    <button class="btn btn-primary" id="btnSaveManualEntry">保存</button>
                    <button class="btn btn-secondary" id="btnCancelAddRecord">取消</button>
                </div>
            </div>
        `;

        // 在历史记录列表开头插入表单
        historyList.insertAdjacentHTML('afterbegin', formHtml);

        // 绑定按钮事件
        document.getElementById('btnSaveManualEntry').addEventListener('click', () => this.saveManualEntry());
        document.getElementById('btnCancelAddRecord').addEventListener('click', () => this.cancelAddRecord());

        // 聚焦到日期输入
        document.getElementById('addRecordDate').focus();
    }

    /**
     * 保存手动录入的记录
     */
    async saveManualEntry() {
        const dateStr = document.getElementById('addRecordDate').value;
        const startStr = document.getElementById('addRecordStartTime').value;
        const endStr = document.getElementById('addRecordEndTime').value;

        // 验证必填
        if (!dateStr || !startStr || !endStr) {
            showToast('请填写完整的时间信息', 'error');
            return;
        }

        // 验证时间有效性
        const startDateTime = new Date(`${dateStr}T${startStr}`);
        const endDateTime = new Date(`${dateStr}T${endStr}`);
        const duration = Math.floor((endDateTime - startDateTime) / 1000);

        if (duration <= 0) {
            showToast('结束时间必须晚于开始时间', 'error');
            return;
        }

        // 创建记录
        const entry = {
            id: generateId(),
            startTime: startDateTime.toISOString(),
            endTime: endDateTime.toISOString(),
            duration: duration,
            activity: '未命名',
            tagId: null,
            createdAt: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        try {
            await db.addTimeEntry(entry);
            showToast('记录已添加', 'success');
            this.renderHistoryTab();
            this.renderStatsTab();
        } catch (err) {
            console.error('保存时间记录失败:', err);
            showToast('保存失败', 'error');
        }
    }

    /**
     * 取消增加记录
     */
    cancelAddRecord() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;

        // 移除表单
        const form = document.getElementById('addRecordForm');
        if (form) {
            form.remove();
        }

        // 恢复显示增加按钮
        const addContainer = historyList.querySelector('.history-add-record-container');
        if (addContainer) {
            addContainer.style.display = 'block';
        }
    }

    /**
     * 渲染单个历史记录项
     */
    renderHistoryItem(entry) {
        const tag = this.tags.find(t => t.id === entry.tagId);
        const tagEmoji = tag ? tag.emoji : '';

        return `
            <div class="history-item" data-entry-id="${entry.id}">
                <div class="history-item-time">${formatDurationHuman(entry.duration)}</div>
                <div class="history-item-content">
                    <div class="history-item-activity">${tagEmoji} ${escapeHtml(entry.activity || '未命名')}</div>
                    <div class="history-item-time-range">${formatTimeRange(entry.startTime, entry.endTime)}</div>
                </div>
                <div class="history-item-actions">
                    <button class="history-edit" data-entry-id="${entry.id}" title="编辑">✏️</button>
                    <button class="history-delete" data-entry-id="${entry.id}" title="删除">×</button>
                </div>
            </div>
        `;
    }

    /**
     * 编辑记录 - 统一编辑入口
     */
    async editEntry(entryId) {
        try {
            const entry = await db.getTimeEntry(entryId);
            if (!entry) {
                showToast('记录不存在', 'error');
                return;
            }

            // 直接在历史项中编辑
            const historyItem = document.querySelector(`[data-entry-id="${entryId}"]`);
            if (!historyItem) return;

            // 保存原始值用于取消
            const originalEntry = { ...entry };

            // 解析时间
            const startDate = new Date(entry.startTime);
            const endDate = new Date(entry.endTime);

            // 格式化为 input 需要的格式
            const dateValue = formatDate(startDate);
            const startTimeValue = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;
            const endTimeValue = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;

            const contentDiv = historyItem.querySelector('.history-item-content');
            const timeDiv = historyItem.querySelector('.history-item-time');
            const tag = this.tags.find(t => t.id === entry.tagId);
            const tagEmoji = tag ? tag.emoji : '';

            // 替换为完整的编辑表单
            contentDiv.innerHTML = `
                <div class="history-edit-form">
                    <input type="text" class="history-edit-activity" value="${escapeHtml(entry.activity || '')}" placeholder="活动内容">
                    <div class="history-edit-date-row">
                        <span class="history-edit-icon">📅</span>
                        <input type="date" class="history-edit-date" value="${dateValue}">
                    </div>
                    <div class="history-edit-time-group">
                        <span class="history-edit-icon">⏰</span>
                        <input type="time" class="history-edit-time history-edit-start" value="${startTimeValue}">
                        <span class="history-edit-separator">-</span>
                        <input type="time" class="history-edit-time history-edit-end" value="${endTimeValue}">
                    </div>
                </div>
            `;

            // 允许历史项换行以容纳编辑表单
            historyItem.style.alignItems = 'flex-start';

            const activityInput = contentDiv.querySelector('.history-edit-activity');
            const dateInput = contentDiv.querySelector('.history-edit-date');
            const startInput = contentDiv.querySelector('.history-edit-start');
            const endInput = contentDiv.querySelector('.history-edit-end');

            // 聚焦到活动名称输入框并选中文本
            activityInput.focus();
            activityInput.select();

            // 保存函数
            let saveTimeout = null;
            const saveEdit = async () => {
                // 验证时间
                const dateStr = dateInput.value;
                const startStr = startInput.value;
                const endStr = endInput.value;

                if (!dateStr || !startStr || !endStr) {
                    showToast('请填写完整的时间信息', 'error');
                    return false;
                }

                const newStart = new Date(`${dateStr}T${startStr}`);
                const newEnd = new Date(`${dateStr}T${endStr}`);
                const newDuration = Math.floor((newEnd - newStart) / 1000);

                if (newDuration <= 0) {
                    showToast('结束时间必须晚于开始时间', 'error');
                    return false;
                }

                const newActivity = activityInput.value.trim() || '未命名';
                const newStartTime = newStart.toISOString();
                const newEndTime = newEnd.toISOString();

                // 检查是否有变化
                if (newActivity === originalEntry.activity &&
                    newStartTime === originalEntry.startTime &&
                    newEndTime === originalEntry.endTime) {
                    // 无变化，直接恢复显示
                    this.restoreHistoryItemDisplay(historyItem, originalEntry, tagEmoji);
                    return true;
                }

                // 更新记录
                entry.activity = newActivity;
                entry.startTime = newStartTime;
                entry.endTime = newEndTime;
                entry.duration = newDuration;
                entry.updated_at = new Date().toISOString();

                await db.updateTimeEntry(entry);

                // 恢复显示
                this.restoreHistoryItemDisplay(historyItem, entry, tagEmoji);
                timeDiv.textContent = formatDurationHuman(newDuration);

                showToast('已更新', 'success');
                return true;
            };

            // 取消函数
            const cancelEdit = () => {
                this.restoreHistoryItemDisplay(historyItem, originalEntry, tagEmoji);
            };

            // 处理失焦（延迟以检查是否切换到另一个输入框）
            const handleBlur = (e) => {
                saveTimeout = setTimeout(() => {
                    // 检查焦点是否还在编辑表单内
                    const form = contentDiv.querySelector('.history-edit-form');
                    if (form && !form.contains(document.activeElement)) {
                        saveEdit();
                    }
                }, 100);
            };

            // 绑定失焦事件
            activityInput.addEventListener('blur', handleBlur);
            dateInput.addEventListener('blur', handleBlur);
            startInput.addEventListener('blur', handleBlur);
            endInput.addEventListener('blur', handleBlur);

            // 绑定键盘事件
            activityInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    clearTimeout(saveTimeout);
                    cancelEdit();
                } else if (e.key === 'Enter') {
                    clearTimeout(saveTimeout);
                    e.preventDefault();
                    dateInput.focus();
                } else if (e.key === 'Tab' && !e.shiftKey) {
                    clearTimeout(saveTimeout);
                }
            });

            dateInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    clearTimeout(saveTimeout);
                    cancelEdit();
                } else if (e.key === 'Enter') {
                    clearTimeout(saveTimeout);
                    startInput.focus();
                } else if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    startInput.focus();
                }
            });

            startInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    clearTimeout(saveTimeout);
                    cancelEdit();
                } else if (e.key === 'Enter') {
                    clearTimeout(saveTimeout);
                    endInput.focus();
                } else if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    endInput.focus();
                }
            });

            endInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    clearTimeout(saveTimeout);
                    cancelEdit();
                } else if (e.key === 'Enter') {
                    clearTimeout(saveTimeout);
                    e.target.blur();
                }
            });

        } catch (err) {
            console.error('编辑记录失败:', err);
            showToast('编辑失败', 'error');
        }
    }

    /**
     * 恢复历史项的显示状态
     */
    restoreHistoryItemDisplay(historyItem, entry, tagEmoji) {
        historyItem.style.alignItems = '';
        const contentDiv = historyItem.querySelector('.history-item-content');
        contentDiv.innerHTML = `
            <div class="history-item-activity">${tagEmoji} ${escapeHtml(entry.activity || '未命名')}</div>
            <div class="history-item-time-range">${formatTimeRange(entry.startTime, entry.endTime)}</div>
        `;
    }

    /**
     * 按日期分组
     */
    groupEntriesByDate(entries) {
        const grouped = {};

        entries.forEach(entry => {
            const date = entry.startTime.split('T')[0];
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(entry);
        });

        return grouped;
    }

    /**
     * 格式化日期标签
     */
    formatDateLabel(dateStr) {
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (isSameDay(date, today)) {
            return '今天';
        } else if (isSameDay(date, yesterday)) {
            return '昨天';
        } else {
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            const weekday = weekdays[date.getDay()];
            return `${month}月${day}日 周${weekday}`;
        }
    }

    /**
     * 渲染统计Tab
     */
    async renderStatsTab() {
        const statsSummary = document.getElementById('statsSummary');
        const statsChart = document.getElementById('statsChart');

        if (!statsSummary || !statsChart) return;

        // 更新日期显示
        this.updateDateDisplay();

        try {
            const allEntries = await db.getAllTimeEntries();

            if (allEntries.length === 0) {
                statsSummary.innerHTML = '<p class="empty-state">暂无数据</p>';
                statsChart.innerHTML = '';
                return;
            }

            // 按选择的日期过滤记录
            const selectedDate = this.statsSelectedDate;
            const filteredEntries = allEntries.filter(e => e.startTime.startsWith(selectedDate));

            // 计算统计数据
            const stats = this.calculateStats(filteredEntries);

            // 格式化日期用于显示
            const displayDate = this.formatSelectedDate(selectedDate);

            // 渲染摘要
            statsSummary.innerHTML = `
                <div class="stats-total">
                    <div class="stats-label">总计时长</div>
                    <div class="stats-value">${formatDurationHuman(stats.totalDuration)}</div>
                </div>
                <div class="stats-count">
                    <div class="stats-label">记录数量</div>
                    <div class="stats-value">${stats.totalCount}</div>
                </div>
                <div class="stats-today">
                    <div class="stats-label">${displayDate}时长</div>
                    <div class="stats-value">${formatDurationHuman(stats.selectedDateDuration)}</div>
                </div>
            `;

            // 渲染图表（按活动类型）
            const tagStats = this.calculateTagStats(filteredEntries);
            if (Object.keys(tagStats).length > 0) {
                let chartHtml = '<h3>时间分布</h3><div class="stats-chart-bars">';
                for (const [tagName, duration] of Object.entries(tagStats)) {
                    const percentage = stats.totalDuration > 0 ? (duration / stats.totalDuration * 100).toFixed(1) : 0;
                    const tag = this.tags.find(t => t.name === tagName);
                    const emoji = tag ? tag.emoji : '';
                    chartHtml += `
                        <div class="stats-chart-bar">
                            <div class="stats-bar-label">${emoji} ${tagName}</div>
                            <div class="stats-bar-track">
                                <div class="stats-bar-fill" style="width: ${percentage}%"></div>
                            </div>
                            <div class="stats-bar-value">${formatDurationHuman(duration)}</div>
                        </div>
                    `;
                }
                chartHtml += '</div>';
                statsChart.innerHTML = chartHtml;
            } else {
                statsChart.innerHTML = '';
            }

        } catch (err) {
            console.error('加载统计数据失败:', err);
            statsSummary.innerHTML = '<p class="empty-state">加载失败</p>';
            statsChart.innerHTML = '';
        }
    }

    /**
     * 格式化选中的日期用于显示
     */
    formatSelectedDate(dateStr) {
        const date = new Date(dateStr);
        const today = formatDate(new Date());
        const yesterday = formatDate(new Date(Date.now() - 86400000));

        if (dateStr === today) {
            return '今日';
        } else if (dateStr === yesterday) {
            return '昨日';
        } else {
            const month = date.getMonth() + 1;
            const day = date.getDate();
            return `${month}月${day}日`;
        }
    }

    /**
     * 计算统计数据
     */
    calculateStats(entries) {
        const totalDuration = entries.reduce((sum, e) => sum + e.duration, 0);
        const totalCount = entries.length;

        // 所选日期的时长（与总计时长相同，因为已经过滤过了）
        const selectedDateDuration = totalDuration;

        return {
            totalDuration,
            totalCount,
            selectedDateDuration
        };
    }

    /**
     * 计算按活动类型统计
     */
    calculateTagStats(entries) {
        const stats = {};

        entries.forEach(entry => {
            const activity = entry.activity || '未命名';
            if (!stats[activity]) {
                stats[activity] = 0;
            }
            stats[activity] += entry.duration;
        });

        // 按时长降序排列
        const sorted = {};
        Object.entries(stats)
            .sort((a, b) => b[1] - a[1])
            .forEach(([name, duration]) => {
                sorted[name] = duration;
            });

        return sorted;
    }

    /**
     * 删除记录
     */
    async deleteEntry(entryId) {
        if (!confirm('确定要删除这条记录吗？')) return;

        try {
            await db.deleteTimeEntry(entryId);
            showToast('删除成功', 'success');
            this.renderHistoryTab();
            this.renderStatsTab();
        } catch (err) {
            console.error('删除失败:', err);
            showToast('删除失败', 'error');
        }
    }
}

// 创建全局实例
const timeTracker = new TimeTracker();
