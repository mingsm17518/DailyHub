// 工具函数

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 解析日期字符串 YYYY-MM-DD
 * @param {string} dateStr
 * @returns {Date}
 */
function parseDate(dateStr) {
    const parts = dateStr.split('-');
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

/**
 * 格式化日期为中文显示
 * @param {Date} date
 * @returns {string}
 */
function formatChineseDate(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return `${year}年${month}月`;
}

/**
 * 获取月份的第一天
 * @param {number} year
 * @param {number} month
 * @returns {Date}
 */
function getFirstDayOfMonth(year, month) {
    return new Date(year, month, 1);
}

/**
 * 获取月份的最后一天
 * @param {number} year
 * @param {number} month
 * @returns {Date}
 */
function getLastDayOfMonth(year, month) {
    return new Date(year, month + 1, 0);
}

/**
 * 获取月份的天数
 * @param {number} year
 * @param {number} month
 * @returns {number}
 */
function getDaysInMonth(year, month) {
    return getLastDayOfMonth(year, month).getDate();
}

/**
 * 生成唯一ID
 * @returns {string}
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 显示提示消息
 * @param {string} message
 * @param {string} type
 */
function showToast(message, type = 'success') {
    // 移除已存在的toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // 触发动画
    setTimeout(() => toast.classList.add('show'), 10);

    // 3秒后移除
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * 比较两个日期是否是同一天
 * @param {Date} date1
 * @param {Date} date2
 * @returns {boolean}
 */
function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

/**
 * 格式化时间显示
 * @param {string} timeStr HH:MM格式
 * @returns {string}
 */
function formatTime(timeStr) {
    if (!timeStr) return '';
    return timeStr;
}

/**
 * 导出数据为JSON文件
 * @param {Object} data
 * @param {string} filename
 */
function exportToFile(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * 读取文件内容
 * @param {File} file
 * @returns {Promise<Object>}
 */
function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                resolve(data);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsText(file);
    });
}

/**
 * 深度克隆对象
 * @param {Object} obj
 * @returns {Object}
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * 转义HTML特殊字符
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 格式化时长（秒 -> HH:MM:SS）
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * 格式化时长为人类可读（秒 -> "2h 30m"）
 * @param {number} seconds
 * @returns {string}
 */
