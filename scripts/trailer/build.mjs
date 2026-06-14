// Monta el trailer final con ffmpeg a partir de trailer/raw:
//  - normaliza cada escena a 1920x1080 @30fps y superpone su lower-third con fundido
//  - construye un MONTAJE FINAL de cortes rápidos (todos los circuitos, acelerados)
//  - encadena todo con crossfades (xfade) hacia ~60s
//  - genera la música a la duración exacta y la mezcla
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const RAW = path.resolve('trailer/raw');
const TMP = path.resolve('trailer/tmp');
const OUT = path.resolve('trailer/TopoKarts-Trailer.mp4');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(path.join(RAW, 'manifest.json'), 'utf8'));
const fpsOf = (id) => manifest.scenes.find(s => s.id === id)?.fps ?? 30;
const framesOf = (id) => manifest.scenes.find(s => s.id === id)?.frames ?? 0;
const avail = (id) => framesOf(id) / fpsOf(id);
const FPS = 30, T = 0.45; // crossfade

const ff = (args) => execFileSync(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args],
  { stdio: ['ignore', 'inherit', 'inherit'] });

// ── MONTAJE FINAL: cortes rápidos y acelerados de varios circuitos ───
// Da el subidón de "quiero jugar ya" justo antes del cierre.
function buildMontage(totalDur) {
  const segs = [
    ['s2_torus', 0.42], ['s4_hyper', 0.45], ['s0_sphere', 0.40],
    ['s1_mobius', 0.42], ['s3_double', 0.45], ['s6_topo', 0.40],
  ];
  const SPEED = 1.45;                       // aceleración para energía
  const piece = totalDur / segs.length;     // duración de cada corte en pantalla
  const list = [];
  segs.forEach(([id, frac], i) => {
    const fps = fpsOf(id);
    const srcSec = +(piece * SPEED).toFixed(3);             // metraje fuente a consumir
    const need = Math.ceil(srcSec * fps) + 2;
    let start = Math.floor(framesOf(id) * frac);
    start = Math.max(0, Math.min(start, framesOf(id) - need));
    const glob = path.join(RAW, id, '%05d.jpg');
    const out = path.join(TMP, `m_${i}.mp4`);
    const filter =
      `[0:v]fps=${fps},scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,` +
      `trim=0:${srcSec},setpts=(PTS-STARTPTS)/${SPEED},fps=${FPS},format=yuv420p[v]`;
    ff(['-framerate', String(fps), '-start_number', String(start), '-i', glob,
      '-filter_complex', filter, '-map', '[v]', '-t', piece.toFixed(3),
      '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-an', out]);
    list.push(out);
  });
  // concat por demuxer (cortes secos)
  const lst = path.join(TMP, 'montage_list.txt');
  fs.writeFileSync(lst, list.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
  const montage = path.join(TMP, 'montage_src.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', montage]);
  return montage;
}

const montageDur = 5.0;
const montageSrc = buildMontage(montageDur);

// secuencia: [id, tipo, duración deseada, overlayPNG|null, opciones]
const seq = [
  ['card_title', 'card', 5.2, null, { fadeFromBlack: true }],
  ['card_hook', 'card', 4.0],
  ['s0_sphere', 'play', 6.0, 'lt_s0_sphere'],
  ['s1_mobius', 'play', 6.0, 'lt_s1_mobius'],
  ['s2_torus', 'play', 6.0, 'lt_s2_torus'],
  ['s3_double', 'play', 5.8, 'lt_s3_double'],
  ['s4_hyper', 'play', 5.8, 'lt_s4_hyper'],
  ['s6_topo', 'play', 5.8, 'lt_topo'],
  ['s5_split', 'play', 5.6, 'lt_split'],
  ['card_features', 'card', 4.8],
  ['montage', 'video', montageDur],
  ['card_outro', 'card', 5.4, null, { fadeToBlack: true }],
];

