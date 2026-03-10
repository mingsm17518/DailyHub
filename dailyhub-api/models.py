# Calendar API Database Models

import sqlite3
import json
import time
from datetime import datetime
from typing import List, Dict, Optional, Any
from contextlib import contextmanager
from config import DATABASE_PATH


class Database:
    """Database connection manager"""

    @staticmethod
    @contextmanager
    def get_conn():
        """Get database connection with retry logic for concurrent access"""
        max_retries = 3
        retry_delay = 0.1  # seconds

        for attempt in range(max_retries):
            try:
                conn = sqlite3.connect(DATABASE_PATH, timeout=10.0)
                conn.row_factory = sqlite3.Row
                # Enable WAL mode for better concurrency
                conn.execute('PRAGMA journal_mode=WAL')
                try:
                    yield conn
                    conn.commit()
                    return
                except Exception:
                    conn.rollback()
                    raise
                finally:
                    conn.close()
            except sqlite3.OperationalError as e:
                if "database is locked" in str(e) and attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    continue
                raise

    @staticmethod
    def init_db():
        """Initialize database tables"""
        with Database.get_conn() as conn:
            # Create users table
            conn.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    is_admin INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # Create invitation_codes table
            conn.execute('''
                CREATE TABLE IF NOT EXISTS invitation_codes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    code TEXT UNIQUE NOT NULL,
                    max_uses INTEGER DEFAULT 1,
                    used_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP,
                    is_active INTEGER DEFAULT 1
                )
            ''')

            # Create events table
            conn.execute('''
                CREATE TABLE IF NOT EXISTS events (
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
                )
            ''')

            # Create index for faster queries
            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_events_user_date
                ON events(user_id, date)
            ''')

            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_events_updated
                ON events(user_id, updated_at)
            ''')

            # Database migration: Add reminder column if it doesn't exist
            # This is needed to support event reminders in cloud sync
            try:
                conn.execute('ALTER TABLE events ADD COLUMN reminder TEXT')
            except sqlite3.OperationalError:
                # Column already exists, ignore the error
                pass

            # Create todos table
            conn.execute('''
                CREATE TABLE IF NOT EXISTS todos (
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
                )
            ''')

            # Create index for todos
            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_todos_user
                ON todos(user_id)
            ''')

            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_todos_updated
                ON todos(user_id, updated_at)
            ''')

            # Create deleted_events table (tombstone for deleted events)
            conn.execute('''
                CREATE TABLE IF NOT EXISTS deleted_events (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            ''')

            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_deleted_events_user
                ON deleted_events(user_id, deleted_at)
            ''')

            # Create deleted_todos table (tombstone for deleted todos)
            conn.execute('''
                CREATE TABLE IF NOT EXISTS deleted_todos (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            ''')

            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_deleted_todos_user
                ON deleted_todos(user_id, deleted_at)
            ''')

            # Create time_entries table
            conn.execute('''
                CREATE TABLE IF NOT EXISTS time_entries (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    duration INTEGER NOT NULL,
                    activity TEXT NOT NULL,
                    tag_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            ''')

            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_time_entries_user
                ON time_entries(user_id)
            ''')

            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_time_entries_updated
                ON time_entries(user_id, updated_at)
            ''')

            # Create deleted_time_entries table (tombstone for deleted time entries)
            conn.execute('''
                CREATE TABLE IF NOT EXISTS deleted_time_entries (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            ''')

            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_deleted_time_entries_user
                ON deleted_time_entries(user_id, deleted_at)
            ''')

            # Create habits table
            conn.execute('''
                CREATE TABLE IF NOT EXISTS habits (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    color TEXT DEFAULT '#4CAF50',
                    icon TEXT DEFAULT '✓',
                    frequency TEXT DEFAULT 'daily',
                    target_count INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            ''')

            # Create habit_logs table
            conn.execute('''
                CREATE TABLE IF NOT EXISTS habit_logs (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    habit_id TEXT NOT NULL,
                    log_date TEXT NOT NULL,
                    count INTEGER DEFAULT 1,
                    note TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, habit_id, log_date),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
                )
            ''')

            # Indexes for habits
            conn.execute('CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_habits_updated ON habits(user_id, updated_at)')

            # Indexes for habit_logs
            conn.execute('CREATE INDEX IF NOT EXISTS idx_habit_logs_user ON habit_logs(user_id)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(user_id, log_date)')

            # Create deleted_habits table (tombstone for deleted habits)
            conn.execute('''
                CREATE TABLE IF NOT EXISTS deleted_habits (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            ''')

            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_deleted_habits_user
                ON deleted_habits(user_id, deleted_at)
            ''')

            # Create deleted_habit_logs table (tombstone for deleted habit logs)
            conn.execute('''
                CREATE TABLE IF NOT EXISTS deleted_habit_logs (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            ''')

            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_deleted_habit_logs_user
                ON deleted_habit_logs(user_id, deleted_at)
            ''')

            # Create daily_notes table
            conn.execute('''
                CREATE TABLE IF NOT EXISTS daily_notes (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    date TEXT NOT NULL,
                    content TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, date),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            ''')

            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_daily_notes_user
                ON daily_notes(user_id, date)
            ''')

            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_daily_notes_updated
                ON daily_notes(user_id, updated_at)
            ''')

            # Create deleted_daily_notes table (tombstone for deleted notes)
            conn.execute('''
                CREATE TABLE IF NOT EXISTS deleted_daily_notes (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            ''')

            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_deleted_daily_notes_user
                ON deleted_daily_notes(user_id, deleted_at)
            ''')


