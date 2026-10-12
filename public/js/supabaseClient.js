/**
 * Supabase Client Integration Module
 * Enables direct serverless PostgreSQL access with Realtime subscriptions,
 * Row Level Security (RLS), and seamless offline/local fallback.
 */

class SupabaseService {
  constructor() {
    this.client = null;
    this.url = '';
    this.anonKey = '';
    this.isConfigured = false;
    this.realtimeChannel = null;
  }

  init() {
    // 1. Check for stored credentials or window env variables
    const storedUrl = localStorage.getItem('pomodoro_supabase_url') || window.ENV_SUPABASE_URL || '';
    const storedKey = localStorage.getItem('pomodoro_supabase_key') || window.ENV_SUPABASE_ANON_KEY || '';

    if (storedUrl && storedKey && window.supabase) {
      this.configure(storedUrl, storedKey);
    }
  }

  configure(url, anonKey) {
    try {
      this.url = url.trim();
      this.anonKey = anonKey.trim();
      
      if (!this.url || !this.anonKey) {
        this.isConfigured = false;
        this.client = null;
        return false;
      }

      this.client = window.supabase.createClient(this.url, this.anonKey);
      this.isConfigured = true;

      // Save to localStorage
      localStorage.setItem('pomodoro_supabase_url', this.url);
      localStorage.setItem('pomodoro_supabase_key', this.anonKey);

      // Setup Realtime
      this.setupRealtime();

      return true;
    } catch (err) {
      console.error('Failed to configure Supabase:', err);
      this.isConfigured = false;
      return false;
    }
  }

  disconnect() {
    localStorage.removeItem('pomodoro_supabase_url');
    localStorage.removeItem('pomodoro_supabase_key');
    if (this.realtimeChannel) {
      this.client?.removeChannel(this.realtimeChannel);
    }
    this.client = null;
    this.isConfigured = false;
    this.url = '';
    this.anonKey = '';
  }

  async testConnection(url, anonKey) {
    try {
      if (!window.supabase) throw new Error('Supabase JS library not loaded');
      const tempClient = window.supabase.createClient(url.trim(), anonKey.trim());
      const { data, error } = await tempClient.from('tasks').select('count', { count: 'exact', head: true });
      if (error) throw error;
      return { success: true, count: data };
    } catch (err) {
      return { success: false, error: err.message || 'Connection failed' };
    }
  }

