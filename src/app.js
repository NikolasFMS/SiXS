import { decksRU, decksEN } from './data/decks.js';
import { translations } from './utils/i18n.js';
import { soundEffects } from './utils/audio.js';
import { loadStoredState, saveStoredState, loadStoredSettings, saveStoredSettings } from './utils/storage.js';

const ROUND_SEQUENCE = ['owl', 'lark', 'blitz', 'owl', 'lark', 'blitz'];

// State references
let settings = loadStoredSettings();
let state = loadStoredState();
let timerInterval = null;
let rulesModalOpen = false;
let homeConfirmOpen = false;
let topicChoiceOpen = false;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function formatTime(totalSec) {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getCardData(type, cardIndex) {
  const isEn = settings.language === 'en';
  const deck = isEn ? decksEN : decksRU;

  if (type === 'blitz') {
    const items = deck.blitz[cardIndex] || decksRU.blitz[cardIndex];
    const title = isEn ? 'Six quick categories' : 'Шесть быстрых категорий';
    return { type, cardIndex, title, items };
  } else {
    const title = deck[type][cardIndex] || decksRU[type][cardIndex];
    return { type, cardIndex, title };
  }
}

function drawCard(type, currentPiles) {
  let pile = [...currentPiles[type]];
  if (!pile.length) {
    const total = decksRU[type].length;
    pile = shuffle(Array.from({ length: total }, (_, i) => i));
  }
  const cardIndex = pile.pop() ?? 0;
  const newPiles = {
    ...currentPiles,
    [type]: pile,
  };
  const card = getCardData(type, cardIndex);
  return { card, newPiles };
}

function drawTopicChoices(type, currentPiles) {
  let pile = [...currentPiles[type]];
  if (pile.length < 2) {
    pile = shuffle(Array.from({ length: decksRU[type].length }, (_, i) => i));
  }
  const indices = [pile.pop(), pile.pop()];
  return {
    choices: indices.map((cardIndex) => getCardData(type, cardIndex)),
    newPiles: { ...currentPiles, [type]: pile },
  };
}

// Smooth scrolling helper for mobile convenience
function smoothScrollTo(elementOrId, options = {}) {
  const { block = 'start', behavior = 'smooth', delay = 70 } = options;
  setTimeout(() => {
    const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (el) {
      el.scrollIntoView({ behavior, block });
    }
  }, delay);
}

// Timer tick management
let lastTickedSecond = null;

function startTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  lastTickedSecond = null;

  timerInterval = window.setInterval(() => {
    if (!state || state.screen !== 'game' || state.phase !== 'timer' || !state.timerEndsAt) {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      return;
    }

    const now = Date.now();
    const left = Math.max(0, Math.ceil((state.timerEndsAt - now) / 1000));

    // Audio ticking and tactile vibration per exact second transition
    if (left !== lastTickedSecond) {
      lastTickedSecond = left;

      if (left <= 10 && left > 0) {
        soundEffects.tick(!settings.soundEnabled, left <= 5);
      }

      // Tactile vibration in the last 3 seconds (3, 2, 1)
      if (left <= 3 && left > 0 && settings.vibrationEnabled) {
        soundEffects.vibrate(80);
      }
    }

    if (left <= 0) {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      soundEffects.gong(!settings.soundEnabled);
      if (settings.vibrationEnabled) {
        soundEffects.vibrate([300, 100, 450]);
      }
      state.phase = 'scoring';
      state.timerEndsAt = null;
      state.remaining = 0;
      saveStoredState(state);
      render();
      smoothScrollTo('scoringSection', { block: 'start', delay: 120 });
    } else {
      state.remaining = left;
      saveStoredState(state);
      const timerEl = document.getElementById('timerDisplay');
      if (timerEl) {
        timerEl.textContent = formatTime(left);
        if (left <= 10) {
          timerEl.classList.add('text-[#f29a79]', 'scale-102');
          timerEl.classList.remove('text-white');
        } else {
          timerEl.classList.add('text-white');
          timerEl.classList.remove('text-[#f29a79]', 'scale-102');
        }
      }
    }
  }, 250);
}

// Global speech synthesis
function speakCurrentPrompt() {
  if (typeof window === 'undefined' || !window.speechSynthesis || !state || !state.card) return;
  try {
    window.speechSynthesis.cancel();
    let text = state.card.title;
    if (state.card.type === 'blitz' && state.card.items) {
      text = settings.language === 'ru'
        ? `Блиц. Шесть тем: ${state.card.items.join(', ')}`
        : `Blitz. Six categories: ${state.card.items.join(', ')}`;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = settings.language === 'ru' ? 'ru-RU' : 'en-US';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  } catch {
    // ignore
  }
}

// Main Render Function
export function render() {
  const t = translations[settings.language];
  document.documentElement.lang = settings.language;
  document.title = settings.language === 'en' ? 'SiXeS — Board Game Assistant' : 'Совпадение — SiXeS Помощник';

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.setAttribute(
      'content',
      settings.language === 'en'
        ? 'Offline assistant for the SiXeS party game. Prompts, timer, and scoring on paper sheets.'
        : 'Офлайн-помощник для настольной игры «Совпадение» (SiXeS). Карточки, таймер и подсчёт очков.'
    );
  }

  // Header updates
  const headerSubtitle = document.getElementById('headerSubtitle');
  if (headerSubtitle) headerSubtitle.textContent = t.appSubtitle;

  const headerRoundBadge = document.getElementById('headerRoundBadge');
  if (headerRoundBadge) {
    if (state && state.screen === 'game') {
      const typeLabel = t[`${ROUND_SEQUENCE[state.round]}Name`];
      headerRoundBadge.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-[#e3c174] animate-pulse"></span>
        <span class="text-[#aeb9b2]">${t.roundBadge.replace('{current}', String(state.round + 1))}</span>
        <span class="text-white font-bold">· ${typeLabel}</span>
      `;
      headerRoundBadge.classList.remove('hidden');
      headerRoundBadge.classList.add('flex');
    } else {
      headerRoundBadge.classList.add('hidden');
      headerRoundBadge.classList.remove('flex');
    }
  }

  const soundBtn = document.getElementById('soundBtn');
  if (soundBtn) {
    soundBtn.title = settings.soundEnabled ? t.soundOn : t.soundOff;
    soundBtn.innerHTML = settings.soundEnabled
      ? `<svg class="w-4 h-4 text-[#e3c174]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H2v6h4l5 4V5z"/></svg>`
      : `<svg class="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/></svg>`;
  }

  const vibrateBtn = document.getElementById('vibrateBtn');
  if (vibrateBtn) {
    vibrateBtn.title = settings.vibrationEnabled ? t.vibrationOn : t.vibrationOff;
    vibrateBtn.innerHTML = settings.vibrationEnabled
      ? `<svg class="w-4 h-4 text-[#e3c174]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 8 2 2-2 2 2 2-2 2"/><path d="m22 8-2 2 2 2-2 2 2 2"/><rect width="8" height="14" x="8" y="5" rx="1"/></svg>`
      : `<svg class="w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><rect width="8" height="14" x="8" y="5" rx="1"/></svg>`;
  }

  const langBtn = document.getElementById('langBtn');
  if (langBtn) {
    langBtn.textContent = settings.language === 'ru' ? 'EN' : 'RU';
  }

  // Render Main Content
  const app = document.getElementById('app');
  if (!app) return;

  if (!state || state.screen === 'home') {
    renderHomeScreen(app, t);
  } else if (state.screen === 'setup') {
    renderSetupScreen(app, t);
  } else if (state.screen === 'game') {
    renderGameScreen(app, t);
    if (state.phase === 'timer' && state.timerEndsAt) {
      startTimerLoop();
    }
  } else if (state.screen === 'finish') {
    renderFinishScreen(app, t);
  }

  // Render Rules Modal
  renderRulesModal(t);
  renderHomeConfirm(t);
  topicChoiceOpen = !!(state?.screen === 'game' && state.topicChoices?.length);
  renderTopicChoice(t);
}

function renderTopicChoice(t) {
  const modal = document.getElementById('topicChoiceModal');
  if (!modal) return;
  if (!state?.topicChoices?.length) {
    modal.innerHTML = '';
    return;
  }
  const isRu = settings.language === 'ru';
  const type = state.card.type;
  const host = state.players?.[state.round % state.players.length] || state.players?.[0];
  // Keep the overlay outside app's animated/transformed stacking context.
  if (modal.parentElement !== document.body) document.body.appendChild(modal);
  modal.innerHTML = `
    <div class="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200 ">
      <section class="my-auto w-full max-w-lg overflow-hidden rounded-2xl sm:rounded-3xl border border-[#dfdfd6] bg-[#fffefa] text-[#18231f] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="topicChoiceTitle">
        <div class="bg-[#13231d] px-5 py-5 text-white sm:px-6">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-wider text-[#98a79d]">${escapeHtml(t[`${type}Name`])} · ${escapeHtml(t.roundBadge.replace('{current}', String(state.round + 1)).replace('{total}', '6'))}</p>
              <h2 id="topicChoiceTitle" class="mt-1 text-xl font-extrabold">${isRu ? 'Выберите тему раунда' : 'Choose this round’s topic'}</h2>
            </div>
            <button id="topicLanguageBtn" type="button" class="min-h-[36px] shrink-0 rounded-full border border-white/25 bg-white/10 px-3 text-[11px] font-extrabold tracking-wider text-white transition-colors hover:bg-white/20" aria-label="${isRu ? 'Switch language to English' : 'Переключить язык на русский'}">${isRu ? 'EN' : 'RU'}</button>
          </div>
          <p class="mt-1 text-xs leading-relaxed text-[#c1ccc4]">${isRu ? 'Ведущий выбирает одну из двух тем. Вторая не будет использована в этой партии.' : 'The host chooses one of two topics. The other will not be used in this game.'}</p>
          ${host ? `<div class="mt-3 inline-flex items-center gap-2 rounded-full border border-[#e3c174]/30 bg-[#e3c174]/10 px-3 py-1.5 text-sm font-bold text-[#f0d998]"><span aria-hidden="true">👑</span><span>${isRu ? 'Ведущий:' : 'Host:'} ${escapeHtml(host.name)}</span></div>` : ''}
        </div>
        <div class="space-y-2.5 p-4 sm:p-5">
          ${state.topicChoices.map((choice, index) => `
            <button type="button" data-topic-index="${index}" class="group flex min-h-[76px] w-full items-center gap-3 rounded-xl border border-[#dce3da] bg-[#f5f7f3] p-4 text-left transition-all hover:border-[#31594b] hover:bg-[#eef3ee] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#31594b]">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#31594b] text-sm font-black text-white">${index + 1}</span>
              <span class="text-base font-extrabold uppercase leading-snug">${escapeHtml(choice.title)}</span>
              <span class="ml-auto text-[#31594b] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true">→</span>
            </button>
          `).join('')}
        </div>
      </section>
    </div>
  `;
  document.getElementById('topicLanguageBtn')?.addEventListener('click', () => {
    settings.language = settings.language === 'ru' ? 'en' : 'ru';
    saveStoredSettings(settings);
    if (state?.card) state.card = getCardData(state.card.type, state.card.cardIndex);
    if (state?.topicChoices) {
      state.topicChoices = state.topicChoices.map((choice) => getCardData(choice.type, choice.cardIndex));
    }
    saveStoredState(state);
    soundEffects.click(!settings.soundEnabled);
    render();
  });
  modal.querySelectorAll('[data-topic-index]').forEach((button) => {
    button.addEventListener('click', () => {
      state.card = state.topicChoices[Number(button.dataset.topicIndex)];
      state.topicChoices = null;
      topicChoiceOpen = false;
      saveStoredState(state);
      soundEffects.click(!settings.soundEnabled);
      render();
    });
  });
}

function renderHomeConfirm(t) {
  const modal = document.getElementById('homeConfirmModal');
  if (!modal) return;
  if (!homeConfirmOpen) {
    modal.innerHTML = '';
    return;
  }

  const isRu = settings.language === 'ru';
  modal.innerHTML = `
    <div class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" data-home-dismiss>
      <section class="w-full max-w-sm overflow-hidden rounded-2xl border border-[#dfdfd6] bg-[#fffefa] text-[#18231f] shadow-2xl animate-in zoom-in-95 duration-200" role="alertdialog" aria-modal="true" aria-labelledby="homeConfirmTitle" aria-describedby="homeConfirmText">
        <div class="flex items-center gap-3 bg-[#13231d] px-5 py-4 text-white">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e3c174]/40 bg-[#e3c174]/15 text-xl text-[#e3c174]" aria-hidden="true">⌂</span>
          <div>
            <p class="text-[10px] font-bold uppercase tracking-wider text-[#98a79d]">SiXeS</p>
            <h2 id="homeConfirmTitle" class="text-base font-extrabold">${isRu ? 'Вернуться в начало?' : 'Return to the beginning?'}</h2>
          </div>
        </div>
        <p id="homeConfirmText" class="px-5 py-5 text-sm leading-relaxed text-[#47534b]">${isRu ? 'Текущий экран игры будет закрыт. Вы сможете продолжить сохранённую игру с главного экрана.' : 'The current game screen will close. You can resume your saved game from the home screen.'}</p>
        <div class="flex flex-col-reverse gap-2 border-t border-[#dfdfd6] bg-[#f6f5f0] p-4 sm:flex-row sm:justify-end">
          <button id="cancelHomeBtn" type="button" class="min-h-[46px] rounded-xl border border-[#d5d9d2] bg-white px-5 py-2.5 text-sm font-bold text-[#31594b] transition-colors hover:bg-[#f5f7f3] active:scale-95">${isRu ? 'Остаться' : 'Stay here'}</button>
          <button id="confirmHomeBtn" type="button" class="min-h-[46px] rounded-xl bg-[#31594b] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#25483b] active:scale-95">${isRu ? 'В начало' : 'Go to home'}</button>
        </div>
      </section>
    </div>
  `;

  const close = () => {
    homeConfirmOpen = false;
    renderHomeConfirm(translations[settings.language]);
  };
  modal.querySelector('[data-home-dismiss]')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) close();
  });
  document.getElementById('cancelHomeBtn')?.addEventListener('click', close);
  document.getElementById('confirmHomeBtn')?.addEventListener('click', () => {
    homeConfirmOpen = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (state) {
      state.screen = 'home';
      state.phase = 'setup';
      state.timerEndsAt = null;
      saveStoredState(state);
    }
    render();
  });
  document.getElementById('cancelHomeBtn')?.focus();
}

