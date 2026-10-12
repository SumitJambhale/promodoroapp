const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'pomodoro.db');
const db = new DatabaseSync(DB_PATH);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      duration_minutes INTEGER NOT NULL,
      break_duration_minutes INTEGER NOT NULL DEFAULT 5,
      breaks_used INTEGER NOT NULL DEFAULT 0,
      max_breaks INTEGER NOT NULL DEFAULT 2,
      status TEXT NOT NULL DEFAULT 'New',
      scheduled_by TEXT NOT NULL DEFAULT 'User',
      priority TEXT NOT NULL DEFAULT 'Medium',
      scheduled_date TEXT,
      scheduled_time TEXT,
      chain_id INTEGER,
      chain_order INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_by TEXT NOT NULL DEFAULT 'User',
      priority TEXT NOT NULL DEFAULT 'High',
      status TEXT NOT NULL DEFAULT 'New',
      total_duration_minutes INTEGER NOT NULL DEFAULT 0,
      break_duration_minutes INTEGER NOT NULL DEFAULT 10,
      breaks_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chain_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chain_id INTEGER NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL,
      requires_break_after INTEGER DEFAULT 0,
      break_duration_minutes INTEGER DEFAULT 10
    );

    CREATE TABLE IF NOT EXISTS notifications_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      title TEXT NOT NULL,
      priority TEXT NOT NULL,
      scheduled_datetime TEXT NOT NULL,
      notified_at TEXT DEFAULT CURRENT_TIMESTAMP,
      acknowledged INTEGER DEFAULT 0
    );
  `);

  // Check if we need to seed initial data
  const countRow = db.prepare('SELECT COUNT(*) as count FROM tasks').get();
  if (countRow.count === 0) {
    seedInitialData();
  }
}

function seedInitialData() {
  const today = new Date().toISOString().split('T')[0];
  const sampleTasks = [
    {
      title: 'Design Apple HIG Design Tokens',
      description: 'Craft glassmorphic palettes, dynamic SF typography scales, and spring physics variables.',
      duration_minutes: 25,
      break_duration_minutes: 5,
      breaks_used: 0,
      max_breaks: 2,
      status: 'New',
      scheduled_by: 'Alex Mercer (Design Lead)',
      priority: 'High',
      scheduled_date: today,
      scheduled_time: '18:00'
    },
    {
      title: 'Optimize SQLite Connection Engine',
      description: 'Benchmark Node.js native sqlite sync transactions and ensure zero latency indexing.',
      duration_minutes: 30,
      break_duration_minutes: 5,
      breaks_used: 1,
      max_breaks: 2,
      status: 'New',
      scheduled_by: 'David Chen (Core Arch)',
      priority: 'Medium',
      scheduled_date: today,
      scheduled_time: '19:30'
    },
    {
      title: 'Review Meta React UI Components',
      description: 'Audit responsive layout fidelity, focus rings, accessibility, and micro-interactions.',
      duration_minutes: 20,
      break_duration_minutes: 4,
      breaks_used: 2,
      max_breaks: 2,
      status: 'Completed',
      scheduled_by: 'Sarah Lin (Product)',
      priority: 'Low',
      scheduled_date: today,
      scheduled_time: '14:00'
    },
    {
      title: 'Prepare Sprint Release Notes',
      description: 'Summarize key features, bug fixes, and upcoming dependencies for the v2.4 rollout.',
      duration_minutes: 40,
      break_duration_minutes: 5,
      breaks_used: 0,
      max_breaks: 2,
      status: 'Repeat',
      scheduled_by: 'Elena Rostova (Engineering)',
      priority: 'High',
      scheduled_date: today,
      scheduled_time: '20:15'
    }
  ];

  for (const t of sampleTasks) {
    createTask(t);
  }

  // Create a sample 3-task chain
  // Task 1: 35m, Task 2: 30m -> total 65m (>1h) -> automatic 10m break required -> Task 3: 20m -> total 95m <= 120m
  const t1 = createTask({
    title: 'Chain Step 1: Architecture Blueprint',
    description: 'Sketch dependent microservice modules and SQLite schema.',
    duration_minutes: 35,
    break_duration_minutes: 5,
    status: 'New',
    scheduled_by: 'Alex Mercer',
    priority: 'High',
    scheduled_date: today,
    scheduled_time: '10:00'
  });

  const t2 = createTask({
    title: 'Chain Step 2: Implement Core Endpoints',
    description: 'Wire up REST handlers, strict validations, and timer controllers.',
    duration_minutes: 30,
    break_duration_minutes: 5,
    status: 'New',
    scheduled_by: 'Alex Mercer',
    priority: 'High',
    scheduled_date: today,
    scheduled_time: '11:00'
  });

  const t3 = createTask({
    title: 'Chain Step 3: Polish Glassmorphism UI',
    description: 'Apply blurred backdrop cards, Apple-style segmented tabs, and dark mode.',
    duration_minutes: 25,
    break_duration_minutes: 5,
    status: 'New',
    scheduled_by: 'Alex Mercer',
    priority: 'Medium',
    scheduled_date: today,
    scheduled_time: '12:00'
  });

  createChain({
    name: 'Full Stack Sprint (3-Task Chain)',
    description: 'Sequential dependent flow. Consecutive time > 60 min auto-inserts 10-15m break.',
    created_by: 'Alex Mercer',
    priority: 'High',
    break_duration_minutes: 10,
    task_ids: [t1.id, t2.id, t3.id]
  });
}

function getTasks(filters = {}) {
  let query = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (filters.status && filters.status !== 'All') {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  if (filters.priority && filters.priority !== 'All') {
    query += ' AND priority = ?';
    params.push(filters.priority);
  }

  if (filters.search) {
    query += ' AND (title LIKE ? OR description LIKE ? OR scheduled_by LIKE ?)';
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }

  if (filters.scheduled_date) {
    query += ' AND scheduled_date = ?';
    params.push(filters.scheduled_date);
  }

  query += " ORDER BY CASE priority WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 ELSE 4 END, created_at DESC";

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

function getTaskById(id) {
  const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
  return stmt.get(Number(id));
}

function validateTaskDuration(duration) {
  const d = Number(duration);
  if (isNaN(d) || d < 1 || d > 45) {
    throw new Error('Task duration must be between 1 and 45 minutes.');
  }
  return d;
}

function validateBreakDuration(duration) {
  const d = Number(duration);
  if (isNaN(d) || d < 4 || d > 5) {
    throw new Error('Short break must be between 4 and 5 minutes.');
  }
  return d;
}

function createTask(data) {
  const title = (data.title || '').trim();
  if (!title) {
    throw new Error('Task heading/title is required.');
  }

  const duration = validateTaskDuration(data.duration_minutes !== undefined ? data.duration_minutes : 25);
  const breakDuration = validateBreakDuration(data.break_duration_minutes !== undefined ? data.break_duration_minutes : 5);
  const status = ['New', 'Completed', 'Canceled', 'Repeat'].includes(data.status) ? data.status : 'New';
  const priority = ['High', 'Medium', 'Low'].includes(data.priority) ? data.priority : 'Medium';
  const scheduledBy = (data.scheduled_by || 'Alex Mercer').trim();
  const description = (data.description || '').trim();
  const scheduledDate = data.scheduled_date || null;
  const scheduledTime = data.scheduled_time || null;
  const breaksUsed = Math.min(2, Math.max(0, Number(data.breaks_used) || 0));

  const stmt = db.prepare(`
    INSERT INTO tasks (
      title, description, duration_minutes, break_duration_minutes,
      breaks_used, max_breaks, status, scheduled_by, priority,
      scheduled_date, scheduled_time, chain_id, chain_order
    ) VALUES (?, ?, ?, ?, ?, 2, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    title,
    description,
    duration,
    breakDuration,
    breaksUsed,
    status,
    scheduledBy,
    priority,
    scheduledDate,
    scheduledTime,
    data.chain_id || null,
    data.chain_order || null
  );

  return getTaskById(result.lastInsertRowid);
}

