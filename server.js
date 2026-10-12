const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const db = require('./db.js');

// Initialize database tables & seed data
db.initSchema();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
  sendJSON(res, statusCode, { error: message });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  try {
    // API Routes
    if (pathname.startsWith('/api/')) {
      // GET /api/tasks
      if (pathname === '/api/tasks' && method === 'GET') {
        const tasks = db.getTasks(parsedUrl.query);
        return sendJSON(res, 200, { tasks });
      }

      // POST /api/tasks
      if (pathname === '/api/tasks' && method === 'POST') {
        const body = await parseBody(req);
        const task = db.createTask(body);
        return sendJSON(res, 201, { task, message: 'Task created successfully' });
      }

      // Match /api/tasks/:id routes
      const taskDetailMatch = pathname.match(/^\/api\/tasks\/(\d+)$/);
      if (taskDetailMatch) {
        const id = taskDetailMatch[1];
        if (method === 'GET') {
          const task = db.getTaskById(id);
          if (!task) return sendError(res, 404, 'Task not found');
          return sendJSON(res, 200, { task });
        }
        if (method === 'PUT') {
          const body = await parseBody(req);
          const task = db.updateTask(id, body);
          return sendJSON(res, 200, { task, message: 'Task updated successfully' });
        }
        if (method === 'DELETE') {
          const result = db.deleteTask(id);
          return sendJSON(res, 200, result);
        }
      }

      // POST /api/tasks/:id/break
      const taskBreakMatch = pathname.match(/^\/api\/tasks\/(\d+)\/break$/);
      if (taskBreakMatch && method === 'POST') {
        const id = taskBreakMatch[1];
        const task = db.recordBreak(id);
        return sendJSON(res, 200, { task, message: 'Break recorded successfully' });
      }

      // POST /api/tasks/:id/repeat
      const taskRepeatMatch = pathname.match(/^\/api\/tasks\/(\d+)\/repeat$/);
      if (taskRepeatMatch && method === 'POST') {
        const id = taskRepeatMatch[1];
        const task = db.repeatTask(id);
        return sendJSON(res, 200, { task, message: 'Task reset to Repeat status' });
      }

      // GET /api/chains
      if (pathname === '/api/chains' && method === 'GET') {
        const chains = db.getChains();
        return sendJSON(res, 200, { chains });
      }

      // POST /api/chains
      if (pathname === '/api/chains' && method === 'POST') {
        const body = await parseBody(req);
        const chain = db.createChain(body);
        return sendJSON(res, 201, { chain, message: 'Task chain created successfully' });
      }

      // Match /api/chains/:id
      const chainDetailMatch = pathname.match(/^\/api\/chains\/(\d+)$/);
      if (chainDetailMatch) {
        const id = chainDetailMatch[1];
        if (method === 'GET') {
          const chain = db.getChainById(id);
          if (!chain) return sendError(res, 404, 'Chain not found');
          return sendJSON(res, 200, { chain });
        }
        if (method === 'DELETE') {
          const result = db.deleteChain(id);
          return sendJSON(res, 200, result);
        }
      }

      // PUT /api/chains/:id/status
      const chainStatusMatch = pathname.match(/^\/api\/chains\/(\d+)\/status$/);
      if (chainStatusMatch && method === 'PUT') {
        const id = chainStatusMatch[1];
        const body = await parseBody(req);
        const chain = db.updateChainStatus(id, body.status);
        return sendJSON(res, 200, { chain, message: 'Chain status updated' });
      }

      // GET /api/notifications/pending
      if (pathname === '/api/notifications/pending' && method === 'GET') {
        const pending = db.getPendingNotifications();
        return sendJSON(res, 200, { pending });
      }

      // POST /api/notifications/log
      if (pathname === '/api/notifications/log' && method === 'POST') {
        const body = await parseBody(req);
        db.logNotification(body.task_id, body.title, body.priority, body.scheduled_datetime);
        return sendJSON(res, 201, { success: true });
      }

      // GET /api/notifications/history
      if (pathname === '/api/notifications/history' && method === 'GET') {
        const history = db.getNotificationHistory();
        return sendJSON(res, 200, { history });
      }

      return sendError(res, 404, 'API endpoint not found');
    }

    // Static File Serving
    let filePath = pathname === '/' ? '/index.html' : pathname;
    const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(PUBLIC_DIR, safePath);

    if (!fullPath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.stat(fullPath, (err, stats) => {
      if (err || !stats.isFile()) {
        // Fallback to index.html for SPA if not found
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return fs.createReadStream(indexPath).pipe(res);
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }

      const ext = path.extname(fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(fullPath).pipe(res);
    });

  } catch (err) {
    console.error('Server error:', err);
    sendError(res, 400, err.message || 'Server processing error');
  }
});

server.listen(PORT, () => {
  console.log(`Pomodoro Pro Server running at http://localhost:${PORT}`);
});
