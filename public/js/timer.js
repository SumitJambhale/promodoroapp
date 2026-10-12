/**
 * Pomodoro Core Timer Engine
 * - Strict 1 to 45 minutes task duration limit enforcement
 * - Short break of 4-5 minutes, with max 2 breaks enforcement
 * - Circular SVG progress stroke animation & Apple HIG haptics
 */
class PomodoroTimer {
  constructor() {
    this.currentTask = null;
    this.mode = 'focus'; // 'focus' | 'break'
    this.state = 'idle'; // 'idle' | 'running' | 'paused'
    
    this.totalSeconds = 25 * 60;
    this.remainingSeconds = 25 * 60;
    this.breakDurationMinutes = 5; // 4 to 5 minutes
    this.breaksUsed = 0;
    this.maxBreaks = 2; // Strict max 2 breaks rule
    
    this.timerInterval = null;
    this.circleRadius = 120;
    this.circleCircumference = 2 * Math.PI * this.circleRadius;

    // DOM Elements cache
    this.dom = {};
  }

  init() {
    this.cacheDom();
    this.bindEvents();
    this.updateCircleProgress(1);
    this.renderTime();
  }

  cacheDom() {
    this.dom.progressCircle = document.getElementById('timerProgressCircle');
    this.dom.timeDisplay = document.getElementById('timerCountdown');
    this.dom.stateLabel = document.getElementById('timerStateLabel');
    this.dom.breakStatus = document.getElementById('timerBreakStatus');
    this.dom.btnToggle = document.getElementById('btnTimerToggle');
    this.dom.btnBreak = document.getElementById('btnTimerBreak');
    this.dom.btnReset = document.getElementById('btnTimerReset');
    this.dom.activeTaskTitle = document.getElementById('activeTaskTitle');
    this.dom.dynamicIsland = document.getElementById('dynamicIsland');
    this.dom.islandText = document.getElementById('islandStatusText');
    this.dom.durationSlider = document.getElementById('timerDurationSlider');
    this.dom.sliderValueBadge = document.getElementById('sliderValueBadge');
    this.dom.presetBtns = document.querySelectorAll('.preset-btn');
  }

