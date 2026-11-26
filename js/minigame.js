// Deep Dive minigame - visual, Wikipedia-powered rarity scoring
(function () {
  const QUESTIONS = [
    { q: 'name a superhero', hint: 'comic/movie hero' },
    { q: 'name a video game', hint: 'any game' },
    { q: 'name a fruit', hint: 'edible fruit' },
    { q: 'name a country', hint: 'real country' },
    { q: 'name a car brand', hint: 'manufacturer' },
    { q: 'name a movie', hint: 'film title' },
    { q: 'name a musical artist', hint: 'solo or band' },
    { q: 'name a pokemon', hint: 'any pokemon' },
    { q: 'name a food', hint: 'dish/food' },
    { q: 'name an animal', hint: 'real or extinct' },
    { q: 'name a book', hint: 'book title' },
    { q: 'name a city', hint: 'any city' }
  ];

  function norm(s) { return (s || '').toLowerCase().trim().replace(/\s+/g, ' '); }

  function fmtDate(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  async function wikiScore(answer) {
    const q = norm(answer);
    if (!q) return { score: 0, label: 'empty', note: 'type something.', title: '', views: null };
    try {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json&origin=*`;
      const sr = await fetch(searchUrl, { headers: { 'Accept': 'application/json' } });
      if (!sr.ok) throw new Error('search failed');
      const sd = await sr.json();
      const hit = sd?.query?.search?.[0];
      if (!hit) {
        // not found on wikipedia - could be obscure or misspelled; reward obscurity but not max
        return { score: 78, label: 'off-wiki rare', note: 'wikipedia barely knows this one. either super underground or super niche.', title: answer, views: 0 };
      }
      const title = hit.title;
      const end = new Date();
      end.setUTCDate(end.getUTCDate() - 1);
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 30);
      const pvUrl = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/daily/${fmtDate(start)}/${fmtDate(end)}`;
      let views = null;
      try {
        const pr = await fetch(pvUrl, { headers: { 'Accept': 'application/json' } });
        if (pr.ok) {
          const pd = await pr.json();
          views = (pd.items || []).reduce((sum, it) => sum + (it.views || 0), 0);
        }
      } catch (_) {}

      // scoring by views: very high views = common, low = rare
      let score = 50;
      let label = 'uncommon';
      let note = '';
      if (views == null) {
        score = 55; label = 'unknown signal'; note = `found "${title}" on wikipedia, but views were unclear. decent dive.`;
      } else if (views > 500000) {
        score = 6; label = 'mega common'; note = `"${title}" is everywhere (${views.toLocaleString()} views/30d). surface level.`;
      } else if (views > 150000) {
        score = 12; label = 'very common'; note = `"${title}" gets tons of attention (${views.toLocaleString()} views/30d). barely sank.`;
      } else if (views > 50000) {
        score = 22; label = 'common'; note = `"${title}" is well-known (${views.toLocaleString()} views/30d). shallow dive.`;
      } else if (views > 15000) {
        score = 38; label = 'familiar'; note = `"${title}" is known, but not mainstream overload (${views.toLocaleString()} views/30d).`;
      } else if (views > 5000) {
        score = 55; label = 'uncommon'; note = `"${title}" is not an obvious pick (${views.toLocaleString()} views/30d). nice.`;
      } else if (views > 1500) {
        score = 70; label = 'rare'; note = `"${title}" is pretty underground (${views.toLocaleString()} views/30d). good depth.`;
      } else if (views > 300) {
        score = 85; label = 'deep cut'; note = `"${title}" is seriously obscure (${views.toLocaleString()} views/30d). deep dive.`;
      } else {
        score = 96; label = 'abyssal rare'; note = `"${title}" is basically unknown (${views.toLocaleString()} views/30d). abyssal find.`;
      }
      // small bonus if search title doesn't closely match answer (more niche interpretation)
      const an = norm(answer).replace(/[^a-z0-9]/g, '');
      const tn = norm(title).replace(/[^a-z0-9]/g, '');
      if (an && tn && an !== tn && !tn.includes(an) && !an.includes(tn)) {
        score = Math.max(5, score - 8);
        note += ` (matched wiki page "${title}")`;
      }
      return { score: Math.max(0, Math.min(100, Math.round(score))), label, note, title, views };
    } catch (_) {
      // fallback heuristic
      const a = norm(answer);
      let hash = 0; for (let i=0;i<a.length;i++) hash = ((hash<<5)-hash) + a.charCodeAt(i);
      const score = 35 + Math.abs(hash % 45);
      return { score, label: 'offline guess', note: 'could not reach wikipedia, used a fallback score.', title: answer, views: null };
    }
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
          <div>
            <h2>deep dive</h2>
            <div class="minigame-sub">10 moves. rare/underground answers sink deeper. popularity checked with Wikipedia pageviews.</div>
          </div>
          <button class="btn" id="minigameClose" type="button">close</button>
        </div>
        <div class="minigame-layout">
          <div class="minigame-visual">
            <canvas id="mgCanvas" width="320" height="520"></canvas>
            <div class="mg-depth-readout"><span id="mgDepth">0</span>m</div>
          </div>
          <div class="minigame-panel">
            <div class="minigame-status">
              <div class="mg-stat"><span class="mg-stat-label">move</span><span id="mgMove">1</span>/10</div>
              <div class="mg-stat"><span class="mg-stat-label">score</span><span id="mgScore">0</span></div>
              <div class="mg-stat"><span class="mg-stat-label">rank</span><span id="mgRank">surface</span></div>
            </div>
            <div class="minigame-question" id="mgQuestion"></div>
            <div class="mg-hint" id="mgHint"></div>
            <div class="minigame-input-row">
              <input id="mgInput" type="text" maxlength="80" placeholder="type your rarest answer..." autocomplete="off" />
              <button class="btn" id="mgSubmit" type="button">dive</button>
            </div>
            <div class="minigame-result" id="mgResult">the deeper you go, the rarer your answer needs to be.</div>
            <div class="minigame-history" id="mgHistory"></div>
            <div class="minigame-actions"><button class="btn" id="mgRestart" type="button">restart</button><button class="btn" id="mgQuit" type="button">quit</button></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const style = document.createElement('style');
    style.textContent = `
      .minigame-arrow{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:12;border:1px solid rgba(126,200,255,0.22);border-right:0;background:rgba(3,16,34,0.55);color:var(--text);padding:12px 10px 12px 12px;border-radius:14px 0 0 14px;cursor:pointer;backdrop-filter:blur(8px);display:flex;align-items:center;gap:8px;font:inherit;font-size:11px;letter-spacing:.08em;text-transform:uppercase;}
      .minigame-arrow:hover{background:rgba(10,36,68,0.72);border-color:rgba(126,200,255,0.4);}
      .minigame-arrow span{writing-mode:vertical-rl;transform:rotate(180deg);line-height:1;}
      @media (max-width:700px){.minigame-arrow span{display:none;}.minigame-arrow{padding:12px 8px;}}
      .minigame-card{width:min(980px,calc(100vw - 28px));max-height:calc(100vh - 28px);overflow:auto;}
      .minigame-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;}
      .minigame-head h2{margin-bottom:4px;}
      .minigame-sub{font-size:12px;color:var(--muted);line-height:1.5;}
      .minigame-layout{display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);gap:16px;align-items:stretch;}
      .minigame-visual{position:relative;border-radius:14px;overflow:hidden;border:1px solid rgba(126,200,255,0.16);background:#02101f;min-height:420px;height:520px;}
      #mgCanvas{display:block;width:100%;height:100%;}
      .mg-depth-readout{position:absolute;left:12px;top:12px;font-size:22px;color:#dff4ff;text-shadow:0 2px 12px rgba(0,0,0,0.6);}
      .mg-depth-readout span{font-size:34px;color:#8fd7ff;}
      .minigame-panel{min-width:0;display:flex;flex-direction:column;gap:0;}
      .minigame-status{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px;}
      .mg-stat{background:rgba(255,255,255,0.03);border:1px solid rgba(126,200,255,0.1);border-radius:10px;padding:10px;font-size:18px;color:#dff4ff;min-width:0;}
      .mg-stat-label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin-bottom:4px;}
      .minigame-question{font-size:24px;color:#ecf7ff;margin-bottom:4px;line-height:1.3;}
      .mg-hint{font-size:12px;color:var(--muted);margin-bottom:12px;min-height:18px;}
      .minigame-input-row{display:flex;gap:8px;margin-bottom:10px;}
      .minigame-input-row input{flex:1;min-width:0;background:rgba(255,255,255,0.04);color:var(--text);border:1px solid rgba(126,200,255,0.18);border-radius:10px;padding:11px 12px;font:inherit;font-size:14px;}
      .minigame-input-row input:focus{outline:none;border-color:rgba(126,200,255,0.45);}
      .minigame-input-row input:disabled,.btn:disabled{opacity:.55;cursor:not-allowed;}
      .minigame-result{min-height:58px;font-size:13px;line-height:1.55;color:var(--muted);margin-bottom:10px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(126,200,255,0.08);}
      .minigame-result strong{color:#9fd3ff;}
      .minigame-history{flex:1;min-height:120px;max-height:220px;overflow:auto;display:grid;gap:6px;padding-right:4px;align-content:start;margin-bottom:10px;}
      .minigame-history::-webkit-scrollbar{width:8px;}.minigame-history::-webkit-scrollbar-thumb{background:rgba(126,200,255,0.25);border-radius:999px;}
      .mg-item{font-size:12px;color:var(--muted);padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(126,200,255,0.08);display:flex;justify-content:space-between;gap:10px;}
      .mg-item b{color:var(--text);font-weight:500;}
      .minigame-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:auto;flex-wrap:wrap;}
      @media (max-width:860px){.minigame-layout{grid-template-columns:1fr;}.minigame-visual{min-height:280px;height:320px;}.minigame-question{font-size:20px;}}
    `;
    document.head.appendChild(style);
  }

  function init() {
    createUI();
    const modal = document.getElementById('minigameModal');
    const close = document.getElementById('minigameClose');
    const qEl = document.getElementById('mgQuestion');
    const hintEl = document.getElementById('mgHint');
    const input = document.getElementById('mgInput');
    const submit = document.getElementById('mgSubmit');
    const result = document.getElementById('mgResult');
    const history = document.getElementById('mgHistory');
    const moveEl = document.getElementById('mgMove');
    const depthEl = document.getElementById('mgDepth');
    const scoreEl = document.getElementById('mgScore');
    const rankEl = document.getElementById('mgRank');
    const restart = document.getElementById('mgRestart');
    const quit = document.getElementById('mgQuit');
    const canvas = document.getElementById('mgCanvas');
    const ctx = canvas.getContext('2d');

    let move = 0, total = 0, depth = 0, used = [], finished = false, busy = false;
    let targetDepth = 0, displayDepth = 0, bubbles = [], popups = [], particles = [], lastTs = 0;

    function pickQuestion() {
      const pool = QUESTIONS.filter(q => !used.includes(q.q));
      const src = pool.length ? pool : QUESTIONS;
      const q = src[Math.floor(Math.random() * src.length)];
      used.push(q.q);
      return q;
    }
    let current = pickQuestion();

    function rankFor(d) {
      if (d >= 850) return 'abyssal';
      if (d >= 650) return 'deep';
      if (d >= 450) return 'midwater';
      if (d >= 250) return 'shallow';
      return 'surface';
    }

    function resizeCanvas() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(200, Math.floor(r.width * dpr));
      canvas.height = Math.max(200, Math.floor(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawnBubbles(count, y) {
      const r = canvas.getBoundingClientRect();
      for (let i = 0; i < count; i++) {
        bubbles.push({ x: r.width * (0.35 + Math.random()*0.3), y: y + Math.random()*20, r: 1+Math.random()*3, sp: 10+Math.random()*25, a: 0.4+Math.random()*0.4 });
      }
    }

    function addPopup(text, good) {
      popups.push({ text, good, age: 0, life: 1.8 });
    }

    function renderState() {
      moveEl.textContent = String(Math.min(10, move + 1));
      depthEl.textContent = String(Math.round(displayDepth));
      scoreEl.textContent = String(total);
      rankEl.textContent = rankFor(depth);
      qEl.textContent = finished ? 'dive complete' : current.q;
      hintEl.textContent = finished ? 'restart to play again.' : `hint: ${current.hint} • rarer wikipedia page = deeper`;
      input.disabled = finished || busy;
      submit.disabled = finished || busy;
      submit.textContent = busy ? 'checking...' : 'dive';
    }

    function drawVisual(ts) {
      if (!modal.classList.contains('open')) { requestAnimationFrame(drawVisual); return; }
      if (!lastTs) lastTs = ts;
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      displayDepth += (targetDepth - displayDepth) * Math.min(1, dt * 4);
      const r = canvas.getBoundingClientRect();
      const w = r.width, h = r.height;
      ctx.clearRect(0, 0, w, h);

      // ocean gradient background
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#4ea7d8'); bg.addColorStop(0.08, '#1c6ea8'); bg.addColorStop(0.25, '#0e4878');
      bg.addColorStop(0.5, '#082b52'); bg.addColorStop(0.75, '#04162d'); bg.addColorStop(1, '#01040d');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

      // depth zones
      const zones = [
        { pct: 0, name: 'surface', c: 'rgba(255,255,255,0.08)' },
        { pct: 0.25, name: 'shallow', c: 'rgba(120,210,255,0.07)' },
        { pct: 0.45, name: 'midwater', c: 'rgba(90,170,255,0.06)' },
        { pct: 0.65, name: 'deep', c: 'rgba(70,120,255,0.06)' },
        { pct: 0.85, name: 'abyss', c: 'rgba(120,80,255,0.07)' }
      ];
      ctx.font = '10px Consolas, monospace';
      ctx.fillStyle = 'rgba(220,245,255,0.35)';
      for (const z of zones) {
        const y = z.pct * h;
        ctx.strokeStyle = z.c; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        ctx.fillText(z.name, 8, y + 14);
      }

      // light rays near top
      ctx.save(); ctx.globalAlpha = 0.08;
      for (let i=0;i<4;i++) { ctx.fillStyle='#9fdcff'; ctx.beginPath(); ctx.moveTo(w*(0.2+i*0.18),0); ctx.lineTo(w*(0.26+i*0.18),0); ctx.lineTo(w*(0.38+i*0.18),h*0.45); ctx.lineTo(w*(0.08+i*0.18),h*0.45); ctx.closePath(); ctx.fill(); }
      ctx.restore();

      // bubbles
      ctx.strokeStyle = 'rgba(170,225,255,0.35)'; ctx.lineWidth = 1;
      for (let i=bubbles.length-1;i>=0;i--) {
        const b = bubbles[i]; b.y -= b.sp * dt; b.a -= dt * 0.15;
        if (b.a <= 0 || b.y < -10) { bubbles.splice(i,1); continue; }
        ctx.globalAlpha = b.a; ctx.beginPath(); ctx.arc(b.x + Math.sin(ts*0.002+i)*3, b.y, b.r, 0, Math.PI*2); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // diver/sub
      const diverY = 30 + (displayDepth / 1000) * (h - 80);
      const diverX = w * 0.5 + Math.sin(ts * 0.0012) * 8;
      ctx.save(); ctx.translate(diverX, diverY);
      // tether
      ctx.strokeStyle = 'rgba(180,230,255,0.15)'; ctx.beginPath(); ctx.moveTo(0,-diverY); ctx.lineTo(0,-18); ctx.stroke();
      // body
      ctx.fillStyle = '#dcecf8'; ctx.strokeStyle = '#7ea6bf'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, 16, 20, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      // window
      ctx.fillStyle = '#74d7ff'; ctx.beginPath(); ctx.arc(0, -4, 8, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-2, -6, 2.5, 0, Math.PI*2); ctx.fill();
      // fins
      ctx.fillStyle = '#9bc2d8'; ctx.fillRect(-20, 10, 8, 12); ctx.fillRect(12, 10, 8, 12);
      // prop
      ctx.fillStyle = '#89b0c6'; ctx.fillRect(-6, 18, 12, 5);
      ctx.restore();

      // target marker
      const ty = 30 + (targetDepth / 1000) * (h - 80);
      ctx.strokeStyle = 'rgba(140,255,210,0.35)'; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(w, ty); ctx.stroke(); ctx.setLineDash([]);

      // popups
      for (let i=popups.length-1;i>=0;i--) {
        const p = popups[i]; p.age += dt;
        const t = p.age / p.life;
        if (t >= 1) { popups.splice(i,1); continue; }
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = p.good ? '#8ff0c0' : '#ffb3b3';
        ctx.font = 'bold 16px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, w*0.5, diverY - 28 - t * 30);
        ctx.textAlign = 'left';
      }
      ctx.globalAlpha = 1;

      // ambient particles
      if (particles.length < 30) particles.push({ x: Math.random()*w, y: Math.random()*h, r: Math.random()*1.8+0.4, s: 4+Math.random()*10 });
      ctx.fillStyle = 'rgba(160,220,255,0.18)';
      for (const p of particles) { p.y -= p.s * dt * 0.2; if (p.y < -5) { p.y = h+5; p.x = Math.random()*w; } ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill(); }

      // depth scale on right
      ctx.fillStyle = 'rgba(220,245,255,0.25)'; ctx.font = '9px Consolas, monospace';
      for (let m=0;m<=1000;m+=100) { const y = 30 + (m/1000)*(h-80); ctx.fillRect(w-18, y, 10, 1); ctx.fillText(String(m), w-38, y+3); }

      requestAnimationFrame(drawVisual);
    }

    function endGame() {
      finished = true;
      const rank = rankFor(depth);
      const msg = depth >= 850 ? 'abyssal legend. you really went underground.' : depth >= 650 ? 'deep diver. solid obscure picks.' : depth >= 450 ? 'midwater drifter. not bad, but still too mainstream.' : depth >= 250 ? 'shallow swimmer. the commons got you.' : 'surface floater. wikipedia knew everything you said.';
      result.innerHTML = `<strong>final rank: ${rank}</strong><br>you reached ${Math.round(depth)}m in 10 moves with ${total} points. ${msg}`;
      renderState();
    }

    async function submitAnswer() {
      if (finished || busy) return;
      const val = input.value.trim();
      if (!val) { result.textContent = 'type an answer first.'; return; }
      busy = true; renderState();
      result.innerHTML = `<strong>checking wikipedia...</strong> measuring how underground "${val}" is.`;
      const r = await wikiScore(val);
      busy = false;
      if (finished) return; // modal closed/reset edge case
      move += 1;
      total += r.score;
      depth = Math.min(1000, depth + r.score);
      targetDepth = depth;
      spawnBubbles(Math.max(4, Math.floor(r.score / 8)), 30 + (displayDepth / 1000) * (canvas.getBoundingClientRect().height - 80));
      addPopup(`+${r.score}m`, r.score >= 55);
      const item = document.createElement('div');
      item.className = 'mg-item';
      item.innerHTML = `<span><b>${escapeHtml(val)}</b> → ${escapeHtml(r.title || val)}</span><span>${r.score} • ${escapeHtml(r.label)}</span>`;
      history.prepend(item);
      result.innerHTML = `<strong>+${r.score} depth</strong> (${escapeHtml(r.label)})<br>${escapeHtml(r.note)}`;
      input.value = '';
      if (move >= 10) { endGame(); return; }
      current = pickQuestion();
      renderState();
      input.focus();
    }

    function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

    function reset() {
      move = 0; total = 0; depth = 0; targetDepth = 0; displayDepth = 0; used = []; finished = false; busy = false;
      bubbles = []; popups = []; history.innerHTML = ''; result.textContent = 'the deeper you go, the rarer your answer needs to be.';
      current = pickQuestion();
      renderState();
      input.focus();
    }

    function closeGame() { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); }
    function openGame() { modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); resizeCanvas(); renderState(); setTimeout(()=>input.focus(),50); }
    document.getElementById('minigameBtn').addEventListener('click', openGame);
    close.addEventListener('click', closeGame);
    quit.addEventListener('click', closeGame);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeGame(); });
    submit.addEventListener('click', submitAnswer);
    restart.addEventListener('click', reset);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitAnswer(); } });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) closeGame(); });
    window.addEventListener('resize', () => { if (modal.classList.contains('open')) resizeCanvas(); });
    renderState();
    requestAnimationFrame(drawVisual);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();