function formatDurationHuman(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) {
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${m}m`;
}

/**
 * 格式化时间范围显示
 * @param {string} startTime ISO时间字符串
 * @param {string} endTime ISO时间字符串
 * @returns {string}
 */
function formatTimeRange(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);

    const startHours = start.getHours().toString().padStart(2, '0');
    const startMinutes = start.getMinutes().toString().padStart(2, '0');
    const endHours = end.getHours().toString().padStart(2, '0');
    const endMinutes = end.getMinutes().toString().padStart(2, '0');

    return `${startHours}:${startMinutes} - ${endHours}:${endMinutes}`;
}

/**
 * 导出为CSV文件
 * @param {string} content - CSV内容
 * @param {string} filename - 文件名
 */
function exportToCSV(content, filename) {
    const BOM = '\uFEFF'; // UTF-8 BOM，确保Excel正确显示中文
    const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename);
}

/**
 * 导出为Markdown文件
 * @param {string} content - Markdown内容
 * @param {string} filename - 文件名
 */
function exportToMarkdown(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    downloadBlob(blob, filename);
}

/**
 * 下载Blob文件（通用下载函数）
 * @param {Blob} blob
 * @param {string} filename
 */
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * 将时间记录转换为CSV格式
 * @param {Array} entries - 时间记录数组
 * @param {Array} tags - 标签数组
 * @returns {string}
 */
function timeEntriesToCSV(entries, tags) {
    if (!entries || entries.length === 0) {
        return '日期,开始时间,结束时间,时长(秒),时长,活动,标签\n暂无时间记录';
    }

    // 创建标签Map以便快速查找
    const tagMap = new Map(tags.map(t => [t.id, t]));

    // CSV表头
    const headers = ['日期', '开始时间', '结束时间', '时长(秒)', '时长', '活动', '标签'];

    // 转换每条记录
    const rows = entries.map(entry => {
        const start = new Date(entry.startTime);
        const end = new Date(entry.endTime);
        const date = formatDate(start);
        const startTime = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
        const endTime = `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
        const durationHuman = formatDurationHuman(entry.duration);

        // 获取标签
        const tag = entry.tagId ? tagMap.get(entry.tagId) : null;
        const tagDisplay = tag ? `${tag.emoji || ''} ${tag.name}`.trim() : '';

        // 转义CSV中的特殊字符（逗号、引号、换行）
        const escapeCsv = (text) => {
            if (!text) return '';
            const str = String(text);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        return [
            date,
            startTime,
            endTime,
            entry.duration,
            durationHuman,
            escapeCsv(entry.activity || '未命名'),
            escapeCsv(tagDisplay)
        ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
}

/**
 * 将时间记录转换为Markdown表格格式
 * @param {Array} entries - 时间记录数组
 * @param {Array} tags - 标签数组
 * @returns {string}
 */
function timeEntriesToMarkdownTable(entries, tags) {
    const now = new Date();
    let content = `# 时间记录导出 - ${formatDate(now)}\n\n`;

    if (!entries || entries.length === 0) {
        return content + '暂无时间记录\n';
    }

    const tagMap = new Map(tags.map(t => [t.id, t]));

    // 计算总时长
    const totalDuration = entries.reduce((sum, e) => sum + (e.duration || 0), 0);

    // 表头
    content += '| 日期 | 时间范围 | 时长 | 活动 | 标签 |\n';
    content += '|------|----------|------|------|------|\n';

    // 表格行
    for (const entry of entries) {
        const start = new Date(entry.startTime);
        const end = new Date(entry.endTime);
        const date = formatDate(start);
        const timeRange = formatTimeRange(entry.startTime, entry.endTime);
        const duration = formatDurationHuman(entry.duration);

        // 转义Markdown表格中的特殊字符
        const escapeMarkdown = (text) => {
            if (!text) return '';
            return String(text).replace(/\|/g, '\\|');
        };

        const tag = entry.tagId ? tagMap.get(entry.tagId) : null;
        const tagDisplay = tag ? `${tag.emoji || ''} ${tag.name}`.trim() : '';

        content += `| ${date} | ${timeRange} | ${duration} | ${escapeMarkdown(entry.activity || '未命名')} | ${escapeMarkdown(tagDisplay)} |\n`;
    }

    content += `\n**总计：${formatDurationHuman(totalDuration)}**\n`;
    return content;
}

/**
 * 将时间记录转换为Markdown列表格式
 * @param {Array} entries - 时间记录数组
 * @param {Array} tags - 标签数组
 * @returns {string}
 */
function timeEntriesToMarkdownList(entries, tags) {
    const now = new Date();
    let content = `# 时间记录导出 - ${formatDate(now)}\n\n`;

    if (!entries || entries.length === 0) {
        return content + '暂无时间记录\n';
    }

    const tagMap = new Map(tags.map(t => [t.id, t]));

    // 按日期分组
    const groupedByDate = new Map();
    let totalDuration = 0;

    for (const entry of entries) {
        const start = new Date(entry.startTime);
        const date = formatDate(start);

        if (!groupedByDate.has(date)) {
            groupedByDate.set(date, []);
        }
        groupedByDate.get(date).push(entry);
        totalDuration += entry.duration || 0;
    }

    // 按日期排序（最新的在前）
    const sortedDates = Array.from(groupedByDate.keys()).sort().reverse();

    for (const date of sortedDates) {
        content += `## ${date}\n\n`;

        for (const entry of groupedByDate.get(date)) {
            const start = new Date(entry.startTime);
            const end = new Date(entry.endTime);
            const timeRange = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')} - ${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
            const duration = formatDurationHuman(entry.duration);

            const tag = entry.tagId ? tagMap.get(entry.tagId) : null;
            const tagDisplay = tag ? `${tag.emoji || ''} ${tag.name}`.trim() : '';

            content += `- ${tagDisplay ? tagDisplay + ' ' : ''}${entry.activity || '未命名'} (${timeRange}) - ${duration}\n`;
        }

        content += '\n';
    }

    content += `**总计：${formatDurationHuman(totalDuration)}**\n`;
    return content;
}
