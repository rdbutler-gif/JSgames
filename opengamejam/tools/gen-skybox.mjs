// Generate a nebula panorama for the space sky with fal (FLUX dev, 2048x1024).
// Dry run by default: prints the request and its cost. Add --go to buy one image.
//   node --env-file=tools/.env tools/gen-skybox.mjs [--go] [--seed N] [--name skyA]
// Raw output goes to assets-src/sky-raw/<name>.png; the shipped copy is made by hand after review.
import { runModel, download } from './fal.mjs';
import { writeFile, mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const go = args.includes('--go');
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const name = arg('--name', 'skyA');
const seed = Number(arg('--seed', 7104));

// Written from the game's own sky shader palette (world.js: #40207a violet, #0e6b7d teal, #7a2f6e magenta).
const prompt = [
  '360 degree equirectangular panorama of deep space, seamless wrap-around skybox texture',
  'a long glowing nebula band runs horizontally across the middle of the image: deep violet and magenta gas clouds with teal-cyan wisps and dark dust lanes',
  'the top and bottom of the image are a near-black navy void with faint scattered stars',
  'many small pin-point stars, a few brighter ones, no lens flares',
  'painterly sci-fi concept art, rich but dark, high detail, soft volumetric gas',
  'no planets, no sun, no moon, no spaceships, no text, no frame, no horizon, no ground',
].join('. ');

const input = {
  prompt,
  image_size: { width: 2048, height: 1024 },
  num_inference_steps: 32,
  guidance_scale: 3.5,
  num_images: 1,
  seed,
  output_format: 'png',
  enable_safety_checker: true,
};
const endpoint = 'fal-ai/flux/dev';
console.log(`[sky] ${endpoint} ${name} seed ${seed}\n[sky] est. cost: 2048x1024 = 2.1 MP at $0.025/MP, rounded up = about $0.075`);
if (!go) { console.log('[sky] dry run, nothing bought. Request:\n' + JSON.stringify(input, null, 2)); process.exit(0); }

const { data, requestId } = await runModel(endpoint, input);
await mkdir('assets-src/sky-raw', { recursive: true });
await writeFile(`assets-src/sky-raw/${name}.json`, JSON.stringify({ endpoint, requestId, input, result: { ...data, images: data.images.map(({ url, ...r }) => r) } }, null, 2));
await download(data.images[0].url, `assets-src/sky-raw/${name}.png`);
console.log('[sky] request', requestId, 'seed', data.seed);
