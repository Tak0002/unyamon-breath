const routines = [
  {
    id: "settle",
    title: "すぐ落ち着く",
    meta: "4秒すう / 6秒はく",
    tone: "浅い呼吸に",
    phases: [
      { label: "すう", seconds: 4, kind: "inhale" },
      { label: "はく", seconds: 6, kind: "exhale" },
    ],
  },
  {
    id: "sleep",
    title: "ねむる前",
    meta: "4 / 7 / 8",
    tone: "夜に",
    phases: [
      { label: "すう", seconds: 4, kind: "inhale" },
      { label: "そのまま", seconds: 7, kind: "hold" },
      { label: "はく", seconds: 8, kind: "exhale" },
    ],
  },
  {
    id: "box",
    title: "考えすぎを止める",
    meta: "4 / 4 / 4 / 4",
    tone: "整える",
    phases: [
      { label: "すう", seconds: 4, kind: "inhale" },
      { label: "そのまま", seconds: 4, kind: "hold-high" },
      { label: "はく", seconds: 4, kind: "exhale" },
      { label: "やすむ", seconds: 4, kind: "hold-low" },
    ],
  },
  {
    id: "belly",
    title: "やさしい腹式",
    meta: "4秒すう / 6秒はく",
    tone: "ゆっくり",
    phases: [
      { label: "おなかへ", seconds: 4, kind: "inhale" },
      { label: "ふわっとはく", seconds: 6, kind: "exhale" },
    ],
  },
];

const storageKeys = {
  history: "unyamon-breath-history-v1",
  settings: "unyamon-breath-settings-v1",
};

const $ = (selector) => document.querySelector(selector);

const els = {
  routineGrid: $("#routineGrid"),
  routinePanel: $("#routinePanel"),
  sessionPanel: $("#sessionPanel"),
  breathOrbit: $("#breathOrbit"),
  phaseLabel: $("#phaseLabel"),
  phaseSeconds: $("#phaseSeconds"),
  todayMinutes: $("#todayMinutes"),
  sessionElapsed: $("#sessionElapsed"),
  cycleCount: $("#cycleCount"),
  toggleButton: $("#toggleButton"),
  finishButton: $("#finishButton"),
  backButton: $("#backButton"),
  historyList: $("#historyList"),
  clearHistoryButton: $("#clearHistoryButton"),
  settingsButton: $("#settingsButton"),
  settingsDialog: $("#settingsDialog"),
  soundToggle: $("#soundToggle"),
  vibrationRow: $("#vibrationRow"),
  vibrationToggle: $("#vibrationToggle"),
};

const vibrationSupported = typeof navigator.vibrate === "function";

const state = {
  selected: routines[0],
  phaseIndex: 0,
  phaseStartedAt: 0,
  sessionStartedAt: 0,
  elapsedBeforePause: 0,
  running: false,
  rafId: 0,
  cycles: 0,
  audioContext: null,
  settings: readJSON(storageKeys.settings, { sound: false, vibration: true }),
};

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getHistory() {
  return readJSON(storageKeys.history, []);
}

function saveHistoryItem() {
  const seconds = Math.round(currentElapsed());
  if (seconds < 20) return;

  const item = {
    id: `${Date.now()}`,
    routineId: state.selected.id,
    routineTitle: state.selected.title,
    seconds,
    cycles: state.cycles,
    at: new Date().toISOString(),
  };

  writeJSON(storageKeys.history, [item, ...getHistory()].slice(0, 12));
}

function todaySeconds() {
  const today = new Date().toDateString();
  return getHistory()
    .filter((item) => new Date(item.at).toDateString() === today)
    .reduce((sum, item) => sum + item.seconds, 0);
}

function renderRoutines() {
  els.routineGrid.innerHTML = routines
    .map(
      (routine) => `
        <button class="routine-card" type="button" data-routine="${routine.id}" aria-pressed="${routine.id === state.selected.id}">
          <em>${routine.tone}</em>
          <strong>${routine.title}</strong>
          <span>${routine.meta}</span>
        </button>
      `,
    )
    .join("");
}

function renderHistory() {
  const history = getHistory();
  els.todayMinutes.textContent = `${Math.floor(todaySeconds() / 60)}分`;

  if (history.length === 0) {
    els.historyList.innerHTML = `<div class="empty-history">まだ記録はありません</div>`;
    return;
  }

  els.historyList.innerHTML = history
    .slice(0, 4)
    .map((item) => {
      const date = new Date(item.at);
      const time = date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
      return `
        <div class="history-item">
          <span><strong>${item.routineTitle}</strong> ${time}</span>
          <span>${formatClock(item.seconds)}</span>
        </div>
      `;
    })
    .join("");
}

function chooseRoutine(id) {
  state.selected = routines.find((routine) => routine.id === id) ?? routines[0];
  resetSession();
  els.routinePanel.hidden = true;
  els.sessionPanel.hidden = false;
  renderRoutines();
  showPhaseIntro();
}

function showPhaseIntro() {
  els.phaseLabel.textContent = state.selected.title;
  els.phaseSeconds.textContent = "はじめよう";
  setBreathScale(1);
}

