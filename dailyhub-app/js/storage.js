// IndexedDB 存储封装

const DB_NAME = 'CalendarAppDB';
const DB_VERSION = 5;
const STORE_NAME = 'events';

// 配置 API 地址 - 从 config.json 加载
const API_BASE_URL = (typeof DAILYHUB_CONFIG !== 'undefined' && DAILYHUB_CONFIG.API_BASE_URL)
    ? DAILYHUB_CONFIG.API_BASE_URL
    : 'http://localhost:3001/api';

/**
 * 账号管理类
 */
class AccountManager {
    constructor() {
        this.accounts = JSON.parse(localStorage.getItem('calendar_accounts') || '[]');
        this.currentAccountId = localStorage.getItem('calendar_current_account') || null;
    }

    /**
     * 获取当前账号
     */
    getCurrentAccount() {
        if (!this.currentAccountId) return null;
        return this.accounts.find(a => a.id === this.currentAccountId) || null;
    }

    /**
     * 添加账号
     */
    addAccount(username, token) {
        const account = {
            id: generateId(),
            username: username,
            token: token,
            createdAt: new Date().toISOString()
        };
        this.accounts.push(account);
        this.save();
        return account;
    }

    /**
     * 移除账号
     */
    removeAccount(accountId) {
        this.accounts = this.accounts.filter(a => a.id !== accountId);
        if (this.currentAccountId === accountId) {
            this.currentAccountId = this.accounts.length > 0 ? this.accounts[0].id : null;
        }
        this.save();
    }

    /**
     * 切换账号
     */
    switchAccount(accountId) {
        const account = this.accounts.find(a => a.id === accountId);
        if (account) {
            this.currentAccountId = accountId;
            localStorage.setItem('calendar_current_account', accountId);
            return account;
        }
        return null;
    }

    /**
     * 保存到本地存储
     */
    save() {
        localStorage.setItem('calendar_accounts', JSON.stringify(this.accounts));
        if (this.currentAccountId) {
            localStorage.setItem('calendar_current_account', this.currentAccountId);
        } else {
            localStorage.removeItem('calendar_current_account');
        }
    }

    /**
     * 获取所有账号
     */
    getAllAccounts() {
        return this.accounts;
    }
}

/**
 * 云同步管理类
 */
class CloudSync {
    constructor() {
        this.token = null;
        this.username = null;
        this.lastSync = null;
        this.syncInProgress = false;
        this.accountManager = new AccountManager();
        this.loadAccount();
    }

    /**
     * 加载当前账号的登录信息
     */
    loadAccount() {
        const account = this.accountManager.getCurrentAccount();
        if (account) {
            this.token = account.token;
            this.username = account.username;
            this.lastSync = localStorage.getItem(`calendar_last_sync_${account.id}`) || null;
        }
    }

    /**
     * 保存当前账号的登录信息
     */
    saveAccount() {
        const account = this.accountManager.getCurrentAccount();
        if (account) {
            account.token = this.token;
            account.username = this.username;
            this.accountManager.save();
            localStorage.setItem(`calendar_last_sync_${account.id}`, this.lastSync || '');
        }
    }

    /**
     * 检查是否已登录
     */
    isLoggedIn() {
        return !!this.token;
    }

    /**
     * 获取当前账号ID
     */
    getCurrentAccountId() {
        const accountId = this.accountManager.getCurrentAccount()?.id;
        if (!accountId) {
            console.warn('[CloudSync] No account ID available - account may not be loaded yet');
        }
        return accountId;
    }

    /**
     * 获取墓碑存储键
     */
    getTombstoneKey(type) {
        const accountId = this.getCurrentAccountId();
        if (!accountId) {
            console.error(`[CloudSync] Cannot generate tombstone key for ${type} - no account ID`);
            return null; // Return null instead of invalid key
        }
        return `calendar_tombstones_${accountId}_${type}`;
    }

    /**
     * 添加墓碑记录
     */
    addTombstone(type, id) {
        const key = this.getTombstoneKey(type);
        if (!key) {
            console.error(`[CloudSync] Cannot add tombstone for ${type}:${id} - invalid key`);
            return;
        }
        const tombstones = JSON.parse(localStorage.getItem(key) || '{}');
        tombstones[id] = new Date().toISOString();
        localStorage.setItem(key, JSON.stringify(tombstones));
    }

    /**
     * 获取所有墓碑记录
     */
    getTombstones(type) {
        const key = this.getTombstoneKey(type);
        if (!key) {
            console.error(`[CloudSync] Cannot get tombstones for ${type} - invalid key`);
            return {}; // Return empty object instead of crashing
        }
        return JSON.parse(localStorage.getItem(key) || '{}');
    }

    /**
     * 清除旧的墓碑记录（超过30天的）
     */
    clearOldTombstones(type) {
        const key = this.getTombstoneKey(type);
        if (!key) {
            console.error(`[CloudSync] Cannot clear old tombstones for ${type} - invalid key`);
            return;
        }
        const tombstones = JSON.parse(localStorage.getItem(key) || '{}');
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        for (const id in tombstones) {
            const deletedAt = new Date(tombstones[id]);
            if (deletedAt < thirtyDaysAgo) {
                delete tombstones[id];
            }
        }

        localStorage.setItem(key, JSON.stringify(tombstones));
    }

    /**
     * 移除墓碑记录（当云端确认删除后）
     */
    removeTombstone(type, id) {
        const key = this.getTombstoneKey(type);
        if (!key) {
            console.error(`[CloudSync] Cannot remove tombstone for ${type}:${id} - invalid key`);
            return;
        }
        const tombstones = JSON.parse(localStorage.getItem(key) || '{}');
        delete tombstones[id];
        localStorage.setItem(key, JSON.stringify(tombstones));
    }

