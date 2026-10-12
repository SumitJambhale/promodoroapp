/**
 * Unified API Client Wrapper
 * Transparently delegates to Supabase PostgreSQL when configured,
 * or falls back to local REST endpoints.
 */
const API = {
  get isSupabaseActive() {
    return Boolean(window.supabaseService && window.supabaseService.isConfigured);
  },

  async getTasks(params = {}) {
    if (this.isSupabaseActive) {
      return window.supabaseService.getTasks(params);
    }
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`/api/tasks${query ? '?' + query : ''}`);
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch tasks');
    return res.json();
  },

  async getTask(id) {
    if (this.isSupabaseActive) {
      return window.supabaseService.getTask(id);
    }
    const res = await fetch(`/api/tasks/${id}`);
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch task');
    return res.json();
  },

  async createTask(data) {
    if (this.isSupabaseActive) {
      return window.supabaseService.createTask(data);
    }
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to create task');
    return json;
  },

  async updateTask(id, data) {
    if (this.isSupabaseActive) {
      return window.supabaseService.updateTask(id, data);
    }
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update task');
    return json;
  },

  async deleteTask(id) {
    if (this.isSupabaseActive) {
      return window.supabaseService.deleteTask(id);
    }
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to delete task');
    return json;
  },

  async recordBreak(id) {
    if (this.isSupabaseActive) {
      return window.supabaseService.recordBreak(id);
    }
    const res = await fetch(`/api/tasks/${id}/break`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to record break');
    return json;
  },

  async repeatTask(id) {
    if (this.isSupabaseActive) {
      return window.supabaseService.repeatTask(id);
    }
    const res = await fetch(`/api/tasks/${id}/repeat`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to repeat task');
    return json;
  },

  async getChains() {
    if (this.isSupabaseActive) {
      return window.supabaseService.getChains();
    }
    const res = await fetch('/api/chains');
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch chains');
    return res.json();
  },

  async getChain(id) {
    if (this.isSupabaseActive) {
      const { chains } = await window.supabaseService.getChains();
      const chain = chains.find(c => String(c.id) === String(id));
      if (!chain) throw new Error('Chain not found');
      return { chain };
    }
    const res = await fetch(`/api/chains/${id}`);
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch chain');
    return res.json();
  },

  async createChain(data) {
    if (this.isSupabaseActive) {
      return window.supabaseService.createChain(data);
    }
    const res = await fetch('/api/chains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to create chain');
    return json;
  },

  async updateChainStatus(id, status) {
    if (this.isSupabaseActive) {
      return window.supabaseService.updateChainStatus(id, status);
    }
    const res = await fetch(`/api/chains/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update chain status');
    return json;
  },

  async deleteChain(id) {
    if (this.isSupabaseActive) {
      return window.supabaseService.deleteChain(id);
    }
    const res = await fetch(`/api/chains/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to delete chain');
    return json;
  },

  async getPendingNotifications() {
    if (this.isSupabaseActive) {
      return window.supabaseService.getPendingNotifications();
    }
    const res = await fetch('/api/notifications/pending');
    if (!res.ok) return { pending: [] };
    return res.json();
  },

  async logNotification(taskId, title, priority, scheduledDatetime) {
    if (this.isSupabaseActive) {
      return window.supabaseService.logNotification(taskId, title, priority, scheduledDatetime);
    }
    const res = await fetch('/api/notifications/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        title,
        priority,
        scheduled_datetime: scheduledDatetime
      })
    });
    return res.json();
  },

  async getNotificationHistory() {
    if (this.isSupabaseActive) {
      return { history: [] };
    }
    const res = await fetch('/api/notifications/history');
    if (!res.ok) return { history: [] };
    return res.json();
  }
};

window.API = API;