// Screen: Home
function renderHomeScreen(container, t) {
  const hasActiveGame = state && state.screen === 'game';
  const players = state?.players || [];
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score || b.bonus - a.bonus);

  container.innerHTML = `
    <div class="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-5 sm:space-y-7 animate-in fade-in duration-200">
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-1">
        <div class="space-y-1.5">
          <h1 class="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-[#18231f] font-serif leading-tight break-words">
            ${escapeHtml(t.heroTitle)}
          </h1>
          <p class="text-xs sm:text-sm text-[#616c64] max-w-xl leading-relaxed break-words">
            ${escapeHtml(t.heroSub)}
          </p>
        </div>

        <div class="flex flex-col sm:flex-row gap-2 sm:gap-3 shrink-0">
          ${hasActiveGame ? `
            <button id="resumeGameBtn" class="inline-flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 rounded-xl bg-[#31594b] hover:bg-[#25483b] text-white font-bold text-xs sm:text-sm shadow-md shadow-[#31594b]/20 transition-all cursor-pointer">
              <span>↻</span>
              <span>${escapeHtml(t.resumeGame)}</span>
            </button>
            <button id="newGameBtn" class="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 rounded-xl bg-[#e8ebe5] hover:bg-[#dde1d9] text-[#18231f] font-bold text-xs sm:text-sm transition-colors cursor-pointer">
              <span>${escapeHtml(t.newGame)}</span>
            </button>
          ` : `
            <button id="startGameBtn" class="inline-flex items-center justify-center gap-2 px-6 py-2.5 sm:py-3 rounded-xl bg-[#31594b] hover:bg-[#25483b] text-white font-bold text-xs sm:text-sm shadow-md shadow-[#31594b]/20 transition-all cursor-pointer">
              <span>▶</span>
              <span>${escapeHtml(t.startGame)}</span>
            </button>
          `}
        </div>
      </div>

      ${hasActiveGame ? `
        <div class="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-linear-to-r from-[#192722] to-[#121f1a] text-white border border-[#2d4239] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#e3c174]/15 border border-[#e3c174]/30 flex items-center justify-center text-[#e3c174] shrink-0 font-bold">
              ↻
            </div>
            <div class="min-w-0">
              <p class="text-[10px] sm:text-xs uppercase tracking-wider text-[#aeb9b2] font-bold truncate">
                ${escapeHtml(t.savedGameBanner)}
              </p>
              <h3 class="font-extrabold text-sm sm:text-base leading-snug truncate">
                ${escapeHtml(t.roundOf.replace('{current}', String(state.round + 1)).replace('{total}', '6'))} · ${escapeHtml(t[`${state.card?.type || 'owl'}Name`])}
              </h3>
              <p class="text-[11px] sm:text-xs text-[#aeb9b2] truncate">
                ${escapeHtml(t.playersCount.replace('{count}', String(state.players.length)))}
                ${sortedPlayers.length > 0 ? ` · ${escapeHtml(t.leaderPreview.replace('{name}', sortedPlayers[0].name).replace('{score}', String(sortedPlayers[0].score)))}` : ''}
              </p>
            </div>
          </div>
          <button id="bannerResumeBtn" class="w-full sm:w-auto px-4 py-2 rounded-lg sm:rounded-xl bg-[#e3c174] hover:bg-[#d8b564] text-[#111c19] font-extrabold text-[11px] sm:text-xs uppercase tracking-wider transition-colors cursor-pointer shrink-0 text-center">
            ${escapeHtml(t.resumeGame)}
          </button>
        </div>
      ` : ''}

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        <div class="md:col-span-2 bg-[#fffefa] border border-[#dfdfd6] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3 sm:space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="font-extrabold text-base sm:text-lg text-[#18231f] flex items-center gap-2">
              <span>🃏</span>
              <span>${escapeHtml(t.decksTitle)}</span>
            </h2>
            <button id="homeRulesBtn" class="text-xs font-bold text-[#31594b] hover:underline flex items-center gap-1 cursor-pointer">
              <span>📖</span>
              <span>${escapeHtml(t.howToPlay)}</span>
            </button>
          </div>

          <div class="grid gap-2">
            <div class="flex items-start gap-2.5 p-2 sm:p-2.5 rounded-xl border border-[#e1e5ee] bg-[#f8faff] hover:border-[#b0c0dd] transition-colors">
              <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#e9edf6] text-[#495f8c] font-black text-sm sm:text-base flex items-center justify-center shrink-0 mt-0.5">
                ${escapeHtml(t.owlShort)}
              </div>
              <div class="flex-1 min-w-0 space-y-0.5">
                <div class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <h3 class="font-extrabold text-xs sm:text-sm text-[#243555] break-words">${escapeHtml(t.owlName)}</h3>
                  <span class="text-[10px] sm:text-[11px] font-bold px-1.5 py-0.2 rounded-md bg-[#e9edf6] text-[#495f8c] shrink-0">
                    ${escapeHtml(t.promptsCount.replace('{count}', '72'))}
                  </span>
                </div>
                <p class="text-[11px] sm:text-xs text-[#526382] leading-snug break-words hyphens-auto whitespace-normal">
                  ${escapeHtml(t.owlDesc)}
                </p>
              </div>
            </div>

            <div class="flex items-start gap-2.5 p-2 sm:p-2.5 rounded-xl border border-[#eedecb] bg-[#fffaf4] hover:border-[#d9b895] transition-colors">
              <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#f7e9d9] text-[#9a6325] font-black text-sm sm:text-base flex items-center justify-center shrink-0 mt-0.5">
                ${escapeHtml(t.larkShort)}
              </div>
              <div class="flex-1 min-w-0 space-y-0.5">
                <div class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <h3 class="font-extrabold text-xs sm:text-sm text-[#66390f] break-words">${escapeHtml(t.larkName)}</h3>
                  <span class="text-[10px] sm:text-[11px] font-bold px-1.5 py-0.2 rounded-md bg-[#f7e9d9] text-[#9a6325] shrink-0">
                    ${escapeHtml(t.promptsCount.replace('{count}', '72'))}
                  </span>
                </div>
                <p class="text-[11px] sm:text-xs text-[#6e5135] leading-snug break-words hyphens-auto whitespace-normal">
                  ${escapeHtml(t.larkDesc)}
                </p>
              </div>
            </div>

            <div class="flex items-start gap-2.5 p-2 sm:p-2.5 rounded-xl border border-[#e7daee] bg-[#fbf8fd] hover:border-[#caaedd] transition-colors">
              <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#eee6f4] text-[#77528b] font-black text-sm sm:text-base flex items-center justify-center shrink-0 mt-0.5">
                ${escapeHtml(t.blitzShort)}
              </div>
              <div class="flex-1 min-w-0 space-y-0.5">
                <div class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <h3 class="font-extrabold text-xs sm:text-sm text-[#4e2965] break-words">${escapeHtml(t.blitzName)}</h3>
                  <span class="text-[10px] sm:text-[11px] font-bold px-1.5 py-0.2 rounded-md bg-[#eee6f4] text-[#77528b] shrink-0">
                    ${escapeHtml(t.blitzPromptsCount.replace('{count}', '72'))}
                  </span>
                </div>
                <p class="text-[11px] sm:text-xs text-[#68497a] leading-snug break-words hyphens-auto whitespace-normal">
                  ${escapeHtml(t.blitzDesc)}
                </p>
              </div>
            </div>
          </div>

          <p class="text-[11px] sm:text-xs text-[#717b73] pt-0.5 leading-relaxed break-words">
            ${escapeHtml(t.offlineAppNotice)}
          </p>
        </div>

        <div class="bg-[#192722] text-white border border-[#2d4239] rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <h2 class="font-extrabold text-base sm:text-lg flex items-center gap-2 mb-3 text-[#e3c174]">
              ${sortedPlayers.length > 0 ? `<span>🏆 ${escapeHtml(t.currentStandings)}</span>` : `<span>👥 ${escapeHtml(t.gettingReady)}</span>`}
            </h2>

            ${sortedPlayers.length > 0 ? `
              <div class="space-y-2">
                ${sortedPlayers.slice(0, 5).map((player, idx) => `
                  <div class="flex items-center justify-between py-1.5 border-b border-white/10 last:border-0 text-xs sm:text-sm">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white/10 text-white/70 text-[10px] sm:text-xs flex items-center justify-center font-bold shrink-0">
                        ${idx + 1}
                      </span>
                      <span class="font-semibold truncate">${escapeHtml(player.name)}</span>
                    </div>
                    <div class="flex items-center gap-2.5 shrink-0">
                      <span class="text-[11px] text-[#aeb9b2]">${player.bonus} ${escapeHtml(t.bonusShort)}</span>
                      <span class="font-extrabold text-sm sm:text-base text-[#e3c174]">${player.score}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="space-y-2.5 text-xs text-[#aeb9b2] leading-relaxed break-words">
                <p>${escapeHtml(t.readyDesc)}</p>

              </div>
            `}
          </div>

          <div class="pt-4">
            <button id="sideRulesBtn" class="w-full py-2 px-3 rounded-xl border border-white/20 hover:bg-white/10 text-white font-bold text-[11px] sm:text-xs uppercase tracking-wider transition-colors cursor-pointer text-center">
              ${escapeHtml(t.rulesBtn)}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach event handlers
  document.getElementById('startGameBtn')?.addEventListener('click', () => {
    soundEffects.click(!settings.soundEnabled);
    state = {
      screen: 'setup',
      phase: 'briefing',
      round: 0,
      strictness: settings.defaultStrictness,
      timerDuration: settings.defaultTimerSeconds,
      remaining: settings.defaultTimerSeconds,
      timerEndsAt: null,
      players: [],
      card: null,
      piles: { owl: [], lark: [], blitz: [] },
      topicChoices: null,
      draftScores: {},
      history: [],
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    render();
  });

  const handleResume = () => {
    soundEffects.click(!settings.soundEnabled);
    if (state) {
      state.screen = 'game';
      saveStoredState(state);
      render();
    }
  };

  document.getElementById('resumeGameBtn')?.addEventListener('click', handleResume);
  document.getElementById('bannerResumeBtn')?.addEventListener('click', handleResume);

  document.getElementById('newGameBtn')?.addEventListener('click', () => {
    soundEffects.click(!settings.soundEnabled);
    if (state) {
      state.screen = 'setup';
      render();
    }
  });

  const openRules = () => {
    soundEffects.click(!settings.soundEnabled);
    rulesModalOpen = true;
    renderRulesModal(t);
  };

  document.getElementById('homeRulesBtn')?.addEventListener('click', openRules);
  document.getElementById('sideRulesBtn')?.addEventListener('click', openRules);
}

// Screen: Setup
function renderSetupScreen(container, t) {
  let playerNames = state?.players && state.players.length >= 3
    ? state.players.map((p) => p.name)
    : settings.language === 'ru'
    ? ['Игрок 1', 'Игрок 2', 'Игрок 3', 'Игрок 4']
    : ['Player 1', 'Player 2', 'Player 3', 'Player 4'];

  let strictness = state?.strictness || settings.defaultStrictness;
  let timerSeconds = state?.timerDuration || settings.defaultTimerSeconds;

  function renderSetupBody(focusIdx = null) {
    container.innerHTML = `
      <div class="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-7 animate-in fade-in duration-200">
        <div class="space-y-1 mb-4 sm:mb-6">
          <p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#717b73]">
            ${escapeHtml(t.appName)} · ${escapeHtml(t.setupTitle)}
          </p>
          <h1 class="text-xl sm:text-3xl font-extrabold text-[#18231f] tracking-tight font-serif break-words">
            ${escapeHtml(t.setupTitle)}
          </h1>
          <p class="text-xs text-[#616c64] break-words">
            ${escapeHtml(t.setupSub)}
          </p>
        </div>

        <form id="setupForm" class="space-y-4 sm:space-y-5">
          <div class="bg-[#fffefa] border border-[#dfdfd6] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
            <div class="flex items-center justify-between">
              <label class="font-extrabold text-xs sm:text-sm text-[#18231f] flex items-center gap-1.5 sm:gap-2">
                <span>👥</span>
                <span>${escapeHtml(t.playersLabel)}</span>
                <span class="text-[11px] font-normal text-[#717b73]">${escapeHtml(t.minMaxPlayers)}</span>
              </label>

              ${playerNames.length >= 3 ? `
                <button type="button" id="shuffleBtn" class="text-[11px] sm:text-xs font-bold text-[#31594b] hover:underline flex items-center gap-1 cursor-pointer">
                  <span>🔀</span>
                  <span>${escapeHtml(t.shuffleOrderBtn)}</span>
                </button>
              ` : ''}
            </div>

            <div id="playerInputsList" class="grid gap-2 sm:gap-2.5">
              ${playerNames.map((name, index) => `
                <div class="flex items-center gap-2">
                  <span class="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#eef1ed] text-[#47534b] font-bold text-xs flex items-center justify-center shrink-0">
                    ${index + 1}
                  </span>
                  <input
                    type="text"
                    maxlength="24"
                    value="${escapeHtml(name)}"
                    data-player-idx="${index}"
                    placeholder="${escapeHtml(t.playerPlaceholder)} ${index + 1}"
                    class="player-input-item flex-1 min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#d6dad3] bg-[#fbfbfa] text-xs sm:text-sm text-[#18231f] font-medium focus:outline-hidden focus:border-[#31594b] focus:bg-white transition-all shadow-2xs"
                    required
                  />
                  ${playerNames.length > 3 ? `
                    <button type="button" data-remove-idx="${index}" class="min-w-[44px] min-h-[44px] flex items-center justify-center text-[#b65342] hover:bg-[#faeeec] rounded-xl transition-colors cursor-pointer shrink-0 font-bold active:scale-95" title="${escapeHtml(t.removePlayer)}">
                      ✕
                    </button>
                  ` : ''}
                </div>
              `).join('')}
            </div>

            ${playerNames.length < 8 ? `
              <button type="button" id="addPlayerBtn" class="w-full min-h-[46px] py-2.5 rounded-xl border border-dashed border-[#b6c2b9] hover:border-[#31594b] hover:bg-[#31594b]/5 text-[#31594b] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-98">
                <span>＋</span>
                <span>${escapeHtml(t.addPlayer)}</span>
              </button>
            ` : ''}

            <div id="setupError" class="hidden p-3 rounded-xl bg-[#fdf2f2] border border-[#f5c6c6] text-[#9b2c2c] text-xs font-semibold"></div>
          </div>

          <div class="bg-[#fffefa] border border-[#dfdfd6] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-2.5">
            <label class="font-extrabold text-xs sm:text-sm text-[#18231f] block">
              ${escapeHtml(t.strictnessLabel)}
            </label>
            <div class="grid gap-2">
              ${[
                { id: 'high', title: t.strictnessHigh, desc: t.strictnessHighDesc },
                { id: 'medium', title: t.strictnessMed, desc: t.strictnessMedDesc },
                { id: 'low', title: t.strictnessLow, desc: t.strictnessLowDesc },
              ].map((opt) => `
                <div data-strictness="${opt.id}" class="strictness-option min-h-[50px] p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 active:scale-99 ${strictness === opt.id ? 'border-[#31594b] bg-[#31594b]/8 shadow-2xs ring-1 ring-[#31594b]' : 'border-[#dfdfd6] bg-white hover:border-[#b8c2ba]'}">
                  <div class="w-5 h-5 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${strictness === opt.id ? 'border-[#31594b] bg-[#31594b] text-white font-bold text-xs' : 'border-[#c2c8c4] bg-white'}">
                    ${strictness === opt.id ? '✓' : ''}
                  </div>
                  <div class="min-w-0">
                    <h3 class="font-bold text-xs sm:text-sm text-[#18231f] leading-snug break-words">${escapeHtml(opt.title)}</h3>
                    <p class="text-[10px] sm:text-xs text-[#5a645e] mt-0.5 leading-relaxed break-words">${escapeHtml(opt.desc)}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="bg-[#fffefa] border border-[#dfdfd6] rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <label class="font-extrabold text-xs sm:text-sm text-[#18231f] flex items-center gap-1.5">
                <span>⏱️</span>
                <span>${escapeHtml(t.timerLengthLabel)}</span>
              </label>
              <p class="text-[11px] text-[#717b73] mt-0.5 break-words">
                ${escapeHtml(t.timerRuleStandard)}
              </p>
            </div>
            <div class="flex gap-2">
              ${[45, 60, 90].map((sec) => `
                <button type="button" data-timer-sec="${sec}" class="timer-btn min-h-[44px] min-w-[56px] px-3.5 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 cursor-pointer ${timerSeconds === sec ? 'bg-[#31594b] text-white shadow-2xs' : 'bg-[#eef1ed] text-[#47534b] hover:bg-[#e2e7e0]'}">
                  ${sec} ${escapeHtml(t.secondsSuffix)}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="bg-[#fffefa] border border-[#dfdfd6] rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <label class="font-extrabold text-xs sm:text-sm text-[#18231f] flex items-center gap-1.5">
                <span>📳</span>
                <span>${escapeHtml(t.vibrationSettingLabel)}</span>
              </label>
              <p class="text-[11px] text-[#717b73] mt-0.5 break-words">
                ${escapeHtml(t.vibrationSettingDesc)}
              </p>
            </div>
            <div>
              <button type="button" id="setupVibrationBtn" class="min-h-[44px] px-4 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 ${settings.vibrationEnabled ? 'bg-[#31594b] text-white shadow-2xs' : 'bg-[#eef1ed] text-[#5a645e] hover:bg-[#e2e7e0]'}">
                <span>${settings.vibrationEnabled ? '✓' : '✕'}</span>
                <span>${settings.vibrationEnabled ? escapeHtml(t.vibrationOn) : escapeHtml(t.vibrationOff)}</span>
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between gap-3 pt-1">
            <button type="button" id="setupBackBtn" class="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#e8ebe5] hover:bg-[#dde1d9] active:scale-95 text-[#18231f] font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer">
              <span>←</span>
              <span>${escapeHtml(t.backBtn)}</span>
            </button>

            <button type="submit" class="flex-1 sm:flex-none min-h-[46px] px-6 py-2.5 rounded-xl bg-[#31594b] hover:bg-[#25483b] active:scale-95 text-white font-bold text-xs sm:text-sm shadow-md shadow-[#31594b]/20 flex items-center justify-center gap-2 transition-all cursor-pointer">
              <span>▶</span>
              <span>${escapeHtml(t.beginGameBtn)}</span>
            </button>
          </div>
        </form>
      </div>
    `;

    // Bind inputs
    container.querySelectorAll('.player-input-item').forEach((input) => {
      input.addEventListener('input', (e) => {
        const target = e.target;
        const idx = Number(target.dataset.playerIdx);
        playerNames[idx] = target.value;
      });
    });

    container.querySelectorAll('[data-remove-idx]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget;
        const idx = Number(target.dataset.removeIdx);
        playerNames.splice(idx, 1);
        soundEffects.click(!settings.soundEnabled);
        renderSetupBody();
      });
    });

    document.getElementById('addPlayerBtn')?.addEventListener('click', () => {
      if (playerNames.length >= 8) return;
      const num = playerNames.length + 1;
      playerNames.push(settings.language === 'ru' ? `Игрок ${num}` : `Player ${num}`);
      soundEffects.click(!settings.soundEnabled);
      renderSetupBody(playerNames.length - 1);
    });

    document.getElementById('shuffleBtn')?.addEventListener('click', () => {
      soundEffects.click(!settings.soundEnabled);
      playerNames = shuffle(playerNames);
      renderSetupBody();
    });

    container.querySelectorAll('.strictness-option').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        const target = e.currentTarget;
        strictness = target.dataset.strictness;
        soundEffects.click(!settings.soundEnabled);
        renderSetupBody();
      });
    });

    container.querySelectorAll('.timer-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget;
        timerSeconds = Number(target.dataset.timerSec);
        soundEffects.click(!settings.soundEnabled);
        renderSetupBody();
      });
    });

    document.getElementById('setupVibrationBtn')?.addEventListener('click', () => {
      settings.vibrationEnabled = !settings.vibrationEnabled;
      saveStoredSettings(settings);
      soundEffects.click(!settings.soundEnabled);
      if (settings.vibrationEnabled) {
        soundEffects.vibrate(60);
      }
      renderSetupBody();
    });

    document.getElementById('setupBackBtn')?.addEventListener('click', () => {
      soundEffects.click(!settings.soundEnabled);
      if (state) state.screen = 'home';
      render();
    });

    document.getElementById('setupForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const cleaned = playerNames.map((n) => n.trim()).filter(Boolean);
      const errorEl = document.getElementById('setupError');

      if (cleaned.length < 3) {
        if (errorEl) {
          errorEl.textContent = t.validationMinPlayers;
          errorEl.classList.remove('hidden');
          smoothScrollTo(errorEl, { block: 'center' });
        }
        return;
      }

      const lower = cleaned.map((n) => n.toLowerCase());
      if (new Set(lower).size !== cleaned.length) {
        if (errorEl) {
          errorEl.textContent = t.validationUniqueNames;
          errorEl.classList.remove('hidden');
          smoothScrollTo(errorEl, { block: 'center' });
        }
        return;
      }

      soundEffects.click(!settings.soundEnabled);

      // Start game
      const initialPlayers = cleaned.map((name, i) => ({
        id: `p_${Date.now()}_${i}`,
        name,
        score: 0,
        bonus: 0,
      }));

      const initialPiles = {
        owl: shuffle(Array.from({ length: decksRU.owl.length }, (_, i) => i)),
        lark: shuffle(Array.from({ length: decksRU.lark.length }, (_, i) => i)),
        blitz: shuffle(Array.from({ length: decksRU.blitz.length }, (_, i) => i)),
      };

      const firstType = ROUND_SEQUENCE[0];
      const topicDraw = drawTopicChoices(firstType, initialPiles);
      const card = topicDraw.choices[0];
      const newPiles = topicDraw.newPiles;

      const draftScores = {};
      initialPlayers.forEach((p) => {
        draftScores[p.id] = { points: 0, bonus: false };
      });

      state = {
        screen: 'game',
        phase: 'briefing',
        round: 0,
        strictness,
        timerDuration: timerSeconds,
        remaining: timerSeconds,
        timerEndsAt: null,
        players: initialPlayers,
        card,
        piles: newPiles,
        topicChoices: topicDraw.choices,
        draftScores,
        history: [],
        startedAt: Date.now(),
        updatedAt: Date.now(),
      };

      saveStoredState(state);
      render();
    });

    if (typeof focusIdx === 'number') {
      setTimeout(() => {
        const inputs = container.querySelectorAll('.player-input-item');
        const targetInput = inputs[focusIdx];
        if (targetInput) {
          targetInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          targetInput.focus();
          targetInput.select();
        }
      }, 50);
    }
  }

  renderSetupBody();
}

