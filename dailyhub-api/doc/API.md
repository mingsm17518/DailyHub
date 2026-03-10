# Calendar API 详细文档

本文档详细描述了 Calendar API 的所有端点、请求/响应格式、错误代码和使用示例。

## 目录

- [认证机制](#认证机制)
- [认证端点](#认证端点)
- [用户端点](#用户端点)
- [管理员端点](#管理员端点)
- [邀请码端点](#邀请码端点)
- [事件端点](#事件端点)
- [待办事项端点](#待办事项端点)
- [同步端点](#同步端点)
- [错误代码](#错误代码)
- [数据模型](#数据模型)

---

## 认证机制

Calendar API 使用 JWT (JSON Web Token) 进行身份验证。

### 获取令牌

通过 `/api/login` 或 `/api/register` 端点获取访问令牌。

### 使用令牌

在需要认证的请求头中包含令牌：

```
Authorization: Bearer <access_token>
```

### 令牌有效期

- 默认有效期：30 天
- 过期后需要重新登录获取新令牌

---

## 认证端点

### 用户注册

创建新用户账号并获取访问令牌。

**端点：** `POST /api/register`

**认证：** 否

**请求体：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名，至少 3 个字符 |
| password | string | 是 | 密码，至少 6 个字符 |
| invitation_code | string | 是 | 邀请码，至少 4 个字符 |

**请求示例：**

```bash
curl -X POST http://localhost:3001/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "password123",
    "invitation_code": "friend2024"
  }'
```

**成功响应 (201 Created):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user_id": 1,
  "username": "testuser"
}
```

**错误响应 (400 Bad Request):**

```json
{
  "error": "Username already exists"
}
```

```json
{
  "error": "Username must be at least 3 characters"
}
```

```json
{
  "error": "Password must be at least 6 characters"
}
```

---

### 用户登录

使用用户名和密码登录，获取访问令牌。

**端点：** `POST /api/login`

**认证：** 否

**请求体：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名 |
| password | string | 是 | 密码 |

**请求示例：**

```bash
curl -X POST http://localhost:3001/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "password123"
  }'
```

**成功响应 (200 OK):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user_id": 1,
  "username": "testuser"
}
```

**错误响应 (401 Unauthorized):**

```json
{
  "error": "Invalid username or password"
}
```

---

## 用户端点

### 获取当前用户信息

获取当前登录用户的信息，包括管理员权限状态。

**端点：** `GET /api/user/me`

**认证：** 是

**请求示例：**

```bash
curl -X GET http://localhost:3001/api/user/me \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
{
  "id": 2,
  "username": "admin",
  "is_admin": true
}
```

**错误响应 (404 Not Found):**

```json
{
  "error": "User not found"
}
```

---

## 管理员端点

管理员端点仅对管理员用户可用。

### 获取所有用户

获取系统中所有用户的列表。

**端点：** `GET /api/admin/users`

**认证：** 是（仅管理员）

**请求示例：**

```bash
curl -X GET http://localhost:3001/api/admin/users \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
[
  {
    "id": 2,
    "username": "admin",
    "is_admin": true,
    "created_at": "2026-02-24 18:03:44"
  },
  {
    "id": 3,
    "username": "testuser",
    "is_admin": false,
    "created_at": "2026-02-26 01:57:51"
  }
]
```

**错误响应 (403 Forbidden):**

```json
{
  "error": "Admin permission required"
}
```

---

### 删除用户

删除指定用户及其所有相关数据（事件、待办等）。

**端点：** `DELETE /api/admin/users/<user_id>`

**认证：** 是（仅管理员）

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| user_id | integer | 用户 ID |

**注意：** 由于数据库使用 `ON DELETE CASCADE`，删除用户会自动删除：
- 该用户的所有事件
- 该用户的所有待办事项
- 该用户的删除记录（墓碑）

**请求示例：**

```bash
curl -X DELETE http://localhost:3001/api/admin/users/7 \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
{
  "success": true
}
```

**错误响应 (400 Bad Request):**

```json
{
  "error": "Cannot delete yourself"
}
```

**错误响应 (403 Forbidden):**

```json
{
  "error": "Admin permission required"
}
```

**错误响应 (404 Not Found):**

```json
{
  "error": "User not found"
}
```

---

## 邀请码端点

邀请码管理端点仅对管理员用户可用。

### 创建邀请码

创建新的邀请码，可设置使用次数限制和过期时间。

**端点：** `POST /api/invitation-codes`

**认证：** 是（仅管理员）

**请求体：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | 邀请码（至少 4 个字符） |
| max_uses | integer | 否 | 最大使用次数，默认 1 |
| expires_at | string | 否 | 过期时间 (ISO 8601)，可选 |

**请求示例：**

```bash
curl -X POST http://localhost:3001/api/invitation-codes \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "friend2024",
    "max_uses": 5,
    "expires_at": "2026-12-31T23:59:59Z"
  }'
```

**成功响应 (201 Created):**

```json
{
  "code": "friend2024",
  "max_uses": 5,
  "expires_at": "2026-12-31T23:59:59Z"
}
```

**错误响应 (400 Bad Request):**

```json
{
  "error": "Invitation code already exists"
}
```

**错误响应 (403 Forbidden):**

```json
{
  "error": "Admin permission required"
}
```

---

### 获取邀请码列表

获取所有邀请码及其使用情况。

**端点：** `GET /api/invitation-codes`

**认证：** 是（仅管理员）

**请求示例：**

```bash
curl -X GET http://localhost:3001/api/invitation-codes \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
{
  "codes": [
    {
      "id": 1,
      "code": "friend2024",
      "max_uses": 5,
      "used_count": 2,
      "created_at": "2026-03-01T13:40:33",
      "expires_at": null,
      "is_active": true
    },
    {
      "id": 2,
      "code": "temp2024",
      "max_uses": 1,
      "used_count": 1,
      "created_at": "2026-03-01T14:00:00",
      "expires_at": "2026-03-15T23:59:59Z",
      "is_active": true
    }
  ]
}
```

**错误响应 (403 Forbidden):**

```json
{
  "error": "Admin permission required"
}
```

---

### 删除邀请码

删除指定的邀请码。

**端点：** `DELETE /api/invitation-codes/<code_id>`

**认证：** 是（仅管理员）

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| code_id | integer | 邀请码 ID |

**请求示例：**

```bash
curl -X DELETE http://localhost:3001/api/invitation-codes/1 \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
{
  "success": true
}
```

**错误响应 (403 Forbidden):**

```json
{
  "error": "Admin permission required"
}
```

**错误响应 (404 Not Found):**

```json
{
  "error": "Invitation code not found"
}
```

---

## 事件端点

### 获取所有事件

获取当前用户的所有事件，支持删除同步。

**端点：** `GET /api/events`

**认证：** 是

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deleted | string | 否 | 客户端已删除的事件 ID，逗号分隔 |

**请求示例：**

```bash
curl -X GET http://localhost:3001/api/events?deleted=event1,event2 \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
{
  "events": [
    {
      "id": "evt-12345",
      "title": "团队会议",
      "date": "2024-02-27",
      "startTime": "14:00",
      "endTime": "15:00",
      "description": "周例会",
      "updated_at": "2024-02-27T10:30:00",
      "etag": "abc123"
    }
  ],
  "deleted_events": ["evt-old-1"]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| events | array | 事件列表 |
| deleted_events | array | 服务器端新增的已删除事件 ID |

---

### 获取单个事件

获取指定 ID 的事件详情。

**端点：** `GET /api/events/<event_id>`

**认证：** 是

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| event_id | string | 事件 ID |

**请求示例：**

```bash
curl -X GET http://localhost:3001/api/events/evt-12345 \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
{
  "id": "evt-12345",
  "title": "团队会议",
  "date": "2024-02-27",
  "startTime": "14:00",
  "endTime": "15:00",
  "description": "周例会",
  "updated_at": "2024-02-27T10:30:00",
  "etag": "abc123"
}
```

**错误响应 (404 Not Found):**

```json
{
  "error": "Event not found"
}
```

---

### 创建或更新事件

创建新事件或更新现有事件（基于 ID）。

**端点：** `POST /api/events`

**认证：** 是

**请求体：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 事件 ID |
| title | string | 是 | 事件标题 |
| date | string | 是 | 日期 (YYYY-MM-DD) |
| startTime | string | 否 | 开始时间 (HH:MM) |
| endTime | string | 否 | 结束时间 (HH:MM) |
| description | string | 否 | 描述 |
| updated_at | string | 否 | 更新时间 (ISO 8601) |
| etag | string | 否 | ETag 标识 |

**注意**：API 同时兼容 `start_time`/`end_time` (snake_case) 格式。

**请求示例（创建）：**

```bash
curl -X POST http://localhost:3001/api/events \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt-12345",
    "title": "团队会议",
    "date": "2024-02-27",
    "startTime": "14:00",
    "endTime": "15:00",
    "description": "周例会"
  }'
```

**创建成功响应 (201 Created):**

```json
{
  "id": "evt-12345",
  "title": "团队会议",
  "date": "2024-02-27",
  "startTime": "14:00",
  "endTime": "15:00",
  "description": "周例会",
  "updated_at": "2024-02-27T10:30:00",
  "etag": "abc123"
}
```

**更新成功响应 (200 OK):**

```json
{
  "id": "evt-12345",
  "title": "更新后的标题",
  "date": "2024-02-28",
  "startTime": "15:00",
  "endTime": "16:00",
  "description": "更新后的描述",
  "updated_at": "2024-02-27T11:00:00",
  "etag": "def456"
}
```

**错误响应 (400 Bad Request):**

```json
{
  "error": "Title and date are required"
}
```

---

### 删除事件

删除指定 ID 的事件。

**端点：** `DELETE /api/events/<event_id>`

**认证：** 是

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| event_id | string | 事件 ID |

**请求示例：**

```bash
curl -X DELETE http://localhost:3001/api/events/evt-12345 \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
{
  "success": true
}
```

**错误响应 (404 Not Found):**

```json
{
  "error": "Event not found"
}
```

---

### 批量同步事件

批量同步多个事件，支持冲突解决。

**端点：** `POST /api/events/batch`

**认证：** 是

**请求体：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| events | array | 是 | 事件数组 |

**请求示例：**

```bash
curl -X POST http://localhost:3001/api/events/batch \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "id": "evt-1",
        "title": "事件1",
        "date": "2024-02-27",
        "updated_at": "2024-02-27T10:00:00"
      },
      {
        "id": "evt-2",
        "title": "事件2",
        "date": "2024-02-28",
        "updated_at": "2024-02-27T11:00:00"
      }
    ]
  }'
```

**成功响应 (200 OK):**

```json
{
  "synced": [
    {
      "id": "evt-1",
      "title": "事件1",
      "date": "2024-02-27",
      "updated_at": "2024-02-27T10:00:00"
    },
    {
      "id": "evt-2",
      "title": "事件2",
      "date": "2024-02-28",
      "updated_at": "2024-02-27T11:00:00"
    }
  ],
  "all_events": [
    {
      "id": "evt-1",
      "title": "事件1",
      "date": "2024-02-27"
    },
    {
      "id": "evt-2",
      "title": "事件2",
      "date": "2024-02-28"
    }
  ]
}
```

**冲突解决规则：**

- 客户端 `updated_at` >= 服务器 `updated_at`：接受客户端更改
- 服务器 `updated_at` > 客户端 `updated_at`：返回服务器版本

---

### 增量同步事件

获取指定时间之后更新的事件。

**端点：** `GET /api/sync`

**认证：** 是

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| since | string | 否 | 起始时间 (ISO 8601)，默认 1970-01-01 |

**请求示例：**

```bash
curl -X GET "http://localhost:3001/api/sync?since=2024-02-27T00:00:00" \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
[
  {
    "id": "evt-12345",
    "title": "团队会议",
    "date": "2024-02-27",
    "updated_at": "2024-02-27T10:30:00"
  }
]
```

---

## 待办事项端点

### 获取所有待办

获取当前用户的所有待办事项，支持删除同步。

**端点：** `GET /api/todos`

**认证：** 是

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deleted | string | 否 | 客户端已删除的待办 ID，逗号分隔 |

**请求示例：**

```bash
curl -X GET http://localhost:3001/api/todos?deleted=todo1,todo2 \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
{
  "todos": [
    {
      "id": "todo-123",
      "text": "完成项目报告",
      "done": false,
      "dueDate": "2024-02-28",
      "parentId": null,
      "position": 0,
      "created_at": "2024-02-27T10:00:00",
      "updated_at": "2024-02-27T10:00:00"
    },
    {
      "id": "todo-124",
      "text": "子任务",
      "done": false,
      "dueDate": null,
      "parentId": "todo-123",
      "position": 0,
      "created_at": "2024-02-27T10:05:00",
      "updated_at": "2024-02-27T10:05:00"
    }
  ],
  "deleted_todos": ["todo-old-1"]
}
```

---

### 获取单个待办

获取指定 ID 的待办详情。

**端点：** `GET /api/todos/<todo_id>`

**认证：** 是

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| todo_id | string | 待办 ID |

**请求示例：**

```bash
curl -X GET http://localhost:3001/api/todos/todo-123 \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
{
  "id": "todo-123",
  "text": "完成项目报告",
  "done": false,
  "dueDate": "2024-02-28",
  "parentId": null,
  "position": 0,
  "created_at": "2024-02-27T10:00:00",
  "updated_at": "2024-02-27T10:00:00"
}
```

---

### 创建或更新待办

创建新待办或更新现有待办（基于 ID）。

**端点：** `POST /api/todos`

**认证：** 是

**请求体：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 待办 ID |
| text | string | 是 | 待办内容 |
| done | boolean | 否 | 是否完成，默认 false |
| dueDate | string | 否 | 截止日期 (YYYY-MM-DD) |
| parentId | string | 否 | 父待办 ID |
| position | number | 否 | 排序位置，默认 0 |
| createdAt | string | 否 | 创建时间 (ISO 8601) |

**请求示例：**

```bash
curl -X POST http://localhost:3001/api/todos \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "todo-123",
    "text": "完成项目报告",
    "done": false,
    "dueDate": "2024-02-28",
    "position": 0
  }'
```

**创建成功响应 (201 Created):**

```json
{
  "id": "todo-123",
  "text": "完成项目报告",
  "done": false,
  "dueDate": "2024-02-28",
  "parentId": null,
  "position": 0,
  "created_at": "2024-02-27T10:00:00",
  "updated_at": "2024-02-27T10:00:00"
}
```

---

### 删除待办

删除指定 ID 的待办。

**端点：** `DELETE /api/todos/<todo_id>`

**认证：** 是

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| todo_id | string | 待办 ID |

**请求示例：**

```bash
curl -X DELETE http://localhost:3001/api/todos/todo-123 \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
{
  "success": true
}
```

---

### 批量同步待办

批量同步多个待办，支持冲突解决。

**端点：** `POST /api/todos/batch`

**认证：** 是

**请求体：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| todos | array | 是 | 待办数组 |

**请求示例：**

```bash
curl -X POST http://localhost:3001/api/todos/batch \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "todos": [
      {
        "id": "todo-1",
        "text": "任务1",
        "done": false,
        "dueDate": "2024-02-28"
      },
      {
        "id": "todo-2",
        "text": "任务2",
        "done": true
      }
    ]
  }'
```

**成功响应 (200 OK):**

```json
{
  "synced": [
    {
      "id": "todo-1",
      "text": "任务1",
      "done": false
    },
    {
      "id": "todo-2",
      "text": "任务2",
      "done": true
    }
  ],
  "all_todos": [
    {
      "id": "todo-1",
      "text": "任务1",
      "done": false
    },
    {
      "id": "todo-2",
      "text": "任务2",
      "done": true
    }
  ]
}
```

---

### 增量同步待办

获取指定时间之后更新的待办。

**端点：** `GET /api/todos/sync`

**认证：** 是

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| since | string | 否 | 起始时间 (ISO 8601)，默认 1970-01-01 |

**请求示例：**

```bash
curl -X GET "http://localhost:3001/api/todos/sync?since=2024-02-27T00:00:00" \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
[
  {
    "id": "todo-123",
    "text": "完成项目报告",
    "done": false,
    "updated_at": "2024-02-27T10:30:00"
  }
]
```

---

## 同步端点

### 健康检查

检查 API 服务状态。

**端点：** `GET /api/health`

**认证：** 否

**请求示例：**

```bash
curl http://localhost:3001/api/health
```

**成功响应 (200 OK):**

```json
{
  "status": "ok",
  "timestamp": "2024-02-27T10:30:00.123456"
}
```

---

## 错误代码

| HTTP 状态码 | 错误类型 | 说明 |
|-------------|----------|------|
| 200 | OK | 请求成功 |
| 201 | Created | 资源创建成功 |
| 400 | Bad Request | 请求参数错误 |
| 401 | Unauthorized | 未授权或令牌无效 |
| 404 | Not Found | 资源不存在 |
| 500 | Internal Server Error | 服务器内部错误 |

### 错误响应格式

```json
{
  "error": "错误描述信息"
}
```

### 常见错误信息

| 错误信息 | 场景 |
|----------|------|
| Username and password are required | 登录/注册时缺少用户名或密码 |
| Username must be at least 3 characters | 用户名太短 |
| Password must be at least 6 characters | 密码太短 |
| 请输入邀请码 | 注册时缺少邀请码 |
| 邀请码无效 | 邀请码不存在或已失效 |
| 此邀请码已停用 | 邀请码已被管理员停用 |
| 此邀请码已达到使用次数上限 | 邀请码已用完 |
| 此邀请码已过期 | 邀请码已过有效期 |
| Username already exists | 用户名已被占用 |
| Invalid username or password | 用户名或密码错误 |
| Title and date are required | 创建事件缺少必填字段 |
| Text is required | 创建待办缺少内容 |
| Event ID is required | 创建/更新事件缺少 ID |
| Todo ID is required | 创建/更新待办缺少 ID |
| Event not found | 事件不存在 |
| Todo not found | 待办不存在 |
| No data provided | 请求体为空 |
| Events array is required | 批量同步缺少事件数组 |
| Todos array is required | 批量同步缺少待办数组 |
| Admin permission required | 需要管理员权限 |
| Cannot delete yourself | 不能删除自己的账号 |
| User not found | 用户不存在 |
| Invitation code already exists | 邀请码已存在 |
| Invitation code not found | 邀请码不存在 |
| Code is required | 创建邀请码缺少 code 字段 |

---

## 数据模型

### Event 对象

```typescript
{
  id: string;              // 事件唯一标识
  title: string;           // 事件标题
  date: string;            // 日期 (YYYY-MM-DD)
  startTime?: string;      // 开始时间 (HH:MM)
  endTime?: string;        // 结束时间 (HH:MM)
  description?: string;    // 描述
  updated_at: string;      // 更新时间 (ISO 8601)
  etag?: string;          // ETag 标识
}
```

### Todo 对象

```typescript
{
  id: string;              // 待办唯一标识
  text: string;            // 待办内容
  done: boolean;           // 是否完成
  dueDate?: string;        // 截止日期 (YYYY-MM-DD)
  parentId?: string;       // 父待办 ID
  position: number;        // 排序位置
  created_at: string;      // 创建时间 (ISO 8601)
  updated_at: string;      // 更新时间 (ISO 8601)
}
```

### User 对象

```typescript
{
  id: number;              // 用户 ID
  username: string;        // 用户名
  token: string;          // JWT 访问令牌
}
```

---

## 速率限制

当前版本未实现速率限制。建议在生产环境中使用反向代理（如 Nginx）或 API 网关实现速率限制。

建议配置：

- 每个用户每分钟最多 100 次请求
- 登录/注册端点额外限制（每 IP 每分钟 5 次）

---

## WebSocket 支持

当前版本不支持 WebSocket。如需实时推送，建议使用轮询机制或升级到 WebSocket 实现。

---

## 习惯打卡端点

### 获取所有习惯

获取当前用户的所有习惯，支持删除同步。

**端点：** `GET /api/habits`

**认证：** 是

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| deleted | string | 否 | 客户端已删除的习惯 ID，逗号分隔 |

**请求示例：**

```bash
curl -X GET http://localhost:3001/api/habits?deleted=habit1,habit2 \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
{
  "habits": [
    {
      "id": "habit-001",
      "name": "早起",
      "description": "每天6点起床",
      "color": "#4CAF50",
      "icon": "🌅",
      "targetCount": 1,
      "created_at": "2024-02-27T10:00:00",
      "updated_at": "2024-02-27T10:00:00"
    }
  ],
  "deleted_habits": ["habit-old-1"]
}
```

---

### 创建或更新习惯

创建新习惯或更新现有习惯。

**端点：** `POST /api/habits`

**认证：** 是

**请求体：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 习惯 ID |
| name | string | 是 | 习惯名称 |
| description | string | 否 | 描述 |
| color | string | 否 | 颜色 (hex) |
| icon | string | 否 | 图标 |
| targetCount | number | 否 | 每日目标次数 |
| updated_at | string | 否 | 更新时间 (ISO 8601) |

**请求示例：**

```bash
curl -X POST http://localhost:3001/api/habits \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "habit-001",
    "name": "早起",
    "description": "每天6点起床",
    "color": "#4CAF50",
    "icon": "🌅",
    "targetCount": 1
  }'