    /**
     * 用户登录
     */
    async login(username, password) {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '登录失败');
        }

        // 检查账号是否已存在
        const existingAccount = this.accountManager.accounts.find(a => a.username === username);
        if (existingAccount) {
            // 更新已有账号的token
            existingAccount.token = data.token;
            this.accountManager.currentAccountId = existingAccount.id;
        } else {
            // 添加新账号
            const account = this.accountManager.addAccount(username, data.token);
            this.accountManager.currentAccountId = account.id;
        }

        this.token = data.token;
        this.username = data.username;
        this.saveAccount();

        return data;
    }

    /**
     * 用户注册
     */
    async register(username, password, invitationCode = '') {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password, invitation_code: invitationCode })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '注册失败');
        }

        // 添加新账号
        const account = this.accountManager.addAccount(username, data.token);
        this.accountManager.currentAccountId = account.id;

        this.token = data.token;
        this.username = data.username;
        this.saveAccount();

        return data;
    }

    /**
     * 用户登出
     */
    logout() {
        // 清除当前账号信息
        this.token = null;
        this.username = null;
        this.lastSync = null;

        // 清除旧的 localStorage 键（兼容）
        localStorage.removeItem('calendar_token');
        localStorage.removeItem('calendar_username');
        localStorage.removeItem('calendar_last_sync');
    }

    /**
     * 切换账号
     */
    switchAccount(accountId) {
        const account = this.accountManager.switchAccount(accountId);
        if (account) {
            this.loadAccount();
            return account;
        }
        return null;
    }

    /**
     * 移除账号
     */
    removeAccount(accountId) {
        this.accountManager.removeAccount(accountId);
        // 如果移除的是当前账号，切换到其他账号或登出
        const currentAccount = this.accountManager.getCurrentAccount();
        if (currentAccount) {
            this.loadAccount();
        } else {
            this.logout();
        }
    }

    /**
     * 获取所有账号
     */
    getAllAccounts() {
        return this.accountManager.getAllAccounts();
    }

    /**
     * 获取当前账号ID
     */
    getCurrentAccountId() {
        return this.accountManager.currentAccountId;
    }

    /**
     * 获取认证头
     */
    getAuthHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
        };
    }

    /**
     * 上传单个事件到云端（保留原有updated_at时间戳，避免干扰同步逻辑）
     */
    async uploadEvent(event) {
        if (!this.token) return null;

        try {
            const uploadData = {
                ...event
            };
            // 保留原有的 createdAt 和 updated_at，不更新它们
            // 这样可以让同步逻辑正确判断是否需要上传
            if (event.createdAt) {
                uploadData.createdAt = event.createdAt;
            }
            if (event.updated_at) {
                uploadData.updated_at = event.updated_at;
            }

            const response = await fetch(`${API_BASE_URL}/events`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(uploadData)
            });

            if (!response.ok) {
                throw new Error('上传失败');
            }

            return await response.json();
        } catch (err) {
            console.error('上传事件失败:', err);
            return null;
        }
    }

    /**
     * 从云端删除事件
     */
    async deleteEvent(eventId) {
        if (!this.token) return false;

        try {
            const response = await fetch(`${API_BASE_URL}/events/${eventId}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });

            if (response.ok) {
                // 添加墓碑记录，防止其他设备恢复已删除的数据
                this.addTombstone('events', eventId);
            }

            return response.ok || response.status === 404;
        } catch (err) {
            console.warn('删除云端事件失败:', err);
            return false;
        }
    }

    /**
     * 从云端获取所有事件（不处理墓碑，返回完整数据）
     * @returns {Promise<Object>} 返回格式: { events: [], deleted_events: [] }
     */
    async fetchAllEvents() {
        if (!this.token) return { events: [], deleted_events: [] };

        try {
            // 获取本地事件墓碑记录
            const eventTombstones = this.getTombstones('events');
            const deletedIds = Object.keys(eventTombstones);

            let url = `${API_BASE_URL}/events`;
            if (deletedIds.length > 0) {
                url += `?deleted=${encodeURIComponent(deletedIds.join(','))}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error('获取事件失败');
            }

            const result = await response.json();
            // 返回完整数据，不处理墓碑
            return {
                events: result.events || [],
                deleted_events: result.deleted_events || []
            };
        } catch (err) {
            console.error('获取云端事件失败:', err);
            return null;
        }
    }

    /**
     * 增量同步：获取指定时间后更新的事件
     */
    async fetchEventsSince(since) {
        if (!this.token) return [];

        try {
            const url = since ? `${API_BASE_URL}/sync?since=${encodeURIComponent(since)}` : `${API_BASE_URL}/sync`;
            const response = await fetch(url, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error('同步失败');
            }

            return await response.json();
        } catch (err) {
            console.error('增量同步失败:', err);
            return [];
        }
    }

    /**
     * 批量上传本地事件到云端
     */
    async batchUpload(localEvents) {
        if (!this.token || !localEvents.length) return [];

        try {
            const response = await fetch(`${API_BASE_URL}/events/batch`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    events: localEvents.map(e => ({
                        ...e
                        // 保留原有的 updated_at，不强制更新
                        // 这样可以让同步逻辑正确判断是否需要上传
                    }))
                })
            });

            if (!response.ok) {
                throw new Error('批量上传失败');
            }

            const data = await response.json();
            return data.all_events || [];
        } catch (err) {
            console.error('批量上传失败:', err);
            return [];
        }
    }

    /**
     * 获取云端所有待办事项（不处理墓碑，返回完整数据）
     * @returns {Promise<Object>} 返回格式: { todos: [], deleted_todos: [] }
     */
    async fetchAllTodos() {
        if (!this.token) return { todos: [], deleted_todos: [] };

        // Guard: Ensure account is loaded before syncing
        if (!this.getCurrentAccountId()) {
            console.warn('[CloudSync] Skipping todo fetch - account not loaded yet');
            return { todos: [], deleted_todos: [] };
        }

        try {
            // 获取本地待办事项墓碑记录
            const todoTombstones = this.getTombstones('todos');
            const deletedIds = Object.keys(todoTombstones);

            let url = `${API_BASE_URL}/todos`;
            if (deletedIds.length > 0) {
                url += `?deleted=${encodeURIComponent(deletedIds.join(','))}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error('获取待办事项失败');
            }

            const result = await response.json();
            // 返回完整数据，不处理墓碑
            return {
                todos: result.todos || [],
                deleted_todos: result.deleted_todos || []
            };
        } catch (err) {
            console.error('获取云端待办事项失败:', err);
            return null;
        }
    }

    /**
     * 批量上传本地待办事项到云端
     */
    async batchUploadTodos(localTodos) {
        if (!this.token || !localTodos.length) return [];

        try {
            const response = await fetch(`${API_BASE_URL}/todos/batch`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    todos: localTodos.map(t => ({
                        ...t
                        // 保留原有的 updated_at，不强制更新
                        // 这样可以让同步逻辑正确判断是否需要上传
                    }))
                })
            });

            if (!response.ok) {
                throw new Error('批量上传待办失败');
            }

            const data = await response.json();
            return data.all_todos || [];
        } catch (err) {
            console.error('批量上传待办失败:', err);
            return [];
        }
    }

    /**
     * 上传单个待办事项到云端（保留原有updated_at时间戳，避免干扰同步逻辑）
     */
    async uploadTodo(todo) {
        if (!this.token) return null;

        try {
            const uploadData = {
                ...todo
            };
            // 保留原有的 createdAt 和 updated_at，不更新它们
            // 这样可以让同步逻辑正确判断是否需要上传
            if (todo.createdAt) {
                uploadData.createdAt = todo.createdAt;
            }
            if (todo.updated_at) {
                uploadData.updated_at = todo.updated_at;
            }

            const response = await fetch(`${API_BASE_URL}/todos`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(uploadData)
            });

            if (!response.ok) {
                throw new Error('上传待办失败');
            }

            return await response.json();
        } catch (err) {
            console.error('上传待办失败:', err);
            return null;
        }
    }

    /**
     * 从云端删除待办事项
     */
    async deleteTodo(todoId) {
        if (!this.token) return false;

        try {
            const response = await fetch(`${API_BASE_URL}/todos/${todoId}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });

            if (response.ok) {
                // 添加墓碑记录，防止其他设备恢复已删除的数据
                this.addTombstone('todos', todoId);
            }

            return response.ok || response.status === 404;
        } catch (err) {
            console.warn('删除云端待办失败:', err);
            return false;
        }
    }

    /**
     * 清除服务器端的待办事项墓碑记录
     * 通过重新上传待办来"恢复"它，从而清除服务器端的墓碑
     * @param {string} todoId - 待办事项ID
     */
    async clearTodoTombstoneOnServer(todoId) {
        // This tells the server to clear the tombstone for this todo
        // by re-uploading the todo, effectively "restoring" it
        console.log(`[CloudSync] Clearing tombstone for todo ${todoId} on server`);
        // The todo will be re-uploaded during the normal sync process
        // which will clear the tombstone on the server
    }

    /**
     * ========== 时间记录云同步方法 ==========
     */

    /**
     * 上传单个时间记录到云端
     */
    async uploadTimeEntry(entry) {
        if (!this.token) return null;

        try {
            const uploadData = { ...entry };
            if (entry.createdAt) {
                uploadData.createdAt = entry.createdAt;
            }
            if (entry.updated_at) {
                uploadData.updated_at = entry.updated_at;
            }

            const response = await fetch(`${API_BASE_URL}/time-entries`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(uploadData)
            });

            if (!response.ok) {
                throw new Error('上传时间记录失败');
            }

            return await response.json();
        } catch (err) {
            console.error('上传时间记录失败:', err);
            return null;
        }
    }

    /**
     * 批量上传时间记录到云端
     */
    async batchUploadTimeEntries(entries) {
        if (!this.token || !entries.length) return [];

        try {
            const response = await fetch(`${API_BASE_URL}/time-entries/batch`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    entries: entries.map(e => ({ ...e }))
                })
            });

            if (!response.ok) {
                throw new Error('批量上传时间记录失败');
            }

            const data = await response.json();
            return data.all_entries || [];
        } catch (err) {
            console.error('批量上传时间记录失败:', err);
            return [];
        }
    }

    /**
     * 从云端获取所有时间记录
     * @returns {Promise<Object>} 返回格式: { entries: [], deleted_entries: [] }
     */
    async fetchAllTimeEntries() {
        if (!this.token) return { entries: [], deleted_entries: [] };

        try {
            const tombstones = this.getTombstones('time_entries');
            const deletedIds = Object.keys(tombstones);

            let url = `${API_BASE_URL}/time-entries`;
            if (deletedIds.length > 0) {
                url += `?deleted=${encodeURIComponent(deletedIds.join(','))}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error('获取时间记录失败');
            }

            const result = await response.json();
            return {
                entries: result.entries || [],
                deleted_entries: result.deleted_entries || []
            };
        } catch (err) {
            console.error('获取云端时间记录失败:', err);
            return null;
        }
    }

    /**
     * 从云端删除时间记录
     */
    async deleteTimeEntry(entryId) {
        if (!this.token) return false;

        try {
            const response = await fetch(`${API_BASE_URL}/time-entries/${entryId}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });

            if (response.ok) {
                this.addTombstone('time_entries', entryId);
            }

            return response.ok || response.status === 404;
        } catch (err) {
            console.warn('删除云端时间记录失败:', err);
            return false;
        }
    }

    /**
     * ========== 习惯云同步方法 ==========
     */

    /**
     * 上传单个习惯到云端
     */
    async uploadHabit(habit) {
        if (!this.token) return null;

        try {
            const uploadData = { ...habit };
            const response = await fetch(`${API_BASE_URL}/habits`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(uploadData)
            });

            if (response.ok) {
                const result = await response.json();
                return result.habit || habit;
            }
            return null;
        } catch (err) {
            console.warn('上传习惯到云端失败:', err);
            return null;
        }
    }

    /**
     * 从云端删除习惯
     */
    async deleteHabit(habitId) {
        if (!this.token) return false;

        try {
            const response = await fetch(`${API_BASE_URL}/habits/${habitId}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });

            if (response.ok) {
                this.addTombstone('habits', habitId);
            }

            return response.ok || response.status === 404;
        } catch (err) {
            console.warn('删除云端习惯失败:', err);
            return false;
        }
    }

    /**
     * 上传单个打卡记录到云端
     */
    async uploadHabitLog(log) {
        if (!this.token) return null;

        try {
            const uploadData = { ...log };
            const response = await fetch(`${API_BASE_URL}/habit-logs/checkin`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(uploadData)
            });

            if (response.ok) {
                const result = await response.json();
                return result.log || log;
            }
            return null;
        } catch (err) {
            console.warn('上传打卡记录到云端失败:', err);
            return null;
        }
    }

    /**
     * 从云端删除打卡记录
     */
    async deleteHabitLog(logId) {
        if (!this.token) return false;

        try {
            const response = await fetch(`${API_BASE_URL}/habit-logs/${logId}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });

            return response.ok || response.status === 404;
        } catch (err) {
            console.warn('删除云端打卡记录失败:', err);
            return false;
        }
    }

    /**
     * 获取所有习惯数据
     */
    async fetchAllHabits() {
        if (!this.token) return { habits: [], logs: [], deleted_habits: [] };

        try {
            // 获取本地习惯墓碑记录
            const habitTombstones = this.getTombstones('habits');
            const deletedIds = Object.keys(habitTombstones);

            let url = `${API_BASE_URL}/habits`;
            if (deletedIds.length > 0) {
                url += `?deleted=${encodeURIComponent(deletedIds.join(','))}`;
            }

            const [habitsResponse, logsResponse] = await Promise.all([
                fetch(url, { headers: this.getAuthHeaders() }),
                fetch(`${API_BASE_URL}/habit-logs`, { headers: this.getAuthHeaders() })
            ]);

            const habitsData = habitsResponse.ok ? await habitsResponse.json() : { habits: [], deleted_habits: [] };
            const logsData = logsResponse.ok ? await logsResponse.json() : { logs: [] };

            return {
                habits: habitsData.habits || [],
                logs: logsData.logs || [],
                deleted_habits: habitsData.deleted_habits || []
            };
        } catch (err) {
            console.warn('获取云端习惯数据失败:', err);
            return null;
        }
    }

    /**
     * 从云端获取所有笔记
     */
    async fetchAllNotes() {
        if (!this.token) return { notes: [], deleted_notes: [] };

        try {
            // Get local note tombstones
            const noteTombstones = this.getTombstones('notes');
            const deletedIds = Object.keys(noteTombstones);

            let url = `${API_BASE_URL}/notes`;
            if (deletedIds.length > 0) {
                url += `?deleted=${encodeURIComponent(deletedIds.join(','))}`;
            }

            const response = await fetch(url, { headers: this.getAuthHeaders() });
            const data = response.ok ? await response.json() : { notes: [], deleted_notes: [] };

            return {
                notes: data.notes || [],
                deleted_notes: data.deleted_notes || []
            };
        } catch (err) {
            console.warn('获取云端笔记数据失败:', err);
            return null;
        }
    }

    /**
     * 上传笔记到云端
     */
    async uploadNote(note) {
        if (!this.token) return null;

        try {
            const uploadData = {
                id: note.id || note.date,
                date: note.date,
                content: note.content,
                createdAt: note.created_at,
                updatedAt: note.updated_at
            };

            const response = await fetch(`${API_BASE_URL}/notes`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(uploadData)
            });

            if (response.ok) {
                const result = await response.json();
                return result;
            }
            return null;
        } catch (err) {
            console.warn('上传笔记到云端失败:', err);
            return null;
        }
    }

    /**
     * 从云端删除笔记
     */
    async deleteNote(date) {
        if (!this.token) return false;

        try {
            const response = await fetch(`${API_BASE_URL}/notes/${date}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });

            return response.ok;
        } catch (err) {
            console.warn('从云端删除笔记失败:', err);
            return false;
        }
    }

    /**
     * 更新同步时间
     */
    updateSyncTime() {
        this.lastSync = new Date().toISOString();
        const account = this.accountManager.getCurrentAccount();
        if (account) {
            localStorage.setItem(`calendar_last_sync_${account.id}`, this.lastSync);
        }
    }

    /**
     * 专门处理服务器返回的墓碑列表
     * @param {string} type - 'events', 'todos', 'time_entries', 或 'habits'
     * @param {Array} deletedIds - 服务器返回的已删除ID列表
     */
    async processServerTombstones(type, deletedIds) {
        // Guard: If account is not loaded, do NOT process any tombstones
        if (!this.getCurrentAccountId()) {
            console.error(`[CloudSync] CRITICAL: Refusing to process ${type} tombstones - account not loaded`);
            return;
        }

        if (!Array.isArray(deletedIds) || deletedIds.length === 0) {
            return;
        }

        // 保护逻辑：如果墓碑列表过大，可能是数据异常，跳过处理
        // 防止刷新页面后所有待办被误删的问题
        if (type === 'todos' && deletedIds.length > 20) {
            console.warn(`[CloudSync] Skipping ${type} tombstone processing - too many tombstones (${deletedIds.length}), possible data inconsistency`);
            return;
        }

        // console.log(`[CloudSync] Processing ${deletedIds.length} server tombstones for ${type}`);

        for (const id of deletedIds) {
            if (type === 'events') {
                // 删除本地的事件（不触发同步）
                await db.deleteEventWithoutSync(id);
                // 移除本地墓碑记录
                this.removeTombstone('events', id);
            } else if (type === 'todos') {
                // 删除本地的待办事项（不触发同步）
                const localTodo = await todoList.todoDB.getTodoById(id);
                if (localTodo) {
                    // Delete the local todo without triggering sync
                    await todoList.todoDB.deleteTodoWithoutSync(id);
                }
                // 移除本地墓碑记录
                this.removeTombstone('todos', id);
            } else if (type === 'time_entries') {
                // 删除本地的时间记录
                await db.deleteTimeEntryWithoutSync(id);
                // 移除本地墓碑记录
                this.removeTombstone('time_entries', id);
            } else if (type === 'habits') {
                // 删除本地的习惯
                await db.deleteHabit(id);
                // 移除本地墓碑记录
                this.removeTombstone('habits', id);
            } else if (type === 'notes') {
                // 删除本地的笔记
                await db.deleteNoteWithoutSync(id);
                // 移除本地墓碑记录
                this.removeTombstone('notes', id);
            }
        }
    }

    /**
     * 获取同步状态文本
     */
    getSyncStatusText() {
        if (!this.token) return '未登录';
        if (!this.lastSync) return '从未同步';

        const syncDate = new Date(this.lastSync);
        const now = new Date();
        const diffMinutes = Math.floor((now - syncDate) / 60000);

        if (diffMinutes < 1) return '刚刚同步';
        if (diffMinutes < 60) return `${diffMinutes}分钟前同步`;
        if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}小时前同步`;
        return `${Math.floor(diffMinutes / 1440)}天前同步`;
    }
}

/**
 * IndexedDB 数据库操作类
 */
class CalendarDB {
    constructor() {
        this.db = null;
        this.cloudSync = new CloudSync();
        this.autoSyncEnabled = true;
    }

    /**
     * 初始化数据库
     * @returns {Promise<void>}
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('数据库打开失败:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 创建对象存储
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('date', 'date', { unique: false });
                }

                // 创建时间记录存储
                if (!db.objectStoreNames.contains('time_entries')) {
                    const timeStore = db.createObjectStore('time_entries', { keyPath: 'id' });
                    timeStore.createIndex('startTime', 'startTime', { unique: false });
                }

                // 创建时间标签存储
                if (!db.objectStoreNames.contains('time_tags')) {
                    const tagStore = db.createObjectStore('time_tags', { keyPath: 'id' });
                    tagStore.createIndex('name', 'name', { unique: false });
                }

                // 创建习惯存储
                if (!db.objectStoreNames.contains('habits')) {
                    const habitStore = db.createObjectStore('habits', { keyPath: 'id' });
                }

                // 创建打卡记录存储
                if (!db.objectStoreNames.contains('habitLogs')) {
                    const logStore = db.createObjectStore('habitLogs', { keyPath: 'id' });
                    logStore.createIndex('habitId', 'habitId', { unique: false });
                }

                // 创建每日笔记存储
                if (!db.objectStoreNames.contains('daily_notes')) {
                    const noteStore = db.createObjectStore('daily_notes', { keyPath: 'id' });
                    noteStore.createIndex('date', 'date', { unique: false });
                }
            };
        });
    }

    /**
     * 添加日程
     * @param {Object} event
     * @returns {Promise<string>}
     */
    async addEvent(event) {
        return new Promise(async (resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(event);

            request.onsuccess = async () => {
                // 自动上传到云端
                if (this.autoSyncEnabled && this.cloudSync.isLoggedIn()) {
                    this.cloudSync.uploadEvent(event).catch(err => {
                        console.warn('自动上传失败:', err);
                    });
                }
                resolve(event.id);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 更新日程
     * @param {Object} event
     * @returns {Promise<void>}
     */
    async updateEvent(event) {
        return new Promise(async (resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(event);

            request.onsuccess = async () => {
                // 自动上传到云端
                if (this.autoSyncEnabled && this.cloudSync.isLoggedIn()) {
                    this.cloudSync.uploadEvent(event).catch(err => {
                        console.warn('自动上传失败:', err);
                    });
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 删除日程
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteEvent(id) {
        return new Promise(async (resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = async () => {
                // 从云端删除（等待完成）
                if (this.autoSyncEnabled && this.cloudSync.isLoggedIn()) {
                    try {
                        await this.cloudSync.deleteEvent(id);
                    } catch (err) {
                        console.warn('云端删除失败:', err);
                    }
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取单个日程
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getEvent(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result || null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取指定日期的所有日程
     * @param {string} date YYYY-MM-DD
     * @returns {Promise<Array>}
     */
    async getEventsByDate(date) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('date');
            const request = index.getAll(date);

            request.onsuccess = () => {
                resolve(request.result || []);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取所有日程
     * @returns {Promise<Array>}
     */
    async getAllEvents() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const events = request.result || [];
                // 按时间排序
                events.sort((a, b) => {
                    if (a.date !== b.date) {
                        return a.date.localeCompare(b.date);
                    }
                    return (a.startTime || '').localeCompare(b.startTime || '');
                });
                resolve(events);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取日期范围内的所有日程
     * @param {string} startDate
     * @param {string} endDate
     * @returns {Promise<Array>}
     */
    async getEventsInRange(startDate, endDate) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const events = request.result || [];
                const filtered = events.filter(event => {
                    return event.date >= startDate && event.date <= endDate;
                });
                resolve(filtered);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 清空所有数据
     * @returns {Promise<void>}
     */
    async clearAll() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 批量导入日程
     * @param {Array} events
     * @returns {Promise<number>}
     */
    async importEvents(events) {
        let imported = 0;

        for (const event of events) {
            try {
                await this.addEvent(event);
                imported++;
            } catch (err) {
                console.error('导入日程失败:', event, err);
            }
        }

        return imported;
    }

    /**
     * 从云端同步所有事件（替换本地数据）
     * @returns {Promise<number>} 同步的事件数量
     */
    async syncFromCloud() {
        if (!this.cloudSync.isLoggedIn()) {
            throw new Error('请先登录');
        }

        // 获取云端数据
        const cloudData = await this.cloudSync.fetchAllEvents();

        // 先处理服务器墓碑，删除本地对应的已删除数据
        await this.cloudSync.processServerTombstones('events', cloudData.deleted_events || []);

        // 清空本地数据
        await this.clearAll();

        // 导入云端数据
        const cloudEvents = cloudData.events || [];
        for (const event of cloudEvents) {
            try {
                await this.addEventWithoutSync(event);
            } catch (err) {
                console.error('导入云端事件失败:', event, err);
            }
        }

        this.cloudSync.updateSyncTime();
        return cloudEvents.length;
    }

    /**
     * 双向同步：合并本地和云端数据
     * @returns {Promise<Object>} 同步结果统计
     */
    async biDirectionalSync() {
        if (!this.cloudSync.isLoggedIn()) {
            throw new Error('请先登录');
        }

        // 第一步：获取云端数据（包含墓碑列表）
        const cloudEventsData = await this.cloudSync.fetchAllEvents();
        const cloudTodosData = await this.cloudSync.fetchAllTodos();
        const cloudTimeEntriesData = await this.cloudSync.fetchAllTimeEntries();
        const cloudHabitsData = await this.cloudSync.fetchAllHabits();
        const cloudNotesData = await this.cloudSync.fetchAllNotes();

        // 如果获取失败，标记失败状态，保留本地数据不覆盖
        const fetchFailed = {
            events: !cloudEventsData,
            todos: !cloudTodosData,
            timeEntries: !cloudTimeEntriesData,
            habits: !cloudHabitsData,
            notes: !cloudNotesData
        };

        // 为失败的数据提供空数据，避免后续代码报错
        const safeCloudEventsData = cloudEventsData || { events: [], deleted_events: [] };
        const safeCloudTodosData = cloudTodosData || { todos: [], deleted_todos: [] };
        const safeCloudTimeEntriesData = cloudTimeEntriesData || { entries: [], deleted_entries: [] };
        const safeCloudHabitsData = cloudHabitsData || { habits: [], logs: [], deleted_habits: [] };
        const safeCloudNotesData = cloudNotesData || { notes: [], deleted_notes: [] };

        if (fetchFailed.events) console.warn('[Sync] 获取Events失败，保留本地数据');
        if (fetchFailed.todos) console.warn('[Sync] 获取Todos失败，保留本地数据');
        if (fetchFailed.timeEntries) console.warn('[Sync] 获取TimeEntries失败，保留本地数据');
        if (fetchFailed.habits) console.warn('[Sync] 获取Habits失败，保留本地数据');
        if (fetchFailed.notes) console.warn('[Sync] 获取Notes失败，保留本地数据');

        // 第二步：先处理服务器墓碑，删除本地对应的已删除数据
        // 这样可以防止已删除的数据被上传回云端
        await this.cloudSync.processServerTombstones('events', safeCloudEventsData.deleted_events || []);
        await this.cloudSync.processServerTombstones('todos', safeCloudTodosData.deleted_todos || []);
        await this.cloudSync.processServerTombstones('time_entries', safeCloudTimeEntriesData.deleted_entries || []);
        await this.cloudSync.processServerTombstones('habits', safeCloudHabitsData.deleted_habits || []);
        await this.cloudSync.processServerTombstones('notes', safeCloudNotesData.deleted_notes || []);

        // 第三步：墓碑处理完成后，再获取本地数据进行同步
        // 此时本地数据已经是最新状态（已删除的数据已被移除）
        const localEvents = await this.getAllEvents();
        const cloudEvents = safeCloudEventsData.events || [];

        const localMap = new Map(localEvents.map(e => [e.id, e]));
        const cloudMap = new Map(cloudEvents.map(e => [e.id, e]));

        let uploaded = 0;
        let downloaded = 0;
        let deleted = 0;
        let conflicts = 0;

        // 找出只在本地的事件
        for (const [id, localEvent] of localMap) {
            if (!cloudMap.has(id)) {
                // 本地有，云端没有：需要检查是否应该上传

                // 关键修复：检查本地墓碑记录
                // 如果有本地墓碑，说明这个事件是被当前设备删除的
                // 不应该上传到云端（服务器可能已经删除了这个事件）
                const tombstones = this.cloudSync.getTombstones('events');
                if (tombstones[id]) {
                    // 有本地墓碑，跳过上传（这个事件是本设备删除的）
                    // 同时清理墓碑记录（因为云端已经没有这个事件了）
                    this.cloudSync.removeTombstone('events', id);
                    continue;
                }

                // 没有墓碑记录，尝试上传到云端
                // 这可能是：
                // 1. 新创建的事件
                // 2. 云端数据丢失（服务器重置、账号切换等）
                const result = await this.cloudSync.uploadEvent(localEvent);
                if (result && result.id) {
                    // 上传成功后，用云端返回的数据更新本地
                    await this.addEventWithoutSync(result);
                    // 更新 map 中的引用
                    localMap.set(id, result);
                    uploaded++;
                }
                // 上传失败也不删除本地数据，保留本地副本
            }
        }

        // 处理云端有的事件
        for (const [id, cloudEvent] of cloudMap) {
            const localEvent = localMap.get(id);

            if (!localEvent) {
                // 只有云端有，下载
                await this.addEventWithoutSync(cloudEvent);
                downloaded++;
            } else {
                // 两边都有，比较更新时间（冲突处理：最后修改优先）
                const localTime = new Date(localEvent.updated_at || 0);
                const cloudTime = new Date(cloudEvent.updated_at || 0);

                if (cloudTime > localTime) {
                    // 云端更新，使用云端版本
                    await this.addEventWithoutSync(cloudEvent);
                    downloaded++;
                } else if (localTime > cloudTime) {
                    // 本地更新，上传到云端
                    await this.cloudSync.uploadEvent(localEvent);
                    uploaded++;
                }
                conflicts++;
            }
        }

        // 同步待办事项
        const localTodos = await todoList.todoDB.getAllTodos();
        const cloudTodos = safeCloudTodosData.todos || [];

        const localTodoMap = new Map(localTodos.map(t => [t.id, t]));
        const cloudTodoMap = new Map(cloudTodos.map(t => [t.id, t]));

        let todoUploaded = 0;
        let todoDownloaded = 0;
        let todoDeleted = 0;
        let todoConflicts = 0;

        // 找出只在本地的待办事项
        for (const [id, localTodo] of localTodoMap) {
            if (!cloudTodoMap.has(id)) {
                // 本地有，云端没有：需要检查是否应该上传

                // 关键修复：检查本地墓碑记录
                // 如果有本地墓碑，说明这个待办是被当前设备删除的
                // 不应该上传到云端（服务器可能已经删除了这个待办）
                const tombstones = this.cloudSync.getTombstones('todos');
                if (tombstones[id]) {
                    // 有本地墓碑，跳过上传（这个待办是本设备删除的）
                    // 同时清理墓碑记录（因为云端已经没有这个待办了）
                    this.cloudSync.removeTombstone('todos', id);
                    continue;
                }

                // 没有墓碑记录，尝试上传到云端
                const result = await this.cloudSync.uploadTodo(localTodo);
                if (result && result.id) {
                    // 上传成功后，用云端返回的数据更新本地
                    await todoList.todoDB.updateTodoWithoutSync(result);
                    // 更新 map 中的引用
                    localTodoMap.set(id, result);
                    todoUploaded++;
                }
                // 上传失败也不删除本地数据，保留本地副本
            }
        }

        // 处理云端有的待办事项
        for (const [id, cloudTodo] of cloudTodoMap) {
            const localTodo = localTodoMap.get(id);

            if (!localTodo) {
                // 只有云端有，下载
                await todoList.todoDB.addTodoWithoutSync(cloudTodo);
                todoDownloaded++;
            } else {
                // 两边都有，比较更新时间
                const localTime = new Date(localTodo.updated_at || 0);
                const cloudTime = new Date(cloudTodo.updated_at || 0);

                if (cloudTime > localTime) {
                    // 云端更新，使用云端版本
                    await todoList.todoDB.updateTodoWithoutSync(cloudTodo);
                    todoDownloaded++;
                } else if (localTime > cloudTime) {
                    // 本地更新，上传到云端
                    await this.cloudSync.uploadTodo(localTodo);
                    todoUploaded++;
                }
                todoConflicts++;
            }
        }

        // 同步时间记录
        const localTimeEntries = await this.getAllTimeEntries();
        const cloudTimeEntries = safeCloudTimeEntriesData.entries || [];

        const localTimeEntryMap = new Map(localTimeEntries.map(e => [e.id, e]));
        const cloudTimeEntryMap = new Map(cloudTimeEntries.map(e => [e.id, e]));

        let timeUploaded = 0;
        let timeDownloaded = 0;
        let timeConflicts = 0;

        // 找出只在本地的时间记录
        for (const [id, localEntry] of localTimeEntryMap) {
            if (!cloudTimeEntryMap.has(id)) {
                const tombstones = this.cloudSync.getTombstones('time_entries');
                if (tombstones[id]) {
                    this.cloudSync.removeTombstone('time_entries', id);
                    continue;
                }

                const result = await this.cloudSync.uploadTimeEntry(localEntry);
                if (result && result.id) {
                    await this.addTimeEntryWithoutSync(result);
                    localTimeEntryMap.set(id, result);
                    timeUploaded++;
                }
            }
        }

        // 处理云端有的时间记录
        for (const [id, cloudEntry] of cloudTimeEntryMap) {
            const localEntry = localTimeEntryMap.get(id);

            if (!localEntry) {
                await this.addTimeEntryWithoutSync(cloudEntry);
                timeDownloaded++;
            } else {
                const localTime = new Date(localEntry.updated_at || 0);
                const cloudTime = new Date(cloudEntry.updated_at || 0);

                if (cloudTime > localTime) {
                    await this.addTimeEntryWithoutSync(cloudEntry);
                    timeDownloaded++;
                } else if (localTime > cloudTime) {
                    await this.cloudSync.uploadTimeEntry(localEntry);
                    timeUploaded++;
                }
                timeConflicts++;
            }
        }

        // 同步习惯数据
        const localHabits = await this.getAllHabits();
        const cloudHabits = safeCloudHabitsData.habits || [];

        const localHabitMap = new Map(localHabits.map(h => [h.id, h]));
        const cloudHabitMap = new Map(cloudHabits.map(h => [h.id, h]));

        let habitUploaded = 0;
        let habitDownloaded = 0;
        let habitConflicts = 0;

        // 找出只在本地的习惯
        for (const [id, localHabit] of localHabitMap) {
            if (!cloudHabitMap.has(id)) {
                const tombstones = this.cloudSync.getTombstones('habits');
                if (tombstones[id]) {
                    this.cloudSync.removeTombstone('habits', id);
                    continue;
                }

                const result = await this.cloudSync.uploadHabit(localHabit);
                if (result && result.id) {
                    await this.addHabitWithoutSync(result);
                    localHabitMap.set(id, result);
                    habitUploaded++;
                }
            }
        }

        // 处理云端有的习惯
        for (const [id, cloudHabit] of cloudHabitMap) {
            const localHabit = localHabitMap.get(id);

            if (!localHabit) {
                await this.addHabitWithoutSync(cloudHabit);
                habitDownloaded++;
            } else {
                const localTime = new Date(localHabit.updated_at || 0);
                const cloudTime = new Date(cloudHabit.updated_at || 0);

                if (cloudTime > localTime) {
                    await this.addHabitWithoutSync(cloudHabit);
                    habitDownloaded++;
                } else if (localTime > cloudTime) {
                    await this.cloudSync.uploadHabit(localHabit);
                    habitUploaded++;
                }
                habitConflicts++;
            }
        }

        // 同步习惯打卡记录
        const localHabitLogs = await this.getAllHabitLogs();
        const cloudHabitLogs = safeCloudHabitsData.logs || [];

        const localLogMap = new Map(localHabitLogs.map(l => [l.id, l]));
        const cloudLogMap = new Map(cloudHabitLogs.map(l => [l.id, l]));

        let logUploaded = 0;
        let logDownloaded = 0;

        // 找出只在本地的打卡记录
        for (const [id, localLog] of localLogMap) {
            if (!cloudLogMap.has(id)) {
                const result = await this.cloudSync.uploadHabitLog(localLog);
                if (result && result.id) {
                    logUploaded++;
                }
            }
        }

        // 处理云端有的打卡记录
        for (const [id, cloudLog] of cloudLogMap) {
            if (!localLogMap.has(id)) {
                await this.addHabitLogWithoutSync(cloudLog);
                logDownloaded++;
            }
        }

        // 同步每日笔记（使用之前获取的 cloudNotesData）
        const localNotes = await this.getAllNotes();
        const cloudNotes = safeCloudNotesData.notes || [];

        const localNoteMap = new Map(localNotes.map(n => [n.id, n]));
        const cloudNoteMap = new Map(cloudNotes.map(n => [n.id, n]));

        let noteUploaded = 0;
        let noteDownloaded = 0;
        let noteDeleted = 0;

        // 找出只在本地且需要上传的笔记
        for (const [id, localNote] of localNoteMap) {
            if (!cloudNoteMap.has(id)) {
                // 检查本地墓碑
                const tombstones = this.cloudSync.getTombstones('notes');
                if (tombstones[id]) {
                    this.cloudSync.removeTombstone('notes', id);
                    continue;
                }

                const result = await this.cloudSync.uploadNote(localNote);
                if (result && result.id) {
                    await this.saveNoteWithoutSync(result);
                    localNoteMap.set(id, result);
                    noteUploaded++;
                }
            }
        }

        // 处理云端有的笔记
        for (const [id, cloudNote] of cloudNoteMap) {
            const localNote = localNoteMap.get(id);

            if (!localNote) {
                // 只有云端有，下载
                await this.saveNoteWithoutSync(cloudNote);
                noteDownloaded++;
            } else {
                // 两边都有，比较更新时间
                const localTime = new Date(localNote.updated_at || 0);
                const cloudTime = new Date(cloudNote.updated_at || 0);

                if (cloudTime > localTime) {
                    // 云端更新，使用云端版本
                    await this.saveNoteWithoutSync(cloudNote);
                    noteDownloaded++;
                } else if (localTime > cloudTime) {
                    // 本地更新，上传到云端
                    await this.cloudSync.uploadNote(localNote);
                    noteUploaded++;
                }
            }
        }

        this.cloudSync.updateSyncTime();
        return {
            uploaded, downloaded, deleted, conflicts,
            todoUploaded, todoDownloaded, todoDeleted, todoConflicts,
            timeUploaded, timeDownloaded, timeConflicts,
            habitUploaded, habitDownloaded, habitConflicts,
            logUploaded, logDownloaded,
            noteUploaded, noteDownloaded, noteDeleted,
            total: localEvents.length
        };
    }

    /**
     * 添加事件但不自动同步（用于同步时避免循环）
     * @param {Object} event
     * @returns {Promise<string>}
     */
    async addEventWithoutSync(event) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            // 首先检查是否已存在（防止重复添加）
            const checkRequest = store.get(event.id);
            checkRequest.onsuccess = () => {
                const existing = checkRequest.result;

                if (existing) {
                    // 已存在，更新
                    const request = store.put(event);
                    request.onsuccess = () => resolve(event.id);
                    request.onerror = () => reject(request.error);
                } else {
                    // 不存在，添加
                    const request = store.add(event);
                    request.onsuccess = () => resolve(event.id);
                    request.onerror = () => reject(request.error);
                }
            };

            checkRequest.onerror = () => reject(checkRequest.error);
        });
    }

    /**
     * 删除事件但不自动同步（用于同步时避免循环）
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteEventWithoutSync(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 设置自动同步开关
     * @param {boolean} enabled
     */
    setAutoSync(enabled) {
        this.autoSyncEnabled = enabled;
        localStorage.setItem('calendar_auto_sync', enabled);
    }

    /**
     * ========== 时间记录相关方法 ==========
     */

    /**
     * 添加时间记录
     * @param {Object} entry
     * @returns {Promise<string>}
     */
    async addTimeEntry(entry) {
        return new Promise(async (resolve, reject) => {
            const transaction = this.db.transaction(['time_entries'], 'readwrite');
            const store = transaction.objectStore('time_entries');
            const request = store.add(entry);

            request.onsuccess = async () => {
                // 自动上传到云端
                if (this.autoSyncEnabled && this.cloudSync.isLoggedIn()) {
                    this.cloudSync.uploadTimeEntry(entry).catch(err => {
                        console.warn('自动上传时间记录失败:', err);
                    });
                }
                resolve(entry.id);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 更新时间记录
     * @param {Object} entry
     * @returns {Promise<void>}
     */
    async updateTimeEntry(entry) {
        return new Promise(async (resolve, reject) => {
            const transaction = this.db.transaction(['time_entries'], 'readwrite');
            const store = transaction.objectStore('time_entries');
            const request = store.put(entry);

            request.onsuccess = async () => {
                // 自动上传到云端
                if (this.autoSyncEnabled && this.cloudSync.isLoggedIn()) {
                    this.cloudSync.uploadTimeEntry(entry).catch(err => {
                        console.warn('自动上传时间记录失败:', err);
                    });
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 删除时间记录
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteTimeEntry(id) {
        return new Promise(async (resolve, reject) => {
            const transaction = this.db.transaction(['time_entries'], 'readwrite');
            const store = transaction.objectStore('time_entries');
            const request = store.delete(id);

            request.onsuccess = async () => {
                // 从云端删除
                if (this.autoSyncEnabled && this.cloudSync.isLoggedIn()) {
                    try {
                        await this.cloudSync.deleteTimeEntry(id);
                    } catch (err) {
                        console.warn('云端删除时间记录失败:', err);
                    }
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取单个时间记录
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async getTimeEntry(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['time_entries'], 'readonly');
            const store = transaction.objectStore('time_entries');
            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result || null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取日期范围内的所有时间记录
     * @param {string} startDate YYYY-MM-DD
     * @param {string} endDate YYYY-MM-DD
     * @returns {Promise<Array>}
     */
    async getTimeEntriesInRange(startDate, endDate) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['time_entries'], 'readonly');
            const store = transaction.objectStore('time_entries');
            const request = store.getAll();

            request.onsuccess = () => {
                const entries = request.result || [];
                const filtered = entries.filter(entry => {
                    const entryDate = entry.startTime.split('T')[0];
                    return entryDate >= startDate && entryDate <= endDate;
                });
                // 按开始时间倒序排列
                filtered.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
                resolve(filtered);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取指定日期的时间记录
     * @param {string} date YYYY-MM-DD
     * @returns {Promise<Array>}
     */
    async getTimeEntriesByDate(date) {
        return this.getTimeEntriesInRange(date, date);
    }

    /**
     * 获取所有时间记录
     * @returns {Promise<Array>}
     */
    async getAllTimeEntries() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['time_entries'], 'readonly');
            const store = transaction.objectStore('time_entries');
            const request = store.getAll();

            request.onsuccess = () => {
                const entries = request.result || [];
                // 按开始时间正序排列（最早到最近）
                entries.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
                resolve(entries);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 添加时间记录但不自动同步
     * @param {Object} entry
     * @returns {Promise<string>}
     */
    async addTimeEntryWithoutSync(entry) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['time_entries'], 'readwrite');
            const store = transaction.objectStore('time_entries');

            // 首先检查是否已存在
            const checkRequest = store.get(entry.id);
            checkRequest.onsuccess = () => {
                const existing = checkRequest.result;

                if (existing) {
                    // 已存在，更新
                    const request = store.put(entry);
                    request.onsuccess = () => resolve(entry.id);
                    request.onerror = () => reject(request.error);
                } else {
                    // 不存在，添加
                    const request = store.add(entry);
                    request.onsuccess = () => resolve(entry.id);
                    request.onerror = () => reject(request.error);
                }
            };

            checkRequest.onerror = () => reject(checkRequest.error);
        });
    }

    /**
     * 删除时间记录但不自动同步
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteTimeEntryWithoutSync(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['time_entries'], 'readwrite');
            const store = transaction.objectStore('time_entries');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * ========== 时间标签相关方法 ==========
     */

    /**
     * 获取所有时间标签
     * @returns {Promise<Array>}
     */
    async getAllTimeTags() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['time_tags'], 'readonly');
            const store = transaction.objectStore('time_tags');
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 添加时间标签
     * @param {Object} tag
     * @returns {Promise<string>}
     */
    async addTimeTag(tag) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['time_tags'], 'readwrite');
            const store = transaction.objectStore('time_tags');
            const request = store.add(tag);

            request.onsuccess = () => resolve(tag.id);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 删除时间标签
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteTimeTag(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['time_tags'], 'readwrite');
            const store = transaction.objectStore('time_tags');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取云同步实例
     */
    getCloudSync() {
        return this.cloudSync;
    }

    /**
     * 检查当前用户是否是管理员
     * @returns {Promise<boolean>}
     */
    async isAdmin() {
        if (!this.cloudSync.isLoggedIn()) {
            return false;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/user/me`, {
                method: 'GET',
                headers: this.cloudSync.getAuthHeaders()
            });

            if (!response.ok) {
                return false;
            }

            const data = await response.json();
            return data.is_admin === true;
        } catch (err) {
            console.error('检查管理员状态失败:', err);
            return false;
        }
    }

    /**
     * 添加习惯
     * @param {Object} habit - 习惯对象
     * @returns {Promise<Object>} 添加的习惯对象
     */
    async addHabit(habit) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['habits'], 'readwrite');
            const store = transaction.objectStore('habits');
            habit.id = habit.id || `habit_${Date.now()}`;
            habit.updated_at = new Date().toISOString();
            const request = store.put(habit);

            request.onsuccess = async () => {
                // 自动上传到云端
                if (this.cloudSync && this.cloudSync.isLoggedIn()) {
                    try {
                        const result = await this.cloudSync.uploadHabit(habit);
                        resolve(result || habit);
                    } catch (err) {
                        console.warn('自动上传习惯失败:', err);
                        resolve(habit);
                    }
                } else {
                    resolve(habit);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 添加习惯（不自动同步，用于同步时避免循环）
     * @param {Object} habit - 习惯对象
     * @returns {Promise<Object>} 添加的习惯对象
     */
    async addHabitWithoutSync(habit) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['habits'], 'readwrite');
            const store = transaction.objectStore('habits');
            const request = store.put(habit);

            request.onsuccess = () => resolve(habit);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取所有习惯
     * @returns {Promise<Array>} 习惯列表
     */
    async getHabits() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['habits'], 'readonly');
            const store = transaction.objectStore('habits');
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取所有习惯（别名，用于同步）
     * @returns {Promise<Array>} 习惯列表
     */
    async getAllHabits() {
        return this.getHabits();
    }

    /**
     * 删除习惯
     * @param {string} habitId - 习惯ID
     * @returns {Promise<void>}
     */
    async deleteHabit(habitId) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['habits'], 'readwrite');
            const store = transaction.objectStore('habits');
            const request = store.delete(habitId);

            // Wait for transaction to complete, not just the request
            transaction.oncomplete = async () => {
                // 从云端删除
                if (this.cloudSync && this.cloudSync.isLoggedIn()) {
                    this.cloudSync.deleteHabit(habitId).catch(err => {
                        console.warn('云端删除习惯失败:', err);
                    });
                }
                resolve();
            };

            request.onerror = () => reject(request.error);
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * 添加打卡记录
     * @param {Object} log - 打卡记录对象
     * @returns {Promise<Object>} 添加的打卡记录对象
     */
    async addHabitLog(log) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['habitLogs'], 'readwrite');
            const store = transaction.objectStore('habitLogs');
            log.id = log.id || `hl_${Date.now()}`;
            const request = store.put(log);

            request.onsuccess = async () => {
                // 自动上传到云端
                if (this.cloudSync && this.cloudSync.isLoggedIn()) {
                    try {
                        const result = await this.cloudSync.uploadHabitLog(log);
                        resolve(result || log);
                    } catch (err) {
                        console.warn('自动上传打卡记录失败:', err);
                        resolve(log);
                    }
                } else {
                    resolve(log);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 添加打卡记录（不自动同步，用于同步时避免循环）
     * @param {Object} log - 打卡记录对象
     * @returns {Promise<Object>} 添加的打卡记录对象
     */
    async addHabitLogWithoutSync(log) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['habitLogs'], 'readwrite');
            const store = transaction.objectStore('habitLogs');
            const request = store.put(log);

            request.onsuccess = () => resolve(log);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取指定习惯的所有打卡记录
     * @param {string} habitId - 习惯ID
     * @returns {Promise<Array>} 打卡记录列表
     */
    async getHabitLogs(habitId) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['habitLogs'], 'readonly');
            const store = transaction.objectStore('habitLogs');
            const index = store.index('habitId');
            const request = index.getAll(habitId);

            request.onsuccess = () => {
                resolve(request.result || []);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取所有打卡记录
     * @returns {Promise<Array>} 所有打卡记录列表
     */
    async getAllHabitLogs() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['habitLogs'], 'readonly');
            const store = transaction.objectStore('habitLogs');
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 删除打卡记录
     * @param {string} logId - 打卡记录ID
     * @returns {Promise<void>}
     */
    async deleteHabitLog(logId) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['habitLogs'], 'readwrite');
            const store = transaction.objectStore('habitLogs');
            const request = store.delete(logId);

            // Wait for transaction to complete, not just the request
            transaction.oncomplete = async () => {
                // 从云端删除
                if (this.cloudSync && this.cloudSync.isLoggedIn()) {
                    this.cloudSync.deleteHabitLog(logId).catch(err => {
                        console.warn('云端删除打卡记录失败:', err);
                    });
                }
                resolve();
            };

            request.onerror = () => reject(request.error);
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * 删除打卡记录（不自动同步到云端，用于批量删除）
     * @param {string} logId - 打卡记录ID
     * @returns {Promise<void>}
     */
    async deleteHabitLogWithoutSync(logId) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['habitLogs'], 'readwrite');
            const store = transaction.objectStore('habitLogs');
            const request = store.delete(logId);

            transaction.oncomplete = () => resolve();
            request.onerror = () => reject(request.error);
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * 删除指定习惯的所有打卡记录（使用单个事务，避免 N+1 问题）
     * @param {string} habitId - 习惯ID
     * @returns {Promise<void>}
     */
    async deleteAllHabitLogs(habitId) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['habitLogs'], 'readwrite');
            const store = transaction.objectStore('habitLogs');
            const index = store.index('habitId');
            const request = index.openCursor(IDBKeyRange.only(habitId));

            let deletedCount = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    deletedCount++;
                    cursor.continue();
                }
            };

            transaction.oncomplete = async () => {
                // 批量从云端删除
                if (this.cloudSync && this.cloudSync.isLoggedIn() && deletedCount > 0) {
                    this.cloudSync.deleteHabit(habitId).catch(err => {
                        console.warn('云端删除习惯失败（包含打卡记录）:', err);
                    });
                }
                resolve();
            };

            request.onerror = () => reject(request.error);
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * ========== 每日笔记相关方法 ==========
     */

    /**
     * 获取指定日期的笔记
     * @param {string} date YYYY-MM-DD
     * @returns {Promise<Object|null>}
     */
    async getDailyNote(date) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['daily_notes'], 'readonly');
            const store = transaction.objectStore('daily_notes');
            const request = store.get(date);

            request.onsuccess = () => {
                resolve(request.result || null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 保存每日笔记
     * @param {Object} note - { id: YYYY-MM-DD, content: string }
     * @returns {Promise<string>}
     */
    async saveDailyNote(note) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['daily_notes'], 'readwrite');
            const store = transaction.objectStore('daily_notes');

            const noteData = {
                id: note.id,
                date: note.id,
                content: note.content,
                created_at: note.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const request = store.put(noteData);

            request.onsuccess = async () => {
                // 自动上传到云端
                if (this.autoSyncEnabled && this.cloudSync.isLoggedIn()) {
                    this.cloudSync.uploadNote(noteData).catch(err => {
                        console.warn('自动上传笔记失败:', err);
                    });
                }
                resolve(note.id);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 删除每日笔记
     * @param {string} date YYYY-MM-DD
     * @returns {Promise<void>}
     */
    async deleteDailyNote(date) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['daily_notes'], 'readwrite');
            const store = transaction.objectStore('daily_notes');
            const request = store.delete(date);

            request.onsuccess = async () => {
                // 自动从云端删除
                if (this.autoSyncEnabled && this.cloudSync.isLoggedIn()) {
                    // 创建墓碑记录，防止同步时重新上传
                    this.cloudSync.addTombstone('notes', date);
                    this.cloudSync.deleteNote(date).catch(err => {
                        console.warn('从云端删除笔记失败:', err);
                    });
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取所有本地每日笔记
     * @returns {Promise<Array>}
     */
    async getAllNotes() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['daily_notes'], 'readonly');
            const store = transaction.objectStore('daily_notes');
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 保存笔记但不触发同步（用于从云端下载数据后更新本地）
     * @param {Object} note
     * @returns {Promise<string>}
     */
    async saveNoteWithoutSync(note) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['daily_notes'], 'readwrite');
            const store = transaction.objectStore('daily_notes');

            const noteData = {
                id: note.id || note.date,
                date: note.date,
                content: note.content,
                created_at: note.created_at || note.createdAt,
                updated_at: note.updated_at || note.updatedAt
            };

            const request = store.put(noteData);

            request.onsuccess = () => resolve(noteData.id);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 删除笔记但不触发同步
     * @param {string} noteId
     * @returns {Promise<void>}
     */
    async deleteNoteWithoutSync(noteId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['daily_notes'], 'readwrite');
            const store = transaction.objectStore('daily_notes');
            const request = store.delete(noteId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

// 邮件通知设置管理
class EmailSettingsManager {
    constructor() {
        this.storageKey = 'calendar_email_settings';
        this.defaultSettings = {
            enabled: false,
            email: '',
            reminderMinutes: 15
        };
    }

    /**
     * 获取邮件设置
     */
    getSettings() {
        const saved = localStorage.getItem(this.storageKey);
        if (saved) {
            try {
                return { ...this.defaultSettings, ...JSON.parse(saved) };
            } catch (e) {
                console.error('EmailSettingsManager: 解析设置失败', e);
                return { ...this.defaultSettings };
            }
        }
        return { ...this.defaultSettings };
    }

    /**
     * 保存邮件设置
     */
    saveSettings(settings) {
        const merged = { ...this.getSettings(), ...settings };
        localStorage.setItem(this.storageKey, JSON.stringify(merged));
        return merged;
    }

    /**
     * 更新单个设置项
     */
    updateSetting(key, value) {
        const settings = this.getSettings();
        settings[key] = value;
        this.saveSettings(settings);
        return settings;
    }

    /**
     * 清除邮件设置
     */
    clearSettings() {
        localStorage.removeItem(this.storageKey);
    }

    /**
     * 检查是否启用邮件通知
     */
    isEnabled() {
        const settings = this.getSettings();
        return settings.enabled && settings.email;
    }
}

// 创建全局数据库实例
const db = new CalendarDB();

/**
 * 本地备份管理类
 */
class LocalBackup {
    constructor() {
        this.STORE_NAME = 'backups';
        this.db = null;
    }

    /**
     * 初始化备份数据库
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME + '_backup', DB_VERSION);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                    store.createIndex('date', 'date', { unique: false });
                }
            };
        });
    }

    /**
     * 保存备份
     */
    async saveBackup(events, todos = []) {
        if (!this.db) await this.init();

        const backup = {
            id: new Date().toISOString(),
            date: new Date().toISOString(),
            events: events,
            todos: todos,
            version: '1.0'
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.add(backup);

            request.onsuccess = async () => {
                // 保留最近 10 个备份
                await this.cleanOldBackups(10);
                resolve(backup.id);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 清理旧备份，保留最新的 n 个
     */
    async cleanOldBackups(keepCount) {
        const backups = await this.getAllBackups();
        if (backups.length <= keepCount) return;

        // 按日期倒序排列
        backups.sort((a, b) => new Date(b.date) - new Date(a.date));

        // 删除超过保留数量的备份
        const toDelete = backups.slice(keepCount);
        for (const backup of toDelete) {
            await this.deleteBackup(backup.id);
        }
    }

    /**
     * 获取所有备份
     */
    async getAllBackups() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const backups = request.result || [];
                backups.sort((a, b) => new Date(b.date) - new Date(a.date));
                resolve(backups);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 删除备份
     */
    async deleteBackup(id) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 恢复备份
     */
    async restoreBackup(id) {
        const backups = await this.getAllBackups();
        const backup = backups.find(b => b.id === id);
        return backup || null;
    }
}

// 创建全局备份实例
const localBackup = new LocalBackup();

// 创建全局邮件设置管理实例
const emailSettings = new EmailSettingsManager();
