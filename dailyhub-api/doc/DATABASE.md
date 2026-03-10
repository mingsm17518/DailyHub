# Calendar API 数据库文档

本文档详细描述了 Calendar API 使用的数据库结构、表关系、索引策略和同步机制。

## 目录

- [数据库概述](#数据库概述)
- [表结构](#表结构)
- [索引说明](#索引说明)
- [表关系](#表关系)
- [同步策略](#同步策略)
- [迁移指南](#迁移指南)

---

## 数据库概述

Calendar API 使用 **SQLite** 作为数据存储引擎，具有以下特点：

- 轻量级：无需独立数据库服务器
- 零配置：开箱即用
- 跨平台：支持 Windows、Linux、macOS
- 事务支持：ACID 特性保证数据一致性
- WAL 模式：提升并发读写性能

### 数据库文件位置

```
/data/lx/calendar/calendar-api/calendar.db
```

### 连接配置

```python
# config.py
DATABASE_PATH = './calendar.db'
```

---

## 表结构

### users 表

存储用户账号信息。

#### 表结构

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 字段说明

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 用户唯一标识 |
| username | TEXT | UNIQUE NOT NULL | 用户名，唯一 |
| password_hash | TEXT | NOT NULL | 加密后的密码（使用 werkzeug.security） |
| is_admin | INTEGER | DEFAULT 0 | 是否为管理员（0=否，1=是） |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 账号创建时间 |

#### 示例数据

```
┌────┬──────────┬─────────────────────────────┬──────────┬─────────────────────┐
│ id │ username │ password_hash               │ is_admin │ created_at          │
├────┼──────────┼─────────────────────────────┼──────────┼─────────────────────┤
│ 1  │ alice    │ pbkdf2:sha256:260000$salt... │ 0        │ 2024-02-27 10:00:00 │
│ 2  │ admin    │ pbkdf2:sha256:260000$salt... │ 1        │ 2024-02-27 11:00:00 │
└────┴──────────┴─────────────────────────────┴──────────┴─────────────────────┘
```

#### 级联删除

当用户被删除时（通过管理员 API `DELETE /api/admin/users/<user_id>`），由于外键设置了 `ON DELETE CASCADE`：
- 该用户的所有 **events** 记录会被自动删除
- 该用户的所有 **todos** 记录会被自动删除
- 该用户的所有 **deleted_events** 墓碑记录会被自动删除
- 该用户的所有 **deleted_todos** 墓碑记录会被自动删除

#### 管理员操作

| 方法 | 说明 | API 端点 |
|------|------|----------|
| `User.get_all()` | 获取所有用户列表 | `GET /api/admin/users` |
| `User.delete_by_id(id)` | 删除指定用户（级联删除相关数据） | `DELETE /api/admin/users/<id>` |

---

### events 表

存储日程事件信息。

#### 表结构

```sql
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    etag TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### 字段说明

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 事件唯一标识（客户端生成 UUID） |
| user_id | INTEGER | NOT NULL, FOREIGN KEY | 所属用户 ID |
| title | TEXT | NOT NULL | 事件标题 |
| date | TEXT | NOT NULL | 日期（YYYY-MM-DD 格式） |
| start_time | TEXT | - | 开始时间（HH:MM 格式） |
| end_time | TEXT | - | 结束时间（HH:MM 格式） |
| description | TEXT | - | 事件描述 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 最后更新时间，用于冲突解决 |
| etag | TEXT | - | ETag 标识，用于版本控制 |

> **注意**：数据库使用 snake_case 命名（如 `start_time`、`end_time`），但 API 响应会自动转换为 camelCase（`startTime`、`endTime`）以与前端保持一致。同时，API 请求也兼容两种格式。

#### 索引

```sql
-- 用户和日期复合索引
CREATE INDEX idx_events_user_date ON events(user_id, date);

-- 更新时间索引（用于增量同步）
CREATE INDEX idx_events_updated ON events(user_id, updated_at);
```

#### 示例数据

```
┌──────────┬─────────┬──────────┬────────────┬────────────┬──────────┬──────────────┬─────────────────────┐
│ id       │ user_id │ title    │ date       │ start_time │ end_time │ description  │ updated_at          │
├──────────┼─────────┼──────────┼────────────┼────────────┼──────────┼──────────────┼─────────────────────┤
│ evt-001  │ 1       │ 会议     │ 2024-02-27 │ 14:00      │ 15:00    │ 周例会       │ 2024-02-27 10:00:00 │
│ evt-002  │ 1       │ 生日     │ 2024-03-01 │ NULL       │ NULL     │ 小明生日     │ 2024-02-27 11:00:00 │
│ evt-003  │ 2       │ 面试     │ 2024-02-28 │ 10:00      │ 11:00    │ 技术面试     │ 2024-02-27 12:00:00 │
└──────────┴─────────┴──────────┴────────────┴────────────┴──────────┴──────────────┴─────────────────────┘
```

---

### todos 表

存储待办事项信息。

#### 表结构

```sql
CREATE TABLE todos (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    due_date TEXT,
    parent_id TEXT,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### 字段说明

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 待办唯一标识（客户端生成 UUID） |
| user_id | INTEGER | NOT NULL, FOREIGN KEY | 所属用户 ID |
| text | TEXT | NOT NULL | 待办内容 |
| done | INTEGER | DEFAULT 0 | 是否完成（0=未完成，1=已完成） |
| due_date | TEXT | - | 截止日期（YYYY-MM-DD 格式） |
| parent_id | TEXT | - | 父待办 ID（支持层级结构） |
| position | INTEGER | DEFAULT 0 | 排序位置 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 最后更新时间 |

#### 索引

```sql
-- 用户索引
CREATE INDEX idx_todos_user ON todos(user_id);

-- 更新时间索引（用于增量同步）
CREATE INDEX idx_todos_updated ON todos(user_id, updated_at);
```

#### 示例数据

```
┌──────────┬─────────┬──────────────┬──────┬────────────┬───────────┬──────────┬─────────────────────┬─────────────────────┐
│ id       │ user_id │ text         │ done │ due_date   │ parent_id │ position │ created_at          │ updated_at          │
├──────────┼─────────┼──────────────┼──────┼────────────┼───────────┼──────────┼─────────────────────┼─────────────────────┤
│ todo-001 │ 1       │ 完成报告     │ 0    │ 2024-03-01 │ NULL      │ 0        │ 2024-02-27 10:00:00 │ 2024-02-27 10:00:00 │
│ todo-002 │ 1       │ 收集资料     │ 1    │ NULL       │ todo-001  │ 0        │ 2024-02-27 10:05:00 │ 2024-02-27 11:00:00 │
│ todo-003 │ 1       │ 整理数据     │ 0    │ NULL       │ todo-001  │ 1        │ 2024-02-27 10:10:00 │ 2024-02-27 10:10:00 │
└──────────┴─────────┴──────────────┴──────┴────────────┴───────────┴──────────┴─────────────────────┴─────────────────────┘
```

---

### deleted_events 表

存储已删除事件的墓碑记录（Tombstone Pattern）。

#### 表结构

```sql
CREATE TABLE deleted_events (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### 字段说明

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 被删除事件的 ID |
| user_id | INTEGER | NOT NULL, FOREIGN KEY | 所属用户 ID |
| deleted_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 删除时间 |

#### 索引

```sql
-- 用户和删除时间复合索引
CREATE INDEX idx_deleted_events_user ON deleted_events(user_id, deleted_at);
```

#### 示例数据

```
┌──────────┬─────────┬─────────────────────┐
│ id       │ user_id │ deleted_at          │
├──────────┼─────────┼─────────────────────┤
│ evt-old1 │ 1       │ 2024-02-27 09:00:00 │
│ evt-old2 │ 1       │ 2024-02-27 10:00:00 │
└──────────┴─────────┴─────────────────────┘
```

---

### deleted_todos 表

存储已删除待办的墓碑记录。

#### 表结构

```sql
CREATE TABLE deleted_todos (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### 字段说明

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 被删除待办的 ID |
| user_id | INTEGER | NOT NULL, FOREIGN KEY | 所属用户 ID |
| deleted_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 删除时间 |

#### 索引

```sql
-- 用户和删除时间复合索引
CREATE INDEX idx_deleted_todos_user ON deleted_todos(user_id, deleted_at);
```

---

### habits 表

存储习惯打卡信息。

#### 表结构

```sql
CREATE TABLE habits (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#4CAF50',
    icon TEXT DEFAULT '✓',
    target_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### 字段说明

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 习惯唯一标识 |
| user_id | INTEGER | NOT NULL, FOREIGN KEY | 所属用户 ID |
| name | TEXT | NOT NULL | 习惯名称 |
| description | TEXT | - | 习惯描述 |
| color | TEXT | DEFAULT '#4CAF50' | 习惯颜色（十六进制） |
| icon | TEXT | DEFAULT '✓' | 习惯图标 |
| target_count | INTEGER | DEFAULT 1 | 每日目标次数 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 最后更新时间 |

#### 索引

```sql
-- 用户索引
CREATE INDEX idx_habits_user ON habits(user_id);
```

---

### habit_logs 表

存储习惯打卡记录。

#### 表结构

```sql
CREATE TABLE habit_logs (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    habit_id TEXT NOT NULL,
    log_date TEXT NOT NULL,
    count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
);
```

#### 字段说明

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 记录唯一标识 |
| user_id | INTEGER | NOT NULL, FOREIGN KEY | 所属用户 ID |
| habit_id | TEXT | NOT NULL, FOREIGN KEY | 关联习惯 ID |
| log_date | TEXT | NOT NULL | 打卡日期 (YYYY-MM-DD) |
| count | INTEGER | DEFAULT 1 | 打卡次数 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

#### 索引

```sql
-- 习惯和日期复合索引
CREATE INDEX idx_habit_logs_habit_date ON habit_logs(habit_id, log_date);
```

#### 唯一约束

```sql
-- 每个习惯每天只能有一条记录
UNIQUE(habit_id, log_date)
```

---

### time_entries 表

存储时间追踪记录。

#### 表结构

```sql
CREATE TABLE time_entries (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### 字段说明

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 记录唯一标识 |
| user_id | INTEGER | NOT NULL, FOREIGN KEY | 所属用户 ID |
| description | TEXT | NOT NULL | 时间记录描述 |
| start_time | TIMESTAMP | NOT NULL | 开始时间 |
| end_time | TIMESTAMP | - | 结束时间（可选） |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 最后更新时间 |

#### 索引

```sql
-- 用户和时间索引
CREATE INDEX idx_time_entries_user_time ON time_entries(user_id, start_time);
```

---

### deleted_habits 表

存储已删除习惯的墓碑记录。

#### 表结构

```sql
CREATE TABLE deleted_habits (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### 字段说明

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 被删除习惯的 ID |
| user_id | INTEGER | NOT NULL, FOREIGN KEY | 所属用户 ID |
| deleted_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 删除时间 |

#### 索引

```sql
-- 用户和删除时间复合索引
CREATE INDEX idx_deleted_habits_user ON deleted_habits(user_id, deleted_at);
```

---

### deleted_habit_logs 表

存储已删除打卡记录的墓碑记录。

#### 表结构

```sql
CREATE TABLE deleted_habit_logs (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

### deleted_time_entries 表

存储已删除时间记录的墓碑记录。

#### 表结构

```sql
CREATE TABLE deleted_time_entries (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### 索引

```sql
-- 用户和删除时间复合索引
CREATE INDEX idx_deleted_time_entries_user ON deleted_time_entries(user_id, deleted_at);
```

---

### invitation_codes 表

存储邀请码信息，用于用户注册验证。

#### 表结构

```sql
CREATE TABLE invitation_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    max_uses INTEGER DEFAULT 1,
    used_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 字段说明

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 邀请码唯一标识 |
| code | TEXT | UNIQUE NOT NULL | 邀请码字符串，唯一 |
| max_uses | INTEGER | DEFAULT 1 | 最大使用次数 |
| used_count | INTEGER | DEFAULT 0 | 已使用次数 |
| expires_at | TIMESTAMP | - | 过期时间（NULL 表示永不过期） |
| is_active | INTEGER | DEFAULT 1 | 是否激活（0=停用，1=激活） |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

#### 验证规则

邀请码验证逻辑：
1. 邀请码必须存在
2. 邀请码必须是激活状态（`is_active = 1`）
3. 如果设置了过期时间，当前时间必须小于过期时间
4. 使用次数必须小于最大使用次数（`used_count < max_uses`）

#### 索引

```sql
-- 邀请码唯一索引（已由 UNIQUE 约束自动创建）
CREATE UNIQUE INDEX idx_invitation_codes_code ON invitation_codes(code);
```

#### 示例数据

```
┌────┬─────────────┬──────────┬────────────┬─────────────────────┬───────────┬─────────────────────┐
│ id │ code        │ max_uses │ used_count │ expires_at           │ is_active │ created_at          │
├────┼─────────────┼──────────┼────────────┼─────────────────────┼───────────┼─────────────────────┤
│ 1  │ friend2024  │ 5        │ 2          │ NULL                 │ 1         │ 2026-03-01 13:40:33 │
│ 2  │ temp2024    │ 1        │ 1          │ 2026-03-15 23:59:59  │ 1         │ 2026-03-01 14:00:00 │
│ 3  │ expired2024 │ 10       │ 0          │ 2026-02-01 00:00:00  │ 1         │ 2026-01-01 10:00:00 │
└────┴─────────────┴──────────┴────────────┴─────────────────────┴───────────┴─────────────────────┘
```

#### 使用场景

- **注册验证**：用户注册时需要提供有效邀请码
- **使用次数限制**：控制邀请码可注册的账号数量
- **时效控制**：可设置邀请码过期时间
- **状态管理**：管理员可停用邀请码而不删除

---

## 索引说明

### 索引策略

| 索引名称 | 表 | 字段 | 用途 |
|----------|-----|------|------|
| idx_events_user_date | events | (user_id, date) | 按用户和日期查询事件 |
| idx_events_updated | events | (user_id, updated_at) | 增量同步查询 |
| idx_todos_user | todos | (user_id) | 按用户查询待办 |
| idx_todos_updated | todos | (user_id, updated_at) | 增量同步查询 |
| idx_deleted_events_user | deleted_events | (user_id, deleted_at) | 查询已删除事件 |
| idx_deleted_todos_user | deleted_todos | (user_id, deleted_at) | 查询已删除待办 |
| idx_invitation_codes_code | invitation_codes | (code) | 邀请码唯一查询 |

### 索引维护

```bash
# 查看索引使用情况
sqlite3 calendar.db "EXPLAIN QUERY PLAN SELECT * FROM events WHERE user_id = 1 AND date = '2024-02-27'"

# 重建索引
sqlite3 calendar.db "REINDEX"

# 分析表统计信息
sqlite3 calendar.db "ANALYZE"
```

---

## 表关系

### ER 图

```
┌─────────────────────┐
│       users         │
│ ─────────────────── │
│ id (PK)            ││──────────────────────────┐
│ username           ││                          │
│ password_hash      ││                          │
│ is_admin           ││                          │
│ created_at         ││                          │
└─────────────────────┘                          │
        │                                       │
        │                                       │
        │ 注册时验证                             │
        │                                       │
        ▼                                       ▼
┌─────────────────────┐               ┌─────────────────────┐
│  invitation_codes   │               │ (其他数据表)        │
│ ─────────────────── │               │ ─────────────────── │
│ id (PK)            │               │ events              │
│ code               │               │ todos               │
│ max_uses           │               │ deleted_events      │
│ used_count         │               │ deleted_todos       │
│ expires_at         │               │ ...                 │
│ is_active          │               └─────────────────────┘
│ created_at         │
└─────────────────────┘
```

### 关系说明

| 关系 | 类型 | 说明 |
|------|------|------|
| invitation_codes → users | 1:N | 一个邀请码可注册多个用户（受 max_uses 限制） |
| users → events | 1:N | 一个用户可以有多个事件 |
| users → todos | 1:N | 一个用户可以有多个待办 |
| users → deleted_events | 1:N | 一个用户可以有多个已删除事件墓碑 |
| users → deleted_todos | 1:N | 一个用户可以有多个已删除待办墓碑 |
| todos → todos | 1:N | 一个待办可以有多个子待办（通过 parent_id） |

### 级联删除

所有外键都设置了 `ON DELETE CASCADE`，当用户被删除时：

- 该用户的所有事件会被自动删除
- 该用户的所有待办会被自动删除
- 该用户的墓碑记录会被自动删除

---

## 同步策略

### 墓碑模式（Tombstone Pattern）

为了确保删除操作在多设备间正确同步，项目使用墓碑模式。

#### 工作原理

```
设备 A 删除事件 evt-1:
  ┌─────────────────────────────────────────────────────────────┐
  │ 1. 设备 A: 删除本地 evt-1，记录到本地 deleted_events        │
  │ 2. 设备 A: 同步到服务器，服务器删除 evt-1                   │
  │ 3. 服务器: 在 deleted_events 表创建墓碑记录                  │
  │ 4. 设备 B: 同步时收到 deleted_events 中的 evt-1             │
  │ 5. 设备 B: 删除本地 evt-1                                   │
  │ 6. 服务器: 30 天后自动清理墓碑记录                          │
  └─────────────────────────────────────────────────────────────┘
```

#### 同步流程

**获取数据时：**

1. 客户端发送本地已删除的 ID 列表（`?deleted=id1,id2`）
2. 服务器查询墓碑表，获取服务器端新增的已删除 ID
3. 服务器过滤掉客户端已删除的记录
4. 返回有效记录和新增的删除 ID

**删除数据时：**

1. 从主表删除记录
2. 在墓碑表创建记录（id + deleted_at）
3. 其他设备同步时会收到删除通知

#### 代码示例

```python
# 获取事件（带删除同步）
def get_events():
    # 获取客户端已删除 ID
    client_deleted_ids = set(request.args.get('deleted', '').split(','))

    # 获取服务器墓碑记录
    server_deleted_events = DeletedEvent.get_all_by_user(user_id)
    server_deleted_ids = set(row['id'] for row in server_deleted_events)

    # 计算新增删除
    newly_deleted = server_deleted_ids - client_deleted_ids

    # 过滤掉客户端已删除的记录
    events = [e for e in events if e['id'] not in client_deleted_ids]

    return jsonify({
        'events': events,
        'deleted_events': list(newly_deleted)
    })

# 删除事件
def delete_event(event_id):
    Event.delete(event_id, user_id)
    DeletedEvent.create(user_id, event_id)  # 创建墓碑记录
    return jsonify({'success': True})
```

### 冲突解决策略

使用 **Last Write Wins (LWW)** 策略，基于 `updated_at` 时间戳：

```
┌─────────────────────────────────────────────────────────────┐
│ 冲突判断:                                                    │
│                                                             │
│ if client_updated_at >= server_updated_at:                  │
│     → 接受客户端更改，更新服务器                            │
│ else:                                                       │
│     → 服务器版本更新，返回服务器版本给客户端                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 时间戳保留

为避免因网络延迟导致的误判，服务器保留客户端传递的 `updated_at` 时间：

```python
updated_at = event_data.get('updated_at') or datetime.utcnow().isoformat()
```

### 增量同步

基于 `updated_at` 时间戳的增量同步：

```python
def get_events_since(user_id, since):
    return conn.execute('''
        SELECT * FROM events
        WHERE user_id = ? AND updated_at > ?
        ORDER BY updated_at
    ''', (user_id, since))
```

---

## 迁移指南

### 数据库初始化

数据库在首次启动时自动初始化：

```python
from models import Database

Database.init_db()
```

### 备份数据库

```bash
# 方式 1: 直接复制
cp calendar.db calendar.db.backup

# 方式 2: SQLite 导出
sqlite3 calendar.db .dump > backup.sql

# 方式 3: 定时备份脚本
#!/bin/bash
BACKUP_DIR="/backup/calendar"
DATE=$(date +%Y%m%d_%H%M%S)
cp /data/lx/calendar/calendar-api/calendar.db $BACKUP_DIR/calendar_$DATE.db
```

### 恢复数据库

```bash
# 方式 1: 直接恢复
cp calendar.db.backup calendar.db

# 方式 2: 从 SQL 恢复
sqlite3 calendar.db < backup.sql
```

### 数据迁移

#### 迁移到新服务器

```bash
# 1. 停止服务
systemctl stop calendar-api

# 2. 备份数据库
cp calendar.db calendar.db.backup

# 3. 传输到新服务器
scp calendar.db user@new-server:/data/lx/calendar/calendar-api/

# 4. 在新服务器启动服务
systemctl start calendar-api
```

#### 版本升级

```sql
-- 示例: 添加新字段
ALTER TABLE events ADD COLUMN color TEXT;

-- 示例: 创建新索引
CREATE INDEX idx_events_color ON events(user_id, color);
```

### 数据库维护

```bash
# 检查数据库完整性
sqlite3 calendar.db "PRAGMA integrity_check;"

# 清理数据库
sqlite3 calendar.db "VACUUM;"

# 查看数据库大小
ls -lh calendar.db

# 查看表统计信息
sqlite3 calendar.db "SELECT count(*) FROM events;"
sqlite3 calendar.db "SELECT count(*) FROM todos;"
```

### 性能优化

```sql
-- 启用 WAL 模式（已默认启用）
PRAGMA journal_mode=WAL;

-- 设置同步模式
PRAGMA synchronous=NORMAL;

-- 设置缓存大小（页面数）
PRAGMA cache_size=-2000;  -- 约 2MB

-- 设置临时存储在内存
PRAGMA temp_store=MEMORY;
```

---

## 数据清理

### 自动清理策略

- **墓碑记录**: 30 天后自动清理
- **手动清理**: 可通过 API 调用 `DeletedEvent.delete_old(user_id, days)`

### 清理脚本

```python
# 清理指定天数前的墓碑记录
from models import DeletedEvent, DeletedTodo

DeletedEvent.delete_old(user_id, 30)
DeletedTodo.delete_old(user_id, 30)
```

---

## 数据安全

### 密码加密

使用 `werkzeug.security` 进行密码哈希：

```python
from werkzeug.security import generate_password_hash, check_password_hash

# 注册时
password_hash = generate_password_hash(password)

# 登录时
if check_password_hash(user['password_hash'], password):
    # 密码正确
```

### 数据隔离

每个用户只能访问自己的数据（通过 `user_id` 过滤）：

```python
# 查询时始终包含 user_id
SELECT * FROM events WHERE user_id = ?;
```

### SQL 注入防护

使用参数化查询：

```python
# 正确方式
conn.execute('SELECT * FROM events WHERE id = ?', (event_id,))

# 错误方式（不要这样）
conn.execute(f"SELECT * FROM events WHERE id = '{event_id}'")
```
