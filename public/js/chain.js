/**
 * Chain Management and Dependent Task Runner Engine
 * Enforces:
 * 1. Maximum 3 tasks in a chain
 * 2. Consecutive task time > 1 hour triggers a mandatory 10-15 minute break
 * 3. Total chain duration strictly <= 2 hours (120 minutes)
 * 4. Maximum breaks allowed in chain is 2 breaks (each 10-15 mins)
 */

class ChainEngine {
  constructor() {
    this.chains = [];
    this.activeChain = null;
    this.activeStepIndex = 0; // index in the sequence of task / break nodes
    this.chainRunnerInterval = null;
    this.remainingSeconds = 0;
    this.totalSeconds = 0;
    this.runnerState = 'idle'; // 'idle' | 'running' | 'paused'
    this.activeNode = null; // { type: 'task' | 'break', title, duration_minutes, task_id }
  }

  init() {
    this.loadChains();
  }

  async loadChains() {
    try {
      const data = await window.API.getChains();
      this.chains = data.chains || [];
      this.renderChains();
    } catch (err) {
      console.error('Failed to load chains:', err);
    }
  }

  renderChains() {
    const listContainer = document.getElementById('chainListContainer');
    if (!listContainer) return;

    if (this.chains.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </div>
          <div>No Task Chains Created Yet</div>
          <p style="font-size: 0.85rem; max-width: 360px;">Link up to 3 dependent tasks together into an automated focus flow with smart rest intervals.</p>
          <button class="btn-primary" onclick="window.chainEngine.openCreateChainModal()">+ Create First Chain</button>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = this.chains.map(chain => {
      const isRunningThis = this.activeChain && this.activeChain.id === chain.id;
      
      // Build pipeline visualization nodes
      const stepsHtml = [];
      let consecutiveMins = 0;
      let breakCount = 0;

      chain.tasks.forEach((task, idx) => {
        stepsHtml.push(`
          <div class="timeline-step ${isRunningThis && this.activeNode && this.activeNode.task_id === task.task_id ? 'active' : ''}">
            <span class="step-order-badge">Step ${idx + 1}</span>
            <span class="step-title" title="${this.escapeHtml(task.title)}">${this.escapeHtml(task.title)}</span>
            <span class="step-duration">${task.duration_minutes}m • ${task.priority} Priority</span>
          </div>
        `);

        if (task.requires_break_after && idx < chain.tasks.length - 1) {
          stepsHtml.push(`
            <div class="timeline-connector">➔</div>
            <div class="break-node ${isRunningThis && this.activeNode && this.activeNode.type === 'break' && this.activeNode.breakAfterStep === idx ? 'active' : ''}">
              ☕ Auto Break (${task.break_duration_minutes || chain.break_duration_minutes}m)
            </div>
            <div class="timeline-connector">➔</div>
          `);
        } else if (idx < chain.tasks.length - 1) {
          stepsHtml.push(`<div class="timeline-connector">➔</div>`);
        }
      });

      return `
        <div class="glass-panel chain-card ${isRunningThis ? 'active-running' : ''}" id="chain-card-${chain.id}">
          <div class="chain-top-row">
            <div>
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                <span class="chain-name">${this.escapeHtml(chain.name)}</span>
                <span class="badge badge-priority-${chain.priority}">${chain.priority}</span>
                <span class="badge badge-status-${chain.status.replace(/\s+/g, '')}">${chain.status}</span>
              </div>
              <p class="chain-desc">${this.escapeHtml(chain.description || 'Dependent task chain sequence')}</p>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              ${isRunningThis ? `
                <button class="btn-primary" style="background: var(--accent-orange);" onclick="window.chainEngine.pauseOrResumeChain()">
                  ${this.runnerState === 'running' ? 'Pause Chain' : 'Resume Chain'}
                </button>
                <button class="btn-secondary" onclick="window.chainEngine.stopChainRunner()">Stop</button>
              ` : `
                <button class="btn-primary" onclick="window.chainEngine.startChain(${chain.id})">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  <span>Run Chain</span>
                </button>
                <button class="btn-icon" title="Delete Chain" onclick="window.chainEngine.deleteChain(${chain.id})">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              `}
            </div>
          </div>

          <!-- Chain Meta Details -->
          <div style="display: flex; gap: 16px; margin-bottom: 14px; font-size: 0.8rem; color: var(--text-secondary); flex-wrap: wrap;">
            <span>📋 Tasks: <strong>${chain.tasks.length}/3 max</strong></span>
            <span>⏱️ Total Duration: <strong>${chain.total_duration_minutes}m / 120m max</strong></span>
            <span>☕ Breaks: <strong>${chain.breaks_count}/2 max (${chain.break_duration_minutes}m each)</strong></span>
            <span>👤 Creator: <strong>${this.escapeHtml(chain.created_by)}</strong></span>
          </div>

          <!-- Interactive Visual Pipeline -->
          <div class="chain-timeline">
            ${stepsHtml.join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  openCreateChainModal() {
    const modal = document.getElementById('createChainModal');
    if (!modal) return;

    // Populate task selectors from current available tasks
    const select1 = document.getElementById('chainTaskSelect1');
    const select2 = document.getElementById('chainTaskSelect2');
    const select3 = document.getElementById('chainTaskSelect3');

    const tasks = window.app ? window.app.tasks : [];
    const optionsHtml = `<option value="">-- None / Select Task --</option>` +
      tasks.map(t => `<option value="${t.id}" data-duration="${t.duration_minutes}" data-title="${this.escapeHtml(t.title)}">${this.escapeHtml(t.title)} (${t.duration_minutes}m)</option>`).join('');

    select1.innerHTML = optionsHtml;
    select2.innerHTML = optionsHtml;
    select3.innerHTML = optionsHtml;

    // Reset fields
    document.getElementById('chainNameInput').value = '';
    document.getElementById('chainDescInput').value = '';
    document.getElementById('chainBreakDurationInput').value = '10';

    this.calculateChainPreview();
    modal.classList.add('active');
  }

  closeCreateChainModal() {
    const modal = document.getElementById('createChainModal');
    if (modal) modal.classList.remove('active');
  }

  calculateChainPreview() {
    const s1 = document.getElementById('chainTaskSelect1');
    const s2 = document.getElementById('chainTaskSelect2');
    const s3 = document.getElementById('chainTaskSelect3');
    const breakInput = document.getElementById('chainBreakDurationInput');
    const previewContainer = document.getElementById('chainValidationPreview');
    const saveBtn = document.getElementById('btnSaveChain');

    const breakMins = Math.min(15, Math.max(10, Number(breakInput.value) || 10));

    const selectedTasks = [];
    if (s1.value) selectedTasks.push({ id: s1.value, opt: s1.selectedOptions[0] });
    if (s2.value) selectedTasks.push({ id: s2.value, opt: s2.selectedOptions[0] });
    if (s3.value) selectedTasks.push({ id: s3.value, opt: s3.selectedOptions[0] });

    if (selectedTasks.length === 0) {
      previewContainer.innerHTML = `<span style="color: var(--text-tertiary);">Select at least 1 task (maximum 3 dependent tasks).</span>`;
      saveBtn.disabled = true;
      return;
    }

    let totalTaskMins = 0;
    const taskDetails = selectedTasks.map((t, idx) => {
      const dur = Number(t.opt.dataset.duration) || 25;
      totalTaskMins += dur;
      return { id: t.id, title: t.opt.dataset.title, duration: dur, index: idx };
    });

    // Check consecutive time: if >= 60m, add break
    let consecutiveMins = 0;
    let breaksInserted = 0;
    const plan = [];

    taskDetails.forEach((td, i) => {
      consecutiveMins += td.duration;
      if (i < taskDetails.length - 1) {
        if (consecutiveMins >= 60 && breaksInserted < 2) {
          plan.push(true);
          breaksInserted++;
          consecutiveMins = 0;
        } else {
          plan.push(false);
        }
      } else {
        plan.push(false);
      }
    });

    if (taskDetails.length >= 2 && breaksInserted === 0 && (taskDetails[0].duration + taskDetails[1].duration > 60)) {
      plan[0] = true;
      breaksInserted = 1;
    }

    const totalChainMins = totalTaskMins + (breaksInserted * breakMins);
    const exceedsLimit = totalChainMins > 120;

    let html = `
      <div style="padding: 12px; border-radius: var(--radius-md); background: var(--bg-tertiary); font-size: 0.85rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span>Tasks: <strong>${taskDetails.length} of 3 max</strong></span>
          <span>Breaks: <strong>${breaksInserted} of 2 max (${breaksInserted * breakMins}m)</strong></span>
          <span style="color: ${exceedsLimit ? 'var(--accent-red)' : 'var(--accent-green)'}; font-weight: 700;">
            Total: ${totalChainMins}m / 120m max
          </span>
        </div>
        ${breaksInserted > 0 ? `
          <div style="color: var(--accent-orange); font-size: 0.78rem; margin-top: 4px;">
            ⚡ Consecutive task time > 60 min detected: ${breaksInserted} rest interval(s) of ${breakMins}m auto-inserted.
          </div>
        ` : ''}
        ${exceedsLimit ? `
          <div style="color: var(--accent-red); font-weight: 600; margin-top: 6px;">
            ⚠️ Chain duration (${totalChainMins}m) exceeds the 2 hours (120m) maximum limit. Please reduce task durations.
          </div>
        ` : ''}
      </div>
    `;

    previewContainer.innerHTML = html;
    saveBtn.disabled = exceedsLimit || taskDetails.length === 0;
  }

  async saveNewChain() {
    const name = document.getElementById('chainNameInput').value.trim();
    const desc = document.getElementById('chainDescInput').value.trim();
    const s1 = document.getElementById('chainTaskSelect1').value;
    const s2 = document.getElementById('chainTaskSelect2').value;
    const s3 = document.getElementById('chainTaskSelect3').value;
    const priority = document.getElementById('chainPrioritySelect').value;
    const breakDuration = Number(document.getElementById('chainBreakDurationInput').value) || 10;
    const createdBy = document.getElementById('chainCreatorInput').value.trim() || 'Alex Mercer';

    if (!name) {
      alert('Please enter a chain name.');
      return;
    }

    const task_ids = [];
    if (s1) task_ids.push(Number(s1));
    if (s2) task_ids.push(Number(s2));
    if (s3) task_ids.push(Number(s3));

    if (task_ids.length === 0) {
      alert('Please select at least 1 task.');
      return;
    }

    try {
      await window.API.createChain({
        name,
        description: desc,
        created_by: createdBy,
        priority,
        break_duration_minutes: breakDuration,
        task_ids
      });

      this.closeCreateChainModal();
      await this.loadChains();

      if (window.notificationEngine) {
        window.notificationEngine.showToast({
          title: 'Chain Created Successfully',
          description: `Chain "${name}" saved to database.`,
          priority: 'High'
        });
      }
    } catch (err) {
      alert(err.message || 'Error creating chain');
    }
  }

  async deleteChain(id) {
    if (!confirm('Are you sure you want to delete this dependent task chain?')) return;
    try {
      await window.API.deleteChain(id);
      await this.loadChains();
      if (this.activeChain && this.activeChain.id === id) {
        this.stopChainRunner();
      }
    } catch (err) {
      alert(err.message || 'Error deleting chain');
    }
  }

  // Chain Execution Engine
  async startChain(chainId) {
    const chain = this.chains.find(c => c.id === chainId);
    if (!chain) return;

    this.activeChain = chain;
    await window.API.updateChainStatus(chainId, 'In Progress');
    chain.status = 'In Progress';

    // Build the execution node sequence:
    // [ { type: 'task', task }, { type: 'break', duration }, ... ]
    this.executionSequence = [];
    chain.tasks.forEach((task, idx) => {
      this.executionSequence.push({
        type: 'task',
        title: task.title,
        duration_minutes: task.duration_minutes,
        task_id: task.task_id,
        priority: task.priority,
        scheduled_by: task.scheduled_by,
        stepIndex: idx + 1
      });

      if (task.requires_break_after && idx < chain.tasks.length - 1) {
        this.executionSequence.push({
          type: 'break',
          title: `Inter-task Break (${task.break_duration_minutes || chain.break_duration_minutes}m)`,
          duration_minutes: task.break_duration_minutes || chain.break_duration_minutes,
          breakAfterStep: idx
        });
      }
    });

    this.activeStepIndex = 0;
    this.executeCurrentChainStep();
    this.renderChains();
  }

  executeCurrentChainStep() {
    if (this.activeStepIndex >= this.executionSequence.length) {
      this.completeChain();
      return;
    }

    const node = this.executionSequence[this.activeStepIndex];
    this.activeNode = node;
    this.runnerState = 'running';

    this.totalSeconds = node.duration_minutes * 60;
    this.remainingSeconds = this.totalSeconds;

    // Load into master timer if it's a task
    if (node.type === 'task') {
      if (window.soundEngine) window.soundEngine.playPriorityAlert(node.priority);
      if (window.timerEngine) {
        window.timerEngine.loadTask({
          id: node.task_id,
          title: node.title,
          duration_minutes: node.duration_minutes,
          priority: node.priority,
          scheduled_by: node.scheduled_by
        });
        window.timerEngine.start();
      }
    } else {
      // It's a mandatory break
      if (window.soundEngine) window.soundEngine.playBreakStart();
      if (window.timerEngine) {
        window.timerEngine.mode = 'break';
        window.timerEngine.totalSeconds = node.duration_minutes * 60;
        window.timerEngine.remainingSeconds = window.timerEngine.totalSeconds;
        window.timerEngine.start();
      }
      if (window.notificationEngine) {
        window.notificationEngine.showToast({
          title: 'Mandatory Rest Interval',
          description: `Consecutive focus time > 60m. Enjoy ${node.duration_minutes}m break!`,
          priority: 'Medium'
        });
      }
    }

    this.renderChains();
    this.startChainInterval();
  }

  startChainInterval() {
    if (this.chainRunnerInterval) clearInterval(this.chainRunnerInterval);
    this.chainRunnerInterval = setInterval(() => {
      if (this.remainingSeconds > 0) {
        this.remainingSeconds--;
      } else {
        clearInterval(this.chainRunnerInterval);
        this.onStepFinished();
      }
    }, 1000);
  }

  async onStepFinished() {
    const finishedNode = this.activeNode;
    if (finishedNode.type === 'task') {
      if (window.soundEngine) window.soundEngine.playTaskComplete();
      try {
        await window.API.updateTask(finishedNode.task_id, { status: 'Completed' });
        if (window.app) window.app.loadTasks();
      } catch (e) {}
    } else {
      if (window.soundEngine) window.soundEngine.playBreakFinished();
    }

    this.activeStepIndex++;
    this.executeCurrentChainStep();
  }

  pauseOrResumeChain() {
    if (this.runnerState === 'running') {
      this.runnerState = 'paused';
      clearInterval(this.chainRunnerInterval);
      if (window.timerEngine) window.timerEngine.pause();
    } else {
      this.runnerState = 'running';
      this.startChainInterval();
      if (window.timerEngine) window.timerEngine.start();
    }
    this.renderChains();
  }

  async completeChain() {
    clearInterval(this.chainRunnerInterval);
    this.chainRunnerInterval = null;
    this.runnerState = 'idle';

    if (window.soundEngine) window.soundEngine.playTaskComplete();

    if (this.activeChain) {
      await window.API.updateChainStatus(this.activeChain.id, 'Completed');
      this.activeChain.status = 'Completed';
    }

    if (window.notificationEngine) {
      window.notificationEngine.showToast({
        title: 'Task Chain Completed! 🚀',
        description: `All dependent tasks in "${this.activeChain ? this.activeChain.name : 'Chain'}" are complete!`,
        priority: 'High'
      });
    }

    this.activeChain = null;
    this.activeNode = null;
    this.renderChains();
  }

  stopChainRunner() {
    clearInterval(this.chainRunnerInterval);
    this.chainRunnerInterval = null;
    this.runnerState = 'idle';
    this.activeChain = null;
    this.activeNode = null;
    if (window.timerEngine) window.timerEngine.reset();
    this.renderChains();
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

window.chainEngine = new ChainEngine();
