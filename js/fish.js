// Fish sprites and spawning for Ocean
(function () {
  const SVGs = {
    clownfish: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260">
  <path d="M95 130 L25 75 L35 130 L25 185Z" fill="#ed782e" stroke="#292b32" stroke-width="7"/>
  <ellipse cx="205" cy="130" rx="120" ry="75" fill="#f28b36" stroke="#292b32" stroke-width="7"/>
  <path d="M145 61 Q115 130 145 199 L170 195 Q145 130 170 65Z" fill="white" stroke="#292b32" stroke-width="6"/>
  <path d="M235 59 Q210 130 235 201 L260 190 Q240 130 260 70Z" fill="white" stroke="#292b32" stroke-width="6"/>
  <path d="M185 57 Q205 20 250 53 L225 75Z" fill="#ed782e" stroke="#292b32" stroke-width="6"/>
  <path d="M185 203 Q205 240 250 207 L225 185Z" fill="#ed782e" stroke="#292b32" stroke-width="6"/>
  <circle cx="295" cy="110" r="10" fill="#171923"/>
  <circle cx="298" cy="106" r="3" fill="white"/>
  <path d="M310 145 Q325 155 340 143" fill="none" stroke="#292b32" stroke-width="4"/>
</svg>`,
    pufferfish: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <path d="M85 150 L30 105 L40 150 L30 195Z" fill="#d99b35" stroke="#493a29" stroke-width="5"/>
  <circle cx="205" cy="150" r="105" fill="#e9b94c" stroke="#493a29" stroke-width="6"/>
  <path d="M115 90 Q200 20 295 90" fill="none" stroke="#f8d878" stroke-width="15" stroke-linecap="round"/>
  <g stroke="#493a29" stroke-width="4" fill="#e9b94c">
    <path d="M120 65 L105 35 L140 55Z"/>
    <path d="M170 48 L165 15 L190 48Z"/>
    <path d="M225 45 L240 12 L250 53Z"/>
    <path d="M280 70 L310 42 L305 90Z"/>
    <path d="M305 130 L345 120 L315 155Z"/>
    <path d="M300 205 L335 230 L290 230Z"/>
    <path d="M240 252 L255 285 L220 258Z"/>
    <path d="M165 255 L150 285 L145 250Z"/>
    <path d="M105 220 L70 240 L95 200Z"/>
    <path d="M95 150 L60 135 L95 125Z"/>
  </g>
  <circle cx="245" cy="125" r="11" fill="#171923"/>
  <circle cx="249" cy="121" r="4" fill="white"/>
  <circle cx="285" cy="170" r="5" fill="#d08e35"/>
  <ellipse cx="315" cy="158" rx="13" ry="8" fill="#493a29"/>
  <path d="M175 215 Q205 235 230 215" fill="none" stroke="#a97830" stroke-width="4"/>
</svg>`,
    shark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 280">
  <path d="M90 135 L15 55 L35 140 L15 225Z" fill="#657d87" stroke="#263943" stroke-width="6"/>
  <path d="M70 135 Q170 35 340 105 Q410 125 465 140 Q410 175 340 190 Q180 245 70 155Z" fill="#718e9b" stroke="#263943" stroke-width="6"/>
  <path d="M180 75 L240 8 L275 95Z" fill="#526d79" stroke="#263943" stroke-width="6"/>
  <path d="M230 195 L290 260 L310 185Z" fill="#526d79" stroke="#263943" stroke-width="6"/>
  <path d="M340 190 L365 225 L390 180Z" fill="#526d79" stroke="#263943" stroke-width="5"/>
  <path d="M100 145 Q240 175 460 143 Q360 205 180 210 Q120 190 100 145Z" fill="#e3e5dc"/>
  <circle cx="385" cy="126" r="7" fill="#101b20"/>
  <path d="M415 160 L425 172 L435 158 L445 169 L455 155" fill="none" stroke="#263943" stroke-width="4"/>
  <path d="M350 140 Q355 160 350 180 M365 140 Q370 160 365 180 M380 140 Q385 160 380 180" fill="none" stroke="#344d58" stroke-width="4"/>
</svg>`,
    betta: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 300">
  <path d="M115 150 Q35 35 25 35 Q55 145 25 265 Q100 240 135 175Z" fill="#d84e79" stroke="#752c64" stroke-width="5"/>
  <path d="M145 110 Q130 15 220 25 Q295 35 320 100 Q250 80 145 110Z" fill="#328bc1" stroke="#204b8b" stroke-width="5"/>
  <path d="M145 190 Q145 275 230 270 Q300 265 325 190 Q245 220 145 190Z" fill="#d84e79" stroke="#752c64" stroke-width="5"/>
  <ellipse cx="240" cy="150" rx="105" ry="52" fill="#2787bd" stroke="#204b8b" stroke-width="5"/>
  <path d="M210 108 Q235 150 210 192" fill="none" stroke="#a6e1ee" stroke-width="5"/>
  <path d="M305 145 Q330 130 345 150 Q330 170 305 155" fill="#d84e79" stroke="#752c64" stroke-width="4"/>
  <circle cx="290" cy="132" r="8" fill="#101923"/>
  <circle cx="293" cy="129" r="3" fill="white"/>
  <path d="M160 125 Q110 150 160 175" fill="none" stroke="#a6e1ee" stroke-width="4"/>
</svg>`,
    koi: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 280">
  <path d="M90 140 L20 75 L40 140 L20 205Z" fill="#f1f0e8" stroke="#373737" stroke-width="5"/>
  <ellipse cx="225" cy="140" rx="145" ry="65" fill="#f5f1e6" stroke="#373737" stroke-width="5"/>
  <path d="M140 91 Q175 55 210 88 Q225 120 190 132 Q145 135 140 91Z" fill="#e76d34"/>
  <path d="M260 145 Q300 95 340 125 Q360 160 320 180 Q270 185 260 145Z" fill="#e76d34"/>
  <path d="M190 190 Q220 155 255 185 Q260 220 215 218Z" fill="#292d32"/>
  <path d="M180 95 Q145 45 115 75 Q135 115 185 130Z" fill="#f5f1e6" stroke="#373737" stroke-width="4"/>
  <path d="M200 185 Q180 235 145 225 Q150 190 200 165Z" fill="#f5f1e6" stroke="#373737" stroke-width="4"/>
  <circle cx="355" cy="123" r="8" fill="#171923"/>
  <circle cx="358" cy="120" r="3" fill="white"/>
  <path d="M370 150 Q390 158 400 145" fill="none" stroke="#373737" stroke-width="3"/>
</svg>`,
    shearfin: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-175 -100 350 200"><defs><linearGradient id="silver" x2="0" y2="1"><stop stop-color="#9ee6e1"/><stop offset="1" stop-color="#317f91"/></linearGradient></defs><g stroke="#b8f4ed" stroke-width="3" stroke-linejoin="round">
  <path d="M-100 0 Q-63 -42 0 -34 Q45 -28 77 0 Q42 31 -7 34 Q-66 38 -100 0Z" fill="url(#silver)" /><path d="M-96 0 -142 -34 -132 0 -142 34Z" fill="#2f788d" /><path d="M-30 -32 Q-8 -58 24 -34" fill="#4aa6af" /><path d="M-24 31 Q-5 51 24 32" fill="#26647a" /><circle cx="53" cy="-5" r="5" fill="#fff0b8" stroke="none" /><path d="M73 5l14 3" fill="none" stroke="#d0fff6" />
  <path d="M-58 -12 Q-8 0 -35 18" fill="none" stroke="#9ce5dc" opacity=".8" /><circle cx="-50" cy="0" r="3" fill="#d9fffa" stroke="none" />
 </g></svg>`,
    ribbonpike: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-175 -100 350 200"><g stroke="#b9e8ed" stroke-width="3" stroke-linejoin="round">
  <path d="M-87 0 Q-57 -28 -2 -24 Q36 -21 69 0 Q38 25 -4 25 Q-56 28 -87 0Z" fill="#498c9c" /><path d="M-82 0 -128 -32 -119 0 -128 31Z" fill="#286075" /><path d="M-34 -22 3 -48 26 -20Z" fill="#6fb9bb" /><path d="M-30 21 9 42 26 20Z" fill="#2b7181" /><circle cx="43" cy="-5" r="5" fill="#fff0b8" stroke="none" /><path d="M-53 -13l8 13 -8 13 M-28 -19l8 19 -8 18 M-3 -22 5 0 -3 22" fill="none" opacity=".6" />
 </g></svg>`,
    stoneback: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-175 -100 350 200"><g stroke="#eed2a6" stroke-width="3" stroke-linejoin="round">
  <path d="M-82 0 Q-51 -24 1 -22 Q40 -18 65 0 Q36 22 -5 23 Q-55 25 -82 0Z" fill="#d29b62" /><path d="M-78 0 -125 -31 -115 0 -125 30Z" fill="#a96255" /><path d="M-32 -20 0 -44 24 -18Z" fill="#e8b676" /><circle cx="42" cy="-4" r="5" fill="#fff4c4" stroke="none" /><path d="M-41 -17v34 M-18 -21v41 M5 -20v40 M28 -14v29" fill="none" opacity=".65" />
 </g></svg>`,
    scarletveil: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-175 -100 350 200"><defs><linearGradient id="rose" x2="0" y2="1"><stop stop-color="#ffb1ae"/><stop offset="1" stop-color="#a94066"/></linearGradient></defs><g stroke="#ffb4bc" stroke-width="3" stroke-linejoin="round">
  <path d="M-98 0 Q-65 -39 -4 -31 Q45 -26 78 0 Q45 28 -7 32 Q-70 38 -98 0Z" fill="url(#rose)" /><path d="M-95 0 -144 -34 -133 0 -144 34Z" fill="#8f395c" /><path d="M-36 -30 Q-8 -62 24 -29Z" fill="#d26780" /><path d="M-24 29 8 53 29 27Z" fill="#913d64" /><circle cx="52" cy="-6" r="5" fill="#fff1d4" stroke="none" /><path d="M-53 -15q12 15 0 30 M-22 -25q15 25 0 50 M9 -28q14 28 0 55" fill="none" stroke="#ffc0ba" opacity=".7" /><circle cx="-20" cy="-2" r="3" fill="#ffe3c9" stroke="none" />
 </g></svg>`,
    basinlantern: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-175 -100 350 200"><g stroke="#f6b3cd" stroke-width="3" stroke-linejoin="round">
  <path d="M-77 0 Q-48 -28 2 -24 Q40 -20 69 0 Q39 24 -2 25 Q-48 28 -77 0Z" fill="#bb557e" /><path d="M-72 0 -122 -39 -110 0 -122 38Z" fill="#71395f" /><path d="M-30 -22 0 -50 28 -20Z" fill="#e7839b" /><path d="M-25 22 4 47 20 20Z" fill="#873f70" /><circle cx="42" cy="-5" r="5" fill="#ffe6cc" stroke="none" /><path d="M-45 -17v34 M-22 -23v45 M1 -23v44 M23 -17v34" fill="none" opacity=".75" /><path d="M-7 0h48" stroke="#ffd2d8" opacity=".55" />
 </g></svg>`,
    emberwhip: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-175 -100 350 200"><g stroke="#ffc5a9" stroke-width="3" stroke-linejoin="round">
  <path d="M-65 0 Q-39 -24 4 -21 Q36 -18 58 0 Q35 22 2 23 Q-40 24 -65 0Z" fill="#cf6d68" /><path d="M-62 0 -109 -32 -99 0 -109 31Z" fill="#803d58" /><path d="M-22 -20 6 -48 28 -17Z" fill="#ef9b80" /><circle cx="37" cy="-5" r="5" fill="#fff1d0" stroke="none" /><path d="M-30 -15v30 M-7 -20v40 M16 -18v35" fill="none" /><path d="M58 2q26 1 25 18q-2 12-13 14" fill="none" stroke="#ff938e" stroke-width="4" /><circle cx="70" cy="20" r="3" fill="#fff0ca" stroke="none" />
 </g></svg>`,
    palesentinel: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-175 -100 350 200"><defs><linearGradient id="ghost" x2="0" y2="1"><stop stop-color="#c3d9ff"/><stop offset="1" stop-color="#5566a5"/></linearGradient></defs><g stroke="#c5d8ff" stroke-width="3" stroke-linejoin="round">
  <path d="M-91 0 Q-57 -35 -2 -29 Q43 -26 76 0 Q42 29 -4 31 Q-60 34 -91 0Z" fill="url(#ghost)" /><path d="M-87 0 -137 -38 -125 0 -137 37Z" fill="#374579" /><path d="M-31 -28 2 -55 27 -25Z" fill="#778ac1" /><path d="M-28 28 8 47 27 25Z" fill="#3c4c85" /><path d="M76 0q20 -20 36 -7q-7 8 0 15Q96 20 76 0Z" fill="#6377b5" /><circle cx="48" cy="-6" r="4.5" fill="#b9f8ff" stroke="none" /><circle cx="48" cy="-6" r="10" fill="none" stroke="#87dfff" opacity=".65" /><path d="M-54 -13q15 14 0 27 M-20 -25q12 25 0 49 M12 -25q12 25 0 50" fill="none" opacity=".65" />
 </g></svg>`,
    thewatcher: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-175 -100 350 200"><g stroke="#c5caff" stroke-width="3" stroke-linejoin="round">
  <path d="M-92 0 Q-58 -34 -7 -29 Q41 -25 77 0 Q44 29 -6 31 Q-60 33 -92 0Z" fill="#555988" /><path d="M-88 0 -141 -37 -128 0 -141 37Z" fill="#292e50" /><path d="M-32 -27 1 -55 28 -24Z" fill="#7777a5" /><path d="M-30 27 8 47 28 24Z" fill="#363b68" /><circle cx="47" cy="-6" r="5" fill="#edffff" stroke="none" /><circle cx="47" cy="-6" r="12" fill="none" stroke="#a4eeff" /><path d="M-50 -14q12 13 0 28 M-21 -25q13 25 0 49 M9 -25q13 25 0 49" fill="none" opacity=".55" /><path d="M77 0q20 -16 28 -4q-8 8 0 14q-14 8-28-10Z" fill="#6a709b" />
 </g></svg>`
  };

  function svgToImg(svg) {
    const img = new Image();
    img.decoding = 'async';
    img.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    return img;
  }

  // World depth units: 0-1 surface, 1-2 underwater, 2-3 abyss, 3-4 trenches, 4-5 hadal, 5-6 void
  const TYPES = [
    { id:'clownfish', name:'Clownfish', img: svgToImg(SVGs.clownfish), w:400, h:260, zone:[1.10,1.70], scale:0.18, speed:0.000014, count:4 },
    { id:'pufferfish', name:'Pufferfish', img: svgToImg(SVGs.pufferfish), w:400, h:300, zone:[1.20,1.85], scale:0.16, speed:0.000009, count:3, puffer:true },
    { id:'shark', name:'Great White Shark', img: svgToImg(SVGs.shark), w:500, h:280, zone:[1.45,2.35], scale:0.34, speed:0.000020, count:2 },
    { id:'betta', name:'Betta Fish', img: svgToImg(SVGs.betta), w:450, h:300, zone:[1.08,1.55], scale:0.17, speed:0.000011, count:3 },
    { id:'koi', name:'Koi Fish', img: svgToImg(SVGs.koi), w:450, h:280, zone:[1.05,1.45], scale:0.20, speed:0.000010, count:3 },
    { id:'shearfin', name:'Shearfin', img: svgToImg(SVGs.shearfin), w:350, h:200, zone:[3.05,3.45], scale:0.22, speed:0.000018, count:3 },
    { id:'ribbonpike', name:'Ribbon Pike', img: svgToImg(SVGs.ribbonpike), w:350, h:200, zone:[3.10,3.55], scale:0.21, speed:0.000016, count:3 },
    { id:'stoneback', name:'Stoneback', img: svgToImg(SVGs.stoneback), w:350, h:200, zone:[3.20,3.65], scale:0.20, speed:0.000010, count:2 },
    { id:'scarletveil', name:'Scarlet Veil', img: svgToImg(SVGs.scarletveil), w:350, h:200, zone:[4.05,4.45], scale:0.22, speed:0.000013, count:3 },
    { id:'basinlantern', name:'Basin Lantern', img: svgToImg(SVGs.basinlantern), w:350, h:200, zone:[4.10,4.55], scale:0.20, speed:0.000011, count:3 },
    { id:'emberwhip', name:'Ember Whip', img: svgToImg(SVGs.emberwhip), w:350, h:200, zone:[4.20,4.65], scale:0.21, speed:0.000015, count:2 },
    { id:'palesentinel', name:'Pale Sentinel', img: svgToImg(SVGs.palesentinel), w:350, h:200, zone:[5.05,5.45], scale:0.24, speed:0.000009, count:2 },
    { id:'thewatcher', name:'The Watcher', img: svgToImg(SVGs.thewatcher), w:350, h:200, zone:[5.15,5.60], scale:0.25, speed:0.000008, count:1 }
  ];

  const fish = [];
  function randY(t) { return t.zone[0] + Math.random() * (t.zone[1] - t.zone[0]); }
  function initFish() {
    fish.length = 0;
    for (const t of TYPES) {
      for (let i = 0; i < t.count; i++) {
        fish.push({
          type: t,
          x: Math.random(),
          y: randY(t), // world depth units 1..3
          dir: Math.random() < 0.5 ? 1 : -1,
          sp: t.speed * (0.75 + Math.random() * 0.6),
          ph: Math.random() * Math.PI * 2,
          bob: 4 + Math.random() * 8,
          puff: 0,
          lastX: -9999, lastY: -9999, lastS: 30
        });
      }
    }
  }
  initFish();

  function drawFishSprite(ctx, f, x, y, baseS) {
    const t = f.type;
    const puffScale = t.puffer ? (1 + f.puff * 0.75) : 1;
    const w0 = t.w * baseS * puffScale;
    const h0 = t.h * baseS * puffScale;
    f.lastX = x; f.lastY = y; f.lastS = Math.max(w0, h0) * 0.42;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f.dir, 1);
    if (t.img.complete && t.img.naturalWidth > 0) {
      ctx.drawImage(t.img, -w0 / 2, -h0 / 2, w0, h0);
    }
    ctx.restore();
  }

  function drawInWorld(ctx, opts) {
    const { w, h, animTime, dt, reducedMotion } = opts;
    const motion = reducedMotion ? 0.25 : 1;
    for (const f of fish) {
      const t = f.type;
      f.x += f.sp * f.dir * dt * 1000 * motion;
      if (f.x > 1.25) { f.x = -0.25; f.y = randY(t); f.dir = 1; }
      if (f.x < -0.25) { f.x = 1.25; f.y = randY(t); f.dir = -1; }
      if (f.puff > 0) f.puff = Math.max(0, f.puff - dt * 0.4);

      // world Y: 0..h surface, 1..2 underwater, ... 5..6 void
      const worldY = f.y * h + Math.sin(animTime * 0.0005 + f.ph) * f.bob;
      const fx = f.x * w;
      const baseS = t.scale * Math.min(w, h) * 0.0018;
      drawFishSprite(ctx, f, fx, worldY, baseS);
    }
  }

  function hitTest(worldX, worldY) {
    for (let i = fish.length - 1; i >= 0; i--) {
      const f = fish[i];
      const dx = worldX - f.lastX;
      const dy = worldY - f.lastY;
      const r = f.lastS || 30;
      if (dx * dx + dy * dy < r * r) return f;
    }
    return null;
  }

  function puff(f) {
    if (f && f.type.puffer) { f.puff = 1; return true; }
    return false;
  }

  window.OceanFish = { TYPES, fish, initFish, drawInWorld, hitTest, puff, SVGs };
})();
