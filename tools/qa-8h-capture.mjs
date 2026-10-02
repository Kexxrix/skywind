import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// One GUI owner; count every request and preserve existing evidence filenames.
export async function saveEvidenceScreenshot(cdp, output, filename) {
  if (!/^[a-z0-9_-]+\.png$/i.test(filename)) throw new Error('Invalid evidence filename');
  const existing = (await readdir(output)).filter(name => name.endsWith('.png'));
  if (existing.includes(filename)) throw new Error(`Evidence already exists: ${filename}`);
  const ledgerPath = resolve(output, 'screenshots-ledger.json');
  let ledger;
  try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; ledger = existing.map(name => ({ filename: name, priorCapture: true })); }
  if (!Array.isArray(ledger) || ledger.length >= 24) throw new Error('24-screenshot task budget reached');
  const record = { filename, requestedAt: new Date().toISOString(), succeeded: false };
  ledger.push(record);
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
  const response = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(resolve(output, filename), Buffer.from(response.data, 'base64'));
  record.succeeded = true;
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
}