function currentElapsed() {
  if (!state.sessionStartedAt) return state.elapsedBeforePause;
  const active = state.running ? (performance.now() - state.sessionStartedAt) / 1000 : 0;
  return state.elapsedBeforePause + active;
}

function setBreathScale(scale) {
  els.breathOrbit.style.setProperty("--breath-scale", String(scale));
}

function updatePhase() {
  const phase = state.selected.phases[state.phaseIndex];
  const elapsed = (performance.now() - state.phaseStartedAt) / 1000;
  const progress = Math.min(elapsed / phase.seconds, 1);
  const remaining = Math.max(Math.ceil(phase.seconds - elapsed), 0);

  els.phaseLabel.textContent = phase.label;
  els.phaseSeconds.textContent = `${remaining}`;
  els.sessionElapsed.textContent = formatClock(currentElapsed());
  els.cycleCount.textContent = String(state.cycles);

  if (phase.kind === "inhale") setBreathScale(1 + progress * 0.13);
  if (phase.kind === "exhale") setBreathScale(1.13 - progress * 0.13);
  if (phase.kind === "hold-high") setBreathScale(1.13);
  if (phase.kind === "hold-low" || phase.kind === "hold") setBreathScale(1);

  if (progress >= 1) {
    nextPhase();
  }

  if (state.running) {
    state.rafId = requestAnimationFrame(updatePhase);
  }
}

function nextPhase() {
  state.phaseIndex += 1;
  if (state.phaseIndex >= state.selected.phases.length) {
    state.phaseIndex = 0;
    state.cycles += 1;
  }
  state.phaseStartedAt = performance.now();
  cue();
}

function startSession() {
  if (state.running) return;
  state.running = true;
  state.sessionStartedAt = performance.now();
  state.phaseStartedAt = performance.now();
  els.toggleButton.textContent = "とめる";
  cue();
  updatePhase();
}

function pauseSession() {
  if (!state.running) return;
  state.elapsedBeforePause = currentElapsed();
  state.running = false;
  state.sessionStartedAt = 0;
  cancelAnimationFrame(state.rafId);
  els.toggleButton.textContent = "つづける";
}

function finishSession() {
  pauseSession();
  saveHistoryItem();
  resetSession();
  els.routinePanel.hidden = false;
  els.sessionPanel.hidden = true;
  els.phaseLabel.textContent = "ひと息ついたね";
  els.phaseSeconds.textContent = "またいつでも";
  renderHistory();
}

function resetSession() {
  cancelAnimationFrame(state.rafId);
  state.phaseIndex = 0;
  state.phaseStartedAt = 0;
  state.sessionStartedAt = 0;
  state.elapsedBeforePause = 0;
  state.running = false;
  state.cycles = 0;
  els.toggleButton.textContent = "はじめる";
  els.sessionElapsed.textContent = "0:00";
  els.cycleCount.textContent = "0";
}

function cue() {
  if (state.settings.vibration && vibrationSupported) {
    navigator.vibrate(18);
  }

  if (!state.settings.sound) return;
  state.audioContext ??= new AudioContext();
  const oscillator = state.audioContext.createOscillator();
  const gain = state.audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 528;
  gain.gain.setValueAtTime(0.0001, state.audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.045, state.audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, state.audioContext.currentTime + 0.18);
  oscillator.connect(gain).connect(state.audioContext.destination);
  oscillator.start();
  oscillator.stop(state.audioContext.currentTime + 0.2);
}

function bindEvents() {
  els.routineGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-routine]");
    if (!button) return;
    chooseRoutine(button.dataset.routine);
  });

  els.toggleButton.addEventListener("click", () => {
    if (state.running) pauseSession();
    else startSession();
  });

  els.finishButton.addEventListener("click", finishSession);

  els.backButton.addEventListener("click", () => {
    pauseSession();
    els.routinePanel.hidden = false;
    els.sessionPanel.hidden = true;
    els.phaseLabel.textContent = "いまはどんな感じ？";
    els.phaseSeconds.textContent = "選んでね";
  });

  els.clearHistoryButton.addEventListener("click", () => {
    writeJSON(storageKeys.history, []);
    renderHistory();
  });

  els.settingsButton.addEventListener("click", () => {
    els.settingsDialog.showModal();
  });

  els.soundToggle.addEventListener("change", () => {
    state.settings.sound = els.soundToggle.checked;
    writeJSON(storageKeys.settings, state.settings);
  });

  els.vibrationToggle.addEventListener("change", () => {
    state.settings.vibration = els.vibrationToggle.checked;
    writeJSON(storageKeys.settings, state.settings);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseSession();
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function init() {
  els.soundToggle.checked = state.settings.sound;
  if (vibrationSupported) {
    els.vibrationToggle.checked = state.settings.vibration;
  } else {
    state.settings.vibration = false;
    els.vibrationRow.hidden = true;
    writeJSON(storageKeys.settings, state.settings);
  }
  renderRoutines();
  renderHistory();
  bindEvents();
  registerServiceWorker();
}

init();
