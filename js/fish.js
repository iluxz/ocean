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
</svg>`
  };

  function svgToImg(svg) {
    const img = new Image();
    img.decoding = 'async';
    img.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    return img;
  }

  // World depth units: 0-1 surface, 1-2 underwater, 2-3 abyss
  const TYPES = [
    { id:'clownfish', name:'Clownfish', img: svgToImg(SVGs.clownfish), w:400, h:260, zone:[1.10,1.70], scale:0.18, speed:0.000014, count:4 },
    { id:'pufferfish', name:'Pufferfish', img: svgToImg(SVGs.pufferfish), w:400, h:300, zone:[1.20,1.85], scale:0.16, speed:0.000009, count:3, puffer:true },
    { id:'shark', name:'Great White Shark', img: svgToImg(SVGs.shark), w:500, h:280, zone:[1.45,2.35], scale:0.34, speed:0.000020, count:2 },
    { id:'betta', name:'Betta Fish', img: svgToImg(SVGs.betta), w:450, h:300, zone:[1.08,1.55], scale:0.17, speed:0.000011, count:3 },
    { id:'koi', name:'Koi Fish', img: svgToImg(SVGs.koi), w:450, h:280, zone:[1.05,1.45], scale:0.20, speed:0.000010, count:3 }
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

      // world Y: 0..h surface, h..2h underwater, 2h..3h abyss
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
