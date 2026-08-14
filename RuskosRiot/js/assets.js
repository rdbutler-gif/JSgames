/* ===========================================================================
   RUSKO'S RIOT  --  assets.js
   Loads assets/manifest.json and every image it lists.

   Manifest entry format:  [ relativePath, pixelW, pixelH, designW, designH ]
   Pixel size is whatever the file happens to be; design size is how big the
   thing is in world units. The renderer only ever uses the design size, so
   the PNGs can be re-exported at any resolution without touching game code.
   =========================================================================== */
window.RR = window.RR || {};

RR.Assets = (function () {
  const img = {};      // "char.billy.idle" -> HTMLImageElement
  const dim = {};      // "char.billy.idle" -> {dw, dh}
  let manifest = null;

  function walk(node, path, out) {
    if (Array.isArray(node)) { out.push([path, node]); return; }
    for (const k in node) walk(node[k], path ? path + '.' + k : k, out);
  }

  async function load(onProgress) {
    manifest = await fetch('assets/manifest.json', { cache: 'no-cache' }).then(r => r.json());
    const flat = [];
    walk(manifest, '', flat);

    let done = 0;
    await Promise.all(flat.map(([key, rec]) => new Promise(resolve => {
      const [rel, , , dw, dh] = rec;
      const im = new Image();
      im.onload = im.onerror = () => {
        img[key] = im;
        dim[key] = { dw: dw, dh: dh };
        onProgress && onProgress(++done, flat.length);
        resolve();
      };
      im.src = 'assets/' + rel;
    })));
    return { img, dim };
  }

  return {
    load,
    get: k => img[k],
    dim: k => dim[k],
    has: k => !!img[k],
    get manifest() { return manifest; }
  };
})();
