// Deep Dive minigame: 10 moves to reach the deepest part of the ocean
(function () {
  const QUESTIONS = [
    { q: 'name a superhero', common: ['spider-man','spiderman','spider man','iron man','ironman','batman','superman','captain america','hulk','thor','wonder woman','black widow','black panther','wolverine','flash','aquaman','deadpool','ant-man','antman','doctor strange','dr strange','scarlet witch','hawkeye','green lantern','captain marvel'] },
    { q: 'name a video game', common: ['minecraft','fortnite','roblox','gta','grand theft auto','call of duty','cod','mario','zelda','pokemon','pokémon','league of legends','valorant','apex legends','overwatch','counter-strike','csgo','cs2','skyrim','elden ring','fifa','2k','among us','terraria','halo'] },
    { q: 'name a fruit', common: ['apple','banana','orange','grape','grapes','strawberry','watermelon','mango','pineapple','pear','peach','cherry','lemon','lime','blueberry','kiwi','coconut','papaya'] },
    { q: 'name a country', common: ['usa','united states','america','canada','mexico','uk','united kingdom','england','france','germany','italy','spain','china','japan','india','brazil','australia','russia'] },
    { q: 'name a car brand', common: ['toyota','honda','ford','bmw','mercedes','mercedes-benz','audi','tesla','chevrolet','chevy','nissan','hyundai','kia','volkswagen','vw','porsche','ferrari','lamborghini'] },
    { q: 'name a movie', common: ['avatar','titanic','star wars','avengers','endgame','inception','the dark knight','dark knight','jurassic park','harry potter','frozen','barbie','oppenheimer','spider-man','batman','superman','shrek','toy story'] },
    { q: 'name a musical artist', common: ['taylor swift','drake','kanye','kanye west','eminem','beyonce','beyoncé','rihanna','ed sheeran','the weeknd','ariana grande','billie eilish','justin bieber','travis scott','kendrick lamar','post malone','bruno mars','adele'] },
    { q: 'name a pokemon', common: ['pikachu','charizard','bulbasaur','squirtle','eevee','mewtwo','snorlax','gengar','jigglypuff','lucario','greninja','rayquaza','garchomp','umbreon','arceus','mew'] },
    { q: 'name a food', common: ['pizza','burger','hamburger','fries','french fries','pasta','sushi','tacos','taco','chicken','rice','salad','sandwich','ice cream','steak','ramen','noodles','burrito'] },
    { q: 'name an animal', common: ['dog','cat','lion','tiger','elephant','bear','wolf','fox','shark','dolphin','whale','eagle','snake','monkey','horse','rabbit','deer','panda'] }
  ];

  function norm(s) {
    return (s || '').toLowerCase().trim().replace(/[^a-z0-9\s'-]/g, '').replace(/\s+/g, ' ');
  }

  function rarityScore(answer, commonList) {
    const a = norm(answer);
    if (!a) return { score: 0, label: 'empty', note: 'type something.' };
    // exact or contained common
    for (const c of commonList) {
      const cn = norm(c);
      if (a === cn) return { score: 8 + Math.floor(Math.random()*8), label: 'surface common', note: `"${answer}" is super well-known. barely moved the needle.` };
      if (a.includes(cn) || cn.includes(a)) return { score: 14 + Math.floor(Math.random()*10), label: 'common', note: `too familiar. the ocean barely noticed.` };
    }
    // heuristic: longer/more specific/less common words get more
    const words = a.split(' ').filter(Boolean);
    const lenBonus = Math.min(20, a.length * 0.8);
    const wordBonus = Math.min(18, words.length * 6);
    const rareChars = (a.match(/[xzqjk]/g) || []).length * 2;
    let hash = 0; for (let i=0;i<a.length;i++) hash = ((hash<<5)-hash) + a.charCodeAt(i);
    const noise = Math.abs(hash % 20);
    let score = 45 + lenBonus + wordBonus + rareChars + noise;
    score = Math.max(35, Math.min(100, Math.round(score)));
    let label = 'deep cut';
    let note = 'nice, that\'s not obvious. you sank deeper.';
    if (score >= 85) { label = 'abyssal rare'; note = 'underground pick. the deep ocean respects it.'; }
    else if (score >= 70) { label = 'rare'; note = 'pretty obscure. solid dive.'; }
    else if (score >= 55) { label = 'uncommon'; note = 'not the usual answer. decent depth.'; }
    return { score, label, note };
  }

  function createUI() {
    if (document.getElementById('minigameBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'minigameBtn';
    btn.className = 'minigame-arrow ui';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Open Deep Dive minigame');
    btn.innerHTML = '<span>deep dive</span><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
    document.body.appendChild(btn);

    const modal = document.createElement('div');
    modal.id = 'minigameModal';
    modal.className = 'modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="modal-card minigame-card" role="dialog" aria-modal="true" aria-label="Deep Dive minigame">
        <div class="minigame-head">
          <h2>deep dive</h2>
          <button class="btn" id="minigameClose" type="button">close</button>
        </div>
        <div class="minigame-sub">10 moves. answer with the most underground/unknown thing you can think of. common answers barely move you. rare answers sink you deeper.</div>
        <div class="minigame-status">
          <div>move <span id="mgMove">1</span>/10</div>
          <div>depth <span id="mgDepth">0</span>m</div>
          <div>score <span id="mgScore">0</span></div>
        </div>
        <div class="minigame-meter"><div class="minigame-fill" id="mgFill"></div></div>
        <div class="minigame-question" id="mgQuestion"></div>
        <div class="minigame-input-row">
          <input id="mgInput" type="text" maxlength="80" placeholder="type your rarest answer..." autocomplete="off" />
          <button class="btn" id="mgSubmit" type="button">dive</button>
        </div>
        <div class="minigame-result" id="mgResult"></div>
        <div class="minigame-history" id="mgHistory"></div>
        <div class="modal-actions"><button class="btn" id="mgRestart" type="button">restart</button></div>
      </div>`;
    document.body.appendChild(modal);

    const style = document.createElement('style');
    style.textContent = `
      .minigame-arrow{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:12;border:1px solid rgba(126,200,255,0.22);border-right:0;background:rgba(3,16,34,0.55);color:var(--text);padding:12px 10px 12px 12px;border-radius:14px 0 0 14px;cursor:pointer;backdrop-filter:blur(8px);display:flex;align-items:center;gap:8px;font:inherit;font-size:11px;letter-spacing:.08em;text-transform:uppercase;}
      .minigame-arrow:hover{background:rgba(10,36,68,0.72);border-color:rgba(126,200,255,0.4);}
      .minigame-arrow span{writing-mode:vertical-rl;transform:rotate(180deg);line-height:1;}
      @media (max-width:700px){.minigame-arrow span{display:none;}.minigame-arrow{padding:12px 8px;}}
      .minigame-card{width:min(720px,calc(100vw - 32px));}
      .minigame-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;}
      .minigame-sub{font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:12px;}
      .minigame-status{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--text);margin-bottom:10px;}
      .minigame-status span{color:#9fd3ff;}
      .minigame-meter{height:14px;border-radius:999px;background:rgba(255,255,255,0.07);border:1px solid rgba(126,200,255,0.14);overflow:hidden;margin-bottom:14px;}
      .minigame-fill{height:100%;width:0%;background:linear-gradient(90deg,#3ba0d8,#1b5ea8,#0b2448);transition:width .35s ease;}
      .minigame-question{font-size:18px;color:#ecf7ff;margin-bottom:12px;line-height:1.4;}
      .minigame-input-row{display:flex;gap:8px;margin-bottom:10px;}
      .minigame-input-row input{flex:1;background:rgba(255,255,255,0.04);color:var(--text);border:1px solid rgba(126,200,255,0.18);border-radius:10px;padding:11px 12px;font:inherit;font-size:14px;}
      .minigame-input-row input:focus{outline:none;border-color:rgba(126,200,255,0.45);}
      .minigame-result{min-height:44px;font-size:13px;line-height:1.5;color:var(--muted);margin-bottom:10px;}
      .minigame-result strong{color:#9fd3ff;}
      .minigame-history{max-height:180px;overflow:auto;display:grid;gap:6px;padding-right:4px;}
      .minigame-history::-webkit-scrollbar{width:8px;}.minigame-history::-webkit-scrollbar-thumb{background:rgba(126,200,255,0.25);border-radius:999px;}
      .mg-item{font-size:12px;color:var(--muted);padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(126,200,255,0.08);display:flex;justify-content:space-between;gap:10px;}
      .mg-item b{color:var(--text);font-weight:500;}
    `;
    document.head.appendChild(style);
  }

  function init() {
    createUI();
    const btn = document.getElementById('minigameBtn');
    const modal = document.getElementById('minigameModal');
    const close = document.getElementById('minigameClose');
    const qEl = document.getElementById('mgQuestion');
    const input = document.getElementById('mgInput');
    const submit = document.getElementById('mgSubmit');
    const result = document.getElementById('mgResult');
    const history = document.getElementById('mgHistory');
    const moveEl = document.getElementById('mgMove');
    const depthEl = document.getElementById('mgDepth');
    const scoreEl = document.getElementById('mgScore');
    const fill = document.getElementById('mgFill');
    const restart = document.getElementById('mgRestart');

    let move = 0, total = 0, depth = 0, used = [], finished = false;

    function pickQuestion() {
      const pool = QUESTIONS.filter(q => !used.includes(q.q));
      const src = pool.length ? pool : QUESTIONS;
      const q = src[Math.floor(Math.random() * src.length)];
      used.push(q.q);
      return q;
    }
    let current = pickQuestion();

    function renderState() {
      moveEl.textContent = String(Math.min(10, move + 1));
      depthEl.textContent = String(depth);
      scoreEl.textContent = String(total);
      fill.style.width = Math.min(100, (depth / 1000) * 100) + '%';
      qEl.textContent = finished ? 'dive complete' : current.q;
      input.disabled = finished;
      submit.disabled = finished;
      if (finished) input.value = '';
    }

    function endGame() {
      finished = true;
      const rank = depth >= 850 ? 'abyssal legend' : depth >= 650 ? 'deep diver' : depth >= 450 ? 'midwater drifter' : depth >= 250 ? 'shallow swimmer' : 'surface floater';
      result.innerHTML = `<strong>final rank: ${rank}</strong><br>you reached ${depth}m in 10 moves with ${total} points. ${depth >= 850 ? 'you found the real deep cuts.' : 'go more underground next time.'}`;
      renderState();
    }

    function submitAnswer() {
      if (finished) return;
      const val = input.value.trim();
      if (!val) { result.textContent = 'type an answer first.'; return; }
      const r = rarityScore(val, current.common);
      move += 1;
      total += r.score;
      depth = Math.min(1000, depth + r.score);
      const item = document.createElement('div');
      item.className = 'mg-item';
      item.innerHTML = `<span><b>${val}</b> — ${current.q}</span><span>${r.score} • ${r.label}</span>`;
      history.prepend(item);
      result.innerHTML = `<strong>+${r.score} depth</strong> (${r.label}) — ${r.note}`;
      input.value = '';
      if (move >= 10) { endGame(); return; }
      current = pickQuestion();
      renderState();
      input.focus();
    }

    function reset() {
      move = 0; total = 0; depth = 0; used = []; finished = false; history.innerHTML = ''; result.textContent = '';
      current = pickQuestion();
      renderState();
      input.focus();
    }

    btn.addEventListener('click', () => { modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); renderState(); setTimeout(()=>input.focus(),50); });
    close.addEventListener('click', () => { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); });
    modal.addEventListener('click', (e) => { if (e.target === modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); } });
    submit.addEventListener('click', submitAnswer);
    restart.addEventListener('click', reset);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitAnswer(); } });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); } });
    renderState();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();