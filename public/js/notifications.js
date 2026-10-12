/**
 * Priority Notification Engine
 * Handles scheduled task alerts based on Priority (High / Medium / Low)
 * with distinctive Web Audio acoustic signals, Apple-styled toasts, and Desktop Notifications.
 */
class NotificationEngine {
  constructor() {
    this.intervalId = null;
    this.notifiedSet = new Set();
    this.hasRequestedPermission = false;
  }

  init() {
    this.requestPermission();
    this.startSchedulerWatch();
  }

  requestPermission() {
    if ('Notification' in window && Notification.permission === 'default' && !this.hasRequestedPermission) {
      this.hasRequestedPermission = true;
      Notification.requestPermission().catch(() => {});
    }
  }

  startSchedulerWatch() {
    if (this.intervalId) clearInterval(this.intervalId);
    // Poll every 5 seconds for scheduled tasks due now
    this.intervalId = setInterval(() => this.checkScheduledTasks(), 5000);
    // Also run immediately
    this.checkScheduledTasks();
  }

  async checkScheduledTasks() {
    try {
      const data = await window.API.getPendingNotifications();
      if (!data || !data.pending || data.pending.length === 0) return;

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];

      for (const task of data.pending) {
        const uniqueKey = `${task.id}_${task.scheduled_date}_${task.scheduled_time}`;
        if (!this.notifiedSet.has(uniqueKey)) {
          this.notifiedSet.add(uniqueKey);
          this.triggerPriorityAlert(task);
          // Log notification to backend
          window.API.logNotification(
            task.id,
            task.title,
            task.priority,
            `${task.scheduled_date} ${task.scheduled_time}`
          ).catch(() => {});
        }
      }
    } catch (err) {
      // Backend polling error silenced for seamless UX
    }
  }

  triggerPriorityAlert(task) {
    const { title, priority, scheduled_time, scheduled_by } = task;

    // 1. Play priority sound
    if (window.soundEngine) {
      window.soundEngine.playPriorityAlert(priority);
    }

    // 2. Display Apple-styled In-App Banner/Toast
    this.showToast({
      title: `${priority} Priority Alert: ${title}`,
      description: `Scheduled for ${scheduled_time} by ${scheduled_by || 'User'}. Focus time is now!`,
      priority: priority,
      urgent: priority === 'High',
      taskId: task.id
    });

    // 3. Desktop Notification (if permitted)
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(`[${priority} Priority] ${title}`, {
          body: `Scheduled for ${scheduled_time}. Start your Pomodoro task now!`,
          icon: '/favicon.ico',
          requireInteraction: priority === 'High'
        });
        notif.onclick = () => {
          window.focus();
          if (window.timerEngine) {
            window.timerEngine.loadTask(task);
          }
        };
      } catch (e) {}
    }
  }

  showToast({ title, description, priority, urgent = false, taskId = null }) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-alert ${urgent ? 'urgent' : ''}`;

    const priorityClass = priority.toLowerCase();
    const iconSvg = priority === 'High'
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
      : priority === 'Medium'
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

    toast.innerHTML = `
      <div class="toast-icon ${priorityClass}">
        ${iconSvg}
      </div>
      <div class="toast-content">
        <div class="toast-title">${this.escapeHtml(title)}</div>
        <div class="toast-desc">${this.escapeHtml(description)}</div>
        ${taskId ? `<button class="btn-primary" style="padding: 4px 12px; font-size: 0.75rem; margin-top: 8px;" onclick="window.timerEngine && window.timerEngine.loadTaskById(${taskId})">Start Timer</button>` : ''}
      </div>
      <button class="toast-close" aria-label="Close">&times;</button>
    `;

    container.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('show'), 20);

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    });

    // Auto dismiss (High priority stays longer: 10s, others: 5s)
    const timeoutDuration = priority === 'High' ? 10000 : 5000;
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }
    }, timeoutDuration);
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

window.notificationEngine = new NotificationEngine();