class User:
    """User model"""

    @staticmethod
    def create(username: str, password_hash: str) -> int:
        """Create a new user"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'INSERT INTO users (username, password_hash) VALUES (?, ?)',
                (username, password_hash)
            )
            return cursor.lastrowid

    @staticmethod
    def find_by_username(username: str) -> Optional[sqlite3.Row]:
        """Find user by username"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM users WHERE username = ?',
                (username,)
            )
            return cursor.fetchone()

    @staticmethod
    def find_by_id(user_id: int) -> Optional[sqlite3.Row]:
        """Find user by ID"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM users WHERE id = ?',
                (user_id,)
            )
            return cursor.fetchone()

    @staticmethod
    def get_all() -> List[sqlite3.Row]:
        """Get all users"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM users ORDER BY created_at DESC'
            )
            return cursor.fetchall()

    @staticmethod
    def delete_by_id(user_id: int) -> bool:
        """
        Delete a user by ID.
        Returns True if user was deleted, False if user was not found.

        Note: Due to ON DELETE CASCADE, this will automatically delete:
        - All events belonging to the user
        - All todos belonging to the user
        - All deleted_events tombstones for the user
        - All deleted_todos tombstones for the user
        """
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'DELETE FROM users WHERE id = ?',
                (user_id,)
            )
            return cursor.rowcount > 0


