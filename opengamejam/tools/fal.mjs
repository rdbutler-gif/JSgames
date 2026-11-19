// Build-time fal helper. Runs in Node on your machine only; never imported by the game.
// The key is read from tools/.env (git-ignored), loaded with: node --env-file=tools/.env ...
import { fal } from '@fal-ai/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function falKeyState() {
  return process.env.FAL_KEY ? 'Present' : 'Absent';
}

function requireKey() {
  if (!process.env.FAL_KEY) {
    throw new Error('FAL_KEY is absent. Run with: node --env-file=tools/.env <script>');
  }
  fal.config({ credentials: process.env.FAL_KEY });
}

// Submit one job to a model's queue and wait for it. Each submit is billable:
// never resubmit a job whose outcome is unclear; look it up by its request ID instead.
export async function runModel(endpointId, input, { onQueue } = {}) {
  requireKey();
  const result = await fal.subscribe(endpointId, {
    input,
    logs: true,
    onEnqueue: (requestId) => console.log(`[fal] ${endpointId} queued, request ${requestId}`),
    onQueueUpdate: (u) => { if (onQueue) onQueue(u); },
  });
  console.log(`[fal] ${endpointId} done, request ${result.requestId}`);
  return result; // { data, requestId }
}

// Fetch the result of an earlier request without paying for a new one.
export async function getResult(endpointId, requestId) {
  requireKey();
  return fal.queue.result(endpointId, { requestId });
}

// Save a file URL from a fal result into the project (for example src/assets/...).
export async function download(url, outPath) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error('Refusing non-https download: ' + u.origin);
  const res = await fetch(u);
  if (!res.ok) throw new Error(`Download failed (${res.status}) from ${u.origin}`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
  console.log(`[fal] saved ${outPath}`);
}

// `node --env-file=tools/.env tools/fal.mjs` reports only whether the key is present.
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('fal.mjs')) {
  console.log('FAL_KEY:', falKeyState());
}
