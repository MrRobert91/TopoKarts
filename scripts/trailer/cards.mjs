// Renderiza tarjetas (título/cierre) y lower-thirds como PNG en trailer/raw.
// No toca el material de gameplay ya capturado.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const exe = fs.existsSync(CHROME) ? CHROME : EDGE;
const RAW = path.resolve('trailer/raw');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: exe, headless: 'new',
  args: ['--window-size=1960,1100', '--hide-scrollbars', '--use-gl=angle',
    '--enable-unsafe-swiftshader'],
});
const cardPage = await browser.newPage();
await cardPage.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

async function shotHTML(name, html, transparent) {
  await cardPage.setContent(html, { waitUntil: 'load' });
  await sleep(150);
  await cardPage.screenshot({ path: path.join(RAW, name + '.png'), omitBackground: transparent });
  console.log('  ' + name + '.png');
}

const FONT = `font-family:'Segoe UI',system-ui,sans-serif;`;
const page = (body, bg) => `<!doctype html><html><head><meta charset=utf8>
<style>*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;overflow:hidden;${FONT}}
body{${bg}}</style></head><body>${body}</body></html>`;

await shotHTML('card_title', page(`
  <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;
     justify-content:center;color:#fff;text-align:center;position:relative">
    <div style="position:absolute;inset:0;background:
       radial-gradient(1200px 700px at 50% 28%, rgba(70,213,255,.30), transparent 60%),
       radial-gradient(900px 600px at 80% 90%, rgba(176,63,224,.30), transparent 60%)"></div>
    <div style="font-size:34px;letter-spacing:14px;color:#46d5ff;font-weight:700;
       text-transform:uppercase;margin-bottom:18px;z-index:1">Copa de las superficies imposibles</div>
    <div style="font-size:170px;font-weight:900;line-height:.95;z-index:1;
       background:linear-gradient(180deg,#fff,#bfe3ff);-webkit-background-clip:text;color:transparent;
       filter:drop-shadow(0 10px 40px rgba(70,213,255,.45))">TOPO<span style="
       background:linear-gradient(180deg,#ffd23f,#ff9a3c);-webkit-background-clip:text;color:transparent">KARTS</span></div>
    <div style="font-size:30px;color:#c9d6ff;margin-top:24px;letter-spacing:2px;z-index:1">
       Carreras de kart sobre topología real</div>
  </div>`,
  'background:radial-gradient(120% 120% at 50% 0%,#10204e,#070b1c 70%)'), false);

await shotHTML('card_outro', page(`
  <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;
     justify-content:center;color:#fff;text-align:center;position:relative">
    <div style="position:absolute;inset:0;background:
       radial-gradient(1000px 700px at 50% 60%, rgba(255,210,63,.18), transparent 60%)"></div>
    <div style="font-size:150px;font-weight:900;z-index:1;
       background:linear-gradient(180deg,#fff,#bfe3ff);-webkit-background-clip:text;color:transparent">
       TOPO<span style="background:linear-gradient(180deg,#ffd23f,#ff9a3c);
       -webkit-background-clip:text;color:transparent">KARTS</span></div>
    <div style="font-size:40px;color:#fff;margin-top:30px;z-index:1;font-weight:600">
       5 circuitos · 1–2 jugadores · 100% en tu navegador</div>
    <div style="margin-top:46px;z-index:1;font-size:32px;font-weight:800;letter-spacing:3px;
       color:#070b1c;background:linear-gradient(90deg,#46d5ff,#ffd23f);
       padding:18px 46px;border-radius:999px">JUEGA AHORA</div>
  </div>`,
  'background:radial-gradient(120% 120% at 50% 100%,#0b1430,#05080f 70%)'), false);

// ── tarjeta GANCHO (hook, opaca) ─────────────────────────────────────
await shotHTML('card_hook', page(`
  <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;
     justify-content:center;color:#fff;text-align:center;position:relative">
    <div style="position:absolute;inset:0;background:
       radial-gradient(1100px 700px at 50% 35%, rgba(176,63,224,.28), transparent 60%),
       radial-gradient(900px 600px at 20% 90%, rgba(70,213,255,.22), transparent 60%)"></div>
    <div style="font-size:30px;letter-spacing:8px;color:#b03fe0;font-weight:800;
       text-transform:uppercase;margin-bottom:22px;z-index:1">¿Y si el circuito no fuera plano?</div>
    <div style="font-size:128px;font-weight:900;line-height:.96;z-index:1;letter-spacing:-1px;
       background:linear-gradient(180deg,#fff,#cfe6ff);-webkit-background-clip:text;color:transparent;
       filter:drop-shadow(0 10px 40px rgba(176,63,224,.4))">CONDUCE SOBRE<br>LO IMPOSIBLE</div>
    <div style="font-size:30px;color:#c9d6ff;margin-top:30px;letter-spacing:1px;z-index:1;font-weight:600">
       Esferas · cintas de Möbius · toros · planos hiperbólicos</div>
  </div>`,
  'background:radial-gradient(120% 120% at 50% 10%,#1a1040,#06070f 70%)'), false);

