// Verificación automática: carga el juego, navega los menús, arranca una
// carrera, conduce unos segundos y guarda capturas. Reporta errores de consola.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const exe = fs.existsSync(CHROME) ? CHROME : EDGE;

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: 'new',
  args: ['--window-size=1480,920', '--mute-audio', '--use-gl=angle'],
  defaultViewport: { width: 1480, height: 920 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

fs.mkdirSync('shots', { recursive: true });
const shot = (n) => page.screenshot({ path: `shots/${n}.png` });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const clickText = async (txt) => {
  const ok = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('button, .char-card')];
    const el = els.find(e => e.textContent.toUpperCase().includes(t.toUpperCase()));
    if (el) { el.click(); return true; }
    return false;
  }, txt);
  if (!ok) throw new Error('No encontrado: ' + txt);
};

await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
await sleep(1500);
await shot('1-title');

await clickText('JUGAR'); await sleep(500); await shot('2-players');
await clickText('1 JUGADOR'); await sleep(800); await shot('3-chars');
// elegir a Cubito
await page.evaluate(() => document.querySelector('.char-card').click());
await sleep(900); await shot('4-edu');
await clickText('PARRILLA');
await sleep(4500); // cuenta atrás
await shot('5-race-start');

// conducir: mantener W y girar un poco
await page.keyboard.down('w');
await sleep(3000);
await page.keyboard.down('a'); await sleep(600); await page.keyboard.up('a');
await sleep(2500);
await shot('6-driving');
await page.keyboard.press('m');
await sleep(2000);
await shot('7-minimap-normal');
await page.keyboard.up('w');

const circuit = process.argv[2];
if (circuit) console.log('done circuito', circuit);

console.log('ERRORES:', errors.length ? errors.slice(0, 10) : 'ninguno');
await browser.close();