```

**成功响应 (201 Created/200 OK):**

```json
{
  "id": "habit-001",
  "name": "早起",
  "description": "每天6点起床",
  "color": "#4CAF50",
  "icon": "🌅",
  "targetCount": 1,
  "created_at": "2024-02-27T10:00:00",
  "updated_at": "2024-02-27T10:00:00"
}
```

---

### 删除习惯

删除指定 ID 的习惯。

**端点：** `DELETE /api/habits/<habit_id>`

**认证：** 是

**请求示例：**

```bash
curl -X DELETE http://localhost:3001/api/habits/habit-001 \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
{
  "success": true
}
```

---

### 获取习惯打卡记录

获取指定习惯的打卡记录。

**端点：** `GET /api/habit-logs`

**认证：** 是

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| habit_id | string | 是 | 习惯 ID |
| start_date | string | 否 | 开始日期 (YYYY-MM-DD) |
| end_date | string | 否 | 结束日期 (YYYY-MM-DD) |

**请求示例：**

```bash
curl -X GET "http://localhost:3001/api/habit-logs?habit_id=habit-001&start_date=2024-02-01&end_date=2024-02-29" \
  -H "Authorization: Bearer <token>"
```

**成功响应 (200 OK):**

```json
{
  "logs": [
    {
      "id": "hl-001",
      "habitId": "habit-001",
      "logDate": "2024-02-27",
      "count": 1,
      "created_at": "2024-02-27T06:00:00"
    }
  ]
}
```

---

### 批量同步习惯

批量同步多个习惯，支持冲突解决。

**端点：** `POST /api/habits/batch`

**认证：** 是

---

## 时间追踪端点

### 获取所有时间记录

获取当前用户的所有时间记录。

**端点：** `GET /api/time-entries`

**认证：** 是

**成功响应 (200 OK):**

```json
{
  "entries": [
    {
      "id": "te-001",
      "description": "项目开发",
      "startTime": "2024-02-27T09:00:00",
      "endTime": "2024-02-27T12:00:00",
      "duration": 10800
    }
  ],
  "deleted_time_entries": []
}
```

---

### 创建或更新时间记录

创建新时间记录或更新现有记录。

**端点：** `POST /api/time-entries`

**认证：** 是

**请求体：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 记录 ID |
| description | string | 是 | 描述 |
| startTime | string | 是 | 开始时间 (ISO 8601) |
| endTime | string | 否 | 结束时间 (ISO 8601) |

---

### 删除时间记录

删除指定 ID 的时间记录。

**端点：** `DELETE /api/time-entries/<entry_id>`

**认证：** 是

---

### 批量同步时间记录

批量同步多个时间记录。

**端点：** `POST /api/time-entries/batch`

**认证：** 是

---

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.4.0 | 2026-03-06 | 添加习惯打卡和时间追踪功能 |
| 1.3.0 | 2026-03-02 | 添加管理员用户管理功能（查看/删除用户） |
| 1.2.0 | 2026-03-01 | 添加邀请码注册功能和管理员权限 |
| 1.1.0 | 2024-02-28 | 添加时间追踪功能 |
| 1.0.0 | 2024-02-27 | 初始版本，支持基础事件和待办同步 |
