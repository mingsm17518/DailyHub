// 日历生成逻辑

/**
 * 日历应用类
 */
class CalendarApp {
    constructor() {
        this.currentDate = new Date();
        this.selectedDate = new Date();
        this.currentMonth = this.currentDate.getMonth();
        this.currentYear = this.currentDate.getFullYear();
        this.today = formatDate(new Date());
    }

    /**
     * 渲染日历
     */
    render() {
        this.renderHeader();
        this.renderGrid();
    }

    /**
     * 渲染月份标题
     */
    renderHeader() {
        const monthTitle = document.getElementById('monthTitle');
        if (monthTitle) {
            monthTitle.textContent = formatChineseDate(
                new Date(this.currentYear, this.currentMonth, 1)
            );
        }
    }

    /**
     * 渲染日历网格
     */
    renderGrid() {
        const grid = document.getElementById('calendarGrid');
        if (!grid) return;

        grid.innerHTML = '';

        // 获取月份信息
        const firstDay = getFirstDayOfMonth(this.currentYear, this.currentMonth);
        const lastDay = getLastDayOfMonth(this.currentYear, this.currentMonth);
        const daysInMonth = getDaysInMonth(this.currentYear, this.currentMonth);

        // 获取当月第一天是星期几（0=周日）
        let startDayOfWeek = firstDay.getDay();

        // 计算需要显示的上个月的天数
        const prevMonthLastDay = getLastDayOfMonth(
            this.currentYear,
            this.currentMonth - 1
        );
        const prevMonthDays = prevMonthLastDay.getDate();

        // 上个月的日期
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonthDays - i;
            const date = new Date(this.currentYear, this.currentMonth - 1, day);
            this.renderDayCell(grid, day, date, true);
        }

