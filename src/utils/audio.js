let audioCtx = null;

export function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

if (typeof window !== 'undefined') {
  const unlockEvents = ['pointerdown', 'touchstart', 'click', 'keydown'];
  const onFirstInteraction = () => {
    unlockAudio();
    unlockEvents.forEach((evt) => window.removeEventListener(evt, onFirstInteraction));
  };
  unlockEvents.forEach((evt) => window.addEventListener(evt, onFirstInteraction, { passive: true }));
}

function withAudio(callback) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        try {
          callback(ctx);
        } catch {}
      }).catch(() => {});
    } else {
      callback(ctx);
    }
  } catch {
    // ignore
  }
}

export const soundEffects = {
  click: (muted = false) => {
    if (muted) return;
    withAudio((ctx) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.06);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    });
  },

  tick: (muted = false, urgent = false) => {
    if (muted) return;
    withAudio((ctx) => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = urgent ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(urgent ? 880 : 520, now);
      gain.gain.setValueAtTime(urgent ? 0.25 : 0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    });
  },

  gong: (muted = false, vibrate = true) => {
    if (!muted) {
      withAudio((ctx) => {
        const now = ctx.currentTime;
        const freqs = [523.25, 659.25, 783.99, 1046.5];
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.25, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 1.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 1.2);
        });
      });
    }

    if (vibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch {
        // ignore
      }
    }
  },

  vibrate: (pattern = 80) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        // ignore
      }
    }
  },

  fanfare: (muted = false, vibrate = true) => {
    if (!muted) {
      withAudio((ctx) => {
        const now = ctx.currentTime;
        const notes = [
          { f: 523.25, t: 0, d: 0.15 },
          { f: 659.25, t: 0.15, d: 0.15 },
          { f: 783.99, t: 0.3, d: 0.2 },
          { f: 1046.5, t: 0.5, d: 0.6 },
        ];
        notes.forEach(({ f, t, d }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, now + t);
          gain.gain.setValueAtTime(0.25, now + t);
          gain.gain.exponentialRampToValueAtTime(0.001, now + t + d);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + t);
          osc.stop(now + t + d);
        });
      });
    }

    if (vibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([150, 100, 250, 100, 400]);
      } catch {
        // ignore
      }
    }
  }
};
