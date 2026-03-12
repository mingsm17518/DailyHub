// 提醒通知管理模块

/**
 * 提醒管理器类
 * 负责请求通知权限、检查即将到期的日程/待办事项、显示桌面通知
 */
class ReminderManager {
    constructor() {
        this.checkInterval = null;
        this.sentReminders = new Map(); // 记录已发送的提醒，防止重复
        this.CHECK_INTERVAL_MS = 10000; // 每10秒检查一次（测试用）
        this.useInAppOnly = false; // 是否仅使用应用内通知
        this.emailConfig = null; // EmailJS 配置
        this.emailEnabled = false; // 是否启用邮件通知
    }

    /**
     * 初始化提醒管理器
     */
    async init() {
        console.log('ReminderManager: 初始化中...');

        // 检查浏览器支持
        if (!('Notification' in window)) {
            console.warn('浏览器不支持通知 API');
            // 只在首次显示此提示（使用 localStorage 记忆）
            const notSupportedKey = 'notification_not_supported_shown';
            if (!localStorage.getItem(notSupportedKey)) {
                showToast('您的浏览器不支持桌面通知，将使用应用内提醒', 'warning');
                localStorage.setItem(notSupportedKey, 'true');
            }
            this.useInAppOnly = true;
            this.startChecking();
            this.setupVisibilityListener();
            console.log('ReminderManager: 初始化完成（应用内模式）');
            return;
        }

        // 请求通知权限
        const hasPermission = await this.requestPermission();
        if (!hasPermission) {
            console.warn('ReminderManager: 通知权限被拒绝');
            // 只在用户首次看到此提示时显示（使用 localStorage 记忆）
            const promptShownKey = 'notification_prompt_shown';
            if (!localStorage.getItem(promptShownKey)) {
                showToast('通知权限未开启，提醒将仅在应用内显示。请在浏览器设置中允许通知以获得更好的体验。', 'warning');
                localStorage.setItem(promptShownKey, 'true');
            }
            this.useInAppOnly = true;
        } else {
            this.useInAppOnly = false;
            // 只在首次启用通知时显示提示（使用 localStorage 记忆）
            const enabledPromptShownKey = 'notification_enabled_prompt_shown';
            if (!localStorage.getItem(enabledPromptShownKey)) {
                showToast('通知提醒已启用', 'success');
                localStorage.setItem(enabledPromptShownKey, 'true');
            }
            // 如果用户后来授予了权限，清除拒绝时的提示标志
            localStorage.removeItem('notification_prompt_shown');
        }

        // 启动定期检查
        this.startChecking();
        this.setupVisibilityListener();

        console.log('ReminderManager: 初始化完成');
    }

    /**
     * 初始化邮件配置
     */
    initEmailConfig(config) {
        if (!config || !config.serviceId || !config.templateId || !config.publicKey) {
            console.warn('ReminderManager: 邮件配置不完整，邮件通知将被禁用');
            this.emailEnabled = false;
            return false;
        }
        this.emailConfig = config;

        // 检查 EmailJS 是否已加载
        if (typeof emailjs === 'undefined') {
            console.error('ReminderManager: EmailJS SDK 未加载');
            this.emailEnabled = false;
            return false;
        }

        // 初始化 EmailJS
        try {
            emailjs.init(this.emailConfig.publicKey);
            this.emailEnabled = true;
            console.log('ReminderManager: 邮件配置已初始化');
            return true;
        } catch (error) {
            console.error('ReminderManager: EmailJS 初始化失败', error);
            this.emailEnabled = false;
            return false;
        }
    }

    /**
     * 更新邮件通知状态
     */
    setEmailEnabled(enabled) {
        this.emailEnabled = enabled && this.emailConfig !== null;
    }

