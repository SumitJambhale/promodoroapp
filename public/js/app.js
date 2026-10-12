/**
 * Main Application Controller
 * Handles view switching, Task CRUD modal, filters, search, and themes.
 */

class PomodoroApp {
  constructor() {
    this.tasks = [];
    this.currentFilterStatus = 'All';
    this.currentFilterPriority = 'All';
    this.searchTerm = '';
    this.editingTaskId = null;
  }

  async init() {
    this.setupTheme();

    // Initialize Supabase Service
    if (window.supabaseService) {
      window.supabaseService.init();
      this.updateCloudStatusBadge();
    }

    this.bindEvents();
    await this.loadTasks();

    // Initialize sub-engines
    if (window.timerEngine) window.timerEngine.init();
    if (window.chainEngine) window.chainEngine.init();
    if (window.notificationEngine) window.notificationEngine.init();

    // Auto-load first active task if available
    if (this.tasks.length > 0 && window.timerEngine) {
      const firstActive = this.tasks.find(t => t.status === 'New' || t.status === 'Repeat') || this.tasks[0];
      window.timerEngine.loadTask(firstActive);
    }
  }

  updateCloudStatusBadge() {
    const pill = document.getElementById('btnOpenSupabaseModal');
    const text = document.getElementById('cloudStatusText');
    if (!pill || !text) return;

    if (window.supabaseService && window.supabaseService.isConfigured) {
      pill.classList.add('connected');
      text.textContent = 'Cloud: Supabase Live';
      text.title = `Connected to ${window.supabaseService.url}`;
    } else {
      pill.classList.remove('connected');
      text.textContent = 'Cloud: Local SQLite';
      text.title = 'Click to connect Supabase PostgreSQL backend';
    }
  }