const clips = [];
for (const [id, type, wantDur, overlay, opt = {}] of seq) {
  const out = path.join(TMP, `clip_${clips.length}.mp4`);
  let dur = wantDur;
  const common = ['-pix_fmt', 'yuv420p', '-r', String(FPS), '-an',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18'];

  if (type === 'card') {
    const png = path.join(RAW, id + '.png');
    // tarjeta estática a 1920x1080 con fundidos (duración exacta vía -framerate/-t/-r)
    let vf = `scale=1920:1080,format=yuv420p`;
    if (opt.fadeFromBlack) vf += `,fade=t=in:st=0:d=0.7`;
    if (opt.fadeToBlack) vf += `,fade=t=out:st=${(dur - 0.9).toFixed(2)}:d=0.9`;
    ff(['-framerate', String(FPS), '-loop', '1', '-t', String(dur), '-i', png,
      '-vf', vf, ...common, out]);
  } else if (type === 'video') {
    // clip de vídeo ya montado (montaje final): normaliza y recorta a la duración
    const filter =
      `[0:v]fps=${FPS},scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,` +
      `trim=0:${dur},setpts=PTS-STARTPTS,format=yuv420p[v]`;
    ff(['-i', montageSrc, '-filter_complex', filter, '-map', '[v]', '-t', String(dur), ...common, out]);
  } else {
    const fps = fpsOf(id);
    dur = Math.min(wantDur, +(avail(id) - 0.12).toFixed(2));
    const seqGlob = path.join(RAW, id, '%05d.jpg');
    const lt = path.join(RAW, overlay + '.png');
    // base gameplay -> 1920x1080 fill; overlay lower-third con fundido
    const ltFadeOut = Math.max(0.1, dur - 0.6);
    const filter =
      `[0:v]fps=${FPS},scale=1920:1080:force_original_aspect_ratio=increase,` +
      `crop=1920:1080,trim=0:${dur},setpts=PTS-STARTPTS,format=yuv420p[base];` +
      `[1:v]format=rgba,fade=t=in:st=0.25:d=0.5:alpha=1,` +
      `fade=t=out:st=${ltFadeOut.toFixed(2)}:d=0.5:alpha=1[lt];` +
      `[base][lt]overlay=0:0:format=auto,trim=0:${dur},setpts=PTS-STARTPTS[v]`;
    ff(['-framerate', String(fps), '-start_number', '0', '-i', seqGlob,
      '-loop', '1', '-t', String(dur), '-i', lt,
      '-filter_complex', filter, '-map', '[v]', '-t', String(dur), ...common, out]);
  }
  clips.push({ out, dur });
  console.log(`clip ${clips.length - 1} (${id}): ${dur.toFixed(2)}s`);
}

// ── encadenado con xfade ─────────────────────────────────────────────
const inputs = clips.flatMap(c => ['-i', c.out]);
let fc = '';
let cur = `[0:v]`;
let acc = clips[0].dur;
for (let i = 1; i < clips.length; i++) {
  const off = (acc - T).toFixed(3);
  const lbl = i === clips.length - 1 ? '[vout]' : `[x${i}]`;
  fc += `${cur}[${i}:v]xfade=transition=fade:duration=${T}:offset=${off}${lbl};`;
  cur = lbl;
  acc = acc + clips[i].dur - T;
}
fc = fc.replace(/;$/, '');
const totalDur = +acc.toFixed(2);
const videoOnly = path.join(TMP, 'video.mp4');
ff([...inputs, '-filter_complex', fc, '-map', '[vout]',
  '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:v', 'libx264',
  '-preset', 'slow', '-crf', '17', videoOnly]);
console.log(`vídeo: ${totalDur}s`);

// ── música a medida + mezcla ─────────────────────────────────────────
const music = path.join(TMP, 'music.wav');
execFileSync(process.execPath,
  [path.resolve('scripts/trailer/music.mjs'), String(totalDur), music],
  { stdio: 'inherit' });

ff(['-i', videoOnly, '-i', music,
  '-map', '0:v', '-map', '1:a', '-shortest',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', OUT]);

const mb = (fs.statSync(OUT).size / 1e6).toFixed(1);
console.log(`\n✅ Trailer: ${OUT}  (${totalDur}s, ${mb} MB, 1920x1080@${FPS})`);
