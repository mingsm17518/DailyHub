/**
 * 本地文件夹备份管理
 * 使用 File System Access API
 * 每次云同步后自动保存备份到文件夹
 */

class FolderBackup {
    constructor() {
        this.directoryHandle = null;
        this.lastBackupTime = null;
        this.dbName = 'CalendarBackupDB';
        this.dbStore = 'settings';
    }

    /**
     * 初始化
     */
    async init() {
        // 从 IndexedDB 加载保存的文件夹句柄
        await this.loadSettings();

        // 如果有保存的文件夹，尝试恢复访问权限
        if (this.directoryHandle) {
            try {
                // 检查权限
                const permission = await this.directoryHandle.queryPermission({ mode: 'readwrite' });
                if (permission !== 'granted') {
                    // 请求权限
                    const newPermission = await this.directoryHandle.requestPermission({ mode: 'readwrite' });
                    if (newPermission !== 'granted') {
                        this.directoryHandle = null;
                        await this.saveSettings();
                    }
                }
            } catch (err) {
                console.warn('无法访问已保存的文件夹:', err);
                this.directoryHandle = null;
                await this.saveSettings();
            }
        }

        this.updateUI();
    }

    /**
     * 选择文件夹
     */
    async selectFolder() {
        try {
            this.directoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'documents'
            });

            // 保存到 IndexedDB
            await this.saveSettings();
            this.updateUI();

            showToast(`已选择文件夹: ${this.directoryHandle.name}`);
            return true;
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('选择文件夹失败:', err);
                showToast('选择文件夹失败: ' + err.message, 'error');
            }
            return false;
        }
    }

    /**
     * 清除文件夹
     */
    async clearFolder() {
        this.directoryHandle = null;
        this.lastBackupTime = null;
        await this.saveSettings();
        this.updateUI();
        showToast('已清除文件夹设置');
    }

    /**
     * 保存备份（云同步后自动调用）
     */
    async saveBackup(events, todos) {
        if (!this.directoryHandle) {
            return false;
        }

        try {
            // 生成文件名（包含时间戳）
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `cloud-backup-${timestamp}.json`;

            const backupData = {
                version: '1.0',
                timestamp: now.toISOString(),
                events: events,
                todos: todos
            };

            // 创建文件
            const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();

            await writable.write(JSON.stringify(backupData, null, 2));
            await writable.close();

            // 清理旧备份（保留最新10个）
            await this.cleanOldBackups(10);

            this.lastBackupTime = now.toISOString();
            await this.saveSettings();
            this.updateUI();

            console.log(`备份已保存到文件夹: ${filename}`);
            return true;
        } catch (err) {
            console.error('保存备份到文件夹失败:', err);
            return false;
        }
    }

    /**
     * 清理旧备份文件
     */
    async cleanOldBackups(keepCount) {
        if (!this.directoryHandle) return;

        try {
            const backups = [];
            for await (const entry of this.directoryHandle.values()) {
                if (entry.kind === 'file' && entry.name.startsWith('cloud-backup-') && entry.name.endsWith('.json')) {
                    const file = await entry.getFile();
                    backups.push({
                        name: entry.name,
                        lastModified: file.lastModified
                    });
                }
            }

            if (backups.length <= keepCount) return;

            // 按修改时间倒序
            backups.sort((a, b) => b.lastModified - a.lastModified);

            // 删除超过保留数量的
            for (let i = keepCount; i < backups.length; i++) {
                await this.directoryHandle.removeEntry(backups[i].name);
            }
        } catch (err) {
            console.error('清理旧备份失败:', err);
        }
    }

    /**
     * 保存设置到 IndexedDB
     */
    async saveSettings() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction([this.dbStore], 'readwrite');
                const store = transaction.objectStore(this.dbStore);

                store.put({
                    key: 'backupSettings',
                    directoryHandle: this.directoryHandle,
                    lastBackupTime: this.lastBackupTime
                });

                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.dbStore)) {
                    db.createObjectStore(this.dbStore, { keyPath: 'key' });
                }
            };
        });
    }

    /**
     * 从 IndexedDB 加载设置
     */
    async loadSettings() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction([this.dbStore], 'readonly');
                const store = transaction.objectStore(this.dbStore);
                const getRequest = store.get('backupSettings');

                getRequest.onsuccess = () => {
                    const data = getRequest.result;
                    if (data) {
                        this.directoryHandle = data.directoryHandle;
                        this.lastBackupTime = data.lastBackupTime || null;
                    }
                    resolve();
                };

                getRequest.onerror = () => reject(getRequest.error);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.dbStore)) {
                    db.createObjectStore(this.dbStore, { keyPath: 'key' });
                }
            };
        });
    }

    /**
     * 更新 UI 显示
     */
    updateUI() {
        const folderStatus = document.getElementById('folderStatus');
        const btnChangeFolder = document.getElementById('btnChangeFolder');
        const btnClearFolder = document.getElementById('btnClearFolder');
        const backupSettings = document.getElementById('backupSettings');
        const lastBackupTimeEl = document.getElementById('lastBackupTime');

        if (this.directoryHandle) {
            folderStatus.textContent = `已选择: ${this.directoryHandle.name}`;
            folderStatus.classList.add('active');
            btnChangeFolder.textContent = '更换文件夹';
            btnClearFolder.style.display = 'inline-block';
            backupSettings.style.display = 'flex';

            if (this.lastBackupTime) {
                const date = new Date(this.lastBackupTime);
                lastBackupTimeEl.textContent = date.toLocaleString('zh-CN');
            } else {
                lastBackupTimeEl.textContent = '等待云同步后自动备份';
            }
        } else {
            folderStatus.textContent = '未选择文件夹';
            folderStatus.classList.remove('active');
            btnChangeFolder.textContent = '选择文件夹';
            btnClearFolder.style.display = 'none';
            backupSettings.style.display = 'none';
            lastBackupTimeEl.textContent = '从未备份';
        }
    }

    /**
     * 检查浏览器支持
     */
    static isSupported() {
        return 'showDirectoryPicker' in window;
    }
}

// 创建全局备份实例
const folderBackup = new FolderBackup();