  setupTheme() {
    const saved = localStorage.getItem('pomodoro-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    this.updateThemeIcon(saved);
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pomodoro-theme', next);
    this.updateThemeIcon(next);
  }

  updateThemeIcon(theme) {
    const btn = document.getElementById('btnThemeToggle');
    if (!btn) return;
    if (theme === 'dark') {
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
      btn.title = 'Switch to Light Mode';
    } else {
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
      btn.title = 'Switch to Dark Mode';
    }
  }

  bindEvents() {
    // Supabase Modal Triggers
    document.getElementById('btnOpenSupabaseModal')?.addEventListener('click', () => {
      const modal = document.getElementById('supabaseModal');
      if (!modal) return;
      document.getElementById('supabaseUrlInput').value = localStorage.getItem('pomodoro_supabase_url') || '';
      document.getElementById('supabaseKeyInput').value = localStorage.getItem('pomodoro_supabase_key') || '';
      document.getElementById('supabaseTestStatus').innerHTML = '';
      modal.classList.add('active');
    });

    document.getElementById('btnCloseSupabaseModal')?.addEventListener('click', () => {
      document.getElementById('supabaseModal')?.classList.remove('active');
    });

    // Test Supabase Connection
    document.getElementById('btnTestSupabaseConn')?.addEventListener('click', async () => {
      const url = document.getElementById('supabaseUrlInput').value.trim();
      const key = document.getElementById('supabaseKeyInput').value.trim();
      const statusEl = document.getElementById('supabaseTestStatus');

      if (!url || !key) {
        statusEl.innerHTML = `<span style="color: var(--accent-red);">Please enter both Project URL and Anon Key.</span>`;
        return;
      }

      statusEl.innerHTML = `<span style="color: var(--accent-blue);">Testing connection to Supabase...</span>`;
      const res = await window.supabaseService.testConnection(url, key);
      if (res.success) {
        statusEl.innerHTML = `<span style="color: var(--accent-green); font-weight: 600;">✓ Connected successfully to Supabase! Tasks table is accessible.</span>`;
      } else {
        statusEl.innerHTML = `<span style="color: var(--accent-red);">✗ Error: ${this.escapeHtml(res.error)}. Make sure you ran supabase/schema.sql in the SQL Editor.</span>`;
      }
    });

    // Save Supabase Connection
    document.getElementById('btnSaveSupabaseConn')?.addEventListener('click', async () => {
      const url = document.getElementById('supabaseUrlInput').value.trim();
      const key = document.getElementById('supabaseKeyInput').value.trim();
      const statusEl = document.getElementById('supabaseTestStatus');

      if (!url || !key) {
        statusEl.innerHTML = `<span style="color: var(--accent-red);">Please enter both Project URL and Anon Key.</span>`;
        return;
      }

      statusEl.innerHTML = `<span style="color: var(--accent-blue);">Connecting & synchronizing...</span>`;
      const testRes = await window.supabaseService.testConnection(url, key);
      if (!testRes.success) {
        statusEl.innerHTML = `<span style="color: var(--accent-red);">Cannot connect: ${this.escapeHtml(testRes.error)}</span>`;
        return;
      }

      window.supabaseService.configure(url, key);
      this.updateCloudStatusBadge();
      document.getElementById('supabaseModal')?.classList.remove('active');

      await this.loadTasks();
      if (window.chainEngine) window.chainEngine.loadChains();

      if (window.notificationEngine) {
        window.notificationEngine.showToast({
          title: 'Supabase Connected 🟢',
          description: 'Now persisting directly to your hosted PostgreSQL database with Realtime sync!',
          priority: 'High'
        });
      }
    });

    // Disconnect Supabase (Switch back to Local SQLite)
    document.getElementById('btnDisconnectSupabase')?.addEventListener('click', async () => {
      if (window.supabaseService) {
        window.supabaseService.disconnect();
        this.updateCloudStatusBadge();
        document.getElementById('supabaseModal')?.classList.remove('active');
        await this.loadTasks();
        if (window.chainEngine) window.chainEngine.loadChains();

        if (window.notificationEngine) {
          window.notificationEngine.showToast({
            title: 'Switched to Local Backend',
            description: 'Now using local SQLite database engine.',
            priority: 'Medium'
          });
        }
      }
    });

    // Theme button
    document.getElementById('btnThemeToggle')?.addEventListener('click', () => this.toggleTheme());

    // Navigation Tabs
    const tabBtns = document.querySelectorAll('.tab-nav-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetTab = btn.dataset.tab;
        this.switchTab(targetTab);
      });
    });

    // Search bar
    const searchInput = document.getElementById('taskSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchTerm = e.target.value.trim().toLowerCase();
        this.renderTasks();
      });
    }

    // Status filter pills
    const statusPills = document.querySelectorAll('.filter-status-pill');
    statusPills.forEach(pill => {
      pill.addEventListener('click', (e) => {
        statusPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.currentFilterStatus = pill.dataset.status;
        this.renderTasks();
      });
    });

    // Priority filter pills
    const priorityPills = document.querySelectorAll('.filter-priority-pill');
    priorityPills.forEach(pill => {
      pill.addEventListener('click', (e) => {
        priorityPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.currentFilterPriority = pill.dataset.priority;
        this.renderTasks();
      });
    });

    // Modal Triggers
    document.getElementById('btnOpenCreateTask')?.addEventListener('click', () => this.openTaskModal());
    document.getElementById('btnCloseTaskModal')?.addEventListener('click', () => this.closeTaskModal());
    document.getElementById('btnCancelTaskModal')?.addEventListener('click', () => this.closeTaskModal());
    document.getElementById('taskForm')?.addEventListener('submit', (e) => this.handleTaskFormSubmit(e));

    // Chain Modal Triggers
    document.getElementById('btnOpenCreateChain')?.addEventListener('click', () => {
      if (window.chainEngine) window.chainEngine.openCreateChainModal();
    });
    document.getElementById('btnCloseChainModal')?.addEventListener('click', () => {
      if (window.chainEngine) window.chainEngine.closeCreateChainModal();
    });
    document.getElementById('btnCancelChainModal')?.addEventListener('click', () => {
      if (window.chainEngine) window.chainEngine.closeCreateChainModal();
    });
    document.getElementById('btnSaveChain')?.addEventListener('click', () => {
      if (window.chainEngine) window.chainEngine.saveNewChain();
    });

    // Chain Task selectors change listeners for dynamic recalculation
    ['chainTaskSelect1', 'chainTaskSelect2', 'chainTaskSelect3', 'chainBreakDurationInput'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => {
        if (window.chainEngine) window.chainEngine.calculateChainPreview();
      });
    });

    // Modal duration slider
    const modalSlider = document.getElementById('taskDurationInput');
    const modalSliderVal = document.getElementById('modalDurationValue');
    if (modalSlider && modalSliderVal) {
      modalSlider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        if (val > 45) {
          modalSlider.value = 45;
          modalSliderVal.textContent = '45 min (Max limit)';
        } else {
          modalSliderVal.textContent = `${val} min`;
        }
      });
    }

    // Alert Test Buttons
    document.querySelectorAll('.btn-test-alert').forEach(btn => {
      btn.addEventListener('click', () => {
        const priority = btn.dataset.priority;
        if (window.soundEngine) window.soundEngine.playPriorityAlert(priority);
        if (window.notificationEngine) {
          window.notificationEngine.showToast({
            title: `${priority} Priority Test Alert`,
            description: `Auditioning ${priority} acoustic tone and visual alert styling.`,
            priority: priority,
            urgent: priority === 'High'
          });
        }
      });
    });
  }

  switchTab(tabId) {
    document.querySelectorAll('.tab-nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabId);
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-${tabId}`);
    });
  }

  async loadTasks() {
    try {
      const data = await window.API.getTasks();
      this.tasks = data.tasks || [];
      this.renderTasks();
      this.renderScheduledTasksList();
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  }

  renderTasks() {
    const listContainer = document.getElementById('taskListContainer');
    if (!listContainer) return;

    let filtered = this.tasks;

    // Filter by status
    if (this.currentFilterStatus !== 'All') {
      filtered = filtered.filter(t => t.status === this.currentFilterStatus);
    }

    // Filter by priority
    if (this.currentFilterPriority !== 'All') {
      filtered = filtered.filter(t => t.priority === this.currentFilterPriority);
    }

    // Filter by search term
    if (this.searchTerm) {
      filtered = filtered.filter(t =>
        (t.title && t.title.toLowerCase().includes(this.searchTerm)) ||
        (t.description && t.description.toLowerCase().includes(this.searchTerm)) ||
        (t.scheduled_by && t.scheduled_by.toLowerCase().includes(this.searchTerm))
      );
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          </div>
          <div>No tasks found</div>
          <p style="font-size: 0.85rem;">Try adjusting your filters or create a new Pomodoro task.</p>
        </div>
      `;
      return;
    }

    const activeTaskId = window.timerEngine?.currentTask?.id;

    listContainer.innerHTML = filtered.map(t => {
      const isActive = activeTaskId === t.id;
      const breaksUsed = t.breaks_used || 0;
      const breaksLeft = 2 - breaksUsed;
      const isBreakDisabled = breaksUsed >= 2;

      return `
        <div class="glass-panel task-card priority-${t.priority} status-${t.status} ${isActive ? 'active-running' : ''}" id="task-card-${t.id}">
          <div class="task-main-info">
            <div class="task-title-row">
              <span class="task-heading">${this.escapeHtml(t.title)}</span>
              <span class="badge badge-priority-${t.priority}">${t.priority}</span>
              <span class="badge badge-status-${t.status}">${t.status}</span>
              ${t.chain_id ? `<span class="badge" style="background: rgba(191, 90, 242, 0.15); color: var(--accent-purple); border: 1px solid rgba(191, 90, 242, 0.3);">⛓️ Chain Item #${t.chain_order || ''}</span>` : ''}
            </div>

            ${t.description ? `<p class="task-description">${this.escapeHtml(t.description)}</p>` : ''}

            <div class="task-meta-bar">
              <div class="meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span><strong>${t.duration_minutes}m</strong> Focus</span>
              </div>
              <div class="meta-item">
                <span class="badge badge-break ${breaksUsed >= 2 ? 'break-limit' : ''}">
                  ☕ Breaks: ${breaksUsed}/2 ${breaksUsed >= 2 ? '(Limit Reached)' : `(${t.break_duration_minutes || 5}m)`}
                </span>
              </div>
              <div class="meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>By: <strong>${this.escapeHtml(t.scheduled_by || 'User')}</strong></span>
              </div>
              ${t.scheduled_date && t.scheduled_time ? `
                <div class="meta-item" style="color: var(--accent-blue);">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span>📅 ${t.scheduled_date} at <strong>${t.scheduled_time}</strong></span>
                </div>
              ` : ''}
            </div>
          </div>

          <div class="task-actions">
            <!-- Start Focus Button -->
            <button class="btn-primary" style="padding: 8px 14px; font-size: 0.85rem;" title="Start Focus Timer" onclick="window.app.startTaskFocus(${t.id})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <span>Focus</span>
            </button>

            <!-- Short Break Button (Max 2 breaks) -->
            <button class="btn-secondary btn-break" style="padding: 8px 12px; font-size: 0.82rem;" 
                    ${isBreakDisabled ? 'disabled title="Max 2 breaks used for this task"' : 'title="Take 4-5 min break"'}
                    onclick="window.app.takeTaskBreak(${t.id})">
              ☕ Break
            </button>

            <!-- Status Quick Toggle / Dropdown -->
            <select class="form-select" style="width: auto; padding: 6px 10px; font-size: 0.8rem;" onchange="window.app.changeTaskStatus(${t.id}, this.value)">
              <option value="New" ${t.status === 'New' ? 'selected' : ''}>New</option>
              <option value="Completed" ${t.status === 'Completed' ? 'selected' : ''}>Completed</option>
              <option value="Canceled" ${t.status === 'Canceled' ? 'selected' : ''}>Canceled</option>
              <option value="Repeat" ${t.status === 'Repeat' ? 'selected' : ''}>Repeat</option>
            </select>

            <!-- Edit Button -->
            <button class="btn-icon" title="Edit Task" onclick="window.app.editTask(${t.id})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>

            <!-- Delete Button -->
            <button class="btn-icon" title="Delete Task" onclick="window.app.deleteTask(${t.id})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  renderScheduledTasksList() {
    const container = document.getElementById('scheduledTaskListContainer');
    if (!container) return;

    const scheduled = this.tasks.filter(t => t.scheduled_date && t.scheduled_time);
    if (scheduled.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div>No tasks scheduled with specific date and timer</div>
          <p style="font-size: 0.85rem;">Set a date & timer when creating or editing a task to receive priority alerts.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = scheduled.map(t => `
      <div class="glass-panel" style="padding: 14px 18px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 600; display: flex; align-items: center; gap: 8px;">
            <span>${this.escapeHtml(t.title)}</span>
            <span class="badge badge-priority-${t.priority}">${t.priority} Priority</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
            ⏰ Scheduled: <strong>${t.scheduled_date} at ${t.scheduled_time}</strong> • Scheduled by: ${this.escapeHtml(t.scheduled_by || 'User')}
          </div>
        </div>
        <button class="btn-primary" style="padding: 6px 14px; font-size: 0.8rem;" onclick="window.app.startTaskFocus(${t.id})">
          Start Focus
        </button>
      </div>
    `).join('');
  }

  startTaskFocus(id) {
    const task = this.tasks.find(t => t.id === id);
    if (!task) return;
    if (window.timerEngine) {
      window.timerEngine.loadTask(task);
      window.timerEngine.start();
    }
  }

  async takeTaskBreak(id) {
    const task = this.tasks.find(t => t.id === id);
    if (!task) return;
    if (window.timerEngine) {
      window.timerEngine.loadTask(task);
      window.timerEngine.triggerShortBreak();
    }
  }

  async changeTaskStatus(id, newStatus) {
    try {
      if (newStatus === 'Repeat') {
        await window.API.repeatTask(id);
      } else {
        await window.API.updateTask(id, { status: newStatus });
      }
      await this.loadTasks();
      if (window.notificationEngine) {
        window.notificationEngine.showToast({
          title: 'Status Updated',
          description: `Task status changed to ${newStatus}.`,
          priority: 'Low'
        });
      }
    } catch (err) {
      alert(err.message || 'Failed to update status');
    }
  }

  openTaskModal(task = null) {
    const modal = document.getElementById('taskModal');
    if (!modal) return;

    this.editingTaskId = task ? task.id : null;
    const titleEl = document.getElementById('modalTaskHeading');
    titleEl.textContent = task ? 'Edit Task' : 'New Pomodoro Task';

    // Populate inputs
    document.getElementById('taskTitleInput').value = task ? task.title : '';
    document.getElementById('taskDescInput').value = task ? (task.description || '') : '';
    
    // Duration: 1 to 45 mins
    const duration = task ? task.duration_minutes : 25;
    const slider = document.getElementById('taskDurationInput');
    const sliderVal = document.getElementById('modalDurationValue');
    slider.value = duration;
    sliderVal.textContent = `${duration} min`;

    // Break duration: 4 to 5 mins
    document.getElementById('taskBreakDurationSelect').value = task ? (task.break_duration_minutes || 5) : 5;

    // Priority
    document.getElementById('taskPrioritySelect').value = task ? task.priority : 'Medium';

    // Status
    document.getElementById('taskStatusSelect').value = task ? task.status : 'New';

    // Scheduled by
    document.getElementById('taskScheduledByInput').value = task ? (task.scheduled_by || 'Alex Mercer') : 'Alex Mercer';

    // Scheduled Date & Time
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('taskScheduleDateInput').value = task ? (task.scheduled_date || today) : today;
    document.getElementById('taskScheduleTimeInput').value = task ? (task.scheduled_time || '') : '';

    modal.classList.add('active');
  }

  closeTaskModal() {
    const modal = document.getElementById('taskModal');
    if (modal) modal.classList.remove('active');
    this.editingTaskId = null;
  }

  editTask(id) {
    const task = this.tasks.find(t => t.id === id);
    if (task) this.openTaskModal(task);
  }

  async deleteTask(id) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await window.API.deleteTask(id);
      await this.loadTasks();
      if (window.chainEngine) window.chainEngine.loadChains();
      if (window.notificationEngine) {
        window.notificationEngine.showToast({
          title: 'Task Deleted',
          description: 'The task has been permanently removed.',
          priority: 'Low'
        });
      }
    } catch (err) {
      alert(err.message || 'Failed to delete task');
    }
  }

  async handleTaskFormSubmit(e) {
    e.preventDefault();

    const title = document.getElementById('taskTitleInput').value.trim();
    if (!title) {
      alert('Please provide a heading/title for the task.');
      return;
    }

    const duration = Number(document.getElementById('taskDurationInput').value);
    if (duration < 1 || duration > 45) {
      alert('Task timer value must be between 1 and 45 minutes.');
      return;
    }

    const breakDuration = Number(document.getElementById('taskBreakDurationSelect').value);
    if (breakDuration < 4 || breakDuration > 5) {
      alert('Short break duration must be 4 or 5 minutes.');
      return;
    }

    const data = {
      title,
      description: document.getElementById('taskDescInput').value.trim(),
      duration_minutes: duration,
      break_duration_minutes: breakDuration,
      priority: document.getElementById('taskPrioritySelect').value,
      status: document.getElementById('taskStatusSelect').value,
      scheduled_by: document.getElementById('taskScheduledByInput').value.trim() || 'Alex Mercer',
      scheduled_date: document.getElementById('taskScheduleDateInput').value || null,
      scheduled_time: document.getElementById('taskScheduleTimeInput').value || null
    };

    try {
      if (this.editingTaskId) {
        await window.API.updateTask(this.editingTaskId, data);
        if (window.notificationEngine) {
          window.notificationEngine.showToast({
            title: 'Task Updated',
            description: `"${title}" has been saved.`,
            priority: data.priority
          });
        }
      } else {
        await window.API.createTask(data);
        if (window.notificationEngine) {
          window.notificationEngine.showToast({
            title: 'Task Created',
            description: `"${title}" added to your focus list.`,
            priority: data.priority
          });
        }
      }

      this.closeTaskModal();
      await this.loadTasks();
    } catch (err) {
      alert(err.message || 'Error saving task');
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.app = new PomodoroApp();
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