class Event:
    """Event model"""

    @staticmethod
    def create(user_id: int, event_data: Dict[str, Any]) -> str:
        """Create a new event"""
        event_id = event_data.get('id')
        # 使用前端传递的 updated_at，如果没有则使用服务器时间
        # 这样可以保留原始的修改时间，避免同步逻辑冲突
        updated_at = event_data.get('updated_at') or datetime.utcnow().isoformat()

        # 序列化 reminder 对象为 JSON 字符串
        reminder_json = json.dumps(event_data.get('reminder')) if event_data.get('reminder') else None

        with Database.get_conn() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO events
                (id, user_id, title, date, start_time, end_time, description, updated_at, etag, reminder)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                event_id,
                user_id,
                event_data['title'],
                event_data['date'],
                event_data.get('start_time'),
                event_data.get('end_time'),
                event_data.get('description'),
                updated_at,
                event_data.get('etag'),
                reminder_json
            ))
        return event_id

    @staticmethod
    def update(event_id: str, user_id: int, event_data: Dict[str, Any]) -> bool:
        """Update an existing event"""
        # 使用前端传递的 updated_at，如果没有则使用服务器时间
        # 这样可以保留原始的修改时间，避免同步逻辑冲突
        updated_at = event_data.get('updated_at') or datetime.utcnow().isoformat()

        # 序列化 reminder 对象为 JSON 字符串
        reminder_json = json.dumps(event_data.get('reminder')) if event_data.get('reminder') else None

        with Database.get_conn() as conn:
            cursor = conn.execute('''
                UPDATE events
                SET title = ?, date = ?, start_time = ?, end_time = ?,
                    description = ?, updated_at = ?, etag = ?, reminder = ?
                WHERE id = ? AND user_id = ?
            ''', (
                event_data['title'],
                event_data['date'],
                event_data.get('start_time'),
                event_data.get('end_time'),
                event_data.get('description'),
                updated_at,
                event_data.get('etag'),
                reminder_json,
                event_id,
                user_id
            ))
            return cursor.rowcount > 0

    @staticmethod
    def delete(event_id: str, user_id: int) -> bool:
        """Delete an event"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'DELETE FROM events WHERE id = ? AND user_id = ?',
                (event_id, user_id)
            )
            return cursor.rowcount > 0

    @staticmethod
    def find_by_id(event_id: str, user_id: int) -> Optional[sqlite3.Row]:
        """Find event by ID"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM events WHERE id = ? AND user_id = ?',
                (event_id, user_id)
            )
            return cursor.fetchone()

    @staticmethod
    def get_all_by_user(user_id: int) -> List[sqlite3.Row]:
        """Get all events for a user"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM events WHERE user_id = ? ORDER BY date, start_time',
                (user_id,)
            )
            return cursor.fetchall()

    @staticmethod
    def get_events_since(user_id: int, since: str) -> List[sqlite3.Row]:
        """Get events updated since a specific timestamp"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM events WHERE user_id = ? AND updated_at > ? ORDER BY updated_at',
                (user_id, since)
            )
            return cursor.fetchall()

    @staticmethod
    def row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
        """Convert database row to dictionary"""
        event = dict(row)
        # Parse reminder JSON string back to object
        if event.get('reminder'):
            event['reminder'] = json.loads(event['reminder'])
        return event


class Todo:
    """Todo model"""

    @staticmethod
    def create(user_id: int, todo_data: Dict[str, Any]) -> str:
        """Create a new todo"""
        todo_id = todo_data.get('id')
        # 使用前端传递的 updated_at，如果没有则使用服务器时间
        # 这样可以保留原始的修改时间，避免同步逻辑冲突
        updated_at = todo_data.get('updated_at') or datetime.utcnow().isoformat()
        with Database.get_conn() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO todos
                (id, user_id, text, done, due_date, parent_id, position, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                todo_id,
                user_id,
                todo_data['text'],
                1 if todo_data.get('done') else 0,
                todo_data.get('due_date'),
                todo_data.get('parent_id'),
                todo_data.get('position', 0),
                todo_data.get('created_at', datetime.utcnow().isoformat()),
                updated_at
            ))
        return todo_id

    @staticmethod
    def update(todo_id: str, user_id: int, todo_data: Dict[str, Any]) -> bool:
        """Update an existing todo"""
        # 使用前端传递的 updated_at，如果没有则使用服务器时间
        # 这样可以保留原始的修改时间，避免同步逻辑冲突
        updated_at = todo_data.get('updated_at') or datetime.utcnow().isoformat()
        with Database.get_conn() as conn:
            cursor = conn.execute('''
                UPDATE todos
                SET text = ?, done = ?, due_date = ?, parent_id = ?, position = ?, updated_at = ?
                WHERE id = ? AND user_id = ?
            ''', (
                todo_data['text'],
                1 if todo_data.get('done') else 0,
                todo_data.get('due_date'),
                todo_data.get('parent_id'),
                todo_data.get('position', 0),
                updated_at,
                todo_id,
                user_id
            ))
            return cursor.rowcount > 0

    @staticmethod
    def delete(todo_id: str, user_id: int) -> bool:
        """Delete a todo"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'DELETE FROM todos WHERE id = ? AND user_id = ?',
                (todo_id, user_id)
            )
            return cursor.rowcount > 0

    @staticmethod
    def find_by_id(todo_id: str, user_id: int) -> Optional[sqlite3.Row]:
        """Find todo by ID"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM todos WHERE id = ? AND user_id = ?',
                (todo_id, user_id)
            )
            return cursor.fetchone()

    @staticmethod
    def get_all_by_user(user_id: int) -> List[sqlite3.Row]:
        """Get all todos for a user"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM todos WHERE user_id = ? ORDER BY position, created_at',
                (user_id,)
            )
            return cursor.fetchall()

    @staticmethod
    def get_todos_since(user_id: int, since: str) -> List[sqlite3.Row]:
        """Get todos updated since a specific timestamp"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM todos WHERE user_id = ? AND updated_at > ? ORDER BY updated_at',
                (user_id, since)
            )
            return cursor.fetchall()


