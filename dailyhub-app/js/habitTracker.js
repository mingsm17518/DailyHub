/**
 * 习惯打卡管理模块
 */

class HabitTracker {
    constructor() {
        this.habits = [];
        this.habitLogs = new Map(); // habitId -> {date: log}
    }

    // Helper method to get CloudSync instance
    getCloudSync() {
        return window.db ? window.db.getCloudSync() : null;
    }

    /**
     * 按今日打卡状态排序：未打卡在前，已打卡在后
     * @param {Array} habits - 习惯数组
     * @param {Map} habitLogs - 打卡记录 Map
     * @param {string} date - 日期字符串 (YYYY-MM-DD)
     * @returns {Array} 排序后的习惯数组
     */
    sortHabitsByCheckinStatus(habits, habitLogs, date) {
        return [...habits].sort((a, b) => {
            const aLogs = habitLogs.get(a.id) || new Map();
            const bLogs = habitLogs.get(b.id) || new Map();
            const aChecked = aLogs.get(date)?.count > 0;
            const bChecked = bLogs.get(date)?.count > 0;
            if (aChecked !== bChecked) return aChecked ? 1 : -1;
            return 0;
        });
    }

    async init() {
        this.bindEvents();
        await this.loadData();
        this.render();
    }

    bindEvents() {
        // 不再需要子标签切换功能，两个视图始终显示

        // Add habit buttons (mobile and desktop)
        const btnAddHabit = document.getElementById('btnAddHabit');
        if (btnAddHabit) {
            btnAddHabit.addEventListener('click', () => this.showHabitModal());
        }

        const btnAddHabitDesktop = document.getElementById('btnAddHabitDesktop');
        if (btnAddHabitDesktop) {
            btnAddHabitDesktop.addEventListener('click', () => this.showHabitModal());
        }

        // Form events
        const habitForm = document.getElementById('habitForm');
        if (habitForm) {
            habitForm.addEventListener('submit', (e) => this.saveHabit(e));
        }

        const btnCloseHabitModal = document.getElementById('btnCloseHabitModal');
        if (btnCloseHabitModal) {
            btnCloseHabitModal.addEventListener('click', () => this.hideHabitModal());
        }

        const btnCancelHabit = document.getElementById('btnCancelHabit');
        if (btnCancelHabit) {
            btnCancelHabit.addEventListener('click', () => this.hideHabitModal());
        }

        // Bind icon chips selection
        const iconChipsContainer = document.querySelector('.habit-icon-chips') || document.querySelector('.icon-chips-container');
        const habitIconInput = document.getElementById('habitIcon');

        if (iconChipsContainer) {
            // Chip click handler
            iconChipsContainer.querySelectorAll('.icon-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    const icon = chip.dataset.icon;
                    if (habitIconInput) {
                        habitIconInput.value = icon;
                    }
                    // Update active state
                    iconChipsContainer.querySelectorAll('.icon-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                });
            });

            // Sync input with chips state
            if (habitIconInput) {
                habitIconInput.addEventListener('input', () => {
                    const value = habitIconInput.value;
                    iconChipsContainer.querySelectorAll('.icon-chip').forEach(chip => {
                        if (chip.dataset.icon === value) {
                            chip.classList.add('active');
                        } else {
                            chip.classList.remove('active');
                        }
                    });
                });
            }
        }

        // Prevent icon chips scroll from bubbling to parent modal
        const iconChipsScroll = document.querySelector('.icon-chips-scroll');
        if (iconChipsScroll) {
            // Prevent touch scroll propagation
            iconChipsScroll.addEventListener('touchmove', (e) => {
                e.stopPropagation();
            }, { passive: true });

            // Prevent wheel scroll propagation
            iconChipsScroll.addEventListener('wheel', (e) => {
                e.stopPropagation();
            }, { passive: true });
        }

        // Modal delete button event is bound in showHabitModal() to ensure it works
        // when the button is displayed (not hidden with display:none)
    }

