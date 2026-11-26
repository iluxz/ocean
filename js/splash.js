// Lux Studios splash - plays on every load, then fades into the ocean
(function () {
  if (document.getElementById('luxSplash')) return;

  const overlay = document.createElement('div');
  overlay.id = 'luxSplash';
  overlay.innerHTML = '<canvas id="luxSplashCanvas"></canvas>';
  document.body.appendChild(overlay);

  const style = document.createElement('style');
  style.textContent = `
    #luxSplash{position:fixed;inset:0;z-index:200;background:#020814;opacity:1;transition:opacity .8s ease;}
    #luxSplash.fade{opacity:0;pointer-events:none;}
    #luxSplashCanvas{position:absolute;inset:0;width:100%;height:100%;display:block;}
  `;
  document.head.appendChild(style);

  const canvas = document.getElementById('luxSplashCanvas');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  const PURPLE = '#a97bff';
  const LINE = '#cfe6ff';
  const S = 64;          // cube size
  const R = S / 2;       // rolling radius

  // line-explosion sparks (minimal: just segments flying outward)
  const sparks = [];
  for (let i = 0; i < 44; i++) {
    sparks.push({
      a: (i / 44) * Math.PI * 2 + (Math.random() - 0.5) * 0.22,
      sp: 260 + Math.random() * 560,
      len: 16 + Math.random() * 54,
      w: 1 + Math.random() * 1.6
    });
  }

  // reduced motion? respect the ocean's saved setting
  let reduced = false;
  try { reduced = !!(JSON.parse(localStorage.getItem('ocean_settings') || 'null') || {}).reducedMotion; } catch (_) {}

  let clock = 0;
  let last = performance.now();
  let done = false;
  let fastForward = false;
  let finishAt = reduced ? 0.9 : 3.6;

  function finish() {
    if (done) return;
    done = true;
    overlay.classList.add('fade');
    setTimeout(() => overlay.remove(), 900);
  }

  function skip() {
    if (done || fastForward) return;
    fastForward = true;
    if (clock < 2.55) clock = 2.55; // jump to the text beat
    finishAt = 2.9;
  }
  overlay.addEventListener('click', skip);
  window.addEventListener('keydown', skip);

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeInCubic = (t) => t * t * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function drawCube(x, y, rot, alpha, sx, sy) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(sx, sy);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    // outer square
    ctx.strokeRect(-S / 2, -S / 2, S, S);
    // inner square + connectors = wireframe box, lines only
    const s2 = S * 0.44;
    ctx.strokeRect(-s2 / 2, -s2 / 2, s2, s2);
    ctx.beginPath();
    ctx.moveTo(-S / 2, -S / 2); ctx.lineTo(-s2 / 2, -s2 / 2);
    ctx.moveTo(S / 2, -S / 2); ctx.lineTo(s2 / 2, -s2 / 2);
    ctx.moveTo(S / 2, S / 2); ctx.lineTo(s2 / 2, s2 / 2);
    ctx.moveTo(-S / 2, S / 2); ctx.lineTo(-s2 / 2, s2 / 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawText(alpha, scale) {
    const fs = Math.min(68, Math.max(30, Math.round(W * 0.085)));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.font = `700 ${fs}px Consolas, "Lucida Console", "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const lux = 'lux';
    const rest = ' studios';
    const wLux = ctx.measureText(lux).width;
    const wRest = ctx.measureText(rest).width;
    const x0 = -(wLux + wRest) / 2;
    ctx.fillStyle = PURPLE;
    ctx.fillText(lux, x0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(rest, x0 + wLux, 0);
    ctx.restore();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (fastForward && clock < finishAt) clock = Math.max(clock + dt * 6, finishAt);
    else clock += dt;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#020814';
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;

    if (reduced) {
      // reduced motion: no rolling/explosion, just the wordmark
      drawText(clamp01(clock / 0.35), 1);
    } else {
      // 1) cube rolls in from the left, accelerating
      const rollT = clamp01((clock - 0.25) / 1.3);
      const x = -R - 20 + (cx - (-R - 20)) * easeInCubic(rollT);
      const rot = (x + R + 20) / R;

      // 2) squash on impact, then 3) explode into lines
      const boomT = clock - 1.65;
      if (boomT < 0) {
        // pre-explosion: roll + tiny squash right at the end
        const sq = rollT > 0.92 ? 1 + (rollT - 0.92) * 1.6 : 1;
        const sqy = rollT > 0.92 ? 1 - (rollT - 0.92) * 1.2 : 1;
        drawCube(x, cy, rot, 1, sq, sqy);
      } else {
        // fading cube remnant
        const cubeAlpha = clamp01(1 - boomT / 0.28);
        if (cubeAlpha > 0) {
          const pop = 1 + boomT * 2.4;
          drawCube(cx, cy, rot, cubeAlpha, pop, pop);
        }
        // line sparks
        const sparkLife = 0.75;
        const p = clamp01(boomT / sparkLife);
        if (p < 1) {
          const fade = 1 - p;
          const drag = 1 - Math.pow(1 - p, 3);
          ctx.strokeStyle = LINE;
          ctx.lineCap = 'round';
          for (const s of sparks) {
            const d = s.sp * drag * 0.55;
            const x1 = cx + Math.cos(s.a) * d;
            const y1 = cy + Math.sin(s.a) * d;
            const x2 = cx + Math.cos(s.a) * (d + s.len * fade);
            const y2 = cy + Math.sin(s.a) * (d + s.len * fade);
            ctx.globalAlpha = fade;
            ctx.lineWidth = s.w;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      }

      // 4) wordmark appears after the burst
      const textT = clamp01((clock - 2.0) / 0.55);
      if (textT > 0) {
        const e = easeOutCubic(textT);
        drawText(e, 0.94 + 0.06 * e);
      }
    }

    if (clock >= finishAt) finish();
    if (!done) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
