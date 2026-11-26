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
      try { bgm.pause(); } catch (_) {}
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
    const ctx = canvas.getContext('2d');
    const bgm = document.getElementById('bgm');
    const hint = document.getElementById('hint');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const setSound = document.getElementById('setSound');
    const setCycle = document.getElementById('setCycle');
    const setSpeed = document.getElementById('setSpeed');
    const speedLabel = document.getElementById('speedLabel');
    const setDay = document.getElementById('setDay');
    const setNight = document.getElementById('setNight');
    const setWeather = document.getElementById('setWeather');
    const setMotion = document.getElementById('setMotion');
    const setPhoto = document.getElementById('setPhoto');
    const photoExitBtn = document.getElementById('photoExitBtn');
    const goDownBtn = document.getElementById('goDownBtn');
    const goUpBtn = document.getElementById('goUpBtn');
    const photoBtn = document.getElementById('photoBtn');
    const logBtn = document.getElementById('logBtn');
    const achBtn = document.getElementById('achBtn');
    const updateBtn = document.getElementById('updateBtn');
    const feedbackBtn = document.getElementById('feedbackBtn');
    const crashBtn = document.getElementById('crashBtn');
    const feedbackStatus = document.getElementById('feedbackStatus');
    const discoverHint = document.getElementById('discoverHint');
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

    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let t = 0;
    let lastT = 0;
    let simTime = 0;
    let animTime = 0;
    let motionMul = 1;
    let dt = 0;
    let started = false;
    let soundEnabled = true;
    let masterVolume = 0.65;
    let dayCycle = true;
    let cycleSpeed = 1;
    let reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let photoMode = false;
    let forcedMode = 'night'; // 'day' | 'night' | null
    let manualDayPhase = 0.75;
    let weatherMode = 'auto'; // auto|clear|rain|storm
    let weatherIntensity = 0;
    let weatherTarget = 0;
    let dayFactor = 0;
    let cameraY = 0;
    let cameraTarget = 0;
    let camAnim = null;
    const MAX_DEPTH = 5;
    const DEPTH_LAYERS = [
      { id:'surface', name:'surface', min:0, max:0.5 },
      { id:'underwater', name:'underwater', min:0.5, max:1.5 },
      { id:'abyss', name:'abyss', min:1.5, max:2.5 },
      { id:'trenches', name:'trenches', min:2.5, max:3.5 },
      { id:'hadal', name:'hadal', min:3.5, max:4.5 },
      { id:'void', name:'the void', min:4.5, max:5.5 }
    ];
    function depthLabel(y) {
      const d = DEPTH_LAYERS.find(l => y >= l.min && y < l.max) || DEPTH_LAYERS[DEPTH_LAYERS.length - 1];
      return d.name;
    }
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
    const discoveries = JSON.parse(localStorage.getItem('ocean_discoveries') || '[]');
    const achievements = JSON.parse(localStorage.getItem('ocean_achievements') || '[]');
    let equippedDiscovery = localStorage.getItem('ocean_equipped') || '';
    let clicks = Number(localStorage.getItem('ocean_clicks') || 0);
    let photoCount = Number(localStorage.getItem('ocean_photos') || 0);
    bgm.volume = masterVolume;

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

    const DISCOVERY_DEFS = [
      { id:'bottle', name:'Message in a Bottle', desc:'A weathered bottle drifted by with a tiny note inside. "the ocean remembers every ripple."', emoji:'🍾', c1:'#16406a', c2:'#2f7a9e' },
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
      { id:'pufferfish', name:'Pufferfish', desc:'A spiky pufferfish. click it and it puffs up like a balloon.', emoji:'🐡', c1:'#6b4a12', c2:'#e9b94c', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.pufferfish) },
      { id:'shark', name:'Great White Shark', desc:'A great white shark cruising the deeper water. respect the king.', emoji:'🦈', c1:'#1f3440', c2:'#718e9b', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.shark) },
      { id:'betta', name:'Betta Fish', desc:'A flowy betta fish showing off its dramatic fins.', emoji:'🐟', c1:'#204b8b', c2:'#d84e79', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.betta) },
      { id:'koi', name:'Koi Fish', desc:'A calm koi drifting through the upper deep.', emoji:'🎏', c1:'#5a4330', c2:'#e76d34', img: () => window.OceanFish && 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(window.OceanFish.SVGs.koi) }
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
      { id:'fish_friend', name:'Fish Friend', desc:'Discover your first fish species.', check: () => ['clownfish','pufferfish','shark','betta','koi'].some(id => discoveries.includes(id)) },
      { id:'ichthyologist', name:'Ichthyologist', desc:'Discover all fish species from the great fish expansion.', check: () => ['clownfish','pufferfish','shark','betta','koi'].every(id => discoveries.includes(id)) },
      { id:'puff_puff', name:'Puff Puff', desc:'Click a pufferfish and make it puff up.', check: () => achievements.includes('puff_puff') }
    ];

    function saveSettings() {
      try { localStorage.setItem('ocean_settings', JSON.stringify({ soundEnabled, dayCycle, cycleSpeed, forcedMode, weatherMode, reducedMotion })); } catch (_) {}
    }
    function saveGameState() {
      try {
        localStorage.setItem('ocean_discoveries', JSON.stringify(discoveries));
        localStorage.setItem('ocean_achievements', JSON.stringify(achievements));
        localStorage.setItem('ocean_equipped', equippedDiscovery || '');
        localStorage.setItem('ocean_clicks', String(clicks));
        localStorage.setItem('ocean_photos', String(photoCount));
      } catch (_) {}
    }
    function loadSettings() {
      try {
        const s = JSON.parse(localStorage.getItem('ocean_settings') || 'null');
        if (!s) return;
        if (typeof s.soundEnabled === 'boolean') soundEnabled = s.soundEnabled;
        if (typeof s.dayCycle === 'boolean') dayCycle = s.dayCycle;
        if (typeof s.cycleSpeed === 'number') cycleSpeed = Math.max(0.2, Math.min(3, s.cycleSpeed));
        if (s.forcedMode === 'day' || s.forcedMode === 'night' || s.forcedMode === null) forcedMode = s.forcedMode;
        if (['auto','clear','rain','storm'].includes(s.weatherMode)) weatherMode = s.weatherMode;
        if (typeof s.reducedMotion === 'boolean') reducedMotion = s.reducedMotion;
      } catch (_) {}
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
        feedbackStatus.textContent = `discovery: ${def ? def.name : key}`;
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
      { date: '2026-11-26', title: 'lux studios splash', detail: 'every load now opens with the lux studios intro: a wireframe cube rolls in, speeds up, explodes into lines, and reveals the wordmark before fading into the ocean.' },
      { date: '2026-11-25', title: 'deep dive minigame', detail: 'added a side arrow that opens a 10-move minigame. answer with the most underground picks to sink deeper and score higher.' },
      { date: '2026-11-25', title: 'the great fish expansion', detail: 'added clownfish, pufferfish, great white sharks, betta fish, and koi across the ocean depths. pufferfish puff up when you click them.' },
      { date: '2026-11-25', title: 'ocean: part 4 - deeper still', detail: 'added 3 more layers below the abyss: trenches, hadal, and the void. new biomes, particles, click discoveries, achievements, and depth tracking all the way down.' },
      { date: '2026-11-25', title: 'ocean: part 3 - the abyss', detail: 'you can go down again past underwater into a new abyss layer, with a darker biome, new creatures/vent, new abyss discoveries, new achievements, and depth-aware audio/visuals.' },
      { date: '2026-11-25', title: 'achievements + equipped discoveries', detail: 'split achievements into their own button, made discoveries into proper cards with lock states, and equipping now spawns the discovery in the world.' },
      { date: '2026-11-25', title: 'photo mode + crash fixes', detail: 'added photo mode exit button, fixed rain clipping at the waterline, avoided file:// bgm CORS silence, and guarded audio volume from non-finite values.' },
      { date: '2026-11-25', title: 'crash mode chaos', detail: 'added initiate crash, wii-style crash buzz, and last-second crash audio looping behavior.' },
      { date: '2026-11-25', title: 'weather + audio feel', detail: 'added rain droplet ripples on the ocean surface and muffled music when diving underwater.' },
      { date: '2026-11-25', title: 'big ocean pass', detail: 'thunder/lightning, saved settings, photo mode, click ripples/bubbles, surface life, deeper underwater variety, ambient sfx, message in a bottle, discoveries log, reduced motion, time speed slider, and mobile tuning.' },
      { date: '2026-11-25', title: 'initial ocean release', detail: '2d animated ocean with DeepBlue.wav, day/night cycle, dive controls, settings, and feedback flow.' }
    ];

    function renderUpdateLog() {
      updateList.innerHTML = UPDATE_LOG.map(u => `<div class="update-item"><em>${u.date}</em><strong>${u.title}</strong><span>${u.detail}</span></div>`).join('');
    }

    function renderAchievements() {
      achList.innerHTML = ACHIEVEMENT_DEFS.map(a => {
        const unlocked = achievements.includes(a.id);
        return `<div class="ach ${unlocked ? 'unlocked' : ''}"><div><strong>${unlocked ? '✓' : '•'} ${a.name}</strong><small>${a.desc}</small></div><span>${unlocked ? 'unlocked' : 'locked'}</span></div>`;
      }).join('');
    }
    function renderDiscoveries() {
      discoverHint.textContent = `discoveries: ${discoveries.length}/${DISCOVERY_DEFS.length} found`;
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

    // --- audio sfx ---
    let audioCtx = null, masterGain = null, rainGain = null, windGain = null, underwaterGain = null, dayGain = null, nightGain = null;
    let rainNoise = null, windNoise = null, underwaterNoise = null, dayNoise = null, nightNoise = null;
    let bgmNode = null, bgmFilter = null, captureDest = null, mediaRecorder = null, audioChunks = [], crashLoopAudio = null;
    function ensureAudio() {
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
          bgm.crossOrigin = 'anonymous';
          bgmFilter = audioCtx.createBiquadFilter();
          bgmFilter.type = 'lowpass';
          bgmFilter.frequency.value = 14000;
          bgmFilter.Q.value = 0.7;
          bgmNode = audioCtx.createMediaElementSource(bgm);
          bgmNode.connect(bgmFilter);
          bgmFilter.connect(masterGain);
        } else {
          bgmFilter = null; // avoid file:// cross-origin media silence in WebAudio
        }
      } catch (_) { bgmFilter = null; }
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
      if (!audioCtx || !soundEnabled) return;
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 520; g.gain.value = 0.02;
      o.connect(g); g.connect(masterGain); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.08); o.stop(audioCtx.currentTime + 0.09);
    }
    function sfxDive(down) {
      if (!audioCtx || !soundEnabled) return;
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(down ? 420 : 220, audioCtx.currentTime);
      o.frequency.exponentialRampToValueAtTime(down ? 180 : 480, audioCtx.currentTime + 0.35);
      g.gain.value = 0.025; o.connect(g); g.connect(masterGain); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4); o.stop(audioCtx.currentTime + 0.41);
    }
    function sfxSplash() {
      if (!audioCtx || !soundEnabled) return;
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type='triangle'; o.frequency.setValueAtTime(240, audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(90, audioCtx.currentTime+0.18);
      g.gain.value=0.03; o.connect(g); g.connect(masterGain); o.start(); g.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+0.2); o.stop(audioCtx.currentTime+0.21);
    }
    function sfxBubble() {
      if (!audioCtx || !soundEnabled) return;
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type='sine'; o.frequency.setValueAtTime(520, audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime+0.08);
      g.gain.value=0.012; o.connect(g); g.connect(masterGain); o.start(); g.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+0.1); o.stop(audioCtx.currentTime+0.11);
    }
    function sfxThunder() {
      if (!audioCtx || !soundEnabled) return;
      const len = audioCtx.sampleRate * 1.2;
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i=0;i<len;i++) data[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 2);
      const src = audioCtx.createBufferSource(); src.buffer = buf;
      const f = audioCtx.createBiquadFilter(); f.type='lowpass'; f.frequency.value = 220;
      const g = audioCtx.createGain(); g.gain.value = 0.18;
      src.connect(f); f.connect(g); g.connect(masterGain); src.start();
    }
    function updateAudioMix() {
      bgm.muted = !soundEnabled;
      const depthRaw = Number.isFinite(cameraY) ? Math.max(0, Math.min(MAX_DEPTH, cameraY)) : 0;
      const under = Math.min(1, depthRaw);
      const abyss = Math.max(0, depthRaw - 1);
      const volBase = Number.isFinite(masterVolume) ? Math.max(0, Math.min(1, masterVolume)) : 0.65;
      const duck = bgmFilter ? 1 : lerp(1, 0.22, Math.pow(depthRaw / MAX_DEPTH, 1.1));
      const vol = volBase * (Number.isFinite(duck) ? duck : 1);
      bgm.volume = Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : volBase;
      if (!audioCtx) return;
      const on = soundEnabled ? 1 : 0;
      masterGain.gain.setTargetAtTime(on * masterVolume, audioCtx.currentTime, 0.08);
      const surface = Math.max(0, 1 - depthRaw);
      const d = dayFactor;
      rainGain.gain.setTargetAtTime(surface * Math.min(1, weatherIntensity) * 0.2, audioCtx.currentTime, 0.25);
      windGain.gain.setTargetAtTime(surface * Math.max(0, weatherIntensity - 0.8) * 0.16, audioCtx.currentTime, 0.3);
      underwaterGain.gain.setTargetAtTime((under * 0.08) + (abyss * 0.04), audioCtx.currentTime, 0.2);
      dayGain.gain.setTargetAtTime(surface * d * (0.012 + (1-Math.min(1,weatherIntensity))*0.01), audioCtx.currentTime, 0.4);
      nightGain.gain.setTargetAtTime(surface * (1-d) * 0.01, audioCtx.currentTime, 0.4);
      if (rainNoise) rainNoise.f.frequency.setTargetAtTime(900 + weatherIntensity * 700, audioCtx.currentTime, 0.2);
      if (windNoise) windNoise.f.frequency.setTargetAtTime(400 + weatherIntensity * 250, audioCtx.currentTime, 0.2);
      if (bgmFilter) {
        const cutoff = lerp(14000, 420, Math.pow(depthRaw / MAX_DEPTH, 1.25));
        bgmFilter.frequency.setTargetAtTime(cutoff, audioCtx.currentTime, 0.18);
        bgmFilter.Q.setTargetAtTime(0.7 + Math.min(1, depthRaw) * 0.8, audioCtx.currentTime, 0.18);
      }
    }

    function easeInOutCubic(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
    function setCamera(target) {
      target = Math.max(0, Math.min(MAX_DEPTH, target));
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
    function mix(c1,c2,p){ return `rgb(${Math.round(lerp(c1[0],c2[0],p))}, ${Math.round(lerp(c1[1],c2[1],p))}, ${Math.round(lerp(c1[2],c2[2],p))})`; }
    function getCyclePhase() {
      if (forcedMode === 'day') return 0.25;
      if (forcedMode === 'night') return 0.75;
      if (!dayCycle) return manualDayPhase;
      const speed = reducedMotion ? Math.min(cycleSpeed, 0.35) : cycleSpeed;
      return ((simTime * 0.00003 * speed) % 1 + 1) % 1;
    }
    function getDayFactor() {
      const phase = getCyclePhase();
      // 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight
      return Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
    }

    function bodyPos(phase) {
      // Put sun/moon in the same upper sky position (not ocean), alternating by phase
      const a = phase * Math.PI * 2 - Math.PI / 2;
      return { x: w * 0.78, y: h * (0.2 - Math.sin(a) * 0.08) };
    }

    const rainDrops = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), l: 8 + Math.random()*16, s: 0.6 + Math.random()*1.2 }));
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

    function drawSky() {
      dayFactor = getDayFactor();
      const d = dayFactor;
      const phase = getCyclePhase();
      const nightTop=[2,6,20], nightMid=[5,22,45], nightLow=[8,34,62], nightBot=[5,18,37];
      const dayTop=[80,170,235], dayMid=[120,200,255], dayLow=[160,220,255], dayBot=[210,238,255];
      const stormDark = Math.min(0.55, weatherIntensity * 0.22);
      const darken = (c) => [Math.round(c[0]*(1-stormDark)), Math.round(c[1]*(1-stormDark)), Math.round(c[2]*(1-stormDark))];
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, mix(darken(nightTop), darken(dayTop), d));
      g.addColorStop(0.35, mix(darken(nightMid), darken(dayMid), d));
      g.addColorStop(0.6, mix(darken(nightLow), darken(dayLow), d));
      g.addColorStop(1, mix(darken(nightBot), darken(dayBot), d));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      drawLightning();

      const sun = bodyPos(phase);
      const moon = bodyPos((phase + 0.5) % 1);
      const isDay = Math.sin(phase * Math.PI * 2) >= 0;
      const sunA = isDay ? Math.max(0, Math.min(1, (d - 0.15) / 0.35)) : 0;
      const moonA = !isDay ? Math.max(0, Math.min(1, (0.45 - d) / 0.35)) : 0;

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
      const count = Math.min(rainDrops.length, Math.floor((reducedMotion ? 20 : 40) + weatherIntensity * (reducedMotion ? 70 : 140)));
      const horizon = h * 0.58;
      ctx.save();
      ctx.lineCap = 'round';
      for (let i=0; i<count; i++) {
        const d = rainDrops[i];
        if (!d) continue;
        const x = ((d.x * w) + animTime * 0.03 * d.s) % w;
        const travel = h + 30;
        const yRaw = d.y * h + animTime * (0.35 + weatherIntensity*0.35) * d.s;
        const prev = d._yRaw ?? yRaw;
        const y = (yRaw % travel) - 20;
        const prevY = (prev % travel) - 20;
        const waterY = getWaveY(x, horizon);
        const crossed = (prevY < waterY && y >= waterY) || (yRaw - prev > travel * 0.5);
        if (crossed && Math.random() < 0.45) {
          ripples.push({ x, y: waterY + 1, r: 1.5 + Math.random()*2.5, age: 0, life: 550 + Math.random()*350, rain: true });
          if (ripples.length > 140) ripples.splice(0, ripples.length - 140);
        }
        d._yRaw = yRaw;
        const x2 = x - 2.2 * d.s;
        const y2 = y + d.l * 1.15;
        if (y >= waterY) continue;
        let drawY2 = y2, drawX2 = x2;
        if (y2 > waterY) {
          const tHit = (waterY - y) / ((y2 - y) || 1);
          drawY2 = waterY; drawX2 = x + (x2 - x) * tHit;
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
      } else if (['clownfish','pufferfish','shark','betta','koi'].includes(equippedDiscovery) && window.OceanFish) {
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
      const phase = getCyclePhase();
      const isDay = Math.sin(phase * Math.PI * 2) >= 0;
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
      const phase = getCyclePhase();
      const sun = bodyPos(phase);
      const moon = bodyPos((phase + 0.5) % 1);
      const isDay = Math.sin(phase * Math.PI * 2) >= 0;
      const d = dayFactor;
      const b = isDay ? sun : moon;
      const vis = isDay ? Math.max(0, Math.min(1, (d - 0.15) / 0.35)) : Math.max(0, Math.min(1, (0.45 - d) / 0.35));
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
      const phase = getCyclePhase();
      const sun = bodyPos(phase);
      const moon = bodyPos((phase + 0.5) % 1);
      const isDay = Math.sin(phase * Math.PI * 2) >= 0;
      const b = isDay ? sun : moon;
      const mx = b.x;
      const vis = isDay ? Math.max(0, Math.min(1, (d - 0.15) / 0.35)) : Math.max(0, Math.min(1, (0.45 - d) / 0.35));
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
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgb(${topCol[0]},${topCol[1]},${topCol[2]})`);
      g.addColorStop(0.45, `rgb(${midCol[0]},${midCol[1]},${midCol[2]})`);
      g.addColorStop(1, `rgb(${deepCol[0]},${deepCol[1]},${deepCol[2]})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

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

      if (window.OceanFish) window.OceanFish.drawInWorld(ctx, { w, h, animTime, dt: 1/60, reducedMotion });

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
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#020713');
      g.addColorStop(0.35, '#01030b');
      g.addColorStop(1, '#000105');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // faint bioluminescent haze
      const haze = ctx.createRadialGradient(w*0.5, h*0.35, 20, w*0.5, h*0.45, w*0.7);
      haze.addColorStop(0, 'rgba(40,80,140,0.08)');
      haze.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = haze; ctx.fillRect(0,0,w,h);

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
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#000308');
      g.addColorStop(0.4, '#01010a');
      g.addColorStop(1, '#000003');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

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
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#000005');
      g.addColorStop(0.5, '#020006');
      g.addColorStop(1, '#000000');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

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

    function drawVoid() {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#000000');
      g.addColorStop(0.5, '#010002');
      g.addColorStop(1, '#000000');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // distant void glow
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

      // bottom nothingness
      const fade = ctx.createLinearGradient(0,h-120,0,h);
      fade.addColorStop(0,'rgba(0,0,0,0)');
      fade.addColorStop(1,'rgba(0,0,0,0.7)');
      ctx.fillStyle = fade; ctx.fillRect(0,h-120,w,120);

      const topFade = ctx.createLinearGradient(0,0,0,120);
      topFade.addColorStop(0,'rgba(0,0,0,0.95)');
      topFade.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle = topFade; ctx.fillRect(0,0,w,120);
    }

    function render(ts) {
      t = ts;
      dt = Math.min(0.05, (ts - (lastT || ts)) / 1000);
      lastT = ts;
      simTime += dt * 1000;
      motionMul = reducedMotion ? 0.25 : 1;
      animTime += dt * 1000 * motionMul;

      // weather: manual or dynamic
      if (weatherMode === 'clear') weatherTarget = 0;
      else if (weatherMode === 'rain') weatherTarget = 1;
      else if (weatherMode === 'storm') weatherTarget = 1.8;
      else {
        const phase = getCyclePhase();
        const night = Math.cos(phase * Math.PI * 2) < -0.1 ? 1 : 0;
        const wave = (Math.sin(simTime * 0.00008) + 1) / 2;
        weatherTarget = night * 0.45 + wave * 0.9;
      }
      weatherIntensity += (weatherTarget - weatherIntensity) * Math.min(1, dt * 0.8);

      // lightning
      lightning = Math.max(0, lightning - dt * 2.2);
      nextLightning -= dt * 1000;
      if (weatherIntensity > 1.2 && nextLightning <= 0) {
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

      ctx.clearRect(0, 0, w, h);
      const camPx = cameraY * h;
      ctx.save();
      ctx.translate(0, -camPx);

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

      drawMist();
      for (const layer of layers) drawWave(layer);
      drawSurfaceLife();
      drawEquippedSurface();
      drawRipplesAndBubbles();
      drawWeather();

      ctx.save();
      ctx.translate(0, h);
      drawUnderwater();
      if (cameraY < 1.5) drawEquippedUnderwater();
      ctx.restore();

      ctx.save();
      ctx.translate(0, h * 2);
      drawAbyss();
      if (cameraY >= 1.5 && cameraY < 2.5) drawEquippedUnderwater();
      ctx.restore();

      ctx.save();
      ctx.translate(0, h * 3);
      drawTrenches();
      if (cameraY >= 2.5 && cameraY < 3.5) drawEquippedUnderwater();
      ctx.restore();

      ctx.save();
      ctx.translate(0, h * 4);
      drawHadal();
      if (cameraY >= 3.5 && cameraY < 4.5) drawEquippedUnderwater();
      ctx.restore();

      ctx.save();
      ctx.translate(0, h * 5);
      drawVoid();
      if (cameraY >= 4.5) drawEquippedUnderwater();
      ctx.restore();

      if (window.OceanFish) window.OceanFish.drawInWorld(ctx, { w, h, animTime, dt, reducedMotion, maxDepth: MAX_DEPTH });

      ctx.restore();

      // photo mode frame (none) + vignette
      const vg = ctx.createRadialGradient(w * 0.5, h * 0.55, Math.min(w,h) * 0.2, w * 0.5, h * 0.6, Math.max(w,h) * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, `rgba(0,0,0,${lerp(0.28,0.14,d) + cameraY*0.18 + weatherIntensity*0.05})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      updateAudioMix();
      if (!crashed) rafId = requestAnimationFrame(render);
    }
    requestAnimationFrame(render);

    function depthLabel(target) {
      if (target <= 0.01) return 'surface';
      if (target < 1.5) return 'underwater';
      if (target < 2.5) return 'abyss';
      if (target < 3.5) return 'trenches';
      if (target < 4.5) return 'hadal';
      return 'the void';
    }
    function syncSettingsUI() {
      setSound.checked = soundEnabled;
      setCycle.checked = dayCycle;
      setDay.checked = forcedMode === 'day';
      setNight.checked = forcedMode === 'night';
      goDownBtn.textContent = cameraTarget >= MAX_DEPTH - 0.01 ? 'bottom' : (cameraTarget >= 0.99 ? 'go deeper' : 'go down');
      goUpBtn.textContent = cameraTarget <= 0.01 ? 'surface' : 'go up';
      goDownBtn.disabled = cameraTarget >= MAX_DEPTH - 0.01;
      goUpBtn.disabled = cameraTarget <= 0.01;
      goDownBtn.style.opacity = goDownBtn.disabled ? '0.45' : '1';
      goUpBtn.style.opacity = goUpBtn.disabled ? '0.45' : '1';
      discoverHint.textContent = `discoveries: ${discoveries.length}/${DISCOVERY_DEFS.length} found • depth: ${depthLabel(cameraTarget)}`;
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

    function syncSettingsUI() {
      setSound.checked = soundEnabled;
      setCycle.checked = dayCycle;
      setSpeed.value = String(Math.round(cycleSpeed * 100));
      speedLabel.textContent = cycleSpeed.toFixed(1) + 'x';
      setDay.checked = forcedMode === 'day';
      setNight.checked = forcedMode === 'night';
      setWeather.value = weatherMode;
      setMotion.checked = reducedMotion;
      setPhoto.checked = photoMode;
      goDownBtn.textContent = cameraTarget >= MAX_DEPTH - 0.01 ? 'bottom' : (cameraTarget >= 0.99 ? 'go deeper' : 'go down');
      goUpBtn.textContent = cameraTarget <= 0.01 ? 'surface' : 'go up';
      goDownBtn.disabled = cameraTarget >= MAX_DEPTH - 0.01;
      goUpBtn.disabled = cameraTarget <= 0.01;
      goDownBtn.style.opacity = goDownBtn.disabled ? '0.45' : '1';
      goUpBtn.style.opacity = goUpBtn.disabled ? '0.45' : '1';
      document.body.classList.toggle('photo-mode', photoMode);
      discoverHint.textContent = `discoveries: ${discoveries.length}/${DISCOVERY_DEFS.length} found • depth: ${depthLabel(cameraTarget)}`;
      renderDiscoveries();
    }

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
      if (!soundEnabled) return;
      ensureAudio();
      if (audioCtx && audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); } catch (e) {}
      }
      try {
        bgm.muted = false;
        bgm.volume = masterVolume;
        if (bgm.paused) await bgm.play();
        started = true;
        hint.classList.add('hidden');
      } catch (e) {
        console.warn('audio play blocked/failed', e);
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

    setSound.addEventListener('change', () => { soundEnabled = setSound.checked; if (soundEnabled) startAudio(); else bgm.pause(); sfxClick(); syncSettingsUI(); saveSettings(); });
    setCycle.addEventListener('change', () => { dayCycle = setCycle.checked; if (!dayCycle) manualDayPhase = getCyclePhase(); sfxClick(); syncSettingsUI(); saveSettings(); });
    setSpeed.addEventListener('input', () => { cycleSpeed = Number(setSpeed.value)/100; speedLabel.textContent = cycleSpeed.toFixed(1)+'x'; saveSettings(); });
    setDay.addEventListener('change', () => {
      if (setDay.checked) { forcedMode = 'day'; setNight.checked = false; dayCycle = false; setCycle.checked = false; }
      else if (!setNight.checked) { forcedMode = null; }
      sfxClick(); syncSettingsUI(); saveSettings();
    });
    setNight.addEventListener('change', () => {
      if (setNight.checked) { forcedMode = 'night'; setDay.checked = false; dayCycle = false; setCycle.checked = false; }
      else if (!setDay.checked) { forcedMode = null; }
      sfxClick(); syncSettingsUI(); saveSettings();
    });
    setWeather.addEventListener('change', () => { weatherMode = setWeather.value; sfxClick(); saveSettings(); });
    setMotion.addEventListener('change', () => { reducedMotion = setMotion.checked; sfxClick(); saveSettings(); });
    function setPhotoMode(on) {
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
    goDownBtn.addEventListener('click', (e) => { e.stopPropagation(); setCamera(Math.min(MAX_DEPTH, cameraTarget + 1)); sfxDive(true); });
    goUpBtn.addEventListener('click', (e) => { e.stopPropagation(); setCamera(Math.max(0, cameraTarget - 1)); sfxDive(false); });
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
    feedbackBtn.addEventListener('click', (e) => { e.stopPropagation(); openFeedback(); });
    feedbackCancel.addEventListener('click', closeFeedback);
    feedbackSend.addEventListener('click', submitFeedback);
    feedbackText.addEventListener('input', updateFeedbackMeta);
    feedbackModal.addEventListener('click', (e) => { if (e.target === feedbackModal) closeFeedback(); });

    canvas.addEventListener('click', (e) => {
      if (e.target.closest('.settings-wrap') || e.target.closest('.modal')) return;
      startAudio();
      clicks += 1;
      checkAchievements();
      saveGameState();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const worldY = y + cameraY * h;
      const horizon = h * 0.58;
      const hitFish = window.OceanFish ? window.OceanFish.hitTest(x, worldY) : null;
      if (cameraY < 0.5 && worldY > horizon && worldY < h) {
        ripples.push({ x, y: worldY, r: 5, age: 0, life: 900 });
        sfxSplash();
        if (bottle.active && Math.abs(x - bottle.screenX) < 22 && Math.abs(worldY - bottle.screenY) < 24) {
          bottle.found = true;
          bottle.active = false;
          bottle.screenX = -999; bottle.screenY = -999;
          bottle.next = 90000 + Math.random() * 120000;
          recordDiscovery('bottle');
          sfxClick();
        }
      } else if (hitFish) {
        recordDiscovery(hitFish.type.id);
        if (window.OceanFish.puff(hitFish)) {
          unlockAchievement('puff_puff');
          for (let i=0;i<8;i++) clickBubbles.push({ x, y: worldY, r: 1.5+Math.random()*3, sp: 0.3+Math.random()*0.7, ph: Math.random()*10, age:0, life: 900+Math.random()*700 });
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

    window.addEventListener('pointerdown', (e) => { if (e.target.closest('.settings-wrap') || e.target.closest('.modal') || e.target === canvas) return; startAudio(); }, { passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeFeedback(); logModal.classList.remove('open'); logModal.setAttribute('aria-hidden','true'); achModal.classList.remove('open'); achModal.setAttribute('aria-hidden','true'); updateModal.classList.remove('open'); updateModal.setAttribute('aria-hidden','true'); settingsPanel.classList.remove('open'); settingsBtn.setAttribute('aria-expanded','false'); setPhotoMode(false); return; }
      if (e.key.toLowerCase() === 'p' && !e.target.closest('textarea,input,select')) { setPhotoMode(!photoMode); return; }
      startAudio();
    });
    checkAchievements();
    renderAchievements();
    renderDiscoveries();
    syncSettingsUI();
  