class DeletedEvent:
    """Deleted Event tombstone model"""

    @staticmethod
    def create(user_id: int, event_id: str) -> str:
        """Create a deleted event tombstone"""
        with Database.get_conn() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO deleted_events (id, user_id, deleted_at)
                VALUES (?, ?, ?)
            ''', (event_id, user_id, datetime.utcnow().isoformat()))
        return event_id

    @staticmethod
    def find_by_id(event_id: str, user_id: int) -> Optional[sqlite3.Row]:
        """Find deleted event by ID"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM deleted_events WHERE id = ? AND user_id = ?',
                (event_id, user_id)
            )
            return cursor.fetchone()

    @staticmethod
    def get_all_by_user(user_id: int, since: str = None) -> List[sqlite3.Row]:
        """Get all deleted events for a user, optionally since a timestamp"""
        with Database.get_conn() as conn:
            if since:
                cursor = conn.execute(
                    'SELECT * FROM deleted_events WHERE user_id = ? AND deleted_at > ? ORDER BY deleted_at',
                    (user_id, since)
                )
            else:
                cursor = conn.execute(
                    'SELECT * FROM deleted_events WHERE user_id = ? ORDER BY deleted_at',
                    (user_id,)
                )
            return cursor.fetchall()

    @staticmethod
    def delete_old(user_id: int, days: int = 30) -> int:
        """Delete old tombstones (older than specified days)"""
        cutoff = datetime.utcnow().isoformat()
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'DELETE FROM deleted_events WHERE user_id = ? AND deleted_at < datetime(?, ? || " days")',
                (user_id, cutoff, -days)
            )
            return cursor.rowcount


class DeletedTodo:
    """Deleted Todo tombstone model"""

    @staticmethod
    def create(user_id: int, todo_id: str) -> str:
        """Create a deleted todo tombstone"""
        with Database.get_conn() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO deleted_todos (id, user_id, deleted_at)
                VALUES (?, ?, ?)
            ''', (todo_id, user_id, datetime.utcnow().isoformat()))
        return todo_id

    @staticmethod
    def find_by_id(todo_id: str, user_id: int) -> Optional[sqlite3.Row]:
        """Find deleted todo by ID"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM deleted_todos WHERE id = ? AND user_id = ?',
                (todo_id, user_id)
            )
            return cursor.fetchone()

    @staticmethod
    def get_all_by_user(user_id: int, since: str = None) -> List[sqlite3.Row]:
        """Get all deleted todos for a user, optionally since a timestamp"""
        with Database.get_conn() as conn:
            if since:
                cursor = conn.execute(
                    'SELECT * FROM deleted_todos WHERE user_id = ? AND deleted_at > ? ORDER BY deleted_at',
                    (user_id, since)
                )
            else:
                cursor = conn.execute(
                    'SELECT * FROM deleted_todos WHERE user_id = ? ORDER BY deleted_at',
                    (user_id,)
                )
            return cursor.fetchall()

    @staticmethod
    def delete_old(user_id: int, days: int = 30) -> int:
        """Delete old tombstones (older than specified days)"""
        cutoff = datetime.utcnow().isoformat()
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'DELETE FROM deleted_todos WHERE user_id = ? AND deleted_at < datetime(?, ? || " days")',
                (user_id, cutoff, -days)
            )
            return cursor.rowcount


class TimeEntry:
    """Time Entry model"""

    @staticmethod
    def create(user_id: int, entry_data: Dict[str, Any]) -> str:
        """Create a new time entry"""
        entry_id = entry_data.get('id')
        updated_at = entry_data.get('updated_at') or datetime.utcnow().isoformat()

        with Database.get_conn() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO time_entries
                (id, user_id, start_time, end_time, duration, activity, tag_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                entry_id,
                user_id,
                entry_data['startTime'],
                entry_data['endTime'],
                entry_data['duration'],
                entry_data['activity'],
                entry_data.get('tagId'),
                entry_data.get('createdAt', datetime.utcnow().isoformat()),
                updated_at
            ))
        return entry_id

    @staticmethod
    def update(entry_id: str, user_id: int, entry_data: Dict[str, Any]) -> bool:
        """Update an existing time entry"""
        updated_at = entry_data.get('updated_at') or datetime.utcnow().isoformat()

        with Database.get_conn() as conn:
            cursor = conn.execute('''
                UPDATE time_entries
                SET start_time = ?, end_time = ?, duration = ?,
                    activity = ?, tag_id = ?, updated_at = ?
                WHERE id = ? AND user_id = ?
            ''', (
                entry_data['startTime'],
                entry_data['endTime'],
                entry_data['duration'],
                entry_data['activity'],
                entry_data.get('tagId'),
                updated_at,
                entry_id,
                user_id
            ))
            return cursor.rowcount > 0

    @staticmethod
    def delete(entry_id: str, user_id: int) -> bool:
        """Delete a time entry"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'DELETE FROM time_entries WHERE id = ? AND user_id = ?',
                (entry_id, user_id)
            )
            return cursor.rowcount > 0

    @staticmethod
    def find_by_id(entry_id: str, user_id: int) -> Optional[sqlite3.Row]:
        """Find time entry by ID"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM time_entries WHERE id = ? AND user_id = ?',
                (entry_id, user_id)
            )
            return cursor.fetchone()

    @staticmethod
    def get_all_by_user(user_id: int) -> List[sqlite3.Row]:
        """Get all time entries for a user"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM time_entries WHERE user_id = ? ORDER BY start_time DESC',
                (user_id,)
            )
            return cursor.fetchall()

    @staticmethod
    def get_entries_since(user_id: int, since: str) -> List[sqlite3.Row]:
        """Get time entries updated since a specific timestamp"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM time_entries WHERE user_id = ? AND updated_at > ? ORDER BY updated_at',
                (user_id, since)
            )
            return cursor.fetchall()


class DeletedTimeEntry:
    """Deleted Time Entry tombstone model"""

    @staticmethod
    def create(user_id: int, entry_id: str) -> str:
        """Create a deleted time entry tombstone"""
        with Database.get_conn() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO deleted_time_entries (id, user_id, deleted_at)
                VALUES (?, ?, ?)
            ''', (entry_id, user_id, datetime.utcnow().isoformat()))
        return entry_id

    @staticmethod
    def get_all_by_user(user_id: int, since: str = None) -> List[sqlite3.Row]:
        """Get all deleted time entries for a user"""
        with Database.get_conn() as conn:
            if since:
                cursor = conn.execute(
                    'SELECT * FROM deleted_time_entries WHERE user_id = ? AND deleted_at > ? ORDER BY deleted_at',
                    (user_id, since)
                )
            else:
                cursor = conn.execute(
                    'SELECT * FROM deleted_time_entries WHERE user_id = ? ORDER BY deleted_at',
                    (user_id,)
                )
            return cursor.fetchall()

    @staticmethod
    def delete_old(user_id: int, days: int = 30) -> int:
        """Delete old tombstones (older than specified days)"""
        cutoff = datetime.utcnow().isoformat()
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'DELETE FROM deleted_time_entries WHERE user_id = ? AND deleted_at < datetime(?, ? || " days")',
                (user_id, cutoff, -days)
            )
            return cursor.rowcount


class InvitationCode:
    """Invitation Code model"""

    @staticmethod
    def create(code: str, max_uses: int = 1, expires_at: str = None) -> int:
        """Create a new invitation code"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'INSERT INTO invitation_codes (code, max_uses, expires_at) VALUES (?, ?, ?)',
                (code, max_uses, expires_at)
            )
            return cursor.lastrowid

    @staticmethod
    def find_by_code(code: str) -> Optional[sqlite3.Row]:
        """Find invitation code by code"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM invitation_codes WHERE code = ?',
                (code,)
            )
            return cursor.fetchone()

    @staticmethod
    def get_all() -> List[sqlite3.Row]:
        """Get all invitation codes"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM invitation_codes ORDER BY created_at DESC'
            )
            return cursor.fetchall()

    @staticmethod
    def delete(code: str) -> bool:
        """Delete an invitation code by code string"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'DELETE FROM invitation_codes WHERE code = ?',
                (code,)
            )
            return cursor.rowcount > 0

    @staticmethod
    def delete_by_id(code_id: int) -> bool:
        """Delete an invitation code by ID"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'DELETE FROM invitation_codes WHERE id = ?',
                (code_id,)
            )
            return cursor.rowcount > 0

    @staticmethod
    def validate(code: str) -> tuple[bool, str]:
        """
        Validate an invitation code.
        Returns (is_valid, error_message)
        """
        if not code:
            return False, "请输入邀请码"

        invite = InvitationCode.find_by_code(code)
        if not invite:
            return False, "邀请码无效"

        if not invite['is_active']:
            return False, "此邀请码已停用"

        # Check expiration
        if invite['expires_at']:
            try:
                expires = datetime.fromisoformat(invite['expires_at'])
                if datetime.utcnow() > expires:
                    return False, "此邀请码已过期"
            except:
                pass  # Invalid date format, ignore

        # Check usage limit
        if invite['max_uses'] != -1 and invite['used_count'] >= invite['max_uses']:
            return False, "此邀请码已被使用完"

        return True, ""

    @staticmethod
    def increment_used_count(code: str) -> bool:
        """Increment the used count of an invitation code"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'UPDATE invitation_codes SET used_count = used_count + 1 WHERE code = ?',
                (code,)
            )
            return cursor.rowcount > 0


class Habit:
    """Habit model"""

    @staticmethod
    def create(user_id: int, data: Dict[str, Any]) -> str:
        """Create a new habit"""
        habit_id = data.get('id')
        updated_at = data.get('updated_at') or datetime.utcnow().isoformat()
        with Database.get_conn() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO habits
                (id, user_id, name, description, color, icon, frequency, target_count, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (habit_id, user_id, data['name'], data.get('description'),
                  data.get('color', '#4CAF50'), data.get('icon', '✓'),
                  data.get('frequency', 'daily'), data.get('targetCount', 1), updated_at))
        return habit_id

    @staticmethod
    def update(habit_id: str, user_id: int, data: Dict[str, Any]) -> bool:
        """Update an existing habit"""
        updated_at = data.get('updated_at') or datetime.utcnow().isoformat()
        with Database.get_conn() as conn:
            cursor = conn.execute('''
                UPDATE habits SET name = ?, description = ?, color = ?, icon = ?,
                    frequency = ?, target_count = ?, updated_at = ?
                WHERE id = ? AND user_id = ?
            ''', (data['name'], data.get('description'), data.get('color'),
                  data.get('icon'), data.get('frequency'), data.get('targetCount', 1),
                  updated_at, habit_id, user_id))
            return cursor.rowcount > 0

    @staticmethod
    def delete(habit_id: str, user_id: int) -> bool:
        """Delete a habit"""
        with Database.get_conn() as conn:
            cursor = conn.execute('DELETE FROM habits WHERE id = ? AND user_id = ?', (habit_id, user_id))
            return cursor.rowcount > 0

    @staticmethod
    def find_by_id(habit_id: str, user_id: int) -> Optional[sqlite3.Row]:
        """Find habit by ID"""
        with Database.get_conn() as conn:
            cursor = conn.execute('SELECT * FROM habits WHERE id = ? AND user_id = ?', (habit_id, user_id))
            return cursor.fetchone()

    @staticmethod
    def get_all_by_user(user_id: int) -> List[sqlite3.Row]:
        """Get all habits for a user"""
        with Database.get_conn() as conn:
            cursor = conn.execute('SELECT * FROM habits WHERE user_id = ? ORDER BY created_at', (user_id,))
            return cursor.fetchall()


class HabitLog:
    """Habit log model"""

    @staticmethod
    def create_or_update(user_id: int, data: Dict[str, Any]) -> str:
        """Create or update a habit log entry"""
        log_id = data.get('id')
        updated_at = data.get('updated_at') or datetime.utcnow().isoformat()
        with Database.get_conn() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO habit_logs
                (id, user_id, habit_id, log_date, count, note, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (log_id, user_id, data['habitId'], data['logDate'],
                  data.get('count', 1), data.get('note'), updated_at))
        return log_id

    @staticmethod
    def delete(log_id: str, user_id: int) -> bool:
        """Delete a habit log"""
        with Database.get_conn() as conn:
            cursor = conn.execute('DELETE FROM habit_logs WHERE id = ? AND user_id = ?', (log_id, user_id))
            return cursor.rowcount > 0

    @staticmethod
    def get_by_habit_and_date(user_id: int, habit_id: str, log_date: str) -> Optional[sqlite3.Row]:
        """Get habit log by habit ID and date"""
        with Database.get_conn() as conn:
            cursor = conn.execute('''
                SELECT * FROM habit_logs WHERE user_id = ? AND habit_id = ? AND log_date = ?
            ''', (user_id, habit_id, log_date))
            return cursor.fetchone()

    @staticmethod
    def get_heatmap_data(user_id: int, habit_id: str, start_date: str, end_date: str) -> List[sqlite3.Row]:
        """Get habit logs for heatmap visualization"""
        with Database.get_conn() as conn:
            cursor = conn.execute('''
                SELECT log_date, count FROM habit_logs
                WHERE user_id = ? AND habit_id = ? AND log_date BETWEEN ? AND ?
                ORDER BY log_date
            ''', (user_id, habit_id, start_date, end_date))
            return cursor.fetchall()

    @staticmethod
    def get_all_by_user(user_id: int) -> List[sqlite3.Row]:
        """Get all habit logs for a user"""
        with Database.get_conn() as conn:
            cursor = conn.execute('SELECT * FROM habit_logs WHERE user_id = ? ORDER BY log_date DESC', (user_id,))
            return cursor.fetchall()


class DeletedHabit:
    """Deleted Habit tombstone model"""

    @staticmethod
    def create(user_id: int, habit_id: str) -> str:
        """Create a deleted habit tombstone"""
        with Database.get_conn() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO deleted_habits (id, user_id, deleted_at)
                VALUES (?, ?, ?)
            ''', (habit_id, user_id, datetime.utcnow().isoformat()))
        return habit_id

    @staticmethod
    def get_all_by_user(user_id: int, since: str = None) -> List[sqlite3.Row]:
        """Get all deleted habits for a user"""
        with Database.get_conn() as conn:
            if since:
                cursor = conn.execute(
                    'SELECT * FROM deleted_habits WHERE user_id = ? AND deleted_at > ? ORDER BY deleted_at',
                    (user_id, since)
                )
            else:
                cursor = conn.execute(
                    'SELECT * FROM deleted_habits WHERE user_id = ? ORDER BY deleted_at',
                    (user_id,)
                )
            return cursor.fetchall()

    @staticmethod
    def delete_old(user_id: int, days: int = 30) -> int:
        """Delete old tombstones (older than specified days)"""
        cutoff = datetime.utcnow().isoformat()
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'DELETE FROM deleted_habits WHERE user_id = ? AND deleted_at < datetime(?, ? || " days")',
                (user_id, cutoff, -days)
            )
            return cursor.rowcount


class DeletedHabitLog:
    """Deleted Habit Log tombstone model"""

    @staticmethod
    def create(user_id: int, log_id: str) -> str:
        """Create a deleted habit log tombstone"""
        with Database.get_conn() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO deleted_habit_logs (id, user_id, deleted_at)
                VALUES (?, ?, ?)
            ''', (log_id, user_id, datetime.utcnow().isoformat()))
        return log_id

    @staticmethod
    def get_all_by_user(user_id: int, since: str = None) -> List[sqlite3.Row]:
        """Get all deleted habit logs for a user"""
        with Database.get_conn() as conn:
            if since:
                cursor = conn.execute(
                    'SELECT * FROM deleted_habit_logs WHERE user_id = ? AND deleted_at > ? ORDER BY deleted_at',
                    (user_id, since)
                )
            else:
                cursor = conn.execute(
                    'SELECT * FROM deleted_habit_logs WHERE user_id = ? ORDER BY deleted_at',
                    (user_id,)
                )
            return cursor.fetchall()

    @staticmethod
    def delete_old(user_id: int, days: int = 30) -> int:
        """Delete old tombstones (older than specified days)"""
        cutoff = datetime.utcnow().isoformat()
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'DELETE FROM deleted_habit_logs WHERE user_id = ? AND deleted_at < datetime(?, ? || " days")',
                (user_id, cutoff, -days)
            )
            return cursor.rowcount


class DailyNote:
    """Daily Note model"""

    @staticmethod
    def create(user_id: int, note_data: Dict[str, Any]) -> str:
        """Create or update a daily note"""
        note_id = note_data.get('id')
        updated_at = note_data.get('updated_at') or datetime.utcnow().isoformat()
        with Database.get_conn() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO daily_notes
                (id, user_id, date, content, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                note_id,
                user_id,
                note_data['date'],
                note_data.get('content', ''),
                note_data.get('created_at', datetime.utcnow().isoformat()),
                updated_at
            ))
        return note_id

    @staticmethod
    def update(note_id: str, user_id: int, note_data: Dict[str, Any]) -> bool:
        """Update an existing daily note"""
        updated_at = note_data.get('updated_at') or datetime.utcnow().isoformat()
        with Database.get_conn() as conn:
            cursor = conn.execute('''
                UPDATE daily_notes
                SET date = ?, content = ?, updated_at = ?
                WHERE id = ? AND user_id = ?
            ''', (
                note_data['date'],
                note_data.get('content', ''),
                updated_at,
                note_id,
                user_id
            ))
            return cursor.rowcount > 0

    @staticmethod
    def delete(note_id: str, user_id: int) -> bool:
        """Delete a daily note"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'DELETE FROM daily_notes WHERE id = ? AND user_id = ?',
                (note_id, user_id)
            )
            return cursor.rowcount > 0

    @staticmethod
    def find_by_id(note_id: str, user_id: int) -> Optional[sqlite3.Row]:
        """Find daily note by ID"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM daily_notes WHERE id = ? AND user_id = ?',
                (note_id, user_id)
            )
            return cursor.fetchone()

    @staticmethod
    def find_by_date(user_id: int, date: str) -> Optional[sqlite3.Row]:
        """Find daily note by date"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM daily_notes WHERE user_id = ? AND date = ?',
                (user_id, date)
            )
            return cursor.fetchone()

    @staticmethod
    def get_all_by_user(user_id: int) -> List[sqlite3.Row]:
        """Get all daily notes for a user"""
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'SELECT * FROM daily_notes WHERE user_id = ? ORDER BY date DESC',
                (user_id,)
            )
            return cursor.fetchall()


