# Todo Priority Feature Design

**Date:** 2025-03-09
**Issue:** #10 - Add todo priority and drag-to-reorder
**Status:** Approved

## Overview

Add a priority field to todos with 4 levels (None/Low/Medium/High). Priority is displayed as colored emoji badges and can be set when creating a todo or changed later by clicking. Priority does NOT affect sorting order - manual drag position is respected.

**Requirements Summary:**
- Priority levels: None, Low, Medium, High (default: None)
- Visual: 🔴高 🟠中 🟡低 ⚪无
- Set priority when creating, click badge to cycle through levels later
- Manual order only - priority is just a visual tag

## Data Model

Add `priority` field to todo objects:

```javascript
{
    // ... existing fields
    priority: 'none' | 'low' | 'medium' | 'high'  // default: 'none'
}
```

The priority field will be stored in IndexedDB and synced to cloud automatically via existing `uploadTodo()` mechanism.

## UI Components

### 1. Todo Input Area

Location: `index.html` lines 77-100

Add priority selector between text input and date picker:
- 4 radio buttons or segmented control
- Labels: ⚪无 🟡低 🟠中 🔴高
- Default selected: None (⚪无)

```html
<div class="todo-priority-selector">
    <label class="priority-option">
        <input type="radio" name="todoPriority" value="none" checked>
        <span>⚪无</span>
    </label>
    <label class="priority-option">
        <input type="radio" name="todoPriority" value="low">
        <span>🟡低</span>
    </label>
    <label class="priority-option">
        <input type="radio" name="todoPriority" value="medium">
        <span>🟠中</span>
    </label>
    <label class="priority-option">
        <input type="radio" name="todoPriority" value="high">
        <span>🔴高</span>
    </label>
</div>
```

### 2. Todo Item Display

Location: `todolist.js` renderTodoTree()

Add priority badge before the todo text:
- Clickable badge that cycles: None → Low → Medium → High → None
- Badge styling matches priority color

```html
<span class="todo-priority-badge" data-priority="high">🔴高</span>
```

## User Interactions

### Creating a todo:
1. User types todo text
2. (Optional) Select priority from 4 options
3. (Optional) Set due date
4. Click "添加" to save

### Changing priority after creation:
- Click the priority badge on any todo item
- Badge cycles to next level: None → Low → Medium → High → None
- Change saves immediately and syncs to cloud

## Implementation Details

### Files to modify

1. **`js/todolist.js`**
   - Add `priority` parameter to `addTodo()` (default: `'none'`)
   - Update `addTodoWithoutSync()` and `updateTodoWithoutSync()` to include priority
   - Modify `renderTodoTree()` to display priority badge
   - Add click handler on priority badge to cycle through levels

2. **`index.html`**
   - Add priority selector in `.todo-input-wrapper`
   - Position between text input and date picker

3. **`css/style.css`**
   - Add `.todo-priority-badge` class with color variants
   - Add hover/active states for clickable badges
   - Add priority selector styling

### CSS Example

```css
.todo-priority-badge {
    cursor: pointer;
    margin-right: 6px;
    transition: opacity 0.2s;
}

.todo-priority-badge:hover {
    opacity: 0.7;
}

.todo-priority-badge[data-priority="high"] { color: #dc3545; }
.todo-priority-badge[data-priority="medium"] { color: #fd7e14; }
.todo-priority-badge[data-priority="low"] { color: #ffc107; }
.todo-priority-badge[data-priority="none"] { color: #adb5bd; }
```

## Cloud Sync

Priority field syncs automatically via existing `uploadTodo()` in `storage.js`. No changes needed — the entire todo object (including priority) is sent to the cloud.

## Testing Checklist

- [ ] Create todo with each priority level
- [ ] Verify default priority is "none"
- [ ] Click badge to cycle through all priorities
- [ ] Verify priority persists after page refresh
- [ ] Verify priority syncs to cloud (if logged in)
- [ ] Verify drag-and-drop still works independently
- [ ] Verify existing todos (without priority field) default to "none"

## Edge Cases

1. **Existing todos without priority field** — Treat as "none" priority
2. **Cloud sync mismatch** — Local priority takes precedence, uploads to cloud
3. **Nested todos** — Each sub-todo has its own priority

## Notes

- Drag-and-drop reordering is already fully implemented — no changes needed for that part of issue #10
- Priority is purely visual/organizational — does not affect sort order
