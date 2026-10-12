// Vercel Serverless Function: /api/tasks

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // If Supabase environment variables are provided, query Supabase PostgREST
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/tasks`;
      const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      };

      if (req.method === 'GET') {
        const queryParams = new URLSearchParams(req.query || {}).toString();
        const response = await fetch(`${endpoint}?order=created_at.desc${queryParams ? '&' + queryParams : ''}`, { headers });
        const data = await response.json();
        return res.status(200).json({ tasks: data });
      }

      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        // Validate duration
        const duration = Number(body.duration_minutes || 25);
        if (duration < 1 || duration > 45) {
          return res.status(400).json({ error: 'Task duration must be between 1 and 45 minutes.' });
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        });
        const data = await response.json();
        return res.status(201).json({ task: Array.isArray(data) ? data[0] : data });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Fallback if running with SQLite backend locally
  try {
    const db = require('../db.js');
    if (req.method === 'GET') {
      const tasks = db.getTasks(req.query || {});
      return res.status(200).json({ tasks });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const task = db.createTask(body);
      return res.status(201).json({ task });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};
