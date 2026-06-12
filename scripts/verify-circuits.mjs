// Captura cada circuito conduciendo unos segundos, y el modo 2 jugadores.
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('shots', { recursive: true });

const errors = [];
for (let c = 0; c < 5; c++) {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(`c${c}: ${e.message}`));
  await page.goto(`http://localhost:5173/?circuit=${c}`, { waitUntil: 'networkidle2' });
  await sleep(4800); // cuenta atrás
  await page.keyboard.down('w');
  await sleep(6000);
  await page.screenshot({ path: `shots/c${c}-driving.png` });
  await page.keyboard.up('w');
  await page.close();
}

// 2 jugadores
const page = await browser.newPage();
page.on('pageerror', e => errors.push('2p: ' + e.message));
await page.goto('http://localhost:5173/?circuit=0&players=2', { waitUntil: 'networkidle2' });
await sleep(4800);
await page.keyboard.down('w');
await page.keyboard.down('ArrowUp');
await sleep(5000);
await page.screenshot({ path: 'shots/split-2p.png' });
await page.close();

console.log('ERRORES:', errors.length ? errors : 'ninguno');
await browser.close();