// ── tarjeta CARACTERÍSTICAS (features, opaca) ────────────────────────
const feat = (icon, title, sub, accent) => `
  <div style="display:flex;align-items:center;gap:22px;padding:22px 30px;border-radius:18px;
     background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);width:760px">
    <div style="font-size:52px;width:64px;text-align:center;filter:drop-shadow(0 4px 12px ${accent}88)">${icon}</div>
    <div style="text-align:left">
      <div style="font-size:34px;font-weight:900;color:#fff;line-height:1.05">${title}</div>
      <div style="font-size:23px;font-weight:600;color:#aebbe0;margin-top:5px">${sub}</div>
    </div>
  </div>`;
await shotHTML('card_features', page(`
  <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;
     justify-content:center;color:#fff;position:relative;gap:18px">
    <div style="position:absolute;inset:0;background:
       radial-gradient(1100px 700px at 50% 0%, rgba(70,213,255,.16), transparent 60%)"></div>
    <div style="font-size:28px;letter-spacing:10px;color:#46d5ff;font-weight:800;
       text-transform:uppercase;z-index:1;margin-bottom:6px">Todo procedural · 100% navegador</div>
    <div style="z-index:1;display:flex;flex-direction:column;gap:16px">
      ${feat('🌀', '5 circuitos topológicos', 'Cada superficie cambia cómo se conduce', '#46d5ff')}
      ${feat('🎮', '1–2 jugadores locales', 'Pantalla partida automática', '#ffd23f')}
      ${feat('🏎️', 'Derrapes con miniturbo', 'Y 5 objetos matemáticos para sabotear al rival', '#ff5d8f')}
      ${feat('🗺️', 'Minimapa topológico', 'Lee la pista como lo que de verdad es', '#b03fe0')}
    </div>
  </div>`,
  'background:radial-gradient(120% 120% at 50% 0%,#0d1838,#05070f 70%)'), false);

const LT = [
  ['s0_sphere', '01', 'Sphere Speedway', 'Curvatura positiva', 'K = 1/R² > 0  ·  χ(S²) = 2', '#46d5ff'],
  ['s1_mobius', '02', 'Möbius Motorway', 'No orientabilidad', 'Una sola cara · cada vuelta te invierte', '#ff5d8f'],
  ['s2_torus', '03', 'Toro Terminal', 'Dos ciclos: agujero y tubo', 'π₁(T²) = ℤ × ℤ', '#b03fe0'],
  ['s3_double', '04', 'Double Donut Drift', 'Género 2', 'χ = 2 − 2g = −2', '#ff9a3c'],
  ['s4_hyper', '05', 'Hyperbolic Havoc', 'Curvatura negativa', 'K = −1  ·  Σ∠△ < π', '#4ade80'],
];
for (const [id, num, name, concept, formula, accent] of LT) {
  await shotHTML('lt_' + id, page(`
    <div style="position:absolute;left:90px;bottom:90px;display:flex;align-items:flex-end;gap:26px">
      <div style="font-size:120px;font-weight:900;color:${accent};line-height:.8;
         text-shadow:0 6px 30px rgba(0,0,0,.6);-webkit-text-stroke:2px rgba(0,0,0,.25)">${num}</div>
      <div style="padding-bottom:6px">
        <div style="display:inline-block;font-size:24px;font-weight:700;color:#05080f;
           background:${accent};padding:6px 16px;border-radius:8px;letter-spacing:1px;
           margin-bottom:14px">${concept}</div>
        <div style="font-size:64px;font-weight:900;color:#fff;line-height:1;
           text-shadow:0 4px 24px rgba(0,0,0,.75)">${name}</div>
        <div style="font-size:30px;font-weight:600;color:#e8f0ff;margin-top:10px;
           font-family:'Cambria Math',Georgia,serif;text-shadow:0 2px 12px rgba(0,0,0,.8)">${formula}</div>
      </div>
    </div>`, ''), true);
}

const MSG = [
  ['lt_split', 'A DOBLE PANTALLA', '1–2 jugadores locales · pantalla partida automática', '#ffd23f'],
  ['lt_topo', 'MINIMAPA TOPOLÓGICO', 'Lee la pista como lo que de verdad es', '#b03fe0'],
];
for (const [id, big, small, accent] of MSG) {
  await shotHTML(id, page(`
    <div style="position:absolute;left:90px;bottom:96px">
      <div style="width:90px;height:8px;background:${accent};border-radius:4px;margin-bottom:22px"></div>
      <div style="font-size:74px;font-weight:900;color:#fff;line-height:1;letter-spacing:1px;
         text-shadow:0 6px 30px rgba(0,0,0,.8)">${big}</div>
      <div style="font-size:34px;font-weight:600;color:#dfe9ff;margin-top:16px;
         text-shadow:0 3px 16px rgba(0,0,0,.85)">${small}</div>
    </div>`, ''), true);
}

await browser.close();
console.log('tarjetas listas');