  bindEvents() {
    if (this.dom.btnToggle) {
      this.dom.btnToggle.addEventListener('click', () => this.toggle());
    }
    if (this.dom.btnBreak) {
      this.dom.btnBreak.addEventListener('click', () => this.triggerShortBreak());
    }
    if (this.dom.btnReset) {
      this.dom.btnReset.addEventListener('click', () => this.reset());
    }

    // Preset Buttons
    if (this.dom.presetBtns) {
      this.dom.presetBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const val = Number(e.target.dataset.mins);
          this.setDuration(val);
        });
      });
    }

    // Slider
    if (this.dom.durationSlider) {
      this.dom.durationSlider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        this.setDuration(val, false);
      });
    }
  }

  setDuration(minutes, updateSlider = true) {
    // Strict Validation: Not more than 45 minutes
    if (minutes > 45) {
      minutes = 45;
      if (window.notificationEngine) {
        window.notificationEngine.showToast({
          title: 'Duration Limit',
          description: 'Task timer cannot exceed 45 minutes.',
          priority: 'Medium'
        });
      }
    }
    if (minutes < 1) minutes = 1;

    if (this.mode === 'focus') {
      this.totalSeconds = minutes * 60;
      this.remainingSeconds = this.totalSeconds;
      this.renderTime();
      this.updateCircleProgress(1);
    }

    if (updateSlider && this.dom.durationSlider) {
      this.dom.durationSlider.value = minutes;
    }
    if (this.dom.sliderValueBadge) {
      this.dom.sliderValueBadge.textContent = `${minutes} min`;
    }

    // Update active preset button highlight
    if (this.dom.presetBtns) {
      this.dom.presetBtns.forEach(btn => {
        btn.classList.toggle('active', Number(btn.dataset.mins) === minutes);
      });
    }
  }

  loadTask(task) {
    this.currentTask = task;
    this.mode = 'focus';
    this.breaksUsed = Number(task.breaks_used) || 0;
    this.breakDurationMinutes = Math.min(5, Math.max(4, Number(task.break_duration_minutes) || 5));
    
    // Set duration
    this.setDuration(task.duration_minutes);

    if (this.dom.activeTaskTitle) {
      this.dom.activeTaskTitle.textContent = task.title;
      this.dom.activeTaskTitle.title = task.title;
    }

    this.updateBreakControls();
    this.updateIslandState();

    // Scroll smoothly to timer on mobile
    if (window.innerWidth < 1024) {
      const timerCard = document.querySelector('.timer-card');
      if (timerCard) timerCard.scrollIntoView({ behavior: 'smooth' });
    }
  }

  async loadTaskById(taskId) {
    try {
      const data = await window.API.getTask(taskId);
      if (data && data.task) {
        this.loadTask(data.task);
      }
    } catch (e) {
      console.error(e);
    }
  }

  toggle() {
    if (window.soundEngine) window.soundEngine.playTick();

    if (this.state === 'running') {
      this.pause();
    } else {
      this.start();
    }
  }

  start() {
    if (this.state === 'running') return;
    this.state = 'running';
    this.updateToggleBtn();
    this.updateIslandState();

    this.timerInterval = setInterval(() => {
      this.tick();
    }, 1000);
  }

  pause() {
    if (this.state !== 'running') return;
    this.state = 'paused';
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.updateToggleBtn();
    this.updateIslandState();
  }

  reset() {
    if (window.soundEngine) window.soundEngine.playTick();
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.state = 'idle';
    this.mode = 'focus';

    const mins = this.currentTask ? this.currentTask.duration_minutes : (Number(this.dom.durationSlider?.value) || 25);
    this.totalSeconds = mins * 60;
    this.remainingSeconds = this.totalSeconds;

    this.renderTime();
    this.updateCircleProgress(1);
    this.updateToggleBtn();
    this.updateBreakControls();
    this.updateIslandState();
  }

  tick() {
    if (this.remainingSeconds > 0) {
      this.remainingSeconds--;
      this.renderTime();
      this.updateCircleProgress(this.remainingSeconds / this.totalSeconds);
      this.updateDocumentTitle();
    } else {
      this.completeSession();
    }
  }

  async completeSession() {
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.state = 'idle';

    if (this.mode === 'focus') {
      // Focus session ended
      if (window.soundEngine) window.soundEngine.playTaskComplete();

      if (window.notificationEngine) {
        window.notificationEngine.showToast({
          title: 'Focus Completed! 🎉',
          description: this.currentTask ? `Task "${this.currentTask.title}" finished.` : 'Pomodoro focus session finished.',
          priority: 'High'
        });
      }

      // If active task is loaded, mark as Completed in database
      if (this.currentTask) {
        try {
          await window.API.updateTask(this.currentTask.id, { status: 'Completed' });
          if (window.app) window.app.loadTasks();
        } catch (e) {
          console.error(e);
        }
      }

      // Check if user still has breaks left and offer
      if (this.breaksUsed < this.maxBreaks) {
        this.triggerShortBreak();
      } else {
        this.reset();
      }

    } else {
      // Break session ended
      if (window.soundEngine) window.soundEngine.playBreakFinished();

      if (window.notificationEngine) {
        window.notificationEngine.showToast({
          title: 'Break Over ☕',
          description: 'Time to dive back into deep focus!',
          priority: 'Medium'
        });
      }

      this.mode = 'focus';
      this.reset();
    }
  }

  async triggerShortBreak() {
    // Validate Max 2 Breaks Rule
    if (this.breaksUsed >= this.maxBreaks) {
      if (window.notificationEngine) {
        window.notificationEngine.showToast({
          title: 'Break Limit Reached',
          description: 'Maximum 2 breaks allowed per task session.',
          priority: 'Medium'
        });
      }
      return;
    }

    if (window.soundEngine) window.soundEngine.playBreakStart();

    this.breaksUsed++;
    this.mode = 'break';
    this.state = 'running';

    // Break duration: 4 to 5 minutes
    const breakMins = this.currentTask ? this.currentTask.break_duration_minutes : this.breakDurationMinutes;
    this.totalSeconds = breakMins * 60;
    this.remainingSeconds = this.totalSeconds;

    // Update breaks count in backend DB if a task is active
    if (this.currentTask) {
      try {
        await window.API.recordBreak(this.currentTask.id);
        this.currentTask.breaks_used = this.breaksUsed;
        if (window.app) window.app.loadTasks();
      } catch (err) {
        console.error('Failed to update break count in DB:', err);
      }
    }

    this.renderTime();
    this.updateCircleProgress(1);
    this.updateToggleBtn();
    this.updateBreakControls();
    this.updateIslandState();

    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.tick();
    }, 1000);
  }

  updateBreakControls() {
    if (!this.dom.btnBreak) return;

    const breaksLeft = this.maxBreaks - this.breaksUsed;
    if (this.breaksUsed >= this.maxBreaks) {
      this.dom.btnBreak.disabled = true;
      this.dom.btnBreak.innerHTML = `<span>☕ Max 2 Breaks Used</span>`;
    } else {
      this.dom.btnBreak.disabled = false;
      this.dom.btnBreak.innerHTML = `<span>☕ Break (${this.breaksUsed}/${this.maxBreaks})</span>`;
    }

    if (this.dom.breakStatus) {
      this.dom.breakStatus.textContent = `Breaks: ${this.breaksUsed} of ${this.maxBreaks} used (${this.breakDurationMinutes}m each)`;
      this.dom.breakStatus.classList.toggle('break-limit', this.breaksUsed >= this.maxBreaks);
    }
  }

  renderTime() {
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (this.dom.timeDisplay) {
      this.dom.timeDisplay.textContent = formatted;
    }

    if (this.dom.stateLabel) {
      if (this.mode === 'break') {
        this.dom.stateLabel.textContent = `Short Break (${this.breakDurationMinutes}m)`;
        this.dom.stateLabel.style.color = 'var(--accent-green)';
      } else {
        this.dom.stateLabel.textContent = this.state === 'running' ? 'Focus Session' : (this.state === 'paused' ? 'Paused' : 'Ready to Focus');
        this.dom.stateLabel.style.color = 'var(--text-secondary)';
      }
    }
  }

  updateCircleProgress(ratio) {
    if (!this.dom.progressCircle) return;
    const offset = this.circleCircumference * (1 - ratio);
    this.dom.progressCircle.style.strokeDashoffset = offset;

    // Change stroke gradient/color based on mode
    if (this.mode === 'break') {
      this.dom.progressCircle.style.stroke = 'var(--accent-green)';
      this.dom.progressCircle.style.filter = 'drop-shadow(0 0 12px rgba(48, 209, 88, 0.45))';
    } else {
      this.dom.progressCircle.style.stroke = 'url(#timerGradient)';
      this.dom.progressCircle.style.filter = 'drop-shadow(0 0 12px rgba(10, 132, 255, 0.45))';
    }
  }

  updateToggleBtn() {
    if (!this.dom.btnToggle) return;
    if (this.state === 'running') {
      this.dom.btnToggle.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        <span>Pause</span>
      `;
      this.dom.btnToggle.style.background = 'var(--accent-orange)';
    } else {
      this.dom.btnToggle.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <span>${this.state === 'paused' ? 'Resume' : 'Start Focus'}</span>
      `;
      this.dom.btnToggle.style.background = 'var(--accent-blue)';
    }
  }

  updateIslandState() {
    if (!this.dom.dynamicIsland || !this.dom.islandText) return;

    this.dom.dynamicIsland.classList.remove('active-focus', 'active-break');
    const dot = this.dom.dynamicIsland.querySelector('.status-dot');
    if (dot) dot.classList.remove('pulsing', 'break-pulsing');

    if (this.state === 'running') {
      if (this.mode === 'break') {
        this.dom.dynamicIsland.classList.add('active-break');
        if (dot) dot.classList.add('break-pulsing');
        this.dom.islandText.textContent = `Break (${this.dom.timeDisplay.textContent})`;
      } else {
        this.dom.dynamicIsland.classList.add('active-focus');
        if (dot) dot.classList.add('pulsing');
        this.dom.islandText.textContent = `Focus (${this.dom.timeDisplay.textContent})`;
      }
    } else if (this.state === 'paused') {
      this.dom.islandText.textContent = `Paused (${this.dom.timeDisplay.textContent})`;
    } else {
      this.dom.islandText.textContent = 'Pomodoro Pro';
    }
  }

  updateDocumentTitle() {
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    const time = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const taskName = this.currentTask ? this.currentTask.title : 'Focus';
    document.title = `(${time}) ${this.mode === 'break' ? '☕ Break' : '🎯 ' + taskName} - Pomodoro Pro`;
  }
}

window.timerEngine = new PomodoroTimer();