        // 当月的日期
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(this.currentYear, this.currentMonth, day);
            this.renderDayCell(grid, day, date, false);
        }

        // 下个月的日期（补齐5行）
        const totalCells = startDayOfWeek + daysInMonth;
        const remainingCells = 35 - totalCells; // 5行 × 7列
        for (let day = 1; day <= remainingCells; day++) {
            const date = new Date(this.currentYear, this.currentMonth + 1, day);
            this.renderDayCell(grid, day, date, true);
        }
    }

    /**
     * 渲染单个日期单元格
     * @param {HTMLElement} grid
     * @param {number} day
     * @param {Date} date
     * @param {boolean} isOtherMonth
     */
    renderDayCell(grid, day, date, isOtherMonth) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';

        const dateStr = formatDate(date);

        // 添加类名
        if (isOtherMonth) {
            cell.classList.add('other-month');
        }

        if (dateStr === this.today) {
            cell.classList.add('today');
        }

        // 检查日期是否已过
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0);
        if (checkDate < today) {
            cell.classList.add('is-past');
        }

        if (dateStr === formatDate(this.selectedDate)) {
            cell.classList.add('selected');
        }

        // 日期数字
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        cell.appendChild(dayNumber);

        // 检查是否有日程并添加标记
        db.getEventsByDate(dateStr).then(events => {
            if (events.length > 0) {
                cell.classList.add('has-event');

                // 按时间排序
                events.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

                // 显示日程标题列表
                const eventsContainer = document.createElement('div');
                eventsContainer.className = 'day-events';

                const maxDisplay = Math.min(events.length, 3);
                for (let i = 0; i < maxDisplay; i++) {
                    const event = events[i];
                    const eventEl = document.createElement('div');
                    eventEl.className = 'day-event-title';

                    // 检查日程是否已过
                    const isEventPast = this.isEventPast(event, dateStr);
                    // 检查是否已完成
                    const isCompleted = event.completed;

                    if (isEventPast || isCompleted) {
                        eventEl.classList.add('event-past');
                    }

                    eventEl.textContent = event.title;
                    eventEl.title = `${event.startTime || ''} ${event.title}`; // 鼠标悬停显示完整信息

                    // 添加拖拽支持
                    eventEl.setAttribute('draggable', 'true');
                    eventEl.dataset.eventId = event.id;
                    eventEl.dataset.eventDate = dateStr;

                    // 拖拽开始事件
                    eventEl.addEventListener('dragstart', (e) => {
                        e.dataTransfer.setData('application/x-calendar-event', JSON.stringify({
                            id: event.id,
                            date: dateStr
                        }));
                        e.dataTransfer.effectAllowed = 'move';
                        eventEl.classList.add('dragging');
                    });

                    // 拖拽结束事件
                    eventEl.addEventListener('dragend', () => {
                        eventEl.classList.remove('dragging');
                    });

                    eventsContainer.appendChild(eventEl);
                }

                // 如果有更多日程，显示省略号
                if (events.length > maxDisplay) {
                    const moreEl = document.createElement('div');
                    moreEl.className = 'day-event-more';
                    moreEl.textContent = `+${events.length - maxDisplay} 更多`;
                    eventsContainer.appendChild(moreEl);
                }

                cell.appendChild(eventsContainer);
            }
        });

        // 点击事件
        cell.addEventListener('click', () => {
            this.onDateClick(date);
        });

        // 双击事件 - 快速添加日程
        cell.addEventListener('dblclick', () => {
            openModalForDate(formatDate(date));
        });

        // 确保日期存储在 dataset 中
        cell.dataset.date = dateStr;

        // 拖放区事件监听
        cell.addEventListener('dragover', (e) => {
            e.preventDefault();
            // 支持待办拖放和日程拖放
            if (e.dataTransfer.types.includes('application/x-todo')) {
                e.dataTransfer.dropEffect = 'copy';
                cell.classList.add('drag-over-calendar');
            } else if (e.dataTransfer.types.includes('application/x-calendar-event')) {
                e.dataTransfer.dropEffect = 'move';
                cell.classList.add('drag-over-calendar');
            }
        });

        cell.addEventListener('dragleave', (e) => {
            if (!cell.contains(e.relatedTarget)) {
                cell.classList.remove('drag-over-calendar');
            }
        });

        cell.addEventListener('drop', (e) => {
            e.preventDefault();
            cell.classList.remove('drag-over-calendar');

            // 判断拖放类型
            if (e.dataTransfer.types.includes('application/x-calendar-event')) {
                // 日程拖放 - 修改日期
                this.handleEventDrop(e, dateStr);
            } else if (e.dataTransfer.types.includes('application/x-todo')) {
                // 待办拖放 - 创建日程
                this.handleTodoDrop(e, dateStr);
            }
        });

        grid.appendChild(cell);
    }

    /**
     * 检查日程是否已过
     * @param {Object} event
     * @param {string} dateStr YYYY-MM-DD
     * @returns {boolean}
     */
    isEventPast(event, dateStr) {
        // 如果没有结束时间，只看日期
        if (!event.endTime) {
            const today = formatDate(new Date());
            return dateStr < today;
        }

        // 有结束时间，比较日期+时间
        const eventDateTime = new Date(`${dateStr}T${event.endTime}`);
        const now = new Date();
        return eventDateTime < now;
    }

    /**
     * 处理待办事项拖放到日历单元格
     * @param {DragEvent} e
     * @param {string} dateStr YYYY-MM-DD 格式
     */
    async handleTodoDrop(e, dateStr) {
        try {
            const todoData = JSON.parse(
                e.dataTransfer.getData('application/x-todo')
            );

            if (!todoData || !todoData.id) {
                console.warn('无效的待办数据');
                return;
            }

            await this.createEventFromTodo(todoData, dateStr);
        } catch (err) {
            console.error('处理待办拖放失败:', err);
        }
    }

    /**
     * 处理日程拖放到其他日期单元格
     * @param {DragEvent} e
     * @param {string} newDateStr YYYY-MM-DD 格式
     */
    async handleEventDrop(e, newDateStr) {
        try {
            const eventData = JSON.parse(
                e.dataTransfer.getData('application/x-calendar-event')
            );

            if (!eventData || !eventData.id) {
                console.warn('无效的日程数据');
                return;
            }

            // 如果拖放到同一日期，不做处理
            if (eventData.date === newDateStr) {
                return;
            }

            // 获取原始日程
            const allEvents = await db.getAllEvents();
            const event = allEvents.find(ev => ev.id === eventData.id);

            if (!event) {
                console.warn('找不到日程:', eventData.id);
                return;
            }

            // 保存原始日期用于提示
            const oldDateStr = eventData.date;

            // 更新日程日期
            event.date = newDateStr;
            event.updated_at = new Date().toISOString();

            await db.updateEvent(event);

            // 刷新日历显示
            this.render();

            // 显示成功提示
            showToast(`已将 "${event.title}" 移至 ${newDateStr}`);

            // 如果原始日期或新日期是当前选中的日期，刷新侧边栏
            const selectedDateStr = formatDate(this.selectedDate);
            if (oldDateStr === selectedDateStr || newDateStr === selectedDateStr) {
                this.showEventsForDate(this.selectedDate);
            }
        } catch (err) {
            console.error('处理日程拖放失败:', err);
            showToast('移动日程失败', 'error');
        }
    }

    /**
     * 从待办创建日程
     * @param {Object} todoData 待办数据
     * @param {string} dateStr 目标日期 YYYY-MM-DD
     */
    async createEventFromTodo(todoData, dateStr) {
        const event = {
            id: generateId(),
            title: todoData.text,
            description: '',
            date: dateStr,
            completed: false,      // 新增：完成状态
            fromTodo: true,        // 新增：标记来源为待办
            createdAt: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        await db.addEvent(event);

        // 删除原待办
        if (window.todoList) {
            await window.todoList.todoDB.deleteTodo(todoData.id);
            await window.todoList.loadTodos();
            window.todoList.render();
        }

        // 选中拖放的目标日期
        this.selectedDate = new Date(dateStr);

        // 刷新日历和待办列表
        this.render();
        this.showEventsForDate(new Date(dateStr));

        // 显示成功提示
        showToast(`已转换为日程: ${todoData.text}`);
    }

    /**
     * 切换事件完成状态
     * @param {string} eventId - 事件ID
     */
    async toggleEventCompleted(eventId) {
        const events = await db.getEventsByDate(formatDate(this.selectedDate));
        const event = events.find(e => e.id === eventId);

        if (!event) return;

        // 只允许标记来自待办的事件
        if (!event.fromTodo) {
            showToast('此事件不支持标记完成', 'error');
            return;
        }

        event.completed = !event.completed;
        event.updated_at = new Date().toISOString();

        await db.updateEvent(event);

        // 刷新显示
        this.showEventsForDate(this.selectedDate);
        this.render();
    }

    /**
     * 日期点击事件
     * @param {Date} date
     */
    async onDateClick(date) {
        this.selectedDate = date;
        this.render(); // 重新渲染以更新选中状态
        await this.showEventsForDate(date);
    }

    /**
     * 显示指定日期的日程
     * @param {Date} date
     */
    async showEventsForDate(date) {
        const eventsList = document.getElementById('eventsList');
        const sidebarTitle = document.getElementById('sidebarTitle');
        const mobileEventsList = document.getElementById('mobileEventsList');
        if (!eventsList) return;

        const dateStr = formatDate(date);
        const events = await db.getEventsByDate(dateStr);

        // 更新侧边栏标题
        const options = { month: 'long', day: 'numeric', weekday: 'long' };
        sidebarTitle.textContent = date.toLocaleDateString('zh-CN', options);

        // 生成事件HTML的辅助函数
        const generateEventsHTML = (events, dateStr) => {
            if (events.length === 0) {
                return `
                    <div class="no-events">${dateStr === this.today ? '今天没有日程' : '该日期没有日程'}</div>
                    <button class="btn-add-inline" onclick="openModalForDate('${dateStr}')">添加日程</button>
                `;
            }

            events.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

            let html = '';
            events.forEach(event => {
                const isFromTodo = event.fromTodo;
                const isCompleted = event.completed;
                const completedClass = isCompleted ? 'completed' : '';

                // 来自待办的事件显示复选框
                const checkboxHtml = isFromTodo
                    ? `<input type="checkbox" class="event-checkbox" ${isCompleted ? 'checked' : ''} data-event-id="${event.id}">`
                    : '';

                html += `
                    <div class="event-item ${completedClass}" data-event-id="${event.id}">
                        ${checkboxHtml}
                        <div class="event-content">
                            <div class="event-time">${this.formatEventTime(event)}</div>
                            <div class="event-title">${this.escapeHtml(event.title)}</div>
                            ${event.description ? `<div class="event-description">${this.escapeHtml(event.description)}</div>` : ''}
                        </div>
                    </div>
                `;
            });
            return html;
        };

        // 更新桌面端侧边栏
        eventsList.innerHTML = generateEventsHTML(events, dateStr);

        // 更新移动端内联列表
        if (mobileEventsList) {
            mobileEventsList.innerHTML = generateEventsHTML(events, dateStr);
        }

        // 绑定事件项点击事件
        this.bindEventItemClicks();
    }

    /**
     * 绑定事件项点击事件
     */
    bindEventItemClicks() {
        const eventItems = document.querySelectorAll('.event-item[data-event-id]');

        eventItems.forEach(item => {
            // 原有的点击事件
            item.addEventListener('click', async (e) => {
                // 如果点击的是复选框，不触发展示详情
                if (e.target.classList.contains('event-checkbox')) {
                    return;
                }

                const eventId = item.getAttribute('data-event-id');
                const events = await db.getEventsByDate(formatDate(this.selectedDate));
                const event = events.find(e => e.id === eventId);
                if (event) {
                    this.editEvent(event);
                }
            });

            // 复选框事件
            const checkbox = item.querySelector('.event-checkbox');
            if (checkbox) {
                checkbox.addEventListener('change', async (e) => {
                    e.stopPropagation();
                    const eventId = checkbox.getAttribute('data-event-id');
                    await this.toggleEventCompleted(eventId);
                });
            }
        });
    }

    /**
     * 格式化事件时间显示
     * @param {Object} event
     * @returns {string}
     */
    formatEventTime(event) {
        const start = event.startTime || '';
        const end = event.endTime || '';

        if (start && end) {
            return `${start} - ${end}`;
        } else if (start) {
            return start;
        } else {
            return '全天';
        }
    }

    /**
     * 转义HTML
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 上个月
     */
    prevMonth() {
        this.currentMonth--;
        if (this.currentMonth < 0) {
            this.currentMonth = 11;
            this.currentYear--;
        }
        this.render();
    }

    /**
     * 下个月
     */
    nextMonth() {
        this.currentMonth++;
        if (this.currentMonth > 11) {
            this.currentMonth = 0;
            this.currentYear++;
        }
        this.render();
    }

    /**
     * 返回今天
     */
    goToday() {
        const now = new Date();
        this.currentYear = now.getFullYear();
        this.currentMonth = now.getMonth();
        this.selectedDate = now;
        this.render();
        this.showEventsForDate(now);
    }

    /**
     * 编辑日程
     * @param {Object} event
     */
    editEvent(event) {
        openModal(event);
    }
}
