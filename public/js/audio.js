/**
 * Audio Engine powered by Web Audio API
 * Generates pristine acoustic chords, chimes, and priority alerts
 * without requiring external MP3/WAV network dependencies.
 */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.soundEnabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq, duration = 0.3, type = 'sine', gainVal = 0.2, delay = 0) {
    if (!this.soundEnabled) return;
    this.init();
    if (!this.ctx) return;

    setTimeout(() => {
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {
        console.warn('Audio playback error', e);
      }
    }, delay * 1000);
  }

  // Apple-like gentle Marimba chord for Pomodoro Task Completion
  playTaskComplete() {
    this.init();
    const chord = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    chord.forEach((freq, idx) => {
      this.playTone(freq, 0.7, 'sine', 0.25, idx * 0.08);
    });
  }

  // Break Started gentle ping
  playBreakStart() {
    this.init();
    this.playTone(659.25, 0.4, 'triangle', 0.2, 0);     // E5
    this.playTone(880.00, 0.6, 'sine', 0.2, 0.12);     // A5
  }

  // Break Finished reminder
  playBreakFinished() {
    this.init();
    this.playTone(880.00, 0.35, 'sine', 0.25, 0);
    this.playTone(783.99, 0.35, 'sine', 0.25, 0.1);
    this.playTone(1046.50, 0.8, 'sine', 0.3, 0.2);
  }

  // Priority Notification Alerts
  playPriorityAlert(priority) {
    this.init();
    if (priority === 'High') {
      // Urgent high-pitch double beep alert
      this.playTone(987.77, 0.15, 'sawtooth', 0.3, 0);     // B5
      this.playTone(1318.51, 0.18, 'sawtooth', 0.35, 0.12); // E6
      this.playTone(987.77, 0.15, 'sawtooth', 0.3, 0.28);
      this.playTone(1318.51, 0.35, 'sawtooth', 0.35, 0.40);
    } else if (priority === 'Medium') {
      // Melodic chime
      this.playTone(587.33, 0.3, 'sine', 0.25, 0);     // D5
      this.playTone(880.00, 0.5, 'sine', 0.25, 0.14);  // A5
    } else {
      // Low priority subtle harmonic ping
      this.playTone(440.00, 0.4, 'triangle', 0.18, 0);  // A4
    }
  }

  // Micro-interaction soft click
  playTick() {
    this.playTone(1200, 0.03, 'triangle', 0.04, 0);
  }
}

window.soundEngine = new SoundEngine();
