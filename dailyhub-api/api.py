#!/usr/bin/env python3
"""
Calendar Cloud Sync API
Flask backend for calendar event synchronization
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required,
    get_jwt_identity
)
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import sys
import logging
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler('api_error.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

from config import (
    DATABASE_PATH, JWT_SECRET_KEY, JWT_ACCESS_TOKEN_EXPIRES,
    HOST, PORT, DEBUG, CORS_ORIGINS
)
from models import User, Event, Todo, TimeEntry, DeletedTimeEntry, Habit, HabitLog, DeletedHabit, DeletedHabitLog, Database, InvitationCode, DailyNote, DeletedNote

# Initialize Flask app
app = Flask(__name__)
app.config['JWT_SECRET_KEY'] = JWT_SECRET_KEY
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = JWT_ACCESS_TOKEN_EXPIRES

# Initialize CORS and JWT
CORS(app, origins=CORS_ORIGINS, supports_credentials=True)
jwt = JWTManager(app)

# JWT error handlers for debugging 422 errors
@jwt.unauthorized_loader
def unauthorized_callback(callback):
    return jsonify({'error': 'Missing or invalid authorization token', 'code': 'unauthorized'}), 401

@jwt.invalid_token_loader
def invalid_token_callback(callback):
    return jsonify({'error': 'Invalid token', 'code': 'invalid_token'}), 401

@jwt.expired_token_loader
def expired_token_callback(callback):
    return jsonify({'error': 'Token expired', 'code': 'expired_token'}), 401


# Error handlers
@app.errorhandler(400)
def bad_request(error):
    logger.warning(f"Bad Request: {error}")
    return jsonify({'error': 'Bad request'}), 400


@app.errorhandler(401)
def unauthorized(error):
    logger.warning(f"Unauthorized: {error}")
    return jsonify({'error': 'Unauthorized'}), 401


@app.errorhandler(404)
def not_found(error):
    logger.warning(f"Not Found: {error}")
    return jsonify({'error': 'Not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal Server Error: {error}")
    logger.error(f"Request: {request.method} {request.path}")
    try:
        logger.error(f"Request data: {request.get_json()}")
    except:
        logger.error("Request data: (unable to parse)")
    logger.error(traceback.format_exc())
    return jsonify({'error': 'Internal server error'}), 500


@app.errorhandler(Exception)
def handle_exception(e):
    logger.error(f"Unhandled Exception: {e}")
    logger.error(f"Request: {request.method} {request.path}")
    try:
        logger.error(f"Request data: {request.get_json()}")
    except:
        logger.error("Request data: (unable to parse)")
    logger.error(traceback.format_exc())
    return jsonify({'error': 'Internal server error'}), 500


# Helper functions
def event_to_dict(event_row):
    """Convert event row to dictionary"""
    if event_row:
        event = dict(event_row)
        # Remove user_id from response for security
        event.pop('user_id', None)
        # Convert snake_case to camelCase for frontend compatibility
        event['startTime'] = event.pop('start_time', None)
        event['endTime'] = event.pop('end_time', None)
        # Deserialize reminder JSON string back to object
        if event.get('reminder'):
            import json
            event['reminder'] = json.loads(event['reminder'])
        return event
    return None


def admin_required():
    """Check if the current user is an admin"""
    user_id = get_jwt_identity()
    user = User.find_by_id(user_id)
    if not user or not user['is_admin']:
        return False
    return True


# API Routes

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'timestamp': datetime.utcnow().isoformat()})


@app.route('/api/register', methods=['POST'])
def register():
    """Register a new user"""
    data = request.get_json()

    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'Username and password are required'}), 400

    username = data['username'].strip()
    password = data['password']
    invitation_code = data.get('invitation_code', '').strip()

    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400

    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    # Validate invitation code
    is_valid, error_msg = InvitationCode.validate(invitation_code)
    if not is_valid:
        return jsonify({'error': error_msg}), 400

    # Check if user already exists
    existing_user = User.find_by_username(username)
    if existing_user:
        return jsonify({'error': 'Username already exists'}), 400

    # Create new user
    password_hash = generate_password_hash(password)
    user_id = User.create(username, password_hash)

    # Increment invitation code usage count
    InvitationCode.increment_used_count(invitation_code)

    # Generate token (convert user_id to string for JWT)
    access_token = create_access_token(identity=str(user_id))

    return jsonify({
        'token': access_token,
        'user_id': user_id,
        'username': username
    }), 201


@app.route('/api/login', methods=['POST'])
def login():
    """Login user"""
    data = request.get_json()

    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'error': 'Username and password are required'}), 400

    username = data['username'].strip()
    password = data['password']

    # Find user
    user = User.find_by_username(username)
    if not user:
        return jsonify({'error': 'Invalid username or password'}), 401

    # Verify password
    if not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Invalid username or password'}), 401

    # Generate token (convert user_id to string for JWT)
    access_token = create_access_token(identity=str(user['id']))

    return jsonify({
        'token': access_token,
        'user_id': user['id'],
        'username': user['username']
    }), 200


@app.route('/api/user/me', methods=['GET'])
@jwt_required()
def get_user_me():
    """Get current user information"""
    user_id = get_jwt_identity()
    user = User.find_by_id(user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    return jsonify({
        'id': user['id'],
        'username': user['username'],
        'is_admin': bool(user['is_admin'])
    }), 200


@app.route('/api/events', methods=['GET'])
@jwt_required()
def get_events():
    """Get all events for the authenticated user"""
    user_id = get_jwt_identity()

    # 获取客户端发送的已删除ID列表
    deleted_param = request.args.get('deleted', '')
    client_deleted_ids = set(deleted_param.split(',')) if deleted_param else set()

    # 获取服务器端的墓碑记录
    from models import DeletedEvent
    server_deleted_events = DeletedEvent.get_all_by_user(user_id)
    server_deleted_ids = set(row['id'] for row in server_deleted_events)

    # 获取所有事件
    events = Event.get_all_by_user(user_id)

    # 客户端说已删除，但服务器还有的，说明其他设备恢复了，需要告诉客户端
    newly_deleted_on_server = server_deleted_ids - client_deleted_ids

    # 清理旧的墓碑记录（超过30天）
    DeletedEvent.delete_old(user_id, 30)

    # 过滤掉客户端说已删除的事件（避免把已删除的数据发回去）
    filtered_events = [e for e in events if e['id'] not in client_deleted_ids]

    return jsonify({
        'events': [event_to_dict(event) for event in filtered_events],
        'deleted_events': list(newly_deleted_on_server)
    }), 200


@app.route('/api/events/<event_id>', methods=['GET'])
@jwt_required()
def get_event(event_id):
    """Get a specific event"""
    user_id = get_jwt_identity()
    event = Event.find_by_id(event_id, user_id)
    if not event:
        return jsonify({'error': 'Event not found'}), 404
    return jsonify(event_to_dict(event)), 200


@app.route('/api/events', methods=['POST'])
@jwt_required()
def create_or_update_event():
    """Create or update an event"""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    # Convert camelCase to snake_case for database
    # Support both formats (camelCase and snake_case) from frontend
    event_data = {
        'id': data.get('id'),
        'title': data.get('title'),
        'date': data.get('date'),
        # Support both camelCase and snake_case field names
        'start_time': data.get('startTime') or data.get('start_time'),
        'end_time': data.get('endTime') or data.get('end_time'),
        'description': data.get('description') or data.get('description', ''),
        'updated_at': data.get('updated_at'),
        'etag': data.get('etag'),
        'reminder': data.get('reminder')  # Support reminder field
    }

    # Validate required fields
    if not event_data.get('title') or not event_data.get('date'):
        return jsonify({'error': 'Title and date are required'}), 400

    if not event_data.get('id'):
        return jsonify({'error': 'Event ID is required'}), 400

    # Check if event exists
    existing = Event.find_by_id(event_data['id'], user_id)

    if existing:
        # Update existing event
        Event.update(event_data['id'], user_id, event_data)
        updated_event = Event.find_by_id(event_data['id'], user_id)
        return jsonify(event_to_dict(updated_event)), 200
    else:
        # Create new event
        Event.create(user_id, event_data)
        new_event = Event.find_by_id(event_data['id'], user_id)
        return jsonify(event_to_dict(new_event)), 201


@app.route('/api/events/<event_id>', methods=['DELETE'])
@jwt_required()
def delete_event(event_id):
    """Delete an event"""
    user_id = get_jwt_identity()

    if not Event.find_by_id(event_id, user_id):
        return jsonify({'error': 'Event not found'}), 404

    Event.delete(event_id, user_id)

    # 创建墓碑记录，防止其他设备恢复已删除的数据
    from models import DeletedEvent
    DeletedEvent.create(user_id, event_id)

    return jsonify({'success': True}), 200


@app.route('/api/sync', methods=['GET'])
@jwt_required()
def sync_events():
    """Get events updated since a specific timestamp"""
    user_id = get_jwt_identity()
    since = request.args.get('since', '1970-01-01T00:00:00')

    events = Event.get_events_since(user_id, since)
    return jsonify([event_to_dict(event) for event in events]), 200


@app.route('/api/events/batch', methods=['POST'])
@jwt_required()
def batch_sync():
    """Batch sync multiple events"""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data or 'events' not in data:
        return jsonify({'error': 'Events array is required'}), 400

    events = data['events']
    results = []

    for event_data in events:
        if not event_data.get('id'):
            continue

        # Convert camelCase to snake_case for database
        # Support both formats (camelCase and snake_case) from frontend
        db_event_data = {
            'id': event_data.get('id'),
            'title': event_data.get('title'),
            'date': event_data.get('date'),
            # Support both camelCase and snake_case field names
            'start_time': event_data.get('startTime') or event_data.get('start_time'),
            'end_time': event_data.get('endTime') or event_data.get('end_time'),
            'description': event_data.get('description') or event_data.get('description', ''),
            'updated_at': event_data.get('updated_at'),
            'etag': event_data.get('etag'),
            'reminder': event_data.get('reminder')  # Support reminder field
        }

        existing = Event.find_by_id(db_event_data['id'], user_id)

        if existing:
            # Conflict resolution: last write wins based on updated_at
            client_updated = db_event_data.get('updated_at', '')
            server_updated = existing.get('updated_at', '')

            if client_updated >= server_updated:
                Event.update(db_event_data['id'], user_id, db_event_data)
                updated = Event.find_by_id(db_event_data['id'], user_id)
                results.append(event_to_dict(updated))
            else:
                # Server version is newer, return it
                results.append(event_to_dict(existing))
        else:
            Event.create(user_id, db_event_data)
            new_event = Event.find_by_id(db_event_data['id'], user_id)
            results.append(event_to_dict(new_event))

    # Return all server events after sync
    all_events = Event.get_all_by_user(user_id)
    return jsonify({
        'synced': results,
        'all_events': [event_to_dict(e) for e in all_events]
    }), 200


# ========== Todo API Endpoints ==========

def todo_to_dict(todo_row):
    """Convert todo row to dictionary"""
    if todo_row:
        todo = dict(todo_row)
        todo.pop('user_id', None)
        todo['done'] = bool(todo['done'])
        todo['dueDate'] = todo.pop('due_date', None)
        todo['parentId'] = todo.pop('parent_id', None)
        todo['position'] = todo.get('position', 0)
        return todo
    return None


def time_entry_to_dict(entry_row):
    """Convert time entry row to dictionary"""
    if entry_row:
        entry = dict(entry_row)
        entry.pop('user_id', None)
        entry['startTime'] = entry.pop('start_time', None)
        entry['endTime'] = entry.pop('end_time', None)
        entry['tagId'] = entry.pop('tag_id', None)
        return entry
    return None


@app.route('/api/todos', methods=['GET'])
@jwt_required()
def get_todos():
    """Get all todos for the authenticated user"""
    user_id = get_jwt_identity()

    # 获取客户端发送的已删除ID列表
    deleted_param = request.args.get('deleted', '')
    client_deleted_ids = set(deleted_param.split(',')) if deleted_param else set()

    # 获取服务器端的墓碑记录
    from models import DeletedTodo
    server_deleted_todos = DeletedTodo.get_all_by_user(user_id)
    server_deleted_ids = set(row['id'] for row in server_deleted_todos)

    # 获取所有待办
    todos = Todo.get_all_by_user(user_id)

    # 客户端说已删除，但服务器还有的，说明其他设备恢复了，需要告诉客户端
    newly_deleted_on_server = server_deleted_ids - client_deleted_ids

    # 清理旧的墓碑记录（超过30天）
    DeletedTodo.delete_old(user_id, 30)

    # 过滤掉客户端说已删除的待办（避免把已删除的数据发回去）
    filtered_todos = [t for t in todos if t['id'] not in client_deleted_ids]

    return jsonify({
        'todos': [todo_to_dict(todo) for todo in filtered_todos],
        'deleted_todos': list(newly_deleted_on_server)
    }), 200


@app.route('/api/todos/<todo_id>', methods=['GET'])
@jwt_required()
def get_todo(todo_id):
    """Get a specific todo"""
    user_id = get_jwt_identity()
    todo = Todo.find_by_id(todo_id, user_id)
    if not todo:
        return jsonify({'error': 'Todo not found'}), 404
    return jsonify(todo_to_dict(todo)), 200


@app.route('/api/todos', methods=['POST'])
@jwt_required()
def create_or_update_todo():
    """Create or update a todo"""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    # Validate required fields
    if not data.get('text'):
        return jsonify({'error': 'Text is required'}), 400

    if not data.get('id'):
        return jsonify({'error': 'Todo ID is required'}), 400

    # Convert frontend field names to backend field names
    todo_data = {
        'id': data['id'],
        'text': data['text'],
        'done': data.get('done', False),
        'due_date': data.get('dueDate'),
        'parent_id': data.get('parentId'),
        'position': data.get('position', 0),
        'created_at': data.get('createdAt')
    }

    # Check if todo exists
    existing = Todo.find_by_id(todo_data['id'], user_id)

    if existing:
        # Update existing todo
        Todo.update(todo_data['id'], user_id, todo_data)
        updated_todo = Todo.find_by_id(todo_data['id'], user_id)
        return jsonify(todo_to_dict(updated_todo)), 200
    else:
        # Create new todo
        Todo.create(user_id, todo_data)
        new_todo = Todo.find_by_id(todo_data['id'], user_id)
        return jsonify(todo_to_dict(new_todo)), 201


@app.route('/api/todos/<todo_id>', methods=['DELETE'])
@jwt_required()
def delete_todo(todo_id):
    """Delete a todo"""
    user_id = get_jwt_identity()

    if not Todo.find_by_id(todo_id, user_id):
        return jsonify({'error': 'Todo not found'}), 404

    Todo.delete(todo_id, user_id)

    # 创建墓碑记录，防止其他设备恢复已删除的数据
    from models import DeletedTodo
    DeletedTodo.create(user_id, todo_id)

    return jsonify({'success': True}), 200


@app.route('/api/todos/sync', methods=['GET'])
@jwt_required()
def sync_todos():
    """Get todos updated since a specific timestamp"""
    user_id = get_jwt_identity()
    since = request.args.get('since', '1970-01-01T00:00:00')

    todos = Todo.get_todos_since(user_id, since)
    return jsonify([todo_to_dict(todo) for todo in todos]), 200


@app.route('/api/todos/batch', methods=['POST'])
@jwt_required()
def batch_sync_todos():
    """Batch sync multiple todos"""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data or 'todos' not in data:
        return jsonify({'error': 'Todos array is required'}), 400

    todos = data['todos']
    results = []

    for todo_data in todos:
        if not todo_data.get('id'):
            continue

        # Convert frontend field names to backend field names
        todo = {
            'id': todo_data['id'],
            'text': todo_data['text'],
            'done': todo_data.get('done', False),
            'due_date': todo_data.get('dueDate'),
            'parent_id': todo_data.get('parentId'),
            'position': todo_data.get('position', 0),
            'created_at': todo_data.get('createdAt'),
            'updated_at': todo_data.get('updated_at')
        }

        existing = Todo.find_by_id(todo['id'], user_id)

        if existing:
            # Conflict resolution: last write wins based on updated_at
            client_updated = todo_data.get('updated_at', '')
            server_updated = existing.get('updated_at', '')

            if client_updated >= server_updated:
                Todo.update(todo['id'], user_id, todo)
                updated = Todo.find_by_id(todo['id'], user_id)
                results.append(todo_to_dict(updated))
            else:
                # Server version is newer, return it
                results.append(todo_to_dict(existing))
        else:
            Todo.create(user_id, todo)
            new_todo = Todo.find_by_id(todo['id'], user_id)
            results.append(todo_to_dict(new_todo))

    # Return all server todos after sync
    all_todos = Todo.get_all_by_user(user_id)
    return jsonify({
        'synced': results,
        'all_todos': [todo_to_dict(t) for t in all_todos]
    }), 200


# ========== Time Entry API Endpoints ==========

@app.route('/api/time-entries', methods=['GET'])
@jwt_required()
def get_time_entries():
    """Get all time entries for the authenticated user"""
    user_id = get_jwt_identity()

    # 获取客户端发送的已删除ID列表
    deleted_param = request.args.get('deleted', '')
    client_deleted_ids = set(deleted_param.split(',')) if deleted_param else set()

    # 获取服务器端的墓碑记录
    server_deleted_entries = DeletedTimeEntry.get_all_by_user(user_id)
    server_deleted_ids = set(row['id'] for row in server_deleted_entries)

    # 获取所有时间记录
    entries = TimeEntry.get_all_by_user(user_id)

    # 客户端说已删除，但服务器还有的，说明其他设备恢复了
    newly_deleted_on_server = server_deleted_ids - client_deleted_ids

    # 清理旧的墓碑记录（超过30天）
    DeletedTimeEntry.delete_old(user_id, 30)

    # 过滤掉客户端说已删除的时间记录
    filtered_entries = [e for e in entries if e['id'] not in client_deleted_ids]

    return jsonify({
        'entries': [time_entry_to_dict(entry) for entry in filtered_entries],
        'deleted_entries': list(newly_deleted_on_server)
    }), 200


@app.route('/api/time-entries/<entry_id>', methods=['GET'])
@jwt_required()
def get_time_entry(entry_id):
    """Get a specific time entry"""
    user_id = get_jwt_identity()
    entry = TimeEntry.find_by_id(entry_id, user_id)
    if not entry:
        return jsonify({'error': 'Time entry not found'}), 404
    return jsonify(time_entry_to_dict(entry)), 200


@app.route('/api/time-entries', methods=['POST'])
@jwt_required()
def create_or_update_time_entry():
    """Create or update a time entry"""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    # Convert camelCase to snake_case for database
    entry_data = {
        'id': data.get('id'),
        'startTime': data.get('startTime') or data.get('start_time'),
        'endTime': data.get('endTime') or data.get('end_time'),
        'duration': data.get('duration'),
        'activity': data.get('activity'),
        'tagId': data.get('tagId') or data.get('tag_id'),
        'createdAt': data.get('createdAt'),
        'updated_at': data.get('updated_at')
    }

    # Validate required fields
    if not entry_data.get('startTime') or not entry_data.get('endTime'):
        return jsonify({'error': 'Start time and end time are required'}), 400

    if entry_data.get('duration') is None:
        return jsonify({'error': 'Duration is required'}), 400

    if not entry_data.get('id'):
        return jsonify({'error': 'Entry ID is required'}), 400

    # Check if entry exists
    existing = TimeEntry.find_by_id(entry_data['id'], user_id)

    if existing:
        # Update existing entry
        TimeEntry.update(entry_data['id'], user_id, entry_data)
        updated_entry = TimeEntry.find_by_id(entry_data['id'], user_id)
        return jsonify(time_entry_to_dict(updated_entry)), 200
    else:
        # Create new entry
        TimeEntry.create(user_id, entry_data)
        new_entry = TimeEntry.find_by_id(entry_data['id'], user_id)
        return jsonify(time_entry_to_dict(new_entry)), 201


@app.route('/api/time-entries/<entry_id>', methods=['DELETE'])
@jwt_required()
def delete_time_entry(entry_id):
    """Delete a time entry"""
    user_id = get_jwt_identity()

    if not TimeEntry.find_by_id(entry_id, user_id):
        return jsonify({'error': 'Time entry not found'}), 404

    TimeEntry.delete(entry_id, user_id)

    # 创建墓碑记录
    DeletedTimeEntry.create(user_id, entry_id)

    return jsonify({'success': True}), 200


@app.route('/api/time-entries/batch', methods=['POST'])
@jwt_required()
def batch_sync_time_entries():
    """Batch sync multiple time entries"""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data or 'entries' not in data:
        return jsonify({'error': 'Entries array is required'}), 400

    entries = data['entries']
    results = []

    for entry_data in entries:
        if not entry_data.get('id'):
            continue

        # Convert camelCase to snake_case for database
        db_entry_data = {
            'id': entry_data.get('id'),
            'startTime': entry_data.get('startTime') or entry_data.get('start_time'),
            'endTime': entry_data.get('endTime') or entry_data.get('end_time'),
            'duration': entry_data.get('duration'),
            'activity': entry_data.get('activity'),
            'tagId': entry_data.get('tagId') or entry_data.get('tag_id'),
            'createdAt': entry_data.get('createdAt'),
            'updated_at': entry_data.get('updated_at')
        }

        existing = TimeEntry.find_by_id(db_entry_data['id'], user_id)

        if existing:
            # Conflict resolution: last write wins based on updated_at
            client_updated = db_entry_data.get('updated_at', '')
            server_updated = existing.get('updated_at', '')

            if client_updated >= server_updated:
                TimeEntry.update(db_entry_data['id'], user_id, db_entry_data)
                updated = TimeEntry.find_by_id(db_entry_data['id'], user_id)
                results.append(time_entry_to_dict(updated))
            else:
                results.append(time_entry_to_dict(existing))
        else:
            TimeEntry.create(user_id, db_entry_data)
            new_entry = TimeEntry.find_by_id(db_entry_data['id'], user_id)
            results.append(time_entry_to_dict(new_entry))

    # Return all server entries after sync
    all_entries = TimeEntry.get_all_by_user(user_id)
    return jsonify({
        'synced': results,
        'all_entries': [time_entry_to_dict(e) for e in all_entries]
    }), 200


# ========== Habit API Endpoints ==========

def habit_to_dict(habit_row):
    """Convert habit row to dictionary"""
    if habit_row:
        habit = dict(habit_row)
        habit.pop('user_id', None)
        habit['targetCount'] = habit.pop('target_count', None)
        return habit
    return None


def log_to_dict(log_row):
    """Convert habit log row to dictionary"""
    if log_row:
        log = dict(log_row)
        log.pop('user_id', None)
        log['habitId'] = log.pop('habit_id', None)
        log['logDate'] = log.pop('log_date', None)
        return log
    return None


@app.route('/api/habits', methods=['GET'])
@jwt_required()
def get_habits():
    """Get all habits for the authenticated user"""
    user_id = get_jwt_identity()

    # Get client deleted IDs
    deleted_param = request.args.get('deleted', '')
    client_deleted_ids = set(deleted_param.split(',')) if deleted_param else set()

    # Get server tombstones
    server_deleted = DeletedHabit.get_all_by_user(user_id)
    server_deleted_ids = set(row['id'] for row in server_deleted)

    # Get all habits
    habits = Habit.get_all_by_user(user_id)

    # Newly deleted on server
    newly_deleted_on_server = server_deleted_ids - client_deleted_ids

    # Clean up old tombstones
    DeletedHabit.delete_old(user_id, 30)

    # Filter out deleted habits
    filtered_habits = [h for h in habits if h['id'] not in client_deleted_ids]

    return jsonify({
        'habits': [habit_to_dict(h) for h in filtered_habits],
        'deleted_habits': list(newly_deleted_on_server)
    }), 200


@app.route('/api/habits', methods=['POST'])
@jwt_required()
def create_or_update_habit():
    """Create or update a habit"""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    habit_data = {
        'id': data.get('id'),
        'name': data.get('name'),
        'description': data.get('description'),
        'color': data.get('color'),
        'icon': data.get('icon'),
        'frequency': data.get('frequency'),
        'targetCount': data.get('targetCount'),
        'updated_at': data.get('updated_at')
    }

    # Validate required fields
    if not habit_data.get('name'):
        return jsonify({'error': 'Name is required'}), 400

    if not habit_data.get('id'):
        return jsonify({'error': 'Habit ID is required'}), 400

    existing = Habit.find_by_id(habit_data['id'], user_id)

    if existing:
        Habit.update(habit_data['id'], user_id, habit_data)
        return jsonify(habit_to_dict(Habit.find_by_id(habit_data['id'], user_id))), 200
    else:
        Habit.create(user_id, habit_data)
        return jsonify(habit_to_dict(Habit.find_by_id(habit_data['id'], user_id))), 201


@app.route('/api/habits/<habit_id>', methods=['DELETE'])
@jwt_required()
def delete_habit(habit_id):
    """Delete a habit"""
    user_id = get_jwt_identity()

    if not Habit.find_by_id(habit_id, user_id):
        return jsonify({'error': 'Habit not found'}), 404

    Habit.delete(habit_id, user_id)
    DeletedHabit.create(user_id, habit_id)

    return jsonify({'success': True}), 200


# ========== Habit Log API Endpoints ==========

@app.route('/api/habit-logs', methods=['GET'])
@jwt_required()
def get_habit_logs():
    """Get habit logs for the authenticated user"""
    user_id = get_jwt_identity()
    habit_id = request.args.get('habit_id')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    if habit_id and start_date and end_date:
        logs = HabitLog.get_heatmap_data(user_id, habit_id, start_date, end_date)
        return jsonify({'logs': [dict(log) for log in logs]}), 200

    logs = HabitLog.get_all_by_user(user_id)
    return jsonify({'logs': [log_to_dict(log) for log in logs]}), 200


@app.route('/api/habit-logs/checkin', methods=['POST'])
@jwt_required()
def checkin_habit():
    """Check in to a habit"""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data or not data.get('habitId'):
        return jsonify({'error': 'Habit ID is required'}), 400

    log_id = data.get('id') or f"hl_{int(datetime.utcnow().timestamp() * 1000)}"
    log_date = data.get('logDate') or datetime.utcnow().strftime('%Y-%m-%d')

    log_data = {
        'id': log_id,
        'habitId': data['habitId'],
        'logDate': log_date,
        'count': data.get('count', 1),
        'note': data.get('note'),
        'updated_at': data.get('updated_at')
    }

    HabitLog.create_or_update(user_id, log_data)
    return jsonify({'success': True, 'log': log_to_dict(HabitLog.get_by_habit_and_date(user_id, data['habitId'], log_date))}), 200


@app.route('/api/habit-logs/<log_id>', methods=['DELETE'])
@jwt_required()
def delete_habit_log(log_id):
    """Delete a habit log"""
    user_id = get_jwt_identity()
    HabitLog.delete(log_id, user_id)
    DeletedHabitLog.create(user_id, log_id)
    return jsonify({'success': True}), 200


@app.route('/api/habits/batch', methods=['POST'])
@jwt_required()
def batch_sync_habits():
    """Batch sync multiple habits"""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data or 'habits' not in data:
        return jsonify({'error': 'Habits array is required'}), 400

    habits = data['habits']
    results = []

    for habit_data in habits:
        if not habit_data.get('id'):
            continue

        habit = {
            'id': habit_data.get('id'),
            'name': habit_data.get('name'),
            'description': habit_data.get('description'),
            'color': habit_data.get('color'),
            'icon': habit_data.get('icon'),
            'frequency': habit_data.get('frequency'),
            'targetCount': habit_data.get('targetCount'),
            'updated_at': habit_data.get('updated_at')
        }

        existing = Habit.find_by_id(habit['id'], user_id)

        if existing:
            client_updated = habit.get('updated_at', '')
            server_updated = existing.get('updated_at', '')

            if client_updated >= server_updated:
                Habit.update(habit['id'], user_id, habit)
                updated = Habit.find_by_id(habit['id'], user_id)
                results.append(habit_to_dict(updated))
            else:
                results.append(habit_to_dict(existing))
        else:
            Habit.create(user_id, habit)
            new_habit = Habit.find_by_id(habit['id'], user_id)
            results.append(habit_to_dict(new_habit))

    all_habits = Habit.get_all_by_user(user_id)
    return jsonify({
        'synced': results,
        'all_habits': [habit_to_dict(h) for h in all_habits]
    }), 200


@app.route('/api/habit-logs/batch', methods=['POST'])
@jwt_required()
def batch_sync_habit_logs():
    """Batch sync multiple habit logs"""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data or 'logs' not in data:
        return jsonify({'error': 'Logs array is required'}), 400

    logs = data['logs']
    results = []

    for log_data in logs:
        if not log_data.get('id'):
            continue

        log = {
            'id': log_data.get('id'),
            'habitId': log_data.get('habitId'),
            'logDate': log_data.get('logDate'),
            'count': log_data.get('count', 1),
            'note': log_data.get('note'),
            'updated_at': log_data.get('updated_at')
        }

        HabitLog.create_or_update(user_id, log)
        results.append(log)

    all_logs = HabitLog.get_all_by_user(user_id)
    return jsonify({
        'synced': results,
        'all_logs': [log_to_dict(l) for l in all_logs]
    }), 200


# ========== Daily Note API Endpoints ==========

def note_to_dict(note_row):
    """Convert daily note row to dictionary"""
    if note_row:
        note = dict(note_row)
        note.pop('user_id', None)
        note['date'] = note.pop('date', None)
        # 保持 updated_at 和 created_at 不变，与其他数据类型保持一致
        return note
    return None


@app.route('/api/notes', methods=['GET'])
@jwt_required()
def get_notes():
    """Get all daily notes for the authenticated user"""
    user_id = get_jwt_identity()

    # Get client deleted IDs
    deleted_param = request.args.get('deleted', '')
    client_deleted_ids = set(deleted_param.split(',')) if deleted_param else set()

    # Get server tombstones
    server_deleted = DeletedNote.get_all_by_user(user_id)
    server_deleted_ids = set(row['id'] for row in server_deleted)

    # Get all notes
    notes = DailyNote.get_all_by_user(user_id)

    # Newly deleted on server
    newly_deleted_on_server = server_deleted_ids - client_deleted_ids

    # Clean up old tombstones
    DeletedNote.delete_old(user_id, 30)

    # Filter out deleted notes
    filtered_notes = [n for n in notes if n['id'] not in client_deleted_ids]

    return jsonify({
        'notes': [note_to_dict(n) for n in filtered_notes],
        'deleted_notes': list(newly_deleted_on_server)
    }), 200


@app.route('/api/notes/<date>', methods=['GET'])
@jwt_required()
def get_note_by_date(date):
    """Get a specific daily note by date"""
    user_id = get_jwt_identity()
    note = DailyNote.find_by_date(user_id, date)
    if not note:
        return jsonify({'error': 'Note not found'}), 404
    return jsonify(note_to_dict(note)), 200


@app.route('/api/notes', methods=['POST'])
@jwt_required()
def create_or_update_note():
    """Create or update a daily note"""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    # Validate required fields
    if not data.get('date'):
        return jsonify({'error': 'Date is required'}), 400

    # Generate note ID from date if not provided
    note_id = data.get('id') or data['date']

    note_data = {
        'id': note_id,
        'date': data['date'],
        'content': data.get('content', ''),
        'created_at': data.get('createdAt'),
        'updated_at': data.get('updatedAt')
    }

    # Check if note exists
    existing = DailyNote.find_by_id(note_id, user_id)

    if existing:
        DailyNote.update(note_id, user_id, note_data)
        return jsonify(note_to_dict(DailyNote.find_by_id(note_id, user_id))), 200
    else:
        DailyNote.create(user_id, note_data)
        return jsonify(note_to_dict(DailyNote.find_by_id(note_id, user_id))), 201


@app.route('/api/notes/<date>', methods=['DELETE'])
@jwt_required()
def delete_note(date):
    """Delete a daily note"""
    user_id = get_jwt_identity()

    note = DailyNote.find_by_date(user_id, date)
    if not note:
        return jsonify({'error': 'Note not found'}), 404

    DailyNote.delete(note['id'], user_id)

    # Create tombstone to prevent resurrection on other devices
    DeletedNote.create(user_id, note['id'])

    return jsonify({'success': True}), 200


@app.route('/api/notes/batch', methods=['POST'])
@jwt_required()
def batch_sync_notes():
    """Batch sync multiple daily notes"""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data or 'notes' not in data:
        return jsonify({'error': 'Notes array is required'}), 400

    notes = data['notes']
    results = []

    for note_data in notes:
        if not note_data.get('date'):
            continue

        note_id = note_data.get('id') or note_data['date']
        note = {
            'id': note_id,
            'date': note_data['date'],
            'content': note_data.get('content', ''),
            'created_at': note_data.get('createdAt'),
            'updated_at': note_data.get('updatedAt')
        }

        existing = DailyNote.find_by_id(note_id, user_id)

        if existing:
            client_updated = note_data.get('updatedAt', '')
            server_updated = existing.get('updated_at', '')

            if client_updated >= server_updated:
                DailyNote.update(note_id, user_id, note)
                updated = DailyNote.find_by_id(note_id, user_id)
                results.append(note_to_dict(updated))
            else:
                results.append(note_to_dict(existing))
        else:
            DailyNote.create(user_id, note)
            new_note = DailyNote.find_by_id(note_id, user_id)
            results.append(note_to_dict(new_note))

    all_notes = DailyNote.get_all_by_user(user_id)
    return jsonify({
        'synced': results,
        'all_notes': [note_to_dict(n) for n in all_notes]
    }), 200


# ========== Invitation Code API Endpoints ==========

@app.route('/api/invitation-codes', methods=['POST'])
@jwt_required()
def create_invitation_code():
    """Create a new invitation code (admin only)"""
    if not admin_required():
        return jsonify({'error': 'Admin permission required'}), 403

    data = request.get_json()
    if not data or not data.get('code'):
        return jsonify({'error': 'Code is required'}), 400

    code = data['code'].strip()
    max_uses = data.get('max_uses', 1)
    expires_at = data.get('expires_at')

    # Check if code already exists
    existing = InvitationCode.find_by_code(code)
    if existing:
        return jsonify({'error': 'Invitation code already exists'}), 400

    InvitationCode.create(code, max_uses, expires_at)

    return jsonify({
        'code': code,
        'max_uses': max_uses,
        'expires_at': expires_at
    }), 201


@app.route('/api/invitation-codes', methods=['GET'])
@jwt_required()
def get_invitation_codes():
    """Get all invitation codes (admin only)"""
    if not admin_required():
        return jsonify({'error': 'Admin permission required'}), 403

    codes = InvitationCode.get_all()
    result = []
    for code in codes:
        result.append({
            'id': code['id'],
            'code': code['code'],
            'max_uses': code['max_uses'],
            'used_count': code['used_count'],
            'created_at': code['created_at'],
            'expires_at': code['expires_at'],
            'is_active': bool(code['is_active'])
        })

    return jsonify({'codes': result}), 200


@app.route('/api/invitation-codes/<int:code_id>', methods=['DELETE'])
@jwt_required()
def delete_invitation_code(code_id):
    """Delete an invitation code (admin only)"""
    if not admin_required():
        return jsonify({'error': 'Admin permission required'}), 403

    if not InvitationCode.delete_by_id(code_id):
        return jsonify({'error': 'Invitation code not found'}), 404

    return jsonify({'success': True}), 200


@app.route('/api/admin/users', methods=['GET'])
@jwt_required()
def get_all_users():
    """Get all users (admin only)"""
    if not admin_required():
        return jsonify({'error': 'Admin permission required'}), 403

    users = User.get_all()
    return jsonify([{
        'id': user['id'],
        'username': user['username'],
        'is_admin': bool(user['is_admin']),
        'created_at': user['created_at']
    } for user in users]), 200


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@jwt_required()
def delete_user(user_id):
    """Delete a user (admin only)"""
    if not admin_required():
        return jsonify({'error': 'Admin permission required'}), 403

    current_user_id = get_jwt_identity()

    # Prevent deleting yourself
    if current_user_id == user_id:
        return jsonify({'error': 'Cannot delete yourself'}), 400

    # Check if target user exists
    target_user = User.find_by_id(user_id)
    if not target_user:
        return jsonify({'error': 'User not found'}), 404

    # Execute deletion
    User.delete_by_id(user_id)

    return jsonify({'success': True}), 200


def main():
    """Main entry point"""
    print(f"Starting DailyHub API on {HOST}:{PORT}")
    print(f"Database: {DATABASE_PATH}")
    print(f"JWT Secret: {JWT_SECRET_KEY[:20]}...")

    # Initialize database
    Database.init_db()

    # Run app
    app.run(host=HOST, port=PORT, debug=DEBUG)


if __name__ == '__main__':
    main()
