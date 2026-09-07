import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
const music = JSON.parse(await readFile(resolve(root, 'assets/audio/manifest.json'), 'utf8'));
const modules = ['boot', 'main', 'game', 'renderer', 'audio', 'presentation', 'volume-environment', 'terrain3d'];
const images = ['player', 'enemies', 'enemies-v2', 'bosses-v2', 'leaf-surface-v3'];
const playerRoot = 'assets/art/player/sv01';
const playerManifest = JSON.parse(await readFile(resolve(root, playerRoot, 'manifest.json'), 'utf8'));
const effects = ['shot-01', 'shot-02', 'shot-03', 'spread-01', 'spread-02', 'lance-01', 'lance-02', 'helix-01', 'helix-02', 'enemy-01', 'enemy-02', 'hit-01', 'hit-02', 'hit-03', 'player-hit', 'explosion-01', 'explosion-02', 'explosion-03', 'explosion-heavy', 'charge'];
const patchEffects = [
  ...['normal', 'spread', 'lance', 'helix', 'drone'].flatMap(weapon => [1, 2, 3].map(number => `shot-${weapon}-0${number}`)),
  ...['normal', 'spread', 'lance', 'helix', 'drone'].map(weapon => `hit-weapon-${weapon}`),
  'hit-target-light-01', 'hit-target-light-02',
  'hit-target-armored-01', 'hit-target-armored-02', 'hit-target-armored-03',
  'hit-target-special-01', 'hit-target-special-02',
  'player-damage-fixed', 'weapon-change', 'weapon-expire',
];

// Local preview uses npm start. Do not stage unapproved supplied audio in the
// public dist folder; a later deployment still requires the user's instruction.
const patchAudioRoot = 'assets/audio/sfx-patch1';
const provenance = JSON.parse(await readFile(resolve(root, patchAudioRoot, 'provenance.json'), 'utf8'));
if (provenance.publicationApproved !== true || typeof provenance.rightsEvidence !== 'string' || !provenance.rightsEvidence.trim()) {
  throw new Error('Patch sound publication rights are unconfirmed. Public build stopped before writing dist. Use npm start for local testing; record verified rights evidence before approving publication.');
}
for (const name of patchEffects) {
  const file = `edited/${name}.wav`;
  const entry = provenance.edits?.find(edit => edit.file === file);
  const actual = createHash('sha256').update(await readFile(resolve(root, patchAudioRoot, file))).digest('hex');
  if (!entry || entry.sha256 !== actual) throw new Error(`Patch sound differs from its provenance record: ${file}`);
}

const files = [
  'index.html', 'style.css', ...modules.map(name => `src/${name}.js`),
  ...images.map(name => `assets/art/${name}.png`),
  `${playerRoot}/manifest.json`, ...playerManifest.frames.map(frame => `${playerRoot}/${frame.filename}`),
  'assets/audio/manifest.json', ...Object.values(music),
  ...effects.map(name => `assets/audio/sfx-v3/${name}.wav`),
  ...patchEffects.map(name => `${patchAudioRoot}/edited/${name}.wav`),
];
const allowed = new Set(files);
for (const file of files) {
  if (!/^[\w./-]+$/.test(file) || file.startsWith('/') || file.split('/').includes('..')) throw new Error(`Invalid public asset: ${file}`);
  if (!(await stat(resolve(root, file))).isFile()) throw new Error(`Missing public asset: ${file}`);
}

// Refuse unexpected output instead of accidentally publishing local work files.
async function inspect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  })) {
    const file = prefix + entry.name;
    if (entry.isDirectory()) await inspect(resolve(directory, entry.name), file + '/');
    else if (!entry.isFile() || !allowed.has(file)) throw new Error(`Unexpected file in dist: ${file}`);
  }
}
await inspect(output);
let bytes = 0;
for (const file of files) {
  const target = resolve(output, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, file), target);
  bytes += (await stat(target)).size;
}
console.log(`SkyWind static build: ${files.length} files, ${(bytes / 1048576).toFixed(2)} MiB`);