    async loadData() {
        // 优先从本地加载
        this.habits = await db.getHabits();

        // 加载打卡记录
        for (const habit of this.habits) {
            const logs = await db.getHabitLogs(habit.id);
            const logsMap = new Map();
            logs.forEach(log => {
                logsMap.set(log.logDate, log);
            });
            this.habitLogs.set(habit.id, logsMap);
        }

        // 如果已登录，从云端同步最新数据
        const cloudSync = this.getCloudSync();
        if (cloudSync && cloudSync.isLoggedIn()) {
            try {
                const cloudData = await cloudSync.fetchAllHabits();

                // 合并云端数据（以云端数据为准，因为可能来自其他设备）
                if (cloudData.habits && cloudData.habits.length > 0) {
                    // 清空本地数据，使用云端数据
                    this.habits = cloudData.habits;
                    this.habitLogs.clear();
                    cloudData.logs.forEach(log => {
                        if (!this.habitLogs.has(log.habitId)) {
                            this.habitLogs.set(log.habitId, new Map());
                        }
                        this.habitLogs.get(log.habitId).set(log.logDate, log);
                    });

                    // 更新本地数据库
                    for (const habit of this.habits) {
                        await db.addHabit(habit);
                    }
                    for (const log of cloudData.logs) {
                        await db.addHabitLog(log);
                    }
                }
            } catch (err) {
                console.warn('云端同步失败，使用本地数据:', err);
            }
        }

        this.render();
    }

    processLogs(logs) {
        this.habitLogs.clear();
        logs.forEach(log => {
            if (!this.habitLogs.has(log.habitId)) {
                this.habitLogs.set(log.habitId, new Map());
            }
            this.habitLogs.get(log.habitId).set(log.logDate, log);
        });
    }

    switchView(view) {
        // No longer needed - all habits display with embedded heatmaps
        console.log('HabitTracker: 显示习惯列表');
    }

    render() {
        this.renderHabitList();
    }

    renderHabitList() {
        // Mobile view
        this.renderMobileHabitList();
        // Desktop view
        this.renderDesktopHabitList();
    }