function updateTask(id, data) {
  const existing = getTaskById(id);
  if (!existing) {
    throw new Error(`Task ${id} not found`);
  }

  const title = data.title !== undefined ? String(data.title).trim() : existing.title;
  if (!title) throw new Error('Task heading/title cannot be empty');

  const duration = data.duration_minutes !== undefined ? validateTaskDuration(data.duration_minutes) : existing.duration_minutes;
  const breakDuration = data.break_duration_minutes !== undefined ? validateBreakDuration(data.break_duration_minutes) : existing.break_duration_minutes;
  
  let breaksUsed = existing.breaks_used;
  if (data.breaks_used !== undefined) {
    const b = Number(data.breaks_used);
    if (b > 2) throw new Error('Maximum breaks allowed cannot exceed 2 breaks.');
    breaksUsed = Math.max(0, b);
  }

  let status = existing.status;
  if (data.status !== undefined) {
    if (!['New', 'Completed', 'Canceled', 'Repeat'].includes(data.status)) {
      throw new Error("Status must be one of: 'New', 'Completed', 'Canceled', 'Repeat'");
    }
    status = data.status;
  }

  let priority = existing.priority;
  if (data.priority !== undefined) {
    if (!['High', 'Medium', 'Low'].includes(data.priority)) {
      throw new Error("Priority must be one of: 'High', 'Medium', 'Low'");
    }
    priority = data.priority;
  }

  const scheduledBy = data.scheduled_by !== undefined ? String(data.scheduled_by).trim() : existing.scheduled_by;
  const description = data.description !== undefined ? String(data.description).trim() : existing.description;
  const scheduledDate = data.scheduled_date !== undefined ? data.scheduled_date : existing.scheduled_date;
  const scheduledTime = data.scheduled_time !== undefined ? data.scheduled_time : existing.scheduled_time;
  const chainId = data.chain_id !== undefined ? data.chain_id : existing.chain_id;
  const chainOrder = data.chain_order !== undefined ? data.chain_order : existing.chain_order;

  const stmt = db.prepare(`
    UPDATE tasks SET
      title = ?,
      description = ?,
      duration_minutes = ?,
      break_duration_minutes = ?,
      breaks_used = ?,
      status = ?,
      scheduled_by = ?,
      priority = ?,
      scheduled_date = ?,
      scheduled_time = ?,
      chain_id = ?,
      chain_order = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  stmt.run(
    title,
    description,
    duration,
    breakDuration,
    breaksUsed,
    status,
    scheduledBy,
    priority,
    scheduledDate,
    scheduledTime,
    chainId,
    chainOrder,
    Number(id)
  );

  return getTaskById(id);
}

function recordBreak(taskId) {
  const task = getTaskById(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  if (task.breaks_used >= 2) {
    throw new Error('Maximum break limit reached. Cannot exceed 2 breaks per task.');
  }

  const stmt = db.prepare('UPDATE tasks SET breaks_used = breaks_used + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  stmt.run(Number(taskId));
  return getTaskById(taskId);
}

function repeatTask(taskId) {
  const task = getTaskById(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const stmt = db.prepare("UPDATE tasks SET status = 'Repeat', breaks_used = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
  stmt.run(Number(taskId));
  return getTaskById(taskId);
}

function deleteTask(id) {
  const task = getTaskById(id);
  if (!task) throw new Error(`Task ${id} not found`);
  const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
  stmt.run(Number(id));
  return { success: true, id: Number(id) };
}

// Chain Operations
function createChain(data) {
  const name = (data.name || '').trim();
  if (!name) throw new Error('Chain name is required.');

  const taskIds = data.task_ids || [];
  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    throw new Error('At least 1 task must be assigned to the chain.');
  }
  if (taskIds.length > 3) {
    throw new Error('Maximum task chain length is 3 dependent tasks.');
  }

  const breakDuration = Number(data.break_duration_minutes || 10);
  if (breakDuration < 10 || breakDuration > 15) {
    throw new Error('Chain break duration must be between 10 and 15 minutes.');
  }

  // Fetch the tasks in order
  const tasks = [];
  let totalTaskMinutes = 0;
  for (const tid of taskIds) {
    const t = getTaskById(tid);
    if (!t) throw new Error(`Task id ${tid} does not exist.`);
    tasks.push(t);
    totalTaskMinutes += t.duration_minutes;
  }

  // Calculate consecutive duration and determine required breaks
  // "if consecutive task time is more than 1 hour then provide a break time of 10-15 mins"
  // "maximum task chain should be 3 and do not exceed more that 2 hrs with the maximum break allowed is 2 time each 10-15 minutes"
  let breaksCount = 0;
  let consecutiveTime = 0;
  const breakPlan = []; // boolean for whether break is placed after task i

  for (let i = 0; i < tasks.length; i++) {
    consecutiveTime += tasks[i].duration_minutes;
    // Check if next task exists and if consecutive time exceeds 60 minutes
    if (i < tasks.length - 1) {
      if (consecutiveTime >= 60 && breaksCount < 2) {
        breakPlan.push(true);
        breaksCount++;
        consecutiveTime = 0; // reset consecutive timer after break
      } else {
        breakPlan.push(false);
      }
    } else {
      breakPlan.push(false);
    }
  }

  // If tasks total > 60m and no break was inserted yet because individual tasks were <60m, ensure break between task 1 and 2 if sum > 60
  if (tasks.length >= 2 && breaksCount === 0 && (tasks[0].duration_minutes + tasks[1].duration_minutes > 60)) {
    breakPlan[0] = true;
    breaksCount = 1;
  }

  if (breaksCount > 2) {
    throw new Error('Maximum break allowed in a chain is 2 breaks.');
  }

  const totalDuration = totalTaskMinutes + (breaksCount * breakDuration);
  if (totalDuration > 120) {
    throw new Error(`Total chain duration (${totalDuration} mins) exceeds maximum allowed limit of 2 hours (120 minutes). Reduce task durations or break time.`);
  }

  const chainStmt = db.prepare(`
    INSERT INTO chains (
      name, description, created_by, priority, status,
      total_duration_minutes, break_duration_minutes, breaks_count
    ) VALUES (?, ?, ?, ?, 'New', ?, ?, ?)
  `);

  const chainResult = chainStmt.run(
    name,
    (data.description || '').trim(),
    (data.created_by || 'Alex Mercer').trim(),
    ['High', 'Medium', 'Low'].includes(data.priority) ? data.priority : 'High',
    totalDuration,
    breakDuration,
    breaksCount
  );

  const chainId = chainResult.lastInsertRowid;

  const itemStmt = db.prepare(`
    INSERT INTO chain_items (
      chain_id, task_id, step_order, requires_break_after, break_duration_minutes
    ) VALUES (?, ?, ?, ?, ?)
  `);

  const taskUpdateStmt = db.prepare('UPDATE tasks SET chain_id = ?, chain_order = ? WHERE id = ?');

  tasks.forEach((task, index) => {
    const stepOrder = index + 1;
    const hasBreakAfter = breakPlan[index] ? 1 : 0;
    itemStmt.run(chainId, task.id, stepOrder, hasBreakAfter, hasBreakAfter ? breakDuration : 0);
    taskUpdateStmt.run(chainId, stepOrder, task.id);
  });

  return getChainById(chainId);
}

function getChains() {
  const chains = db.prepare('SELECT * FROM chains ORDER BY created_at DESC').all();
  return chains.map(c => getChainDetails(c));
}

function getChainById(id) {
  const chain = db.prepare('SELECT * FROM chains WHERE id = ?').get(Number(id));
  if (!chain) return null;
  return getChainDetails(chain);
}

function getChainDetails(chain) {
  const items = db.prepare(`
    SELECT ci.id as item_id, ci.step_order, ci.requires_break_after, ci.break_duration_minutes,
           t.id as task_id, t.title, t.description, t.duration_minutes, t.status, t.priority, t.scheduled_by
    FROM chain_items ci
    JOIN tasks t ON ci.task_id = t.id
    WHERE ci.chain_id = ?
    ORDER BY ci.step_order ASC
  `).all(chain.id);

  return {
    ...chain,
    tasks: items
  };
}

function updateChainStatus(id, status) {
  const allowed = ['New', 'In Progress', 'Completed', 'Canceled'];
  if (!allowed.includes(status)) {
    throw new Error(`Invalid chain status. Allowed: ${allowed.join(', ')}`);
  }
  db.prepare('UPDATE chains SET status = ? WHERE id = ?').run(status, Number(id));
  return getChainById(id);
}

function deleteChain(id) {
  const chain = getChainById(id);
  if (!chain) throw new Error(`Chain ${id} not found`);
  // Unlink tasks
  db.prepare('UPDATE tasks SET chain_id = NULL, chain_order = NULL WHERE chain_id = ?').run(Number(id));
  db.prepare('DELETE FROM chains WHERE id = ?').run(Number(id));
  return { success: true, id: Number(id) };
}

// Notifications Log
function getPendingNotifications() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${hours}:${mins}`;

  // Find tasks scheduled for today that haven't been completed/canceled and match time
  const stmt = db.prepare(`
    SELECT t.* FROM tasks t
    WHERE t.status NOT IN ('Completed', 'Canceled')
      AND t.scheduled_date = ?
      AND t.scheduled_time <= ?
      AND t.id NOT IN (
        SELECT task_id FROM notifications_log 
        WHERE scheduled_datetime LIKE ?
      )
  `);

  return stmt.all(dateStr, currentTime, `${dateStr}%`);
}

function logNotification(taskId, title, priority, scheduledDatetime) {
  const stmt = db.prepare(`
    INSERT INTO notifications_log (task_id, title, priority, scheduled_datetime)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(taskId, title, priority, scheduledDatetime);
}

function getNotificationHistory() {
  return db.prepare('SELECT * FROM notifications_log ORDER BY notified_at DESC LIMIT 50').all();
}

module.exports = {
  initSchema,
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  recordBreak,
  repeatTask,
  deleteTask,
  createChain,
  getChains,
  getChainById,
  updateChainStatus,
  deleteChain,
  getPendingNotifications,
  logNotification,
  getNotificationHistory
};