  setupRealtime() {
    if (!this.client || !this.isConfigured) return;
    try {
      if (this.realtimeChannel) {
        this.client.removeChannel(this.realtimeChannel);
      }

      this.realtimeChannel = this.client
        .channel('public:tasks')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
          if (window.app) {
            window.app.loadTasks(false); // Reload tasks smoothly without interrupting active timer
          }
        })
        .subscribe();
    } catch (err) {
      console.warn('Realtime subscription error:', err);
    }
  }

  // --- Supabase Database CRUD Methods ---

  async getTasks(filters = {}) {
    if (!this.isConfigured) throw new Error('Supabase not configured');

    let query = this.client.from('tasks').select('*');

    if (filters.status && filters.status !== 'All') {
      query = query.eq('status', filters.status);
    }
    if (filters.priority && filters.priority !== 'All') {
      query = query.eq('priority', filters.priority);
    }
    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,scheduled_by.ilike.%${filters.search}%`);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return { tasks: data };
  }

  async getTask(id) {
    if (!this.isConfigured) throw new Error('Supabase not configured');
    const { data, error } = await this.client.from('tasks').select('*').eq('id', id).single();
    if (error) throw error;
    return { task: data };
  }

  async createTask(taskData) {
    if (!this.isConfigured) throw new Error('Supabase not configured');

    // Strict validation
    const duration = Number(taskData.duration_minutes || 25);
    if (duration < 1 || duration > 45) throw new Error('Task duration must be between 1 and 45 minutes');

    const breakDuration = Number(taskData.break_duration_minutes || 5);
    if (breakDuration < 4 || breakDuration > 5) throw new Error('Short break must be between 4 and 5 minutes');

    const { data, error } = await this.client
      .from('tasks')
      .insert([{
        title: taskData.title.trim(),
        description: (taskData.description || '').trim(),
        duration_minutes: duration,
        break_duration_minutes: breakDuration,
        breaks_used: Math.min(2, Math.max(0, Number(taskData.breaks_used) || 0)),
        max_breaks: 2,
        status: taskData.status || 'New',
        scheduled_by: taskData.scheduled_by || 'Alex Mercer',
        priority: taskData.priority || 'Medium',
        scheduled_date: taskData.scheduled_date || null,
        scheduled_time: taskData.scheduled_time || null
      }])
      .select()
      .single();

    if (error) throw error;
    return { task: data, message: 'Task created in Supabase' };
  }

  async updateTask(id, taskData) {
    if (!this.isConfigured) throw new Error('Supabase not configured');

    const updatePayload = { ...taskData, updated_at: new Date().toISOString() };
    if (updatePayload.duration_minutes !== undefined) {
      const d = Number(updatePayload.duration_minutes);
      if (d < 1 || d > 45) throw new Error('Task duration must be between 1 and 45 minutes');
    }
    if (updatePayload.breaks_used !== undefined && Number(updatePayload.breaks_used) > 2) {
      throw new Error('Maximum breaks allowed cannot exceed 2 breaks.');
    }

    const { data, error } = await this.client
      .from('tasks')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { task: data, message: 'Task updated in Supabase' };
  }

  async deleteTask(id) {
    if (!this.isConfigured) throw new Error('Supabase not configured');
    const { error } = await this.client.from('tasks').delete().eq('id', id);
    if (error) throw error;
    return { success: true, id };
  }

  async recordBreak(id) {
    if (!this.isConfigured) throw new Error('Supabase not configured');

    const { data: current, error: fetchErr } = await this.client
      .from('tasks')
      .select('breaks_used')
      .eq('id', id)
      .single();

    if (fetchErr) throw fetchErr;
    if (current.breaks_used >= 2) throw new Error('Maximum break limit reached. Cannot exceed 2 breaks per task.');

    const { data, error } = await this.client
      .from('tasks')
      .update({
        breaks_used: current.breaks_used + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { task: data, message: 'Break recorded in Supabase' };
  }

  async repeatTask(id) {
    if (!this.isConfigured) throw new Error('Supabase not configured');
    const { data, error } = await this.client
      .from('tasks')
      .update({
        status: 'Repeat',
        breaks_used: 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { task: data, message: 'Task reset to Repeat in Supabase' };
  }

  // --- Chain Operations ---

  async getChains() {
    if (!this.isConfigured) throw new Error('Supabase not configured');

    const { data: chains, error } = await this.client
      .from('chains')
      .select(`
        *,
        chain_items (
          id, step_order, requires_break_after, break_duration_minutes,
          task_id,
          tasks ( id, title, description, duration_minutes, status, priority, scheduled_by )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Normalize chain items
    const normalized = chains.map(c => {
      const sortedItems = (c.chain_items || [])
        .sort((a, b) => a.step_order - b.step_order)
        .map(ci => ({
          item_id: ci.id,
          step_order: ci.step_order,
          requires_break_after: ci.requires_break_after ? 1 : 0,
          break_duration_minutes: ci.break_duration_minutes,
          task_id: ci.task_id,
          title: ci.tasks?.title || 'Task',
          description: ci.tasks?.description || '',
          duration_minutes: ci.tasks?.duration_minutes || 25,
          status: ci.tasks?.status || 'New',
          priority: ci.tasks?.priority || 'Medium',
          scheduled_by: ci.tasks?.scheduled_by || 'User'
        }));

      return {
        ...c,
        tasks: sortedItems
      };
    });

    return { chains: normalized };
  }

  async createChain(data) {
    if (!this.isConfigured) throw new Error('Supabase not configured');

    const taskIds = data.task_ids || [];
    if (!taskIds.length) throw new Error('At least 1 task must be assigned to the chain');
    if (taskIds.length > 3) throw new Error('Maximum task chain length is 3 dependent tasks');

    const breakDuration = Number(data.break_duration_minutes || 10);
    if (breakDuration < 10 || breakDuration > 15) throw new Error('Chain break duration must be between 10 and 15 minutes');

    // Fetch tasks
    const { data: tasks, error: taskErr } = await this.client
      .from('tasks')
      .select('*')
      .in('id', taskIds);

    if (taskErr) throw taskErr;

    // Order tasks by selection
    const orderedTasks = taskIds.map(id => tasks.find(t => String(t.id) === String(id))).filter(Boolean);

    let breaksCount = 0;
    let consecutiveTime = 0;
    const breakPlan = [];
    let totalTaskMins = 0;

    orderedTasks.forEach((t, i) => {
      totalTaskMins += t.duration_minutes;
      consecutiveTime += t.duration_minutes;
      if (i < orderedTasks.length - 1) {
        if (consecutiveTime >= 60 && breaksCount < 2) {
          breakPlan.push(true);
          breaksCount++;
          consecutiveTime = 0;
        } else {
          breakPlan.push(false);
        }
      } else {
        breakPlan.push(false);
      }
    });

    if (orderedTasks.length >= 2 && breaksCount === 0 && (orderedTasks[0].duration_minutes + orderedTasks[1].duration_minutes > 60)) {
      breakPlan[0] = true;
      breaksCount = 1;
    }

    const totalDuration = totalTaskMins + (breaksCount * breakDuration);
    if (totalDuration > 120) {
      throw new Error(`Total chain duration (${totalDuration}m) exceeds maximum 2 hours (120m) limit.`);
    }

    // Insert chain
    const { data: chain, error: chainErr } = await this.client
      .from('chains')
      .insert([{
        name: data.name.trim(),
        description: (data.description || '').trim(),
        created_by: data.created_by || 'Alex Mercer',
        priority: data.priority || 'High',
        status: 'New',
        total_duration_minutes: totalDuration,
        break_duration_minutes: breakDuration,
        breaks_count: breaksCount
      }])
      .select()
      .single();

    if (chainErr) throw chainErr;

    // Insert chain items
    const chainItemsPayload = orderedTasks.map((t, idx) => ({
      chain_id: chain.id,
      task_id: t.id,
      step_order: idx + 1,
      requires_break_after: breakPlan[idx] || false,
      break_duration_minutes: breakPlan[idx] ? breakDuration : 0
    }));

    const { error: itemsErr } = await this.client.from('chain_items').insert(chainItemsPayload);
    if (itemsErr) throw itemsErr;

    // Update tasks with chain_id
    for (let idx = 0; idx < orderedTasks.length; idx++) {
      await this.client.from('tasks').update({ chain_id: chain.id, chain_order: idx + 1 }).eq('id', orderedTasks[idx].id);
    }

    return { chain, message: 'Chain created in Supabase' };
  }

  async updateChainStatus(id, status) {
    if (!this.isConfigured) throw new Error('Supabase not configured');
    const { data, error } = await this.client
      .from('chains')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { chain: data };
  }

  async deleteChain(id) {
    if (!this.isConfigured) throw new Error('Supabase not configured');
    await this.client.from('tasks').update({ chain_id: null, chain_order: null }).eq('chain_id', id);
    const { error } = await this.client.from('chains').delete().eq('id', id);
    if (error) throw error;
    return { success: true, id };
  }

  // --- Notifications ---

  async getPendingNotifications() {
    if (!this.isConfigured) return { pending: [] };
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const { data, error } = await this.client
      .from('tasks')
      .select('*')
      .not('status', 'in', '("Completed","Canceled")')
      .eq('scheduled_date', dateStr)
      .lte('scheduled_time', timeStr);

    if (error) return { pending: [] };
    return { pending: data || [] };
  }

  async logNotification(taskId, title, priority, scheduledDatetime) {
    if (!this.isConfigured) return;
    await this.client.from('notifications_log').insert([{
      task_id: taskId,
      title,
      priority,
      scheduled_datetime: scheduledDatetime
    }]);
  }
}

window.supabaseService = new SupabaseService();