    renderMobileHabitList() {
        const container = document.getElementById('habitsContainer');
        if (!container) return;

        if (this.habits.length === 0) {
            container.innerHTML = '<p class="empty-state">暂无习惯</p>';
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        // 按今日打卡状态排序：未打卡在前，已打卡在后
        const sortedHabits = this.sortHabitsByCheckinStatus(this.habits, this.habitLogs, today);

        container.innerHTML = sortedHabits.map(habit => {
            const logs = this.habitLogs.get(habit.id) || new Map();
            const todayLog = logs.get(today);

            return `
                <div class="habit-card" style="border-left: 4px solid ${habit.color || '#4CAF50'}">
                    <div class="habit-header">
                        <span class="habit-icon">${habit.icon || '✓'}</span>
                        <h3>${this.escapeHtml(habit.name)}</h3>
                    </div>
                    ${habit.description ? `<p class="habit-description">${this.escapeHtml(habit.description)}</p>` : ''}

                    <!-- 嵌入热力图 -->
                    ${this.renderCardHeatmap(habit, logs)}

                    <div class="habit-actions">
                        <button class="btn-checkin ${todayLog && todayLog.count > 0 ? 'checked' : ''}"
                                data-habit-id="${habit.id}"
                                data-date="${today}">
                            ${todayLog && todayLog.count > 0 ? '✓ 已打卡' : '打卡'}
                        </button>
                        <button class="btn-edit" data-habit-id="${habit.id}">编辑</button>
                        <button class="btn-delete" data-habit-id="${habit.id}">删除</button>
                    </div>
                </div>
            `;
        }).join('');

        // Bind checkin buttons
        container.querySelectorAll('.btn-checkin').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const habitId = e.target.dataset.habitId;
                const date = e.target.dataset.date;
                this.checkin(habitId, date);
            });
        });

        // Bind edit buttons
        container.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const habitId = e.target.dataset.habitId;
                const habit = this.habits.find(h => h.id === habitId);
                if (habit) {
                    this.showHabitModal(habit);
                }
            });
        });

        // Bind delete buttons
        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const habitId = e.target.dataset.habitId;
                this.confirmDeleteHabit(habitId);
            });
        });

        // 绑定热力图滑动
        this.bindHeatmapTouch(container);
    }

    renderDesktopHabitList() {
        const container = document.getElementById('habitsContainerDesktop');
        if (!container) return;

        if (this.habits.length === 0) {
            container.innerHTML = '<p class="empty-state">暂无习惯</p>';
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        // 按今日打卡状态排序：未打卡在前，已打卡在后
        const sortedHabits = this.sortHabitsByCheckinStatus(this.habits, this.habitLogs, today);

        container.innerHTML = sortedHabits.map(habit => {
            const logs = this.habitLogs.get(habit.id) || new Map();
            const todayLog = logs.get(today);

            return `
                <div class="habit-card" style="border-left: 4px solid ${habit.color || '#4CAF50'}">
                    <div class="habit-header">
                        <span class="habit-icon">${habit.icon || '✓'}</span>
                        <h3>${this.escapeHtml(habit.name)}</h3>
                    </div>
                    ${habit.description ? `<p class="habit-description">${this.escapeHtml(habit.description)}</p>` : ''}

                    <!-- 嵌入热力图 -->
                    ${this.renderCardHeatmap(habit, logs)}

                    <div class="habit-actions">
                        <button class="btn-checkin ${todayLog && todayLog.count > 0 ? 'checked' : ''}"
                                data-habit-id="${habit.id}"
                                data-date="${today}">
                            ${todayLog && todayLog.count > 0 ? '✓ 已打卡' : '打卡'}
                        </button>
                        <button class="btn-edit" data-habit-id="${habit.id}">编辑</button>
                        <button class="btn-delete" data-habit-id="${habit.id}">删除</button>
                    </div>
                </div>
            `;
        }).join('');

        // Bind checkin buttons
        container.querySelectorAll('.btn-checkin').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const habitId = e.target.dataset.habitId;
                const date = e.target.dataset.date;
                this.checkin(habitId, date);
            });
        });

        // Bind edit buttons
        container.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const habitId = e.target.dataset.habitId;
                const habit = this.habits.find(h => h.id === habitId);
                if (habit) {
                    this.showHabitModal(habit);
                }
            });
        });

        // Bind delete buttons
        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const habitId = e.target.dataset.habitId;
                this.confirmDeleteHabit(habitId);
            });
        });

        // 绑定热力图滑动
        this.bindHeatmapTouch(container);
    }

    /**
     * 动画移动习惯卡片到已打卡区域
     * @param {string} habitId - 习惯ID
     */
    animateHabitToPosition(habitId) {
        const today = new Date().toISOString().split('T')[0];

        // 保存滚动位置，防止页面跳回顶部
        const scrollY = window.scrollY || window.pageYOffset;

        // 获取手机端和桌面端的容器
        const containers = [
            document.getElementById('habitsContainer'),
            document.getElementById('habitsContainerDesktop')
        ];

        containers.forEach(container => {
            if (!container) return;

            const card = container.querySelector(`.habit-card button[data-habit-id="${habitId}"]`)?.closest('.habit-card');
            if (!card) return;

            // 获取所有卡片（已排序）
            const allCards = [...container.querySelectorAll('.habit-card')];
            const cardIndex = allCards.indexOf(card);
            if (cardIndex === -1) return;

            // 计算在已打卡区域末尾的目标位置
            // 先找到所有已打卡的卡片
            const checkedCards = allCards.filter(c => {
                const btn = c.querySelector('.btn-checkin');
                return btn && btn.classList.contains('checked');
            });

            // 如果当前卡片已打卡且不在最后位置，需要移动
            const btn = card.querySelector('.btn-checkin');
            if (!btn || !btn.classList.contains('checked')) return;

            // 找到目标位置：在最后一个已打卡卡片之后
            let targetIndex = allCards.length - 1;
            for (let i = cardIndex + 1; i < allCards.length; i++) {
                const otherBtn = allCards[i].querySelector('.btn-checkin');
                if (otherBtn && otherBtn.classList.contains('checked')) {
                    targetIndex = i;
                } else {
                    break;
                }
            }

            // 如果目标位置就是当前位置，不需要移动
            if (targetIndex === cardIndex) return;

            // 计算需要移动的距离
            let distance = 0;
            for (let i = cardIndex + 1; i <= targetIndex; i++) {
                distance += allCards[i].offsetHeight + 16; // 16px 是间距
            }

            // 使用 CSS transition 动画移动
            card.style.transition = 'transform 0.3s ease';
            card.style.transform = `translateY(-${distance}px)`;
            card.style.zIndex = '100';

            // 动画结束后更新 DOM 顺序
            card.addEventListener('transitionend', () => {
                card.style.transition = '';
                card.style.transform = '';
                card.style.zIndex = '';

                // 移动 DOM 元素到正确位置
                const targetCard = allCards[targetIndex];
                if (targetCard && targetCard !== card) {
                    container.insertBefore(card, targetCard.nextSibling);
                }

                // 恢复滚动位置（防止页面跳回顶部）
                window.scrollTo(0, scrollY);
            }, { once: true });
        });
    }

    async checkin(habitId, date) {
        const logId = `hl_${Date.now()}`;
        const log = {
            id: logId,
            habitId: habitId,
            logDate: date,
            count: 1
        };

        try {
            // 保存到本地
            await db.addHabitLog(log);

            // 更新本地数据
            if (!this.habitLogs.has(habitId)) {
                this.habitLogs.set(habitId, new Map());
            }
            this.habitLogs.get(habitId).set(date, log);

            // 增量更新：只更新被点击的热力图格子和按钮状态（避免整页闪烁）
            this.updateHeatmapCell(habitId, date);
            this.updateCheckinButton(habitId, date);

            // 触发动画：将已打卡的习惯移动到已打卡区域
            this.animateHabitToPosition(habitId);
        } catch (error) {
            console.error('Checkin failed:', error);
            alert('打卡失败');
        }
    }

    async toggleCheckin(habitId, date) {
        const logs = this.habitLogs.get(habitId) || new Map();
        const existingLog = logs.get(date);

        try {
            if (existingLog && existingLog.count > 0) {
                // 已打卡，执行取消打卡操作
                await db.deleteHabitLog(existingLog.id);
                // 从本地数据中移除
                this.habitLogs.get(habitId).delete(date);
            } else {
                // 未打卡，执行打卡操作
                const logId = `hl_${Date.now()}`;
                const log = {
                    id: logId,
                    habitId: habitId,
                    logDate: date,
                    count: 1
                };
                // 保存到本地
                await db.addHabitLog(log);
                // 更新本地数据
                if (!this.habitLogs.has(habitId)) {
                    this.habitLogs.set(habitId, new Map());
                }
                this.habitLogs.get(habitId).set(date, log);

                // 触发动画：将已打卡的习惯移动到已打卡区域
                this.animateHabitToPosition(habitId);
            }

            // 增量更新：只更新被点击的热力图格子和按钮状态（避免整页闪烁）
            this.updateHeatmapCell(habitId, date);
            this.updateCheckinButton(habitId, date);
        } catch (error) {
            console.error('Toggle checkin failed:', error);
            alert('操作失败');
        }
    }

    showHabitModal(habit = null) {
        const modal = document.getElementById('habitModal');
        const title = document.getElementById('habitModalTitle');
        const btnDelete = document.getElementById('btnDeleteHabit');

        if (habit) {
            title.textContent = '编辑习惯';
            document.getElementById('habitId').value = habit.id;
            document.getElementById('habitName').value = habit.name;
            document.getElementById('habitDescription').value = habit.description || '';
            document.getElementById('habitColor').value = habit.color || '#4CAF50';
            document.getElementById('habitIcon').value = habit.icon || '✓';
            btnDelete.style.display = 'block';

            // Bind delete button event (re-bind each time modal is opened to ensure it works)
            btnDelete.onclick = () => {
                const habitId = document.getElementById('habitId').value;
                if (habitId) {
                    this.deleteHabit(habitId);
                }
            };
        } else {
            title.textContent = '新建习惯';
            document.getElementById('habitId').value = '';
            document.getElementById('habitName').value = '';
            document.getElementById('habitDescription').value = '';
            document.getElementById('habitColor').value = '#4CAF50';
            document.getElementById('habitIcon').value = '✓';
            btnDelete.style.display = 'none';

            // Clear event binding in new mode
            btnDelete.onclick = null;
        }

        // Sync icon chips with current value
        const habitIconInput = document.getElementById('habitIcon');
        if (habitIconInput) {
            const currentValue = habitIconInput.value;
            document.querySelectorAll('.icon-chip').forEach(chip => {
                chip.classList.toggle('active', chip.dataset.icon === currentValue);
            });
        }

        if (modal) modal.style.display = 'flex';
    }

    hideHabitModal() {
        const modal = document.getElementById('habitModal');
        if (modal) modal.style.display = 'none';
    }

    async saveHabit(e) {
        e.preventDefault();

        const id = document.getElementById('habitId').value || `habit_${Date.now()}`;
        const data = {
            id,
            name: document.getElementById('habitName').value,
            description: document.getElementById('habitDescription').value,
            color: document.getElementById('habitColor').value,
            icon: document.getElementById('habitIcon').value,
        };

        try {
            // 保存到本地 IndexedDB
            await db.addHabit(data);
            this.hideHabitModal();
            await this.loadData();
            this.render();
        } catch (error) {
            console.error('Save habit failed:', error);
            alert('保存失败');
        }
    }

    async confirmDeleteHabit(habitId) {
        if (!confirm('确定要删除这个习惯吗？')) return;

        try {
            // 删除该习惯的所有打卡记录（使用单个事务）
            await db.deleteAllHabitLogs(habitId);

            // 从本地删除习惯
            await db.deleteHabit(habitId);

            // 手动更新本地状态（避免重新加载所有数据）
            this.habits = this.habits.filter(h => h.id !== habitId);
            this.habitLogs.delete(habitId);

            this.render();
        } catch (error) {
            console.error('Delete habit failed:', error);
            alert('删除失败');
        }
    }

    async deleteHabit(habitId = null) {
        const idToDelete = habitId || document.getElementById('habitId').value;
        if (!idToDelete) return;

        this.hideHabitModal();
        await this.confirmDeleteHabit(idToDelete);
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 为单个习惯渲染卡片内热力图
     * @param {Object} habit - 习惯对象
     * @param {Map} logsMap - 该习惯的打卡记录 Map<date, log>
     * @returns {string} HTML字符串
     */
    renderCardHeatmap(habit, logsMap) {
        // 获取最近365天数据（完整一年）
        const days = this.getRecentDays(365);
        const heatmapData = this.buildHeatmapWeeks(days, logsMap, habit.id);
        const stats = this.calculateHabitStats(logsMap);

        // 星期标签
        const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        return `
            <div class="habit-heatmap-wrapper">
                <div class="habit-heatmap-container" data-habit-id="${habit.id}">
                    <!-- 月份标签行 -->
                    <div class="heatmap-months-row">
                        <div class="heatmap-day-label-spacer"></div>
                        <div class="heatmap-months-labels">
                            ${heatmapData.monthLabels.map(m =>
                                `<span class="month-label" style="width: calc(${m.span} * (11px + 2px))">${m.month}</span>`
                            ).join('')}
                        </div>
                    </div>

                    <!-- 热力图主体 -->
                    <div class="heatmap-body">
                        <!-- 左侧星期标签 -->
                        <div class="heatmap-day-labels">
                            ${dayLabels.map(d => `<span class="day-label">${d}</span>`).join('')}
                        </div>

                        <!-- 右侧可滚动热力图 -->
                        <div class="heatmap-scroll-area">
                            <div class="heatmap-weeks-mini">
                                ${heatmapData.weeksHTML}
                            </div>
                        </div>
                    </div>

                    ${stats.currentStreak > 0 ? `
                        <div class="heatmap-stats">
                            <span class="stat-text">连续 <strong>${stats.currentStreak}</strong> 天</span>
                        </div>
                    ` : `
                        <div class="heatmap-indicator">
                            <span class="indicator-text">最近一年</span>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    /**
     * 获取最近N天的日期数组（从今天往前推）
     */
    getRecentDays(count) {
        const days = [];
        const today = new Date();
        for (let i = count - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            days.push(date.toISOString().split('T')[0]);
        }
        return days;
    }

    /**
     * 构建热力图周HTML和月份标签
     */
    buildHeatmapWeeks(dates, logsMap, habitId) {
        const weeks = [];
        let currentWeek = [];

        // 用于计算月份标签
        let lastMonth = null;
        let monthStartWeekIndex = 0;
        const monthLabels = []; // { month: 'Jan', startWeek: 0, span: 4 }

        dates.forEach((dateStr, index) => {
            const date = new Date(dateStr);
            const dayOfWeek = date.getDay();
            const currentMonth = date.getMonth();

            // 检测月份变化，记录月份标签
            if (lastMonth !== null && currentMonth !== lastMonth) {
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                monthLabels.push({
                    month: monthNames[lastMonth],
                    startWeek: monthStartWeekIndex,
                    span: weeks.length - monthStartWeekIndex
                });
                monthStartWeekIndex = weeks.length;
            }
            lastMonth = currentMonth;

            // 第一周前面补空（对齐周一）
            if (index === 0 && dayOfWeek !== 1) {
                const paddingDays = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                for (let i = 0; i < paddingDays; i++) {
                    currentWeek.push(null);
                }
            }

            const log = logsMap.get(dateStr);
            const count = log ? log.count || 0 : 0;
            currentWeek.push({ date: dateStr, count });

            // 周日或最后一天，结束当前周
            if (dayOfWeek === 0 || index === dates.length - 1) {
                weeks.push([...currentWeek]);
                currentWeek = [];
            }
        });

        // 添加最后一个月
        if (lastMonth !== null) {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            monthLabels.push({
                month: monthNames[lastMonth],
                startWeek: monthStartWeekIndex,
                span: weeks.length - monthStartWeekIndex
            });
        }

        // 返回包含月份标签和周数据的对象
        return {
            monthLabels,
            weeksHTML: weeks.map(week => `
                <div class="heatmap-week-mini">
                    ${week.map(day => day ? `
                        <div class="heatmap-day-mini level-${this.getHeatmapLevel(day.count)} clickable"
                             title="${day.date}: ${day.count}次"
                             data-date="${day.date}"
                             data-habit-id="${habitId}"></div>
                    ` : '<div class="heatmap-day-mini empty"></div>').join('')}
                </div>
            `).join('')
        };
    }

    /**
     * 获取热力图等级（0-4）
     */
    getHeatmapLevel(count) {
        if (count === 0) return 0;
        if (count === 1) return 1;
        if (count <= 3) return 2;
        if (count <= 5) return 3;
        return 4;
    }

    /**
     * 精确更新单个热力图格子（避免整页重建导致的闪烁）
     * @param {string} habitId - 习惯ID
     * @param {string} date - 日期字符串 (YYYY-MM-DD)
     */
    updateHeatmapCell(habitId, date) {
        const logs = this.habitLogs.get(habitId) || new Map();
        const log = logs.get(date);
        const count = log ? log.count || 0 : 0;
        const newLevel = this.getHeatmapLevel(count);

        // 更新手机端和桌面端的所有匹配格子
        document.querySelectorAll(`[data-habit-id="${habitId}"][data-date="${date}"]`).forEach(cell => {
            // 移除旧 level class
            cell.classList.remove('level-0', 'level-1', 'level-2', 'level-3', 'level-4');
            // 添加新 level class
            cell.classList.add(`level-${newLevel}`);
            // 更新 title
            cell.title = `${date}: ${count}次`;
        });

        // 更新连续天数统计
        const stats = this.calculateHabitStats(logs);

        // 更新手机端和桌面端的统计显示（更新现有元素内容而非移除重建）
        document.querySelectorAll(`.habit-heatmap-container[data-habit-id="${habitId}"]`).forEach(container => {
            let statsDiv = container.querySelector('.heatmap-stats');
            let indicatorDiv = container.querySelector('.heatmap-indicator');

            if (stats.currentStreak > 0) {
                if (statsDiv) {
                    // 更新现有统计元素的内容
                    const statText = statsDiv.querySelector('.stat-text');
                    if (statText) {
                        statText.innerHTML = `连续 <strong>${stats.currentStreak}</strong> 天`;
                    }
                    // 移除指示器元素（如果存在）
                    if (indicatorDiv) indicatorDiv.remove();
                } else {
                    // 创建新的统计元素
                    statsDiv = document.createElement('div');
                    statsDiv.className = 'heatmap-stats';
                    statsDiv.innerHTML = `<span class="stat-text">连续 <strong>${stats.currentStreak}</strong> 天</span>`;
                    container.appendChild(statsDiv);
                    // 移除指示器元素（如果存在）
                    if (indicatorDiv) indicatorDiv.remove();
                }
            } else {
                if (indicatorDiv) {
                    // 指示器已存在，无需更新
                    // 移除统计元素（如果存在）
                    if (statsDiv) statsDiv.remove();
                } else {
                    // 创建新的指示器元素
                    indicatorDiv = document.createElement('div');
                    indicatorDiv.className = 'heatmap-indicator';
                    indicatorDiv.innerHTML = '<span class="indicator-text">最近一年</span>';
                    container.appendChild(indicatorDiv);
                    // 移除统计元素（如果存在）
                    if (statsDiv) statsDiv.remove();
                }
            }
        });
    }

    /**
     * 精确更新打卡按钮状态（避免整页重建导致的闪烁）
     * @param {string} habitId - 习惯ID
     * @param {string} date - 日期字符串 (YYYY-MM-DD)
     */
    updateCheckinButton(habitId, date) {
        const logs = this.habitLogs.get(habitId) || new Map();
        const log = logs.get(date);
        const isChecked = log && log.count > 0;

        // 更新手机端和桌面端的所有匹配按钮
        document.querySelectorAll(`.btn-checkin[data-habit-id="${habitId}"][data-date="${date}"]`).forEach(btn => {
            if (isChecked) {
                btn.classList.add('checked');
                btn.textContent = '✓ 已打卡';
            } else {
                btn.classList.remove('checked');
                btn.textContent = '打卡';
            }
        });
    }

    /**
     * 计算习惯统计信息
     */
    calculateHabitStats(logsMap) {
        const today = new Date();
        let streak = 0;

        // 计算连续打卡天数
        for (let i = 0; i < 365; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const log = logsMap.get(dateStr);
            if (log && log.count > 0) {
                streak++;
            } else if (i > 0) {
                break;
            }
        }

        return { currentStreak: streak };
    }

    /**
     * 绑定热力图横向滑动
     */
    bindHeatmapTouch(container) {
        container.querySelectorAll('.heatmap-scroll-area').forEach(scrollArea => {
            let startX = 0;
            let scrollLeft = 0;
            let isDown = false;

            // 触摸事件
            scrollArea.addEventListener('touchstart', (e) => {
                startX = e.touches[0].pageX - scrollArea.offsetLeft;
                scrollLeft = scrollArea.scrollLeft;
                isDown = true;
            }, { passive: true });

            scrollArea.addEventListener('touchmove', (e) => {
                if (!isDown) return;
                const x = e.touches[0].pageX - scrollArea.offsetLeft;
                const walk = (x - startX) * 1.5;
                scrollArea.scrollLeft = scrollLeft - walk;
            }, { passive: true });

            scrollArea.addEventListener('touchend', () => {
                isDown = false;
            });

            // 鼠标拖拽（桌面端）
            scrollArea.addEventListener('mousedown', (e) => {
                isDown = true;
                startX = e.pageX - scrollArea.offsetLeft;
                scrollLeft = scrollArea.scrollLeft;
                scrollArea.style.cursor = 'grabbing';
            });

            scrollArea.addEventListener('mouseleave', () => {
                isDown = false;
                scrollArea.style.cursor = 'grab';
            });

            scrollArea.addEventListener('mouseup', () => {
                isDown = false;
                scrollArea.style.cursor = 'grab';
            });

            scrollArea.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - scrollArea.offsetLeft;
                const walk = (x - startX) * 1.5;
                scrollArea.scrollLeft = scrollLeft - walk;
            });

            // 滚轮支持 - 绑定到父容器以支持整个热力图区域的滚轮滚动
            const container = scrollArea.closest('.habit-heatmap-container');
            container.addEventListener('wheel', (e) => {
                // 检查是否有水平滚动空间
                const hasHorizontalScroll = scrollArea.scrollWidth > scrollArea.clientWidth;

                // 只有同时满足以下条件时才拦截垂直滚轮：
                // 1. 有垂直滚轮输入
                // 2. 热力图有水平滚动空间
                if (e.deltaY !== 0 && hasHorizontalScroll) {
                    e.preventDefault();
                    scrollArea.scrollLeft += e.deltaY;
                }
            }, { passive: false });

            // === 默认滚动到最右侧（当天） ===
            // 使用双重 requestAnimationFrame 确保 DOM 完全渲染后再滚动
            // 第一次 rAF 等待下一帧渲染，第二次 rAF 确保布局计算完成
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    scrollArea.scrollLeft = scrollArea.scrollWidth;
                });
            });
        });

        // 绑定热力图格子点击事件（打卡/取消打卡）
        const heatmapCells = container.querySelectorAll('.heatmap-day-mini.clickable');
        heatmapCells.forEach(cell => {
            cell.addEventListener('click', (e) => {
                const habitId = e.target.dataset.habitId;
                const date = e.target.dataset.date;
                if (habitId && date) {
                    this.toggleCheckin(habitId, date);
                }
            });

            // 添加悬停效果
            cell.addEventListener('mouseenter', () => {
                cell.style.transform = 'scale(1.1)';
            });

            cell.addEventListener('mouseleave', () => {
                cell.style.transform = 'scale(1)';
            });
        });
    }
}

// Export for use in app.js
window.habitTracker = null;
