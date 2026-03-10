/**
 * 每日笔记模块
 */
class DailyNote {
    static currentDate = new Date().toISOString().split('T')[0];
    static isDirty = false;
    static saveTimeout = null;
    static lastSavedContent = '';
    static viewMode = 'edit'; // 'edit' | 'preview'

    /**
     * 初始化每日笔记模块
     */
    static async init() {
        this.bindEvents();
        await this.loadNote(this.currentDate);
    }

    /**
     * 绑定事件
     */
    static bindEvents() {
        const editor = document.getElementById('noteEditor');
        const dateInput = document.getElementById('noteDateInput');
        const prevBtn = document.getElementById('btnNotePrev');
        const nextBtn = document.getElementById('btnNoteNext');
        const toggleBtn = document.getElementById('noteViewToggle');
        const importBtn = document.getElementById('btnImportTime');

        if (editor) {
            editor.addEventListener('input', () => {
                this.isDirty = true;
                this.autoSave();
            });
        }

        if (dateInput) {
            dateInput.value = this.currentDate;
            dateInput.addEventListener('change', (e) => {
                this.changeDate(e.target.value);
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.navigateDate(-1));
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.navigateDate(1));
        }

        // 今天按钮
        const todayBtn = document.getElementById('btnNoteToday');
        if (todayBtn && !todayBtn.dataset.bound) {
            todayBtn.dataset.bound = 'true';
            todayBtn.addEventListener('click', () => this.goToToday());
        }

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleView());
        }

        // 导入时间追踪按钮
        if (importBtn) {
            importBtn.addEventListener('click', () => this.showTimeImportDialog());
        }
    }

    /**
     * 切换编辑/预览模式
     */
    static toggleView() {
        const preview = document.getElementById('notePreview');
        const toggleBtn = document.getElementById('noteViewToggle');
        const editorContainer = document.querySelector('.note-editor');

        if (this.viewMode === 'edit') {
            this.viewMode = 'preview';
            this.renderPreview();
            if (preview) preview.classList.add('show');
            if (toggleBtn) toggleBtn.textContent = '编辑';
            if (editorContainer) editorContainer.classList.add('hidden');
        } else {
            this.viewMode = 'edit';
            if (preview) preview.classList.remove('show');
            if (toggleBtn) toggleBtn.textContent = '预览';
            if (editorContainer) editorContainer.classList.remove('hidden');
        }
    }

    /**
     * 自动保存（带防抖）
     */
    static autoSave() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(() => {
            this.saveNote();
        }, 1000); // 1秒无输入后自动保存
    }

    /**
     * 加载指定日期的笔记
     */
    static async loadNote(date) {
        const editor = document.getElementById('noteEditor');
        const dateDisplay = document.getElementById('noteDate');
        const dateInput = document.getElementById('noteDateInput');

        if (!editor) return;

        try {
            const note = await db.getDailyNote(date);
            if (note) {
                editor.value = note.content || '';
                this.lastSavedContent = note.content || '';
            } else {
                editor.value = '';
                this.lastSavedContent = '';
            }

            this.currentDate = date;
            this.isDirty = false;

            // 更新日期显示
            if (dateDisplay) {
                dateDisplay.textContent = this.formatDateDisplay(date);
            }
            if (dateInput) {
                dateInput.value = date;
            }

            // 渲染预览
            this.renderPreview();
        } catch (err) {
            console.error('加载笔记失败:', err);
        }
    }

    /**
     * 保存当前笔记
     */
    static async saveNote() {
        const editor = document.getElementById('noteEditor');
        const statusEl = document.getElementById('noteStatus');

        if (!editor) return;

        const content = editor.value.trim();

        // 如果内容没有变化，不保存
        if (content === this.lastSavedContent) {
            return;
        }

        try {
            if (content) {
                await db.saveDailyNote({
                    id: this.currentDate,
                    content: content
                });
                this.lastSavedContent = content;

                if (statusEl) {
                    statusEl.textContent = '已自动保存';
                    statusEl.style.color = 'var(--success-color, #4caf50)';
                    setTimeout(() => {
                        statusEl.textContent = '';
                    }, 2000);
                }
            } else {
                // 空内容时删除笔记
                await db.deleteDailyNote(this.currentDate);
                this.lastSavedContent = '';
            }

            this.isDirty = false;
            this.renderPreview();
        } catch (err) {
            console.error('保存笔记失败:', err);
            if (statusEl) {
                statusEl.textContent = '保存失败';
                statusEl.style.color = 'var(--error-color, #f44336)';
            }
        }
    }

    /**
     * 切换日期
     */
    static async changeDate(newDate) {
        // 立即保存当前笔记
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        await this.saveNote();
        await this.loadNote(newDate);
    }

    /**
     * 日期导航
     */
    static async navigateDate(delta) {
        const current = new Date(this.currentDate);
        current.setDate(current.getDate() + delta);
        const newDate = current.toISOString().split('T')[0];
        await this.changeDate(newDate);
    }

    /**
     * 跳转到今天的笔记
     */
    static async goToToday() {
        const today = new Date().toISOString().split('T')[0];
        await this.changeDate(today);
    }

    /**
     * 渲染Markdown预览
     */
    static renderPreview() {
        const editor = document.getElementById('noteEditor');
        const preview = document.getElementById('notePreview');

        if (!editor || !preview) return;

        const content = editor.value;
        if (!content) {
            preview.innerHTML = '<p class="empty-preview">预览区域</p>';
            return;
        }

        preview.innerHTML = this.parseMarkdown(content);
    }

    /**
     * HTML转义函数
     */
    static escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * 简单Markdown解析
     */
    static parseMarkdown(text) {
        if (!text) return '';

        // 先处理表格（需要多行处理）- 将Markdown表格转换为HTML
        text = this.parseTables(text);

        // 使用占位符保护已生成的HTML标签不被转义
        const tagPlaceholder = '___TAG_PLACEHOLDER___';
        const tags = [];
        // 匹配所有HTML标签
        text = text.replace(/<\/?[a-z][\s\S]*?>/gi, (match) => {
            tags.push(match);
            return tagPlaceholder + (tags.length - 1) + '___';
        });

        // 转义剩余的内容（用户输入的文本）
        let html = text
            // 标题
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')

            // 加粗和斜体
            .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')

            // 删除线
            .replace(/~~(.+?)~~/g, '<del>$1</del>')

            // 代码块
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')

            // 行内代码
            .replace(/`([^`]+)`/g, '<code>$1</code>')

            // 链接
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')

            // 无序列表
            .replace(/^- (.+)$/gm, '<li>$1</li>')

            // 有序列表
            .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')

            // 换行
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');

        // 包装列表项
        html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
        // 合并连续的ul
        html = html.replace(/<\/ul>\s*<ul>/g, '');

        // 恢复HTML标签
        html = html.replace(new RegExp(tagPlaceholder + '(\\d+)___', 'g'), (match, index) => {
            return tags[parseInt(index)];
        });

        return `<p>${html}</p>`;
    }

    /**
     * 解析Markdown表格
     */
    static parseTables(text) {
        // 匹配整个表格块（至少3行：表头、分隔符、数据行）
        const tableRegex = /(\|.+\|\n?){3,}/g;
        return text.replace(tableRegex, (match) => {
            const lines = match.trim().split('\n');
            if (lines.length < 3) return match;

            // 检查第二行是否是分隔符 |---| |
            const separatorLine = lines[1].trim();
            if (!/^\|?[\s\-:|]+\|?$/.test(separatorLine)) {
                return match;
            }

            let html = '<table class="md-table">';

            // 处理表头
            const headers = lines[0].split('|').filter(cell => cell.trim());
            html += '<thead><tr>';
            for (const header of headers) {
                html += `<th>${header.trim()}</th>`;
            }
            html += '</tr></thead>';

            // 处理数据行（从第3行开始）
            html += '<tbody>';
            for (let i = 2; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || !line.startsWith('|')) continue;

                const cells = line.split('|').filter(cell => cell.trim());
                if (cells.length === 0) continue;

                html += '<tr>';
                for (const cell of cells) {
                    html += `<td>${cell.trim()}</td>`;
                }
                html += '</tr>';
            }
            html += '</tbody>';

            html += '</table>';
            return html;
        });
    }

    /**
     * 格式化日期显示
     */
    static formatDateDisplay(dateStr) {
        const date = new Date(dateStr);
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

        if (dateStr === today) {
            return '今天';
        } else if (dateStr === yesterday) {
            return '昨天';
        } else if (dateStr === tomorrow) {
            return '明天';
        }

        return `${date.getMonth() + 1}月${date.getDate()}日 ${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}`;
    }

    /**
     * 显示导入时间追踪对话框
     */
    static showTimeImportDialog() {
        // 创建对话框
        const dialog = document.createElement('div');
        dialog.className = 'modal-overlay';
        dialog.id = 'timeImportDialog';

        dialog.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>导入时间追踪</h3>
                    <button class="modal-close" id="closeTimeImport">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="importFormat">选择格式</label>
                        <select id="importFormat">
                            <option value="table">MD表格格式</option>
                            <option value="list">纯文本格式</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>预览</label>
                        <div id="importPreview" class="import-preview">加载中...</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-cancel" id="cancelTimeImport">取消</button>
                    <button class="btn-confirm" id="confirmTimeImport">导入</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // 绑定事件
        const closeBtn = document.getElementById('closeTimeImport');
        const cancelBtn = document.getElementById('cancelTimeImport');
        const confirmBtn = document.getElementById('confirmTimeImport');
        const preview = document.getElementById('importPreview');

        const closeDialog = () => {
            document.body.removeChild(dialog);
        };

        // 使用当前笔记所在日期
        const date = this.currentDate;

        const updatePreview = async () => {
            const format = document.getElementById('importFormat').value;

            try {
                const entries = await db.getTimeEntriesByDate(date);
                const tags = await db.getAllTimeTags();

                if (!entries || entries.length === 0) {
                    preview.textContent = '该日期无时间记录';
                    return;
                }

                if (format === 'table') {
                    preview.innerHTML = this.formatTimeEntriesAsTable(entries, tags);
                } else {
                    preview.innerHTML = this.formatTimeEntriesAsList(entries, tags);
                }
            } catch (err) {
                console.error('获取时间记录失败:', err);
                preview.textContent = '获取时间记录失败';
            }
        };

        closeBtn.addEventListener('click', closeDialog);
        cancelBtn.addEventListener('click', closeDialog);

        confirmBtn.addEventListener('click', async () => {
            const format = document.getElementById('importFormat').value;

            await this.importTimeEntries(date, format);
            closeDialog();
        });

        document.getElementById('importFormat').addEventListener('change', updatePreview);

        // 初始加载预览
        setTimeout(updatePreview, 100);
    }

    /**
     * 将时间记录格式化为MD表格（无标题，用于导入）
     */
    static formatTimeEntriesAsTable(entries, tags) {
        if (!entries || entries.length === 0) {
            return '<p style="color: #999;">暂无时间记录</p>';
        }

        const tagMap = new Map(tags.map(t => [t.id, t]));

        let content = '<table class="import-table"><thead><tr><th>时间范围</th><th>时长</th><th>活动</th><th>标签</th></tr></thead><tbody>';

        for (const entry of entries) {
            const start = new Date(entry.startTime);
            const end = new Date(entry.endTime);
            const timeRange = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}-${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
            const duration = formatDurationHuman(entry.duration);

            const tag = entry.tagId ? tagMap.get(entry.tagId) : null;
            const tagDisplay = tag ? `${tag.emoji || ''} ${tag.name}`.trim() : '-';

            content += `<tr><td>${timeRange}</td><td>${duration}</td><td>${entry.activity || '未命名'}</td><td>${tagDisplay}</td></tr>`;
        }

        content += '</tbody></table>';
        return content;
    }

    /**
     * 将时间记录格式化为纯文本列表（无标题，用于导入）
     */
    static formatTimeEntriesAsList(entries, tags) {
        if (!entries || entries.length === 0) {
            return '<p style="color: #999;">暂无时间记录</p>';
        }

        const tagMap = new Map(tags.map(t => [t.id, t]));

        let content = '<ul class="import-list">';

        for (const entry of entries) {
            const start = new Date(entry.startTime);
            const end = new Date(entry.endTime);
            const timeRange = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}-${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
            const duration = formatDurationHuman(entry.duration);

            const tag = entry.tagId ? tagMap.get(entry.tagId) : null;
            const tagDisplay = tag ? `${tag.emoji || ''} ${tag.name}`.trim() : '';

            content += `<li>${timeRange} ${entry.activity || '未命名'}（${duration}）${tagDisplay ? ' ' + tagDisplay : ''}</li>`;
        }

        content += '</ul>';
        return content;
    }

    /**
     * 导入时间追踪记录到笔记
     */
    static async importTimeEntries(date, format) {
        try {
            const entries = await db.getTimeEntriesByDate(date);
            const tags = await db.getAllTimeTags();

            if (!entries || entries.length === 0) {
                alert('所选日期没有时间记录');
                return;
            }

            let importContent;

            if (format === 'table') {
                importContent = this.generateTimeEntriesTableMarkdown(entries, tags);
            } else {
                importContent = this.generateTimeEntriesListMarkdown(entries, tags);
            }

            // 获取当前笔记内容
            const editor = document.getElementById('noteEditor');
            if (!editor) {
                console.error('找不到笔记编辑器');
                return;
            }

            let currentContent = editor.value.trim();

            // 追加内容
            if (currentContent) {
                currentContent += '\n\n' + importContent;
            } else {
                currentContent = importContent;
            }

            // 更新编辑器
            editor.value = currentContent;

            // 标记为已修改并保存
            this.isDirty = true;
            this.lastSavedContent = ''; // 强制保存
            await this.saveNote();

            // 刷新预览
            this.renderPreview();

        } catch (err) {
            console.error('导入时间记录失败:', err);
            alert('导入失败: ' + err.message);
        }
    }

    /**
     * 生成时间记录的MD表格内容（用于导入）
     */
    static generateTimeEntriesTableMarkdown(entries, tags) {
        const tagMap = new Map(tags.map(t => [t.id, t]));

        let content = '| 时间范围 | 时长 | 活动 | 标签 |\n';
        content += '|----------|------|------|------|\n';

        for (const entry of entries) {
            const start = new Date(entry.startTime);
            const end = new Date(entry.endTime);
            const timeRange = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}-${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
            const duration = formatDurationHuman(entry.duration);

            const tag = entry.tagId ? tagMap.get(entry.tagId) : null;
            const tagDisplay = tag ? `${tag.emoji || ''} ${tag.name}`.trim() : '';

            const activity = (entry.activity || '未命名').replace(/\|/g, '\\|');

            content += `| ${timeRange} | ${duration} | ${activity} | ${tagDisplay} |\n`;
        }

        return content;
    }

    /**
     * 生成时间记录的MD列表内容（用于导入）
     */
    static generateTimeEntriesListMarkdown(entries, tags) {
        const tagMap = new Map(tags.map(t => [t.id, t]));

        let content = '';

        for (const entry of entries) {
            const start = new Date(entry.startTime);
            const end = new Date(entry.endTime);
            const timeRange = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}-${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
            const duration = formatDurationHuman(entry.duration);

            const tag = entry.tagId ? tagMap.get(entry.tagId) : null;
            const tagDisplay = tag ? `${tag.emoji || ''} ${tag.name}`.trim() : '';

            content += `- ${timeRange} ${entry.activity || '未命名'}（${duration}）${tagDisplay ? ' ' + tagDisplay : ''}\n`;
        }

        return content;
    }
}

/**
 * 移动端每日笔记模块
 */
class MobileNotes {
    static currentDate = new Date().toISOString().split('T')[0];
    static isDirty = false;
    static saveTimeout = null;
    static lastSavedContent = '';
    static viewMode = 'edit';

    static init() {
        this.bindEvents();
        this.loadNote(this.currentDate);
    }

    static bindEvents() {
        const editor = document.getElementById('noteEditorMobile');
        const dateInput = document.getElementById('noteDateInputMobile');
        const prevBtn = document.getElementById('btnNotePrevMobile');
        const nextBtn = document.getElementById('btnNoteNextMobile');
        const toggleBtn = document.getElementById('noteViewToggleMobile');

        if (editor && !editor.dataset.bound) {
            editor.dataset.bound = 'true';
            editor.addEventListener('input', () => {
                this.isDirty = true;
                this.autoSave();
            });
        }

        if (dateInput && !dateInput.dataset.bound) {
            dateInput.dataset.bound = 'true';
            dateInput.value = this.currentDate;
            dateInput.addEventListener('change', (e) => {
                this.changeDate(e.target.value);
            });
        }

        if (prevBtn && !prevBtn.dataset.bound) {
            prevBtn.dataset.bound = 'true';
            prevBtn.addEventListener('click', () => this.navigateDate(-1));
        }

        if (nextBtn && !nextBtn.dataset.bound) {
            nextBtn.dataset.bound = 'true';
            nextBtn.addEventListener('click', () => this.navigateDate(1));
        }

        // 今天按钮（移动端）
        const todayBtnMobile = document.getElementById('btnNoteTodayMobile');
        if (todayBtnMobile && !todayBtnMobile.dataset.bound) {
            todayBtnMobile.dataset.bound = 'true';
            todayBtnMobile.addEventListener('click', () => this.goToToday());
        }

        if (toggleBtn && !toggleBtn.dataset.bound) {
            toggleBtn.dataset.bound = 'true';
            toggleBtn.addEventListener('click', () => this.toggleView());
        }

        // 导入时间追踪按钮（移动端）
        const importBtnMobile = document.getElementById('btnImportTimeMobile');
        if (importBtnMobile && !importBtnMobile.dataset.bound) {
            importBtnMobile.dataset.bound = 'true';
            importBtnMobile.addEventListener('click', () => this.showTimeImportDialog());
        }
    }

    static autoSave() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(() => {
            this.saveNote();
        }, 1000);
    }

    static async loadNote(date) {
        const editor = document.getElementById('noteEditorMobile');
        const dateDisplay = document.getElementById('noteDateMobile');
        const dateInput = document.getElementById('noteDateInputMobile');

        if (!editor) return;

        try {
            const note = await db.getDailyNote(date);
            if (note) {
                editor.value = note.content || '';
                this.lastSavedContent = note.content || '';
            } else {
                editor.value = '';
                this.lastSavedContent = '';
            }

            this.currentDate = date;
            this.isDirty = false;

            if (dateDisplay) {
                dateDisplay.textContent = DailyNote.formatDateDisplay(date);
            }
            if (dateInput) {
                dateInput.value = date;
            }

            this.renderPreview();
        } catch (err) {
            console.error('加载笔记失败:', err);
        }
    }

    static async saveNote() {
        const editor = document.getElementById('noteEditorMobile');
        const statusEl = document.getElementById('noteStatusMobile');

        if (!editor) return;

        const content = editor.value.trim();

        if (content === this.lastSavedContent) {
            return;
        }

        try {
            if (content) {
                await db.saveDailyNote({
                    id: this.currentDate,
                    content: content
                });
                this.lastSavedContent = content;

                if (statusEl) {
                    statusEl.textContent = '已自动保存';
                    statusEl.style.color = 'var(--success-color, #4caf50)';
                    setTimeout(() => {
                        statusEl.textContent = '';
                    }, 2000);
                }
            } else {
                await db.deleteDailyNote(this.currentDate);
                this.lastSavedContent = '';
            }

            this.isDirty = false;
            this.renderPreview();
        } catch (err) {
            console.error('保存笔记失败:', err);
            if (statusEl) {
                statusEl.textContent = '保存失败';
                statusEl.style.color = 'var(--error-color, #f44336)';
            }
        }
    }

    static async changeDate(newDate) {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        await this.saveNote();
        await this.loadNote(newDate);
    }

    static async navigateDate(delta) {
        const current = new Date(this.currentDate);
        current.setDate(current.getDate() + delta);
        const newDate = current.toISOString().split('T')[0];
        await this.changeDate(newDate);
    }

    static async goToToday() {
        const today = new Date().toISOString().split('T')[0];
        await this.changeDate(today);
    }

    static renderPreview() {
        const editor = document.getElementById('noteEditorMobile');
        const preview = document.getElementById('notePreviewMobile');

        if (!editor || !preview) return;

        const content = editor.value;
        if (!content) {
            preview.innerHTML = '<p class="empty-preview">预览区域</p>';
            return;
        }

        preview.innerHTML = DailyNote.parseMarkdown(content);
    }

    static toggleView() {
        const preview = document.getElementById('notePreviewMobile');
        const toggleBtn = document.getElementById('noteViewToggleMobile');
        const editorContainer = document.querySelector('#notesPanel .note-editor');

        if (this.viewMode === 'edit') {
            this.viewMode = 'preview';
            this.renderPreview();
            if (preview) preview.classList.add('show');
            if (toggleBtn) toggleBtn.textContent = '编辑';
            if (editorContainer) editorContainer.classList.add('hidden');
        } else {
            this.viewMode = 'edit';
            if (preview) preview.classList.remove('show');
            if (toggleBtn) toggleBtn.textContent = '预览';
            if (editorContainer) editorContainer.classList.remove('hidden');
        }
    }

    /**
     * 显示导入时间追踪对话框（移动端）
     */
    static showTimeImportDialog() {
        // 复用 DailyNote 的对话框实现
        DailyNote.showTimeImportDialog();
    }

    /**
     * 导入时间追踪记录到笔记（移动端）
     */
    static async importTimeEntries(date, format) {
        // 修改当前日期后再调用 DailyNote 的导入方法
        const originalDate = this.currentDate;
        this.currentDate = date;

        try {
            const entries = await db.getTimeEntriesByDate(date);
            const tags = await db.getAllTimeTags();

            if (!entries || entries.length === 0) {
                alert('所选日期没有时间记录');
                return;
            }

            let importContent;

            if (format === 'table') {
                importContent = DailyNote.generateTimeEntriesTableMarkdown(entries, tags);
            } else {
                importContent = DailyNote.generateTimeEntriesListMarkdown(entries, tags);
            }

            // 获取当前笔记内容
            const editor = document.getElementById('noteEditorMobile');
            if (!editor) {
                console.error('找不到笔记编辑器');
                return;
            }

            let currentContent = editor.value.trim();

            // 追加内容
            if (currentContent) {
                currentContent += '\n\n' + importContent;
            } else {
                currentContent = importContent;
            }

            // 更新编辑器
            editor.value = currentContent;

            // 标记为已修改并保存
            this.isDirty = true;
            this.lastSavedContent = '';
            await this.saveNote();

            // 刷新预览
            this.renderPreview();

        } catch (err) {
            console.error('导入时间记录失败:', err);
            alert('导入失败: ' + err.message);
        } finally {
            this.currentDate = originalDate;
        }
    }
}

// 导出到全局
window.MobileNotes = MobileNotes;
