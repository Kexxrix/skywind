import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, relative, dirname } from 'node:path';
const argv = process.argv.slice(2), option = (key, fallback) => argv.includes(key) ? argv[argv.indexOf(key) + 1] : fallback;
const root = resolve(option('--root', 'E:/codexwork/Skywind/.work/8h-build/checkpoint-03/dist'));
const reference = JSON.parse(readFileSync(option('--reference', 'E:/codexwork/Skywind/.work/independent-qa-12h-20261002/BASELINE_IDENTITY.json'), 'utf8'));
const filesAt = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesAt(join(directory, entry.name)) : [join(directory, entry.name)]);
const files = filesAt(root), names = files.map(path => relative(root, path).replaceAll('\\', '/')).sort();
const mismatches = [], expected = new Map(reference.rows.map(row => [row.path, row]));
for (const name of names) {
  const bytes = readFileSync(join(root, name)), sha256 = createHash('sha256').update(bytes).digest('hex'), prior = expected.get(name);
  if (!prior || prior.bytes !== bytes.length || prior.sha256 !== sha256) mismatches.push({ name, bytes: bytes.length, sha256, expected: prior || null });
}
for (const name of expected.keys()) if (!names.includes(name)) mismatches.push({ name, missing: true });
const report = { at: new Date().toISOString(), root, files: files.length, bytes: files.reduce((sum, path) => sum + statSync(path).size, 0),
  expectedCommit: 'e5e139c46a7e00c4c23cde3efe56040c5079c595', expectedAggregate: '02eb951781d6d8b44eff48dd5191bed0f48486076d9a4bdc7380bce0e072746d',
  validationMethod: 'Every actual file SHA256/size/name equals the independent immutable129-file identity manifest; the reference aggregate is preserved, not recomputed with a different serialization.',
  referenceAggregateMatchesExpected: reference.aggregate === '02eb951781d6d8b44eff48dd5191bed0f48486076d9a4bdc7380bce0e072746d', mismatches,
  pass: !mismatches.length && files.length === 129 && reference.aggregate === '02eb951781d6d8b44eff48dd5191bed0f48486076d9a4bdc7380bce0e072746d' };
const output = option('--output', null);
if (output) { mkdirSync(dirname(resolve(output)), { recursive: true }); writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`); }
console.log(JSON.stringify(report)); if (!report.pass) process.exitCode = 1;
