# CLAUDE.md

作为一名智能助手，在开始执行任务前，请先判断自己是否具备足够的信息。如有不明确的地方，请提出最多三个问题澄清任务目标。

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack calendar/todo management system with multi-device cloud sync support. The system consists of:

- **Backend API** (`calendar-api/`): Flask + SQLite RESTful API with JWT authentication
- **Frontend App** (`calendar-app/`): Vanilla JavaScript PWA with IndexedDB storage

## Quick Start Commands

### Backend API (Flask)

```bash
# Start API server
cd calendar-api
python api.py

# Install dependencies
pip install -r requirements.txt

# Create initial admin user (Python)
python -c "
from werkzeug.security import generate_password_hash
from models import User, Database
Database.init_db()
User.create('admin', generate_password_hash('admin123'))
"
```

### Frontend App (Static)

```bash
# Start development server
cd calendar-app
python -m http.server 8080
# or
npx http-server -p 8080
```

## Architecture

### Backend (`calendar-api/`)

- **api.py**: Flask application with all REST endpoints
- **models.py**: SQLite database models with ORM-like pattern
- **config.py**: Configuration (database path, JWT secret, CORS)

Key architectural patterns:
- **Tombstone sync**: Deleted records are tracked in `deleted_*` tables to prevent other devices from resurrecting deleted data
- **Last Write Wins**: Conflict resolution based on `updated_at` timestamps
- **Field name conversion**: API auto-converts between snake_case (Python) and camelCase (JavaScript)
- **JWT auth**: 30-day token expiration, `admin_required()` decorator for admin-only endpoints

### Frontend (`calendar-app/`)

- **index.html**: Single-page application entry point
- **js/app.js**: Main application logic, tab navigation
- **js/storage.js**: IndexedDB wrapper + cloud sync API client (API_BASE_URL configurable)
- **js/calendar.js**: Calendar view generation and event rendering
- **js/todolist.js**: Todo list with drag-and-drop, hierarchical support
- **js/habitTracker.js**: Habit tracking with heatmap visualization
- **js/timeTracker.js**: Time tracking and duration calculation
- **js/backup.js**: Export/import and folder backup functionality
- **sw.js**: Service Worker for PWA offline support

## Data Models

### Database Tables

- **users**: id, username, password_hash, is_admin
- **invitation_codes**: code, max_uses, used_count, expires_at, is_active
- **events**: id, user_id, title, date, start_time, end_time, description, updated_at, etag, reminder
- **todos**: id, user_id, text, done, due_date, parent_id, position, created_at, updated_at
- **habits**: id, user_id, name, description, color, icon, frequency, target_count
- **habit_logs**: id, user_id, habit_id, log_date, count, note
- **time_entries**: id, user_id, start_time, end_time, duration, activity, tag_id
- **deleted_***: Tombstone tables for sync (deleted_events, deleted_todos, etc.)

### Frontend Storage

- **IndexedDB**: Events, todos, habits, time entries (DB_VERSION = 3)
- **LocalStorage**: Auth tokens, current account, settings

## Key Development Notes

### Adding New API Endpoints

1. Add route in `api.py` with `@app.route` decorator
2. Use `@jwt_required()` for authenticated endpoints
3. Use `admin_required()` for admin-only endpoints
4. Add corresponding model method in `models.py`
5. Handle both camelCase and snake_case field names from frontend

### Sync Flow

1. Client sends deleted IDs list via `?deleted=id1,id2,id3` query param
2. Server returns `deleted_*` IDs that exist on server but not in client list
3. Client removes those IDs from local storage
4. Client syncs remaining data via batch endpoints
5. Tombstone records are auto-cleaned after 30 days

### Frontend Module Pattern

JavaScript files use classes with static methods:
```javascript
class ClassName {
    static async methodName() { ... }
}
```

### PWA Updates

When updating static assets, increment version numbers:
- `index.html`: `?v=X.X` query params
- `sw.js`: Cache name `calendar-app-vXX`