class DeletedNote:
    """Deleted Daily Note tombstone model"""

    @staticmethod
    def create(user_id: int, note_id: str) -> str:
        """Create a deleted note tombstone"""
        with Database.get_conn() as conn:
            conn.execute('''
                INSERT OR REPLACE INTO deleted_daily_notes (id, user_id, deleted_at)
                VALUES (?, ?, ?)
            ''', (note_id, user_id, datetime.utcnow().isoformat()))
        return note_id

    @staticmethod
    def get_all_by_user(user_id: int, since: str = None) -> List[sqlite3.Row]:
        """Get all deleted notes for a user"""
        with Database.get_conn() as conn:
            if since:
                cursor = conn.execute(
                    'SELECT * FROM deleted_daily_notes WHERE user_id = ? AND deleted_at > ? ORDER BY deleted_at',
                    (user_id, since)
                )
            else:
                cursor = conn.execute(
                    'SELECT * FROM deleted_daily_notes WHERE user_id = ? ORDER BY deleted_at',
                    (user_id,)
                )
            return cursor.fetchall()

    @staticmethod
    def delete_old(user_id: int, days: int = 30) -> int:
        """Delete old tombstones (older than specified days)"""
        cutoff = datetime.utcnow().isoformat()
        with Database.get_conn() as conn:
            cursor = conn.execute(
                'DELETE FROM deleted_daily_notes WHERE user_id = ? AND deleted_at < datetime(?, ? || " days")',
                (user_id, cutoff, -days)
            )
            return cursor.rowcount


# Initialize database on import
Database.init_db()