// Screen: Game
function renderGameScreen(container, t) {
  if (!state || !state.card) return;

  const r = state.round;
  const card = state.card;
  const roundType = card.type;
  const strictness = state.strictness;
  const hostPlayer = state.players[r % state.players.length] || state.players[0];
  const isBriefing = state.phase === 'briefing';
  const isTimer = state.phase === 'timer';
  const isScoring = state.phase === 'scoring';
  const isLastRound = r === 5;

  const typeBadgeStyles = {
    owl: 'bg-[#e9edf6] text-[#2e4776] border-[#c9d4e8]',
    lark: 'bg-[#f7e9d9] text-[#7a4611] border-[#e7cfb6]',
    blitz: 'bg-[#eee6f4] text-[#59336e] border-[#dbcae6]',
  };

  container.innerHTML = `
    <div id="gameScreenTop" class="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-5 space-y-3.5 sm:space-y-6 animate-in fade-in duration-200">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 bg-[#fffefa] border border-[#dfdfd6] rounded-xl sm:rounded-2xl p-2.5 sm:px-4 sm:py-3 shadow-2xs">
        <div class="flex items-center gap-1 sm:gap-1.5 w-full sm:w-auto justify-between sm:justify-start overflow-x-auto pb-0.5">
          ${[0, 1, 2, 3, 4, 5].map((idx) => {
            const isDone = idx < r;
            const isCurrent = idx === r;
            const roundTypeIcon = idx % 3 === 0 ? '🦉' : idx % 3 === 1 ? '🐦' : '⚡';
            return `
              <div class="flex items-center gap-1 px-2 py-1 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition-all shrink-0 ${isCurrent ? 'bg-[#31594b] text-white shadow-2xs ring-1 sm:ring-2 ring-[#31594b]/20 scale-102' : isDone ? 'bg-[#d6e3db] text-[#224337]' : 'bg-[#e8eae6] text-[#78827a]'}" title="${escapeHtml(t.roundBadgeMini.replace('{num}', String(idx + 1)))}">
                <span>${roundTypeIcon}</span>
                <span class="font-extrabold">${idx + 1}</span>
                ${isDone ? '<span>✓</span>' : ''}
              </div>
            `;
          }).join('')}
        </div>

        <div class="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#3b4740] truncate max-w-full">
          <span>👑</span>
          <span class="truncate">
            ${escapeHtml(t.hostFirstReader.replace('{name}', hostPlayer.name))}
          </span>
        </div>
      </div>

      ${isScoring ? `
        <div class="sm:hidden flex items-center justify-between gap-2 p-2.5 px-3.5 rounded-xl bg-[#31594b]/10 border border-[#31594b]/20 text-[#224337] text-xs font-bold animate-in fade-in">
          <div class="flex items-center gap-1.5 truncate">
            <span>📝</span>
            <span class="truncate">${escapeHtml(t.step3Title)}</span>
          </div>
          <button id="quickScrollToScoringBtn" type="button" class="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#31594b] text-white text-[11px] font-bold shadow-2xs active:scale-95 transition-all shrink-0 cursor-pointer flex items-center gap-1">
            ${escapeHtml(t.jumpToScoring)}
          </button>
        </div>
      ` : ''}

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <div id="gameCardSection" class="lg:col-span-7 flex flex-col">
          <div class="flex-1 bg-[#fffefa] border border-[#dfdfd6] rounded-2xl sm:rounded-3xl p-4 sm:p-7 shadow-2xs flex flex-col justify-between relative overflow-hidden">
            <div class="absolute -bottom-10 -right-4 text-[#f4f2e9] font-black text-[130px] sm:text-[210px] select-none pointer-events-none leading-none -z-0">
              6
            </div>

            <div class="relative z-10 flex items-center justify-between">
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] sm:text-xs font-black tracking-wide uppercase ${typeBadgeStyles[roundType]}">
                <span>${roundType === 'owl' ? '🦉' : roundType === 'lark' ? '🐦' : '⚡'}</span>
                <span>${escapeHtml(t[`${roundType}Name`])}</span>
              </span>

              <div class="flex items-center gap-1 sm:gap-2">
                <button id="speakPromptBtn" class="min-w-[36px] min-h-[36px] sm:min-w-[40px] sm:min-h-[40px] flex items-center justify-center rounded-xl text-[#616c64] hover:bg-[#eef1ed] active:scale-95 transition-all cursor-pointer" title="${escapeHtml(t.readPromptAloud)}" aria-label="${escapeHtml(t.readPromptAloud)}">
                  🔊
                </button>
                ${isBriefing ? `
                  <button id="changeCardBtn" class="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold text-[#616c64] hover:bg-[#eef1ed] active:scale-95 transition-all cursor-pointer" title="${escapeHtml(t.changePrompt)}">
                    <span>↻</span>
                    <span class="hidden sm:inline">${escapeHtml(t.changePrompt)}</span>
                  </button>
                ` : ''}
              </div>
            </div>

            <div class="relative z-10 my-3.5 sm:my-6">
              ${roundType === 'blitz' && card.items ? `
                <div class="space-y-2.5">
                  <div class="text-[11px] font-bold uppercase tracking-wider text-[#77528b]">
                    ${escapeHtml(t.blitzCategoriesHeader)}
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    ${card.items.map((item, idx) => `
                      <div class="p-2 sm:p-2.5 rounded-xl bg-[#f6f2f9] border border-[#e8ddee] text-xs font-extrabold text-[#3a204d] flex items-center gap-2">
                        <span class="w-5 h-5 rounded-md bg-[#77528b] text-white font-black text-[10px] flex items-center justify-center shrink-0">
                          ${idx + 1}
                        </span>
                        <span class="leading-snug break-words">${escapeHtml(item)}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : `
                <div class="space-y-2">
                  <p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#717b73]">
                    ${escapeHtml(roundType === 'owl' ? t.popularCategoryHeader : t.rareCategoryHeader)}
                  </p>
                  <h1 class="text-xl sm:text-3xl md:text-4xl font-extrabold text-[#18231f] tracking-tight leading-tight uppercase font-serif break-words hyphens-auto">
                    ${escapeHtml(card.title)}
                  </h1>
                </div>
              `}
            </div>

            <div class="relative z-10 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-[#f5f7f3] border border-[#dce3da] text-xs space-y-1 leading-relaxed break-words">
              <div class="flex items-center gap-1.5 font-extrabold text-[#224337]">
                <span>✨</span>
                <span>${escapeHtml(t[`${roundType}Desc`])}</span>
              </div>
              <p class="text-[#47534b]">
                ${escapeHtml(t[`${roundType}PromptInstruction`])}
              </p>
            </div>
          </div>
        </div>

        <div class="lg:col-span-5 space-y-4 sm:space-y-5">
          <div id="timerSection" class="bg-[#192722] text-white border border-[#2d4239] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-sm text-center flex flex-col items-center justify-between">
            <div class="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#a8b7ac]">
              ${escapeHtml(isTimer ? t.timerRunningTitle : t.timeRemaining)}
            </div>

            <div id="timerDisplay" class="my-1 sm:my-2 font-mono font-extrabold text-4xl sm:text-6xl tracking-tight transition-colors ${state.remaining <= 10 && isTimer ? 'text-[#f29a79] scale-102' : 'text-white'}">
              ${formatTime(state.remaining)}
            </div>

            <p class="text-[11px] sm:text-xs text-[#aeb9b2] max-w-xs mb-3 break-words">
              ${escapeHtml(isBriefing ? t.sheetReminder : isTimer ? t.timerRunningHint : t.timeUpCompare)}
            </p>

            <div class="flex flex-wrap items-center justify-center gap-2 w-full">
              ${isBriefing ? `
                <button id="startTimerBtn" class="w-full min-h-[46px] py-2.5 sm:py-3 px-5 rounded-xl sm:rounded-2xl bg-[#e3c174] hover:bg-[#d8b564] active:scale-98 text-[#111c19] font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer">
                  <span>▶</span>
                  <span>${escapeHtml(t.startTimerBtn)}</span>
                </button>
              ` : isTimer ? `
                <button id="pauseTimerBtn" class="flex-1 min-h-[44px] py-2.5 px-3 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer">
                  <span>⏸</span>
                  <span>${escapeHtml(t.pauseBtn)}</span>
                </button>
                <button id="addTimeBtn" class="min-h-[44px] py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-0.5 transition-all cursor-pointer">
                  <span>+15${escapeHtml(t.secondsSuffix)}</span>
                </button>
                <button id="finishTimerEarlyBtn" class="min-h-[44px] py-2.5 px-3.5 rounded-xl bg-[#e3c174] hover:bg-[#d8b564] active:scale-95 text-[#111c19] font-extrabold text-xs transition-all cursor-pointer shadow-xs">
                  ${escapeHtml(t.finishTimerEarly)}
                </button>
              ` : `
                <button id="restartTimerBtn" class="w-full min-h-[44px] py-2 px-3.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-98 text-white/90 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer">
                  <span>↻</span>
                  <span>${escapeHtml(t.restartTimerBtn)}</span>
                </button>
              `}
            </div>
          </div>

          <div class="bg-[#fffefa] border border-[#dfdfd6] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xs space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="font-extrabold text-xs sm:text-sm text-[#18231f] flex items-center gap-1.5">
                <span>📋</span>
                <span>
                  ${escapeHtml(isScoring ? t.step3Title : isTimer ? t.step2Title : t.step1Title)}
                </span>
              </h3>
              <button id="gameRulesLink" class="text-xs font-bold text-[#31594b] hover:underline cursor-pointer">
                ${escapeHtml(t.referenceHelp)}
              </button>
            </div>

            <div class="space-y-2 text-xs text-[#47534b] leading-relaxed break-words">
              <div class="p-2.5 rounded-xl bg-[#f8f9f7] border border-[#e5e9e3]">
                <div class="font-bold text-[#18231f] leading-snug">
                  ${escapeHtml(isScoring ? t[`${roundType}ScoringInstruction`] : isTimer ? t.step2Hint : t.hostInstruction)}
                </div>
              </div>

              <div class="p-2.5 rounded-xl bg-[#fff9e6] border border-[#f0deab] text-[#6b5420] text-[11px] sm:text-xs flex items-start gap-1.5 leading-snug break-words">
                <span>⚠️</span>
                <div>
                  <span class="font-bold">
                    ${escapeHtml(t.strictnessPrefix)}: ${escapeHtml(strictness === 'high' ? t.strictnessHighTag : strictness === 'medium' ? t.strictnessMedTag : t.strictnessLowTag)}.
                  </span>
                  <span>
                    ${escapeHtml(strictness === 'high' ? t.strictnessHighRule : strictness === 'medium' ? t.strictnessMedRule : t.strictnessLowRule)}
                  </span>
                </div>
              </div>
            </div>

            ${isBriefing ? `
              <button id="skipToScoringBtn" class="w-full min-h-[42px] py-2 px-3 rounded-xl border border-[#d2d7cf] hover:bg-[#eef1ed] active:scale-98 text-[#31594b] font-bold text-xs transition-all cursor-pointer">
                ${escapeHtml(t.skipToScoring)}
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      ${isScoring ? `
        <div id="scoringSection" class="bg-[#fffefa] border border-[#dfdfd6] rounded-2xl sm:rounded-3xl p-3 sm:p-6 shadow-2xs space-y-3.5 sm:space-y-4 animate-in slide-in-from-bottom-2 duration-300">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#dfdfd6]">
            <div>
              <h2 class="text-base sm:text-xl font-extrabold text-[#18231f] tracking-tight">
                ${escapeHtml(t.scoringTitle)}
              </h2>
              <p class="text-xs text-[#616c64] break-words">
                ${escapeHtml(t.scoringSub)}
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button id="quickScrollToCardBtn" type="button" class="sm:hidden min-h-[36px] text-[11px] font-bold text-[#31594b] flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#eef1ed] hover:bg-[#e2e7e0] active:scale-95 transition-all cursor-pointer shrink-0">
                ${escapeHtml(t.jumpToCard)}
              </button>
              <div class="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#f3f1e9] text-[#554b38] leading-tight break-words hidden min-[480px]:block">
                ${escapeHtml(t.disputeNote)}
              </div>
            </div>
          </div>

          <div class="sm:hidden text-[11px] text-[#717b73] text-center font-medium py-0.5">
            ${escapeHtml(t.swipeTableHint)}
          </div>

          <div class="overflow-x-auto -mx-1 sm:mx-0 rounded-xl border border-[#dfdfd6] shadow-2xs overscroll-x-contain">
            <table class="w-full text-left text-xs sm:text-sm border-collapse min-w-[360px]">
              <thead>
                <tr class="border-b border-[#dfdfd6] text-[#717b73] text-[10px] sm:text-xs uppercase tracking-wider font-bold bg-[#faf9f5]">
                  <th class="py-2.5 px-2.5 sm:px-3 sticky left-0 bg-[#faf9f5] z-20 shadow-[2px_0_4px_rgba(0,0,0,0.04)]">${escapeHtml(t.playerCol)}</th>
                  <th class="py-2.5 px-2 sm:px-3">${escapeHtml(t.pointsCol)}</th>
                  <th class="py-2.5 px-2 text-center">${escapeHtml(t.bonusCol)}</th>
                  <th class="py-2.5 px-2.5 sm:px-3 text-right">${escapeHtml(t.totalCol)}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#edf0eb] bg-white">
                ${state.players.map((p) => {
                  const draft = state.draftScores[p.id] || { points: 0, bonus: false };
                  const roundScore = draft.points + (draft.bonus ? 1 : 0);
                  const isHost = p.id === hostPlayer.id;

                  return `
                    <tr id="scoringRow_${p.id}" class="hover:bg-[#fcfbf7] transition-colors">
                      <td class="py-2.5 px-2.5 sm:px-3 font-bold text-[#18231f] sticky left-0 bg-white z-10 shadow-[2px_0_4px_rgba(0,0,0,0.04)] min-w-[95px] max-w-[125px] sm:max-w-none">
                        <div class="flex items-center gap-1.5 leading-snug">
                          ${isHost ? `<span title="${escapeHtml(t.roundHostTitle)}" class="inline-flex items-center shrink-0">👑</span>` : ''}
                          <span class="break-words truncate sm:overflow-visible">${escapeHtml(p.name)}</span>
                        </div>
                        <span class="text-[10px] font-normal text-[#78827a] block leading-tight">
                          ${escapeHtml(t.scoreBeforeRound.replace('{score}', String(p.score)))}
                        </span>
                      </td>

                      <td class="py-2.5 px-1.5 sm:px-3">
                        <div class="flex items-center gap-1 flex-wrap">
                          ${[0, 1, 2, 3, 4, 5, 6].map((pts) => `
                            <button type="button" data-score-pid="${p.id}" data-pts="${pts}" class="score-chip min-w-[32px] min-h-[32px] sm:min-w-[36px] sm:min-h-[36px] px-2 py-1 rounded-lg font-extrabold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer flex items-center justify-center ${draft.points === pts ? 'bg-[#31594b] text-white shadow-2xs scale-105' : 'bg-[#eef1ed] text-[#47534b] hover:bg-[#dfe4dd]'}">
                              ${pts}
                            </button>
                          `).join('')}
                        </div>
                      </td>

                      <td class="py-2.5 px-1.5 sm:px-2 text-center">
                        <label class="inline-flex items-center gap-1.5 min-h-[36px] px-2 py-1 rounded-lg hover:bg-black/5 active:scale-95 cursor-pointer select-none">
                          <input type="checkbox" data-bonus-pid="${p.id}" ${draft.bonus ? 'checked' : ''} class="w-4 h-4 rounded text-[#31594b] focus:ring-[#31594b] cursor-pointer" />
                          <span id="bonusLabel_${p.id}" class="text-xs font-bold ${draft.bonus ? 'text-[#31594b]' : 'text-[#8b948d]'}">+1</span>
                        </label>
                      </td>

                      <td class="py-2.5 px-2.5 sm:px-3 text-right whitespace-nowrap">
                        <div id="roundScoreBadge_${p.id}" class="font-mono font-extrabold text-sm sm:text-base text-[#31594b]">
                          +${roundScore}
                        </div>
                        <div id="roundTotalBadge_${p.id}" class="text-[10px] text-[#78827a]">
                          ${escapeHtml(t.roundTotalLabel.replace('{total}', String(p.score + roundScore)))}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div class="p-2.5 sm:p-3 rounded-xl bg-[#f3f1e9] border border-[#e6e2d3] text-[11px] sm:text-xs text-[#554b38] leading-relaxed break-words">
            ${escapeHtml(t.bonusHint)}
          </div>

          <div class="flex justify-end pt-1">
            <button id="saveRoundBtn" class="w-full sm:w-auto min-h-[48px] px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-[#31594b] hover:bg-[#25483b] active:scale-98 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-[#31594b]/20 flex items-center justify-center gap-2 transition-all cursor-pointer">
              <span>${escapeHtml(isLastRound ? t.finishGameBtn : t.saveAndNextRound)}</span>
              <span>→</span>
            </button>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  // Bind game screen actions
  document.getElementById('speakPromptBtn')?.addEventListener('click', speakCurrentPrompt);

  document.getElementById('quickScrollToScoringBtn')?.addEventListener('click', () => {
    smoothScrollTo('scoringSection', { block: 'start' });
  });

  document.getElementById('quickScrollToCardBtn')?.addEventListener('click', () => {
    smoothScrollTo('gameScreenTop', { block: 'start' });
  });

  document.getElementById('changeCardBtn')?.addEventListener('click', () => {
    soundEffects.click(!settings.soundEnabled);
    const { card: nextCard, newPiles } = drawCard(roundType, state.piles);
    state.card = nextCard;
    state.piles = newPiles;
    state.remaining = state.timerDuration;
    state.timerEndsAt = null;
    state.phase = 'briefing';
    saveStoredState(state);
    render();
  });

  document.getElementById('startTimerBtn')?.addEventListener('click', () => {
    soundEffects.click(!settings.soundEnabled);
    state.phase = 'timer';
    state.timerEndsAt = Date.now() + state.remaining * 1000;
    saveStoredState(state);
    render();
    smoothScrollTo('timerSection', { block: 'center', delay: 80 });
  });

  document.getElementById('pauseTimerBtn')?.addEventListener('click', () => {
    soundEffects.click(!settings.soundEnabled);
    state.remaining = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000));
    state.timerEndsAt = null;
    state.phase = 'briefing';
    saveStoredState(state);
    render();
  });

  document.getElementById('addTimeBtn')?.addEventListener('click', () => {
    soundEffects.click(!settings.soundEnabled);
    const currentRem = state.timerEndsAt
      ? Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000))
      : state.remaining;
    const newRem = currentRem + 15;
    state.remaining = newRem;
    state.timerEndsAt = state.timerEndsAt ? Date.now() + newRem * 1000 : null;
    saveStoredState(state);
    render();
  });

  document.getElementById('finishTimerEarlyBtn')?.addEventListener('click', () => {
    soundEffects.gong(!settings.soundEnabled);
    if (settings.vibrationEnabled) {
      soundEffects.vibrate([300, 100, 450]);
    }
    state.phase = 'scoring';
    state.timerEndsAt = null;
    state.remaining = 0;
    saveStoredState(state);
    render();
    smoothScrollTo('scoringSection', { block: 'start', delay: 100 });
  });

  document.getElementById('restartTimerBtn')?.addEventListener('click', () => {
    soundEffects.click(!settings.soundEnabled);
    state.phase = 'briefing';
    state.remaining = state.timerDuration;
    state.timerEndsAt = null;
    saveStoredState(state);
    render();
  });

  document.getElementById('skipToScoringBtn')?.addEventListener('click', () => {
    soundEffects.click(!settings.soundEnabled);
    state.phase = 'scoring';
    state.timerEndsAt = null;
    state.remaining = 0;
    saveStoredState(state);
    render();
    smoothScrollTo('scoringSection', { block: 'start', delay: 100 });
  });

  document.getElementById('gameRulesLink')?.addEventListener('click', () => {
    soundEffects.click(!settings.soundEnabled);
    rulesModalOpen = true;
    renderRulesModal(t);
  });

  // In-place scoring update helper: avoids full container re-render and eliminates scroll jumps
  function updateScoringRow(pid) {
    const p = state.players.find((x) => x.id === pid);
    if (!p) return;
    const draft = state.draftScores[pid] || { points: 0, bonus: false };
    const roundScore = draft.points + (draft.bonus ? 1 : 0);

    // Update score chip states
    container.querySelectorAll(`.score-chip[data-score-pid="${pid}"]`).forEach((btn) => {
      const pts = Number(btn.dataset.pts);
      if (pts === draft.points) {
        btn.className = 'score-chip min-w-[32px] min-h-[32px] sm:min-w-[36px] sm:min-h-[36px] px-2 py-1 rounded-lg font-extrabold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer flex items-center justify-center bg-[#31594b] text-white shadow-2xs scale-105';
      } else {
        btn.className = 'score-chip min-w-[32px] min-h-[32px] sm:min-w-[36px] sm:min-h-[36px] px-2 py-1 rounded-lg font-extrabold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer flex items-center justify-center bg-[#eef1ed] text-[#47534b] hover:bg-[#dfe4dd]';
      }
    });

    // Update bonus checkbox
    const chk = container.querySelector(`[data-bonus-pid="${pid}"]`);
    if (chk) chk.checked = !!draft.bonus;

    const bonusLabel = document.getElementById(`bonusLabel_${pid}`);
    if (bonusLabel) {
      bonusLabel.className = `text-xs font-bold ${draft.bonus ? 'text-[#31594b]' : 'text-[#8b948d]'}`;
    }

    // Update round and total badges
    const scoreBadge = document.getElementById(`roundScoreBadge_${pid}`);
    if (scoreBadge) scoreBadge.textContent = `+${roundScore}`;

    const totalBadge = document.getElementById(`roundTotalBadge_${pid}`);
    if (totalBadge) totalBadge.textContent = t.roundTotalLabel.replace('{total}', String(p.score + roundScore));
  }

  // Score buttons
  container.querySelectorAll('.score-chip').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      soundEffects.click(!settings.soundEnabled);
      if (settings.vibrationEnabled) {
        soundEffects.vibrate(35);
      }
      const target = e.currentTarget;
      const pid = target.dataset.scorePid;
      const pts = Number(target.dataset.pts);
      const currentDraft = state.draftScores[pid] || { points: 0, bonus: false };
      const autoBonus = pts === 6 ? true : currentDraft.bonus;
      state.draftScores[pid] = { points: pts, bonus: autoBonus };
      saveStoredState(state);
      updateScoringRow(pid);
    });
  });

  // Bonus checkboxes
  container.querySelectorAll('[data-bonus-pid]').forEach((chk) => {
    chk.addEventListener('change', (e) => {
      soundEffects.click(!settings.soundEnabled);
      if (settings.vibrationEnabled) {
        soundEffects.vibrate(35);
      }
      const target = e.currentTarget;
      const pid = target.dataset.bonusPid;
      const currentDraft = state.draftScores[pid] || { points: 0, bonus: false };
      state.draftScores[pid] = { points: currentDraft.points, bonus: target.checked };
      saveStoredState(state);
      updateScoringRow(pid);
    });
  });

  // Save round and advance
  document.getElementById('saveRoundBtn')?.addEventListener('click', () => {
    soundEffects.click(!settings.soundEnabled);

    // Compute updated players totals
    state.players = state.players.map((p) => {
      const draft = state.draftScores[p.id] || { points: 0, bonus: false };
      const roundTotal = draft.points + (draft.bonus ? 1 : 0);
      return {
        ...p,
        score: p.score + roundTotal,
        bonus: p.bonus + (draft.bonus ? 1 : 0),
      };
    });

    state.history.push({
      roundIndex: r,
      type: roundType,
      cardIndex: card.cardIndex,
      promptTitle: card.title,
      blitzItems: card.items,
      hostPlayerId: hostPlayer.id,
      scores: { ...state.draftScores },
    });

    // Check if game complete
    if (r >= 5) {
      soundEffects.fanfare(!settings.soundEnabled);
      state.screen = 'finish';
      state.phase = 'scoring';
      saveStoredState(state);
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Advance to next round
    const nextRound = r + 1;
    const nextType = ROUND_SEQUENCE[nextRound];
    let nextCard;
    let newPiles;
    if (nextType === 'owl' || nextType === 'lark') {
      const topicDraw = drawTopicChoices(nextType, state.piles);
      state.topicChoices = topicDraw.choices;
      nextCard = topicDraw.choices[0];
      newPiles = topicDraw.newPiles;
    } else {
      const cardDraw = drawCard(nextType, state.piles);
      nextCard = cardDraw.card;
      newPiles = cardDraw.newPiles;
      state.topicChoices = null;
    }

    const nextDraft = {};
    state.players.forEach((p) => {
      nextDraft[p.id] = { points: 0, bonus: false };
    });

    state.round = nextRound;
    state.card = nextCard;
    state.piles = newPiles;
    state.draftScores = nextDraft;
    state.phase = 'briefing';
    state.remaining = state.timerDuration;
    state.timerEndsAt = null;

    saveStoredState(state);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// Screen: Finish
function renderFinishScreen(container, t) {
  if (!state) return;

  const ranked = [...state.players].sort((a, b) => b.score - a.score || b.bonus - a.bonus);
  const topPlayer = ranked[0];
  const winners = ranked.filter((p) => p.score === topPlayer.score && p.bonus === topPlayer.bonus);
  const isTie = winners.length > 1;

  const getPromptTitle = (type, cardIndex) => {
    const deck = settings.language === 'en' ? decksEN : decksRU;
    if (type === 'blitz') {
      return settings.language === 'en' ? 'Six quick categories' : 'Шесть быстрых категорий';
    }
    return deck[type][cardIndex] || decksRU[type][cardIndex] || '';
  };

  container.innerHTML = `
    <div class="max-w-3xl mx-auto px-3 sm:px-4 py-5 sm:py-10 space-y-5 sm:space-y-7 animate-in fade-in duration-300">
      <div class="bg-linear-to-b from-[#192722] to-[#121c18] text-white border border-[#2d4239] rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-center shadow-lg relative overflow-hidden">
        <div class="relative z-10 space-y-3 sm:space-y-4">
          <div class="inline-flex items-center justify-center w-14 h-14 sm:w-18 sm:h-18 rounded-full bg-[#e3c174]/20 border border-[#e3c174]/40 text-[#e3c174] shadow-inner mb-1 text-3xl">
            🏆
          </div>

          <div class="inline-flex items-center gap-1.5 px-2.5 py-0.8 rounded-full bg-white/10 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#aeb9b2]">
            <span>✨</span>
            <span>${escapeHtml(t.gameComplete)}</span>
          </div>

          <h1 class="text-2xl sm:text-4xl font-extrabold tracking-tight font-serif text-[#fffefa] break-words leading-tight">
            ${isTie
              ? escapeHtml(t.winnersTie.replace('{names}', winners.map((w) => w.name).join(' & ')))
              : escapeHtml(t.winnerTitle.replace('{name}', topPlayer.name))}
          </h1>

          <p class="text-xs sm:text-sm text-[#aeb9b2] max-w-md mx-auto break-words">
            ${isTie
              ? `${winners[0].score} ${escapeHtml(t.pointsWord)} · ${winners[0].bonus} ${escapeHtml(t.bonusesWord)}`
              : `${topPlayer.score} ${escapeHtml(t.pointsWord)} · ${topPlayer.bonus} ${escapeHtml(t.bonusesWord)}`}
          </p>

          <div class="pt-1 text-[11px] sm:text-xs text-[#8c9c91] break-words">
            ${escapeHtml(t.tieBreakerNote)}
          </div>
        </div>
      </div>

      <div class="bg-[#fffefa] border border-[#dfdfd6] rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xs space-y-4 sm:space-y-5">
        <h2 class="text-base sm:text-lg font-extrabold text-[#18231f] flex items-center gap-2">
          <span>🎖️</span>
          <span>${escapeHtml(t.finalScoreboard)}</span>
        </h2>

        <div class="space-y-2 sm:space-y-2.5">
          ${ranked.map((player, idx) => {
            const isWinner = winners.some((w) => w.id === player.id);
            return `
              <div class="flex items-center justify-between p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border transition-all ${isWinner ? 'bg-[#fcfaf3] border-[#e7d8b5] shadow-2xs ring-1 ring-[#e7d8b5]' : 'bg-[#fafbfa] border-[#e5e8e3]'}">
                <div class="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center font-extrabold text-xs sm:text-sm shrink-0 ${idx === 0 ? 'bg-[#e3c174] text-[#111c19]' : idx === 1 ? 'bg-[#cfd5d1] text-[#2c3831]' : idx === 2 ? 'bg-[#dfbc98] text-[#3e2b19]' : 'bg-[#eef1ed] text-[#717b73]'}">
                    ${idx + 1}
                  </div>
                  <div class="min-w-0">
                    <div class="font-extrabold text-xs sm:text-base text-[#18231f] flex items-center gap-1.5 truncate">
                      <span class="truncate">${escapeHtml(player.name)}</span>
                      ${isWinner ? '<span class="text-[#d8ad58]">★</span>' : ''}
                    </div>
                    <span class="text-[11px] sm:text-xs text-[#717b73]">
                      ${player.bonus} ${escapeHtml(t.bonusesWord)}
                    </span>
                  </div>
                </div>

                <div class="text-right shrink-0">
                  <div class="font-mono font-black text-lg sm:text-2xl text-[#18231f] leading-none">
                    ${player.score}
                  </div>
                  <span class="text-[10px] sm:text-xs font-semibold text-[#717b73]">${escapeHtml(t.pointsWord)}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="pt-1">
          <button id="toggleHistoryBtn" class="w-full min-h-[44px] py-2.5 px-3 rounded-xl border border-[#dfdfd6] hover:bg-[#f6f7f5] active:scale-98 text-xs font-bold text-[#47534b] flex items-center justify-center gap-1.5 transition-all cursor-pointer">
            <span>📊</span>
            <span>${escapeHtml(t.viewRoundBreakdown)}</span>
          </button>

          <div id="historyTableContainer" class="hidden mt-3 overflow-x-auto -mx-1 sm:mx-0 rounded-xl border border-[#dfdfd6] shadow-2xs overscroll-x-contain">
            <table class="w-full text-left text-xs border-collapse min-w-[360px]">
              <thead>
                <tr class="border-b border-[#dfdfd6] text-[#717b73] font-bold uppercase text-[10px] bg-[#faf9f5]">
                  <th class="py-2.5 px-2.5 sticky left-0 bg-[#faf9f5] z-10 shadow-[2px_0_4px_rgba(0,0,0,0.03)]">${escapeHtml(t.roundCol)}</th>
                  <th class="py-2.5 px-2">${escapeHtml(t.themeCol)}</th>
                  ${ranked.map((p) => `
                    <th class="py-2.5 px-1.5 text-right truncate max-w-[65px]">${escapeHtml(p.name)}</th>
                  `).join('')}
                </tr>
              </thead>
              <tbody class="divide-y divide-[#edf0eb] bg-white">
                ${state.history.map((h, rIdx) => {
                  const rIcon = h.type === 'owl' ? '🦉' : h.type === 'lark' ? '🐦' : '⚡';
                  const title = getPromptTitle(h.type, h.cardIndex);
                  return `
                    <tr class="hover:bg-[#f9faf8]">
                      <td class="py-2.5 px-2.5 font-bold whitespace-nowrap text-[11px] sticky left-0 bg-white z-10 shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
                        ${rIcon} Р${rIdx + 1}
                      </td>
                      <td class="py-2.5 px-2 text-[#5a645e] max-w-[130px] sm:max-w-[180px] truncate" title="${escapeHtml(title)}">
                        ${escapeHtml(title)}
                      </td>
                      ${ranked.map((p) => {
                        const score = h.scores[p.id];
                        if (!score) return '<td class="py-2.5 px-1.5 text-right text-[#b2bab4]">-</td>';
                        const total = score.points + (score.bonus ? 1 : 0);
                        return `
                          <td class="py-2.5 px-1.5 text-right font-mono font-bold text-xs">
                            ${total}${score.bonus ? '<span class="text-[#31594b] font-black">*</span>' : ''}
                          </td>
                        `;
                      }).join('')}
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            <p class="text-[10px] sm:text-[11px] text-[#818c83] p-2.5 bg-[#faf9f5] border-t border-[#dfdfd6] break-words">
              ${escapeHtml(t.bonusAsteriskNote)}
            </p>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-3 border-t border-[#dfdfd6]">
          <button id="finishHomeBtn" class="w-full sm:w-auto min-h-[46px] px-4 py-2.5 rounded-xl bg-[#e8ebe5] hover:bg-[#dde1d9] active:scale-95 text-[#18231f] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer">
            <span>🏠</span>
            <span>${escapeHtml(t.homeBtn)}</span>
          </button>

          <button id="rematchBtn" class="w-full sm:w-auto min-h-[48px] px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-[#31594b] hover:bg-[#25483b] active:scale-98 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-[#31594b]/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer">
            <span>↻</span>
            <span>${escapeHtml(t.playAgainSamePlayers)}</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('toggleHistoryBtn')?.addEventListener('click', () => {
    soundEffects.click(!settings.soundEnabled);
    const tableEl = document.getElementById('historyTableContainer');
    if (tableEl) {
      const isHidden = tableEl.classList.toggle('hidden');
      if (!isHidden) {
        smoothScrollTo('historyTableContainer', { block: 'nearest', delay: 50 });
      }
    }
  });

  document.getElementById('finishHomeBtn')?.addEventListener('click', () => {
    soundEffects.click(!settings.soundEnabled);
    state.screen = 'home';
    saveStoredState(state);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('rematchBtn')?.addEventListener('click', () => {
    soundEffects.click(!settings.soundEnabled);
    const playerNames = state.players.map((p) => p.name);
    const initialPlayers = playerNames.map((name, i) => ({
      id: `p_${Date.now()}_${i}`,
      name,
      score: 0,
      bonus: 0,
    }));

    const initialPiles = {
      owl: shuffle(Array.from({ length: decksRU.owl.length }, (_, i) => i)),
      lark: shuffle(Array.from({ length: decksRU.lark.length }, (_, i) => i)),
      blitz: shuffle(Array.from({ length: decksRU.blitz.length }, (_, i) => i)),
    };

    const firstType = ROUND_SEQUENCE[0];
    const topicDraw = drawTopicChoices(firstType, initialPiles);
    const card = topicDraw.choices[0];
    const newPiles = topicDraw.newPiles;

    const draftScores = {};
    initialPlayers.forEach((p) => {
      draftScores[p.id] = { points: 0, bonus: false };
    });

    state = {
      screen: 'game',
      phase: 'briefing',
      round: 0,
      strictness: state.strictness,
      timerDuration: state.timerDuration,
      remaining: state.timerDuration,
      timerEndsAt: null,
      players: initialPlayers,
      card,
      piles: newPiles,
      topicChoices: topicDraw.choices,
      draftScores,
      history: [],
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    saveStoredState(state);
    render();
  });
}

// Modal: Rules
function renderRulesModal(t) {
  let modal = document.getElementById('rulesModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'rulesModal';
    document.body.appendChild(modal);
  }

  if (!rulesModalOpen) {
    modal.innerHTML = '';
    return;
  }

  const currentStrictness = state?.strictness || settings.defaultStrictness;

  modal.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div class="relative w-full max-w-xl max-h-[92vh] flex flex-col bg-[#fffefa] text-[#18231f] rounded-2xl sm:rounded-3xl shadow-xl border border-[#dfdfd6] overflow-hidden" role="dialog" aria-modal="true">
        <div class="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-[#13231d] text-white">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-lg bg-[#e3c174]/20 border border-[#e3c174]/40 flex items-center justify-center text-[#e3c174] shrink-0 font-bold">
              ?
            </div>
            <div class="min-w-0">
              <p class="text-[10px] font-bold uppercase tracking-wider text-[#98a79d] truncate">
                ${escapeHtml(t.rulesModalSubtitle)}
              </p>
              <h2 class="text-base sm:text-lg font-extrabold tracking-tight truncate">
                ${escapeHtml(t.rulesModalTitle)}
              </h2>
            </div>
          </div>
          <button id="closeRulesBtn" class="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer shrink-0 font-bold text-base" aria-label="${escapeHtml(t.rulesClose)}">
            ✕
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4 text-xs sm:text-sm leading-relaxed overscroll-contain">
          <section class="bg-[#f5f7f3] border border-[#dce3da] rounded-xl p-3 sm:p-4">
            <div class="flex items-start gap-2.5">
              <span class="text-base shrink-0 mt-0.5">🏆</span>
              <div>
                <h3 class="font-bold text-xs sm:text-sm text-[#18231f] mb-1">${escapeHtml(t.rulesGoal)}</h3>
                <p class="text-[#47534b] text-[11px] sm:text-xs leading-relaxed break-words">${escapeHtml(t.rulesGoalText)}</p>
                <div class="mt-2 flex flex-wrap gap-1.5 text-[10px] sm:text-xs font-semibold">
                  <span class="px-2 py-0.5 rounded-md bg-[#e9edf6] text-[#2b4372]">1 & 4: ${escapeHtml(t.owlName)}</span>
                  <span class="px-2 py-0.5 rounded-md bg-[#f7e9d9] text-[#7a4611]">2 & 5: ${escapeHtml(t.larkName)}</span>
                  <span class="px-2 py-0.5 rounded-md bg-[#eee6f4] text-[#59336e]">3 & 6: ${escapeHtml(t.blitzName)}</span>
                </div>
              </div>
            </div>
          </section>

          <section class="space-y-2.5">
            <h3 class="font-bold text-xs sm:text-sm text-[#18231f] flex items-center gap-1.5">
              <span>✨</span>
              <span>${escapeHtml(t.rulesRoundsSummary)}</span>
            </h3>

            <div class="border border-[#e1e5ee] bg-[#f8faff] rounded-xl p-3">
              <div class="flex items-center gap-2 font-extrabold text-[#2d426a] mb-1">
                <span class="w-5 h-5 rounded-md bg-[#495f8c] text-white flex items-center justify-center text-[10px]">
                  ${escapeHtml(t.owlShort)}
                </span>
                <span class="text-xs sm:text-sm">${escapeHtml(t.rulesOwlHeader)}</span>
              </div>
              <p class="text-[#3b4754] text-[11px] sm:text-xs break-words leading-relaxed">
                <b>${escapeHtml(t.rulesOwlTask)}</b><br/>
                ${escapeHtml(t.rulesOwlScore)}
              </p>
            </div>

            <div class="border border-[#eedecb] bg-[#fffaf4] rounded-xl p-3">
              <div class="flex items-center gap-2 font-extrabold text-[#7c440d] mb-1">
                <span class="w-5 h-5 rounded-md bg-[#9a6325] text-white flex items-center justify-center text-[10px]">
                  ${escapeHtml(t.larkShort)}
                </span>
                <span class="text-xs sm:text-sm">${escapeHtml(t.rulesLarkHeader)}</span>
              </div>
              <p class="text-[#59422e] text-[11px] sm:text-xs break-words leading-relaxed">
                <b>${escapeHtml(t.rulesLarkTask)}</b><br/>
                ${escapeHtml(t.rulesLarkScore)}
              </p>
            </div>

            <div class="border border-[#e7daee] bg-[#fbf8fd] rounded-xl p-3">
              <div class="flex items-center gap-2 font-extrabold text-[#592c73] mb-1">
                <span class="w-5 h-5 rounded-md bg-[#77528b] text-white flex items-center justify-center text-[10px]">
                  ${escapeHtml(t.blitzShort)}
                </span>
                <span class="text-xs sm:text-sm">${escapeHtml(t.rulesBlitzHeader)}</span>
              </div>
              <p class="text-[#4e355b] text-[11px] sm:text-xs break-words leading-relaxed">
                <b>${escapeHtml(t.rulesBlitzTask)}</b><br/>
                ${escapeHtml(t.rulesBlitzScore)}
              </p>
            </div>
          </section>

          <section class="space-y-2">
            <h3 class="font-bold text-xs sm:text-sm text-[#18231f] flex items-center gap-1.5">
              <span>✓</span>
              <span>${escapeHtml(t.rulesStrictnessTitle)}</span>
            </h3>
            <div class="grid gap-2">
              <div class="p-2.5 rounded-xl border text-[11px] sm:text-xs ${currentStrictness === 'high' ? 'bg-[#31594b]/10 border-[#31594b] font-medium' : 'bg-white border-[#dfdfd6]'}">
                <div class="font-bold text-[#18231f] leading-snug">${escapeHtml(t.strictnessHigh)}</div>
                <div class="text-[#5a645e] mt-0.5 leading-relaxed break-words">${escapeHtml(t.strictnessHighDesc)}</div>
              </div>
              <div class="p-2.5 rounded-xl border text-[11px] sm:text-xs ${currentStrictness === 'medium' ? 'bg-[#31594b]/10 border-[#31594b] font-medium' : 'bg-white border-[#dfdfd6]'}">
                <div class="font-bold text-[#18231f] leading-snug">${escapeHtml(t.strictnessMed)}</div>
                <div class="text-[#5a645e] mt-0.5 leading-relaxed break-words">${escapeHtml(t.strictnessMedDesc)}</div>
              </div>
              <div class="p-2.5 rounded-xl border text-[11px] sm:text-xs ${currentStrictness === 'low' ? 'bg-[#31594b]/10 border-[#31594b] font-medium' : 'bg-white border-[#dfdfd6]'}">
                <div class="font-bold text-[#18231f] leading-snug">${escapeHtml(t.strictnessLow)}</div>
                <div class="text-[#5a645e] mt-0.5 leading-relaxed break-words">${escapeHtml(t.strictnessLowDesc)}</div>
              </div>
            </div>
          </section>

          <section class="bg-[#fff9e6] border border-[#f0deab] rounded-xl p-3 text-[#634e1c]">
            <div class="flex items-start gap-2">
              <span class="text-base shrink-0 mt-0.5">⚠️</span>
              <div>
                <h4 class="font-bold text-xs text-[#4d3a0e] mb-0.5">${escapeHtml(t.rulesDisputesTitle)}</h4>
                <p class="text-[11px] sm:text-xs leading-relaxed break-words">${escapeHtml(t.rulesDisputesText)}</p>
              </div>
            </div>
          </section>
        </div>

        <div class="px-4 py-2.5 sm:py-3 bg-[#f6f5f0] border-t border-[#dfdfd6] flex justify-end">
          <button id="closeRulesBottomBtn" class="w-full sm:w-auto min-h-[46px] px-6 py-2.5 rounded-xl bg-[#31594b] hover:bg-[#25483b] active:scale-95 text-white font-bold text-xs sm:text-sm transition-all cursor-pointer shadow-2xs">
            ${escapeHtml(t.rulesClose)}
          </button>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => {
    soundEffects.click(!settings.soundEnabled);
    rulesModalOpen = false;
    modal.innerHTML = '';
  };

  document.getElementById('closeRulesBtn')?.addEventListener('click', closeModal);
  document.getElementById('closeRulesBottomBtn')?.addEventListener('click', closeModal);
}

// Global Event Listeners
export function initApp() {
  // Bind Header buttons
  document.getElementById('soundBtn')?.addEventListener('click', () => {
    settings.soundEnabled = !settings.soundEnabled;
    saveStoredSettings(settings);
    soundEffects.click(!settings.soundEnabled);
    render();
  });

  document.getElementById('vibrateBtn')?.addEventListener('click', () => {
    settings.vibrationEnabled = !settings.vibrationEnabled;
    saveStoredSettings(settings);
    soundEffects.click(!settings.soundEnabled);
    if (settings.vibrationEnabled) {
      soundEffects.vibrate(60);
    }
    render();
  });

  document.getElementById('rulesBtn')?.addEventListener('click', () => {
    soundEffects.click(!settings.soundEnabled);
    rulesModalOpen = true;
    renderRulesModal(translations[settings.language]);
  });

  document.getElementById('brandLink')?.addEventListener('click', (e) => {
    soundEffects.click(!settings.soundEnabled);
    if (!state || state.screen === 'home') return;
    homeConfirmOpen = true;
    renderHomeConfirm(translations[settings.language]);
  });

  document.getElementById('langBtn')?.addEventListener('click', () => {
    settings.language = settings.language === 'ru' ? 'en' : 'ru';
    saveStoredSettings(settings);
    soundEffects.click(!settings.soundEnabled);

    // Update active card prompt to the newly selected language
    if (state && state.card) {
      state.card = getCardData(state.card.type, state.card.cardIndex);
    }

    // Adapt default player names if applicable
    if (state) {
      state.players = state.players.map((p, idx) => {
        const isRuDefault = /^Игрок\s+(\d+)$/i.test(p.name);
        const isEnDefault = /^Player\s+(\d+)$/i.test(p.name);
        if (isRuDefault || isEnDefault) {
          return { ...p, name: settings.language === 'ru' ? `Игрок ${idx + 1}` : `Player ${idx + 1}` };
        }
        return p;
      });
      saveStoredState(state);
    }

    render();
  });

  // Keyboard shortcut Space for timer
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'Space') {
      if (state && state.screen === 'game') {
        e.preventDefault();
        if (state.phase === 'briefing') {
          soundEffects.click(!settings.soundEnabled);
          state.phase = 'timer';
          state.timerEndsAt = Date.now() + state.remaining * 1000;
          saveStoredState(state);
          render();
        } else if (state.phase === 'timer') {
          soundEffects.click(!settings.soundEnabled);
          state.remaining = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000));
          state.timerEndsAt = null;
          state.phase = 'briefing';
          saveStoredState(state);
          render();
        }
      }
    }
  });

  // Initial render
  render();
}