    /**
     * 设置页面可见性监听器
     */
    setupVisibilityListener() {
        // 监听页面可见性变化，当页面重新可见时立即检查
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('ReminderManager: 页面重新可见，检查提醒');
                this.checkReminders();
            }
        });
    }

    /**
     * 请求浏览器通知权限
     */
    async requestPermission() {
        if (!('Notification' in window)) {
            console.warn('浏览器不支持通知 API');
            return false;
        }

        if (Notification.permission === 'granted') {
            return true;
        }

        if (Notification.permission === 'denied') {
            return false;
        }

        // 请求权限
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }

    /**
     * 启动定期检查
     */
    startChecking() {
        // 立即执行一次检查
        this.checkReminders();

        // 设置定时检查
        this.checkInterval = setInterval(() => {
            this.checkReminders();
        }, this.CHECK_INTERVAL_MS);
    }

    /**
     * 停止定期检查
     */
    stopChecking() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    /**
     * 检查需要提醒的日程和待办事项
     */
    async checkReminders() {
        try {
            const now = new Date();
            console.log('ReminderManager: 开始检查提醒', now.toISOString());

            // 检查日程提醒
            await this.checkEventReminders(now);

            // 检查待办事项提醒
            await this.checkTodoReminders(now);

            // 清理过期的提醒记录（超过1小时的）
            this.cleanupSentReminders(now);

        } catch (error) {
            console.error('ReminderManager: 检查提醒失败', error);
        }
    }

    /**
     * 检查日程提醒
     */
    async checkEventReminders(now) {
        try {
            // console.log('=== checkEventReminders 开始 ===', now.toISOString());

            // 获取接下来7天内的日程
            const endDate = new Date(now);
            endDate.setDate(endDate.getDate() + 7);
            const startDate = new Date(now);
            startDate.setHours(0, 0, 0, 0);

            // 将 Date 对象转换为字符串格式 (YYYY-MM-DD)，因为 getEventsInRange 期望字符串
            const events = await db.getEventsInRange(formatDate(startDate), formatDate(endDate));
            // console.log(`找到 ${events.length} 个事件`);

            for (const event of events) {
                // 检查是否启用了提醒
                if (!event.reminder || !event.reminder.enabled) {
                    console.log(`跳过事件 "${event.title}": 未启用提醒`);
                    continue;
                }

                // 检查日程是否已完成
                if (event.completed) {
                    console.log(`跳过事件 "${event.title}": 已完成`);
                    continue;
                }

                const reminderKey = `event_${event.id}`;
                const minutesBefore = event.reminder.minutesBefore ?? 15;
                console.log(`检查事件: ${event.title}, minutesBefore=${minutesBefore}`);

                // 计算提醒时间
                let eventTime;
                if (event.startTime) {
                    // 有开始时间，使用开始时间
                    const [hours, minutes] = event.startTime.split(':').map(Number);
                    eventTime = new Date(event.date);
                    eventTime.setHours(hours, minutes, 0, 0);
                } else {
                    // 没有开始时间，使用当天0点
                    eventTime = new Date(event.date + 'T00:00:00');
                }

                const reminderTime = new Date(eventTime.getTime() - minutesBefore * 60 * 1000);
                const timeDiff = now.getTime() - reminderTime.getTime();

                console.log(`  事件时间: ${eventTime.toISOString()}`);
                console.log(`  提醒时间: ${reminderTime.toISOString()}`);
                console.log(`  当前时间: ${now.toISOString()}`);
                console.log(`  时间差: ${timeDiff}ms (${Math.round(timeDiff/1000)}秒)`);
                console.log(`  已发送: ${this.sentReminders.has(reminderKey)}`);
                console.log(`  条件检查: timeDiff>=0=${timeDiff>=0}, timeDiff<${this.CHECK_INTERVAL_MS}=${timeDiff<this.CHECK_INTERVAL_MS}`);

                // 如果提醒时间已到（在过去60秒内或正好是现在），且未发送过提醒
                if (timeDiff >= 0 && timeDiff < this.CHECK_INTERVAL_MS && !this.sentReminders.has(reminderKey)) {
                    console.log(`*** 触发提醒: ${event.title} ***`);
                    this.showEventReminder(event, minutesBefore);
                    this.sentReminders.set(reminderKey, now.getTime());
                }

                if (this.sentReminders.has(reminderKey)) {
                    const sentTime = this.sentReminders.get(reminderKey);
                    const secondsAgo = Math.round((now.getTime() - sentTime) / 1000);
                    console.log(`  已在 ${secondsAgo} 秒前发送过提醒`);
                }
            }
        } catch (error) {
            console.error('ReminderManager: 检查日程提醒失败', error);
        }
    }

    /**
     * 检查待办事项提醒
     */
    async checkTodoReminders(now) {
        try {
            if (!window.todoList) {
                return;
            }

            const todos = await todoList.todoDB.getAllTodos();

            for (const todo of todos) {
                // 跳过已完成的待办
                if (todo.done) {
                    continue;
                }

                // 跳过没有截止日期的待办
                if (!todo.dueDate) {
                    continue;
                }

                // 检查是否启用了提醒
                if (!todo.reminder || !todo.reminder.enabled) {
                    continue;
                }

                const reminderKey = `todo_${todo.id}`;
                const daysBefore = todo.reminder.daysBefore || 1;

                // 计算提醒时间
                const dueDate = new Date(todo.dueDate + 'T00:00:00');
                const reminderDate = new Date(dueDate);
                reminderDate.setDate(reminderDate.getDate() - daysBefore);
                reminderDate.setHours(9, 0, 0, 0); // 上午9点提醒

                // 计算时间差
                const timeDiff = now.getTime() - reminderDate.getTime();

                // 检查是否应该在今天提醒（跨天检查）
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const reminderToday = new Date(reminderDate);
                reminderToday.setHours(0, 0, 0, 0);

                const isReminderDay = formatDate(today) === formatDate(reminderToday);

                // 如果是提醒日且未发送过提醒
                if (isReminderDay && !this.sentReminders.has(reminderKey)) {
                    // 检查是否已经过了提醒时间（上午9点）
                    const reminderTime = new Date(reminderDate);
                    reminderTime.setHours(9, 0, 0, 0);

                    if (now.getTime() >= reminderTime.getTime()) {
                        this.showTodoReminder(todo, daysBefore);
                        this.sentReminders.set(reminderKey, now.getTime());
                    }
                }
            }
        } catch (error) {
            console.error('ReminderManager: 检查待办提醒失败', error);
        }
    }

    /**
     * 显示日程提醒通知
     */
    showEventReminder(event, minutesBefore) {
        // 显示桌面通知
        let timeText;
        if (minutesBefore === 0) {
            timeText = '即将开始';
        } else if (minutesBefore < 60) {
            timeText = `${minutesBefore}分钟后开始`;
        } else if (minutesBefore < 1440) {
            const hours = Math.floor(minutesBefore / 60);
            timeText = `${hours}小时后开始`;
        } else {
            const days = Math.floor(minutesBefore / 1440);
            timeText = `${days}天后开始`;
        }

        let message = timeText;
        if (event.startTime) {
            message += ` (${event.startTime})`;
        }

        this.showNotification(
            `📅 日程提醒: ${event.title}`,
            message,
            { tag: `event_${event.id}`, data: { eventId: event.id } }
        );

        // 发送邮件通知
        this.sendEventEmailReminder(event, minutesBefore);
    }

    /**
     * 显示待办事项提醒通知
     */
    showTodoReminder(todo, daysBefore) {
        // 显示桌面通知
        let timeText;
        if (daysBefore === 0) {
            timeText = '今天到期';
        } else if (daysBefore === 1) {
            timeText = '明天到期';
        } else {
            timeText = `${daysBefore}天后到期`;
        }

        const dueDateText = formatDateCN(todo.dueDate);
        const message = `${timeText} (${dueDateText})`;

        this.showNotification(
            `✅ 待办提醒: ${todo.text}`,
            message,
            { tag: `todo_${todo.id}`, data: { todoId: todo.id } }
        );

        // 发送邮件通知
        this.sendTodoEmailReminder(todo, daysBefore);
    }

    /**
     * 显示桌面通知
     */
    showNotification(title, body, options = {}) {
        console.log('showNotification 被调用:', { title, body, options });
        console.log('useInAppOnly:', this.useInAppOnly);
        console.log('Notification.permission:', Notification?.permission);

        // 如果权限被拒绝或使用应用内模式，使用 Toast 降级
        if (this.useInAppOnly || !('Notification' in window) || Notification.permission !== 'granted') {
            console.log('降级到应用内通知');
            this.showInAppNotification(title, body, options);
            return;
        }

        console.log('使用浏览器通知');
        const defaultOptions = {
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📅</text></svg>',
            badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔔</text></svg>',
            requireInteraction: false,
            silent: false
        };

        const notificationOptions = { ...defaultOptions, ...options, body };

        try {
            const notification = new Notification(title, notificationOptions);

            // 点击通知时聚焦窗口
            notification.onclick = () => {
                window.focus();
                notification.close();

                // 可选：跳转到相关内容
                if (options.data) {
                    console.log('ReminderManager: 通知被点击', options.data);
                }
            };

            console.log('ReminderManager: 发送通知', title);
        } catch (error) {
            console.error('ReminderManager: 显示通知失败，降级到应用内通知', error);
            this.showInAppNotification(title, body, options);
        }
    }

    /**
     * 显示应用内通知（Toast 降级）
     */
    showInAppNotification(title, body, options = {}) {
        console.log('showInAppNotification 被调用:', { title, body });
        const message = `${title}\n${body}`;
        console.log('准备调用 showToast:', message);
        showToast(message, 'info');
        console.log('showToast 调用完成');
    }

    /**
     * 发送日程提醒邮件
     */
    async sendEventEmailReminder(event, minutesBefore) {
        if (!this.emailEnabled || !this.emailConfig) {
            return;
        }

        const settings = emailSettings.getSettings();
        if (!settings.enabled || !settings.email) {
            return;
        }

        // 检查提醒时间是否匹配用户设置的偏好
        if (minutesBefore !== settings.reminderMinutes) {
            return;
        }

        try {
            const timeText = this.getReminderText(minutesBefore);
            const eventTime = event.startTime || '全天';
            const eventDate = formatDateCN(event.date);

            const templateParams = {
                to_email: settings.email,
                to_name: settings.email.split('@')[0],
                event_title: event.title,
                event_date: eventDate,
                event_time: eventTime,
                reminder_type: timeText,
                description: event.description || '无备注'
            };

            await emailjs.send(
                this.emailConfig.serviceId,
                this.emailConfig.templateId,
                templateParams
            );

            console.log('ReminderManager: 邮件通知已发送', event.title);
        } catch (error) {
            console.error('ReminderManager: 邮件发送失败', error);
            // 不抛出错误，避免影响桌面通知
        }
    }

    /**
     * 发送待办事项提醒邮件
     */
    async sendTodoEmailReminder(todo, daysBefore) {
        if (!this.emailEnabled || !this.emailConfig) {
            return;
        }

        const settings = emailSettings.getSettings();
        if (!settings.enabled || !settings.email) {
            return;
        }

        // 将天数转换为分钟进行匹配（1天 = 1440分钟）
        const minutesBefore = daysBefore * 1440;
        if (minutesBefore !== settings.reminderMinutes && settings.reminderMinutes < 1440) {
            // 如果用户设置的是分钟级提醒（小于1天），则不发送待办邮件
            return;
        }

        try {
            let timeText;
            if (daysBefore === 0) {
                timeText = '今天到期';
            } else if (daysBefore === 1) {
                timeText = '明天到期';
            } else {
                timeText = `${daysBefore}天后到期`;
            }

            const dueDateText = formatDateCN(todo.dueDate);

            const templateParams = {
                to_email: settings.email,
                to_name: settings.email.split('@')[0],
                todo_title: todo.text,
                due_date: dueDateText,
                reminder_type: timeText
            };

            await emailjs.send(
                this.emailConfig.serviceId,
                this.emailConfig.templateId,
                templateParams
            );

            console.log('ReminderManager: 待办邮件通知已发送', todo.text);
        } catch (error) {
            console.error('ReminderManager: 待办邮件发送失败', error);
        }
    }

    /**
     * 获取提醒文本
     */
    getReminderText(minutesBefore) {
        if (minutesBefore === 0) {
            return '准时提醒';
        } else if (minutesBefore < 60) {
            return `提前 ${minutesBefore} 分钟`;
        } else if (minutesBefore < 1440) {
            const hours = Math.floor(minutesBefore / 60);
            return `提前 ${hours} 小时`;
        } else {
            const days = Math.floor(minutesBefore / 1440);
            return `提前 ${days} 天`;
        }
    }

    /**
     * 清理过期的提醒记录
     */
    cleanupSentReminders(now) {
        const oneHourAgo = now.getTime() - 60 * 60 * 1000;

        for (const [key, timestamp] of this.sentReminders.entries()) {
            if (timestamp < oneHourAgo) {
                this.sentReminders.delete(key);
            }
        }
    }

    /**
     * 重置提醒记录（用于测试或手动触发）
     */
    resetReminders() {
        this.sentReminders.clear();
        console.log('ReminderManager: 已重置提醒记录');
    }

    /**
     * 手动触发提醒检查（用于测试）
     */
    async triggerCheck() {
        console.log('ReminderManager: 手动触发检查');
        await this.checkReminders();
    }
}

/**
 * 格式化日期为中文显示
 */
function formatDateCN(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const today = formatDate(new Date());
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDate(tomorrow);

    if (dateStr === today) {
        return '今天';
    } else if (dateStr === tomorrowStr) {
        return '明天';
    } else {
        return `${date.getMonth() + 1}月${date.getDate()}日`;
    }
}

// 创建全局提醒管理器实例
const reminderManager = new ReminderManager();
