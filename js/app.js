    let crashBuzzStarted = false;
    let crashed = false;
    let rafId = null;
    function playWiiCrashBuzz() {
      if (crashBuzzStarted) return;
      crashBuzzStarted = true;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ac = (window.__oceanAudioCtx && window.__oceanAudioCtx.state !== 'closed') ? window.__oceanAudioCtx : new Ctx();
        window.__oceanAudioCtx = ac;
        if (ac.state === 'suspended') ac.resume().catch(() => {});
        const gain = ac.createGain();
        gain.gain.value = 0.085;
        gain.connect(ac.destination);
        // Wii/GC "horn of death" style crash buzz: stuck buffer-like harsh tone
        const osc1 = ac.createOscillator();
        const osc2 = ac.createOscillator();
        const lfo = ac.createOscillator();
        const lfoGain = ac.createGain();
        osc1.type = 'square';
        osc2.type = 'sawtooth';
        osc1.frequency.value = 330; // around E4, the infamous buzz pitch
        osc2.frequency.value = 660;
        lfo.type = 'square';
        lfo.frequency.value = 28;
        lfoGain.gain.value = 0.03;
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        osc1.connect(gain);
        osc2.connect(gain);
        osc1.start(); osc2.start(); lfo.start();
      } catch (_) {}
    }
    async function playCrashLoopFromCapture() {
      try {
        if (!mediaRecorder || audioChunks.length === 0) return;
        if (mediaRecorder.state !== 'inactive') {
          await new Promise((resolve) => {
            mediaRecorder.addEventListener('stop', resolve, { once: true });
            try { mediaRecorder.stop(); } catch (_) { resolve(); }
          });
        }
        const lastChunks = audioChunks.slice(-2); // ~last 1s
        const blob = new Blob(lastChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        crashLoopAudio = new Audio(url);
        crashLoopAudio.loop = true;
        crashLoopAudio.volume = Math.max(0.2, masterVolume);
        await crashLoopAudio.play().catch(() => {});
      } catch (_) {}
    }

    function showFatalError(err) {
      if (crashed) return;
      crashed = true;
      try { if (rafId) cancelAnimationFrame(rafId); } catch (_) {}
      // freeze current soundscape into last ~1s loop
      try {
        if (masterGain) {
          masterGain.disconnect(audioCtx.destination); // stop live evolving audio
        }
      } catch (_) {}
      try { pauseBgmAll(false); } catch (_) {}
      try { playCrashLoopFromCapture(); } catch (_) {}
      try {
        playWiiCrashBuzz();
        const m = document.getElementById('errorModal');
        const d = document.getElementById('errorDetail');
        if (d) d.textContent = (err && (err.stack || err.message || String(err))) || 'unknown error';
        if (m) { m.classList.add('open'); m.setAttribute('aria-hidden','false'); }
      } catch (_) {}

      // overkill mode: nuke all JS so nothing else can run
      try { window.onerror = null; window.onunhandledrejection = null; } catch (_) {}
      try {
        window.addEventListener('error', (e) => { e.stopImmediatePropagation(); e.preventDefault(); }, true);
        window.addEventListener('unhandledrejection', (e) => { e.stopImmediatePropagation(); e.preventDefault(); }, true);
      } catch (_) {}
      try {
        document.querySelectorAll('script').forEach((s) => {
          const dead = document.createElement('script');
          dead.type = 'text/disabled';
          if (s.src) dead.setAttribute('data-src', s.src); else dead.textContent = '// js disabled by crash';
          s.replaceWith(dead);
        });
      } catch (_) {}
      try { const kill = document.createElement('script'); kill.textContent = 'setTimeout(function(){throw new Error("ocean js nuked")},0);'; document.body.appendChild(kill); } catch (_) {}
    }
    window.addEventListener('error', (e) => showFatalError(e.error || e.message));
    window.addEventListener('unhandledrejection', (e) => showFatalError(e.reason));

    const canvas = document.getElementById('ocean');
    function createOceanContext(c) {
      // Prefer higher-precision canvas color buffers when the browser supports them.
      // This reduces gradient banding on capable displays/browsers; falls back to default 8-bit RGBA.
      const tries = [
        { colorType: 'float16' },
        { pixelFormat: 'float16' },
        { storageFormat: 'float16' },
        { colorSpace: 'display-p3' },
        {}
      ];
      for (const opt of tries) {
        try {
          const c2 = c.getContext('2d', opt);
          if (c2) { c2.__oceanColorOpt = opt; return c2; }
        } catch (_) {}
      }
      return c.getContext('2d');
    }
    const ctx = createOceanContext(canvas);
    window.__oceanCanvasColorOpt = ctx && ctx.__oceanColorOpt ? ctx.__oceanColorOpt : { default: true };
    const bgm = document.getElementById('bgm');
    const bgm2 = document.getElementById('bgm2');
    const BGM_PLAYLIST = [
      { src: 'DeepBlue.wav', label: 'deep blue' },
      { src: 'assets/slime-sea-sunlit-waves.mp3', label: 'sunlit waves' },
      { src: 'assets/slime-sea-moonlit-calm.mp3', label: 'moonlit calm' }
    ];
    const BGM_CROSSFADE = 4;
    const BGM_STATE_KEY = 'ocean_bgm_state';
    let bgmIndex = 0;
    let activeBgm = bgm;
    let idleBgm = bgm2;
    let bgmTransition = null;
    let lastBgmSaveAt = 0;
    let bgmRestoreDone = false;

    function saveBgmState(force = false) {
      try {
        if (corrupted || !bgmRestoreDone) return;
        const now = Date.now();
        if (!force && now - lastBgmSaveAt < 1000) return;
        lastBgmSaveAt = now;
        const t = Number(activeBgm && activeBgm.currentTime);
        localStorage.setItem(BGM_STATE_KEY, codecStringify({ index: bgmIndex, time: Number.isFinite(t) && t > 0 ? t : 0 }));
      } catch (_) {}
    }

    function restoreBgmState() {
      try {
        const s = codecParse(localStorage.getItem(BGM_STATE_KEY) || 'null');
        const idx = s && Number(s.index);
        const t = s && Number(s.time);
        if (!s || !Number.isInteger(idx) || idx < 0 || idx >= BGM_PLAYLIST.length || !Number.isFinite(t) || t < 0) return false;
        bgmIndex = idx;
        bgmTransition = null;
        activeBgm = bgm;
        idleBgm = bgm2;
        bgm.src = BGM_PLAYLIST[bgmIndex].src;
        bgm.load();
        bgmApplySources();
        const applyTime = () => {
          try {
            const dur = Number(bgm.duration);
            bgm.currentTime = Number.isFinite(dur) && dur > 0 ? Math.min(t, Math.max(0, dur - 0.25)) : t;
          } catch (_) {}
          bgmRestoreDone = true;
        };
        applyTime();
        if (bgm.readyState < 1) bgm.addEventListener('loadedmetadata', applyTime, { once: true });
        else bgmRestoreDone = true;
        return true;
      } catch (_) { return false; }
    }

    function bgmApplySources() {
      try {
        if (!bgm.getAttribute('src')) bgm.src = BGM_PLAYLIST[bgmIndex].src;
        const nextSrc = BGM_PLAYLIST[(bgmIndex + 1) % BGM_PLAYLIST.length].src;
        if (idleBgm.getAttribute('src') !== nextSrc) {
          idleBgm.src = nextSrc;
          idleBgm.load();
        }
      } catch (_) {}
    }

    function pauseBgmAll(clearSources) {
      bgmTransition = null;
      [bgm, bgm2].forEach(a => {
        try { a.pause(); } catch (_) {}
        try { a.muted = true; a.volume = 0; } catch (_) {}
        if (clearSources) {
          try { a.removeAttribute('src'); a.load(); } catch (_) {}
        }
      });
    }

    async function startPlaylist() {
      if (corrupted || !soundEnabled) return false;
      bgmApplySources();
      try {
        idleBgm.muted = false;
        activeBgm.muted = false;
        if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
        if (activeBgm.paused) await activeBgm.play();
        return true;
      } catch (e) {
        console.warn('bgm playlist play blocked/failed', e);
        return false;
      }
    }

    async function startBgmTransition(force = false) {
      if (bgmTransition || corrupted || !soundEnabled) return;
      if (!force && activeBgm.paused && !activeBgm.ended) return;
      const nextIndex = (bgmIndex + 1) % BGM_PLAYLIST.length;
      const nextSrc = BGM_PLAYLIST[nextIndex].src;
      try {
        if (idleBgm.getAttribute('src') !== nextSrc) {
          idleBgm.src = nextSrc;
          idleBgm.load();
        }
        idleBgm.currentTime = 0;
        idleBgm.muted = false;
        if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
        await idleBgm.play();
        bgmTransition = {
          from: activeBgm,
          to: idleBgm,
          toIndex: nextIndex,
          startedAt: performance.now()
        };
      } catch (e) {
        console.warn('bgm next track blocked/failed', e);
      }
    }

    function bgmFades() {
      if (!bgmTransition) return activeBgm === bgm ? [1, 0] : [0, 1];
      const t = bgmTransition;
      const raw = Math.max(0, Math.min(1, (performance.now() - t.startedAt) / (BGM_CROSSFADE * 1000)));
      const p = raw * raw * (3 - 2 * raw);
      if (raw >= 1) {
        try { t.from.pause(); } catch (_) {}
        bgmIndex = t.toIndex;
        activeBgm = t.to;
        idleBgm = t.from;
        bgmTransition = null;
        bgmApplySources();
        saveBgmState(true);
        return activeBgm === bgm ? [1, 0] : [0, 1];
      }
      return t.from === bgm ? [1 - p, p] : [p, 1 - p];
    }

    [bgm, bgm2].forEach(a => {
      a.addEventListener('ended', () => {
        if (a === activeBgm) startBgmTransition(true);
      });
      a.addEventListener('timeupdate', () => {
        if (bgmTransition || !soundEnabled || a !== activeBgm) return;
        saveBgmState();
        const dur = Number.isFinite(a.duration) ? a.duration : 0;
        if (dur > 0 && a.currentTime >= dur - BGM_CROSSFADE) startBgmTransition();
      });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveBgmState(true); });
    window.addEventListener('pagehide', () => saveBgmState(true));

    const hint = document.getElementById('hint');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const setSound = document.getElementById('setSound');
    const setWeather = document.getElementById('setWeather');
    const setMotion = document.getElementById('setMotion');
    const setPhoto = document.getElementById('setPhoto');
    const photoExitBtn = document.getElementById('photoExitBtn');
    const goDownBtn = document.getElementById('goDownBtn');
    const goUpBtn = document.getElementById('goUpBtn');
    const goForwardBtn = document.getElementById('goForwardBtn');
    const goBackBtn = document.getElementById('goBackBtn');
    const photoBtn = document.getElementById('photoBtn');
    const logBtn = document.getElementById('logBtn');
    const achBtn = document.getElementById('achBtn');
    const updateBtn = document.getElementById('updateBtn');
    const feedbackBtn = document.getElementById('feedbackBtn');
    const crashBtn = document.getElementById('crashBtn');
    const exportSaveBtn = document.getElementById('exportSaveBtn');
    const importSaveBtn = document.getElementById('importSaveBtn');
    const importSaveInput = document.getElementById('importSaveInput');
    const resetSaveBtn = document.getElementById('resetSaveBtn');
    const feedbackStatus = document.getElementById('feedbackStatus');
    const toastEl = document.getElementById('toast');
    let toastTimer = 0;
    function showToast(title, msg, ms = 2800) {
      if (!toastEl) return;
      toastEl.innerHTML = `<span class="toast-title">${title}</span>${msg}`;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
    }
    const discoverHint = document.getElementById('discoverHint');
    const oxygenHud = document.getElementById('oxygenHud');
    const oxygenFill = document.getElementById('oxygenFill');
    const oxygenText = document.getElementById('oxygenText');
    const blackoutOverlay = document.getElementById('blackoutOverlay');
    const blackoutTimer = document.getElementById('blackoutTimer');
    const miningHud = document.getElementById('miningHud');
    const oreCounts = document.getElementById('oreCounts');
    const chestStatus = document.getElementById('chestStatus');
    const pickaxeLabel = document.getElementById('pickaxeLabel');
    const autoStatus = document.getElementById('autoStatus');
    const miningRecovery = document.getElementById('miningRecovery');
    const miningRecoveryLabel = document.getElementById('miningRecoveryLabel');
    const miningRecoveryText = document.getElementById('miningRecoveryText');
    const miningRecoveryFill = document.getElementById('miningRecoveryFill');
    const miningTip = document.getElementById('miningTip');
    const shopBtn = document.getElementById('shopBtn');
    const shopModal = document.getElementById('shopModal');
    const shopClose = document.getElementById('shopClose');
    const shopLine = document.getElementById('shopLine');
    const shopContracts = document.getElementById('shopContracts');
    const shopTools = document.getElementById('shopTools');
    const shopAuto = document.getElementById('shopAuto');
    const tabletBtn = document.getElementById('tabletBtn');
    const tabletModal = document.getElementById('tabletModal');
    const chestModal = document.getElementById('chestModal');
    const chestList = document.getElementById('chestList');
    const chestLine = document.getElementById('chestLine');
    const chestClose = document.getElementById('chestClose');
    const chestTakeAll = document.getElementById('chestTakeAll');
    const flowModal = document.getElementById('flowModal');
    const flowCanvas = document.getElementById('flowCanvas');
    const flowStatus = document.getElementById('flowStatus');
    const flowReset = document.getElementById('flowReset');
    const flowClose = document.getElementById('flowClose');
    const tabletClose = document.getElementById('tabletClose');
    const tabletStats = document.getElementById('tabletStats');
    const bossUi = document.getElementById('bossUi');
    const bossHpFill = document.getElementById('bossHpFill');
    const playerHpFill = document.getElementById('playerHpFill');
    const bossLog = document.getElementById('bossLog');
    const bossAttackBtn = document.getElementById('bossAttackBtn');
    const bossGuardBtn = document.getElementById('bossGuardBtn');
    const bossHealBtn = document.getElementById('bossHealBtn');
    const hurtVignette = document.getElementById('hurtVignette');
    const hurtTimer = document.getElementById('hurtTimer');
    const hurtTimerText = document.getElementById('hurtTimerText');
    const feedbackModal = document.getElementById('feedbackModal');
    const feedbackText = document.getElementById('feedbackText');
    const feedbackCategory = document.getElementById('feedbackCategory');
    const feedbackAction = document.getElementById('feedbackAction');
    const feedbackCancel = document.getElementById('feedbackCancel');
    const feedbackSend = document.getElementById('feedbackSend');
    const logModal = document.getElementById('logModal');
    const logList = document.getElementById('logList');
    const logClose = document.getElementById('logClose');
    const achModal = document.getElementById('achModal');
    const achClose = document.getElementById('achClose');
    const achList = document.getElementById('achList');
    const updateModal = document.getElementById('updateModal');
    const updateClose = document.getElementById('updateClose');
    const updateList = document.getElementById('updateList');
    const equippedBanner = document.getElementById('equippedBanner');
    const errorRefresh = document.getElementById('errorRefresh');
    const adminModal = document.getElementById('adminModal');
    const adminClose = document.getElementById('adminClose');
    const adminSpawnBottle = document.getElementById('adminSpawnBottle');
    const adminAllDiscoveries = document.getElementById('adminAllDiscoveries');
    const adminAllAchievements = document.getElementById('adminAllAchievements');
    const adminFinishQuest = document.getElementById('adminFinishQuest');
    const adminStatus = document.getElementById('adminStatus');
    const adminMiningKit = document.getElementById('adminMiningKit');
    const adminBuildRigs = document.getElementById('adminBuildRigs');
    const adminChargeRigs = document.getElementById('adminChargeRigs');
    const adminRefillMachines = document.getElementById('adminRefillMachines');
    const adminUnjamMachines = document.getElementById('adminUnjamMachines');
    const adminBuyAll = document.getElementById('adminBuyAll');
    const adminFillChest = document.getElementById('adminFillChest');
    const adminRerollVeins = document.getElementById('adminRerollVeins');
    const adminRefillOxygen = document.getElementById('adminRefillOxygen');
    const adminTriggerBlackout = document.getElementById('adminTriggerBlackout');
    const adminSkipBlackout = document.getElementById('adminSkipBlackout');
    const adminGoShore = document.getElementById('adminGoShore');
    const adminLootShip = document.getElementById('adminLootShip');
    const adminSealDeep = document.getElementById('adminSealDeep');
    const adminUnsealDeep = document.getElementById('adminUnsealDeep');
    const adminSpawnOctopus = document.getElementById('adminSpawnOctopus');
    const adminDefeatOctopus = document.getElementById('adminDefeatOctopus');
    function anyUiModalOpen() {
      return [adminModal, shopModal, tabletModal, chestModal, flowModal, logModal, achModal, updateModal, feedbackModal]
        .some(m => m && m.classList.contains('open'));
    }

    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let t = 0;
    let lastT = 0;
    let simTime = 0;
    let animTime = 0;
    let rainPhase = 0;
    let snowPhase = 0;
    let motionMul = 1;
    let dt = 0;
    let started = false;
    let soundEnabled = true;
    let masterVolume = 0.65;
    const DAY_CYCLE_MS = 10 * 60 * 1000; // one full day = 5 min day + 5 min night
    let reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let photoMode = false;
    let lastStockWindow = null;
    let weatherMode = 'auto'; // auto|clear|rain|storm|snow
    let weatherIntensity = 0;
    let weatherTarget = 0;

    // JSON codec that keeps non-finite numbers intact across saves.
    // Tagged objects decode back to Infinity/-Infinity/NaN; plain old JSON still parses.
    const CODEC_NUM_TAG = '__ocean_number__';
    function codecReplacer(key, value) {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        return { [CODEC_NUM_TAG]: Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity' };
      }
      return value;
    }
    function codecReviver(key, value) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const keys = Object.keys(value);
        if (keys.length === 1 && keys[0] === CODEC_NUM_TAG) {
          const tag = value[CODEC_NUM_TAG];
          if (tag === 'Infinity') return Infinity;
          if (tag === '-Infinity') return -Infinity;
          if (tag === 'NaN') return NaN;
        }
      }
      return value;
    }
    function codecStringify(value) { return JSON.stringify(value, codecReplacer); }
    function codecParse(text) {
      const raw = String(text == null ? '' : text);
      const bare = raw.trim();
      if (bare === 'Infinity') return Infinity;
      if (bare === '-Infinity') return -Infinity;
      if (bare === 'NaN') return NaN;
      return JSON.parse(raw, codecReviver);
    }
    function safeIdArray(text) {
      try {
        const parsed = codecParse(text);
        return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [];
      } catch (_) {
        return [];
      }
    }
    function safeNum(value, fallback = 0) {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    }

    let dayFactor = 0;
    let dayState = true;
    let cameraY = 0;
    let cameraTarget = 0;
    let camAnim = null;
    let perspective = Math.max(0, Math.min(3, Math.floor(safeNum(localStorage.getItem('ocean_perspective'), 0)))); // 0=main,1=kelp,2=deep,3=shore supply
    const MAX_DEPTH = 5; // base max; quest unlocks 6
    const DEPTH_LAYERS = [
      { id:'surface', name:'surface', min:0, max:0.5 },
      { id:'underwater', name:'underwater', min:0.5, max:1.5 },
      { id:'abyss', name:'abyss', min:1.5, max:2.5 },
      { id:'trenches', name:'trenches', min:2.5, max:3.5 },
      { id:'hadal', name:'hadal', min:3.5, max:4.5 },
      { id:'void', name:'the void', min:4.5, max:5.5 },
      { id:'facility', name:'the deep blue facility', min:5.5, max:6.5 }
    ];

    // Shore mining economy. Every swimmable band has veins except the void and facility.
    // Common veins are fixed; rare ores roll into empty vein slots on load/respawn.
    const ORE_DEFS = {
      iron:      { name:'iron',        layer:1, color:'#b9c8d6', vein:'#7f99af', hp:5,  respawn:42000,  label:'FE', rare:false },
      brine:     { name:'brine glass', layer:2, color:'#7ee0d0', vein:'#2c8f86', hp:9,  respawn:52000,  label:'BR', rare:false },
      trench:    { name:'trench shard',layer:3, color:'#8fa9ff', vein:'#425a9c', hp:12, respawn:66000,  label:'TR', rare:false },
      gold:      { name:'gold',        layer:0, color:'#ffd36a', vein:'#b8862f', hp:8,  respawn:56000,  label:'AU', rare:true },
      diamond:   { name:'diamond',     layer:0, color:'#94eaff', vein:'#3aa5c9', hp:11, respawn:70000,  label:'DM', rare:true },
      abyssite:  { name:'abyssite',    layer:4, color:'#ff74a8', vein:'#a63b68', hp:15, respawn:88000,  label:'AB', rare:false },
      voidglass: { name:'voidglass',   layer:0, color:'#c8a8ff', vein:'#6b48a8', hp:20, respawn:105000, label:'VG', rare:true }
    };
    const RARE_ORES = ['gold', 'diamond', 'voidglass'];
    const RARE_SPAWN_CHANCE = 0.35;
    const MACHINE_PAD_COUNT = 4;
    const STARTING_PADS = 2;
    const ORE_NODES = [
      { id:'u0',  layer:1, ore:'iron',     x:0.11, y:0.83 },
      { id:'u1',  layer:1, ore:'iron',     x:0.41, y:0.91 },
      { id:'u2',  layer:1, ore:'iron',     x:0.74, y:0.79 },
      { id:'ur0', layer:1, ore:null,       x:0.27, y:0.71 },
      { id:'ur1', layer:1, ore:null,       x:0.59, y:0.87 },
      { id:'ur2', layer:1, ore:null,       x:0.89, y:0.82 },
      { id:'a0',  layer:2, ore:'brine',    x:0.19, y:0.83 },
      { id:'a1',  layer:2, ore:'brine',    x:0.63, y:0.77 },
      { id:'ar0', layer:2, ore:null,       x:0.38, y:0.89 },
      { id:'ar1', layer:2, ore:null,       x:0.84, y:0.71 },
      { id:'t0',  layer:3, ore:'trench',   x:0.24, y:0.86 },
      { id:'t1',  layer:3, ore:'trench',   x:0.70, y:0.79 },
      { id:'tr0', layer:3, ore:null,       x:0.47, y:0.70 },
      { id:'tr1', layer:3, ore:null,       x:0.91, y:0.87 },
      { id:'h0',  layer:4, ore:'abyssite', x:0.15, y:0.87 },
      { id:'h1',  layer:4, ore:'abyssite', x:0.51, y:0.76 },
      { id:'h2',  layer:4, ore:'abyssite', x:0.80, y:0.92 },
      { id:'hr0', layer:4, ore:null,       x:0.33, y:0.69 },
      { id:'hr1', layer:4, ore:null,       x:0.66, y:0.85 },
      { id:'hr2', layer:4, ore:null,       x:0.93, y:0.74 }
    ];
    const PICKAXES = [
      { name:'starter pick', damage:1, note:'free. slow, blunt, honest.' },
      { name:'iron pick',    damage:2, note:'twice the bite. still a workout.' },
      { name:'gold pick',    damage:3, note:'soft metal, sharp edge.' },
      { name:'diamond pick', damage:4, note:'bites clean through pretty rocks.' },
      { name:'abyss pick',   damage:6, note:'voidglass head. barely legal.' }
    ];
    const AUTO_TIERS = [
      { name:'not built',     maxLayer:0, interval:0,    damage:0,  drain:0,  waste:0,    breakdown:0,    note:'the supply dock has a machine for this.' },
      { name:'tide pump',     maxLayer:1, interval:12000, damage:1,  drain:7, waste:0.35, breakdown:0.24, note:'upper veins only. slow, leaky, and wasteful.' },
      { name:'reef rig',      maxLayer:3, interval:8500,  damage:3,  drain:5, waste:0.16, breakdown:0.12, note:'reaches the trenches. steadier, still thirsty.' },
      { name:'abyss crawler', maxLayer:4, interval:4500,  damage:10, drain:3, waste:0.05, breakdown:0.05, note:'hadal specialist. fast, reliable, burns battery fastest.' }
    ];
    const CONTRACTS = [
      { id:'iron',     title:'isnt that iron pick?',  need:{ iron:6 },                    pickaxe:1, auto:1, line:'bring me 6 iron. that pick won\'t build itself.' },
      { id:'gold',     title:'bright seam',   need:{ gold:5 },                    pickaxe:2, auto:2, line:'5 gold buys a better head.' },
      { id:'diamond',  title:'hard proof',    need:{ diamond:4 },                 pickaxe:3, auto:3, line:'4 diamond. then you get the real bite.' },
      { id:'abyss',    title:'deep receipt',  need:{ abyssite:3, voidglass:2 },   pickaxe:4, auto:0, line:'3 abyssite and 2 voidglass. last upgrade. no refunds.' }
    ];
    // Contracts unlock blueprints; rigs are bought separately in the machines tab.
    const MACHINE_COSTS = [
      null,
      { contract:'iron',    cost:{ iron:4 } },
      { contract:'gold',    cost:{ gold:4 } },
      { contract:'diamond', cost:{ diamond:3 } }
    ];
    const PAD_COSTS = [null, null, { iron:5, gold:2 }, { gold:4, diamond:3 }];
    const TABLET_COST = { iron:2, gold:1 };
    const UNJAMMER_COST = { iron:5, gold:3, diamond:1 };
    const FLOW_SIZE = 300;
    const FLOW_COLORS = ['#ff6f8a', '#7ec8ff', '#8dffc4', '#ffd36a', '#cdb8ff'];
    // Two hand-made solvable layouts, then rotated/flipped per attempt so it stays fresh.
    const FLOW_BASES = [
      [
        [[0,0],[0,1],[0,2],[1,2],[2,2]],
        [[0,4],[1,4],[2,4],[2,3]],
        [[4,0],[3,0],[3,1],[3,2],[4,2]],
        [[4,4],[4,3],[3,3],[3,4]]
      ],
      [
        [[0,0],[1,0],[2,0],[2,1],[2,2]],
        [[0,2],[0,3],[0,4],[1,4],[2,4]],
        [[4,0],[4,1],[3,1],[3,2],[3,3],[4,3]],
        [[4,4],[3,4],[2,3],[1,3],[1,2]]
      ]
    ];
    // The keeper's shelf rotates with the sun. 'day'/'night' windows lock until the cycle flips.
    const BATTERY_PACK_COST = { iron:3, gold:1 };
    const BATTERIES_PER_PACK = 4;
    const BATTERY_CHARGE = 50; // one cell = half a machine battery
    const STOCK = {
      contract: { iron:'always', gold:'day', diamond:'night', abyss:'always' },
      rig: { 1:'always', 2:'day', 3:'night' },
      tablet: 'night',
      unjammer: 'always',
      pack: 'always',
      pad: { 2:'always', 3:'always' }
    };
    // Manual mining has a deliberate rhythm. Clicking faster than a human-scale
    // swing keeps adding recovery time, so autoclickers just stall themselves.
    const MANUAL_MINE_COOLDOWN_MS = 600;
    const MANUAL_MINE_FAST_MS = 450;
    const MANUAL_MINE_PENALTY_MS = 550;
    const MANUAL_MINE_MAX_PENALTY_MS = 5000;
    let lightning = 0;
    let nextLightning = 4000 + Math.random() * 8000;
    const ripples = [];
    const clickBubbles = [];
    const abyssParticles = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random()*1.8+0.3, ph: Math.random()*10, sp: 0.00001+Math.random()*0.00002 }));
    const ventBubbles = Array.from({ length: 18 }, () => ({ x: 0.5 + (Math.random()-0.5)*0.08, y: Math.random(), r: Math.random()*3+1.2, sp: 0.00003+Math.random()*0.00005 }));
    const angler = { x: 0.15, y: 0.45, dir: 1, sp: 0.000012, ph: Math.random()*10 };
    const trenchParticles = Array.from({ length: 55 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random()*1.4+0.2, ph: Math.random()*10, sp: 0.000008+Math.random()*0.000015, c: Math.random()<0.5?'120,220,255':'180,140,255' }));
    const hadalSpores = Array.from({ length: 80 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random()*2.2+0.4, ph: Math.random()*10, sp: 0.000006+Math.random()*0.000012 }));
    const voidEyes = Array.from({ length: 14 }, () => ({ x: Math.random(), y: 0.15 + Math.random()*0.7, ph: Math.random()*10, blink: Math.random()*6 }));
    const discoveries = safeIdArray(localStorage.getItem('ocean_discoveries'));
    const achievements = safeIdArray(localStorage.getItem('ocean_achievements'));
    let equippedDiscovery = localStorage.getItem('ocean_equipped') || '';
    let clicks = Math.max(0, safeNum(localStorage.getItem('ocean_clicks')));
    let photoCount = Math.max(0, safeNum(localStorage.getItem('ocean_photos')));
    let bottlesFound = Math.max(0, safeNum(localStorage.getItem('ocean_bottles_found')));
    const storedBottleNote = safeNum(localStorage.getItem('ocean_bottle_note'), -1);
    let bottleNoteIndex = Number.isFinite(storedBottleNote) ? storedBottleNote : -1;
    let bottomTrips = Math.max(0, safeNum(localStorage.getItem('ocean_bottom_trips')));
    let reachedTopSinceBottom = true;
    let clickLockUntil = Math.max(0, safeNum(localStorage.getItem('ocean_click_lock_until')));
    let quest = null;
    try { quest = codecParse(localStorage.getItem('ocean_void_quest') || 'null'); } catch (_) {}
    if (!quest || typeof quest !== 'object' || Array.isArray(quest)) {
      quest = { offered: false, accepted: false, completed: false, unlockedDeep: false, deepBlueSealed: false, bottlesAtAccept: bottlesFound, fishAtAccept: discoveries.filter(id => ['clownfish','pufferfish','shark','betta','koi'].includes(id)).length, tripsAtAccept: bottomTrips };
    } else {
      const baseQuest = { offered: false, accepted: false, completed: false, unlockedDeep: false, deepBlueSealed: false, bottlesAtAccept: bottlesFound, fishAtAccept: discoveries.filter(id => ['clownfish','pufferfish','shark','betta','koi'].includes(id)).length, tripsAtAccept: bottomTrips };
      quest = { ...baseQuest, ...quest };
      for (const key of ['bottlesAtAccept','fishAtAccept','tripsAtAccept']) quest[key] = Math.max(0, safeNum(quest[key], baseQuest[key]));
      for (const key of ['offered','accepted','completed','unlockedDeep','deepBlueSealed']) quest[key] = !!quest[key];
    }
    let voidTalkTimer = 0;
    let voidDialogue = null;
    let voidEntity = { x: 0.5, y: 0.5, r: 70, pulse: 0 };
    let facility = { puzzleA:false, puzzleB:false, encounterDone:false, complete:false, code:'BLUE', unlocked:false };
    try {
      const sf = codecParse(localStorage.getItem('ocean_facility') || 'null');
      if (sf && typeof sf === 'object' && !Array.isArray(sf)) facility = { ...facility, ...sf, code:'BLUE' };
    } catch (_) {}
    for (const key of ['puzzleA','puzzleB','encounterDone','complete','unlocked']) facility[key] = !!facility[key];
    if (!quest.deepBlueSealed && facility.complete) quest.deepBlueSealed = true;
    let shipLooted = localStorage.getItem('ocean_ship_looted') === '1';
    let viewPush = 0; // forward/back camera push animation

    // Camera movement throttle. Stops rapid clicks from stacking cameraTarget
    // and turning a six-layer climb into one instant teleport. Kept at or above
    // the 1600ms camera animation so a new dive never interrupts the last one.
    const NAV_COOLDOWN_MS = 1700;
    let navCooldownUntil = 0;
    let navCooldownTimer = 0;
    function navOnCooldown() { return performance.now() < navCooldownUntil; }
    function armNavCooldown() {
      navCooldownUntil = performance.now() + NAV_COOLDOWN_MS;
      clearTimeout(navCooldownTimer);
      navCooldownTimer = setTimeout(() => {
        navCooldownUntil = 0;
        syncSettingsUI();
      }, NAV_COOLDOWN_MS);
      syncSettingsUI();
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (performance.now() >= navCooldownUntil) {
        clearTimeout(navCooldownTimer);
        navCooldownUntil = 0;
      }
      syncSettingsUI();
    });

    function defaultMachineState() {
      return { tier: 0, battery: 100, broken: false, progress: 0, message: 'machine not built' };
    }
    function sanitizeMachine(raw) {
      const m = defaultMachineState();
      if (!raw || typeof raw !== 'object') return m;
      const tv = Number(raw.tier), bv = Number(raw.battery), pr = Number(raw.progress);
      m.tier = Number.isFinite(tv) ? Math.max(0, Math.min(AUTO_TIERS.length - 1, Math.floor(tv))) : 0;
      m.battery = Number.isFinite(bv) ? Math.max(0, Math.min(100, bv)) : 100;
      m.broken = !!raw.broken;
      m.progress = Number.isFinite(pr) ? Math.max(0, pr) : 0;
      m.message = typeof raw.message === 'string' ? raw.message.slice(0, 120) : 'machine not built';
      return m;
    }
    function defaultMiningState() {
      const ores = {};
      const chest = {};
      for (const id of Object.keys(ORE_DEFS)) { ores[id] = 0; chest[id] = 0; }
      return {
        ores,
        chest,
        pickaxe: 0,
        contracts: {},
        pinged: {},
        nodeHp: {},
        nodeRespawn: {},
        nodeOre: {},
        tablet: false,
        unjammer: false,
        batteries: 0,
        unlockedPads: STARTING_PADS,
        tipSeen: false,
        machines: Array.from({ length: MACHINE_PAD_COUNT }, defaultMachineState),
        activeMachine: 0
      };
    }
    let mining = defaultMiningState();
    try {
      const sm = codecParse(localStorage.getItem('ocean_mining') || 'null');
      if (sm && typeof sm === 'object') {
        for (const id of Object.keys(ORE_DEFS)) {
          const v = Number(sm.ores && sm.ores[id]);
          mining.ores[id] = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
          const cv = Number(sm.chest && sm.chest[id]);
          mining.chest[id] = Number.isFinite(cv) ? Math.max(0, Math.floor(cv)) : 0;
        }
        const pv = Number(sm.pickaxe);
        mining.pickaxe = Number.isFinite(pv) ? Math.max(0, Math.min(PICKAXES.length - 1, Math.floor(pv))) : 0;
        if (sm.contracts && typeof sm.contracts === 'object') {
          for (const c of CONTRACTS) mining.contracts[c.id] = !!sm.contracts[c.id];
        }
        if (sm.pinged && typeof sm.pinged === 'object') {
          for (const c of CONTRACTS) mining.pinged[c.id] = !!sm.pinged[c.id];
        }
        mining.tablet = !!sm.tablet;
        mining.unjammer = !!sm.unjammer;
        const bv = Number(sm.batteries);
        mining.batteries = Number.isFinite(bv) ? Math.max(0, Math.floor(bv)) : 0;
        const uv = Number(sm.unlockedPads);
        mining.unlockedPads = Number.isFinite(uv) ? Math.max(STARTING_PADS, Math.min(MACHINE_PAD_COUNT, Math.floor(uv))) : STARTING_PADS;
        mining.tipSeen = !!sm.tipSeen;
        if (sm.nodeOre && typeof sm.nodeOre === 'object') {
          for (const n of ORE_NODES) {
            const id = sm.nodeOre[n.id];
            if (!n.ore && RARE_ORES.includes(id)) mining.nodeOre[n.id] = id;
          }
        }
        if (sm.nodeHp && typeof sm.nodeHp === 'object') {
          for (const n of ORE_NODES) {
            const v = Number(sm.nodeHp[n.id]);
            const oreId = n.ore || mining.nodeOre[n.id];
            if (Number.isFinite(v) && oreId && ORE_DEFS[oreId]) mining.nodeHp[n.id] = Math.max(0, Math.min(ORE_DEFS[oreId].hp, v));
          }
        }
        if (sm.nodeRespawn && typeof sm.nodeRespawn === 'object') {
          for (const n of ORE_NODES) {
            const v = Number(sm.nodeRespawn[n.id]);
            if (Number.isFinite(v)) mining.nodeRespawn[n.id] = Math.max(0, v);
          }
        }
        if (Array.isArray(sm.machines)) {
          for (let i = 0; i < MACHINE_PAD_COUNT; i++) {
            mining.machines[i] = i < mining.unlockedPads ? sanitizeMachine(sm.machines[i]) : defaultMachineState();
          }
        } else if (sm.auto && typeof sm.auto === 'object') {
          mining.machines[0] = sanitizeMachine(sm.auto);
        }
        const av = Number(sm.activeMachine);
        mining.activeMachine = Number.isFinite(av) ? Math.max(0, Math.min(mining.unlockedPads - 1, Math.floor(av))) : 0;
      }
    } catch (_) {}
    function unlockedPadCount() { return Math.max(STARTING_PADS, Math.min(MACHINE_PAD_COUNT, mining.unlockedPads | 0)); }
    function isPadUnlocked(i) { return Number.isInteger(i) && i >= 0 && i < unlockedPadCount(); }
    function activeMachineIndex() {
      let i = Math.min(MACHINE_PAD_COUNT - 1, Math.max(0, mining.activeMachine | 0));
      if (!isPadUnlocked(i)) { i = unlockedPadCount() - 1; mining.activeMachine = i; }
      return i;
    }
    function activeMachine() { return mining.machines[activeMachineIndex()] || mining.machines[0]; }
    Object.defineProperty(mining, 'auto', { enumerable: false, configurable: true, get: activeMachine });
    function chestOreCount() { return Object.keys(ORE_DEFS).reduce((n, id) => n + (mining.chest[id] || 0), 0); }
    function chestRect() {
      const cw = Math.max(58, Math.min(104, w * 0.082));
      const ch = cw * 0.62;
      const x = w * 0.53;
      const waterY = getWaveY(x, h * 0.58);
      // sit the box in the waterline, not above it: bottom quarter is submerged
      const y = waterY - ch * 0.72 + Math.sin(animTime * 0.0013) * 2.5;
      return { x, y, w: cw, h: ch, waterY };
    }
    function renderChest() {
      if (!chestList) return;
      const held = Object.keys(ORE_DEFS).filter(id => (mining.chest[id] || 0) > 0);
      if (chestLine) chestLine.textContent = held.length
        ? 'pull out only what you need. the rest stays in the chest.'
        : 'empty. the machines have not hauled anything up yet.';
      chestList.innerHTML = held.length ? held.map(id => {
        const def = ORE_DEFS[id];
        const n = mining.chest[id];
        return `<div class="chest-row" style="--ore:${def.color}">
          <span class="chest-name">${def.name}</span>
          <span class="chest-have">chest ${n} · bag ${mining.ores[id] || 0}</span>
          <input class="chest-qty" type="number" min="1" max="${n}" value="1" inputmode="numeric" data-chest-qty="${id}" aria-label="amount of ${def.name}">
          <button class="btn" type="button" data-chest-take="${id}">take</button>
        </div>`;
      }).join('') : '<div class="shop-note">nothing in the chest yet. keep the claw fed.</div>';
      if (chestTakeAll) chestTakeAll.disabled = !held.length;
    }
    function openChest() {
      if (!chestModal) return false;
      renderChest();
      chestModal.classList.add('open');
      chestModal.setAttribute('aria-hidden', 'false');
      sfxClick();
      return true;
    }
    function closeChest() {
      if (!chestModal) return;
      chestModal.classList.remove('open');
      chestModal.setAttribute('aria-hidden', 'true');
    }
    function afterChestChange() {
      syncMiningHud();
      renderShop();
      renderChest();
      if (tabletModal && tabletModal.classList.contains('open')) renderTablet();
      saveGameState();
    }
    function takeFromChest(id, amount) {
      const have = mining.chest[id] || 0;
      const n = Math.min(have, Math.max(1, Math.floor(Number(amount) || 0)));
      if (!ORE_DEFS[id] || have <= 0 || !n) return false;
      mining.chest[id] = have - n;
      mining.ores[id] = (mining.ores[id] || 0) + n;
      sfxDiscovery();
      showToast('ore collected', `${n} ${ORE_DEFS[id].name} moved into your inventory.`, 2400);
      afterChestChange();
      return true;
    }
    function takeAllFromChest() {
      const held = Object.keys(ORE_DEFS).filter(id => (mining.chest[id] || 0) > 0);
      if (!held.length) return false;
      const parts = [];
      for (const id of held) {
        const n = mining.chest[id];
        mining.ores[id] = (mining.ores[id] || 0) + n;
        mining.chest[id] = 0;
        parts.push(`${n} ${ORE_DEFS[id].name}`);
      }
      sfxDiscovery();
      showToast('ore collected', `${parts.join(' · ')} moved into your inventory.`, 3200);
      afterChestChange();
      return true;
    }
    let swingFx = null;
    const autoFx = [];
    function makeRigState() {
      return {
        x: null, y: null, fromX: 0, fromY: 0, strikeY: 0, lift: 68,
        targetId: null, queueId: null, lastStrikeId: null,
        mode: 'idle', modeT: 0, pending: false, moving: false
      };
    }
    const machineRigs = Array.from({ length: MACHINE_PAD_COUNT }, makeRigState);
    let lastStrikeAt = 0;
    let manualMineNextAt = 0;
    let manualMinePenalty = 0;
    let miningHudClock = 0;
    // lore: Deep Blue (guard) protects The Deep Blue, a submarine-ish facility controlling the ocean.

    // Oxygen: drains everywhere except surface and facility. Refills at surface.
    let oxygenMax = 100;
    let oxygen = oxygenMax;
    let oxygenWarned = false;

    // Blackout: running dry is a real 5 minute penalty, not a free ride upward.
    const BLACKOUT_MS = 5 * 60 * 1000;
    const BLACKOUT_KEY = 'ocean_blackout_until';
    let blackoutUntil = 0;
    let blackoutActive = false;
    let blackoutShownSec = -1;

    // Void Octopus bossfight: forward x2 + dive to hadal
    const VOID_OCTOPUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 520" width="600" height="520">
  <defs>
    <radialGradient id="body"><stop offset="0" stop-color="#102d46"/><stop offset=".7" stop-color="#06121f"/><stop offset="1" stop-color="#01050c"/></radialGradient>
    <linearGradient id="tentacle" x2="0" y2="1"><stop stop-color="#123c58"/><stop offset=".5" stop-color="#071725"/><stop offset="1" stop-color="#01040a"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="#b5ffff"/><stop offset=".3" stop-color="#36d9ff"/><stop offset="1" stop-color="#0875b8" stop-opacity="0"/></radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="12"/></filter>
  </defs>
  <ellipse cx="300" cy="210" rx="150" ry="160" fill="#0876a9" opacity=".13" filter="url(#blur)"/>
  <g fill="none" stroke="url(#tentacle)" stroke-width="27" stroke-linecap="round">
    <path d="M250 290 C180 330 80 290 65 370 C50 435 120 455 160 420"/>
    <path d="M265 310 C210 390 180 450 220 480 C250 500 280 460 275 430"/>
    <path d="M285 320 C270 400 320 450 355 465 C390 480 405 440 380 420"/>
    <path d="M315 310 C390 370 490 350 515 415 C535 470 475 480 440 445"/>
    <path d="M235 250 C150 240 105 190 65 230 C30 270 80 300 120 280"/>
    <path d="M260 240 C190 180 200 100 150 100 C105 100 105 150 140 170"/>
    <path d="M340 245 C420 190 440 115 485 130 C530 145 505 195 470 205"/>
    <path d="M365 275 C450 260 530 275 545 325 C555 365 510 380 485 350"/>
  </g>
  <path d="M210 250 C175 170 215 70 300 55 C385 70 425 170 390 250 C370 290 330 310 300 310 C270 310 230 290 210 250Z" fill="url(#body)" stroke="#174967" stroke-width="4"/>
  <path d="M245 115 Q300 85 355 115 M230 150 Q300 125 370 150" fill="none" stroke="#247da0" stroke-width="3" opacity=".4"/>
  <ellipse cx="268" cy="235" rx="25" ry="32" fill="url(#glow)" opacity=".9"/>
  <ellipse cx="332" cy="235" rx="25" ry="32" fill="url(#glow)" opacity=".9"/>
  <ellipse cx="268" cy="235" rx="9" ry="15" fill="#a9faff"/>
  <ellipse cx="332" cy="235" rx="9" ry="15" fill="#a9faff"/>
  <ellipse cx="268" cy="235" rx="4" ry="9" fill="#00121d"/>
  <ellipse cx="332" cy="235" rx="4" ry="9" fill="#00121d"/>
  <g fill="#0b3045" stroke="#237b9b" stroke-width="2">
    <circle cx="90" cy="365" r="7"/><circle cx="110" cy="400" r="7"/><circle cx="135" cy="425" r="7"/>
    <circle cx="210" cy="450" r="7"/><circle cx="235" cy="475" r="7"/><circle cx="350" cy="455" r="7"/>
    <circle cx="380" cy="455" r="7"/><circle cx="480" cy="445" r="7"/><circle cx="510" cy="415" r="7"/>
    <circle cx="510" cy="320" r="7"/><circle cx="535" cy="340" r="7"/><circle cx="95" cy="265" r="7"/>
    <circle cx="120" cy="155" r="7"/><circle cx="475" cy="160" r="7"/>
  </g>
  <g fill="#53cfff">
    <circle cx="120" cy="65" r="3" opacity=".6"/><circle cx="450" cy="65" r="2" opacity=".5"/>
    <circle cx="70" cy="180" r="2" opacity=".5"/><circle cx="530" cy="210" r="3" opacity=".4"/>
    <circle cx="180" cy="490" r="2" opacity=".5"/><circle cx="420" cy="490" r="3" opacity=".4"/>
  </g>
</svg>`;
    const VOID_OCTOPUS_IMG = new Image();
    VOID_OCTOPUS_IMG.decoding = 'async';
    VOID_OCTOPUS_IMG.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(VOID_OCTOPUS_SVG);
    let voidOctopusDefeated = localStorage.getItem('ocean_void_octopus_defeated') === '1';
    let boss = {
      active: false, phase: 'intro', // intro, player, enemy, win, lose
      hp: 140, maxHp: 140,
      playerHp: 100, playerMaxHp: 100,
      turn: 0, log: '', timer: 0, shake: 0, hitFlash: 0, playerFlash: 0,
      ink: [], bubbles: [], phaseT: 0, guard: false
    };

    function isOctopusArena() { return perspective === 2 && cameraY >= 3.5 && cameraY < 4.5 && !isFacilityLayer(); }
    function canStartOctopus() { return !voidOctopusDefeated && isOctopusArena() && !boss.active && !camAnim; }

    function setBossLog(text) { boss.log = text; if (bossLog) bossLog.textContent = text; }
    function syncBossUi() {
      if (!bossUi) return;
      bossUi.classList.toggle('open', !!boss.active);
      bossUi.setAttribute('aria-hidden', boss.active ? 'false' : 'true');
      if (bossHpFill) bossHpFill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
      if (playerHpFill) playerHpFill.style.width = Math.max(0, (boss.playerHp / boss.playerMaxHp) * 100) + '%';
      const canAct = boss.active && boss.phase === 'player';
      [bossAttackBtn, bossGuardBtn, bossHealBtn].forEach(b => { if (b) b.disabled = !canAct; });
    }

    function startVoidOctopus() {
      if (boss.active || voidOctopusDefeated) return;
      if (photoMode) setPhotoMode(false);
      boss.active = true;
      boss.phase = 'intro';
      boss.hp = boss.maxHp = 140;
      boss.playerHp = boss.playerMaxHp = 100;
      boss.turn = 0; boss.timer = 1.2; boss.shake = 0; boss.hitFlash = 0; boss.playerFlash = 0;
      boss.ink = []; boss.bubbles = []; boss.phaseT = 0; boss.guard = false;
      oxygen = Math.max(oxygen, 72); // enough oxygen to finish fight
      setBossLog('a void octopus rises from the hadal dark...');
      syncBossUi();
      sfxBubble();
    }

    function endVoidOctopus(win) {
      boss.phase = win ? 'win' : 'lose';
      boss.timer = win ? 2.2 : 1.8;
      if (win) {
        voidOctopusDefeated = true;
        localStorage.setItem('ocean_void_octopus_defeated', '1');
        recordDiscovery('void_octopus');
        unlockAchievement('octopus_slayer');
        setBossLog('the void octopus retreats into the dark. hadal is calm again.');
      } else {
        setBossLog('the octopus overwhelms you... you drift back up.');
      }
      syncBossUi();
    }

    function bossEnemyTurn() {
      boss.phase = 'enemy';
      boss.phaseT = 0;
      boss.timer = 0.9;
      const dmgBase = 10 + Math.floor(Math.random() * 10);
      const dmg = boss.guard ? Math.max(2, Math.floor(dmgBase * 0.45)) : dmgBase;
      boss.guard = false;
      boss.pendingDmg = dmg;
      boss.pendingAtk = Math.random() < 0.35 ? 'ink' : 'slam';
      setBossLog(boss.pendingAtk === 'ink' ? 'the void octopus blasts ink!' : 'the void octopus lashes its tentacles!');
      syncBossUi();
    }

    function applyBossEnemyHit() {
      const dmg = boss.pendingDmg || 8;
      boss.playerHp = Math.max(0, boss.playerHp - dmg);
      boss.playerFlash = 0.5;
      boss.shake = 0.45;
      if (boss.pendingAtk === 'ink') {
        for (let i=0;i<16;i++) boss.ink.push({ x:w*0.5+(Math.random()-0.5)*120, y:h*0.45+(Math.random()-0.5)*80, vx:(Math.random()-0.5)*220, vy:(Math.random()-0.5)*120, r:10+Math.random()*30, a:0.35+Math.random()*0.35, life:1+Math.random()*0.8 });
      }
      if (boss.playerHp <= 0) { endVoidOctopus(false); return; }
      boss.phase = 'player';
      boss.timer = 0;
      setBossLog(`you took ${dmg} damage. your move.`);
      syncBossUi();
    }

    function bossPlayerAction(action) {
      if (!boss.active || boss.phase !== 'player') return;
      boss.turn++;
      if (action === 'attack') {
        const dmg = 14 + Math.floor(Math.random() * 10);
        boss.hp = Math.max(0, boss.hp - dmg);
        boss.hitFlash = 0.35;
        boss.shake = 0.25;
        setBossLog(`ink blast hits for ${dmg}!`);
        sfxClick();
      } else if (action === 'guard') {
        boss.guard = true;
        setBossLog('you brace for impact. next hit reduced.');
        sfxClick();
      } else if (action === 'heal') {
        const heal = 12 + Math.floor(Math.random() * 8);
        boss.playerHp = Math.min(boss.playerMaxHp, boss.playerHp + heal);
        oxygen = Math.min(oxygenMax, oxygen + 8);
        setBossLog(`you recharge ${heal} hp and a bit of oxygen.`);
        sfxBubble();
      }
      syncBossUi();
      if (boss.hp <= 0) { endVoidOctopus(true); return; }
      boss.phase = 'wait';
      syncBossUi();
      setTimeout(() => { if (boss.active && boss.phase === 'wait') bossEnemyTurn(); }, 420);
    }

    function updateBoss(dtMs) {
      if (!boss.active) return;
      const dt = dtMs / 1000;
      boss.phaseT += dt;
      boss.shake = Math.max(0, boss.shake - dt);
      boss.hitFlash = Math.max(0, boss.hitFlash - dt * 1.8);
      boss.playerFlash = Math.max(0, boss.playerFlash - dt * 1.8);
      for (let i=boss.ink.length-1;i>=0;i--) { const p=boss.ink[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt*0.6; p.r+=dt*8; if(p.life<=0) boss.ink.splice(i,1); }
      if (boss.phase === 'intro') { boss.timer -= dt; if (boss.timer <= 0) { boss.phase = 'player'; setBossLog('your move. ink blast, brace, or recharge.'); syncBossUi(); } }
      else if (boss.phase === 'enemy') { boss.timer -= dt; if (boss.timer <= 0) applyBossEnemyHit(); }
      else if (boss.phase === 'win' || boss.phase === 'lose') {
        boss.timer -= dt;
        if (boss.timer <= 0) {
          const won = boss.phase === 'win';
          boss.active = false;
          bossUi.classList.remove('open');
          if (!won) { oxygen = oxygenMax; setCamera(Math.max(0, cameraY - 1)); }
          syncBossUi();
        }
      }
    }

    function drawBossFight() {
      if (!boss.active || !isOctopusArena()) return;
      const px = w * 0.5;
      const py = h * 0.45;
      const bob = Math.sin(animTime * 0.0018) * 10;
      const sway = Math.sin(animTime * 0.0011) * 8;
      const size = Math.min(w, h) * 0.42;
      ctx.save();
      if (boss.shake > 0) ctx.translate((Math.random()-0.5)*boss.shake*18, (Math.random()-0.5)*boss.shake*18);
      const aura = ctx.createRadialGradient(px, py, 20, px, py, size*0.9);
      aura.addColorStop(0, 'rgba(80,180,255,0.16)');
      aura.addColorStop(1, 'rgba(80,180,255,0)');
      ctx.fillStyle = aura; ctx.fillRect(0,0,w,h);
      ctx.save();
      ctx.translate(px + sway, py + bob);
      const scale = 1 + Math.sin(animTime*0.0025)*0.02 + (boss.hitFlash>0?0.04:0);
      ctx.scale(scale, scale);
      ctx.globalAlpha = 0.96;
      if (VOID_OCTOPUS_IMG.complete && VOID_OCTOPUS_IMG.naturalWidth) {
        ctx.drawImage(VOID_OCTOPUS_IMG, -size/2, -size/2, size, size);
      }
      if (boss.hitFlash > 0) { ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = boss.hitFlash; ctx.fillStyle='rgba(180,240,255,0.8)'; ctx.beginPath(); ctx.ellipse(0,-20,size*0.28,size*0.32,0,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
      for (const p of boss.ink) { ctx.globalAlpha = Math.max(0, p.life) * p.a; ctx.fillStyle='rgba(30,10,50,0.9)'; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); }
      ctx.globalAlpha = 1;
      ctx.restore();
      if (boss.playerFlash > 0) { ctx.fillStyle = `rgba(255,80,110,${boss.playerFlash*0.22})`; ctx.fillRect(0,0,w,h); }
    }

    function formatBlackoutTime(ms) {
      const total = Math.max(0, Math.ceil(ms / 1000));
      const mins = Math.floor(total / 60);
      const secs = total % 60;
      return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    function syncBlackoutTimer(force = false) {
      if (!blackoutTimer) return;
      const remaining = Math.max(0, blackoutUntil - Date.now());
      const shown = Math.ceil(remaining / 1000);
      if (!force && shown === blackoutShownSec) return;
      blackoutShownSec = shown;
      blackoutTimer.textContent = formatBlackoutTime(remaining);
    }

    function startBlackout(until, restored = false) {
      if (blackoutActive) return;
      const now = Date.now();
      blackoutUntil = Number.isFinite(until) && until > now ? until : now + BLACKOUT_MS;
      blackoutActive = true;
      blackoutShownSec = -1;
      oxygen = 0;
      oxygenWarned = true;
      camAnim = null;
      if (oxygenFill) oxygenFill.style.width = '0%';
      if (oxygenText) oxygenText.textContent = '0%';
      if (photoMode) setPhotoMode(false);
      try { closeAdmin(); closeFeedback(); closeTablet(); closeShop(); } catch (_) {}
      [logModal, achModal, updateModal].forEach(m => {
        if (!m) return;
        m.classList.remove('open');
        m.setAttribute('aria-hidden', 'true');
      });
      if (settingsPanel) {
        settingsPanel.classList.remove('open');
        if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'false');
      }
      if (boss.active) {
        endVoidOctopus(false);
        boss.active = false;
        bossUi.classList.remove('open');
        syncBossUi();
      }
      try { localStorage.setItem(BLACKOUT_KEY, String(blackoutUntil)); } catch (_) {}
      if (blackoutOverlay) {
        blackoutOverlay.classList.add('open');
        blackoutOverlay.setAttribute('aria-hidden', 'false');
      }
      syncBlackoutTimer(true);
      if (!restored) showToast('out of oxygen', 'you blacked out. five minutes later you wake up at the surface.', 3200);
    }

    function finishBlackout(restored = false) {
      if (!blackoutActive && !restored) return;
      blackoutActive = false;
      blackoutUntil = 0;
      blackoutShownSec = -1;
      try { localStorage.removeItem(BLACKOUT_KEY); } catch (_) {}
      if (blackoutOverlay) {
        blackoutOverlay.classList.remove('open');
        blackoutOverlay.setAttribute('aria-hidden', 'true');
      }
      oxygen = oxygenMax;
      oxygenWarned = false;
      cameraY = 0;
      cameraTarget = 0;
      camAnim = null;
      saveGameState();
      syncSettingsUI();
      updateOxygen(0);
      if (!restored) showToast('surface', 'you wake up where the air is.<br><span class="toast-sub">oxygen restored. the ocean pretends nothing happened.</span>', 3200);
    }

    function updateBlackout() {
      if (!blackoutActive) return false;
      if (Date.now() >= blackoutUntil) {
        finishBlackout();
        return false;
      }
      syncBlackoutTimer();
      return true;
    }

    function restoreBlackout() {
      let stored = 0;
      try { stored = Number(localStorage.getItem(BLACKOUT_KEY) || 0); } catch (_) {}
      if (!Number.isFinite(stored) || stored <= 0) return;
      if (stored > Date.now()) startBlackout(stored, true);
      else finishBlackout(true);
    }

    function updateOxygen(dt) {
      if (corrupted || blackoutActive) return;
      const onSurface = cameraY <= 0.2;
      const inFacility = isFacilityLayer();
      if (onSurface) {
        oxygen = Math.min(oxygenMax, oxygen + dt * 28);
        oxygenWarned = false;
      } else if (!inFacility) {
        const depth = Math.max(0, cameraY - 0.2);
        const drain = boss.active ? 0.35 : (1.05 + depth * 0.52 + Math.pow(depth, 1.4) * 0.09);
        oxygen = Math.max(0, oxygen - dt * drain);
        if (oxygen <= 25 && !oxygenWarned && !boss.active) { oxygenWarned = true; showToast('oxygen low', 'head up before you run out of air.', 2400); }
        if (oxygen <= 0) {
          startBlackout();
          return;
        }
      }
      if (oxygenHud) {
        oxygenHud.classList.toggle('hidden', inFacility);
        oxygenHud.classList.toggle('low', oxygen <= 35 && oxygen > 18);
        oxygenHud.classList.toggle('critical', oxygen <= 18);
      }
      if (oxygenFill) oxygenFill.style.width = Math.max(0, Math.min(100, oxygen)) + '%';
      if (oxygenText) oxygenText.textContent = Math.ceil(Math.max(0, oxygen)) + '%';
    }
    bgm.volume = masterVolume;
    bgm2.volume = 0;

    function svgThumb(title, emoji, c1, c2) {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'>
        <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs>
        <rect width='128' height='128' rx='18' fill='url(#g)'/>
        <circle cx='64' cy='60' r='34' fill='rgba(255,255,255,0.08)'/>
        <text x='64' y='72' font-size='44' text-anchor='middle'>${emoji}</text>
        <text x='64' y='112' font-size='10' fill='rgba(236,247,255,0.72)' text-anchor='middle' font-family='Consolas,Lucida Console,Courier New,monospace' letter-spacing='1'>${title}</text>
      </svg>`;
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    }

    const ANGLER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">
  <defs>
    <radialGradient id="body" cx="35%" cy="25%" r="75%">
      <stop offset="0%" stop-color="#718b89"/>
      <stop offset="55%" stop-color="#354e52"/>
      <stop offset="100%" stop-color="#14262e"/>
    </radialGradient>
    <radialGradient id="lamp">
      <stop offset="0%" stop-color="#f4ffd0"/>
      <stop offset="25%" stop-color="#caff83"/>
      <stop offset="100%" stop-color="#caff83" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <path d="M145 190 L35 105 L65 205 L35 310 L150 255Z" fill="#263f45" stroke="#718e8b" stroke-width="5"/>
  <ellipse cx="305" cy="220" rx="205" ry="140" fill="url(#body)" stroke="#829c96" stroke-width="5"/>
  <path d="M220 105 Q175 35 145 75 Q165 125 220 155Z" fill="#263e43" stroke="#829c96" stroke-width="4"/>
  <path d="M230 325 Q185 380 155 345 Q180 295 230 290Z" fill="#263e43" stroke="#829c96" stroke-width="4"/>
  <path d="M320 350 Q380 390 420 345" fill="none" stroke="#829c96" stroke-width="5"/>
  <path d="M250 105 Q255 35 325 28 Q370 25 385 65" fill="none" stroke="#829c96" stroke-width="8" stroke-linecap="round"/>
  <circle cx="385" cy="65" r="38" fill="url(#lamp)"/>
  <circle cx="385" cy="65" r="10" fill="#eaffb5"/>
  <circle cx="382" cy="62" r="4" fill="white"/>
  <circle cx="420" cy="150" r="17" fill="#07121a" stroke="#a9bdb0" stroke-width="5"/>
  <circle cx="425" cy="145" r="5" fill="#eaffd2"/>
  <path d="M410 185 Q520 155 550 220 Q520 285 410 255 Q450 220 410 185Z" fill="#09131a" stroke="#829c96" stroke-width="5"/>
  <path d="M422 180 L445 205 L442 177 L468 199 L467 174 L493 200 L493 182 L520 211 L535 215" fill="#e0e1c9" stroke="#e0e1c9" stroke-width="3"/>
  <path d="M420 258 L445 235 L450 260 L475 239 L480 263 L505 235 L510 252" fill="#e0e1c9" stroke="#e0e1c9" stroke-width="3"/>
  <path d="M175 175 Q150 220 180 265 M195 165 Q170 220 200 275 M215 160 Q190 220 220 280" fill="none" stroke="#91aaa0" stroke-width="4" opacity=".55"/>
</svg>`;
    const ANGLER_IMG_URL = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(ANGLER_SVG);
    const anglerImg = new Image();
    anglerImg.decoding = 'async';
    anglerImg.src = ANGLER_IMG_URL;

    // dev notes shoved into bottles. yes, lux wrote these by proxy.
    const BOTTLE_NOTES = [
      'you found my bottle. congrats. i wrote this at 2am instead of sleeping. the ocean is just a blue loading screen with fish.',
      'if the claw looks suspicious, that is because it is. i made it hit rocks with its face. you are welcome.',
      'the deep blue is not a mood ring. stop staring at him. he is staring back.',
      'there are no ores in the void. i checked. then i checked again because i do not trust my own code.',
      'the machine pads got moved up because the rocks were eating them. yes, rocks can eat. do not ask.',
      'you clicked a bottle in a browser about the ocean. that is basically marine archaeology.',
      'if you are reading this underwater, please blink twice so i know the oxygen meter is still lying.',
      'this note is load-bearing. remove it and the vibes collapse.',
      'the claw used to carry a pickaxe. i deleted it. now it just headbutts the ore like a champ.',
      'rare ores hide in empty veins because i got bored of predictable loot. no map, no mercy.',
      'five minute blackout rule added because touching the surface after drowning was too easy. suffer in style.'
    ];
    function bottleNoteText(index) {
      const i = Number.isFinite(index) && index >= 0 ? index % BOTTLE_NOTES.length : 0;
      return `${BOTTLE_NOTES[i]} — lux`;
    }
    function nextBottleNote() {
      let next = Math.floor(Math.random() * BOTTLE_NOTES.length);
      if (BOTTLE_NOTES.length > 1 && next === bottleNoteIndex) next = (next + 1 + Math.floor(Math.random() * (BOTTLE_NOTES.length - 1))) % BOTTLE_NOTES.length;
      bottleNoteIndex = next;
      return bottleNoteText(next);
    }
    function syncBottleDef() {
      const def = DISCOVERY_DEFS.find(d => d.id === 'bottle');
      if (def) def.desc = `A weathered bottle drifted by with a tiny note inside. "${bottleNoteText(bottleNoteIndex)}"`;
    }

    const DISCOVERY_DEFS = [
      { id:'bottle', name:'Message in a Bottle', desc:'A weathered bottle drifted by with a tiny note inside.', emoji:'🍾', c1:'#16406a', c2:'#2f7a9e' },
      { id:'jelly', name:'Moon Jelly Drift', desc:'A rare jellyfish pulsed through the deep blue like a living lantern.', emoji:'🪼', c1:'#183a73', c2:'#6e86d6' },
      { id:'storm', name:'Storm Witness', desc:'You caught lightning splitting the clouds above a restless sea.', emoji:'⚡', c1:'#24304a', c2:'#6e7d96' },
      { id:'deep', name:'Deep Blue Descent', desc:'You reached the deep. The light thinned, the water darkened, and the ocean got quiet.', emoji:'🌊', c1:'#06203b', c2:'#0f5f89' },
      { id:'aurora', name:'Aurora Night', desc:'The night sky glowed with aurora over calm water.', emoji:'🌌', c1:'#10204a', c2:'#3c8fd1' },
      { id:'abyss', name:'The Abyss', desc:'You went deeper than deep. The water turned black-blue and the ocean started whispering in bioluminescence.', emoji:'🕳️', c1:'#020614', c2:'#1a0f3d' },
      { id:'angler', name:'Anglerfish Encounter', desc:'A glowing anglerfish drifted out of the dark, curious, creepy, and kinda beautiful.', emoji:'🐡', c1:'#05081a', c2:'#1f5f5a', img: ANGLER_IMG_URL },
      { id:'vent', name:'Hydrothermal Vent', desc:'A vent on the abyss floor breathed heat and strange light into the crushing dark.', emoji:'♨️', c1:'#120a08', c2:'#7a2d12' },
      { id:'trenches', name:'The Trenches', desc:'The walls closed in and the water turned violet-black. You found the trenches.', emoji:'🪨', c1:'#020316', c2:'#3a2d7a' },
      { id:'crack', name:'Biolume Crack', desc:'A glowing crack in the trench wall pulsed like the ocean had veins.', emoji:'✨', c1:'#04061a', c2:'#5a7fe0' },
      { id:'hadal', name:'Hadal Zone', desc:'Below the trenches, pressure and silence became a place. The hadal zone.', emoji:'🩸', c1:'#050008', c2:'#5a1830' },
      { id:'ribcage', name:'Ancient Ribs', desc:'Huge bone-like ribs curved out of the hadal floor. Best not to ask what they belonged to.', emoji:'🦴', c1:'#120812', c2:'#6a4a66' },
      { id:'void', name:'The Void', desc:'No floor. No light. Just eyes in the dark and the feeling of being watched.', emoji:'👁️', c1:'#000000', c2:'#3a2a5a' },
      { id:'void_eye', name:'Void Watcher', desc:'Something in the void blinked back.', emoji:'🟣', c1:'#050010', c2:'#7a5ad0' },
      { id:'clownfish', name:'Clownfish', desc:'A bright little clownfish weaving through the reefy water.', emoji:'🐠', c1:'#7a2a12', c2:'#f28b36', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.clownfish) },
      { id:'pufferfish', name:'Pufferfish', desc:'A spiky pufferfish. click it and it puffs up... but it stings. no clicking for 1 minute.', emoji:'🐡', c1:'#6b4a12', c2:'#e9b94c', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.pufferfish) },
      { id:'shark', name:'Great White Shark', desc:'A great white shark cruising the deeper water. respect the king.', emoji:'🦈', c1:'#1f3440', c2:'#718e9b', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.shark) },
      { id:'betta', name:'Betta Fish', desc:'A flowy betta fish showing off its dramatic fins.', emoji:'🐟', c1:'#204b8b', c2:'#d84e79', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.betta) },
      { id:'koi', name:'Koi Fish', desc:'A calm koi drifting through the upper deep.', emoji:'🎏', c1:'#5a4330', c2:'#e76d34', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.koi) },
      { id:'shearfin', name:'Shearfin', desc:'A sharp, silver-blue trench hunter slicing through the violet dark.', emoji:'🐟', c1:'#0a2436', c2:'#4aa6af', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.shearfin) },
      { id:'ribbonpike', name:'Ribbon Pike', desc:'A long, ribbed pike drifting along the trench walls like a living ribbon.', emoji:'🐟', c1:'#102c40', c2:'#6fb9bb', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.ribbonpike) },
      { id:'stoneback', name:'Stoneback', desc:'A heavy, armored trench fish that looks like it swallowed the rocks.', emoji:'🪨', c1:'#3a2418', c2:'#d29b62', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.stoneback) },
      { id:'scarletveil', name:'Scarlet Veil', desc:'A red hadal drifter with fins like torn silk in crushing pressure.', emoji:'🩸', c1:'#2a0a18', c2:'#d26780', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.scarletveil) },
      { id:'basinlantern', name:'Basin Lantern', desc:'A lantern-lit hadal fish, glowing softly where light shouldn\'t exist.', emoji:'🏮', c1:'#2a1230', c2:'#e7839b', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.basinlantern) },
      { id:'emberwhip', name:'Ember Whip', desc:'A hot-tailed hadal fish with an ember glow trailing behind it.', emoji:'🔥', c1:'#301018', c2:'#ef9b80', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.emberwhip) },
      { id:'shipwreck', name:'Sunken Wreck', desc:'A broken wooden ship resting in the hadal dark. you looted what was left inside.', emoji:'🚢', c1:'#2a1e15', c2:'#8a6b4e' },
      { id:'palesentinel', name:'Pale Sentinel', desc:'A pale void watcher, drifting silently through the black like a ghost.', emoji:'👻', c1:'#0b1028', c2:'#778ac1', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.palesentinel) },
      { id:'thewatcher', name:'The Watcher', desc:'It doesn\'t swim so much as observe. the void stares back.', emoji:'👁️', c1:'#050510', c2:'#7777a5', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.thewatcher) },
      { id:'void_octopus', name:'Void Octopus', desc:'A massive void octopus rose from the hadal dark. you survived the encounter.', emoji:'🦑', c1:'#08162a', c2:'#5d49a8', img: () => 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(VOID_OCTOPUS_SVG) }
    ];
    const ACHIEVEMENT_DEFS = [
      { id:'first_find', name:'First Discovery', desc:'Find your first discovery.', check: () => discoveries.length >= 1 },
      { id:'collector', name:'Collector', desc:'Find 3 discoveries.', check: () => discoveries.length >= 3 },
      { id:'oceanographer', name:'Oceanographer', desc:'Find all discoveries.', check: () => discoveries.length >= DISCOVERY_DEFS.length },
      { id:'clicker', name:'Hands On', desc:'Click the ocean 20 times.', check: () => clicks >= 20 },
      { id:'photographer', name:'Photo Mode', desc:'Save a photo.', check: () => photoCount >= 1 },
      { id:'chaos', name:'Crash Test Dummy', desc:'Initiate a crash.', check: () => achievements.includes('chaos') },
      { id:'abyss_diver', name:'Abyss Diver', desc:'Reach the abyss in Ocean: Part 3.', check: () => discoveries.includes('abyss') },
      { id:'abyss_secrets', name:'Abyss Secrets', desc:'Find every abyss discovery.', check: () => ['abyss','angler','vent'].every(id => discoveries.includes(id)) },
      { id:'trench_diver', name:'Trench Diver', desc:'Reach the trenches.', check: () => discoveries.includes('trenches') },
      { id:'hadal_diver', name:'Hadal Diver', desc:'Reach the hadal zone.', check: () => discoveries.includes('hadal') },
      { id:'void_diver', name:'Void Diver', desc:'Reach the void. why would you do that.', check: () => discoveries.includes('void') },
      { id:'deepest_secrets', name:'Deepest Secrets', desc:'Find every deep-layer discovery.', check: () => ['trenches','crack','hadal','ribcage','void','void_eye'].every(id => discoveries.includes(id)) },
      { id:'fish_friend', name:'Fish Friend', desc:'Discover your first fish species.', check: () => ALL_FISH_IDS.some(id => discoveries.includes(id)) },
      { id:'ichthyologist', name:'Ichthyologist', desc:'Discover all fish species from the great fish expansion.', check: () => ['clownfish','pufferfish','shark','betta','koi'].every(id => discoveries.includes(id)) },
      { id:'trench_fauna', name:'Trench Fauna', desc:'Discover all trench fish: Shearfin, Ribbon Pike, and Stoneback.', check: () => ['shearfin','ribbonpike','stoneback'].every(id => discoveries.includes(id)) },
      { id:'hadal_fauna', name:'Hadal Fauna', desc:'Discover all hadal fish: Scarlet Veil, Basin Lantern, and Ember Whip.', check: () => ['scarletveil','basinlantern','emberwhip'].every(id => discoveries.includes(id)) },
      { id:'void_fauna', name:'Void Fauna', desc:'Discover the void fish: Pale Sentinel and The Watcher.', check: () => ['palesentinel','thewatcher'].every(id => discoveries.includes(id)) },
      { id:'abyssal_biologist', name:'Abyssal Biologist', desc:'Discover every fish species in the ocean, from surface to void.', check: () => ALL_FISH_IDS.every(id => discoveries.includes(id)) },
      { id:'puff_puff', name:'Puff Puff', desc:'Click a pufferfish and make it puff up.', check: () => achievements.includes('puff_puff') },
      { id:'deep_blue', name:'Deep Blue', desc:'Stop the wipeout supply in The Deep Blue facility.', check: () => achievements.includes('deep_blue') },
      { id:'octopus_slayer', name:'Octopus Slayer', desc:'Defeat the Void Octopus in the hadal depths.', check: () => achievements.includes('octopus_slayer') }
    ];
    syncBottleDef();

    function saveSettings() {
      try { localStorage.setItem('ocean_settings', codecStringify({ soundEnabled, weatherMode, reducedMotion })); } catch (_) {}
    }
    function saveGameState() {
      try {
        localStorage.setItem('ocean_discoveries', codecStringify(discoveries));
        localStorage.setItem('ocean_achievements', codecStringify(achievements));
        localStorage.setItem('ocean_equipped', equippedDiscovery || '');
        localStorage.setItem('ocean_clicks', String(clicks));
        localStorage.setItem('ocean_photos', String(photoCount));
        localStorage.setItem('ocean_bottles_found', String(bottlesFound));
        localStorage.setItem('ocean_bottle_note', String(bottleNoteIndex));
        localStorage.setItem('ocean_bottom_trips', String(bottomTrips));
        localStorage.setItem('ocean_click_lock_until', String(clickLockUntil));
        localStorage.setItem('ocean_void_quest', codecStringify(quest));
        localStorage.setItem('ocean_facility', codecStringify(facility));
        localStorage.setItem('ocean_perspective', String(perspective));
        localStorage.setItem('ocean_ship_looted', shipLooted ? '1' : '0');
        localStorage.setItem('ocean_mining', codecStringify(mining));
        if (blackoutActive) localStorage.setItem(BLACKOUT_KEY, String(blackoutUntil));
        else localStorage.removeItem(BLACKOUT_KEY);
      } catch (_) {}
    }
    function loadSettings() {
      try {
        const s = codecParse(localStorage.getItem('ocean_settings') || 'null');
        if (!s) return;
        if (typeof s.soundEnabled === 'boolean') soundEnabled = s.soundEnabled;
        if (['auto','clear','rain','storm','snow'].includes(s.weatherMode)) weatherMode = s.weatherMode;
        if (typeof s.reducedMotion === 'boolean') reducedMotion = s.reducedMotion;
      } catch (_) {}
    }

    // ---------- SAVE EXPORT / IMPORT / CORRUPTION ----------
    const SAVE_KEYS = [
      'ocean_settings','ocean_discoveries','ocean_achievements','ocean_equipped',
      'ocean_clicks','ocean_photos','ocean_bottles_found','ocean_bottle_note','ocean_bottom_trips',
      'ocean_click_lock_until','ocean_void_quest','ocean_facility','ocean_perspective','ocean_ship_looted',
      'ocean_mining','ocean_void_octopus_defeated','ocean_blackout_until','ocean_bgm_state'
    ];
    const SAVE_FORMAT = 'ocsv';
    const SAVE_VERSION = 3;
    const SAVE_ALG = 'ocsv-xor-v2';
    const SAVE_SECRET = 'ocean::deep-blue::save::v2';
    const SAVE_FEATURES = [
      'shoreDock', 'mining', 'midwaterOres', 'blackout', 'bottleNotes', 'voidQuest', 'shipwreck', 'voidOctopus'
    ];
    const SAVE_FEATURE_KEYS = [
      'ocean_perspective', 'ocean_mining', 'ocean_blackout_until', 'ocean_bottles_found',
      'ocean_bottle_note', 'ocean_void_quest', 'ocean_facility', 'ocean_ship_looted', 'ocean_void_octopus_defeated'
    ];
    const SCALAR_SAVE_KEYS = [
      'ocean_clicks', 'ocean_photos', 'ocean_bottles_found', 'ocean_bottle_note',
      'ocean_bottom_trips', 'ocean_click_lock_until', 'ocean_perspective',
      'ocean_ship_looted', 'ocean_blackout_until'
    ];
    let corrupted = false;
    let corruptRaf = 0;
    const CORRUPT_SVGS = ["data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzUwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSItMTc1IC0xMDAgMzUwIDIwMCI+PGcgIHN0cm9rZT0iI2Y2YjNjZCIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj4NCiAgPHBhdGggZD0iTS03NyAwIFEtNDggLTI4IDIgLTI0IFE0MCAtMjAgNjkgMCBRMzkgMjQgLTIgMjUgUS00OCAyOCAtNzcgMFoiIGZpbGw9IiNiYjU1N2UiIC8+PHBhdGggZD0iTS03MiAwIC0xMjIgLTM5IC0xMTAgMCAtMTIyIDM4WiIgZmlsbD0iIzcxMzk1ZiIgLz48cGF0aCBkPSJNLTMwIC0yMiAwIC01MCAyOCAtMjBaIiBmaWxsPSIjZTc4MzliIiAvPjxwYXRoIGQ9Ik0tMjUgMjIgNCA0NyAyMCAyMFoiIGZpbGw9IiM4NzNmNzAiIC8+PGNpcmNsZSBjeD0iNDIiIGN5PSItNSIgcj0iNSIgZmlsbD0iI2ZmZTZjYyIgc3Ryb2tlPSJub25lIiAvPjxwYXRoIGQ9Ik0tNDUgLTE3djM0IE0tMjIgLTIzdjQ1IE0xIC0yM3Y0NCBNMjMgLTE3djM0IiBmaWxsPSJub25lIiBvcGFjaXR5PSIuNzUiIC8+PHBhdGggZD0iTS03IDBoNDgiIHN0cm9rZT0iI2ZmZDJkOCIgb3BhY2l0eT0iLjU1IiAvPg0KIDwvZz4=","data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzUwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSItMTc1IC0xMDAgMzUwIDIwMCI+PGcgIHN0cm9rZT0iI2ZmYzVhOSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj4NCiAgPHBhdGggZD0iTS02NSAwIFEtMzkgLTI0IDQgLTIxIFEzNiAtMTggNTggMCBRMzUgMjIgMiAyMyBRLTQwIDI0IC02NSAwWiIgZmlsbD0iI2NmNmQ2OCIgLz48cGF0aCBkPSJNLTYyIDAgLTEwOSAtMzIgLTk5IDAgLTEwOSAzMVoiIGZpbGw9IiM4MDNkNTgiIC8+PHBhdGggZD0iTS0yMiAtMjAgNiAtNDggMjggLTE3WiIgZmlsbD0iI2VmOWI4MCIgLz48Y2lyY2xlIGN4PSIzNyIgY3k9Ii01IiByPSI1IiBmaWxsPSIjZmZmMWQwIiBzdHJva2U9Im5vbmUiIC8+PHBhdGggZD0iTS0zMCAtMTV2MzAgTS03IC0yMHY0MCBNMTYgLTE4djM1IiBmaWxsPSJub25lIiAvPjxwYXRoIGQ9Ik01OCAycTI2IDEgMjUgMThxLTIgMTItMTMgMTQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmOTM4ZSIgc3Ryb2tlLXdpZHRoPSI0IiAvPjxjaXJjbGUgY3g9IjcwIiBjeT0iMjAiIHI9IjMiIGZpbGw9IiNmZmYwY2EiIHN0cm9rZT0ibm9uZSIgLz4NCiA8L2c+","data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzUwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSItMTc1IC0xMDAgMzUwIDIwMCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnaG9zdCIgeDI9IjAiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjYzNkOWZmIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjNTU2NmE1Ii8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PGcgIHN0cm9rZT0iI2M1ZDhmZiIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj4NCiAgPHBhdGggZD0iTS05MSAwIFEtNTcgLTM1IC0yIC0yOSBRNDMgLTI2IDc2IDAgUTQyIDI5IC00IDMxIFEtNjAgMzQgLTkxIDBaIiBmaWxsPSJ1cmwoI2dob3N0KSIgLz48cGF0aCBkPSJNLTg3IDAgLTEzNyAtMzggLTEyNSAwIC0xMzcgMzdaIiBmaWxsPSIjMzc0NTc5IiAvPjxwYXRoIGQ9Ik0tMzEgLTI4IDIgLTU1IDI3IC0yNVoiIGZpbGw9IiM3NzhhYzEiIC8+PHBhdGggZD0iTS0yOCAyOCA4IDQ3IDI3IDI1WiIgZmlsbD0iIzNjNGM4NSIgLz48cGF0aCBkPSJNNzYgMHEyMCAtMjAgMzYgLTdxLTcgOCAwIDE1UTk2IDIwIDc2IDBaIiBmaWxsPSIjNjM3N2I1IiAvPjxjaXJjbGUgY3g9IjQ4IiBjeT0iLTYiIHI9IjQuNSIgZmlsbD0iI2I5ZjhmZiIgc3Ryb2tlPSJub25lIiAvPjxjaXJjbGUgY3g9IjQ4IiBjeT0iLTYiIHI9IjEwIiBmaWxsPSJub25lIiBzdHJva2U9IiM4N2RmZmYiIG9wYWNpdHk9Ii42NSIgLz48cGF0aCBkPSJNLTU0IC0xM3ExNSAxNCAwIDI3IE0tMjAgLTI1cTEyIDI1IDAgNDkgTTEyIC0yNXExMiAyNSAwIDUwIiBmaWxsPSJub25lIiBvcGFjaXR5PSIuNjUiIC8+DQogPC9nPg==","data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzUwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSItMTc1IC0xMDAgMzUwIDIwMCI+PGcgIHN0cm9rZT0iI2I5ZThlZCIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj4NCiAgPHBhdGggZD0iTS04NyAwIFEtNTcgLTI4IC0yIC0yNCBRMzYgLTIxIDY5IDAgUTM4IDI1IC00IDI1IFEtNTYgMjggLTg3IDBaIiBmaWxsPSIjNDk4YzljIiAvPjxwYXRoIGQ9Ik0tODIgMCAtMTI4IC0zMiAtMTE5IDAgLTEyOCAzMVoiIGZpbGw9IiMyODYwNzUiIC8+PHBhdGggZD0iTS0zNCAtMjIgMyAtNDggMjYgLTIwWiIgZmlsbD0iIzZmYjliYiIgLz48cGF0aCBkPSJNLTMwIDIxIDkgNDIgMjYgMjBaIiBmaWxsPSIjMmI3MTgxIiAvPjxjaXJjbGUgY3g9IjQzIiBjeT0iLTUiIHI9IjUiIGZpbGw9IiNmZmYwYjgiIHN0cm9rZT0ibm9uZSIgLz48cGF0aCBkPSJNLTUzIC0xM2w4IDEzIC04IDEzIE0tMjggLTE5bDggMTkgLTggMTggTS0zIC0yMiA1IDAgLTMgMjIiIGZpbGw9Im5vbmUiIG9wYWNpdHk9Ii42IiAvPg0KIDwvZz4=","data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzUwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSItMTc1IC0xMDAgMzUwIDIwMCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJyb3NlIiB4Mj0iMCIgeTI9IjEiPjxzdG9wIHN0b3AtY29sb3I9IiNmZmIxYWUiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNhOTQwNjYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48ZyAgc3Ryb2tlPSIjZmZiNGJjIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPg0KICA8cGF0aCBkPSJNLTk4IDAgUS02NSAtMzkgLTQgLTMxIFE0NSAtMjYgNzggMCBRNDUgMjggLTcgMzIgUS03MCAzOCAtOTggMFoiIGZpbGw9InVybCgjcm9zZSkiIC8+PHBhdGggZD0iTS05NSAwIC0xNDQgLTM0IC0xMzMgMCAtMTQ0IDM0WiIgZmlsbD0iIzhmMzk1YyIgLz48cGF0aCBkPSJNLTM2IC0zMCBRLTggLTYyIDI0IC0yOVoiIGZpbGw9IiNkMjY3ODAiIC8+PHBhdGggZD0iTS0yNCAyOSA4IDUzIDI5IDI3WiIgZmlsbD0iIzkxM2Q2NCIgLz48Y2lyY2xlIGN4PSI1MiIgY3k9Ii02IiByPSI1IiBmaWxsPSIjZmZmMWQ0IiBzdHJva2U9Im5vbmUiIC8+PHBhdGggZD0iTS01MyAtMTVxMTIgMTUgMCAzMCBNLTIyIC0yNXExNSAyNSAwIDUwIE05IC0yOHExNCAyOCAwIDU1IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmMwYmEiIG9wYWNpdHk9Ii43IiAvPjxjaXJjbGUgY3g9Ii0yMCIgY3k9Ii0yIiByPSIzIiBmaWxsPSIjZmZlM2M5IiBzdHJva2U9Im5vbmUiIC8+DQogPC9nPg==","data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzUwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSItMTc1IC0xMDAgMzUwIDIwMCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJzaWx2ZXIiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzllZTZlMSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzMxN2Y5MSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxnICBzdHJva2U9IiNiOGY0ZWQiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+DQogIDxwYXRoIGQ9Ik0tMTAwIDAgUS02MyAtNDIgMCAtMzQgUTQ1IC0yOCA3NyAwIFE0MiAzMSAtNyAzNCBRLTY2IDM4IC0xMDAgMFoiIGZpbGw9InVybCgjc2lsdmVyKSIgLz48cGF0aCBkPSJNLTk2IDAgLTE0MiAtMzQgLTEzMiAwIC0xNDIgMzRaIiBmaWxsPSIjMmY3ODhkIiAvPjxwYXRoIGQ9Ik0tMzAgLTMyIFEtOCAtNTggMjQgLTM0IiBmaWxsPSIjNGFhNmFmIiAvPjxwYXRoIGQ9Ik0tMjQgMzEgUS01IDUxIDI0IDMyIiBmaWxsPSIjMjY2NDdhIiAvPjxjaXJjbGUgY3g9IjUzIiBjeT0iLTUiIHI9IjUiIGZpbGw9IiNmZmYwYjgiIHN0cm9rZT0ibm9uZSIgLz48cGF0aCBkPSJNNzMgNWwxNCAzIiBmaWxsPSJub25lIiBzdHJva2U9IiNkMGZmZjYiIC8+DQogIDxwYXRoIGQ9Ik0tNTggLTEyIFEtOCAwIC0zNSAxOCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOWNlNWRjIiBvcGFjaXR5PSIuOCIgLz48Y2lyY2xlIGN4PSItNTAiIGN5PSIwIiByPSIzIiBmaWxsPSIjZDlmZmZhIiBzdHJva2U9Im5vbmUiIC8+DQogPC9nPg==","data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzUwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSItMTc1IC0xMDAgMzUwIDIwMCI+PGcgIHN0cm9rZT0iI2VlZDJhNiIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj4NCiAgPHBhdGggZD0iTS04MiAwIFEtNTEgLTI0IDEgLTIyIFE0MCAtMTggNjUgMCBRMzYgMjIgLTUgMjMgUS01NSAyNSAtODIgMFoiIGZpbGw9IiNkMjliNjIiIC8+PHBhdGggZD0iTS03OCAwIC0xMjUgLTMxIC0xMTUgMCAtMTI1IDMwWiIgZmlsbD0iI2E5NjI1NSIgLz48cGF0aCBkPSJNLTMyIC0yMCAwIC00NCAyNCAtMThaIiBmaWxsPSIjZThiNjc2IiAvPjxjaXJjbGUgY3g9IjQyIiBjeT0iLTQiIHI9IjUiIGZpbGw9IiNmZmY0YzQiIHN0cm9rZT0ibm9uZSIgLz48cGF0aCBkPSJNLTQxIC0xN3YzNCBNLTE4IC0yMXY0MSBNNSAtMjB2NDAgTTI4IC0xNHYyOSIgZmlsbD0ibm9uZSIgb3BhY2l0eT0iLjY1IiAvPg0KIDwvZz4=","data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzUwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSItMTc1IC0xMDAgMzUwIDIwMCI+PGcgIHN0cm9rZT0iI2M1Y2FmZiIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj4NCiAgPHBhdGggZD0iTS05MiAwIFEtNTggLTM0IC03IC0yOSBRNDEgLTI1IDc3IDAgUTQ0IDI5IC02IDMxIFEtNjAgMzMgLTkyIDBaIiBmaWxsPSIjNTU1OTg4IiAvPjxwYXRoIGQ9Ik0tODggMCAtMTQxIC0zNyAtMTI4IDAgLTE0MSAzN1oiIGZpbGw9IiMyOTJlNTAiIC8+PHBhdGggZD0iTS0zMiAtMjcgMSAtNTUgMjggLTI0WiIgZmlsbD0iIzc3NzdhNSIgLz48cGF0aCBkPSJNLTMwIDI3IDggNDcgMjggMjRaIiBmaWxsPSIjMzYzYjY4IiAvPjxjaXJjbGUgY3g9IjQ3IiBjeT0iLTYiIHI9IjUiIGZpbGw9IiNlZGZmZmYiIHN0cm9rZT0ibm9uZSIgLz48Y2lyY2xlIGN4PSI0NyIgY3k9Ii02IiByPSIxMiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjYTRlZWZmIiAvPjxwYXRoIGQ9Ik0tNTAgLTE0cTEyIDEzIDAgMjggTS0yMSAtMjVxMTMgMjUgMCA0OSBNOSAtMjVxMTMgMjUgMCA0OSIgZmlsbD0ibm9uZSIgb3BhY2l0eT0iLjU1IiAvPjxwYXRoIGQ9Ik03NyAwcTIwIC0xNiAyOCAtNHEtOCA4IDAgMTRxLTE0IDgtMjgtMTBaIiBmaWxsPSIjNmE3MDliIiAvPg0KIDwvZz4="];
    const corruptImages = [];
    let corruptImagesReady = false;
    (function preloadCorruptSvgs(){
      let loaded = 0;
      CORRUPT_SVGS.forEach((src, i) => {
        const img = new Image();
        img.decoding = 'async';
        img._vw = 350; img._vh = 200;
        const done = () => { loaded++; if (loaded >= CORRUPT_SVGS.length) corruptImagesReady = true; };
        img.onload = done; img.onerror = done;
        img.src = src;
        if (img.complete) done();
        corruptImages[i] = img;
      });
      if (!CORRUPT_SVGS.length) corruptImagesReady = true;
    })();
    (function preloadCorruptSvgs(){
      let loaded = 0;
      CORRUPT_SVGS.forEach((src, i) => {
        const img = new Image();
        img.decoding = "async";
        img._vw=350;img._vh=200;const done = () => { loaded++; if (loaded >= CORRUPT_SVGS.length) corruptImagesReady = true; };
        img.onload = done; img.onerror = done;
        img.src = src;
        corruptImages[i] = img;
      });
    })

    function ocsvBytesToB64(bytes) {
      let bin = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      return btoa(bin);
    }
    function ocsvB64ToBytes(b64) {
      const bin = atob(String(b64 || '').replace(/\s+/g, ''));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    function ocsvStrBytes(str) { return new TextEncoder().encode(String(str)); }
    function ocsvBytesStr(bytes) { return new TextDecoder().decode(bytes); }
    function ocsvFnv1a(bytes, seed = 2166136261) {
      let h = seed >>> 0;
      for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619) >>> 0; }
      return h >>> 0;
    }
    function ocsvMac(saltB64, payloadB64) {
      const a = ocsvFnv1a(ocsvStrBytes(SAVE_SECRET + '|' + saltB64 + '|' + payloadB64 + '|A'), 2166136261);
      const b = ocsvFnv1a(ocsvStrBytes(SAVE_SECRET + '|' + payloadB64 + '|' + saltB64 + '|B'), 338324690);
      const c = ocsvFnv1a(ocsvStrBytes(payloadB64 + '|' + SAVE_SECRET + '|' + saltB64 + '|C'), 0x811c9dc5);
      return [a, b, c].map(n => n.toString(16).padStart(8, '0')).join('');
    }
    function ocsvKeystreamByte(keyBytes, saltBytes, counter, i) {
      let x = keyBytes[i % keyBytes.length] ^ saltBytes[i % saltBytes.length];
      x = (x + ((counter * 131) & 255) + i * 17) & 255;
      x ^= (x << 3) & 255;
      x ^= (x >>> 2) & 255;
      x ^= (keyBytes[(i + counter) % keyBytes.length] + saltBytes[(counter + i * 7) % saltBytes.length]) & 255;
      return x & 255;
    }
    function ocsvCrypt(bytes, saltBytes) {
      const keyBytes = ocsvStrBytes(SAVE_SECRET);
      const out = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) {
        const k = ocsvKeystreamByte(keyBytes, saltBytes, (i / 16) | 0, i);
        out[i] = bytes[i] ^ k;
      }
      return out;
    }
    function ocsvRandomBytes(n) {
      const out = new Uint8Array(n);
      if (crypto && crypto.getRandomValues) crypto.getRandomValues(out);
      else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
      return out;
    }

    function buildSavePayload() {
      saveGameState();
      const data = {};
      for (const k of SAVE_KEYS) {
        const raw = localStorage.getItem(k);
        if (raw === null) continue;
        try { data[k] = codecParse(raw); }
        catch (_) { data[k] = raw; }
      }
      const featureData = {};
      for (const k of SAVE_FEATURE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(data, k)) featureData[k] = data[k];
      }
      return {
        format: SAVE_FORMAT,
        version: SAVE_VERSION,
        game: 'ocean',
        exportedAt: new Date().toISOString(),
        features: SAVE_FEATURES,
        featureData,
        data
      };
    }

    function exportSave() {
      try {
        const payload = buildSavePayload();
        const plain = ocsvStrBytes(codecStringify(payload));
        const salt = ocsvRandomBytes(16);
        const cipher = ocsvCrypt(plain, salt);
        const saltB64 = ocsvBytesToB64(salt);
        const payloadB64 = ocsvBytesToB64(cipher);
        const envelope = {
          format: SAVE_FORMAT,
          version: SAVE_VERSION,
          game: 'ocean',
          alg: SAVE_ALG,
          salt: saltB64,
          payload: payloadB64,
          mac: ocsvMac(saltB64, payloadB64)
        };
        const text = codecStringify(envelope);
        const blob = new Blob([text], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `ocean-save-${stamp}.ocsv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        feedbackStatus.textContent = 'save: exported encrypted .ocsv';
        sfxClick();
      } catch (e) {
        console.warn('export failed', e);
        feedbackStatus.textContent = 'save: export failed';
      }
    }

    function isValidOceanSave(obj) {
      if (!obj || typeof obj !== 'object') return false;
      if (obj.format !== SAVE_FORMAT) return false;
      if (obj.game !== 'ocean') return false;
      if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) return false;
      return true;
    }

    function decryptOceanSave(obj) {
      if (!obj || typeof obj !== 'object') return null;
      if (obj.format !== SAVE_FORMAT || obj.game !== 'ocean') return null;
      // legacy plain v1 (previous format)
      if (obj.version === 1 && obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
        return obj;
      }
      const supportedVersion = obj.version === SAVE_VERSION || obj.version === 2;
      if (!supportedVersion || obj.alg !== SAVE_ALG) return null;
      if (typeof obj.salt !== 'string' || typeof obj.payload !== 'string' || typeof obj.mac !== 'string') return null;
      if (obj.mac !== ocsvMac(obj.salt, obj.payload)) return null;
      try {
        const salt = ocsvB64ToBytes(obj.salt);
        const cipher = ocsvB64ToBytes(obj.payload);
        const plain = ocsvCrypt(cipher, salt);
        const decoded = codecParse(ocsvBytesStr(plain));
        if (!isValidOceanSave(decoded)) return null;
        return decoded;
      } catch (_) {
        return null;
      }
    }

    function applyImportedSave(obj) {
      const data = { ...(obj.data || {}) };
      const featureData = obj.featureData && typeof obj.featureData === 'object' && !Array.isArray(obj.featureData) ? obj.featureData : {};
      for (const k of SAVE_FEATURE_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(data, k) && Object.prototype.hasOwnProperty.call(featureData, k)) data[k] = featureData[k];
      }
      // wipe known keys first, then apply imported ones (no save data lost on corruption path; this is a valid import)
      for (const k of SAVE_KEYS) localStorage.removeItem(k);
      for (const [k, v] of Object.entries(data)) {
        if (!SAVE_KEYS.includes(k)) continue;
        try {
          let raw;
          if (k === 'ocean_ship_looted') raw = (v === true || v === 1 || v === '1') ? '1' : '0';
          else if (SCALAR_SAVE_KEYS.includes(k) && typeof v === 'number') raw = String(v);
          else raw = typeof v === 'string' ? v : codecStringify(v);
          localStorage.setItem(k, raw);
        } catch (_) {}
      }
      feedbackStatus.textContent = 'save: imported .ocsv - reloading...';
      setTimeout(() => location.reload(), 350);
    }

    function triggerCorruption() {
      if (corrupted) return;
      corrupted = true;
      blackoutActive = false;
      blackoutUntil = 0;
      try { localStorage.removeItem(BLACKOUT_KEY); } catch (_) {}
      try { if (rafId) cancelAnimationFrame(rafId); } catch (_) {}
      try { pauseBgmAll(true); } catch (_) {}
      try { if (masterGain) masterGain.gain.value = 0; } catch (_) {}
      try { if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); } catch (_) {}
      try { if (audioCtx && audioCtx.state !== 'closed') audioCtx.suspend().catch(()=>{}); } catch (_) {}
      try { document.querySelectorAll('audio').forEach(a => { if (a.id !== 'corruptAudio') { try { a.pause(); a.muted = true; a.volume = 0; } catch(_){} } }); } catch (_) {}

      // hide all UI
      document.querySelectorAll('.ui, .modal, .hint, .settings-wrap, .photo-exit, .toast, #toast, #bossUi, #oxygenHud, #blackoutOverlay').forEach(el => {
        el.style.display = 'none';
      });
      document.body.style.background = '#000';
      document.body.style.overflow = 'hidden';

      const overlay = document.getElementById('corruptOverlay');
      const c = document.getElementById('corruptCanvas');
      const corruptAudio = document.getElementById('corruptAudio');
      overlay.style.display = 'block';

      // play fearfulharmony
      try {
        corruptAudio.currentTime = 0;
        corruptAudio.volume = 0.85;
        const p = corruptAudio.play();
        if (p && p.catch) p.catch(() => {
          // if autoplay blocked, start on first interaction
          const resume = () => { corruptAudio.play().catch(() => {}); window.removeEventListener('pointerdown', resume); window.removeEventListener('keydown', resume); };
          window.addEventListener('pointerdown', resume);
          window.addEventListener('keydown', resume);
        });
      } catch (_) {}

      const cx = c.getContext('2d');
      function resizeCorrupt() {
        const d = Math.min(window.devicePixelRatio || 1, 2);
        c.width = Math.floor(window.innerWidth * d);
        c.height = Math.floor(window.innerHeight * d);
        cx.setTransform(d, 0, 0, d, 0, 0);
      }
      resizeCorrupt();
      window.addEventListener('resize', resizeCorrupt);

      corruptImagesReady = corruptImages.length >= CORRUPT_SVGS.length;

      const rand = (a, b) => a + Math.random() * (b - a);
      let lastSpawn = -99999;
      function corruptFrame(ts) {
        const w = window.innerWidth, h = window.innerHeight;
        // HoM smear: draw canvas onto itself with offsets/scaling
        cx.save();
        cx.globalAlpha = 0.92;
        cx.translate(w / 2, h / 2);
        const smearAngle = Math.sin(ts * 0.0003) * 0.003;
        cx.rotate(smearAngle);
        cx.scale(1.01 + Math.sin(ts * 0.0007) * 0.004, 1.008 + Math.cos(ts * 0.0006) * 0.004);
        cx.translate(-w / 2 + Math.sin(ts * 0.0011) * 2.2, -h / 2 + Math.cos(ts * 0.0009) * 1.8);
        cx.drawImage(c, 0, 0, c.width / Math.min(window.devicePixelRatio || 1, 2), c.height / Math.min(window.devicePixelRatio || 1, 2));
        cx.restore();

        // darken slightly to keep it from blowing out completely
        cx.fillStyle = 'rgba(0,0,0,0.03)';
        cx.fillRect(0, 0, w, h);

        // place random SVGs every few frames
        if (ts - lastSpawn > 55) {
          lastSpawn = ts;
          const count = 1 + Math.floor(Math.random() * 3);
          for (let n = 0; n < count; n++) {
            const img = corruptImages[Math.floor(Math.random() * corruptImages.length)];
            if (!img) continue;
            const nw = img.naturalWidth || img._vw || 350;
            const nh = img.naturalHeight || img._vh || 200;
            const size = rand(40, Math.min(w, h) * 0.35);
            const aspect = nw / nh;
            const dw = size * aspect;
            const dh = size;
            cx.save();
            cx.translate(rand(-dw * 0.3, w + dw * 0.3), rand(-dh * 0.3, h + dh * 0.3));
            cx.rotate(rand(-Math.PI, Math.PI));
            cx.globalAlpha = rand(0.35, 0.95);
            try { cx.drawImage(img, -dw / 2, -dh / 2, dw, dh); } catch (_) {}
            cx.restore();
          }
        }

        corruptRaf = requestAnimationFrame(corruptFrame);
      }
      // seed black background
      cx.fillStyle = '#000';
      cx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      corruptRaf = requestAnimationFrame(corruptFrame);
    }

    async function importSaveFile(file) {
      try {
        const text = await file.text();
        let obj;
        try {
          obj = codecParse(text);
        } catch (_) {
          triggerCorruption();
          return;
        }
        const decoded = decryptOceanSave(obj);
        if (!decoded) {
          triggerCorruption();
          return;
        }
        applyImportedSave(decoded);
      } catch (_) {
        triggerCorruption();
      }
    }
    function unlockAchievement(id) {
      if (achievements.includes(id)) return false;
      const def = ACHIEVEMENT_DEFS.find(a => a.id === id);
      achievements.push(id);
      saveGameState();
      feedbackStatus.textContent = `achievement unlocked: ${def ? def.name : id}`;
      renderAchievements();
      return true;
    }
    function checkAchievements() {
      for (const a of ACHIEVEMENT_DEFS) {
        if (a.id === 'chaos') continue;
        if (!achievements.includes(a.id) && a.check()) unlockAchievement(a.id);
      }
    }
    function recordDiscovery(key) {
      if (!discoveries.includes(key)) {
        discoveries.push(key);
        const def = DISCOVERY_DEFS.find(d => d.id === key);
        const name = def ? def.name : key;
        feedbackStatus.textContent = `discovery: ${name}`;
        const isFish = ALL_FISH_IDS.includes(key);
        if (isFish) {
          sfxClick();
          showToast('new fish discovered', name);
        }
        saveGameState();
        checkAchievements();
      }
      renderDiscoveries();
      renderAchievements();
    }
    function equipDiscovery(id) {
      if (!discoveries.includes(id)) return;
      equippedDiscovery = equippedDiscovery === id ? '' : id;
      saveGameState();
      renderDiscoveries();
      syncSettingsUI();
    }
    const UPDATE_LOG = [
      { date: '2026-11-28', tier: 'major update', title: 'shore automation', detail: 'the supply dock now runs a real 10-minute day/night cycle, with 5 minutes of sun followed by 5 minutes of moon. up to four mining pads can hold battery-powered claws; ore from automatic mining lands in a surface chest, while manual swings still go straight to your ledger. added spare battery cells and an unjammer: buy it at the tools tab, then solve its color puzzle from the tablet or dock to free a jammed claw. ore names now show in full, and the old keeper was replaced with a hanging shop sign.' },
      { date: '2026-11-27', tier: 'major update', title: 'Gameplay Update', detail: 'a final forward perspective reaches the shore supply dock: a keeper, ore contracts, pickaxe tiers, and up to two claw rigs with their own batteries. veins sit across the depth bands, take hard strikes that cost extra oxygen, and respawn. manual swings have a short recovery with a growing spam lock, while auto mining keeps its own rhythm. the ledger now teaches first-timers and tracks contract progress, empty veins show as dashed sockets beside solid respawn rings, and blackout wake-up gets an extra line. sealing The Deep Blue makes the abyss the floor.' },
      { date: '2026-11-27', tier: 'feature', title: 'music playlist', detail: 'DeepBlue now rotates into Slime Sea Sunlit Waves and Slime Sea Moonlit Calm, then loops back. tracks use a 4-second crossfade so the seam stays smooth, with depth muffling and mute settings preserved.' },
      { date: '2026-11-27', tier: 'feature', title: 'deep layer fish', detail: 'added 8 new deep-sea fish across trenches, hadal, and the void: Shearfin, Ribbon Pike, Stoneback, Scarlet Veil, Basin Lantern, Ember Whip, Pale Sentinel, and The Watcher. each has its own discovery card and new layer-fauna achievements.' },
      { date: '2026-11-27', tier: 'major update', title: 'the deep blue facility', detail: 'the deepest layer is now The Deep Blue: a submarine-ish facility guarded by Deep Blue. solve 3 encounters (seal valve, enter BLUE code, bypass guard) to stop the scientists\' ocean wipeout supply. added forward/back perspectives for every non-deepest layer, including tappable arctic icebergs on the surface. facility and perspective state now persist.' },
      { date: '2026-11-26', tier: 'feature', title: 'lux studios splash', detail: 'every load now opens with the lux studios intro: a wireframe cube rolls in, speeds up, explodes into lines, and reveals the wordmark before fading into the ocean.' },
      { date: '2026-11-25', tier: 'feature', title: 'deep dive minigame', detail: 'added a side arrow that opens a 10-move minigame. answer with the most underground picks to sink deeper and score higher.' },
      { date: '2026-11-25', tier: 'feature', title: 'the great fish expansion', detail: 'added clownfish, pufferfish, great white sharks, betta fish, and koi across the ocean depths. pufferfish puff up when you click them.' },
      { date: '2026-11-25', tier: 'feature', title: 'the void speaks', detail: 'bottom is now ambient-only (music fades out). the purple void entity talks after 3 seconds, gives a quest (3 bottles, 3 clicked fish, 3 top-to-bottom trips), and unlocks a deeper layer when complete. pufferfish sting locks clicking for 1 minute. fish must be clicked to discover.' },
      { date: '2026-11-25', tier: 'feature', title: 'ocean: part 4 - deeper still', detail: 'added 3 more layers below the abyss: trenches, hadal, and the void. new biomes, particles, click discoveries, achievements, and depth tracking all the way down.' },
      { date: '2026-11-25', tier: 'feature', title: 'ocean: part 3 - the abyss', detail: 'you can go down again past underwater into a new abyss layer, with a darker biome, new creatures/vent, new abyss discoveries, new achievements, and depth-aware audio/visuals.' },
      { date: '2026-11-25', tier: 'feature', title: 'achievements + equipped discoveries', detail: 'split achievements into their own button, made discoveries into proper cards with lock states, and equipping now spawns the discovery in the world.' },
      { date: '2026-11-25', tier: 'bug fix', title: 'photo mode + crash fixes', detail: 'added photo mode exit button, fixed rain clipping at the waterline, avoided file:// bgm CORS silence, and guarded audio volume from non-finite values.' },
      { date: '2026-11-25', tier: 'feature', title: 'crash mode chaos', detail: 'added initiate crash, wii-style crash buzz, and last-second crash audio looping behavior.' },
      { date: '2026-11-25', tier: 'update', title: 'weather + audio feel', detail: 'added rain droplet ripples on the ocean surface and muffled music when diving underwater.' },
      { date: '2026-11-25', tier: 'update', title: 'big ocean pass', detail: 'thunder/lightning, saved settings, photo mode, click ripples/bubbles, surface life, deeper underwater variety, ambient sfx, message in a bottle, discoveries log, reduced motion, time speed slider, and mobile tuning.' },
      { date: '2026-11-25', tier: 'update', title: 'initial ocean release', detail: '2d animated ocean with DeepBlue.wav, day/night cycle, dive controls, settings, and feedback flow.' }
    ];

    function renderUpdateLog() {
      updateList.innerHTML = UPDATE_LOG.map(u => {
        const tier = u.tier ? `<i class="update-tier tier-${u.tier.toLowerCase().replace(/\s+/g, '-')}">${u.tier}</i>` : '';
        return `<div class="update-item"><em>${u.date}${tier}</em><strong>${u.title}</strong><span>${u.detail}</span></div>`;
      }).join('');
    }

    function renderAchievements() {
      achList.innerHTML = ACHIEVEMENT_DEFS.map(a => {
        const unlocked = achievements.includes(a.id);
        return `<div class="ach ${unlocked ? 'unlocked' : ''}"><div><strong>${unlocked ? '✓' : '•'} ${a.name}</strong><small>${a.desc}</small></div><span>${unlocked ? 'unlocked' : 'locked'}</span></div>`;
      }).join('');
    }

    function adminSetStatus(msg) { if (adminStatus) adminStatus.textContent = 'status: ' + msg; }
    function renderDiscoveries() {
      discoverHint.textContent = `discoveries: ${discoveries.length}/${DISCOVERY_DEFS.length} found • depth: ${depthLabel(cameraTarget)}${isDeepSealed() ? ' • deep blue sealed' : ''}`;
      const eq = DISCOVERY_DEFS.find(d => d.id === equippedDiscovery && discoveries.includes(d.id));
      equippedBanner.textContent = eq ? `equipped: ${eq.emoji} ${eq.name}` : 'equipped: none';
      logList.innerHTML = DISCOVERY_DEFS.map(d => {
        const found = discoveries.includes(d.id);
        const equipped = equippedDiscovery === d.id && found;
        const img = (typeof d.img === 'function' ? d.img() : d.img) || svgThumb(d.name, d.emoji, d.c1, d.c2);
        return `<div class="discover-card ${found ? '' : 'locked'} ${equipped ? 'equipped' : ''}">
          <div class="discover-img"><img src="${img}" alt="${found ? d.name : 'Locked discovery'}">${found ? '' : '<div class="discover-lock">🔒</div>'}</div>
          <div>
            <div class="discover-name">${found ? d.name : '??? Locked Discovery'}</div>
            <div class="discover-desc">${found ? d.desc : 'Keep exploring the ocean to unlock this discovery.'}</div>
            <div class="discover-meta">${found ? (equipped ? 'equipped' : 'discovered') : 'undiscovered'}</div>
          </div>
          <div><button class="equip-btn ${equipped ? 'active' : ''}" data-equip="${d.id}" ${found ? '' : 'disabled'}>${equipped ? 'unequip' : 'equip'}</button></div>
        </div>`;
      }).join('');
      logList.querySelectorAll('[data-equip]').forEach(btn => {
        btn.addEventListener('click', () => equipDiscovery(btn.getAttribute('data-equip')));
      });
    }
    loadSettings();
    if (!restoreBgmState()) bgmRestoreDone = true;

    // --- audio sfx ---
    let audioCtx = null, masterGain = null, rainGain = null, windGain = null, underwaterGain = null, dayGain = null, nightGain = null;
    let rainNoise = null, windNoise = null, underwaterNoise = null, dayNoise = null, nightNoise = null;
    let bgmFilters = [], captureDest = null, mediaRecorder = null, audioChunks = [], crashLoopAudio = null;
    function ensureAudio() {
      if (corrupted) return;
      if (audioCtx) return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      window.__oceanAudioCtx = audioCtx;
      masterGain = audioCtx.createGain(); masterGain.gain.value = soundEnabled ? masterVolume : 0;
      rainGain = audioCtx.createGain(); rainGain.gain.value = 0;
      windGain = audioCtx.createGain(); windGain.gain.value = 0;
      underwaterGain = audioCtx.createGain(); underwaterGain.gain.value = 0;
      dayGain = audioCtx.createGain(); dayGain.gain.value = 0;
      nightGain = audioCtx.createGain(); nightGain.gain.value = 0;
      [rainGain, windGain, underwaterGain, dayGain, nightGain].forEach(g => g.connect(masterGain));
      captureDest = audioCtx.createMediaStreamDestination();
      masterGain.connect(audioCtx.destination);
      masterGain.connect(captureDest);
      try {
        if (location.protocol !== 'file:') {
          [bgm, bgm2].forEach(a => {
            a.crossOrigin = 'anonymous';
            const f = audioCtx.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.value = 14000;
            f.Q.value = 0.7;
            const n = audioCtx.createMediaElementSource(a);
            n.connect(f);
            f.connect(masterGain);
            bgmFilters.push(f);
          });
        }
      } catch (_) { /* keep direct element audio if routing fails */ }
      try {
        audioChunks = [];
        mediaRecorder = new MediaRecorder(captureDest.stream);
        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunks.push(e.data);
            const maxChunks = 12; // ~6s at 500ms
            if (audioChunks.length > maxChunks) audioChunks.splice(0, audioChunks.length - maxChunks);
          }
        };
        mediaRecorder.start(500);
      } catch (_) {}

      function noiseBuf() {
        const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i=0;i<data.length;i++) data[i] = Math.random()*2-1;
        return buf;
      }
      function loopNoise(filterType, freq, q, gainNode) {
        const src = audioCtx.createBufferSource(); src.buffer = noiseBuf(); src.loop = true;
        const f = audioCtx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
        src.connect(f); f.connect(gainNode); src.start();
        return {src, f};
      }
      rainNoise = loopNoise('bandpass', 1200, 0.7, rainGain);
      windNoise = loopNoise('lowpass', 500, 0.4, windGain);
      underwaterNoise = loopNoise('lowpass', 350, 0.8, underwaterGain);
      dayNoise = loopNoise('highpass', 2200, 0.3, dayGain); // light air/seagull-ish hiss
      nightNoise = loopNoise('bandpass', 1800, 1.2, nightGain); // soft chirp/nocturnal texture
    }
    function sfxClick() {
      if (corrupted || !audioCtx || !soundEnabled) return;
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 520; g.gain.value = 0.02;
      o.connect(g); g.connect(masterGain); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.08); o.stop(audioCtx.currentTime + 0.09);
    }
    function sfxDive(down) {
      if (corrupted || !audioCtx || !soundEnabled) return;
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(down ? 420 : 220, audioCtx.currentTime);
      o.frequency.exponentialRampToValueAtTime(down ? 180 : 480, audioCtx.currentTime + 0.35);
      g.gain.value = 0.025; o.connect(g); g.connect(masterGain); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4); o.stop(audioCtx.currentTime + 0.41);
    }
    function sfxSplash() {
      if (corrupted || !audioCtx || !soundEnabled) return;
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type='triangle'; o.frequency.setValueAtTime(240, audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(90, audioCtx.currentTime+0.18);
      g.gain.value=0.03; o.connect(g); g.connect(masterGain); o.start(); g.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+0.2); o.stop(audioCtx.currentTime+0.21);
    }
    function sfxBubble() {
      if (corrupted || !audioCtx || !soundEnabled) return;
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type='sine'; o.frequency.setValueAtTime(520, audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime+0.08);
      g.gain.value=0.012; o.connect(g); g.connect(masterGain); o.start(); g.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+0.1); o.stop(audioCtx.currentTime+0.11);
    }
    function sfxDiscovery() {
      if (corrupted || !audioCtx || !soundEnabled) return;
      const now = audioCtx.currentTime;
      [660, 990].forEach((freq, i) => {
        const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
        o.type = 'triangle'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, now + i * 0.07);
        g.gain.exponentialRampToValueAtTime(0.022, now + i * 0.07 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.16);
        o.connect(g); g.connect(masterGain);
        o.start(now + i * 0.07); o.stop(now + i * 0.07 + 0.17);
      });
    }
    function sfxThunder() {
      if (corrupted || !audioCtx || !soundEnabled) return;
      const len = audioCtx.sampleRate * 1.2;
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i=0;i<len;i++) data[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 2);
      const src = audioCtx.createBufferSource(); src.buffer = buf;
      const f = audioCtx.createBiquadFilter(); f.type='lowpass'; f.frequency.value = 220;
      const g = audioCtx.createGain(); g.gain.value = 0.18;
      src.connect(f); f.connect(g); g.connect(masterGain); src.start();
    }
    function isDeepSealed() { return !!(quest && quest.deepBlueSealed); }
    function currentBottomDepth() { return quest && quest.unlockedDeep && !isDeepSealed() ? 6 : 5; }
    function isFacilityLayer() { return quest && quest.unlockedDeep && !isDeepSealed() && cameraY >= currentBottomDepth() - 0.15; }
    const MAX_PERSPECTIVE = 3; // 3 = shore supply perspective
    function canUsePerspective() { return !isFacilityLayer(); }
    function isAtBottom() { return cameraY >= currentBottomDepth() - 0.05; }
    function isShore() { return perspective === 3 && cameraY <= 0.2; }
    function activeOreLayer() {
      if (cameraY < 0.5) return 0;
      if (cameraY < 1.5) return 1;
      if (cameraY < 2.5) return 2;
      if (cameraY < 3.5) return 3;
      if (cameraY < 4.5) return 4;
      if (cameraY < 5.5) return 5;
      return 6;
    }
    function nodeOreId(node) {
      if (!node) return null;
      if (node.ore) return node.ore;
      const id = mining.nodeOre[node.id];
      return RARE_ORES.includes(id) ? id : null;
    }
    function nodeHp(node) {
      const oreId = nodeOreId(node);
      if (!oreId) return 0;
      const until = Number(mining.nodeRespawn[node.id] || 0);
      if (until > Date.now()) return 0;
      const stored = mining.nodeHp[node.id];
      return Number.isFinite(stored) ? stored : ORE_DEFS[oreId].hp;
    }
    function nodeReady(node) {
      const until = Number(mining.nodeRespawn[node.id] || 0);
      return !!nodeOreId(node) && nodeHp(node) > 0 && until <= Date.now();
    }

    function sfxPick() {
      if (corrupted || !audioCtx || !soundEnabled) return;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(190 + mining.pickaxe * 35, audioCtx.currentTime);
      o.frequency.exponentialRampToValueAtTime(70, audioCtx.currentTime + 0.09);
      g.gain.value = 0.035;
      o.connect(g); g.connect(masterGain);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.1);
      o.stop(audioCtx.currentTime + 0.11);
    }
    function sfxClaw() {
      if (corrupted || !audioCtx || !soundEnabled) return;
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(masterGain);
      o.start(t); o.stop(t + 0.17);
    }
    function nodeHash(node, salt) {
      const s = node.id + salt;
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return ((h >>> 0) % 10000) / 10000;
    }
    function oreNodeRadius() { return Math.max(20, Math.min(38, w * 0.038)); }
    function oreNodePos(node) {
      const r = oreNodeRadius();
      const jx = (nodeHash(node, 'x') - 0.5) * w * 0.036;
      const jy = (nodeHash(node, 'y') - 0.5) * h * 0.044;
      const t = simTime * motionMul;
      const sway = Math.sin(t * 0.00062 + node.x * 9) * 2.5;
      const bob = Math.sin(t * 0.0009 + node.x * 11) * 3;
      return { x: node.x * w + jx + sway, y: h * node.y - r * 0.55 + jy + bob, r };
    }
    function machinePadRects() {
      const gap = Math.max(20, w * 0.012);
      const margin = Math.max(16, w * 0.035);
      const scales = [1, 0.95, 0.84, 0.78];
      const scaleSum = scales.reduce((a, b) => a + b, 0);
      const padW = Math.min(250, Math.max(70, (w - margin * 2 - gap * (scales.length - 1)) / (1.4 * scaleSum)));
      const padH = Math.min(150, Math.max(108, h * 0.17));
      const t = simTime * motionMul;
      const sway = i => Math.sin(animTime * 0.00045 + i * 1.7) * 12 + Math.sin(animTime * 0.00018 + i * 2.9) * 5;
      const bob = i => Math.sin(t * 0.00105 + i * 1.8) * 5 + Math.sin(t * 0.00048 + i * 2.6) * 3;
      const extraYs = [0, h * 0.022, -h * 0.008, h * 0.03];
      const halves = scales.map(s => padW * s * 0.7);
      const totalWidth = halves.reduce((a, b) => a + b * 2, 0);
      const spread = Math.max(gap, (w - margin * 2 - totalWidth) / (scales.length - 1));
      let cursor = margin;
      const xs = halves.map((half, i) => {
        const x = Math.max(margin + half, cursor + half + sway(i));
        cursor = x + half + spread;
        return x;
      });
      const overflow = xs[xs.length - 1] + halves[halves.length - 1] - (w - margin);
      if (overflow > 0) for (let i = 0; i < xs.length; i++) xs[i] -= overflow;
      return xs.map((x, i) => {
        const ph = padH * scales[i];
        const waterY = getWaveY(x, h * 0.58);
        return { x, y: waterY + ph * 0.45 + bob(i) * 0.35 + (extraYs[i] || 0), w: padW * scales[i], h: ph };
      });
    }
    function machinePadRect(i = 0) {
      const rects = machinePadRects();
      return rects[Math.min(rects.length - 1, Math.max(0, i | 0))];
    }
    function machineRigGeom(i = 0) {
      const p = machinePadRect(i);
      const rockTop = p.y - p.h * 0.54;
      const beamLift = [1.34, 1.28, 1.22, 1.16][Math.min(3, i | 0)];
      const beamY = Math.max(h * 0.13, rockTop - p.h * beamLift);
      // run the gantry past both edges so it reads as one long dock crane, not a floating stub
      const overhang = Math.max(120, p.w * 0.75);
      return { p, baseX: p.x, rockTop, beamY, beamStart: -overhang, beamEnd: w + overhang };
    }
    function rigHomePos(i = 0) {
      const g = machineRigGeom(i);
      return { x: g.baseX, y: g.beamY + 30 };
    }
    function rigNodePos(node) {
      const p = oreNodePos(node);
      return { x: p.x, y: h * node.layer + p.y - p.r * 0.18 };
    }
    function rigNodeById(id) { return ORE_NODES.find(n => n.id === id) || null; }
    function rigClaims(id, exceptIndex) {
      for (let i = 0; i < machineRigs.length; i++) {
        if (i === exceptIndex || !isPadUnlocked(i)) continue;
        const r = machineRigs[i];
        if (r.targetId === id || r.queueId === id) return true;
      }
      return false;
    }
    function pickRigTarget(nearX, excludeId, rigIndex = 0) {
      const m = mining.machines[rigIndex];
      const tier = m && AUTO_TIERS[m.tier];
      if (!tier || !tier.maxLayer) return null;
      const cands = ORE_NODES.filter(n => n.layer <= tier.maxLayer && n.id !== excludeId && !rigClaims(n.id, rigIndex) && nodeReady(n));
      if (!cands.length) return null;
      cands.sort((a, b) => Math.abs(rigNodePos(a).x - nearX) - Math.abs(rigNodePos(b).x - nearX));
      const shortlist = cands.slice(0, Math.min(4, cands.length));
      return shortlist[Math.floor(Math.random() * shortlist.length)];
    }
    function rigActive(i = 0) {
      const m = mining.machines[i];
      return !!(isPadUnlocked(i) && m && m.tier && !m.broken && m.battery > 0 && !boss.active && !isFacilityLayer() && perspective === 0);
    }
    function rigTravelMs(i = 0) { return Math.max(320, 820 - mining.machines[i].tier * 130); }
    const RIG_WINDUP_MS = 260;
    const RIG_SLAM_MS = 190;
    const RIG_RECOVER_MS = 360;
    function beginRigWindup(rig, node, dest) {
      rig.x = dest.x;
      rig.y = dest.y;
      rig.strikeY = dest.y;
      rig.lift = 58 + (machineRigs.indexOf(rig) % 2) * 10;
      rig.mode = 'windup';
      rig.modeT = 0;
      rig.moving = false;
      rig.pending = false;
    }
    function beginRigTravel(node, pendingStrike, i = 0) {
      if (!node) return;
      const rig = machineRigs[i];
      if (!rig) return;
      if (rig.x == null || rig.y == null) {
        const home = rigHomePos(i);
        rig.x = home.x;
        rig.y = home.y;
      }
      const dest = rigNodePos(node);
      rig.targetId = node.id;
      rig.pending = !!pendingStrike;
      rig.queueId = null;
      if (Math.hypot(dest.x - rig.x, dest.y - rig.y) < 8) {
        beginRigWindup(rig, node, dest);
        return;
      }
      rig.fromX = rig.x;
      rig.fromY = rig.y;
      rig.mode = 'travel';
      rig.modeT = 0;
      rig.moving = true;
    }
    function completeRigStrike(node, i = 0) {
      const m = mining.machines[i];
      const rig = machineRigs[i];
      const oreId = nodeOreId(node);
      if (!m || !m.tier || !rig || !oreId || !nodeReady(node)) return false;
      const def = ORE_DEFS[oreId];
      const tier = AUTO_TIERS[m.tier];
      // the claw slams once and breaks the whole vein. manual picks still chip.
      const ok = strikeOreNode(node, { automatic: true, damage: def.hp, tier: m.tier, machine: i });
      if (!ok) return false;
      sfxClaw();
      m.battery = Math.max(0, m.battery - tier.drain);
      if (Math.random() < tier.breakdown) {
        m.broken = true;
        m.message = 'jammed — use unjammer';
      } else if (m.battery <= 0) {
        m.message = 'battery empty — recharge at shore';
      } else {
        m.message = `cracked ${def.name}`;
      }
      rig.lastStrikeId = node.id;
      rig.targetId = node.id;
      rig.mode = 'recover';
      rig.modeT = 0;
      rig.pending = false;
      rig.moving = false;
      const next = pickRigTarget(rig.x, node.id, i);
      rig.queueId = next ? next.id : null;
      syncMiningHud();
      renderShop();
      saveGameState();
      return true;
    }
    function updateMachineRig(dt, i = 0) {
      const m = mining.machines[i];
      const rig = machineRigs[i];
      if (!m || !m.tier || !rig) return;
      if (!rigActive(i)) { rig.moving = false; return; }
      if (rig.x == null || rig.y == null) {
        const home = rigHomePos(i);
        rig.x = home.x;
        rig.y = home.y;
      }
      const ms = dt * 1000;
      const node = rigNodeById(rig.targetId);
      if (rig.mode === 'travel') {
        if (!node || !nodeReady(node)) {
          const wasPending = rig.pending;
          rig.mode = 'idle';
          rig.pending = false;
          rig.moving = false;
          const alt = pickRigTarget(rig.x, rig.lastStrikeId, i);
          if (alt) beginRigTravel(alt, wasPending, i);
          return;
        }
        const dest = rigNodePos(node);
        rig.modeT += ms;
        const p = Math.min(1, rig.modeT / rigTravelMs(i));
        const ep = easeInOutCubic(p);
        rig.x = lerp(rig.fromX, dest.x, ep);
        rig.y = lerp(rig.fromY, dest.y, ep);
        rig.moving = true;
        if (p >= 1) {
          rig.x = dest.x;
          rig.y = dest.y;
          rig.moving = false;
          if (rig.pending && nodeReady(node)) beginRigWindup(rig, node, dest);
          else { rig.mode = 'idle'; rig.modeT = 0; rig.pending = false; }
        }
        return;
      }
      if (rig.mode === 'windup') {
        if (!node || !nodeReady(node)) { rig.mode = 'idle'; rig.modeT = 0; return; }
        rig.modeT += ms;
        const p = Math.min(1, rig.modeT / RIG_WINDUP_MS);
        rig.y = rig.strikeY - rig.lift * (1 - Math.pow(1 - p, 3));
        rig.moving = false;
        if (p >= 1) { rig.y = rig.strikeY - rig.lift; rig.mode = 'slam'; rig.modeT = 0; }
        return;
      }
      if (rig.mode === 'slam') {
        if (!node || !nodeReady(node)) { rig.mode = 'idle'; rig.modeT = 0; return; }
        rig.modeT += ms;
        const p = Math.min(1, rig.modeT / RIG_SLAM_MS);
        rig.y = rig.strikeY - rig.lift * (1 - p * p * p);
        rig.moving = false;
        if (p >= 1) { rig.y = rig.strikeY; completeRigStrike(node, i); }
        return;
      }
      if (rig.mode === 'recover') {
        rig.modeT += ms;
        rig.moving = false;
        if (rig.modeT >= RIG_RECOVER_MS) {
          rig.mode = 'idle';
          rig.modeT = 0;
          const queued = rigNodeById(rig.queueId);
          rig.queueId = null;
          if (queued && nodeReady(queued)) beginRigTravel(queued, false, i);
        }
        return;
      }
      rig.moving = false;
      const cur = rigNodeById(rig.targetId);
      if ((!cur || !nodeReady(cur)) && !rig.queueId) {
        const next = pickRigTarget(rig.x, rig.lastStrikeId, i);
        if (next) beginRigTravel(next, false, i);
        else {
          rig.targetId = null;
          const home = rigHomePos(i);
          rig.x = home.x;
          rig.y = home.y;
        }
      }
    }
    function ensureRareVeins() {
      const now = Date.now();
      let changed = false;
      const empty = ORE_NODES.filter(n => !n.ore && !nodeOreId(n) && !(Number(mining.nodeRespawn[n.id]) > now));
      if (!empty.length) return false;
      for (const ore of RARE_ORES) {
        const live = ORE_NODES.some(n => !n.ore && nodeOreId(n) === ore && !(Number(mining.nodeRespawn[n.id]) > now));
        if (live) continue;
        if (Math.random() >= RARE_SPAWN_CHANCE) continue;
        const pick = empty.splice(Math.floor(Math.random() * empty.length), 1)[0];
        if (!pick) break;
        mining.nodeOre[pick.id] = ore;
        changed = true;
      }
      return changed;
    }
    function restoreOreNodes(rollRare = false) {
      const now = Date.now();
      let changed = false;
      for (const node of ORE_NODES) {
        const until = Number(mining.nodeRespawn[node.id] || 0);
        if (until && until <= now) {
          delete mining.nodeRespawn[node.id];
          delete mining.nodeHp[node.id];
          if (!node.ore) {
            delete mining.nodeOre[node.id];
            changed = true;
          }
        }
      }
      if ((changed || rollRare) && ensureRareVeins()) changed = true;
      if (changed) { syncMiningHud(); renderShop(); saveGameState(); }
    }
    function contractReady(c) {
      if (!c || mining.contracts[c.id]) return false;
      return Object.keys(c.need).every(id => (mining.ores[id] || 0) >= c.need[id]);
    }
    function checkContractPing() {
      for (const c of CONTRACTS) {
        if (contractReady(c) && !mining.pinged[c.id]) {
          mining.pinged[c.id] = true;
          showToast('contract ready', `${c.title} — cash it in at the shore.`, 3600);
        }
      }
    }
    function strikeOreNode(node, options = {}) {
      const automatic = !!options.automatic;
      const oreId = nodeOreId(node);
      const def = oreId ? ORE_DEFS[oreId] : null;
      if (!def || nodeHp(node) <= 0) {
        if (!automatic) showToast('empty node', 'this vein needs time to grow back.', 1800);
        return false;
      }
      if (!automatic && (boss.active || isFacilityLayer() || isShore() || perspective !== 0)) return false;
      let dmg = options.damage || 1;
      let cost = 0;
      if (!automatic) {
        const now = performance.now();
        const gap = now - lastStrikeAt;
        if (now < manualMineNextAt) {
          if (lastStrikeAt && gap < MANUAL_MINE_FAST_MS) {
            manualMinePenalty = Math.min(MANUAL_MINE_MAX_PENALTY_MS, Math.max(MANUAL_MINE_PENALTY_MS, manualMinePenalty ? Math.round(manualMinePenalty * 1.7) : MANUAL_MINE_PENALTY_MS));
            manualMineNextAt = Math.max(manualMineNextAt, now + MANUAL_MINE_COOLDOWN_MS + manualMinePenalty);
          }
          syncMiningHud();
          feedbackStatus.textContent = manualMinePenalty > 0
            ? `swing recovery: spam lock +${(manualMinePenalty / 1000).toFixed(1)}s. slow down.`
            : `swing recovery: ${((manualMineNextAt - now) / 1000).toFixed(1)}s`;
          return true;
        }
        if (lastStrikeAt && gap < MANUAL_MINE_FAST_MS) {
          manualMinePenalty = Math.min(MANUAL_MINE_MAX_PENALTY_MS, Math.max(MANUAL_MINE_PENALTY_MS, manualMinePenalty ? Math.round(manualMinePenalty * 1.7) : MANUAL_MINE_PENALTY_MS));
        } else if (gap > MANUAL_MINE_COOLDOWN_MS + 700) {
          manualMinePenalty = Math.max(0, manualMinePenalty - MANUAL_MINE_PENALTY_MS);
        }
        lastStrikeAt = now;
        if (!mining.tipSeen) mining.tipSeen = true;
        const wait = MANUAL_MINE_COOLDOWN_MS + manualMinePenalty;
        manualMineNextAt = now + wait;
        dmg = PICKAXES[mining.pickaxe].damage;
        cost = 2 + node.layer * 0.85;
        oxygen = Math.max(0, oxygen - cost);
        const p = oreNodePos(node);
        swingFx = { x: p.x, y: p.y, layer: node.layer, t: 0 };
        sfxPick();
      }
      const hp = Math.max(0, nodeHp(node) - dmg);
      let gained = 0;
      if (hp <= 0) {
        delete mining.nodeHp[node.id];
        mining.nodeRespawn[node.id] = Date.now() + def.respawn;
        gained = 1;
        if (automatic) {
          const tierIndex = options.tier != null ? options.tier : (options.machine != null ? mining.machines[options.machine].tier : mining.auto.tier);
          const tier = AUTO_TIERS[tierIndex];
          if (Math.random() < tier.waste) {
            gained = 0;
            if (options.machine != null) mining.machines[options.machine].message = `wasted a ${def.name} chip`;
          }
        }
        if (gained > 0) {
          const store = automatic ? mining.chest : mining.ores;
          const wasEmpty = automatic && chestOreCount() === 0;
          store[oreId] = (store[oreId] || 0) + gained;
          if (wasEmpty) showToast('ore chest', 'machine haul is waiting in the surface chest. click it to open.', 2600);
        }
        const p = oreNodePos(node);
        autoFx.push({ x: p.x, y: p.y, layer: node.layer, t: 0, color: def.color, text: gained ? `${automatic ? 'to chest: ' : '+'}${gained} ${def.name}` : 'waste', shatter: true });
        if (!automatic) {
          sfxDiscovery();
          showToast(`+${gained} ${def.name}`, 'vein cracked. give it a moment to reform.', 2200);
        }
        checkContractPing();
      } else {
        mining.nodeHp[node.id] = hp;
        if (!automatic) feedbackStatus.textContent = `${def.name}: ${hp}/${def.hp} • -${Math.round(cost * 10) / 10} O2 per swing • next swing ${((manualMineNextAt - performance.now()) / 1000).toFixed(1)}s`;
      }
      syncMiningHud();
      renderShop();
      saveGameState();
      return true;
    }
    function autoMineTick(dt) {
      restoreOreNodes();
      for (let i = 0; i < MACHINE_PAD_COUNT; i++) {
        const m = mining.machines[i];
        const rig = machineRigs[i];
        if (!isPadUnlocked(i) || !m.tier || !rig) continue;
        const tier = AUTO_TIERS[m.tier];
        if (!rigActive(i)) { rig.moving = false; continue; }
        updateMachineRig(dt, i);
        m.progress += dt * 1000;
        if (m.progress < tier.interval) continue;
        m.progress -= tier.interval;
        if (rig.mode === 'travel' && rig.targetId) { rig.pending = true; continue; }
        if (rig.mode === 'windup' || rig.mode === 'slam' || rig.mode === 'recover') continue;
        let work = rigNodeById(rig.targetId);
        if (!work || !nodeReady(work)) work = rigNodeById(rig.queueId);
        if (!work || !nodeReady(work)) work = pickRigTarget(rig.x, rig.lastStrikeId, i);
        if (!work) {
          m.message = 'waiting for reachable veins';
          syncMiningHud();
          continue;
        }
        beginRigTravel(work, true, i);
      }
    }
    function canAffordOre(cost) {
      return Object.keys(cost).every(id => (mining.ores[id] || 0) >= cost[id]);
    }
    function oreCostLabel(cost) {
      return Object.keys(cost).map(id => `${cost[id]} ${ORE_DEFS[id].name}`).join(' + ');
    }
    function machineBlueprintReady(tier) {
      const plan = MACHINE_COSTS[tier];
      return !!plan && !!mining.contracts[plan.contract];
    }
    function claimContract(id) {
      const c = CONTRACTS.find(x => x.id === id);
      if (!c || mining.contracts[id]) return;
      if (!stockOpen(STOCK.contract[c.id])) { showToast('out of stock', `the dock only takes that one in the ${STOCK.contract[c.id]}.`, 2200); return; }
      if (!contractReady(c)) { showToast('not enough ore', 'the dock taps the checklist. keep mining.', 2200); return; }
      for (const oreId of Object.keys(c.need)) mining.ores[oreId] -= c.need[oreId];
      mining.contracts[id] = true;
      const reward = c.pickaxe > mining.pickaxe ? PICKAXES[c.pickaxe].name : 'paid in full';
      if (c.pickaxe > mining.pickaxe) mining.pickaxe = c.pickaxe;
      saveGameState();
      syncMiningHud();
      renderShop();
      sfxDiscovery();
      showToast('contract complete', `pick unlocked: ${reward}`, 3800);
    }
    function buildMachine(tier) {
      const plan = MACHINE_COSTS[tier];
      if (!plan) return;
      if (!stockOpen(STOCK.rig[tier])) { showToast('out of stock', `that rig is ${STOCK.rig[tier]}-shift stock only.`, 2200); return; }
      if (!machineBlueprintReady(tier)) { showToast('blueprint locked', 'claim the matching pick contract first.', 2200); return; }
      const i = activeMachineIndex();
      if (!isPadUnlocked(i)) { showToast('pad locked', 'buy that rock from the dock first.', 2200); return; }
      const m = mining.machines[i];
      if (m.tier >= tier) {
        showToast('already installed', m.tier === tier ? `pad ${i + 1} already has ${AUTO_TIERS[tier].name}.` : `pad ${i + 1} already has a better rig.`, 2200);
        return;
      }
      if (!canAffordOre(plan.cost)) { showToast('not enough ore', `this rig needs ${oreCostLabel(plan.cost)}.`, 2200); return; }
      for (const oreId of Object.keys(plan.cost)) mining.ores[oreId] -= plan.cost[oreId];
      m.tier = tier;
      m.battery = 100;
      m.broken = false;
      m.progress = 0;
      m.message = 'machine online';
      resetRigState(i);
      saveGameState();
      syncMiningHud();
      renderShop();
      renderTablet();
      sfxDiscovery();
      showToast('machine built', `${AUTO_TIERS[tier].name} parked on pad ${i + 1}.`, 3200);
    }
    let flowState = null;
    function flowSame(a, b) { return !!a && !!b && a.r === b.r && a.c === b.c; }
    function flowAdjacent(a, b) { return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1; }
    function flowTransform(cell, rot, flip) {
      let r = cell[0], c = cell[1];
      if (flip) c = 4 - c;
      for (let k = 0; k < rot; k++) { const nr = c, nc = 4 - r; r = nr; c = nc; }
      return { r, c };
    }
    function makeFlowPuzzle() {
      const base = FLOW_BASES[Math.floor(Math.random() * FLOW_BASES.length)];
      const rot = Math.floor(Math.random() * 4);
      const flip = Math.random() < 0.5;
      const colors = FLOW_COLORS.slice(0, base.length);
      for (let i = colors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = colors[i]; colors[i] = colors[j]; colors[j] = tmp;
      }
      return {
        size: 5,
        pairs: base.map((path, idx) => {
          const cells = path.map(p => flowTransform(p, rot, flip));
          return { color: colors[idx], a: cells[0], b: cells[cells.length - 1] };
        })
      };
    }
    function flowEndpoint(cell) {
      if (!flowState) return null;
      return flowState.pairs.find(p => flowSame(cell, p.a) || flowSame(cell, p.b)) || null;
    }
    function flowPathDone(pair) {
      const path = flowState && flowState.paths[pair.color];
      if (!path || path.length < 2) return false;
      const a = path[0], b = path[path.length - 1];
      return (flowSame(a, pair.a) && flowSame(b, pair.b)) || (flowSame(a, pair.b) && flowSame(b, pair.a));
    }
    function flowDoneCount() {
      return flowState ? flowState.pairs.filter(flowPathDone).length : 0;
    }
    function drawFlow() {
      if (!flowCanvas || !flowState) return;
      const ctx = flowCanvas.getContext('2d');
      const n = flowState.size;
      const step = FLOW_SIZE / n;
      ctx.clearRect(0, 0, FLOW_SIZE, FLOW_SIZE);
      ctx.fillStyle = 'rgba(3,14,30,0.92)';
      ctx.fillRect(0, 0, FLOW_SIZE, FLOW_SIZE);
      ctx.strokeStyle = 'rgba(126,200,255,0.12)';
      ctx.lineWidth = 1;
      for (let i = 1; i < n; i++) {
        ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, FLOW_SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(FLOW_SIZE, i * step); ctx.stroke();
      }
      const center = cell => ({ x: (cell.c + 0.5) * step, y: (cell.r + 0.5) * step });
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = step * 0.26;
      for (const pair of flowState.pairs) {
        const path = flowState.paths[pair.color] || [];
        if (path.length < 2) continue;
        ctx.strokeStyle = pair.color;
        ctx.shadowColor = pair.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        path.forEach((cell, i) => {
          const p = center(cell);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      for (const pair of flowState.pairs) {
        for (const cell of [pair.a, pair.b]) {
          const p = center(cell);
          ctx.fillStyle = '#0a1c31';
          ctx.beginPath(); ctx.arc(p.x, p.y, step * 0.29, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = pair.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, step * 0.2, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = flowPathDone(pair) ? '#ffffff' : 'rgba(255,255,255,0.45)';
          ctx.lineWidth = flowPathDone(pair) ? 2 : 1;
          ctx.stroke();
        }
      }
      const done = flowDoneCount();
      if (flowStatus) flowStatus.textContent = done === flowState.pairs.length
        ? 'all lines connected — releasing the jam'
        : `${done}/${flowState.pairs.length} lines connected · drag from a dot to its match`;
    }
    function openUnjam(i = activeMachineIndex()) {
      const m = mining.machines[i];
      if (!m || !m.tier) { showToast('no machine', 'this pad is empty. build one in the machines tab.', 2000); return; }
      if (!m.broken) { showToast('already running', 'nothing to fix right now.', 1800); return; }
      if (!mining.unjammer) { showToast('need unjammer', 'buy the unjammer tool on the tools tab.', 2400); return; }
      closeShop();
      closeTablet();
      const puzzle = makeFlowPuzzle();
      flowState = { machine: i, size: puzzle.size, pairs: puzzle.pairs, paths: {}, dragging: false, activeColor: null };
      if (flowCanvas) { flowCanvas.width = FLOW_SIZE; flowCanvas.height = FLOW_SIZE; }
      drawFlow();
      if (flowModal) {
        flowModal.classList.add('open');
        flowModal.setAttribute('aria-hidden', 'false');
      }
      sfxClick();
    }
    function closeUnjam() {
      flowState = null;
      if (!flowModal) return;
      flowModal.classList.remove('open');
      flowModal.setAttribute('aria-hidden', 'true');
    }
    function completeUnjam() {
      if (!flowState) return;
      const i = flowState.machine;
      const m = mining.machines[i];
      if (m && m.broken) {
        m.broken = false;
        m.message = 'unjammed by unjammer';
        resetRigState(i);
      }
      saveGameState();
      syncMiningHud();
      renderShop();
      renderTablet();
      sfxDiscovery();
      showToast('unjammed', `pad ${i + 1} is back online. the claw remembers.`, 3200);
      closeUnjam();
    }
    function flowCellFromEvent(e) {
      if (!flowCanvas || !flowState) return null;
      const rect = flowCanvas.getBoundingClientRect();
      const step = rect.width / flowState.size;
      const c = Math.floor((e.clientX - rect.left) / step);
      const r = Math.floor((e.clientY - rect.top) / step);
      if (r < 0 || c < 0 || r >= flowState.size || c >= flowState.size) return null;
      return { r, c };
    }
    function flowPointerDown(e) {
      if (!flowState) return;
      const cell = flowCellFromEvent(e);
      const pair = cell && flowEndpoint(cell);
      if (!pair) return;
      e.preventDefault();
      if (flowCanvas && flowCanvas.setPointerCapture) {
        try { flowCanvas.setPointerCapture(e.pointerId); } catch (_) {}
      }
      flowState.dragging = true;
      flowState.activeColor = pair.color;
      flowState.paths[pair.color] = [cell];
      drawFlow();
    }
    function flowExtendPath(cell) {
      const color = flowState.activeColor;
      const path = flowState.paths[color] || [];
      const last = path[path.length - 1];
      if (!last || flowSame(last, cell) || !flowAdjacent(last, cell)) return false;
      const other = flowEndpoint(cell);
      if (other && other.color !== color) return false;
      const used = Object.keys(flowState.paths).some(c => c !== color && flowState.paths[c].some(p => flowSame(p, cell)));
      if (used) return false;
      const at = path.findIndex(p => flowSame(p, cell));
      flowState.paths[color] = at >= 0 ? path.slice(0, at + 1) : path.concat(cell);
      drawFlow();
      return true;
    }
    function flowPointerMove(e) {
      if (!flowState || !flowState.dragging) return;
      const target = flowCellFromEvent(e);
      if (!target) return;
      // fast drags can skip cells, so walk orthogonal steps toward the pointer
      for (let guard = 0; guard < flowState.size * 3; guard++) {
        const path = flowState.paths[flowState.activeColor] || [];
        const last = path[path.length - 1];
        if (!last || flowSame(last, target)) break;
        if (flowAdjacent(last, target)) { flowExtendPath(target); break; }
        const dr = target.r - last.r, dc = target.c - last.c;
        const next = Math.abs(dr) >= Math.abs(dc)
          ? { r: last.r + Math.sign(dr), c: last.c }
          : { r: last.r, c: last.c + Math.sign(dc) };
        const before = flowState.paths[flowState.activeColor]?.length || 0;
        flowExtendPath(next);
        if ((flowState.paths[flowState.activeColor]?.length || 0) === before) break;
      }
    }
    function flowPointerUp(e) {
      if (!flowState || !flowState.dragging) return;
      e.preventDefault();
      if (flowCanvas && flowCanvas.releasePointerCapture) {
        try { flowCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      flowState.dragging = false;
      flowState.activeColor = null;
      if (flowDoneCount() === flowState.pairs.length) completeUnjam();
      else drawFlow();
    }
    function repairAuto() { openUnjam(); }
    function rechargeAuto() {
      const i = activeMachineIndex();
      const m = mining.machines[i];
      if (!m.tier) { showToast('no machine', 'this pad is empty. build one in the machines tab.', 2000); return; }
      if (!isShore()) { showToast('shore only', 'bring the machine back to the supply dock.', 2200); return; }
      m.battery = 100;
      m.progress = 0;
      m.message = m.broken ? 'jammed — use unjammer' : 'battery full';
      saveGameState();
      syncMiningHud();
      renderShop();
      sfxClick();
    }
    function resetRigState(i) {
      const rig = machineRigs[i];
      if (!rig) return;
      const home = rigHomePos(i);
      Object.assign(rig, makeRigState(), { x: home.x, y: home.y });
    }
    function selectMachine(i) {
      if (!Number.isInteger(i) || i < 0 || i >= MACHINE_PAD_COUNT) return;
      if (!isPadUnlocked(i)) { showToast('pad locked', 'the dock sells that rock at the supply stall.', 2200); return; }
      mining.activeMachine = i;
      saveGameState();
      syncMiningHud();
      renderShop();
      renderTablet();
      sfxClick();
    }
    function disassembleMachine(i) {
      if (!Number.isInteger(i) || i < 0 || i >= MACHINE_PAD_COUNT) return;
      const m = mining.machines[i];
      if (!m.tier) { showToast('empty pad', 'nothing to take apart here.', 1800); return; }
      mining.machines[i] = defaultMachineState();
      resetRigState(i);
      if (mining.activeMachine === i) {
        const other = mining.machines.findIndex((mm, idx) => idx !== i && isPadUnlocked(idx) && mm.tier);
        mining.activeMachine = other >= 0 ? other : i;
      }
      saveGameState();
      syncMiningHud();
      renderShop();
      renderTablet();
      sfxClick();
      showToast('machine disassembled', `pad ${i + 1} is empty. the contract is still claimed.`, 2600);
    }
    function canBuyPad(i) {
      if (!Number.isInteger(i) || i < STARTING_PADS || i >= MACHINE_PAD_COUNT) return false;
      if (isPadUnlocked(i) || unlockedPadCount() !== i || !stockOpen(STOCK.pad[i])) return false;
      return canAffordOre(PAD_COSTS[i]);
    }
    function buyPad(i) {
      if (!Number.isInteger(i) || i < STARTING_PADS || i >= MACHINE_PAD_COUNT) return;
      if (isPadUnlocked(i)) { showToast('pad owned', 'that rock is already yours.', 1800); return; }
      if (unlockedPadCount() !== i) { showToast('pad locked', `buy pad ${i} first.`, 2000); return; }
      if (!stockOpen(STOCK.pad[i])) { showToast('out of stock', `pad ${i + 1} is ${STOCK.pad[i]}-shift stock only.`, 2200); return; }
      if (!canAffordOre(PAD_COSTS[i])) { showToast('not enough ore', `a pad costs ${oreCostLabel(PAD_COSTS[i])}.`, 2200); return; }
      for (const oreId of Object.keys(PAD_COSTS[i])) mining.ores[oreId] -= PAD_COSTS[i][oreId];
      mining.unlockedPads = i + 1;
      mining.machines[i] = defaultMachineState();
      resetRigState(i);
      saveGameState();
      syncMiningHud();
      renderShop();
      renderTablet();
      sfxDiscovery();
      showToast('machine pad bought', `pad ${i + 1} unlocked. build a rig for it in the machines tab.`, 3600);
    }
    function canBuyTablet() {
      return Object.keys(TABLET_COST).every(id => (mining.ores[id] || 0) >= TABLET_COST[id]);
    }
    function buyTablet() {
      if (mining.tablet) return;
      if (!stockOpen(STOCK.tablet)) { showToast('out of stock', 'the dock only sells tablets at night.', 2200); return; }
      if (!canBuyTablet()) { showToast('not enough ore', 'the tablet costs 2 iron + 1 gold.', 2200); return; }
      for (const id of Object.keys(TABLET_COST)) mining.ores[id] -= TABLET_COST[id];
      mining.tablet = true;
      saveGameState();
      renderShop();
      syncMiningHud();
      renderTablet();
      sfxDiscovery();
      showToast('tablet acquired', 'machine stats are now in your shore ledger.', 3200);
    }
    function canBuyBatteryPack() {
      return Object.keys(BATTERY_PACK_COST).every(id => (mining.ores[id] || 0) >= BATTERY_PACK_COST[id]);
    }
    function buyBatteryPack() {
      if (!stockOpen(STOCK.pack)) { showToast('out of stock', 'the dock is fresh out. try again later.', 2200); return; }
      if (!canBuyBatteryPack()) { showToast('not enough ore', `a pack costs ${oreCostLabel(BATTERY_PACK_COST)}.`, 2200); return; }
      for (const id of Object.keys(BATTERY_PACK_COST)) mining.ores[id] -= BATTERY_PACK_COST[id];
      mining.batteries += BATTERIES_PER_PACK;
      saveGameState();
      renderShop();
      syncMiningHud();
      renderTablet();
      sfxDiscovery();
      showToast('battery pack', `+${BATTERIES_PER_PACK} cells. swap them from the tablet anywhere.`, 3200);
    }
    function canBuyUnjammer() {
      return Object.keys(UNJAMMER_COST).every(id => (mining.ores[id] || 0) >= UNJAMMER_COST[id]);
    }
    function buyUnjammer() {
      if (mining.unjammer) return;
      if (!stockOpen(STOCK.unjammer)) { showToast('out of stock', 'the dock is fresh out. try again later.', 2200); return; }
      if (!canBuyUnjammer()) { showToast('not enough ore', `the unjammer costs ${oreCostLabel(UNJAMMER_COST)}.`, 2200); return; }
      for (const id of Object.keys(UNJAMMER_COST)) mining.ores[id] -= UNJAMMER_COST[id];
      mining.unjammer = true;
      saveGameState();
      renderShop();
      syncMiningHud();
      renderTablet();
      sfxDiscovery();
      showToast('unjammer acquired', 'jammed rigs can now be fixed with the unjammer.', 3400);
    }
    function useBattery() {
      const i = activeMachineIndex();
      const m = mining.machines[i];
      if (!m.tier) { showToast('no machine', 'this pad is empty. build one in the machines tab.', 2000); return; }
      if (mining.batteries <= 0) { showToast('no spare cells', 'buy a battery pack from the supply dock.', 2200); return; }
      if (m.battery >= 100) { showToast('already full', 'save the cell for when the claw runs dry.', 2000); return; }
      mining.batteries -= 1;
      m.battery = Math.min(100, m.battery + BATTERY_CHARGE);
      m.message = 'cell swapped';
      saveGameState();
      syncMiningHud();
      renderShop();
      renderTablet();
      sfxClick();
      showToast('cell swapped', `pad ${i + 1} at ${Math.round(m.battery)}% · ${mining.batteries} spare.`, 2400);
    }
    function machineStateLabel(m = mining.auto) {
      if (!m.tier) return 'not built';
      if (m.broken) return 'jammed';
      if (m.battery <= 0) return 'dead battery';
      return 'online';
    }
    function renderTablet() {
      if (!tabletStats) return;
      const active = activeMachineIndex();
      const tier = AUTO_TIERS[mining.auto.tier];
      const pct = Math.max(0, Math.min(100, mining.auto.battery));
      const next = tier.interval ? Math.max(0, (tier.interval - mining.auto.progress) / 1000).toFixed(1) : '—';
      const ores = Object.keys(ORE_DEFS).map(id => `${mining.ores[id] || 0} ${ORE_DEFS[id].name}`).join(' • ') || 'none';
      const contractLine = CONTRACTS.map(c => {
        if (mining.contracts[c.id]) return `${c.title} — claimed`;
        const need = Object.keys(c.need).map(id => `${Math.min(mining.ores[id] || 0, c.need[id])}/${c.need[id]} ${ORE_DEFS[id].name}`);
        return `${contractReady(c) ? 'ready' : 'open'} ${c.title} — ${need.join(' + ')}`;
      }).join(' • ');
      const rig = machineRigs[active];
      const tracked = rig ? rigNodeById(rig.targetId || rig.queueId) : null;
      const trackedName = tracked ? (nodeOreId(tracked) ? ORE_DEFS[nodeOreId(tracked)].name : 'ore') : '';
      const clawState = !mining.auto.tier ? 'none'
        : !rigActive(active) ? (mining.auto.broken ? 'jammed · frozen' : mining.auto.battery <= 0 ? 'battery empty · frozen' : 'paused')
        : rig.mode === 'travel' ? `traveling${tracked ? ` → ${trackedName}` : ''}`
        : rig.mode === 'windup' ? `winding up${tracked ? ` ${trackedName}` : ''}`
        : rig.mode === 'slam' || rig.mode === 'recover' ? `headbutting${tracked ? ` ${trackedName}` : ''}`
        : tracked ? `holding ${trackedName}` : 'parked';
      const pads = mining.machines.map((m, idx) => {
        const unlocked = isPadUnlocked(idx);
        return `<button class="btn" type="button" data-machine="${idx}" ${!unlocked || idx === active ? 'disabled' : ''}>pad ${idx + 1}: ${!unlocked ? 'locked · buy at shore' : m.tier ? AUTO_TIERS[m.tier].name : 'empty'}</button>`;
      }).join(' ');
      tabletStats.innerHTML = `
        <div class="tablet-head"><strong>${tier.name} · pad ${active + 1}</strong><span class="badge ${mining.auto.broken ? 'bug' : 'suggestion'}">${machineStateLabel(mining.auto)}</span></div>
        <div class="tablet-cell"><b>pads</b><div class="shop-foot">${pads}</div></div>
        <div class="tablet-cell"><b>battery</b><div class="battery-row"><span>cell</span><div class="battery-bar"><div class="battery-fill" style="width:${pct}%" ${pct < 25 ? 'data-low="1"' : ''}></div></div><span>${Math.round(pct)}%</span></div><div class="shop-foot"><span>${mining.batteries} spare cells · each = +50%</span><button class="btn" type="button" data-battery="use" ${!mining.auto.tier || mining.batteries <= 0 || mining.auto.battery >= 100 ? 'disabled' : ''}>swap cell</button></div></div>
        <div class="tablet-cell"><b>unjam</b><div class="shop-foot"><span>${mining.unjammer ? 'unjammer ready' : 'tool sold at shore'}</span><button class="btn" type="button" data-unjam="start" ${!mining.unjammer || !mining.auto.broken ? 'disabled' : ''}>run unjam</button></div></div>
        <div class="tablet-grid">
          <div class="tablet-cell"><b>next strike</b><span>${next}${tier.interval ? 's' : ''}</span></div>
          <div class="tablet-cell"><b>reach</b><span>${mining.auto.tier ? `layer ${tier.maxLayer}` : 'none'}</span></div>
          <div class="tablet-cell"><b>burn</b><span>${mining.auto.tier ? `${tier.drain}% / ${(tier.interval / 1000).toFixed(1)}s` : '—'}</span></div>
          <div class="tablet-cell"><b>waste</b><span>${mining.auto.tier ? `${Math.round(tier.waste * 100)}%` : '—'}</span></div>
          <div class="tablet-cell"><b>jam chance</b><span>${mining.auto.tier ? `${Math.round(tier.breakdown * 100)}%` : '—'}</span></div>
          <div class="tablet-cell"><b>claw</b><span>${clawState}</span></div>
          <div class="tablet-cell"><b>manual pick</b><span>${PICKAXES[mining.pickaxe].name} · ${PICKAXES[mining.pickaxe].damage} dmg</span></div>
          <div class="tablet-cell"><b>current layer</b><span>${isShore() ? 'shore' : `layer ${activeOreLayer()}`}</span></div>
          <div class="tablet-cell"><b>message</b><span>${mining.auto.message}</span></div>
        </div>
        <div class="tablet-cell"><b>ore ledger</b><span>${ores}</span></div>
        <div class="tablet-cell contracts"><b>contracts</b><span>${contractLine}</span></div>
        <div class="modal-note">live readout from the tablet · ${unlockedPadCount()}/${MACHINE_PAD_COUNT} pads. ${mining.auto.broken ? (mining.unjammer ? 'jammed? run the unjammer right here.' : 'jammed? buy the unjammer tool at shore.') : mining.auto.tier ? 'dead battery? swap a cell here, or hit recharge at the dock for a full charge.' : 'build a claw rig in the shore machines tab to park it on the surface rock.'} locked rocks are sold at the shore.</div>`;
    }
    function openTablet() {
      if (!mining.tablet) { showToast('no tablet', 'the supply dock sells one for 2 iron + 1 gold.', 2400); return; }
      renderTablet();
      if (tabletModal) {
        tabletModal.classList.add('open');
        tabletModal.setAttribute('aria-hidden', 'false');
      }
      sfxClick();
    }
    function closeTablet() {
      if (!tabletModal) return;
      tabletModal.classList.remove('open');
      tabletModal.setAttribute('aria-hidden', 'true');
    }
    function syncMiningHud() {
      if (!miningHud) return;
      miningHud.classList.toggle('hidden', isFacilityLayer());
      if (miningTip) miningTip.classList.toggle('hidden', mining.tipSeen || perspective !== 0 || isFacilityLayer() || isShore());
      if (oreCounts) {
        oreCounts.innerHTML = Object.keys(ORE_DEFS).map(id => {
          const def = ORE_DEFS[id];
          return `<span class="ore-chip" style="--ore:${def.color}"><b>${def.name}</b>${mining.ores[id] || 0}</span>`;
        }).join('');
      }
      if (chestStatus) {
        const held = chestOreCount();
        chestStatus.classList.toggle('ready', held > 0);
        chestStatus.textContent = held > 0
          ? `chest: ${held} ore waiting · click the surface chest to open`
          : 'chest: empty · click the surface chest to open';
      }
      if (pickaxeLabel) pickaxeLabel.textContent = PICKAXES[mining.pickaxe].name;
      if (autoStatus) {
        const active = activeMachineIndex();
        const tier = AUTO_TIERS[mining.auto.tier];
        const state = !mining.auto.tier ? 'not built' : mining.auto.broken ? 'jammed' : mining.auto.battery <= 0 ? 'dead battery' : tier.name;
        autoStatus.textContent = `auto: ${state} · pad ${active + 1} · ${unlockedPadCount()}/${MACHINE_PAD_COUNT} pads · ${mining.batteries} cells`;
      }
      const recoveryMs = Math.max(0, manualMineNextAt - performance.now());
      if (miningRecovery) {
        miningRecovery.classList.toggle('hidden', recoveryMs <= 0);
        if (miningRecoveryLabel) miningRecoveryLabel.textContent = manualMinePenalty > 0 ? 'spam lock recovery' : 'swing recovery';
        if (miningRecoveryText) miningRecoveryText.textContent = `${(recoveryMs / 1000).toFixed(1)}s`;
        if (miningRecoveryFill) miningRecoveryFill.style.width = `${Math.min(100, (recoveryMs / (MANUAL_MINE_COOLDOWN_MS + MANUAL_MINE_MAX_PENALTY_MS)) * 100)}%`;
      }
      if (recoveryMs <= 0 && manualMinePenalty > 0 && performance.now() - lastStrikeAt > MANUAL_MINE_COOLDOWN_MS + 900) {
        manualMinePenalty = Math.max(0, manualMinePenalty - MANUAL_MINE_PENALTY_MS);
      }
      if (tabletBtn) tabletBtn.classList.toggle('hidden', !mining.tablet);
      if (tabletModal && tabletModal.classList.contains('open')) renderTablet();
    }
    function renderShop() {
      if (!shopModal) return;
      if (shopLine) shopLine.textContent = `shelf rotates with the sun · ${isDaytime() ? 'day' : 'night'} shift · ${unlockedPadCount()}/${MACHINE_PAD_COUNT} pads. ${mining.auto.tier ? 'keep the claw fed. rigs are built on the machines tab.' : 'contracts pay in picks. rigs are built on the machines tab.'}`;
      if (shopContracts) {
        shopContracts.innerHTML = CONTRACTS.map(c => {
          const done = !!mining.contracts[c.id];
          const ready = contractReady(c);
          const stocked = stockOpen(STOCK.contract[c.id]);
          const need = Object.keys(c.need).map(id => {
            const have = mining.ores[id] || 0;
            const want = c.need[id];
            return `<span class="ore-need ${have >= want ? 'ok' : ''}">${ORE_DEFS[id].name} ${Math.min(have, want)}/${want}</span>`;
          }).join('');
          const reward = c.pickaxe ? PICKAXES[c.pickaxe].name : 'paid in full';
          return `<div class="shop-item ${done ? 'done' : ''} ${!stocked ? 'stock-out' : ''}">
            <div class="shop-item-top"><strong>${c.title}</strong><span class="badge ${done ? '' : !stocked ? 'other' : ready ? 'suggestion' : 'other'}">${done ? 'paid' : !stocked ? 'out of stock' : ready ? 'ready' : 'open'}</span></div>
            <div class="shop-needs">${need}</div>
            <div class="shop-note">${c.line}</div>
            <div class="shop-foot"><span>reward: ${reward} · ${stockBadge(STOCK.contract[c.id])}</span><button class="btn" type="button" data-contract="${c.id}" ${done || !ready || !stocked ? 'disabled' : ''}>${done ? 'claimed' : 'turn in'}</button></div>
          </div>`;
        }).join('');
      }
      if (shopTools) {
        const tabletNeed = Object.keys(TABLET_COST).map(id => {
          const have = mining.ores[id] || 0;
          const want = TABLET_COST[id];
          return `<span class="ore-need ${have >= want ? 'ok' : ''}">${ORE_DEFS[id].name} ${Math.min(have, want)}/${want}</span>`;
        }).join('');
        const nextPick = Math.min(PICKAXES.length - 1, mining.pickaxe + 1);
        const nextPickSrc = CONTRACTS.find(c => c.pickaxe === nextPick);
        const packNeed = Object.keys(BATTERY_PACK_COST).map(id => {
          const have = mining.ores[id] || 0;
          const want = BATTERY_PACK_COST[id];
          return `<span class="ore-need ${have >= want ? 'ok' : ''}">${ORE_DEFS[id].name} ${Math.min(have, want)}/${want}</span>`;
        }).join('');
        const unjammerNeed = Object.keys(UNJAMMER_COST).map(id => {
          const have = mining.ores[id] || 0;
          const want = UNJAMMER_COST[id];
          return `<span class="ore-need ${have >= want ? 'ok' : ''}">${ORE_DEFS[id].name} ${Math.min(have, want)}/${want}</span>`;
        }).join('');
        const tabletStocked = stockOpen(STOCK.tablet);
        const unjammerStocked = stockOpen(STOCK.unjammer);
        const packStocked = stockOpen(STOCK.pack);
        shopTools.innerHTML = `<div class="shop-item"><div class="shop-item-top"><strong>${PICKAXES[mining.pickaxe].name}</strong><span class="badge">equipped</span></div><div class="shop-note">${PICKAXES[mining.pickaxe].note} • ${PICKAXES[mining.pickaxe].damage} damage per swing</div><div class="shop-foot"><span>${mining.pickaxe >= PICKAXES.length - 1 ? 'top pick. nothing left to unlock.' : `next: ${PICKAXES[nextPick].name} · ${stockBadge(STOCK.contract[nextPickSrc.id])}`}</span></div></div>
        <div class="shop-item ${mining.tablet ? 'done' : ''} ${!tabletStocked ? 'stock-out' : ''}"><div class="shop-item-top"><strong>machine tablet</strong><span class="badge ${mining.tablet ? '' : !tabletStocked ? 'other' : canBuyTablet() ? 'suggestion' : 'other'}">${mining.tablet ? 'owned' : !tabletStocked ? 'out of stock' : canBuyTablet() ? 'ready' : 'locked'}</span></div><div class="shop-needs">${tabletNeed}</div><div class="shop-note">a pocket readout for the machine parked on the surface rock. works anywhere, so you don't have to waddle back here.</div><div class="shop-foot"><span>${mining.tablet ? 'tap machine tablet in your shore ledger' : `2 iron + 1 gold · ${stockBadge(STOCK.tablet)}`}</span><button class="btn" type="button" data-shop="tablet" ${mining.tablet || !canBuyTablet() || !tabletStocked ? 'disabled' : ''}>${mining.tablet ? 'owned' : 'buy tablet'}</button></div></div>
        <div class="shop-item ${mining.unjammer ? 'done' : ''} ${!unjammerStocked ? 'stock-out' : ''}"><div class="shop-item-top"><strong>unjammer</strong><span class="badge ${mining.unjammer ? '' : !unjammerStocked ? 'other' : canBuyUnjammer() ? 'suggestion' : 'other'}">${mining.unjammer ? 'owned' : !unjammerStocked ? 'out of stock' : canBuyUnjammer() ? 'ready' : 'need ore'}</span></div><div class="shop-needs">${unjammerNeed}</div><div class="shop-note">a pocket color puzzle. when a claw jams, connect every color pair without crossing a line to free it. works anywhere from the tablet.</div><div class="shop-foot"><span>${mining.unjammer ? 'tap unjam in the machine tablet' : `${oreCostLabel(UNJAMMER_COST)} · ${stockBadge(STOCK.unjammer)}`}</span><button class="btn" type="button" data-shop="unjammer" ${mining.unjammer || !canBuyUnjammer() || !unjammerStocked ? 'disabled' : ''}>${mining.unjammer ? 'owned' : 'buy unjammer'}</button></div></div>
        <div class="shop-item ${!packStocked ? 'stock-out' : ''}"><div class="shop-item-top"><strong>battery pack</strong><span class="badge ${!packStocked ? 'other' : canBuyBatteryPack() ? 'suggestion' : 'other'}">${!packStocked ? 'out of stock' : canBuyBatteryPack() ? 'ready' : 'need ore'}</span></div><div class="shop-needs">${packNeed}</div><div class="shop-note">4 spare cells. each one refills half a machine battery, and you can swap them from the tablet without coming back to shore.</div><div class="shop-foot"><span>${oreCostLabel(BATTERY_PACK_COST)} · ${mining.batteries} spare cells · ${stockBadge(STOCK.pack)}</span><button class="btn" type="button" data-shop="battery-pack" ${!canBuyBatteryPack() || !packStocked ? 'disabled' : ''}>buy pack</button></div></div>
        <div class="shop-item"><div class="shop-item-top"><strong>mining rules</strong></div><div class="shop-note">iron in the upper layer, abyssite in hadal, and rare gold/diamond/voidglass scattered in empty veins. only the default perspective has ore. no veins in the facility or boss fight, and nothing in abyss or void. stock rotates between day and night shifts.</div></div>`;
      }
      if (shopAuto) {
        const active = activeMachineIndex();
        const activePad = mining.machines[active];
        const tier = AUTO_TIERS[activePad.tier];
        const pct = Math.max(0, Math.min(100, activePad.battery));
        const padButtons = mining.machines.map((m, idx) => {
          const unlocked = isPadUnlocked(idx);
          return `<button class="btn" type="button" data-machine="${idx}" ${!unlocked || idx === active ? 'disabled' : ''}>pad ${idx + 1}: ${!unlocked ? 'locked' : m.tier ? AUTO_TIERS[m.tier].name : 'empty'}</button>`;
        }).join(' ');
        const padCards = [STARTING_PADS, MACHINE_PAD_COUNT - 1].map(padIdx => {
          const owned = isPadUnlocked(padIdx);
          const nextUp = unlockedPadCount() === padIdx;
          const stocked = stockOpen(STOCK.pad[padIdx]);
          const affordable = canAffordOre(PAD_COSTS[padIdx]);
          const need = Object.keys(PAD_COSTS[padIdx]).map(id => {
            const have = mining.ores[id] || 0;
            const want = PAD_COSTS[padIdx][id];
            return `<span class="ore-need ${have >= want ? 'ok' : ''}">${ORE_DEFS[id].name} ${Math.min(have, want)}/${want}</span>`;
          }).join('');
          const state = owned ? 'owned' : !nextUp ? `buy pad ${padIdx} first` : !stocked ? 'out of stock' : affordable ? 'ready' : 'need ore';
          return `<div class="shop-item ${owned ? 'done' : ''} ${!stocked && !owned ? 'stock-out' : ''}"><div class="shop-item-top"><strong>machine pad ${padIdx + 1}</strong><span class="badge ${owned ? '' : nextUp && stocked && affordable ? 'suggestion' : 'other'}">${state}</span></div><div class="shop-needs">${need}</div><div class="shop-note">another surface rock with its own crane. buy the pad, then build a rig for it separately.</div><div class="shop-foot"><span>${oreCostLabel(PAD_COSTS[padIdx])} · ${stockBadge(STOCK.pad[padIdx])}</span><button class="btn" type="button" data-pad-buy="${padIdx}" ${owned || !nextUp || !stocked || !affordable ? 'disabled' : ''}>${owned ? 'owned' : 'buy pad'}</button></div></div>`;
        }).join('');
        const buildCards = [1, 2, 3].map(rigTier => {
          const plan = MACHINE_COSTS[rigTier];
          const blueprintReady = machineBlueprintReady(rigTier);
          const affordable = canAffordOre(plan.cost);
          const installed = activePad.tier >= rigTier;
          const need = Object.keys(plan.cost).map(id => {
            const have = mining.ores[id] || 0;
            const want = plan.cost[id];
            return `<span class="ore-need ${have >= want ? 'ok' : ''}">${ORE_DEFS[id].name} ${Math.min(have, want)}/${want}</span>`;
          }).join('');
          const source = CONTRACTS.find(c => c.id === plan.contract);
          const stocked = stockOpen(STOCK.rig[rigTier]);
          const state = !stocked ? 'out of stock' : installed ? (activePad.tier === rigTier ? 'installed' : 'outclassed') : !blueprintReady ? 'blueprint locked' : affordable ? 'ready' : 'need ore';
          return `<div class="shop-item ${installed ? 'done' : ''} ${!stocked ? 'stock-out' : ''}"><div class="shop-item-top"><strong>${AUTO_TIERS[rigTier].name}</strong><span class="badge ${installed ? '' : stocked && blueprintReady && affordable ? 'suggestion' : 'other'}">${state}</span></div><div class="shop-needs">${need}</div><div class="shop-note">unlock with the ${source.title} pick contract, then build it here on pad ${active + 1}.</div><div class="shop-foot"><span>${oreCostLabel(plan.cost)} · ${stockBadge(STOCK.rig[rigTier])}</span><button class="btn" type="button" data-machine-build="${rigTier}" ${!stocked || installed || !blueprintReady || !affordable ? 'disabled' : ''}>${activePad.tier > rigTier ? 'built already' : activePad.tier === rigTier ? 'installed' : 'build rig'}</button></div></div>`;
        }).join('');
        shopAuto.innerHTML = `${padCards}${buildCards}<div class="shop-item"><div class="shop-item-top"><strong>${tier.name} · pad ${active + 1}</strong><span class="badge ${activePad.broken ? 'bug' : 'suggestion'}">${activePad.broken ? 'jammed' : tier.name === 'not built' ? 'locked' : 'online'}</span></div>
          <div class="shop-note">${tier.note} jams are cleared with the unjammer.</div>
          <div class="shop-foot">${padButtons}</div>
          ${activePad.tier ? `<div class="battery-row"><span>battery</span><div class="battery-bar"><div class="battery-fill" style="width:${pct}%" ${pct < 25 ? 'data-low="1"' : ''}></div></div><span>${Math.round(pct)}%</span></div>` : ''}
          ${activePad.tier ? `<div class="shop-meta">burn: ${tier.drain}% / ${(tier.interval / 1000).toFixed(1)}s • waste: ${Math.round(tier.waste * 100)}% • jams: ${Math.round(tier.breakdown * 100)}% • reaches: layer ${tier.maxLayer}</div>` : ''}
          <div class="shop-meta">pads: ${unlockedPadCount()}/${MACHINE_PAD_COUNT} · status: ${activePad.message}</div>
          <div class="shop-foot"><button class="btn" type="button" data-auto="recharge" ${!activePad.tier || activePad.broken ? 'disabled' : ''}>recharge at dock</button><button class="btn" type="button" data-battery="use" ${!activePad.tier || mining.batteries <= 0 || activePad.battery >= 100 ? 'disabled' : ''}>swap cell · ${mining.batteries} left</button><button class="btn" type="button" data-auto="repair" ${!activePad.tier || !activePad.broken ? 'disabled' : ''}>${mining.unjammer ? 'unjam' : 'need unjammer'}</button><button class="btn" type="button" data-machine-disassemble="${active}" ${!activePad.tier ? 'disabled' : ''}>disassemble pad ${active + 1}</button></div>
          </div>`;
      }
    }
    function openShop() {
      if (!isShore()) { showToast('shore only', 'go all the way forwards to reach the supply dock.', 2400); return; }
      if (boss.active) return;
      renderShop();
      if (shopModal) {
        shopModal.classList.add('open');
        shopModal.setAttribute('aria-hidden', 'false');
      }
      sfxClick();
    }
    function closeShop() {
      if (!shopModal) return;
      shopModal.classList.remove('open');
      shopModal.setAttribute('aria-hidden', 'true');
    }

    function updateAudioMix() {
      if (corrupted) { try { pauseBgmAll(false); } catch(_) {} return; }
      const bgmMuted = !soundEnabled;
      bgm.muted = bgmMuted;
      bgm2.muted = bgmMuted;
      const bottomDepth = currentBottomDepth();
      const depthRaw = Number.isFinite(cameraY) ? Math.max(0, Math.min(bottomDepth, cameraY)) : 0;
      const under = Math.min(1, depthRaw);
      const abyss = Math.max(0, depthRaw - 1);
      const volBase = Number.isFinite(masterVolume) ? Math.max(0, Math.min(1, masterVolume)) : 0.65;
      const bottomFade = Math.max(0, Math.min(1, (bottomDepth - 0.35 - depthRaw) / 0.65));
      const duck = bgmFilters.length ? bottomFade : lerp(1, 0.22, Math.pow(depthRaw / Math.max(1, bottomDepth), 1.1)) * bottomFade;
      const vol = volBase * (Number.isFinite(duck) ? duck : 1);
      const mixVol = Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : volBase;
      const [fadeA, fadeB] = bgmFades();
      bgm.volume = Math.max(0, Math.min(1, mixVol * fadeA));
      bgm2.volume = Math.max(0, Math.min(1, mixVol * fadeB));
      if (!audioCtx) return;
      const on = soundEnabled ? 1 : 0;
      masterGain.gain.setTargetAtTime(on * masterVolume, audioCtx.currentTime, 0.08);
      const surface = Math.max(0, 1 - depthRaw);
      const d = dayFactor;
      rainGain.gain.setTargetAtTime(surface * Math.min(1, weatherIntensity) * 0.2, audioCtx.currentTime, 0.25);
      windGain.gain.setTargetAtTime(surface * Math.max(0, weatherIntensity - 0.8) * 0.16, audioCtx.currentTime, 0.3);
      underwaterGain.gain.setTargetAtTime(((under * 0.08) + (abyss * 0.04)) * (0.45 + 0.55 * bottomFade), audioCtx.currentTime, 0.2);
      dayGain.gain.setTargetAtTime(surface * d * (0.012 + (1-Math.min(1,weatherIntensity))*0.01), audioCtx.currentTime, 0.4);
      nightGain.gain.setTargetAtTime(surface * (1-d) * 0.01, audioCtx.currentTime, 0.4);
      if (rainNoise) rainNoise.f.frequency.setTargetAtTime(900 + weatherIntensity * 700, audioCtx.currentTime, 0.2);
      if (windNoise) windNoise.f.frequency.setTargetAtTime(400 + weatherIntensity * 250, audioCtx.currentTime, 0.2);
      if (bgmFilters.length) {
        const cutoff = lerp(14000, 320, Math.pow(depthRaw / Math.max(1, bottomDepth), 1.25));
        const fFreq = Math.max(120, cutoff * (0.55 + 0.45 * bottomFade));
        const fQ = 0.7 + Math.min(1, depthRaw) * 0.8;
        bgmFilters.forEach(f => {
          f.frequency.setTargetAtTime(fFreq, audioCtx.currentTime, 0.18);
          f.Q.setTargetAtTime(fQ, audioCtx.currentTime, 0.18);
        });
      }
    }

    function easeInOutCubic(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
    const ALL_FISH_IDS = ['clownfish','pufferfish','shark','betta','koi','shearfin','ribbonpike','stoneback','scarletveil','basinlantern','emberwhip','palesentinel','thewatcher'];
    function fishDiscoveryCount() {
      return discoveries.filter(id => ALL_FISH_IDS.includes(id)).length;
    }
    function questProgress() {
      return {
        bottles: Math.max(0, bottlesFound - (quest.bottlesAtAccept || 0)),
        fish: Math.max(0, fishDiscoveryCount() - (quest.fishAtAccept || 0)),
        trips: Math.max(0, bottomTrips - (quest.tripsAtAccept || 0))
      };
    }
    function questComplete() {
      const p = questProgress();
      return p.bottles >= 3 && p.fish >= 3 && p.trips >= 3;
    }
    function showVoidDialogue(text, ms = 6000) {
      voidDialogue = { text, until: performance.now() + ms };
    }
    function updateHurtState() {
      const remaining = clickLockUntil - Date.now();
      const active = remaining > 0;
      if (hurtVignette) hurtVignette.classList.toggle('active', active);
      if (hurtTimer) hurtTimer.classList.toggle('active', active);
      if (hurtTimerText) {
        const secs = Math.max(0, Math.ceil(remaining / 1000));
        const m = Math.floor(secs / 60);
        const s = String(secs % 60).padStart(2, '0');
        hurtTimerText.textContent = `${m}:${s}`;
      }
      document.body.classList.toggle('hurt', active);
      return active;
    }

    function triggerHurt(durationMs = 60000) {
      clickLockUntil = Math.max(clickLockUntil, Date.now() + durationMs);
      saveGameState();
      updateHurtState();
      // quick hurt jolt
      document.body.animate([
        { transform: 'translate(0,0)', filter: 'brightness(1)' },
        { transform: 'translate(-4px, 2px)', filter: 'brightness(1.2) saturate(1.3)' },
        { transform: 'translate(4px, -2px)', filter: 'brightness(0.95)' },
        { transform: 'translate(-2px, -3px)', filter: 'brightness(1.15)' },
        { transform: 'translate(0,0)', filter: 'brightness(1)' }
      ], { duration: 260, easing: 'ease-out' });
    }

    function updateVoidQuest() {
      updateHurtState();
      if (cameraY <= 0.15) reachedTopSinceBottom = true;
      const atBottom = isAtBottom();
      if (atBottom) {
        if (reachedTopSinceBottom) {
          bottomTrips += 1;
          reachedTopSinceBottom = false;
          saveGameState();
        }
        voidTalkTimer += dt;
        if (voidTalkTimer >= 3 && !voidDialogue) {
          if (!quest.offered) {
            quest.offered = true; saveGameState();
            showVoidDialogue('i guard The Deep Blue. accept the quest for passage.', 6000);
          } else if (!quest.accepted) {
            showVoidDialogue('quest: 3 bottles, 3 new fish, 3 top-to-bottom trips. click me to accept. then we stop the scientists.', 7000);
          } else if (!quest.completed) {
            const p = questProgress();
            if (questComplete()) { quest.completed = true; quest.unlockedDeep = true; saveGameState(); showVoidDialogue('passage granted. below is The Deep Blue facility. stop the scientists before they deploy the ocean wipeout supply.', 9000); }
            else showVoidDialogue(`quest: bottles ${Math.min(3,p.bottles)}/3, fish ${Math.min(3,p.fish)}/3, trips ${Math.min(3,p.trips)}/3`, 4500);
          } else if (isFacilityLayer()) {
            if (!facility.complete) showVoidDialogue('stop the wipeout supply.', 4000);
          } else if (isDeepSealed()) {
            showVoidDialogue('The Deep Blue is sealed. the abyss is as far as anyone goes.', 4500);
          } else {
            showVoidDialogue('The Deep Blue is below. stop the scientists. the ocean depends on it.', 4500);
          }
        }
        if (quest.accepted && !quest.completed && questComplete()) {
          quest.completed = true;
          quest.unlockedDeep = true;
          saveGameState();
          showVoidDialogue('it is done. the deep opens. go deeper.', 8000);
        }
      } else {
        voidTalkTimer = 0;
        voidDialogue = null;
      }
      if (voidDialogue && performance.now() > voidDialogue.until) voidDialogue = null;
    }
    function setCamera(target) {
      target = Math.max(0, Math.min(currentBottomDepth(), target));
      camAnim = { from: cameraY, to: target, start: performance.now(), dur: 1600 };
      cameraTarget = target;
      syncSettingsUI();
    }

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    const stars = Array.from({ length: 170 }, () => ({
      x: Math.random(),
      y: Math.random() * 0.58,
      r: Math.random() * 1.7 + 0.2,
      a: Math.random() * 0.8 + 0.15,
      tw: Math.random() * 2.2 + 0.4,
      ph: Math.random() * Math.PI * 2
    }));

    const clouds = Array.from({ length: 9 }, (_, i) => ({
      x: Math.random(),
      y: 0.08 + Math.random() * 0.34,
      s: 0.6 + Math.random() * 1.4,
      sp: 0.000004 + Math.random() * 0.00001,
      a: 0.03 + Math.random() * 0.05,
      off: i * 17.3
    }));

    function lerp(a,b,p){ return a + (b-a)*p; }
    function mixArr(c1,c2,p){ return [lerp(c1[0],c2[0],p), lerp(c1[1],c2[1],p), lerp(c1[2],c2[2],p)]; }
    function rgbStr(c){ return `rgb(${c[0].toFixed(2)},${c[1].toFixed(2)},${c[2].toFixed(2)})`; }
    function mix(c1,c2,p){ return rgbStr(mixArr(c1,c2,p)); }
    function fillBandGradient(y0, y1, stops) {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      for (const s of stops) g.addColorStop(s[0], `rgb(${(+s[1]).toFixed(2)},${(+s[2]).toFixed(2)},${(+s[3]).toFixed(2)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, y0, w, y1 - y0);
    }
    function getCyclePhase() {
      // 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight. no switches, no pause.
      return ((simTime % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS / DAY_CYCLE_MS;
    }
    function skyGeometry() {
      const phase = getCyclePhase();
      const isDay = phase < 0.5;
      const t = (isDay ? phase : phase - 0.5) * 2;
      const alt = Math.max(0, Math.sin(t * Math.PI));
      const body = { x: w * 0.78, y: h * (0.58 - alt * 0.44), alt };
      const hidden = { x: body.x, y: h * 0.72, alt: 0 };
      return { phase, isDay, alt, sun: isDay ? body : hidden, moon: isDay ? hidden : body };
    }
    function getDayFactor() {
      const sky = skyGeometry();
      return sky.isDay ? sky.alt : 0;
    }
    function isDaytime() {
      const sky = skyGeometry();
      if (sky.sun.alt >= 0.5) dayState = true;
      else if (sky.moon.alt >= 0.5) dayState = false;
      return dayState;
    }
    function stockOpen(window) { return window === 'always' || window === (isDaytime() ? 'day' : 'night'); }
    function stockBadge(window) {
      if (window === 'always') return 'in stock';
      return `${window} only · ${stockOpen(window) ? 'in stock' : 'out of stock'}`;
    }

    const rainDrops = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), l: 8 + Math.random()*16, s: 0.6 + Math.random()*1.2 }));
    const snowFlakes = Array.from({ length: 180 }, () => ({ x: Math.random(), y: Math.random(), r: 1.2 + Math.random()*2.8, s: 0.35 + Math.random()*0.8, ph: Math.random()*Math.PI*2, drift: 0.3 + Math.random()*0.8 }));
    const birds = Array.from({ length: 5 }, (_, i) => ({ x: Math.random(), y: 0.08 + i*0.03, s: 0.5 + Math.random()*0.6, sp: 0.00001 + Math.random()*0.00001, ph: Math.random()*10 }));
    const bottle = {
      x: -0.2,
      sp: 0.0000028,
      ph: Math.random() * 10,
      bob: 2.2,
      active: false,
      found: discoveries.includes('bottle'),
      next: discoveries.includes('bottle') ? 45000 + Math.random() * 45000 : 20000 + Math.random() * 25000,
      screenX: -999,
      screenY: -999
    };
    const jelly = { x: Math.random(), y: 0.55, sp: 0.000006, ph: Math.random()*10, active: false, next: 15000 + Math.random()*20000 };

    function getIcebergs() {
      return [{x:w*0.22,y:h*0.63,w:140,h:60},{x:w*0.62,y:h*0.66,w:180,h:72},{x:w*0.82,y:h*0.62,w:110,h:50}];
    }
    function drawIcebergs() {
      for (const b of getIcebergs()) {
        ctx.fillStyle='rgba(220,240,255,0.92)';
        ctx.beginPath(); ctx.moveTo(b.x-b.w*0.5,b.y); ctx.lineTo(b.x-b.w*0.2,b.y-b.h); ctx.lineTo(b.x+b.w*0.1,b.y-b.h*0.75); ctx.lineTo(b.x+b.w*0.5,b.y); ctx.closePath(); ctx.fill();
        ctx.fillStyle='rgba(170,210,235,0.8)'; ctx.fillRect(b.x-b.w*0.45,b.y, b.w*0.9, b.h*0.22);
      }
    }

    function drawSurfacePerspective2() {
      ctx.save();
      ctx.fillStyle='rgba(255,210,150,0.06)'; ctx.fillRect(0,0,w,h*0.6);
      // distant warm coast silhouette
      ctx.fillStyle='rgba(30,25,45,0.35)';
      ctx.beginPath(); ctx.moveTo(0,h*0.56);
      for(let x=0;x<=w;x+=40){ ctx.lineTo(x, h*0.54 - Math.sin(x*0.008)*18 - (x>w*0.6?20:0)); }
      ctx.lineTo(w,h*0.62); ctx.lineTo(0,h*0.62); ctx.closePath(); ctx.fill();
      // lighthouse
      const lx=w*0.78, ly=h*0.54;
      ctx.fillStyle='rgba(230,235,245,0.75)'; ctx.fillRect(lx-8,ly-80,16,80);
      ctx.fillStyle='rgba(255,90,90,0.7)'; ctx.fillRect(lx-8,ly-60,16,10); ctx.fillRect(lx-8,ly-30,16,10);
      const beam = ctx.createRadialGradient(lx,ly-84,0,lx,ly-84,220);
      beam.addColorStop(0,`rgba(255,245,200,${0.18+0.08*Math.sin(animTime*0.002)})`);
      beam.addColorStop(1,'rgba(255,245,200,0)');
      ctx.fillStyle=beam; ctx.beginPath(); ctx.moveTo(lx,ly-84); ctx.lineTo(lx-220,ly-130); ctx.lineTo(lx-220,ly-40); ctx.closePath(); ctx.fill();
      // buoys
      for(const bx of [w*0.25,w*0.42,w*0.58]){ const by=h*0.64+Math.sin(animTime*0.001+bx)*3; ctx.fillStyle='rgba(220,90,70,0.85)'; ctx.beginPath(); ctx.moveTo(bx,by-16); ctx.lineTo(bx+8,by); ctx.lineTo(bx-8,by); ctx.closePath(); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(bx,by-16); ctx.lineTo(bx,by-24); ctx.stroke(); }
      ctx.restore();
    }

    function shoreShopRect() {
      const s = Math.min(w < 620 ? 150 : 184, w * (w < 620 ? 0.38 : 0.24));
      return { x: w * 0.68 - s * 0.5, y: h * 0.62 - s * 0.5, s };
    }
    function shoreShopSignRect() {
      const kr = shoreShopRect();
      const sw = Math.min(150, Math.max(96, kr.s * 0.82));
      const sh = Math.max(38, Math.min(58, h * 0.07));
      return { x: kr.x + kr.s * 0.5 - sw * 0.5, y: h * 0.78 - sh - 14, w: sw, h: sh };
    }
    function drawMachineRock(i = 0) {
      if (perspective !== 0) return;
      const g = machineRigGeom(i);
      const p = g.p;
      const m = mining.machines[i];
      const unlocked = isPadUnlocked(i);
      const cx = g.baseX;
      // seat the pad bottom flush into the rock crown, not floating above or buried inside
      const padY = p.y - p.h * 0.66;
      const tier = m && AUTO_TIERS[m.tier];
      const active = unlocked && activeMachineIndex() === i;
      const statusColor = !unlocked ? '#6f7d90' : !m || !m.tier ? '#96a5b9' : m.broken ? '#ff6f8a' : m.battery <= 0 ? '#ffb36b' : '#8dffc4';
      ctx.save();
      for (const [ox, oy, rr] of [[-0.55, 0.22, 0.15], [0.55, 0.18, 0.14]]) {
        ctx.fillStyle = '#212a37';
        ctx.beginPath();
        ctx.ellipse(cx + p.w * ox, p.y + p.h * oy, p.w * rr, p.h * rr * 0.7, ox * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#48586a';
        ctx.beginPath();
        ctx.ellipse(cx + p.w * ox - p.w * rr * 0.2, p.y + p.h * oy - p.h * rr * 0.2, p.w * rr * 0.45, p.h * rr * 0.24, ox * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#27303d';
      ctx.beginPath();
      ctx.moveTo(cx - p.w * 0.59, p.y + p.h * 0.32);
      ctx.lineTo(cx - p.w * 0.5, p.y - p.h * 0.27);
      ctx.lineTo(cx - p.w * 0.23, p.y - p.h * 0.49);
      ctx.lineTo(cx + p.w * 0.19, p.y - p.h * 0.5);
      ctx.lineTo(cx + p.w * 0.51, p.y - p.h * 0.23);
      ctx.lineTo(cx + p.w * 0.6, p.y + p.h * 0.31);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#465464';
      ctx.beginPath();
      ctx.moveTo(cx - p.w * 0.5, p.y - p.h * 0.27);
      ctx.lineTo(cx - p.w * 0.23, p.y - p.h * 0.49);
      ctx.lineTo(cx + p.w * 0.19, p.y - p.h * 0.5);
      ctx.lineTo(cx + p.w * 0.03, p.y - p.h * 0.28);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#111a26';
      ctx.fillRect(cx - p.w * 0.36, padY, p.w * 0.72, p.h * 0.17);
      ctx.strokeStyle = active ? '#b77cff' : '#96b4cd'; ctx.lineWidth = active ? 3 : 2;
      ctx.strokeRect(cx - p.w * 0.36, padY, p.w * 0.72, p.h * 0.17);
      for (const bx of [cx - p.w * 0.31, cx + p.w * 0.31]) {
        ctx.fillStyle = '#bed7eb';
        ctx.beginPath(); ctx.arc(bx, padY + p.h * 0.085, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      if (!m || !m.tier || !unlocked) {
        ctx.strokeStyle = unlocked ? '#7d91a5' : '#718195'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(cx - p.w * 0.13, padY); ctx.lineTo(cx - p.w * 0.13, padY - p.h * 0.18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + p.w * 0.13, padY); ctx.lineTo(cx + p.w * 0.13, padY - p.h * 0.18); ctx.stroke();
        if (!unlocked) {
          ctx.strokeStyle = '#8c9bad'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(cx - p.w * 0.26, padY - p.h * 0.26); ctx.lineTo(cx + p.w * 0.26, padY + p.h * 0.12); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx + p.w * 0.26, padY - p.h * 0.26); ctx.lineTo(cx - p.w * 0.26, padY + p.h * 0.12); ctx.stroke();
        }
      } else {
        const mastW = Math.max(12, p.w * 0.085);
        const mastBottom = padY;
        ctx.fillStyle = '#1b2939';
        ctx.fillRect(cx - mastW * 0.5, g.beamY, mastW, mastBottom - g.beamY);
        ctx.strokeStyle = '#82aac8'; ctx.lineWidth = 2;
        ctx.strokeRect(cx - mastW * 0.5, g.beamY, mastW, mastBottom - g.beamY);
        ctx.strokeStyle = '#6e96b4'; ctx.lineWidth = 3;
        for (let by = g.beamY + 18; by < mastBottom - 10; by += 24) {
          ctx.beginPath(); ctx.moveTo(cx - mastW * 0.5, by); ctx.lineTo(cx + mastW * 0.5, by + 12); ctx.stroke();
        }
        const boomH = Math.max(10, p.h * 0.1);
        ctx.fillStyle = '#2a3c50';
        ctx.fillRect(g.beamStart, g.beamY - boomH * 0.5, g.beamEnd - g.beamStart, boomH);
        ctx.strokeStyle = '#91b9d7'; ctx.lineWidth = 2;
        ctx.strokeRect(g.beamStart, g.beamY - boomH * 0.5, g.beamEnd - g.beamStart, boomH);
        ctx.save();
        ctx.beginPath(); ctx.rect(g.beamStart, g.beamY - boomH * 0.5, g.beamEnd - g.beamStart, boomH); ctx.clip();
        ctx.globalAlpha = 0.28; ctx.fillStyle = '#e4c05a';
        for (let sx = g.beamStart - 40; sx < g.beamEnd; sx += 34) {
          ctx.beginPath();
          ctx.moveTo(sx, g.beamY - boomH * 0.5);
          ctx.lineTo(sx + 14, g.beamY - boomH * 0.5);
          ctx.lineTo(sx + 26, g.beamY + boomH * 0.5);
          ctx.lineTo(sx + 12, g.beamY + boomH * 0.5);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        ctx.strokeStyle = '#a5cde6'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, g.beamY - boomH * 0.5); ctx.lineTo(g.beamEnd, g.beamY - boomH * 0.1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, g.beamY - boomH * 0.5); ctx.lineTo(cx + (g.beamEnd - cx) * 0.55, g.beamY + boomH * 0.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, g.beamY - boomH * 0.5); ctx.lineTo(g.beamStart, g.beamY - boomH * 0.1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, g.beamY - boomH * 0.5); ctx.lineTo(cx + (g.beamStart - cx) * 0.55, g.beamY + boomH * 0.5); ctx.stroke();
      }
      ctx.fillStyle = statusColor;
      ctx.shadowColor = statusColor; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(cx + p.w * 0.17, padY + p.h * 0.085, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.textAlign = 'center';
      ctx.font = `${Math.max(10, Math.min(13, w * 0.014))}px Consolas, monospace`;
      ctx.fillStyle = '#e2eefa';
      ctx.fillText(!unlocked ? `PAD ${i + 1} · LOCKED` : m && m.tier ? `PAD ${i + 1} · ${tier.name.toUpperCase()}` : `PAD ${i + 1} · EMPTY`, cx, p.y + p.h * 0.52);
      if (unlocked && m && m.tier && mining.tablet) {
        ctx.font = `${Math.max(9, Math.min(11, w * 0.012))}px Consolas, monospace`;
        ctx.fillStyle = '#b77cff';
        ctx.fillText(`${Math.round(m.battery)}%`, cx, p.y + p.h * 0.67);
      }
      ctx.restore();
    }
    function drawMachineRocks() {
      for (let i = 0; i < MACHINE_PAD_COUNT; i++) drawMachineRock(i);
    }
    function drawOreChest() {
      if (perspective !== 0 || cameraY > 0.2 || isFacilityLayer()) return;
      const r = chestRect();
      const x = r.x, y = r.y, cw = r.w, ch = r.h, waterY = r.waterY;
      const held = chestOreCount();
      const left = x - cw * 0.5;
      const bodyTop = y + ch * 0.22;
      const bottom = waterY + ch * 0.12;
      const bodyH = bottom - bodyTop;
      ctx.save();

      // waterline wake first, so the chest reads as sitting in the sea
      ctx.strokeStyle = `rgba(170,225,255,${0.22 + Math.min(0.2, held * 0.01)})`;
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.ellipse(x, waterY + i * 3, cw * (0.72 + i * 0.12), ch * (0.16 + i * 0.05), 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (held > 0) {
        ctx.shadowColor = '#ffd36a';
        ctx.shadowBlur = 14 + Math.sin(animTime * 0.003) * 5;
      }

      // wooden body with plank seams
      const wood = ctx.createLinearGradient(0, bodyTop, 0, bottom);
      wood.addColorStop(0, '#7a5234');
      wood.addColorStop(0.55, '#523422');
      wood.addColorStop(1, '#362215');
      ctx.fillStyle = wood;
      roundRectPath(ctx, left, bodyTop, cw, bodyH, 5); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = held > 0 ? '#ffd36a' : '#b18a55';
      ctx.lineWidth = 1.8;
      roundRectPath(ctx, left, bodyTop, cw, bodyH, 5); ctx.stroke();
      ctx.strokeStyle = 'rgba(28,16,10,0.45)';
      ctx.lineWidth = 1;
      for (const f of [0.34, 0.67]) {
        ctx.beginPath();
        ctx.moveTo(left + 3, bodyTop + bodyH * f);
        ctx.lineTo(left + cw - 3, bodyTop + bodyH * f);
        ctx.stroke();
      }

      // arched lid
      const lid = ctx.createLinearGradient(0, y, 0, bodyTop);
      lid.addColorStop(0, '#8b603b');
      lid.addColorStop(1, '#5c3d27');
      ctx.fillStyle = lid;
      ctx.beginPath();
      ctx.moveTo(left + 1, bodyTop);
      ctx.quadraticCurveTo(x, y - ch * 0.1, left + cw - 1, bodyTop);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = held > 0 ? '#ffd36a' : '#b18a55';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,226,163,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left + cw * 0.18, bodyTop - ch * 0.05);
      ctx.quadraticCurveTo(x, y - ch * 0.04, left + cw * 0.82, bodyTop - ch * 0.05);
      ctx.stroke();

      // brass straps, handles and latch
      ctx.fillStyle = '#c9a25b';
      ctx.fillRect(left + cw * 0.18, bodyTop - ch * 0.04, cw * 0.07, bodyH + ch * 0.04);
      ctx.fillRect(left + cw * 0.75, bodyTop - ch * 0.04, cw * 0.07, bodyH + ch * 0.04);
      ctx.fillStyle = '#e8c66c';
      ctx.fillRect(x - cw * 0.09, bodyTop - ch * 0.09, cw * 0.18, ch * 0.24);
      ctx.strokeStyle = '#6d4a22'; ctx.lineWidth = 1.4;
      ctx.strokeRect(x - cw * 0.09, bodyTop - ch * 0.09, cw * 0.18, ch * 0.24);
      ctx.fillStyle = '#3a2614';
      ctx.beginPath();
      ctx.arc(x, bodyTop + ch * 0.015, Math.max(1.6, cw * 0.025), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 1, bodyTop + ch * 0.015, 2, ch * 0.08);
      ctx.strokeStyle = 'rgba(232,198,108,0.75)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(left - 1, bodyTop + bodyH * 0.45, ch * 0.09, Math.PI * 0.5, Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(left + cw + 1, bodyTop + bodyH * 0.45, ch * 0.09, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.stroke();

      // submerge the bottom edge under a translucent water wash
      ctx.fillStyle = 'rgba(24,86,132,0.28)';
      roundRectPath(ctx, left + 2, waterY - ch * 0.04, cw - 4, ch * 0.16, 4); ctx.fill();

      ctx.textAlign = 'center';
      ctx.font = `${Math.max(9, Math.min(12, w * 0.011))}px Consolas, monospace`;
      ctx.fillStyle = held > 0 ? '#ffe6a3' : '#c5d6e5';
      ctx.fillText(`ORE CHEST · ${held}`, x, y - ch * 0.18);
      if (held > 0) {
        ctx.font = `${Math.max(8, Math.min(10, w * 0.01))}px Consolas, monospace`;
        ctx.fillStyle = '#9fb7c9';
        ctx.fillText('click to open', x, waterY + ch * 0.42);
      }
      ctx.restore();
    }
    function drawDeepClaw(i = 0) {
      if (perspective !== 0 || isFacilityLayer()) return;
      const m = mining.machines[i];
      if (!isPadUnlocked(i) || !m || !m.tier) return;
      const g = machineRigGeom(i);
      const rig = machineRigs[i];
      const pos = {
        x: rig.x == null ? g.baseX : rig.x,
        y: rig.y == null ? g.beamY + 30 : rig.y
      };
      const frozen = boss.active || m.broken || m.battery <= 0;
      const statusColor = m.broken ? '#ff6f8a' : m.battery <= 0 ? '#ffb36b' : frozen ? 'rgba(150,165,185,0.8)' : '#8dffc4';
      const phase = rig.mode === 'windup' ? Math.min(1, rig.modeT / RIG_WINDUP_MS)
        : rig.mode === 'slam' ? Math.min(1, rig.modeT / RIG_SLAM_MS)
        : rig.mode === 'recover' ? Math.min(1, rig.modeT / RIG_RECOVER_MS) : 0;
      const smash = rig.mode === 'slam' ? phase : 0;
      const s = Math.max(34, Math.min(58, w * 0.052));
      const boomH = Math.max(10, g.p.h * 0.1);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(pos.x, g.beamY); ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = 'rgba(5,10,18,0.82)'; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = 'rgba(166,206,232,0.72)'; ctx.lineWidth = 2; ctx.stroke();
      roundRectPath(ctx, pos.x - 17, g.beamY - boomH * 0.75, 34, boomH * 1.5, 5);
      ctx.fillStyle = 'rgba(29,43,60,0.98)'; ctx.fill();
      ctx.strokeStyle = 'rgba(150,190,220,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(170,210,235,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pos.x, g.beamY, boomH * 0.35, 0, Math.PI * 2); ctx.stroke();
      if (rig.moving && !frozen) {
        ctx.globalAlpha = 0.32;
        for (let k = 0; k < 3; k++) {
          const by = pos.y + 22 + k * 12 + Math.sin(animTime * 0.006 + k) * 3;
          ctx.fillStyle = 'rgba(190,230,255,0.5)';
          ctx.beginPath(); ctx.arc(pos.x + Math.sin(animTime * 0.004 + k) * 8, by, 2.2 + k * 0.7, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.translate(pos.x, pos.y);
      const spread = 0.58 - smash * 0.24;
      ctx.strokeStyle = '#9bb6c9'; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, -s * 0.12, s * 0.17, Math.PI * 0.08, Math.PI * 0.92, true); ctx.stroke();
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * s * 0.16, -s * 0.08);
        ctx.quadraticCurveTo(side * s * 0.52, s * 0.02, side * s * spread, s * 0.43);
        ctx.lineTo(side * s * (spread - 0.13), s * 0.57);
        ctx.stroke();
      }
      ctx.fillStyle = '#40566d';
      roundRectPath(ctx, -s * 0.24, -s * 0.32, s * 0.48, s * 0.32, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(170,205,230,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#c9dbe9';
      ctx.beginPath(); ctx.moveTo(-s * 0.12, s * 0.16); ctx.lineTo(0, s * 0.42); ctx.lineTo(s * 0.12, s * 0.16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = statusColor;
      ctx.shadowColor = statusColor; ctx.shadowBlur = 9;
      ctx.beginPath(); ctx.arc(0, -s * 0.24, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      if (smash > 0.25) {
        ctx.strokeStyle = `rgba(255,228,160,${smash})`;
        ctx.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          const a = -0.9 + k * 0.55;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * s * 0.35, s * 0.44 + Math.sin(a) * s * 0.2);
          ctx.lineTo(Math.cos(a) * s * 0.68, s * 0.62 + Math.sin(a) * s * 0.42);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    function drawDeepClaws() {
      for (let i = 0; i < MACHINE_PAD_COUNT; i++) drawDeepClaw(i);
    }
    function shoreSandTop() { return h * 0.68; }
    function drawShoreScene() {
      ctx.save();
      const sandTop = shoreSandTop();
      const sandEdge = (x) => sandTop + Math.sin(x * 0.012 + animTime * 0.0012) * 7;
      const sand = ctx.createLinearGradient(0, sandTop, 0, h);
      sand.addColorStop(0, 'rgb(210,188,151)');
      sand.addColorStop(0.5, 'rgb(158,137,108)');
      sand.addColorStop(1, 'rgb(84,72,58)');
      ctx.fillStyle = sand;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 24) {
        if (x === 0) ctx.moveTo(x, sandEdge(x)); else ctx.lineTo(x, sandEdge(x));
      }
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(235,248,255,${0.42 + 0.1 * Math.sin(animTime * 0.002)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 18) {
        const fy = sandEdge(x) + 1;
        if (x === 0) ctx.moveTo(x, fy); else ctx.lineTo(x, fy);
      }
      ctx.stroke();
      // supply dock + stall
      const dockY = h * 0.78;
      ctx.fillStyle = 'rgba(70,48,31,0.9)';
      ctx.fillRect(w * 0.42, dockY, w * 0.56, h * 0.055);
      ctx.strokeStyle = 'rgba(120,88,56,0.5)';
      ctx.lineWidth = 2;
      for (let x = w * 0.43; x < w * 0.98; x += 34) { ctx.beginPath(); ctx.moveTo(x, dockY); ctx.lineTo(x + 8, dockY + h * 0.055); ctx.stroke(); }
      const kr = shoreShopRect();
      const stallTop = Math.max(h * 0.32, kr.y - 34);
      ctx.fillStyle = 'rgba(34,22,38,0.82)';
      ctx.fillRect(kr.x - 58, stallTop, kr.s + 116, 14);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(183,124,255,0.55)' : 'rgba(238,188,110,0.55)';
        ctx.beginPath();
        ctx.moveTo(kr.x - 58 + i * (kr.s + 116) / 8, stallTop);
        ctx.lineTo(kr.x - 58 + (i + 1) * (kr.s + 116) / 8, stallTop);
        ctx.lineTo(kr.x - 50 + (i + 1) * (kr.s + 116) / 8, stallTop + 24);
        ctx.lineTo(kr.x - 66 + i * (kr.s + 116) / 8, stallTop + 24);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(47,31,22,0.95)';
      ctx.fillRect(kr.x - 52, stallTop + 14, 8, dockY - stallTop - 14);
      ctx.fillRect(kr.x + kr.s + 44, stallTop + 14, 8, dockY - stallTop - 14);
      // hanging shop sign — click it to open the supply panel
      const sign = shoreShopSignRect();
      ctx.strokeStyle = 'rgba(212,184,150,0.5)'; ctx.lineWidth = 2;
      for (const sx of [sign.x + sign.w * 0.2, sign.x + sign.w * 0.8]) {
        ctx.beginPath(); ctx.moveTo(sx, stallTop + 24); ctx.lineTo(sx, sign.y); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(32,20,34,0.96)';
      roundRectPath(ctx, sign.x, sign.y, sign.w, sign.h, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(183,124,255,0.6)'; ctx.lineWidth = 2;
      roundRectPath(ctx, sign.x, sign.y, sign.w, sign.h, 8); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.max(14, Math.min(20, w * 0.018))}px Consolas, monospace`;
      ctx.fillStyle = '#f0d7ff';
      ctx.fillText('SHOP', sign.x + sign.w * 0.5, sign.y + sign.h * 0.6);
      ctx.font = `${Math.max(9, Math.min(11, w * 0.01))}px Consolas, monospace`;
      ctx.fillStyle = 'rgba(236,247,255,0.65)';
      ctx.fillText('click to open', sign.x + sign.w * 0.5, sign.y + sign.h + 13);
      // ore cart on the sand
      const cartX = w * 0.2, cartY = h * 0.79, cw = Math.min(150, w * 0.24);
      ctx.fillStyle = 'rgba(52,36,28,0.95)';
      ctx.beginPath();
      ctx.moveTo(cartX - cw * 0.5, cartY - 26);
      ctx.lineTo(cartX + cw * 0.5, cartY - 26);
      ctx.lineTo(cartX + cw * 0.38, cartY + 22);
      ctx.lineTo(cartX - cw * 0.38, cartY + 22);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(130,95,64,0.6)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#1b2532';
      for (const wx of [-cw * 0.28, cw * 0.28]) {
        ctx.beginPath(); ctx.arc(cartX + wx, cartY + 24, 12, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(180,210,235,0.28)'; ctx.stroke();
      }
      // empty cart, no ore chunks
      ctx.strokeStyle = 'rgba(176,136,94,0.72)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cartX - cw * 0.5, cartY - 26); ctx.lineTo(cartX + cw * 0.5, cartY - 26); ctx.stroke();
      ctx.font = `${Math.max(10, Math.min(13, w * 0.014))}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(240,232,210,0.82)';
      ctx.fillText('SHORE SUPPLY', kr.x + kr.s * 0.5, stallTop - 8);
      ctx.restore();
    }
    function nodeNoise(node, i) {
      const seed = (node.id.charCodeAt(0) * 17 + node.id.charCodeAt(1) * 31 + i * 47);
      return ((Math.sin(seed) + 1) % 1 + 1) % 1;
    }
    function drawOreLayer(layer) {
      if (perspective !== 0 || isFacilityLayer()) return;
      for (const node of ORE_NODES) {
        if (node.layer !== layer) continue;
        const { x, y, r } = oreNodePos(node);
        ctx.save();
        const oreId = nodeOreId(node);
        if (!oreId) {
          ctx.fillStyle = 'rgba(10,16,26,0.45)';
          ctx.beginPath(); ctx.ellipse(x, y + r * 0.35, r * 0.8, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(150,180,210,0.18)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.ellipse(x, y, r * 0.72, r * 0.58, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
          continue;
        }
        const def = ORE_DEFS[oreId];
        const hp = nodeHp(node);
        const ready = nodeReady(node);
        if (!ready || hp <= 0) {
          ctx.fillStyle = 'rgba(12,18,28,0.65)';
          ctx.beginPath(); ctx.ellipse(x, y + r * 0.35, r * 0.8, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
          const wait = Math.max(0, (mining.nodeRespawn[node.id] || 0) - Date.now());
          const p = 1 - Math.min(1, wait / def.respawn);
          ctx.strokeStyle = 'rgba(180,210,235,0.25)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(x, y, r * 0.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); ctx.stroke();
          ctx.restore();
          continue;
        }
        const glow = ctx.createRadialGradient(x, y, 1, x, y, r * 2.2);
        glow.addColorStop(0, def.color + '55');
        glow.addColorStop(1, def.color + '00');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(x, y + r * 0.45, r * 0.9, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        for (let i = 0; i <= 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const rr = r * (0.76 + nodeNoise(node, i) * 0.3);
          const px = x + Math.cos(a) * rr;
          const py = y + Math.sin(a) * rr * 0.82;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        const rock = ctx.createLinearGradient(x, y - r, x, y + r);
        rock.addColorStop(0, 'rgba(44,56,70,0.98)');
        rock.addColorStop(1, 'rgba(14,20,30,0.98)');
        ctx.fillStyle = rock; ctx.fill();
        ctx.strokeStyle = def.vein; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = def.color; ctx.lineWidth = 2.4; ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.5, y + r * 0.25); ctx.lineTo(x - r * 0.08, y - r * 0.2); ctx.lineTo(x + r * 0.42, y + r * 0.12);
        ctx.moveTo(x - r * 0.2, y - r * 0.5); ctx.lineTo(x + r * 0.12, y - r * 0.05);
        ctx.stroke();
        ctx.globalAlpha = 1;
        const missing = Math.round((1 - hp / def.hp) * 5);
        ctx.strokeStyle = 'rgba(5,8,14,0.75)'; ctx.lineWidth = 1.4;
        for (let i = 0; i < missing; i++) {
          const a = nodeNoise(node, i + 20) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * r * 0.15, y + Math.sin(a) * r * 0.12);
          ctx.lineTo(x + Math.cos(a + 0.5) * r * 0.68, y + Math.sin(a + 0.5) * r * 0.55);
          ctx.stroke();
        }
        ctx.font = `bold ${Math.max(9, r * 0.38)}px Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(236,247,255,0.75)';
        ctx.fillText(def.label, x, y + r + 13);
        ctx.restore();
      }
    }
    function drawMiningFx(dtMs) {
      if (swingFx) {
        swingFx.t += dtMs;
        const p = swingFx.t / 280;
        if (p >= 1) swingFx = null;
        else {
          ctx.save();
          ctx.translate(0, h * swingFx.layer);
          ctx.globalAlpha = 1 - p;
          ctx.strokeStyle = 'rgba(255,238,190,0.9)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(swingFx.x + 16, swingFx.y - 8, 34, -1.5 + p * 2.6, -0.35 + p * 2.6);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(swingFx.x + 18, swingFx.y - 12);
          ctx.lineTo(swingFx.x - 14 + p * 12, swingFx.y + 10 - p * 18);
          ctx.stroke();
          ctx.restore();
        }
      }
      for (let i = autoFx.length - 1; i >= 0; i--) {
        const fx = autoFx[i];
        fx.t += dtMs;
        const p = fx.t / 1100;
        if (p >= 1) { autoFx.splice(i, 1); continue; }
        ctx.save();
        ctx.translate(0, h * fx.layer);
        ctx.globalAlpha = 1 - p;
        if (fx.shatter) {
          ctx.strokeStyle = fx.color;
          ctx.lineWidth = 2;
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2;
            const d = 14 + p * 44;
            ctx.beginPath();
            ctx.moveTo(fx.x + Math.cos(a) * 7, fx.y + Math.sin(a) * 7);
            ctx.lineTo(fx.x + Math.cos(a) * d, fx.y + Math.sin(a) * d + p * 22);
            ctx.stroke();
          }
        }
        ctx.fillStyle = fx.color;
        ctx.font = '11px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(fx.text, fx.x, fx.y - 24 - p * 34);
        ctx.restore();
      }
    }
    function drawSky() {
      dayFactor = getDayFactor();
      const d = dayFactor;
      const nightTop=[2,6,20], nightMid=[5,22,45], nightLow=[8,34,62], nightBot=[5,18,37];
      const dayTop=[80,170,235], dayMid=[120,200,255], dayLow=[160,220,255], dayBot=[210,238,255];
      const stormDark = Math.min(0.55, weatherIntensity * 0.22);
      const darken = (c) => [Math.round(c[0]*(1-stormDark)), Math.round(c[1]*(1-stormDark)), Math.round(c[2]*(1-stormDark))];
      const t0=darken(mixArr(nightTop,dayTop,d)), t1=darken(mixArr(nightMid,dayMid,d)), t2=darken(mixArr(nightLow,dayLow,d)), t3=darken(mixArr(nightBot,dayBot,d));
      fillBandGradient(0, h, [[0,...t0],[0.35,...t1],[0.6,...t2],[1,...t3]], 4.2);
      if (perspective === 1) { ctx.fillStyle='rgba(180,230,255,0.08)'; ctx.fillRect(0,0,w,h); }
      drawLightning();

      const sky = skyGeometry();
      const sun = sky.sun;
      const moon = sky.moon;
      const isDay = sky.isDay;
      const sunA = isDay ? Math.min(1, sky.alt * 2) : 0;
      const moonA = !isDay ? Math.min(1, sky.alt * 2) : 0;

      if (sunA > 0.01) {
        const sg = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, 170);
        sg.addColorStop(0, `rgba(255,245,200,${0.45 * sunA})`);
        sg.addColorStop(0.3, `rgba(255,210,120,${0.18 * sunA})`);
        sg.addColorStop(1, 'rgba(255,210,120,0)');
        ctx.fillStyle = sg; ctx.fillRect(0,0,w,h*0.75);
        ctx.save();
        ctx.globalAlpha = sunA;
        const sr = Math.min(w,h)*0.034;
        ctx.beginPath(); ctx.arc(sun.x, sun.y, sr * 2.1, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,230,160,0.13)'; ctx.fill();
        ctx.beginPath(); ctx.arc(sun.x, sun.y, sr * 1.45, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,240,190,0.22)'; ctx.fill();
        ctx.beginPath(); ctx.arc(sun.x, sun.y, sr, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,244,210,0.98)'; ctx.fill();
        ctx.restore();
      }

      if (moonA > 0.01) {
        const ax = w * (0.3 + Math.sin(animTime * 0.00012) * 0.08);
        const ay = h * 0.22;
        const aurora = ctx.createRadialGradient(ax, ay, 0, ax, ay, Math.max(w, h) * 0.45);
        aurora.addColorStop(0, `rgba(60,160,255,${0.10 * moonA * (1-weatherIntensity*0.4)})`);
        aurora.addColorStop(0.45, `rgba(70,160,220,${0.04 * moonA})`);
        aurora.addColorStop(1, 'rgba(70,160,220,0)');
        ctx.fillStyle = aurora; ctx.fillRect(0,0,w,h*0.7);
        if (moonA > 0.5 && weatherIntensity < 0.4) recordDiscovery('aurora');

        const moonGlow = ctx.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, 220);
        moonGlow.addColorStop(0, `rgba(225,242,255,${0.34*moonA})`);
        moonGlow.addColorStop(0.28, `rgba(150,205,255,${0.14*moonA})`);
        moonGlow.addColorStop(0.6, `rgba(110,170,235,${0.05*moonA})`);
        moonGlow.addColorStop(1, 'rgba(120,180,235,0)');
        ctx.fillStyle = moonGlow; ctx.fillRect(0,0,w,h*0.72);
        ctx.save();
        ctx.globalAlpha = moonA;
        ctx.fillStyle = 'rgba(240,250,255,0.97)';
        const mr = Math.min(w,h)*0.034;
        ctx.beginPath(); ctx.arc(moon.x, moon.y, mr * 1.9, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(215,240,255,0.14)'; ctx.fill();
        ctx.beginPath(); ctx.arc(moon.x, moon.y, mr * 1.35, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(225,245,255,0.24)'; ctx.fill();
        ctx.beginPath(); ctx.arc(moon.x, moon.y, mr, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(240,250,255,0.97)'; ctx.fill();
        ctx.restore();
      }

      // thin upper cloud strips (reference: dark layered bands)
      const stripG = ctx.createLinearGradient(0, 0, 0, h * 0.5);
      stripG.addColorStop(0, `rgba(1,5,16,${0.4 * (1 - d * 0.55)})`);
      stripG.addColorStop(0.55, `rgba(3,14,32,${0.12 * (1 - d * 0.4)})`);
      stripG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = stripG;
      ctx.fillRect(0, 0, w, h * 0.5);

      if (moonA > 0.01) {
        for (const s of stars) {
          const twinkle = (Math.sin(animTime * 0.0012 * s.tw + s.ph) + 1) * 0.5;
          const y = s.y * h + Math.sin(animTime * 0.00015 + s.ph) * 1.5;
          ctx.fillStyle = `rgba(220,240,255,${s.a * (0.35 + twinkle * 0.65) * moonA * (1-weatherIntensity*0.5)})`;
          ctx.beginPath(); ctx.arc(s.x * w, y, s.r * (0.8 + twinkle * 0.5), 0, Math.PI * 2); ctx.fill();
        }
      }

      // clouds: dark layered bands (reference style), not puffy cotton candy
      for (const c of clouds) {
        const cx = ((c.x + animTime * c.sp * (1 + weatherIntensity*0.6)) % 1.6 - 0.3) * w;
        const cy = c.y * h + Math.sin(animTime * 0.00015 + c.off) * 4;
        const cw = 260 * c.s;
        const ch = 22 * c.s;
        const baseA = (d > 0.5 ? 0.08 : 0.22) * c.a * 3.2 + weatherIntensity * 0.08;
        const grey = Math.round(lerp(40, 18, Math.min(1, weatherIntensity * 0.6)));
        const cg = ctx.createLinearGradient(cx - cw, cy, cx + cw, cy);
        cg.addColorStop(0, `rgba(${grey},${grey+8},${grey+20},0)`);
        cg.addColorStop(0.2, `rgba(${grey},${grey+8},${grey+20},${baseA})`);
        cg.addColorStop(0.5, `rgba(${grey+10},${grey+18},${grey+32},${baseA * 1.15})`);
        cg.addColorStop(0.8, `rgba(${grey},${grey+8},${grey+20},${baseA})`);
        cg.addColorStop(1, `rgba(${grey},${grey+8},${grey+20},0)`);
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
        ctx.fill();
        // soft underside haze
        const hg = ctx.createLinearGradient(0, cy, 0, cy + ch * 2.2);
        hg.addColorStop(0, `rgba(${grey},${grey+10},${grey+25},${baseA * 0.35})`);
        hg.addColorStop(1, `rgba(${grey},${grey+10},${grey+25},0)`);
        ctx.fillStyle = hg;
        ctx.fillRect(cx - cw, cy, cw * 2, ch * 2.2);
      }
    }

    function drawWeather() {
      if (weatherIntensity <= 0.01) return;
      const horizon = h * 0.58;
      const isSnow = weatherMode === 'snow';
      if (isSnow) {
        const count = Math.min(snowFlakes.length, Math.floor((reducedMotion ? 20 : 40) + weatherIntensity * (reducedMotion ? 50 : 90)));
        ctx.save();
        for (let i=0; i<count; i++) {
          const f = snowFlakes[i];
          const x = ((f.x * w) + Math.sin(animTime * 0.00035 * f.drift + f.ph) * 22 * f.drift + animTime * 0.01 * f.drift) % (w + 20) - 10;
          const travel = h + 30;
          const yRaw = f.y * h + snowPhase * f.s;
          const prev = f._yRaw ?? yRaw;
          const y = (yRaw % travel) - 20;
          const prevY = (prev % travel) - 20;
          const surface = weatherLandingAt(x, horizon);
          const crossed = (prevY < surface.y && y >= surface.y) || (yRaw - prev > travel * 0.5);
          if (!surface.solid && crossed && Math.random() < 0.25) {
            ripples.push({ x, y: surface.y + 1, r: 1 + Math.random()*1.8, age: 0, life: 450 + Math.random()*300, rain: true });
            if (ripples.length > 140) ripples.splice(0, ripples.length - 140);
          }
          f._yRaw = yRaw;
          if (y >= surface.y) continue;
          const a = 0.35 + weatherIntensity * 0.25 + f.r * 0.04;
          ctx.fillStyle = `rgba(235,245,255,${Math.min(0.95,a).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(x, y, f.r, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
        return;
      }
      const count = Math.min(rainDrops.length, Math.floor((reducedMotion ? 20 : 40) + weatherIntensity * (reducedMotion ? 70 : 140)));
      ctx.save();
      ctx.lineCap = 'round';
      for (let i=0; i<count; i++) {
        const d = rainDrops[i];
        if (!d) continue;
        const x = ((d.x * w) + animTime * 0.03 * d.s) % w;
        const travel = h + 30;
        const yRaw = d.y * h + rainPhase * d.s;
        const prev = d._yRaw ?? yRaw;
        const y = (yRaw % travel) - 20;
        const prevY = (prev % travel) - 20;
        const surface = weatherLandingAt(x, horizon);
        const crossed = (prevY < surface.y && y >= surface.y) || (yRaw - prev > travel * 0.5);
        if (!surface.solid && crossed && Math.random() < 0.45) {
          ripples.push({ x, y: surface.y + 1, r: 1.5 + Math.random()*2.5, age: 0, life: 550 + Math.random()*350, rain: true });
          if (ripples.length > 140) ripples.splice(0, ripples.length - 140);
        }
        d._yRaw = yRaw;
        const x2 = x - 2.2 * d.s;
        const y2 = y + d.l * 1.15;
        if (y >= surface.y) continue;
        let drawY2 = y2, drawX2 = x2;
        if (y2 > surface.y) {
          const tHit = (surface.y - y) / ((y2 - y) || 1);
          drawY2 = surface.y; drawX2 = x + (x2 - x) * tHit;
        }
        const a = 0.22 + weatherIntensity * 0.2 + d.s * 0.08;
        ctx.strokeStyle = `rgba(210,235,255,${a.toFixed(3)})`;
        ctx.lineWidth = 0.8 + d.s * 0.45;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(drawX2, drawY2); ctx.stroke();
      }
      ctx.restore();
      return;
    }



    function drawBottleSprite(x, y, rot, alpha=0.9, scale=1) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(170, 225, 210, 0.28)';
      ctx.strokeStyle = 'rgba(220, 245, 235, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-7, -8); ctx.lineTo(-7, 10);
      ctx.quadraticCurveTo(-7, 14, -3, 14); ctx.lineTo(3, 14);
      ctx.quadraticCurveTo(7, 14, 7, 10); ctx.lineTo(7, -8);
      ctx.quadraticCurveTo(7, -11, 3, -11); ctx.lineTo(3, -16);
      ctx.lineTo(-3, -16); ctx.lineTo(-3, -11);
      ctx.quadraticCurveTo(-7, -11, -7, -8);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(120, 85, 55, 0.95)';
      ctx.fillRect(-3.5, -18, 7, 3.2);
      ctx.fillStyle = 'rgba(245, 235, 210, 0.85)';
      ctx.fillRect(-4, -2, 8, 8);
      ctx.strokeStyle = 'rgba(180,160,120,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-2.5,1); ctx.lineTo(2.5,1); ctx.moveTo(-2.5,3.5); ctx.lineTo(1.5,3.5); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(-4, 8); ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function drawEquippedSurface() {
      if (!equippedDiscovery || !discoveries.includes(equippedDiscovery)) return;
      const horizon = h * 0.58;
      if (equippedDiscovery === 'bottle') {
        const x = w * 0.18 + Math.sin(animTime * 0.00025) * w * 0.04;
        const y = horizon + 24 + Math.sin(animTime * 0.0011) * 4;
        drawBottleSprite(x, y, Math.sin(animTime * 0.0008) * 0.16, 0.95, 1.2);
      } else if (equippedDiscovery === 'storm') {
        ctx.save();
        const cloudX = w * 0.78, cloudY = h * 0.14;
        ctx.fillStyle = 'rgba(90,110,140,0.35)';
        ctx.beginPath(); ctx.ellipse(cloudX, cloudY, 46, 18, 0, 0, Math.PI*2); ctx.ellipse(cloudX-34, cloudY+6, 28, 14, 0, 0, Math.PI*2); ctx.ellipse(cloudX+34, cloudY+8, 30, 14, 0, 0, Math.PI*2); ctx.fill();
        const flick = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(animTime * 0.008));
        ctx.strokeStyle = `rgba(190,225,255,${flick})`;
        ctx.lineWidth = 2;
        const x = cloudX + 6, y = cloudY + 14;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x-8, y+18); ctx.lineTo(x+2, y+18); ctx.lineTo(x-6, y+38); ctx.lineTo(x+10, y+14); ctx.lineTo(x+1, y+14); ctx.closePath();
        ctx.stroke(); ctx.fillStyle = `rgba(200,235,255,${flick * 0.35})`; ctx.fill();
        ctx.restore();
      } else if (equippedDiscovery === 'aurora') {
        ctx.save(); ctx.globalAlpha = 0.55;
        const y = h * 0.17;
        for (let i=0;i<3;i++) {
          ctx.strokeStyle = `rgba(${100+i*30},${200-i*20},255,${0.14-i*0.025})`;
          ctx.lineWidth = 10 - i*2;
          ctx.beginPath();
          for (let x=0;x<=w;x+=24) {
            const yy = y + i*14 + Math.sin(x*0.01 + animTime*0.0007 + i) * 10;
            if (x===0) ctx.moveTo(x,yy); else ctx.lineTo(x,yy);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    function drawEquippedUnderwater() {
      if (!equippedDiscovery || !discoveries.includes(equippedDiscovery)) return;
      const inAbyss = cameraY >= 1.2;
      if (equippedDiscovery === 'jelly') {
        const x = w * 0.72 + Math.sin(animTime * 0.0003) * 30;
        const y = h * 0.48 + Math.sin(animTime * 0.0007) * 18;
        ctx.save(); ctx.globalAlpha = 0.92; drawJelly(x, y, inAbyss ? 1.25 : 1.05); ctx.restore();
      } else if (equippedDiscovery === 'deep') {
        const x = w * 0.5, y = h * 0.72 + Math.sin(animTime*0.0008)*8;
        ctx.save();
        const g = ctx.createRadialGradient(x, y, 0, x, y, 70);
        g.addColorStop(0,inAbyss ? 'rgba(140,120,255,0.24)' : 'rgba(120,220,255,0.22)'); g.addColorStop(1,'rgba(120,220,255,0)');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,70,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle=inAbyss ? 'rgba(170,150,255,0.5)' : 'rgba(140,220,255,0.45)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x,y,20+Math.sin(animTime*0.002)*2,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle=inAbyss ? 'rgba(210,190,255,0.8)' : 'rgba(180,235,255,0.75)'; ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill();
        ctx.restore();
      } else if (equippedDiscovery === 'angler') {
        const x = w * 0.3 + Math.sin(animTime*0.0002)*40;
        const y = h * 0.55 + Math.sin(animTime*0.0007)*18;
        ctx.save(); ctx.globalAlpha = 0.95; drawAngler(x, y, 0.75, 1); ctx.restore();
      } else if (equippedDiscovery === 'vent') {
        const vx = w * 0.5, fy = h * 0.86;
        ctx.save();
        ctx.fillStyle = '#1a1512'; ctx.beginPath(); ctx.moveTo(vx-20, fy+2); ctx.lineTo(vx-8, fy-18); ctx.lineTo(vx+8, fy-18); ctx.lineTo(vx+20, fy+2); ctx.closePath(); ctx.fill();
        const vg = ctx.createRadialGradient(vx, fy-16, 0, vx, fy-16, 30);
        vg.addColorStop(0, 'rgba(255,120,40,0.35)'); vg.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(vx, fy-16, 30, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      } else if (equippedDiscovery === 'abyss') {
        ctx.save();
        const g = ctx.createRadialGradient(w*0.5, h*0.5, 10, w*0.5, h*0.5, 140);
        g.addColorStop(0, 'rgba(100,80,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
        ctx.restore();
      } else if (equippedDiscovery === 'trenches') {
        ctx.save();
        ctx.strokeStyle = 'rgba(120,150,255,0.18)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(w*0.35,h*0.1); ctx.lineTo(w*0.42,h*0.45); ctx.lineTo(w*0.38,h*0.9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w*0.65,h*0.1); ctx.lineTo(w*0.58,h*0.45); ctx.lineTo(w*0.62,h*0.9); ctx.stroke();
        ctx.restore();
      } else if (equippedDiscovery === 'crack') {
        ctx.save();
        const cx = w*0.5, cy = h*0.5 + Math.sin(animTime*0.001)*6;
        const g = ctx.createRadialGradient(cx,cy,0,cx,cy,60);
        g.addColorStop(0,`rgba(140,190,255,${0.22+0.1*Math.sin(animTime*0.003)})`); g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx,cy,60,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(170,210,255,0.65)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx-5,cy-35); ctx.lineTo(cx+3,cy); ctx.lineTo(cx-2,cy+35); ctx.stroke();
        ctx.restore();
      } else if (equippedDiscovery === 'hadal') {
        ctx.save();
        const g = ctx.createRadialGradient(w*0.5,h*0.65,10,w*0.5,h*0.65,140);
        g.addColorStop(0,'rgba(140,40,80,0.12)'); g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
        ctx.restore();
      } else if (equippedDiscovery === 'ribcage') {
        ctx.save();
        ctx.strokeStyle = 'rgba(120,100,120,0.35)'; ctx.lineWidth = 6;
        for (let i=0;i<4;i++) { const x = w*(0.3+i*0.13); ctx.beginPath(); ctx.moveTo(x,h*0.85); ctx.quadraticCurveTo(x+25, h*0.6, x+8, h*0.45+Math.sin(animTime*0.001+i)*4); ctx.stroke(); }
        ctx.restore();
      } else if (equippedDiscovery === 'void') {
        ctx.save();
        const g = ctx.createRadialGradient(w*0.5,h*0.5,10,w*0.5,h*0.5,150);
        g.addColorStop(0,'rgba(120,90,255,0.09)'); g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
        ctx.restore();
      } else if (equippedDiscovery === 'void_eye') {
        ctx.save();
        const ex = w*0.5, ey = h*0.45 + Math.sin(animTime*0.0012)*5;
        const blink = Math.sin(animTime*0.001 + 1.3);
        if (blink > -0.92) {
          ctx.fillStyle = 'rgba(180,140,255,0.65)';
          ctx.beginPath(); ctx.ellipse(ex-8, ey, 4, 2.2, 0, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(ex+8, ey, 4, 2.2, 0, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
      } else if (ALL_FISH_IDS.includes(equippedDiscovery) && window.OceanFish) {
        const t = window.OceanFish.TYPES.find(x => x.id === equippedDiscovery);
        if (t) {
          const x = w * 0.5 + Math.sin(animTime*0.00025) * 40;
          const y = h * 0.55 + Math.sin(animTime*0.0006) * 12;
          const s = t.scale * Math.min(w,h) * 0.0018 * (t.id === 'pufferfish' ? 1.2 : 1);
          ctx.save(); ctx.globalAlpha = 0.95; ctx.translate(x,y);
          if (t.img.complete && t.img.naturalWidth > 0) ctx.drawImage(t.img, -t.w*s/2, -t.h*s/2, t.w*s, t.h*s);
          ctx.restore();
        }
      }
    }

    function drawSurfaceLife() {
      const isDay = skyGeometry().isDay;
      const horizon = h * 0.58;
      if (isDay && weatherIntensity < 1.2) {
        ctx.save();
        ctx.strokeStyle = `rgba(230,245,255,${0.25 * (1-weatherIntensity)})`;
        ctx.lineWidth = 1.5;
        for (const b of birds) {
          const bx = ((b.x + animTime * b.sp * 40) % 1.2 - 0.1) * w;
          const by = b.y * h + Math.sin(animTime*0.001 + b.ph) * 4;
          const s = 8 * b.s;
          ctx.beginPath(); ctx.moveTo(bx-s, by); ctx.quadraticCurveTo(bx-s/2, by-s/2, bx, by); ctx.quadraticCurveTo(bx+s/2, by-s/2, bx+s, by); ctx.stroke();
        }
        ctx.restore();
      }
      // tiny boat at horizon
      if (weatherIntensity < 1.5) {
        const bx = ((animTime * 0.000004) % 1.3 - 0.15) * w;
        const by = horizon - 2 + Math.sin(animTime*0.0012) * 2;
        ctx.save(); ctx.fillStyle = `rgba(120,160,190,${0.25 + dayFactor*0.15})`;
        ctx.beginPath(); ctx.moveTo(bx-10,by); ctx.lineTo(bx+10,by); ctx.lineTo(bx+6,by+5); ctx.lineTo(bx-6,by+5); ctx.closePath(); ctx.fill();
        ctx.fillRect(bx-1, by-10, 2, 10);
        ctx.restore();
      }
      // bottle - rare drifting event
      if (bottle.active) {
        bottle.x += bottle.sp * (dt * 1000) * (reducedMotion ? 0.6 : 1);
        const bx = bottle.x * w;
        const by = horizon + 26 + Math.sin(animTime * 0.0012 + bottle.ph) * bottle.bob;
        bottle.screenX = bx; bottle.screenY = by;
        const bobRot = Math.sin(animTime * 0.0009 + bottle.ph) * 0.18;
        drawBottleSprite(bx, by, bobRot, bottle.found ? 0.55 : 0.9, 1);
        if (bottle.x > 1.15) {
          bottle.active = false;
          bottle.screenX = -999; bottle.screenY = -999;
          bottle.next = 60000 + Math.random() * 90000;
        }
      } else {
        bottle.next -= dt * 1000;
        if (cameraY < 0.35 && weatherIntensity < 1.4 && bottle.next <= 0) {
          bottle.active = true;
          bottle.x = -0.12;
          bottle.ph = Math.random() * 10;
        }
      }
    }

    function drawRipplesAndBubbles() {
      // surface ripples / raindrop impacts
      ctx.save();
      for (let i=ripples.length-1; i>=0; i--) {
        const r = ripples[i];
        r.age += 16;
        const p = r.age / r.life;
        if (p >= 1) { ripples.splice(i,1); continue; }
        const rain = !!r.rain;
        const alpha = (1-p) * (rain ? 0.22 : 0.35);
        ctx.strokeStyle = `rgba(190,230,255,${alpha})`;
        ctx.lineWidth = rain ? 1 : 1.5;
        const grow = rain ? 14 : 50;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r + p*grow, (r.r+p*grow)*0.35, 0, 0, Math.PI*2); ctx.stroke();
        if (rain && p < 0.25) {
          ctx.fillStyle = `rgba(210,240,255,${(0.25-p)*1.4})`;
          ctx.beginPath(); ctx.arc(r.x, r.y - 2 - p*10, 1.2, 0, Math.PI*2); ctx.fill();
        }
      }
      ctx.restore();
      // underwater click bubbles
      ctx.save();
      for (let i=clickBubbles.length-1; i>=0; i--) {
        const b = clickBubbles[i];
        b.y -= b.sp; b.x += Math.sin(animTime*0.003 + b.ph)*0.3; b.age += 16;
        if (b.age > b.life) { clickBubbles.splice(i,1); continue; }
        const a = 1 - b.age/b.life;
        ctx.strokeStyle = `rgba(170,220,245,${a*0.5})`;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.stroke();
      }
      ctx.restore();
    }

    function drawLightning() {
      if (lightning <= 0.01) return;
      ctx.save();
      ctx.fillStyle = `rgba(220,235,255,${lightning * 0.22})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    function waveY(base, amp, freq, phase, x) {
      return base
        + Math.sin(x * freq + phase) * amp
        + Math.sin(x * freq * 0.52 - phase * 0.7) * amp * 0.45
        + Math.sin(x * freq * 1.85 + phase * 1.3) * amp * 0.18;
    }

    function getWaveY(x, horizon) {
      const hzn = horizon ?? (h * 0.58);
      const waveT = animTime * (reducedMotion ? 0.25 : 1);
      const layers = [
        { base: hzn + 18,  amp: 10, freq: 0.008,  phase: waveT * 0.00045 },
        { base: hzn + 34,  amp: 14, freq: 0.0105, phase: waveT * 0.00062 + 1.2 },
        { base: hzn + 56,  amp: 18, freq: 0.009,  phase: -waveT * 0.00052 + 2.1 },
        { base: hzn + 84,  amp: 24, freq: 0.0075, phase: waveT * 0.00072 + 0.4 },
        { base: hzn + 120, amp: 32, freq: 0.0062, phase: -waveT * 0.00058 + 3.4 }
      ];
      // front-most visible waterline approximation
      let y = h;
      for (const l of layers) y = Math.min(y, waveY(l.base, l.amp, l.freq, l.phase, x));
      return y;
    }
    function weatherLandingAt(x, horizon) {
      const waterY = getWaveY(x, horizon);
      if (perspective !== 0 || cameraY > 0.2) return { y: waterY, solid: false };
      let solidY = null;
      for (let i = 0; i < MACHINE_PAD_COUNT; i++) {
        const g = machineRigGeom(i);
        const dx = (x - g.baseX) / (g.p.w * 0.56);
        if (Math.abs(dx) > 1) continue;
        const dome = Math.sqrt(Math.max(0, 1 - dx * dx));
        const rockY = g.p.y - g.p.h * (0.2 + 0.3 * dome);
        solidY = solidY == null ? rockY : Math.min(solidY, rockY);
      }
      return solidY != null && solidY < waterY ? { y: solidY, solid: true } : { y: waterY, solid: false };
    }

    function drawWave(layer) {
      const { base, amp, freq, phase, colorTop, colorBottom, alpha, stroke } = layer;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      const step = 8;
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + step; x += step) {
        const y = waveY(base, amp, freq, phase, x);
        if (x === 0) ctx.lineTo(0, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();

      const g = ctx.createLinearGradient(0, base - amp * 2, 0, h);
      g.addColorStop(0, colorTop);
      g.addColorStop(1, colorBottom);
      ctx.fillStyle = g;
      ctx.fill();

      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
    }

    // coherent glowing wave contours - calm swells, not spaghetti
    function drawCrestLines() {
      const horizon = h * 0.58;
      const d = dayFactor;
      const waveT = simTime * motionMul;
      const count = 10;
      const step = 12;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < count; i++) {
        const p = i / (count - 1);
        const base = horizon + 14 + Math.pow(p, 1.25) * (h - horizon - 18);
        const amp = 4 + p * 14;
        const freq = 0.010 - p * 0.0038;
        const phase = waveT * 0.00036 + p * 2.0;
        const phase2 = -waveT * 0.00022 + p * 1.0;
        const breathe = 0.8 + 0.2 * Math.sin(animTime * 0.0003 + i * 0.6);
        const alpha = (0.12 - p * 0.06) * breathe * (1 - weatherIntensity * 0.35);
        if (alpha <= 0.01) continue;
        const r = 165, g = Math.round(lerp(210, 230, d)), bcol = 255;

        ctx.beginPath();
        for (let x = -step; x <= w + step; x += step) {
          const y = base
            + Math.sin(x * freq + phase) * amp
            + Math.sin(x * freq * 0.55 + phase2) * amp * 0.45;
          if (x === -step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${r},${g},${bcol},${alpha.toFixed(3)})`;
        ctx.lineWidth = 1.1 - p * 0.2;
        ctx.stroke();
      }
      ctx.restore();
    }

    // broken moonlight shimmer dancing on the water - anchored to moon x
    const shimmerDashes = Array.from({ length: 55 }, () => ({
      xf: (Math.random() - 0.5),
      yf: Math.random(),
      sp: 0.35 + Math.random() * 1.2,
      len: 10 + Math.random() * 34,
      fl: Math.random() * Math.PI * 2,
      thick: 0.9 + Math.random() * 1.3
    }));

    function drawMoonShimmer() {
      const sky = skyGeometry();
      const isDay = sky.isDay;
      const d = dayFactor;
      const b = isDay ? sky.sun : sky.moon;
      const vis = Math.min(1, sky.alt * 2);
      if (vis <= 0.01) return;
      const horizon = h * 0.58;
      const top = horizon + 2;
      const bottom = h * 0.99;
      const rc = isDay ? '255,248,220' : '220,242,255';
      const mx = b.x; // directly under moon/sun

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // connecting beam from moon/sun down to horizon hit
      const beam = ctx.createLinearGradient(0, b.y, 0, horizon + 8);
      beam.addColorStop(0, `rgba(${rc},${0.10 * vis})`);
      beam.addColorStop(0.65, `rgba(${rc},${0.05 * vis})`);
      beam.addColorStop(1, `rgba(255,255,255,${0.22 * vis})`);
      ctx.strokeStyle = beam;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + 10);
      ctx.lineTo(mx, horizon + 4);
      ctx.stroke();
      // soft beam haze
      ctx.fillStyle = `rgba(${rc},${0.035 * vis})`;
      ctx.beginPath();
      ctx.moveTo(b.x - 10, b.y + 10);
      ctx.lineTo(b.x + 10, b.y + 10);
      ctx.lineTo(mx + 22, horizon + 4);
      ctx.lineTo(mx - 22, horizon + 4);
      ctx.closePath();
      ctx.fill();

      // main reflection column under the body
      const col = ctx.createLinearGradient(0, top, 0, bottom);
      col.addColorStop(0, `rgba(${rc},${0.34 * vis})`);
      col.addColorStop(0.2, `rgba(${rc},${0.14 * vis})`);
      col.addColorStop(1, `rgba(${rc},0)`);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(mx - 10, top);
      ctx.lineTo(mx + 10, top);
      ctx.lineTo(mx + 110, bottom);
      ctx.lineTo(mx - 110, bottom);
      ctx.closePath();
      ctx.fill();

      // bright source hit at horizon
      const hit = ctx.createRadialGradient(mx, horizon + 8, 0, mx, horizon + 8, 46);
      hit.addColorStop(0, `rgba(255,255,255,${0.55 * vis})`);
      hit.addColorStop(0.35, `rgba(${rc},${0.18 * vis})`);
      hit.addColorStop(1, `rgba(${rc},0)`);
      ctx.fillStyle = hit;
      ctx.fillRect(mx - 70, horizon - 12, 140, 90);

      ctx.lineCap = 'round';
      const speed = reducedMotion ? 0.15 : 1;
      for (const s of shimmerDashes) {
        const prog = (s.yf + animTime * 0.000045 * s.sp * speed) % 1;
        const y = top + prog * (bottom - top);
        const spread = 6 + prog * 95;
        const wob = Math.sin(animTime * 0.0015 * s.sp + s.fl) * (1.2 + prog * 8);
        const x = mx + s.xf * spread + wob;
        const flicker = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(animTime * 0.003 * s.sp + s.fl * 3.5));
        const fade = Math.pow(1 - prog, 0.85);
        const a = flicker * fade * vis * (0.75 - weatherIntensity * 0.35);
        if (a < 0.02) continue;
        const len = s.len * (0.45 + prog * 1.4);
        ctx.strokeStyle = `rgba(235,248,255,${(a * 0.95).toFixed(3)})`;
        ctx.lineWidth = s.thick * (1 - prog * 0.25);
        ctx.beginPath();
        ctx.moveTo(x - len / 2, y);
        ctx.lineTo(x + len / 2, y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    function drawReflection() {
      const d = dayFactor;
      const sky = skyGeometry();
      const isDay = sky.isDay;
      const b = isDay ? sky.sun : sky.moon;
      const mx = b.x;
      const vis = Math.min(1, sky.alt * 2);
      if (vis <= 0.01) return;
      const top = h * 0.58;
      const bottom = h * 0.98;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = (isDay ? lerp(0.18, 0.32, d) : 0.22) * vis * (1 - weatherIntensity * 0.45);
      const g = ctx.createLinearGradient(0, top, 0, bottom);
      const rc = isDay ? '255,245,200' : '200,235,255';
      g.addColorStop(0, `rgba(${rc},0.75)`);
      g.addColorStop(0.4, `rgba(${rc},0.25)`);
      g.addColorStop(1, `rgba(${rc},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(mx - 14, top);
      for (let y = top; y <= bottom; y += 6) {
        const p = (y - top) / (bottom - top);
        const wave = reducedMotion ? 0 : Math.sin(y * 0.09 + animTime * 0.002) * (2 + p * 10);
        const spread = 10 + p * 90 + wave;
        ctx.lineTo(mx + spread, y);
      }
      for (let y = bottom; y >= top; y -= 6) {
        const p = (y - top) / (bottom - top);
        const wave = reducedMotion ? 0 : Math.sin(y * 0.09 + animTime * 0.002 + 1.7) * (2 + p * 10);
        const spread = 10 + p * 90 + wave;
        ctx.lineTo(mx - spread, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    function drawMist() {
      const y = h * 0.62;
      const g = ctx.createLinearGradient(0, y - 40, 0, y + 60);
      g.addColorStop(0, 'rgba(150, 210, 255, 0)');
      g.addColorStop(0.5, 'rgba(150, 210, 255, 0.045)');
      g.addColorStop(1, 'rgba(150, 210, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 40, w, 100);
    }

    // --- underwater ---
    const bubbles = Array.from({ length: 18 }, () => ({
      x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.5,
      sp: 0.000015 + Math.random() * 0.000025, ph: Math.random() * 10
    }));

    function drawCoral(x, baseY, s, sway) {
      const d = dayFactor;
      const c = `rgb(${lerp(20,35,d)}, ${lerp(55,85,d)}, ${lerp(85,130,d)})`;
      const tip = `rgb(${lerp(35,55,d)}, ${lerp(75,110,d)}, ${lerp(110,155,d)})`;
      ctx.save();
      ctx.translate(x, baseY);
      ctx.scale(s, s);
      ctx.lineCap = 'round';
      ctx.strokeStyle = c;
      function stem(x0,y0,cx,cy,x1,y1,w) {
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x0,y0);
        ctx.quadraticCurveTo(cx + sway, cy, x1 + sway * 0.6, y1);
        ctx.stroke();
      }
      stem(0,0, -6,-35, -14,-78, 14);
      stem(0,0, 10,-30, 22,-68, 11);
      stem(-14,-78, -22,-98, -10,-118, 8);
      stem(-14,-78, 0,-98, 10,-112, 7);
      stem(22,-68, 30,-88, 40,-100, 7);
      ctx.fillStyle = tip;
      [[-10,-121],[10,-115],[40,-103]].forEach(([tx,ty]) => { ctx.beginPath(); ctx.arc(tx + sway*0.5, ty, 4, 0, Math.PI*2); ctx.fill(); });
      ctx.restore();
    }

    function drawSeaweed(x, baseY, hgt, sway) {
      const d = dayFactor;
      ctx.save();
      ctx.translate(x, baseY);
      ctx.strokeStyle = `rgba(${lerp(18,35,d)}, ${lerp(50,80,d)}, ${lerp(75,115,d)}, 0.55)`;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let i = 1; i <= 5; i++) {
        const yy = -hgt * (i / 5);
        const xx = Math.sin(sway + i * 0.9) * (5 + i * 1.6);
        ctx.quadraticCurveTo(xx * 0.5, yy + hgt * 0.08, xx, yy);
      }
      ctx.stroke();
      ctx.restore();
    }

    function drawJelly(x, y, s) {
      ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
      ctx.strokeStyle='rgba(160,220,255,0.35)'; ctx.fillStyle='rgba(120,200,255,0.12)';
      ctx.beginPath(); ctx.arc(0,0,26,Math.PI,0); ctx.quadraticCurveTo(20,10,0,14); ctx.quadraticCurveTo(-20,10,-26,0); ctx.fill(); ctx.stroke();
      for (let i=-2;i<=2;i++){ ctx.beginPath(); ctx.moveTo(i*7,10); ctx.quadraticCurveTo(i*10,28,i*6,42); ctx.stroke(); }
      ctx.restore();
    }

    function drawUnderwater() {
      const d = dayFactor;
      const depthDark = Math.min(0.45, cameraY * 0.35);
      const dc = (v) => Math.max(0, Math.round(v * (1 - depthDark)));
      const topCol = [dc(lerp(5, 15, d)), dc(lerp(28, 75, d)), dc(lerp(58, 140, d))];
      const midCol = [dc(lerp(3, 10, d)), dc(lerp(18, 50, d)), dc(lerp(40, 100, d))];
      const deepCol = [dc(lerp(1, 5, d)), dc(lerp(8, 30, d)), dc(lerp(22, 70, d))];
      fillBandGradient(0, h, [[0,...topCol],[0.45,...midCol],[1,...deepCol]], 3.8);

      ctx.save();
      ctx.globalAlpha = lerp(0.02, 0.06, d) * (1 - Math.min(1,cameraY) * 0.8);
      for (let i = 0; i < 4; i++) {
        const rx = w * (0.2 + i * 0.18) + Math.sin(animTime * 0.00008 + i) * 10;
        const rg = ctx.createLinearGradient(rx, 0, rx + 30, h * 0.85);
        rg.addColorStop(0, `rgba(${lerp(120,170,d)}, ${lerp(190,220,d)}, 255, 0.45)`);
        rg.addColorStop(1, 'rgba(120,190,255,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(rx - 18, 0); ctx.lineTo(rx + 24, 0); ctx.lineTo(rx + 70, h * 0.85); ctx.lineTo(rx - 50, h * 0.85);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      ctx.strokeStyle = `rgba(${lerp(120,160,d)}, ${lerp(180,210,d)}, 230, ${lerp(0.08, 0.14, d)})`;
      ctx.lineWidth = 1;
      for (const b of bubbles) {
        const by = h - ((animTime * b.sp + b.y * h) % (h + 30));
        const bx = b.x * w + Math.sin(animTime * 0.0004 + b.ph) * 4;
        ctx.beginPath(); ctx.arc(bx, by, b.r, 0, Math.PI * 2); ctx.stroke();
      }

      const fy = h * 0.86;
      ctx.fillStyle = `rgb(${dc(lerp(3,8,d))}, ${dc(lerp(14,32,d))}, ${dc(lerp(30,65,d))})`;
      ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, fy);
      for (let x = 0; x <= w; x += 48) ctx.lineTo(x, fy + Math.sin(x * 0.012) * 5 - 3);
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

      for (let i = 0; i < 7; i++) {
        const cx = (i / 6) * w * 0.92 + w * 0.04;
        const sway = Math.sin(animTime * 0.00035 + i) * 3;
        drawSeaweed(cx - 26, fy + 2, 60 + (i % 3) * 20, animTime * 0.0004 + i);
        drawCoral(cx, fy + 1, 0.45 + (i % 3) * 0.08, sway);
      }

      if (jelly.active) {
        const jx = ((jelly.x + animTime * jelly.sp * 20) % 1.2 - 0.1) * w;
        const jy = h * jelly.y + Math.sin(animTime*0.0006 + jelly.ph) * 20;
        jelly.sx = jx; jelly.sy = jy;
        drawJelly(jx, jy, 0.8);
        if (jx > w + 40) { jelly.active = false; jelly.next = 20000 + Math.random()*30000; }
      } else {
        jelly.next -= 16;
        if (jelly.next <= 0 && cameraY > 0.25) { jelly.active = true; jelly.x = -0.1; recordDiscovery('jelly'); }
      }

      const sg = ctx.createLinearGradient(0, 0, 0, 140);
      sg.addColorStop(0, `rgb(${topCol[0]},${topCol[1]},${topCol[2]})`);
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, w, 140);

      // hint into abyss
      const abyssHint = ctx.createLinearGradient(0, h - 120, 0, h);
      abyssHint.addColorStop(0, 'rgba(0,0,0,0)');
      abyssHint.addColorStop(1, 'rgba(1,2,12,0.55)');
      ctx.fillStyle = abyssHint; ctx.fillRect(0, h - 120, w, 120);
    }

    function drawAngler(x, y, s, dir = 1) {
      const w0 = 220 * s;
      const h0 = 146 * s;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(dir, 1);
      if (anglerImg.complete && anglerImg.naturalWidth > 0) {
        ctx.drawImage(anglerImg, -w0 / 2, -h0 / 2, w0, h0);
      } else {
        ctx.fillStyle = 'rgba(35,45,70,0.95)';
        ctx.beginPath(); ctx.ellipse(0, 0, 34*s, 22*s, 0, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }

    function drawAbyss() {
      fillBandGradient(0, h, [[0,2,7,19],[0.35,1,3,11],[1,0,1,5]], 2.8);

      const ag = ctx.createRadialGradient(w*0.5, h*0.45, 10, w*0.5, h*0.45, w*0.55);
      ag.addColorStop(0, 'rgba(120,90,210,0.08)');
      ag.addColorStop(0.5, 'rgba(70,50,140,0.03)');
      ag.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ag; ctx.fillRect(0,0,w,h);

      for (const p of abyssParticles) {
        const px = (p.x * w + Math.sin(animTime*0.00015 + p.ph) * 18) % w;
        const py = (p.y * h + animTime * p.sp * 8) % h;
        const a = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(animTime*0.001 + p.ph));
        ctx.fillStyle = `rgba(120,220,255,${a})`;
        ctx.beginPath(); ctx.arc(px, py, p.r, 0, Math.PI*2); ctx.fill();
      }

      // abyss floor / vents
      const fy = h * 0.86;
      ctx.fillStyle = '#05070d';
      ctx.beginPath(); ctx.moveTo(0,h); ctx.lineTo(0,fy);
      for (let x=0; x<=w; x+=40) ctx.lineTo(x, fy + Math.sin(x*0.02)*6 - 4);
      ctx.lineTo(w,h); ctx.closePath(); ctx.fill();

      // vent
      const vx = w * 0.62;
      ctx.fillStyle = '#1a1512';
      ctx.beginPath(); ctx.moveTo(vx-28, fy+2); ctx.lineTo(vx-10, fy-24); ctx.lineTo(vx+10, fy-24); ctx.lineTo(vx+28, fy+2); ctx.closePath(); ctx.fill();
      const vg = ctx.createRadialGradient(vx, fy-20, 0, vx, fy-20, 40);
      vg.addColorStop(0, `rgba(255,120,40,${0.25+0.15*Math.sin(animTime*0.004)})`);
      vg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(vx, fy-20, 40, 0, Math.PI*2); ctx.fill();
      for (const vb of ventBubbles) {
        vb.y -= vb.sp * 16;
        if (vb.y < -0.05) { vb.y = 0.9 + Math.random()*0.1; vb.x = 0.62 + (Math.random()-0.5)*0.05; }
        const bx = vb.x * w; const by = fy - 24 - vb.y * 180;
        ctx.strokeStyle = 'rgba(255,170,120,0.25)'; ctx.beginPath(); ctx.arc(bx, by, vb.r, 0, Math.PI*2); ctx.stroke();
      }

      // anglerfish
      angler.x += angler.sp * angler.dir * 16;
      if (angler.x > 1.15) angler.dir = -1;
      if (angler.x < -0.15) angler.dir = 1;
      const ax = angler.x * w;
      const ay = h * angler.y + Math.sin(animTime*0.0006 + angler.ph) * 26;
      drawAngler(ax, ay, 0.9, angler.dir);

      // abyss creatures (tiny glowing fish)
      for (let i=0;i<8;i++) {
        const fx = ((animTime*0.00002*(i%2?1:-1) + i*0.13) % 1.2 - 0.1) * w;
        const fy = h*(0.2 + (i%5)*0.12) + Math.sin(animTime*0.001+i)*14;
        ctx.fillStyle = `rgba(120,240,210,${0.18 + (i%3)*0.06})`;
        ctx.beginPath(); ctx.ellipse(fx, fy, 7, 3, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(170,255,230,0.6)'; ctx.beginPath(); ctx.arc(fx + (i%2?4:-4), fy-1, 1.2, 0, Math.PI*2); ctx.fill();
      }

      // top fade from deep water
      const topFade = ctx.createLinearGradient(0,0,0,120);
      topFade.addColorStop(0,'rgba(1,4,14,0.95)');
      topFade.addColorStop(1,'rgba(1,4,14,0)');
      ctx.fillStyle = topFade; ctx.fillRect(0,0,w,120);
    }

    function drawTrenches() {
      fillBandGradient(0, h, [[0,0,3,8],[0.4,1,1,10],[1,0,0,3]], 2.5);

      const haze = ctx.createRadialGradient(w*0.5, h*0.5, 20, w*0.5, h*0.5, w*0.75);
      haze.addColorStop(0, 'rgba(70,60,140,0.08)');
      haze.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = haze; ctx.fillRect(0,0,w,h);

      for (const p of trenchParticles) {
        const px = (p.x * w + Math.sin(animTime*0.00012 + p.ph) * 24) % w;
        const py = (p.y * h + animTime * p.sp * 10) % h;
        const a = 0.12 + 0.28 * (0.5 + 0.5 * Math.sin(animTime*0.0009 + p.ph));
        ctx.fillStyle = `rgba(${p.c},${a})`;
        ctx.beginPath(); ctx.arc(px, py, p.r, 0, Math.PI*2); ctx.fill();
      }

      // trench walls
      ctx.fillStyle = '#02030a';
      ctx.beginPath();
      ctx.moveTo(0,0); ctx.lineTo(w*0.22,0);
      ctx.lineTo(w*0.32, h*0.25); ctx.lineTo(w*0.28, h*0.55); ctx.lineTo(w*0.35, h);
      ctx.lineTo(0,h); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w,0); ctx.lineTo(w*0.78,0);
      ctx.lineTo(w*0.68, h*0.25); ctx.lineTo(w*0.72, h*0.55); ctx.lineTo(w*0.65, h);
      ctx.lineTo(w,h); ctx.closePath(); ctx.fill();

      // glowing cracks
      ctx.strokeStyle = 'rgba(120,170,255,0.12)';
      ctx.lineWidth = 2;
      for (let i=0;i<5;i++) {
        const x = w*(0.34 + i*0.08);
        ctx.beginPath(); ctx.moveTo(x, h*(0.1+i*0.03)); ctx.lineTo(x + Math.sin(i)*20, h*(0.85-i*0.05)); ctx.stroke();
      }

      const topFade = ctx.createLinearGradient(0,0,0,120);
      topFade.addColorStop(0,'rgba(0,2,10,0.95)');
      topFade.addColorStop(1,'rgba(0,2,10,0)');
      ctx.fillStyle = topFade; ctx.fillRect(0,0,w,120);
    }

    function drawHadal() {
      fillBandGradient(0, h, [[0,0,0,5],[0.5,2,0,6],[1,0,0,0]], 2.5);

      const haze = ctx.createRadialGradient(w*0.5, h*0.6, 20, w*0.5, h*0.6, w*0.8);
      haze.addColorStop(0, 'rgba(130,40,80,0.07)');
      haze.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = haze; ctx.fillRect(0,0,w,h);

      // hadal floor
      const fy = h * 0.88;
      ctx.fillStyle = '#030206';
      ctx.beginPath(); ctx.moveTo(0,h); ctx.lineTo(0,fy);
      for (let x=0; x<=w; x+=30) ctx.lineTo(x, fy + Math.sin(x*0.025 + 1)*5 - 3);
      ctx.lineTo(w,h); ctx.closePath(); ctx.fill();

      for (const p of hadalSpores) {
        const px = (p.x * w + Math.sin(animTime*0.00008 + p.ph) * 16) % w;
        const py = (p.y * h + Math.sin(animTime*0.0002 + p.ph)*10);
        const a = 0.08 + 0.22 * (0.5 + 0.5 * Math.sin(animTime*0.0007 + p.ph));
        ctx.fillStyle = `rgba(255,120,170,${a})`;
        ctx.beginPath(); ctx.arc(px, py, p.r, 0, Math.PI*2); ctx.fill();
      }

      // weird bone-like ribs
      ctx.strokeStyle = 'rgba(90,70,90,0.22)';
      ctx.lineWidth = 5;
      for (let i=0;i<6;i++) {
        const x = w*(0.12 + i*0.15);
        ctx.beginPath();
        ctx.moveTo(x, fy);
        ctx.quadraticCurveTo(x + 30*Math.sin(i), h*0.65, x + 10, h*0.52);
        ctx.stroke();
      }

      const topFade = ctx.createLinearGradient(0,0,0,120);
      topFade.addColorStop(0,'rgba(2,0,6,0.95)');
      topFade.addColorStop(1,'rgba(2,0,6,0)');
      ctx.fillStyle = topFade; ctx.fillRect(0,0,w,120);
    }

    function drawVoidEntityAndDialogue() {
      const cx = w * voidEntity.x;
      const cy = h * 0.35;
      voidEntity.screenX = cx; voidEntity.screenY = cy;
      voidEntity.pulse = 0.5 + 0.5 * Math.sin(animTime * 0.0012);
      const pulse = voidEntity.pulse;
      const baseR = Math.min(w, h) * 0.12;
      voidEntity.r = baseR * 0.7;

      // subtle presence only - no orb/halo visuals

      if (voidDialogue && isAtBottom()) {
        const text = voidDialogue.text;
        ctx.save();
        const fontSize = w < 520 ? 12 : 14;
        ctx.font = fontSize + 'px Consolas, monospace';
        const padX = 12, padY = 10, maxW = Math.min(w - 24, 620);
        const words = text.split(' ');
        const lines = [];
        let line = '';
        for (const word of words) {
          const test = line ? line + ' ' + word : word;
          if (ctx.measureText(test).width > maxW - padX * 2 && line) { lines.push(line); line = word; }
          else line = test;
        }
        if (line) lines.push(line);
        // hard-wrap any single long token
        for (let i = 0; i < lines.length; i++) {
          while (ctx.measureText(lines[i]).width > maxW - padX * 2 && lines[i].length > 8) {
            let cut = lines[i].length - 1;
            while (cut > 1 && ctx.measureText(lines[i].slice(0, cut)).width > maxW - padX * 2) cut--;
            lines.splice(i + 1, 0, lines[i].slice(cut));
            lines[i] = lines[i].slice(0, cut);
          }
        }
        const lh = fontSize + 5;
        const boxW = Math.min(maxW, Math.max(120, ...lines.map(l => ctx.measureText(l).width)) + padX * 2);
        const boxH = lines.length * lh + padY * 2;
        const bx = Math.max(12, Math.min(w - boxW - 12, cx - boxW / 2));
        const topSafe = isFacilityLayer() ? h * 0.18 : h * 0.08;
        const by = Math.max(12, Math.min(h - boxH - 12, topSafe));
        ctx.fillStyle = 'rgba(5,14,30,0.88)';
        ctx.strokeStyle = 'rgba(120,180,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 10); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(220,240,255,0.95)';
        ctx.textBaseline = 'top';
        lines.forEach((l, i) => ctx.fillText(l, bx + padX, by + padY + i * lh));
        ctx.restore();
      }
    }

    function drawVoid() {
      fillBandGradient(0, h, [[0,0,0,0],[0.5,1,0,2],[1,0,0,0]], 2.2);

      // distant void glow (restored)
      const glow = ctx.createRadialGradient(w*0.5, h*0.5, 10, w*0.5, h*0.5, w*0.6);
      glow.addColorStop(0, 'rgba(120,90,255,0.06)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow; ctx.fillRect(0,0,w,h);

      for (const e of voidEyes) {
        const blink = Math.sin(animTime*0.0008 + e.blink);
        if (blink < -0.92) continue;
        const ex = e.x * w + Math.sin(animTime*0.00005 + e.ph)*20;
        const ey = e.y * h + Math.sin(animTime*0.00012 + e.ph)*8;
        const a = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(animTime*0.001 + e.ph));
        ctx.fillStyle = `rgba(180,140,255,${a})`;
        ctx.beginPath(); ctx.ellipse(ex-4, ey, 2.2, 1.2, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(ex+4, ey, 2.2, 1.2, 0, 0, Math.PI*2); ctx.fill();
      }

      drawVoidEntityAndDialogue();

      // bottom nothingness (restored)
      const fade = ctx.createLinearGradient(0,h-120,0,h);
      fade.addColorStop(0,'rgba(0,0,0,0)');
      fade.addColorStop(1,'rgba(0,0,0,0.7)');
      ctx.fillStyle = fade; ctx.fillRect(0,h-120,w,120);

      const topFade = ctx.createLinearGradient(0,0,0,120);
      topFade.addColorStop(0,'rgba(0,0,0,0.95)');
      topFade.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle = topFade; ctx.fillRect(0,0,w,120);
    }

    function drawFacility() {
      // The Deep Blue - submarine-ish facility controlling the ocean
      fillBandGradient(0, h, [[0,2,6,16],[0.4,4,12,24],[0.75,3,10,20],[1,1,4,10]]);

      // distant pipes/mechanical backdrop
      ctx.save();
      ctx.strokeStyle = 'rgba(70,120,160,0.12)'; ctx.lineWidth = 8;
      for (let i=0;i<6;i++){ const x=w*(0.08+i*0.17); ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(90,150,190,0.08)'; ctx.lineWidth = 3;
      for (let y=h*0.1;y<h;y+=h*0.12){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
      ctx.restore();

      // main hull
      const hullY = h*0.56, hullH = h*0.24;
      ctx.fillStyle = 'rgba(18,38,62,0.78)';
      roundRectPath(ctx, w*0.06, hullY, w*0.88, hullH, 28); ctx.fill();
      ctx.strokeStyle = 'rgba(100,170,220,0.2)'; ctx.lineWidth = 1.5; ctx.stroke();
      // top conning structure
      ctx.fillStyle = 'rgba(24,46,72,0.82)';
      roundRectPath(ctx, w*0.28, h*0.44, w*0.44, h*0.16, 20); ctx.fill();
      ctx.strokeStyle = 'rgba(120,190,240,0.18)'; ctx.stroke();

      // porthole lights
      for (let i=0;i<14;i++){
        const px=w*0.1+i*w*0.058, py=hullY+hullH*0.45;
        const pulse = 0.4+0.6*(0.5+0.5*Math.sin(animTime*0.002+i*0.7));
        const on = !facility.complete || i%3!==0;
        ctx.fillStyle = on ? `rgba(140,220,255,${0.25+pulse*0.45})` : 'rgba(60,90,110,0.2)';
        ctx.beginPath(); ctx.arc(px,py,8,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='rgba(160,210,240,0.25)'; ctx.stroke();
      }

      // big core window
      const cx=w*0.5, cy=h*0.52;
      const coreG = ctx.createRadialGradient(cx,cy,10,cx,cy,w*0.14);
      coreG.addColorStop(0, facility.complete ? 'rgba(120,255,180,0.10)' : 'rgba(120,180,255,0.10)');
      coreG.addColorStop(0.6, facility.complete ? 'rgba(60,180,120,0.04)' : 'rgba(60,120,200,0.04)');
      coreG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle=coreG; ctx.beginPath(); ctx.ellipse(cx,cy,w*0.14,h*0.075,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=facility.complete?'rgba(140,255,190,0.28)':'rgba(130,210,255,0.22)'; ctx.lineWidth=1.5; ctx.stroke();

      // wipeout supply tank (objective target)
      const tx=w*0.5, ty=h*0.67;
      ctx.fillStyle = facility.complete ? 'rgba(40,100,70,0.55)' : 'rgba(90,30,40,0.55)';
      roundRectPath(ctx, tx-82, ty-30, 164, 60, 10); ctx.fill();
      ctx.strokeStyle = facility.complete ? 'rgba(120,255,170,0.65)' : 'rgba(255,110,130,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(5,14,30,0.45)';
      roundRectPath(ctx, tx-72, ty-10, 144, 24, 6); ctx.fill();
      ctx.fillStyle = facility.complete ? 'rgba(180,255,210,0.96)' : 'rgba(255,200,210,0.95)';
      ctx.font='12px Consolas, monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(facility.complete ? 'SUPPLY NEUTRALIZED' : 'WIPEOUT SUPPLY', tx, ty+2);
      ctx.textBaseline='alphabetic';

      // caution stripes
      if (!facility.complete) {
        ctx.save(); ctx.globalAlpha=0.25; ctx.fillStyle='#d8c04a';
        for(let i=0;i<20;i++) ctx.fillRect(w*0.08+i*28, hullY+hullH-10, 14, 10);
        ctx.restore();
      }

      drawVoidEntityAndDialogue();

      // puzzle/encounter UI
      ctx.save();
      const small = w < 560;
      ctx.textAlign='center';
      ctx.fillStyle='rgba(210,235,255,0.96)';
      ctx.font=(small ? '14px' : '18px') + ' Consolas, monospace';
      ctx.fillText(small ? 'DEEP BLUE CORE' : 'THE DEEP BLUE — facility core', w*0.5, h*0.1);
      ctx.font=(small ? '12px' : '13px') + ' Consolas, monospace';
      ctx.fillStyle = facility.complete ? 'rgba(150,255,195,0.95)' : 'rgba(255,200,150,0.92)';
      ctx.fillText(facility.complete ? 'supply neutralized' : 'stop the wipeout supply', w*0.5, h*0.135);

      const py = h*0.86;
      const boxW = Math.min(140, Math.max(84, w * 0.28));
      const boxH = small ? 30 : 32;
      const gap = Math.max(8, w * 0.02);
      const total = boxW * 3 + gap * 2;
      const startX = (w - total) / 2 + boxW / 2;
      const boxes = [
        {x:startX, done:facility.puzzleA, label:facility.puzzleA?'✓ sealed':'valve'},
        {x:startX + boxW + gap, done:facility.puzzleB, label:facility.puzzleB?'✓ code':'code'},
        {x:startX + (boxW + gap) * 2, done:facility.encounterDone, label:facility.encounterDone?'✓ bypassed':'guard'}
      ];
      for (const b of boxes){
        ctx.fillStyle = b.done ? 'rgba(40,120,80,0.32)' : 'rgba(20,50,80,0.5)';
        ctx.strokeStyle = b.done ? 'rgba(120,255,170,0.72)' : 'rgba(130,200,255,0.62)';
        ctx.lineWidth = 1.5;
        roundRectPath(ctx, b.x - boxW/2, py, boxW, boxH, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = b.done ? 'rgba(180,255,210,0.96)' : 'rgba(220,240,255,0.94)';
        ctx.font = (small ? '11px' : '13px') + ' Consolas, monospace';
        ctx.fillText(b.label, b.x, py + (small ? 19 : 20));
      }
      if (facility.complete) {
        ctx.fillStyle='rgba(150,255,200,0.96)';
        ctx.font=(small ? '13px' : '15px') + ' Consolas, monospace';
        ctx.fillText('the ocean is safe... for now.', w*0.5, h*0.93);
      }
      ctx.restore();
    }

    function roundRectPath(c, x, y, rw, rh, r) {
      r = Math.min(r, rw/2, rh/2);
      c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+rw,y,x+rw,y+rh,r); c.arcTo(x+rw,y+rh,x,y+rh,r); c.arcTo(x,y+rh,x,y,r); c.arcTo(x,y,x+rw,y,r); c.closePath();
    }

    function render(ts) {
      t = ts;
      dt = Math.min(0.05, (ts - (lastT || ts)) / 1000);
      lastT = ts;
      if (blackoutActive) {
        const stillOut = updateBlackout();
        if (stillOut) {
          rafId = requestAnimationFrame(render);
          return;
        }
      }
      simTime += dt * 1000;
      motionMul = reducedMotion ? 0.25 : 1;
      animTime += dt * 1000 * motionMul;
      const stockWindow = isDaytime() ? 'day' : 'night';
      if (stockWindow !== lastStockWindow) {
        lastStockWindow = stockWindow;
        if (shopModal && shopModal.classList.contains('open')) renderShop();
        if (tabletModal && tabletModal.classList.contains('open')) renderTablet();
      }

      // weather: manual or dynamic
      if (weatherMode === 'clear') weatherTarget = 0;
      else if (weatherMode === 'rain') weatherTarget = 1;
      else if (weatherMode === 'storm') weatherTarget = 1.8;
      else if (weatherMode === 'snow') weatherTarget = 0.9;
      else {
        const phase = getCyclePhase();
        const night = Math.cos(phase * Math.PI * 2) < -0.1 ? 1 : 0;
        const wave = (Math.sin(simTime * 0.00008) + 1) / 2;
        weatherTarget = night * 0.45 + wave * 0.9;
      }
      weatherIntensity += (weatherTarget - weatherIntensity) * Math.min(1, dt * 0.8);
      const weatherStep = dt * 1000 * motionMul;
      rainPhase += weatherStep * (0.35 + weatherIntensity * 0.35);
      snowPhase += weatherStep * (0.03 + weatherIntensity * 0.025) * 60;
      viewPush *= Math.pow(0.001, dt); // decay fast

      // lightning
      lightning = Math.max(0, lightning - dt * 2.2);
      nextLightning -= dt * 1000;
      if (weatherIntensity > 1.2 && nextLightning <= 0 && weatherMode !== 'snow') {
        lightning = 0.8 + Math.random() * 0.6;
        nextLightning = (3500 + Math.random() * 7000) / Math.max(0.5, weatherIntensity - 0.4);
        sfxThunder();
        recordDiscovery('storm');
      }

      if (camAnim) {
        const p = Math.min(1, (ts - camAnim.start) / camAnim.dur);
        cameraY = camAnim.from + (camAnim.to - camAnim.from) * easeInOutCubic(p);
        if (p >= 1) {
          camAnim = null;
          if (cameraY > 0.95) recordDiscovery('deep');
          if (cameraY > 1.95) recordDiscovery('abyss');
          if (cameraY > 2.95) recordDiscovery('trenches');
          if (cameraY > 3.95) recordDiscovery('hadal');
          if (cameraY > 4.95) recordDiscovery('void');
        }
      }
      updateVoidQuest();
      updateOxygen(dt);
      autoMineTick(dt);
      miningHudClock += dt * 1000;
      if (miningHudClock >= 500) { miningHudClock = 0; syncMiningHud(); }
      updateBoss(dt * 1000);
      if (canStartOctopus()) startVoidOctopus();

      ctx.clearRect(0, 0, w, h);
      const camPx = cameraY * h;
      ctx.save();
      const pushScale = 1 + viewPush * 0.035;
      const pushX = (w / 2) * (1 - pushScale);
      const pushY = (h * 0.55) * (1 - pushScale) - viewPush * h * 0.015;
      ctx.translate(pushX, pushY - camPx);
      ctx.scale(pushScale, pushScale);

      drawSky();

      const horizon = h * 0.58;
      // soft horizon light band (reference: bright seam where sky meets water)
      const hb = ctx.createLinearGradient(0, horizon - 70, 0, horizon + 46);
      const hcol = dayFactor > 0.4 ? '190,225,255' : '120,175,235';
      hb.addColorStop(0, `rgba(${hcol},0)`);
      hb.addColorStop(0.62, `rgba(${hcol},${(0.16 + dayFactor * 0.16) * (1 - weatherIntensity * 0.35)})`);
      hb.addColorStop(1, `rgba(${hcol},0)`);
      ctx.fillStyle = hb;
      ctx.fillRect(0, horizon - 70, w, 116);

      const d = dayFactor;
      const dark = Math.min(0.35, weatherIntensity * 0.12);
      const wc = (r,g,b,a) => `rgba(${Math.round(r*(1-dark))}, ${Math.round(g*(1-dark))}, ${Math.round(b*(1-dark))}, ${a})`;
      const waveT = simTime * motionMul;
      const layers = [
        { base: horizon + 14, amp: 8,  freq: 0.009,  phase: waveT * 0.00042,        colorTop: wc(lerp(18,65,d), lerp(55,120,d), lerp(105,175,d), 0.55), colorBottom: wc(lerp(8,30,d), lerp(30,78,d), lerp(70,130,d), 0.65), alpha: 1, stroke: `rgba(160,225,255,${lerp(0.08,0.14,d)})` },
        { base: horizon + 30, amp: 12, freq: 0.0105, phase: waveT * 0.00058 + 1.2, colorTop: wc(lerp(12,48,d), lerp(48,108,d), lerp(96,170,d), 0.68),  colorBottom: wc(lerp(6,22,d), lerp(25,68,d), lerp(58,118,d), 0.78), alpha: 1, stroke: `rgba(160,225,255,${lerp(0.10,0.16,d)})` },
        { base: horizon + 52, amp: 16, freq: 0.0092, phase: -waveT * 0.0005 + 2.1, colorTop: wc(lerp(8,32,d),  lerp(38,92,d),  lerp(82,156,d), 0.82),  colorBottom: wc(lerp(4,14,d), lerp(18,56,d), lerp(46,102,d), 0.9),  alpha: 1, stroke: `rgba(170,230,255,${lerp(0.12,0.18,d)})` },
        { base: horizon + 80, amp: 22, freq: 0.0078, phase: waveT * 0.00068 + 0.4, colorTop: wc(lerp(5,20,d),  lerp(28,76,d),  lerp(66,140,d), 0.92),  colorBottom: wc(lerp(2,8,d),  lerp(12,44,d), lerp(34,86,d), 0.97),  alpha: 1, stroke: `rgba(180,235,255,${lerp(0.14,0.20,d)})` },
        { base: horizon + 118,amp: 30, freq: 0.0064, phase: -waveT * 0.00056 + 3.4,colorTop: wc(lerp(3,12,d),  lerp(20,60,d),  lerp(52,122,d), 0.98),  colorBottom: wc(lerp(1,4,d),  lerp(7,30,d),  lerp(22,68,d), 1),     alpha: 1, stroke: `rgba(185,238,255,${lerp(0.10,0.16,d)})` }
      ];

      ctx.save();
      if (isShore()) {
        ctx.beginPath(); ctx.rect(0, 0, w, shoreSandTop()); ctx.clip();
      }
      drawMist();
      for (const layer of layers) drawWave(layer);
      ctx.restore();
      if (isShore()) {
        drawShoreScene();
      } else {
        drawSurfaceLife();
        drawEquippedSurface();
        if (perspective === 1) drawIcebergs();
        if (perspective === 2) drawSurfacePerspective2();
      }
      ctx.save();
      if (isShore()) {
        ctx.beginPath(); ctx.rect(0, 0, w, shoreSandTop()); ctx.clip();
      }
      drawRipplesAndBubbles();
      ctx.restore();
      drawMachineRocks();
      drawOreChest();
      drawWeather();

      ctx.save();
      if (isShore()) {
        ctx.beginPath(); ctx.rect(0, 0, w, shoreSandTop()); ctx.clip();
      }
      ctx.save();
      ctx.translate(0, h);
      drawUnderwater();
      if (cameraY < 1.5) drawEquippedUnderwater();
      if (!isFacilityLayer()) drawOreLayer(1);
      if (perspective === 1) {
        ctx.save();
        ctx.fillStyle='rgba(80,180,140,0.07)'; ctx.fillRect(0,0,w,h);
        for (let i=0;i<14;i++){ const kx=i*w/13; const sway=Math.sin(animTime*0.0008+i)*18; ctx.strokeStyle='rgba(60,170,110,0.35)'; ctx.lineWidth=6; ctx.beginPath(); ctx.moveTo(kx,h); ctx.quadraticCurveTo(kx+sway,h*0.65,kx-sway*0.6,h*0.28); ctx.stroke(); }
        ctx.restore();
      } else if (perspective === 2) {
        ctx.save();
        ctx.fillStyle='rgba(30,60,120,0.10)'; ctx.fillRect(0,0,w,h);
        ctx.strokeStyle='rgba(120,180,255,0.12)'; ctx.lineWidth=1;
        for(let i=0;i<8;i++){ const rx=w*(0.1+i*0.12), ry=h*(0.35+Math.sin(i)*0.15); ctx.beginPath(); ctx.ellipse(rx,ry,90,45,0,0,Math.PI*2); ctx.stroke(); }
        for(let i=0;i<18;i++){ const sx=(i*97%100)/100*w, sy=h*(0.55+(i%5)*0.07); ctx.fillStyle='rgba(180,220,255,0.08)'; ctx.beginPath(); ctx.arc(sx,sy,2+(i%3),0,Math.PI*2); ctx.fill(); }
        ctx.restore();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(0, h * 2);
      drawAbyss();
      if (cameraY >= 1.5 && cameraY < 2.5) drawEquippedUnderwater();
      if (!isFacilityLayer()) drawOreLayer(2);
      if (perspective === 1) {
        ctx.save();
        ctx.fillStyle='rgba(255,80,30,0.04)'; ctx.fillRect(0,0,w,h);
        for (let i=0;i<6;i++){ const vx=w*(0.1+i*0.16), vy=h*0.78; const g=ctx.createRadialGradient(vx,vy-h*0.1,0,vx,vy-h*0.1,80); g.addColorStop(0,`rgba(255,120,50,${0.12+0.05*Math.sin(animTime*0.003+i)})`); g.addColorStop(1,'rgba(255,120,50,0)'); ctx.fillStyle=g; ctx.fillRect(vx-80,vy-160,160,160); ctx.strokeStyle='rgba(120,220,255,0.1)'; ctx.beginPath(); ctx.arc(vx,vy-h*0.2,60+i*8,0,Math.PI*2); ctx.stroke(); }
        ctx.restore();
      } else if (perspective === 2) {
        ctx.save();
        ctx.fillStyle='rgba(120,40,255,0.05)'; ctx.fillRect(0,0,w,h);
        for(let i=0;i<10;i++){ const x=w*(i/9), y=h*(0.25+(i%4)*0.15); const r=18+ (i%3)*10; const g=ctx.createRadialGradient(x,y,0,x,y,r*3); g.addColorStop(0,'rgba(170,120,255,0.15)'); g.addColorStop(1,'rgba(170,120,255,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r*3,0,Math.PI*2); ctx.fill(); ctx.fillStyle='rgba(210,170,255,0.35)'; ctx.beginPath(); ctx.arc(x,y,r*0.25,0,Math.PI*2); ctx.fill(); }
        ctx.restore();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(0, h * 3);
      drawTrenches();
      if (cameraY >= 2.5 && cameraY < 3.5) drawEquippedUnderwater();
      if (!isFacilityLayer()) drawOreLayer(3);
      if (perspective === 1) {
        ctx.save();
        ctx.fillStyle='rgba(60,40,110,0.15)'; ctx.fillRect(0,0,w,h);
        ctx.fillStyle='rgba(10,8,30,0.55)';
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w*0.18,0); ctx.lineTo(w*0.28,h*0.5); ctx.lineTo(w*0.16,h); ctx.lineTo(0,h); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(w,0); ctx.lineTo(w*0.82,0); ctx.lineTo(w*0.72,h*0.5); ctx.lineTo(w*0.84,h); ctx.lineTo(w,h); ctx.closePath(); ctx.fill();
        ctx.strokeStyle='rgba(160,140,255,0.12)'; for(let i=0;i<10;i++){ ctx.beginPath(); ctx.moveTo(w*0.28,h*i/10); ctx.lineTo(w*0.72,h*i/10); ctx.stroke(); }
        ctx.restore();
      } else if (perspective === 2) {
        ctx.save();
        ctx.fillStyle='rgba(15,10,40,0.18)'; ctx.fillRect(0,0,w,h);
        ctx.strokeStyle='rgba(100,220,255,0.08)'; ctx.lineWidth=2;
        for(let i=0;i<12;i++){ const x=w*(i/11); ctx.beginPath(); ctx.moveTo(x,h); ctx.lineTo(x+Math.sin(i+animTime*0.0005)*40,h*0.2); ctx.stroke(); }
        ctx.fillStyle='rgba(180,220,255,0.05)'; for(let i=0;i<40;i++){ ctx.fillRect((i*53%w), (i*97%h), 2, 2); }
        ctx.restore();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(0, h * 4);
      drawHadal();
      if (cameraY >= 3.5 && cameraY < 4.5) drawEquippedUnderwater();
      if (!isFacilityLayer()) drawOreLayer(4);
      if (perspective === 1) {
        ctx.save();
        ctx.fillStyle='rgba(255,40,100,0.05)'; ctx.fillRect(0,0,w,h);
        ctx.strokeStyle='rgba(255,100,150,0.18)'; ctx.lineWidth=2;
        for(let i=0;i<5;i++){ const fx=w*(0.15+i*0.18); ctx.beginPath(); ctx.moveTo(fx,h*0.9); ctx.lineTo(fx+20,h*0.65); ctx.lineTo(fx-10,h*0.45); ctx.stroke(); }
        const rg=ctx.createRadialGradient(w*0.5,h*0.75,10,w*0.5,h*0.75,w*0.4); rg.addColorStop(0,'rgba(255,60,120,0.08)'); rg.addColorStop(1,'rgba(255,60,120,0)'); ctx.fillStyle=rg; ctx.fillRect(0,0,w,h);
                // sunken wooden ship
        const sx=w*0.52, sy=h*0.8, sw=Math.min(w*0.34, 520), sh=sw*0.22;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(-0.22);
        // seabed shadow
        ctx.fillStyle='rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.ellipse(0, sh*0.55, sw*0.52, sh*0.22, 0, 0, Math.PI*2); ctx.fill();
        // hull
        ctx.fillStyle='rgba(36,24,16,0.9)';
        ctx.beginPath();
        ctx.moveTo(-sw*0.52, -sh*0.05);
        ctx.quadraticCurveTo(-sw*0.56, sh*0.28, -sw*0.3, sh*0.48);
        ctx.lineTo(sw*0.28, sh*0.42);
        ctx.quadraticCurveTo(sw*0.52, sh*0.34, sw*0.58, sh*0.05);
        ctx.lineTo(sw*0.5, -sh*0.12);
        ctx.lineTo(-sw*0.46, -sh*0.18);
        ctx.closePath();
        ctx.fill();
        // deck rim
        ctx.fillStyle='rgba(58,40,28,0.95)';
        ctx.beginPath();
        ctx.moveTo(-sw*0.46, -sh*0.18);
        ctx.lineTo(sw*0.5, -sh*0.12);
        ctx.lineTo(sw*0.46, -sh*0.02);
        ctx.lineTo(-sw*0.42, -sh*0.08);
        ctx.closePath();
        ctx.fill();
        // hull planks
        ctx.strokeStyle='rgba(95,68,45,0.28)';
        ctx.lineWidth=Math.max(1, sw*0.004);
        for(let i=-4;i<=4;i++){
          const px=i*sw*0.095;
          ctx.beginPath(); ctx.moveTo(px-sw*0.02,-sh*0.14); ctx.lineTo(px+sw*0.02,sh*0.42); ctx.stroke();
        }
        for(let i=0;i<4;i++){
          const yy=-sh*0.02 + i*sh*0.13;
          ctx.beginPath(); ctx.moveTo(-sw*0.48,yy-i*0.8); ctx.quadraticCurveTo(0,yy+sh*0.04,sw*0.52,yy-sh*0.02); ctx.stroke();
        }
        // broken mast
        ctx.save();
        ctx.translate(-sw*0.08, -sh*0.12);
        ctx.rotate(-0.08);
        ctx.fillStyle='rgba(52,36,24,0.95)';
        ctx.fillRect(-sw*0.012,-sh*1.55, sw*0.024, sh*1.55);
        ctx.fillStyle='rgba(45,31,21,0.9)';
        ctx.fillRect(sw*0.12,-sh*1.05, sw*0.02, sh*1.0);
        // yardarm
        ctx.fillRect(-sw*0.2,-sh*1.22, sw*0.34, sh*0.045);
        // torn sail
        ctx.fillStyle='rgba(150,165,180,0.12)';
        ctx.beginPath();
        ctx.moveTo(-sw*0.18,-sh*1.18);
        ctx.lineTo(sw*0.12,-sh*1.18);
        ctx.lineTo(sw*0.08,-sh*0.62);
        ctx.lineTo(-sw*0.02,-sh*0.45);
        ctx.lineTo(-sw*0.16,-sh*0.72);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle='rgba(190,205,220,0.12)';
        ctx.lineWidth=1;
        ctx.stroke();
        ctx.restore();
        // bow break / hole
        ctx.fillStyle='rgba(5,8,14,0.45)';
        ctx.beginPath(); ctx.ellipse(sw*0.18, sh*0.12, sw*0.08, sh*0.09, 0.2, 0, Math.PI*2); ctx.fill();
        // cabin stub
        ctx.fillStyle='rgba(44,31,22,0.88)';
        ctx.fillRect(sw*0.2,-sh*0.34, sw*0.16, sh*0.24);
        ctx.fillStyle='rgba(10,12,18,0.35)';
        ctx.fillRect(sw*0.24,-sh*0.28, sw*0.04, sh*0.08);
        ctx.restore();
        ctx.restore();
      } else if (perspective === 2) {
        ctx.save();
        ctx.fillStyle='rgba(0,0,0,0.22)'; ctx.fillRect(0,0,w,h);
        for(let i=0;i<6;i++){ const cx=w*(0.15+i*0.14), cy=h*(0.6+Math.sin(i)*0.08); ctx.strokeStyle='rgba(255,120,160,0.12)'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(cx,cy,40,0,Math.PI*2); ctx.stroke(); ctx.fillStyle='rgba(255,80,130,0.05)'; ctx.beginPath(); ctx.arc(cx,cy,40,0,Math.PI*2); ctx.fill(); }
        ctx.restore();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(0, h * 5);
      drawVoid();
      if (cameraY >= 4.5 && cameraY < 5.5) drawEquippedUnderwater();
      if (!isFacilityLayer()) drawOreLayer(5);
      if (perspective === 1) {
        ctx.save();
        ctx.fillStyle='rgba(100,140,255,0.05)'; ctx.fillRect(0,0,w,h);
        ctx.strokeStyle='rgba(120,180,255,0.14)'; ctx.lineWidth=1;
        for(let y=h*0.2;y<h;y+=60){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
        for(let x=0;x<w;x+=80){ ctx.beginPath(); ctx.moveTo(x,h*0.2); ctx.lineTo(x,h); ctx.stroke(); }
        ctx.fillStyle='rgba(120,200,255,0.08)'; ctx.fillRect(w*0.1,h*0.35,w*0.8,h*0.35);
        ctx.strokeStyle='rgba(140,210,255,0.25)'; ctx.strokeRect(w*0.1,h*0.35,w*0.8,h*0.35);
        ctx.restore();
      } else if (perspective === 2) {
        // no extra lines/artifacts
      }
      ctx.restore();

      if (quest.unlockedDeep && !isDeepSealed()) {
        ctx.save();
        ctx.translate(0, h * 6);
        drawFacility();
        ctx.restore();
      }

      if (window.OceanFish) window.OceanFish.drawInWorld(ctx, { w, h, animTime, dt, reducedMotion, maxDepth: currentBottomDepth() + 1 });
      drawDeepClaws();
      drawMiningFx(dt * 1000);

      ctx.restore();
      ctx.restore();

      drawBossFight();

      // photo mode frame (none) + vignette
      const vg = ctx.createRadialGradient(w * 0.5, h * 0.55, Math.min(w,h) * 0.2, w * 0.5, h * 0.6, Math.max(w,h) * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, `rgba(0,0,0,${lerp(0.28,0.14,d) + cameraY*0.18 + weatherIntensity*0.05})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      updateAudioMix();
      if (!crashed && !corrupted) rafId = requestAnimationFrame(render);
    }
    if (!corrupted) requestAnimationFrame(render);

    function depthLabel(target) {
      if (target <= 0.01) return 'surface';
      if (target < 1.5) return 'underwater';
      if (target < 2.5) return 'abyss';
      if (target < 3.5) return 'trenches';
      if (target < 4.5) return 'hadal';
      if (target < 5.5) return 'the void';
      return quest && quest.unlockedDeep ? 'the deep blue facility' : 'beyond';
    }
    function syncSettingsUI() {
      setSound.checked = soundEnabled;
      setWeather.value = weatherMode;
      setMotion.checked = reducedMotion;
      setPhoto.checked = photoMode;
      const bottomDepth = currentBottomDepth();
      const atFloor = cameraTarget >= bottomDepth - 0.01;
      const navLocked = navOnCooldown();
      goDownBtn.textContent = isShore() ? 'shore' : atFloor ? (isDeepSealed() ? 'sealed' : 'bottom') : (cameraTarget >= 0.99 ? 'go deeper' : 'go down');
      goUpBtn.textContent = cameraTarget <= 0.01 ? 'surface' : 'go up';
      goDownBtn.disabled = isShore() || atFloor || navLocked;
      goUpBtn.disabled = cameraTarget <= 0.01 || navLocked;
      goDownBtn.style.opacity = goDownBtn.disabled ? '0.45' : '1';
      goUpBtn.style.opacity = goUpBtn.disabled ? '0.45' : '1';
      const facilityNow = isFacilityLayer();
      goForwardBtn.disabled = facilityNow || perspective >= MAX_PERSPECTIVE || navLocked;
      goBackBtn.disabled = facilityNow || perspective <= 0 || navLocked;
      goForwardBtn.style.opacity = goForwardBtn.disabled ? '0.45' : '1';
      goBackBtn.style.opacity = goBackBtn.disabled ? '0.45' : '1';
      goForwardBtn.textContent = perspective === 2 ? 'go to shore' : 'go forwards';
      goBackBtn.textContent = perspective === 3 ? 'leave shore' : 'go back';
      document.body.classList.toggle('photo-mode', photoMode);
      renderDiscoveries();
    }

    // --- feedback ---
    const FEEDBACK_REPO = 'iluxz/ocean'; // change when repo exists
    const PROFANITY = ["arse","arsehole","ass","asses","asshat","asshole","assmunch","bastard","bastards","big black cock","bitch","bitches","blowjob","bollock","bollocks","brainfuck","bugger","bullshit","chicken shit","ching","ching chong","chong","clusterfuck","cock","cocks","cocksucker","coonass","cornhole","cunt","cunted","cunts","dick","dickhead","dicks","dumbass","enshittification","faggot","faggots","feck","fuck","fuck her right in the pussy","fuck joe biden","fuck, marry, kill","fucked","fucker","fuckers","fuckery","fucking","fucks","grab 'em by the pussy","healslut","hori","horseshit","jesus fucking christ","kike","motherfucker","motherfuckers","nigga","niggas","nigger","niggerhead","niggers","pajeet","paki","polaco","poofter","prick","pricks","pussy","ratfucking","retard","retards","russian warship, go fuck yourself","serving cunt","shit","shit happens","shithouse","shitposting","shits","shitter","shitty","shut the fuck up","shut the hell up","slut","sluts","son of a bitch","spic","twat","twats","unclefucker","wank","wanker","wanking","wetback","whore","whores"];
    const PROFANITY_RE = new RegExp(`\\b(${PROFANITY.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')).join('|')})\\b`, 'i');

    function likelyNonEnglish(text) {
      const t = (text || '').trim();
      if (!t) return false;
      if (/[^\x00-\x7F]/.test(t)) return true;
      const words = t.toLowerCase().match(/[a-z']+/g) || [];
      const common = new Set(['the','a','an','is','it','you','i','to','and','for','this','that','not','with','on','of','but','are','was','be','my','me','so','if','or','in','broken','bug','add','please','make','game','sound','music','weather','day','night','water','ocean']);
      const hits = words.filter(w => common.has(w)).length;
      return words.length >= 3 && hits === 0;
    }

    async function translateToEnglish(text) {
      const raw = (text || '').trim();
      if (!raw || !likelyNonEnglish(raw)) return raw;
      try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(raw.slice(0, 500))}&langpair=autodetect|en`;
        const res = await fetch(url);
        if (!res.ok) return raw;
        const data = await res.json();
        const translated = data && data.responseData && data.responseData.translatedText;
        if (typeof translated === 'string' && translated.trim()) return translated.trim();
      } catch (_) {}
      return raw;
    }

    async function classifyFeedback(text) {
      const raw = (text || '').trim();
      const translated = await translateToEnglish(raw);
      const t = translated.toLowerCase();
      const rules = {
        harassment: [/\b(kill|die|kys|suicide|threat|bomb|shoot|stab|rape|nazi|dox)\b/, /\bi know where you live\b/, /\b(fuck(ing)? you|you suck|moron|idiot|stfu|shut up|hate you|dumbass|asshole|bitch)\b/, PROFANITY_RE],
        spam: [/(.)\1{7,}/, /\b(buy now|free money|crypto|casino|viagra|nft promo)\b/, /^https?:\/\/\S+$/],
        bug: [/\b(bug|broken|crash|error|glitch|not working|doesn'?t work|issue|lag|freeze|stuck|black screen|overlap|flicker|audio bug|sound bug)\b/],
        suggestion: [/\b(add|should|could|please|would be nice|feature|suggest|option|improve|make it|can you|maybe)\b/]
      };
      const score = { harassment:0, spam:0, bug:0, suggestion:0 };
      for (const [k, arr] of Object.entries(rules)) for (const r of arr) if (r.test(t)) score[k] += 3;
      if (raw.length < 4) score.spam += 2;
      if (/^https?:\/\//.test(t) && !score.bug && !score.suggestion) score.spam += 3;
      let category = 'other';
      let max = 0;
      for (const k of ['harassment','spam','bug','suggestion']) {
        if (score[k] > max) { max = score[k]; category = k; }
      }
      if (max === 0) category = 'other';
      const actionMap = { bug: 'prioritize', suggestion: 'less priority', spam: 'filter', harassment: 'flag for review', other: 'needs review' };
      return { category, action: actionMap[category], translated, wasTranslated: translated !== raw };
    }

    let feedbackCheckId = 0;
    async function updateFeedbackMeta() {
      const id = ++feedbackCheckId;
      const text = feedbackText.value;
      feedbackAction.textContent = 'checking...';
      const { category, action, wasTranslated } = await classifyFeedback(text);
      if (id !== feedbackCheckId) return;
      const labelMap = { harassment: 'harassment/threat', other: 'other/uncategorized' };
      feedbackCategory.textContent = labelMap[category] || category;
      feedbackCategory.className = `badge ${category}`;
      feedbackAction.textContent = wasTranslated ? `${action} (auto-translated)` : action;
      const blocked = category === 'spam' || category === 'harassment';
      feedbackSend.textContent = blocked ? 'flagged (blocked)' : 'open github issue';
      feedbackSend.disabled = blocked;
      feedbackSend.style.opacity = blocked ? '0.55' : '1';
    }

    function openFeedback() { feedbackModal.classList.add('open'); feedbackModal.setAttribute('aria-hidden','false'); updateFeedbackMeta(); feedbackText.focus(); }
    function closeFeedback() { feedbackModal.classList.remove('open'); feedbackModal.setAttribute('aria-hidden','true'); }
    async function submitFeedback() {
      const text = feedbackText.value.trim();
      if (!text) { feedbackStatus.textContent = 'feedback: write something first'; return; }
      feedbackSend.disabled = true; feedbackSend.style.opacity = '0.55'; feedbackSend.textContent = 'checking...';
      const { category, action, translated, wasTranslated } = await classifyFeedback(text);
      if (category === 'spam' || category === 'harassment') {
        feedbackStatus.textContent = `feedback: ${category} flagged locally, not sent`;
        closeFeedback();
        updateFeedbackMeta();
        return;
      }
      const title = `[${category}] ${text.slice(0, 60).replace(/\s+/g, ' ')}`;
      const body = `## Category\n${category}\n\n## Priority/Action\n${action}\n\n## Message\n${text}\n\n## Auto-translated (internal detector)\n${wasTranslated ? translated : '(not translated)'}\n\n## Context\n- page: ocean\n- ua: ${navigator.userAgent}\n- time: ${new Date().toISOString()}`;
      const url = `https://github.com/${FEEDBACK_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
      window.open(url, '_blank', 'noopener');
      feedbackStatus.textContent = `feedback: opened ${category} issue draft`;
      closeFeedback();
      updateFeedbackMeta();
    }

    // (syncSettingsUI merged above)

    function savePhoto() {
      try {
        const a = document.createElement('a');
        a.download = `ocean-${Date.now()}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        photoCount += 1;
        checkAchievements();
        saveGameState();
        feedbackStatus.textContent = 'photo: saved png';
      } catch (_) { feedbackStatus.textContent = 'photo: failed'; }
    }

    async function startAudio() {
      if (corrupted) return;
      if (!soundEnabled) return;
      ensureAudio();
      if (audioCtx && audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); } catch (e) {}
      }
      const ok = await startPlaylist();
      if (ok) {
        started = true;
        hint.classList.add('hidden');
      }
      syncSettingsUI();
    }

    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = settingsPanel.classList.toggle('open');
      settingsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('pointerdown', (e) => {
      if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
        settingsPanel.classList.remove('open');
        settingsBtn.setAttribute('aria-expanded', 'false');
      }
    });

    setSound.addEventListener('change', () => { soundEnabled = setSound.checked; if (soundEnabled) startAudio(); else { saveBgmState(true); pauseBgmAll(false); } sfxClick(); syncSettingsUI(); saveSettings(); });
    setWeather.addEventListener('change', () => { weatherMode = setWeather.value; sfxClick(); saveSettings(); });
    setMotion.addEventListener('change', () => { reducedMotion = setMotion.checked; sfxClick(); saveSettings(); });
    function setPhotoMode(on) {
      if (on && boss.active) { showToast('boss fight', 'not now. the void octopus is watching.', 1400); setPhoto.checked = false; return; }
      photoMode = !!on;
      setPhoto.checked = photoMode;
      document.body.classList.toggle('photo-mode', photoMode);
      if (photoMode) {
        settingsPanel.classList.remove('open');
        settingsBtn.setAttribute('aria-expanded', 'false');
      }
      saveSettings();
    }
    setPhoto.addEventListener('change', () => { setPhotoMode(setPhoto.checked); sfxClick(); });
    photoExitBtn.addEventListener('click', (e) => { e.stopPropagation(); setPhotoMode(false); sfxClick(); });
    goDownBtn.addEventListener('click', (e) => { e.stopPropagation(); if (navOnCooldown()) return; if (boss.active) { showToast('boss fight', 'you can\'t leave during the void octopus fight.', 1600); return; } if (isShore()) return; armNavCooldown(); setCamera(Math.min(currentBottomDepth(), cameraTarget + 1)); sfxDive(true); });
    goUpBtn.addEventListener('click', (e) => { e.stopPropagation(); if (navOnCooldown()) return; if (boss.active) { showToast('boss fight', 'brace, fight, or recharge. no running up.', 1600); return; } armNavCooldown(); setCamera(Math.max(0, cameraTarget - 1)); sfxDive(false); });
    goForwardBtn.addEventListener('click', (e) => { e.stopPropagation(); if (navOnCooldown()) return; if (boss.active) { showToast('boss fight', 'the void octopus blocks your path.', 1600); return; } if (!canUsePerspective() || perspective >= MAX_PERSPECTIVE) return; armNavCooldown(); perspective = Math.min(MAX_PERSPECTIVE, perspective + 1); if (perspective === 3) setCamera(0); viewPush = 1; saveGameState(); syncSettingsUI(); sfxClick(); });
    goBackBtn.addEventListener('click', (e) => { e.stopPropagation(); if (navOnCooldown()) return; if (boss.active) { showToast('boss fight', 'focus on the fight first.', 1600); return; } if (perspective <= 0) return; armNavCooldown(); perspective = Math.max(0, perspective - 1); viewPush = 1; saveGameState(); syncSettingsUI(); sfxClick(); });
    shopBtn.addEventListener('click', (e) => { e.stopPropagation(); openShop(); });
    shopClose.addEventListener('click', (e) => { e.stopPropagation(); closeShop(); });
    shopModal.addEventListener('click', (e) => { if (e.target === shopModal) closeShop(); });
    tabletBtn.addEventListener('click', (e) => { e.stopPropagation(); openTablet(); });
    tabletClose.addEventListener('click', (e) => { e.stopPropagation(); closeTablet(); });
    tabletModal.addEventListener('click', (e) => { if (e.target === tabletModal) closeTablet(); });
    [['shopTabContracts', 'shopContracts'], ['shopTabTools', 'shopTools'], ['shopTabAuto', 'shopAuto']].forEach(([tabId, paneId]) => {
      const tab = document.getElementById(tabId);
      if (!tab) return;
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        for (const id of ['shopTabContracts', 'shopTabTools', 'shopTabAuto']) document.getElementById(id)?.classList.toggle('active', id === tabId);
        for (const id of ['shopContracts', 'shopTools', 'shopAuto']) document.getElementById(id)?.classList.toggle('active', id === paneId);
        sfxClick();
      });
    });
    shopModal.addEventListener('click', (e) => {
      if (!e.target.closest) return;
      const contractBtn = e.target.closest('[data-contract]');
      if (contractBtn) { e.stopPropagation(); claimContract(contractBtn.getAttribute('data-contract')); return; }
      const buyBtn = e.target.closest('[data-shop]');
      if (buyBtn) { e.stopPropagation(); const what = buyBtn.getAttribute('data-shop'); if (what === 'tablet') buyTablet(); else if (what === 'unjammer') buyUnjammer(); else if (what === 'battery-pack') buyBatteryPack(); return; }
      const cellBtn = e.target.closest('[data-battery]');
      if (cellBtn) { e.stopPropagation(); if (cellBtn.getAttribute('data-battery') === 'use') useBattery(); return; }
      const autoBtn = e.target.closest('[data-auto]');
      if (autoBtn) { e.stopPropagation(); if (autoBtn.getAttribute('data-auto') === 'repair') repairAuto(); else rechargeAuto(); return; }
      const buildBtn = e.target.closest('[data-machine-build]');
      if (buildBtn) { e.stopPropagation(); buildMachine(Number(buildBtn.getAttribute('data-machine-build'))); return; }
      const disBtn = e.target.closest('[data-machine-disassemble]');
      if (disBtn) { e.stopPropagation(); disassembleMachine(Number(disBtn.getAttribute('data-machine-disassemble'))); return; }
      const padBuyBtn = e.target.closest('[data-pad-buy]');
      if (padBuyBtn) { e.stopPropagation(); buyPad(Number(padBuyBtn.getAttribute('data-pad-buy'))); return; }
      const padBtn = e.target.closest('[data-machine]');
      if (padBtn) { e.stopPropagation(); selectMachine(Number(padBtn.getAttribute('data-machine'))); }
    });
    tabletModal.addEventListener('click', (e) => {
      if (!e.target.closest) return;
      const cellBtn = e.target.closest('[data-battery]');
      if (cellBtn) { e.stopPropagation(); if (cellBtn.getAttribute('data-battery') === 'use') useBattery(); return; }
      const unjamBtn = e.target.closest('[data-unjam]');
      if (unjamBtn) { e.stopPropagation(); if (unjamBtn.getAttribute('data-unjam') === 'start') repairAuto(); return; }
      const padBtn = e.target.closest('[data-machine]');
      if (padBtn) { e.stopPropagation(); selectMachine(Number(padBtn.getAttribute('data-machine'))); }
    });
    chestClose.addEventListener('click', (e) => { e.stopPropagation(); closeChest(); });
    chestTakeAll.addEventListener('click', (e) => { e.stopPropagation(); takeAllFromChest(); });
    chestModal.addEventListener('click', (e) => {
      if (e.target === chestModal) { closeChest(); return; }
      if (!e.target.closest) return;
      const takeBtn = e.target.closest('[data-chest-take]');
      if (!takeBtn) return;
      e.stopPropagation();
      const id = takeBtn.getAttribute('data-chest-take');
      const input = chestModal.querySelector(`[data-chest-qty="${id}"]`);
      takeFromChest(id, input ? input.value : 1);
    });
    flowClose.addEventListener('click', (e) => { e.stopPropagation(); closeUnjam(); });
    flowReset.addEventListener('click', (e) => { e.stopPropagation(); if (!flowState) return; flowState.paths = {}; flowState.dragging = false; flowState.activeColor = null; drawFlow(); sfxClick(); });
    flowModal.addEventListener('click', (e) => { if (e.target === flowModal) closeUnjam(); });
    flowCanvas.addEventListener('pointerdown', flowPointerDown);
    flowCanvas.addEventListener('pointermove', flowPointerMove);
    flowCanvas.addEventListener('pointerup', flowPointerUp);
    flowCanvas.addEventListener('pointercancel', flowPointerUp);
    photoBtn.addEventListener('click', (e) => { e.stopPropagation(); savePhoto(); });
    logBtn.addEventListener('click', (e) => { e.stopPropagation(); renderDiscoveries(); logModal.classList.add('open'); logModal.setAttribute('aria-hidden','false'); });
    logClose.addEventListener('click', () => { logModal.classList.remove('open'); logModal.setAttribute('aria-hidden','true'); });
    logModal.addEventListener('click', (e) => { if (e.target === logModal) logClose.click(); });
    achBtn.addEventListener('click', (e) => { e.stopPropagation(); renderAchievements(); achModal.classList.add('open'); achModal.setAttribute('aria-hidden','false'); });
    achClose.addEventListener('click', () => { achModal.classList.remove('open'); achModal.setAttribute('aria-hidden','true'); });
    achModal.addEventListener('click', (e) => { if (e.target === achModal) achClose.click(); });
    updateBtn.addEventListener('click', (e) => { e.stopPropagation(); renderUpdateLog(); updateModal.classList.add('open'); updateModal.setAttribute('aria-hidden','false'); });
    updateClose.addEventListener('click', () => { updateModal.classList.remove('open'); updateModal.setAttribute('aria-hidden','true'); });
    updateModal.addEventListener('click', (e) => { if (e.target === updateModal) updateClose.click(); });
    crashBtn.addEventListener('click', (e) => { e.stopPropagation(); unlockAchievement('chaos'); startAudio(); setTimeout(() => { throw new Error('manual ocean crash initiated by user'); }, 30); });
    bossAttackBtn.addEventListener('click', (e) => { e.stopPropagation(); bossPlayerAction('attack'); });
    bossGuardBtn.addEventListener('click', (e) => { e.stopPropagation(); bossPlayerAction('guard'); });
    bossHealBtn.addEventListener('click', (e) => { e.stopPropagation(); bossPlayerAction('heal'); });
    exportSaveBtn.addEventListener('click', (e) => { e.stopPropagation(); exportSave(); });
    importSaveBtn.addEventListener('click', (e) => { e.stopPropagation(); importSaveInput.value = ''; importSaveInput.click(); });
    importSaveInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importSaveFile(file);
    });
    let resetArmed = false;
    let resetTimer = 0;
    function disarmReset() {
      resetArmed = false;
      resetSaveBtn.textContent = 'reset save';
      resetSaveBtn.classList.remove('armed');
    }
    resetSaveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!resetArmed) {
        resetArmed = true;
        clearTimeout(resetTimer);
        resetSaveBtn.textContent = 'click again to wipe';
        resetSaveBtn.classList.add('armed');
        feedbackStatus.textContent = 'save: click again within 4s to wipe everything';
        resetTimer = setTimeout(disarmReset, 4000);
        sfxClick();
        return;
      }
      clearTimeout(resetTimer);
      disarmReset();
      for (const k of SAVE_KEYS) localStorage.removeItem(k);
      feedbackStatus.textContent = 'save: wiped, reloading...';
      sfxClick();
      setTimeout(() => location.reload(), 350);
    });
    feedbackBtn.addEventListener('click', (e) => { e.stopPropagation(); openFeedback(); });
    feedbackCancel.addEventListener('click', closeFeedback);
    feedbackSend.addEventListener('click', submitFeedback);
    feedbackText.addEventListener('input', updateFeedbackMeta);
    feedbackModal.addEventListener('click', (e) => { if (e.target === feedbackModal) closeFeedback(); });

    canvas.addEventListener('click', (e) => {
      if (corrupted || blackoutActive) return;
      if (e.target.closest('.settings-wrap') || e.target.closest('.modal')) return;
      startAudio();
      if (boss.active) { sfxClick(); return; }
      if (Date.now() < clickLockUntil) {
        updateHurtState();
        feedbackStatus.textContent = `pufferfish sting: clicking locked (${hurtTimerText ? hurtTimerText.textContent : '1:00'})`;
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const worldY = y + cameraY * h;
      const horizon = h * 0.58;

      if (perspective === 0 && cameraY <= 0.2) {
        const chest = chestRect();
        if (x > chest.x - chest.w * 0.58 && x < chest.x + chest.w * 0.58 && y > chest.y - chest.h * 0.3 && y < chest.waterY + chest.h * 0.16) {
          openChest();
          return;
        }
        const pads = machinePadRects();
        for (let i = 0; i < pads.length; i++) {
          const pad = pads[i];
          if (x > pad.x - pad.w * 0.58 && x < pad.x + pad.w * 0.58 && y > pad.y - pad.h * 0.82 && y < pad.y + pad.h * 0.82) {
            sfxClick();
            if (!isPadUnlocked(i)) { showToast('pad locked', 'the supply dock sells that rock.', 2200); return; }
            mining.activeMachine = i;
            resetRigState(i);
            saveGameState();
            syncMiningHud();
            renderShop();
            if (mining.tablet) openTablet();
            else showToast(`machine pad ${i + 1}`, mining.machines[i].tier ? `${AUTO_TIERS[mining.machines[i].tier].name} claw rig is parked here. buy the tablet for live stats.` : `empty machine pad. ${unlockedPadCount()}/${MACHINE_PAD_COUNT} rocks unlocked.`, 3000);
            return;
          }
        }
      }

      if (isAtBottom() || isFacilityLayer()) {
        const bottomLayer = Math.floor(currentBottomDepth());
        const localY = worldY - h * bottomLayer;
        if (isFacilityLayer()) {
          const py = h*0.86;
          const boxW = Math.min(140, Math.max(84, w * 0.28));
          const boxH = w < 560 ? 30 : 32;
          const gap = Math.max(8, w * 0.02);
          const total = boxW * 3 + gap * 2;
          const startX = (w - total) / 2 + boxW / 2;
          const bxs = [startX, startX + boxW + gap, startX + (boxW + gap) * 2];
          const hitBox = (bx)=> x > bx - boxW/2 && x < bx + boxW/2 && localY > py && localY < py + boxH;
          if (hitBox(bxs[0])) {
            if (!facility.puzzleA) { facility.puzzleA = true; sfxClick(); showVoidDialogue('valve sealed. pressure stabilizing. one system down.', 3500); }
            else { sfxClick(); showVoidDialogue('valve already sealed.', 1800); }
          }
          else if (hitBox(bxs[1])) {
            if (!facility.puzzleB) {
              const code = prompt('enter facility code:','');
              if ((code||'').trim().toUpperCase() === 'BLUE') { facility.puzzleB = true; sfxClick(); showVoidDialogue('code accepted. BLUE protocol unlocked.', 3500); }
              else if (code !== null) { sfxClick(); showVoidDialogue('wrong code.', 1800); }
            } else { sfxClick(); showVoidDialogue('code terminal already green.', 1800); }
          }
          else if (hitBox(bxs[2])) {
            if (!facility.encounterDone) { facility.encounterDone = true; sfxClick(); showVoidDialogue('guard bypassed.', 2200); }
            else { sfxClick(); showVoidDialogue('guard already bypassed.', 1800); }
          }
          if (facility.puzzleA && facility.puzzleB && facility.encounterDone && !facility.complete) {
            facility.complete = true;
            quest.deepBlueSealed = true;
            unlockAchievement('deep_blue');
            showVoidDialogue('supply stopped. deep blue sealed. the abyss is the floor now.', 5200);
            setCamera(5);
          }
          saveGameState();
          return;
        }
        const dx = x - (voidEntity.screenX || w*0.5);
        const dy = localY - (voidEntity.screenY || h*0.5);
        if (dx*dx + dy*dy < (voidEntity.r + 20) * (voidEntity.r + 20)) {
          if (!quest.accepted) {
            quest.accepted = true;
            quest.bottlesAtAccept = bottlesFound;
            quest.fishAtAccept = fishDiscoveryCount();
            quest.tripsAtAccept = bottomTrips;
            saveGameState();
            showVoidDialogue('good. 3 bottles. 3 new fish, clicked by your own hand. 3 trips from top to bottom. then come back.', 7000);
          } else if (!quest.completed) {
            const p = questProgress();
            if (questComplete()) { quest.completed = true; quest.unlockedDeep = true; saveGameState(); showVoidDialogue('it is done. the deep opens. go deeper.', 8000); }
            else showVoidDialogue(`quest: bottles ${Math.min(3,p.bottles)}/3, fish ${Math.min(3,p.fish)}/3, trips ${Math.min(3,p.trips)}/3`, 4500);
          } else {
            showVoidDialogue('the deep is open. keep going.', 4000);
          }
          return;
        }
      }

      if (isShore()) {
        const sign = shoreShopSignRect();
        if (x > sign.x - 10 && x < sign.x + sign.w + 10 && y > sign.y - 10 && y < sign.y + sign.h + 10) {
          openShop();
          return;
        }
        sfxClick();
        feedbackStatus.textContent = 'click the SHOP sign to open the supply panel.';
        return;
      }

      clicks += 1;
      checkAchievements();
      saveGameState();

      if (perspective === 0 && !isFacilityLayer() && !boss.active) {
        const layer = activeOreLayer();
        for (const node of ORE_NODES) {
          if (node.layer !== layer || !nodeOreId(node)) continue;
          const p = oreNodePos(node);
          const nx = p.x, ny = p.y;
          const r = p.r + 14;
          if (Math.abs(x - nx) < r && Math.abs(y - ny) < r) {
            strikeOreNode(node);
            return;
          }
        }
      }

      if (perspective === 1 && cameraY < 0.5) {
        const bergs = getIcebergs();
        for (const b of bergs) { if (Math.abs(x-b.x)<b.w*0.45 && Math.abs(y-b.y)<b.h*0.6) { sfxClick(); feedbackStatus.textContent='you tapped an iceberg. it does nothing. majestic.'; return; } }
      }
      if (perspective === 1 && cameraY >= 3.5 && cameraY < 4.5) {
        const localY = worldY - h * 4;
        const sx=w*0.52, sy=h*0.8, sw=Math.min(w*0.34, 520), sh=sw*0.22;
        if (x > sx-sw*0.62 && x < sx+sw*0.62 && localY > sy-sh*1.7 && localY < sy+sh*0.75) {
          if (shipLooted) {
            showToast('sunken ship', 'you already looted this wreck.', 2200);
          } else if (confirm('Loot the sunken ship?')) {
            shipLooted = true;
            bottlesFound += 1;
            const wreckNote = nextBottleNote();
            syncBottleDef();
            recordDiscovery('shipwreck');
            recordDiscovery('bottle');
            renderDiscoveries();
            saveGameState();
            sfxDiscovery();
            showToast('shipwreck looted', `old bottle note: ${wreckNote}`, 5200);
          }
          return;
        }
      }

      const hitFish = window.OceanFish ? window.OceanFish.hitTest(x, worldY) : null;
      if (cameraY < 0.5 && worldY > horizon && worldY < h) {
        ripples.push({ x, y: worldY, r: 5, age: 0, life: 900 });
        sfxSplash();
        if (bottle.active && Math.abs(x - bottle.screenX) < 22 && Math.abs(worldY - bottle.screenY) < 24) {
          bottle.found = true;
          bottle.active = false;
          bottle.screenX = -999; bottle.screenY = -999;
          bottle.next = 90000 + Math.random() * 120000;
          bottlesFound += 1;
          const foundNote = nextBottleNote();
          syncBottleDef();
          recordDiscovery('bottle');
          renderDiscoveries();
          showToast('message in a bottle', foundNote, 5600);
          saveGameState();
          sfxClick();
        }
      } else if (hitFish) {
        if (Date.now() < clickLockUntil) {
          updateHurtState();
          feedbackStatus.textContent = `pufferfish sting: clicking locked (${hurtTimerText ? hurtTimerText.textContent : '1:00'})`;
          return;
        }
        recordDiscovery(hitFish.type.id);
        if (window.OceanFish.puff(hitFish)) {
          unlockAchievement('puff_puff');
          triggerHurt(60000);
          feedbackStatus.textContent = 'pufferfish got you! no clicking for 1 minute.';
          for (let i=0;i<14;i++) clickBubbles.push({ x, y: worldY, r: 1.5+Math.random()*3.5, sp: 0.3+Math.random()*0.9, ph: Math.random()*10, age:0, life: 900+Math.random()*900 });
          for (let i=0;i<10;i++) ripples.push({ x, y: worldY, r: 4+i*3, age: 0, life: 500+i*40 });
        } else {
          for (let i=0;i<4;i++) clickBubbles.push({ x, y: worldY, r: 1+Math.random()*2.2, sp: 0.25+Math.random()*0.5, ph: Math.random()*10, age:0, life: 700+Math.random()*500 });
        }
        sfxBubble();
      } else if (cameraY >= 4.5) {
        for (let i=0;i<5;i++) clickBubbles.push({ x, y: worldY, r: 1+Math.random()*2.2, sp: 0.15+Math.random()*0.35, ph: Math.random()*10, age:0, life: 1400+Math.random()*800 });
        sfxBubble();
        const localY = worldY - h * 5;
        for (const e of voidEyes) {
          const ex = e.x * w;
          const ey = e.y * h;
          if (Math.abs(x - ex) < 30 && Math.abs(localY - ey) < 25) { recordDiscovery('void_eye'); break; }
        }
      } else if (cameraY >= 3.5) {
        for (let i=0;i<5;i++) clickBubbles.push({ x, y: worldY, r: 1+Math.random()*2.4, sp: 0.2+Math.random()*0.4, ph: Math.random()*10, age:0, life: 1200+Math.random()*700 });
        sfxBubble();
        const localY = worldY - h * 4;
        for (let i=0;i<4;i++) {
          const rx = w*(0.3+i*0.13) + 12;
          const ry = h*0.65;
          if (Math.abs(x - rx) < 40 && Math.abs(localY - ry) < 70) { recordDiscovery('ribcage'); break; }
        }
      } else if (cameraY >= 2.5) {
        for (let i=0;i<5;i++) clickBubbles.push({ x, y: worldY, r: 1+Math.random()*2.5, sp: 0.22+Math.random()*0.45, ph: Math.random()*10, age:0, life: 1200+Math.random()*700 });
        sfxBubble();
        const localY = worldY - h * 3;
        const cx = w * 0.5, cy = h * 0.5;
        if (Math.abs(x - cx) < 45 && Math.abs(localY - cy) < 60) recordDiscovery('crack');
      } else if (cameraY >= 1.2) {
        // abyss interactions
        for (let i=0;i<6;i++) clickBubbles.push({ x, y: worldY, r: 1+Math.random()*2.8, sp: 0.25+Math.random()*0.5, ph: Math.random()*10, age:0, life: 1100+Math.random()*700 });
        sfxBubble();
        const localY = worldY - h * 2;
        const ax = angler.x * w;
        const ay = h * angler.y + Math.sin(animTime*0.0006 + angler.ph) * 26;
        if (Math.abs(x - ax) < 60 && Math.abs(localY - ay) < 40) recordDiscovery('angler');
        const vx = w * 0.62, vy = h * 0.86 - 24;
        if (Math.abs(x - vx) < 50 && Math.abs(localY - vy) < 55) recordDiscovery('vent');
      } else if (cameraY > 0.2) {
        for (let i=0;i<5;i++) clickBubbles.push({ x, y: worldY, r: 1+Math.random()*2.5, sp: 0.3+Math.random()*0.6, ph: Math.random()*10, age:0, life: 900+Math.random()*500 });
        sfxBubble();
      }
    });

    window.addEventListener('pointerdown', (e) => { if (blackoutActive || e.target.closest('.settings-wrap') || e.target.closest('.modal') || e.target === canvas) return; startAudio(); }, { passive: true });
    const adminCode = ['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','arrowright','arrowleft','.','b','a','b','a'];
    let adminIdx = 0;
    function openAdmin() {
      adminModal.classList.add('open');
      adminModal.setAttribute('aria-hidden', 'false');
      adminSetStatus('admin panel unlocked');
    }
    function closeAdmin() {
      adminModal.classList.remove('open');
      adminModal.setAttribute('aria-hidden', 'true');
    }
    adminClose.addEventListener('click', closeAdmin);
    adminModal.addEventListener('click', (e) => { if (e.target === adminModal) closeAdmin(); });

    adminSpawnBottle.addEventListener('click', () => {
      bottle.active = true;
      bottle.found = false;
      bottle.x = 0.08 + Math.random() * 0.25;
      bottle.ph = Math.random() * 10;
      bottle.next = 999999;
      bottle.screenX = -999; bottle.screenY = -999;
      adminSetStatus('bottle spawned near the surface');
      sfxClick();
    });

    adminAllDiscoveries.addEventListener('click', () => {
      for (const d of DISCOVERY_DEFS) if (!discoveries.includes(d.id)) discoveries.push(d.id);
      saveGameState();
      renderDiscoveries();
      checkAchievements();
      adminSetStatus(`all discoveries unlocked (${discoveries.length}/${DISCOVERY_DEFS.length})`);
      sfxClick();
    });

    adminAllAchievements.addEventListener('click', () => {
      for (const a of ACHIEVEMENT_DEFS) if (!achievements.includes(a.id)) achievements.push(a.id);
      saveGameState();
      renderAchievements();
      adminSetStatus(`all achievements unlocked (${achievements.length}/${ACHIEVEMENT_DEFS.length})`);
      sfxClick();
    });

    adminFinishQuest.addEventListener('click', () => {
      bottlesFound = Math.max(bottlesFound, (quest.bottlesAtAccept || 0) + 3);
      bottomTrips = Math.max(bottomTrips, (quest.tripsAtAccept || 0) + 3);
      for (const id of ALL_FISH_IDS) if (!discoveries.includes(id)) discoveries.push(id);
      quest.offered = true;
      quest.accepted = true;
      quest.completed = true;
      quest.unlockedDeep = true;
      quest.deepBlueSealed = true;
      facility.puzzleA = true; facility.puzzleB = true; facility.encounterDone = true; facility.complete = true;
      if (!achievements.includes('deep_blue')) achievements.push('deep_blue');
      setCamera(5);
      saveGameState();
      renderDiscoveries();
      renderAchievements();
      checkAchievements();
      syncSettingsUI();
      adminSetStatus('quest finished, facility solved, deeper layer unlocked');
      showVoidDialogue('admin override accepted. the deep opens. facility systems neutralized.', 5000);
      sfxClick();
    });

    adminMiningKit.addEventListener('click', () => {
      for (const id of Object.keys(ORE_DEFS)) mining.ores[id] += 25;
      mining.pickaxe = PICKAXES.length - 1;
      mining.tablet = true;
      mining.tipSeen = true;
      saveGameState();
      syncMiningHud();
      renderShop();
      renderTablet();
      sfxClick();
      adminSetStatus('max pick, tablet, and +25 of every ore');
    });

    adminBuildRigs.addEventListener('click', () => {
      mining.unlockedPads = MACHINE_PAD_COUNT;
      for (let i = 0; i < MACHINE_PAD_COUNT; i++) {
        const m = mining.machines[i];
        m.tier = AUTO_TIERS.length - 1;
        m.battery = 100;
        m.broken = false;
        m.progress = 0;
        m.message = 'admin rig online';
        resetRigState(i);
      }
      mining.activeMachine = 0;
      saveGameState();
      syncMiningHud();
      renderShop();
      renderTablet();
      sfxClick();
      adminSetStatus('all 4 pads unlocked and loaded with abyss crawlers');
    });

    adminChargeRigs.addEventListener('click', () => {
      let n = 0;
      for (let i = 0; i < MACHINE_PAD_COUNT; i++) {
        const m = mining.machines[i];
        if (!m.tier) continue;
        m.battery = 100;
        m.broken = false;
        m.progress = 0;
        m.message = 'battery full';
        resetRigState(i);
        n++;
      }
      saveGameState();
      syncMiningHud();
      renderShop();
      renderTablet();
      sfxClick();
      adminSetStatus(n ? `${n} rig(s) charged and unjammed` : 'no rigs built yet');
    });

    adminRefillMachines.addEventListener('click', () => {
      let n = 0;
      for (let i = 0; i < MACHINE_PAD_COUNT; i++) {
        const m = mining.machines[i];
        if (!m.tier) continue;
        m.battery = 100;
        m.progress = 0;
        m.message = m.broken ? 'jammed — use unjammer' : 'battery full';
        if (!m.broken) resetRigState(i);
        n++;
      }
      saveGameState();
      syncMiningHud();
      renderShop();
      renderTablet();
      sfxClick();
      adminSetStatus(n ? `${n} machine(s) refilled` : 'no machines built yet');
    });

    adminUnjamMachines.addEventListener('click', () => {
      let n = 0;
      for (let i = 0; i < MACHINE_PAD_COUNT; i++) {
        const m = mining.machines[i];
        if (!m.tier || !m.broken) continue;
        m.broken = false;
        m.progress = 0;
        m.message = 'unjammed by admin';
        resetRigState(i);
        n++;
      }
      saveGameState();
      syncMiningHud();
      renderShop();
      renderTablet();
      sfxClick();
      adminSetStatus(n ? `${n} machine(s) unjammed` : 'no jammed machines');
    });

    adminBuyAll.addEventListener('click', () => {
      mining.pickaxe = PICKAXES.length - 1;
      mining.tablet = true;
      mining.unjammer = true;
      mining.batteries = Math.max(99, mining.batteries | 0);
      mining.unlockedPads = MACHINE_PAD_COUNT;
      mining.tipSeen = true;
      saveGameState();
      syncMiningHud();
      renderShop();
      renderTablet();
      sfxClick();
      adminSetStatus('all shore gear bought · 4 pads · 99 cells');
    });

    adminFillChest.addEventListener('click', () => {
      for (const id of Object.keys(ORE_DEFS)) mining.chest[id] = (mining.chest[id] || 0) + 25;
      saveGameState();
      syncMiningHud();
      renderChest();
      sfxClick();
      adminSetStatus('+25 of every ore waiting in the chest');
    });

    adminRerollVeins.addEventListener('click', () => {
      for (const node of ORE_NODES) {
        delete mining.nodeHp[node.id];
        delete mining.nodeRespawn[node.id];
        if (!node.ore) delete mining.nodeOre[node.id];
      }
      ensureRareVeins();
      saveGameState();
      syncMiningHud();
      renderShop();
      sfxClick();
      adminSetStatus('veins reset; rare ores re-rolled');
    });

    adminRefillOxygen.addEventListener('click', () => {
      if (blackoutActive) { adminSetStatus('blackout active — skip it first'); return; }
      oxygen = oxygenMax;
      oxygenWarned = false;
      updateOxygen(0);
      sfxClick();
      adminSetStatus('oxygen refilled');
    });

    adminTriggerBlackout.addEventListener('click', () => {
      adminSetStatus('blackout started — five minutes');
      startBlackout();
    });

    adminSkipBlackout.addEventListener('click', () => {
      if (!blackoutActive) { adminSetStatus('no blackout to skip'); return; }
      finishBlackout(true);
      sfxClick();
      adminSetStatus('blackout skipped — back at the surface');
    });

    adminGoShore.addEventListener('click', () => {
      if (blackoutActive) { adminSetStatus('wake up from the blackout first'); return; }
      if (boss.active) { adminSetStatus('finish the octopus fight first'); return; }
      perspective = MAX_PERSPECTIVE;
      cameraY = 0;
      cameraTarget = 0;
      camAnim = null;
      viewPush = 1;
      saveGameState();
      syncSettingsUI();
      sfxClick();
      adminSetStatus('moved to the shore supply dock');
    });

    adminLootShip.addEventListener('click', () => {
      shipLooted = true;
      bottlesFound += 1;
      const note = nextBottleNote();
      syncBottleDef();
      recordDiscovery('shipwreck');
      recordDiscovery('bottle');
      renderDiscoveries();
      saveGameState();
      sfxDiscovery();
      showToast('shipwreck looted', `old bottle note: ${note}`, 5200);
      adminSetStatus('shipwreck looted with a fresh note');
    });

    adminSealDeep.addEventListener('click', () => {
      quest.unlockedDeep = true;
      quest.deepBlueSealed = true;
      facility.puzzleA = true;
      facility.puzzleB = true;
      facility.encounterDone = true;
      facility.complete = true;
      setCamera(5);
      saveGameState();
      syncSettingsUI();
      sfxClick();
      adminSetStatus('deep blue sealed — the abyss is the floor');
    });

    adminUnsealDeep.addEventListener('click', () => {
      quest.unlockedDeep = true;
      quest.deepBlueSealed = false;
      facility.puzzleA = false;
      facility.puzzleB = false;
      facility.encounterDone = false;
      facility.complete = false;
      saveGameState();
      syncSettingsUI();
      sfxClick();
      adminSetStatus('deep blue unsealed — facility back online');
    });

    adminSpawnOctopus.addEventListener('click', () => {
      if (blackoutActive) { adminSetStatus('wake up from the blackout first'); return; }
      if (voidOctopusDefeated) { adminSetStatus('octopus already defeated'); return; }
      if (boss.active) { adminSetStatus('octopus fight already active'); return; }
      perspective = 2;
      cameraY = 4;
      cameraTarget = 4;
      camAnim = null;
      startVoidOctopus();
      saveGameState();
      syncSettingsUI();
      closeAdmin();
      sfxClick();
    });

    adminDefeatOctopus.addEventListener('click', () => {
      if (!voidOctopusDefeated) {
        voidOctopusDefeated = true;
        localStorage.setItem('ocean_void_octopus_defeated', '1');
        recordDiscovery('void_octopus');
        unlockAchievement('octopus_slayer');
      }
      if (boss.active) {
        boss.active = false;
        boss.phase = 'win';
        boss.timer = 0;
        syncBossUi();
      }
      saveGameState();
      renderDiscoveries();
      renderAchievements();
      sfxClick();
      adminSetStatus('void octopus marked defeated');
    });

    window.addEventListener('keydown', (e) => {
      if (corrupted) { e.preventDefault(); return; }
      const k = e.key.toLowerCase();
      const isTyping = !!(e.target && e.target.closest && e.target.closest('textarea,input,select'));
      if (blackoutActive) {
        if (adminModal.classList.contains('open')) {
          if (e.key === 'Escape') closeAdmin();
          return;
        }
        e.preventDefault();
        if (isTyping) { adminIdx = 0; return; }
        const expected = adminCode[adminIdx];
        if (k === expected) {
          adminIdx += 1;
          if (adminIdx >= adminCode.length) { adminIdx = 0; openAdmin(); }
        } else {
          adminIdx = k === adminCode[0] ? 1 : 0;
        }
        return;
      }
      if (e.key === 'Escape') { closeAdmin(); closeFeedback(); closeShop(); closeTablet(); closeChest(); closeUnjam(); logModal.classList.remove('open'); logModal.setAttribute('aria-hidden','true'); achModal.classList.remove('open'); achModal.setAttribute('aria-hidden','true'); updateModal.classList.remove('open'); updateModal.setAttribute('aria-hidden','true'); settingsPanel.classList.remove('open'); settingsBtn.setAttribute('aria-expanded','false'); setPhotoMode(false); return; }
      if (isTyping) { adminIdx = 0; return; }
      const expected = adminCode[adminIdx];
      if (k === expected) {
        adminIdx += 1;
        if (adminIdx >= adminCode.length) { adminIdx = 0; openAdmin(); }
      } else {
        adminIdx = k === adminCode[0] ? 1 : 0;
      }
      if (k === 'p') { if (anyUiModalOpen()) return; setPhotoMode(!photoMode); return; }
      startAudio();
    });
    checkAchievements();
    renderAchievements();
    syncBottleDef();
    renderDiscoveries();
    syncSettingsUI();
    syncBossUi();
    for (let i = 0; i < MACHINE_PAD_COUNT; i++) resetRigState(i);
    restoreOreNodes(true);
    syncMiningHud();
    renderShop();
    restoreBlackout();
    updateOxygen(0);
  
