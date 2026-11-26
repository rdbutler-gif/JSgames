// Lantern Station hub: docked in the bay. The Wayfarer sits on the floor in its clamps, seen from the
// bay mouth; a panel on the left holds Ilsa's briefing, the Workshop and launch.
// main.js owns the states (docking -> hub -> launch); this module owns the hub's view, menus and shop.
import * as THREE from 'three';
import { cloneModel, onModel } from './models.js';
import { createMenu } from './ui.js';
import { BRIEFINGS, briefingLines } from './story.js';
import { UPGRADES, SCRUBBER, KIT, tier, nextCost } from './workshop.js';

const ROMAN = ['', 'I', 'II', 'III'];

// "12 D 06 H" from days
export function airText(days) {
  const d = Math.max(0, days);
  const D = Math.floor(d), H = Math.floor((d - D) * 24);
  return D + ' D ' + String(H).padStart(2, '0') + ' H';
}

// ctx: { G, ship, station, scene, story, sfx, $, show, camera, applyUpgrades(), autosave(loud), launch() }
export function createHub(ctx) {
  const { G, station, scene, story, sfx, $, camera } = ctx;

  // ---------- the view ----------
  const rig = new THREE.Group(); rig.visible = false; scene.add(rig);
  const model = new THREE.Group(); rig.add(model);
  onModel('player', () => model.add(cloneModel('player')));
  const key = new THREE.PointLight('#d6ecff', 420, 110, 1.6); rig.add(key);
  const rim = new THREE.PointLight('#ffb36a', 300, 90, 1.6); rig.add(rim);
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), v = new THREE.Vector3();
  let t = 0;
  function place() {
    station.dockPose(rig.position, rig.quaternion);
    // dock pose is the ship's nose toward the bay mouth (-Z); stand off its left bow, looking back along it,
    // aimed left of the ship so it sits in the right half of the frame, clear of the panel
    const L = station.local(rig.position, new THREE.Vector3());
    // behind the ship's left quarter, looking out of the bay mouth past its nose: space is the backdrop
    const C = ctx.camOffsets || { cam: [-15, 12, 40], look: [-4, 1, -40], key: [-14, 14, -18], rim: [16, 6, -40] };
    station.toWorld(v.set(L.x + C.cam[0], L.y + C.cam[1], L.z + C.cam[2]), camPos);
    station.toWorld(v.set(L.x + C.look[0], L.y + C.look[1], L.z + C.look[2]), camLook);
    const inv = rig.quaternion.clone().invert();
    station.toWorld(v.set(L.x + C.key[0], L.y + C.key[1], L.z + C.key[2]), key.position); key.position.sub(rig.position).applyQuaternion(inv);
    station.toWorld(v.set(L.x + C.rim[0], L.y + C.rim[1], L.z + C.rim[2]), rim.position); rim.position.sub(rig.position).applyQuaternion(inv);
  }
  function updateCamera(dt) {
    t += dt;
    camera.position.copy(camPos).add(v.set(Math.sin(t * 0.13) * 1.2, Math.sin(t * 0.21) * 0.5, 0));
    camera.lookAt(camLook);
    if (camera.fov !== 52) { camera.fov = 52; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    model.position.y = Math.sin(t * 0.7) * 0.12; // the clamps flex a little
  }

  // ---------- menus ----------
  let view = 'main', flashT = 0;
  const relicN = () => Object.values(G.relics).filter(Boolean).length;
  const latestBriefing = () => [...BRIEFINGS].reverse().find((b) => G.briefed.has(b.id) && briefingLines(b, G).length);

  const mainMenu = createMenu($('hub-menu'), () => [
    ...(latestBriefing() ? [{ label: G.lanternLost ? 'BRIEFING · WREN' : 'BRIEFING · ILSA', act: () => { story.clear(); story.lines(briefingLines(latestBriefing(), G)); } }] : []),
    { label: 'WORKSHOP', act: () => setView('shop') },
    { label: 'LAUNCH', act: () => {
      // the tutorial's Lantern stop: not without a repair kit
      if (ctx.kitLesson && ctx.kitLesson()) { deny(); story.say('Ilsa wants us to take a repair kit first. The Workshop has them.'); return; }
      ctx.launch();
    } },
  ]);
  function shopItems() {
    // Rover Repair Kits first: a guardian fight's only revive
    const kitItem = {
      kit: true,
      label: () => 'ROVER REPAIR KIT · CARRYING ' + (G.kits || 0) + ' / ' + KIT.max,
      value: () => ((G.kits || 0) >= KIT.max ? 'FULL' : '◆ ' + KIT.cost),
      act: buyKit,
    };
    const items = [kitItem, ...UPGRADES.map((u) => {
      const k = tier(G.upgrades, u.id), cost = nextCost(G.upgrades, u.id);
      return {
        up: u,
        label: () => u.name + (k ? ' ' + ROMAN[k] : '') + (cost !== undefined ? '  →  ' + ROMAN[k + 1] : ''),
        value: () => (cost === undefined ? 'FITTED' : '◆ ' + cost),
        act: () => buy(u),
      };
    })];
    if (G.lanternDark && !G.lanternLost) items.push({
      scrub: true,
      label: () => 'SCRUBBER PARTS · +' + SCRUBBER.days + ' DAYS AIR',
      value: () => '◆ ' + SCRUBBER.cost(G.scrubbers || 0),
      act: buyAir,
    });
    items.push({ label: 'BACK', act: () => setView('main') });
    return items;
  }
  const shopMenu = createMenu($('shop-menu'), shopItems, (it) => describe(it));

  function describe(it) {
    const el = $('shop-desc');
    if (!it) { el.innerHTML = ''; return; }
    if (it.up) {
      const k = tier(G.upgrades, it.up.id);
      el.innerHTML = '<div class="grp">' + it.up.group + '</div>' + it.up.tiers.map((d, i) =>
        `<div class="tier ${i < k ? 'own' : i === k ? 'next' : ''}"><b>MK ${ROMAN[i + 1]}</b> ${d}${i < k ? ' · fitted' : ''}</div>`).join('');
    } else if (it.kit) {
      el.innerHTML = '<div class="grp">ROVER · SUPPLIES</div><div class="tier next">If the rover&rsquo;s hull breaks in a guardian fight, a kit puts it back up on the spot, and the guardian keeps its wounds. Without one, WREN hauls the rover out and the guardian mends. Carry up to ' + KIT.max + '.</div>'
        + (ctx.kitLesson && ctx.kitLesson() ? '<div class="tier own">Ilsa: kits first, Runner. The rest can wait.</div>' : '');
    } else if (it.scrub) {
      el.innerHTML = '<div class="grp">LANTERN STATION</div><div class="tier next">Sent up the lift to Ilsa\'s crews. Each crate buys the station ' + SCRUBBER.days + ' more days of air. They cost more each time; parts are scarce.</div>';
    } else el.innerHTML = '';
  }
  function deny() {
    sfx.denied(); flashT = 1.2;
    $('hub-status').classList.add('short');
  }
  let buyBark = 0;
  function buyKit() {
    if ((G.kits || 0) >= KIT.max) { deny(); return; }
    if (G.wayshards < KIT.cost) { deny(); return; }
    G.wayshards -= KIT.cost;
    G.kits = (G.kits || 0) + 1;
    sfx.buy();
    if (!G.lanternLost && !story.busy && !(ctx.tutorial && ctx.tutorial())) story.line(buyBark++ % 2 ? 'hub-buy-2' : 'hub-buy-1');
    ctx.autosave(true);
    shopMenu.render();
  }
  function buy(u) {
    const cost = nextCost(G.upgrades, u.id);
    if (cost === undefined) return;
    if (ctx.kitLesson && ctx.kitLesson()) { deny(); describe({ kit: true }); return; } // the tutorial: kits first
    if (G.wayshards < cost) { deny(); return; }
    G.wayshards -= cost;
    G.upgrades[u.id] = tier(G.upgrades, u.id) + 1;
    sfx.buy();
    ctx.applyUpgrades();
    if (G.lanternLost) { /* no one on the dock to say it */ }
    else if (u.id === 'rime') { story.flush(); story.line('hub-rime'); }
    else if (u.id === 'sounder') { story.flush(); story.line('hub-sounder'); }
    else if (!story.busy) story.line(buyBark++ % 2 ? 'hub-buy-2' : 'hub-buy-1');
    ctx.autosave(true);
    shopMenu.render();
  }
  function buyAir() {
    const cost = SCRUBBER.cost(G.scrubbers || 0);
    if (G.wayshards < cost) { deny(); return; }
    G.wayshards -= cost;
    G.scrubbers = (G.scrubbers || 0) + 1;
    G.air += SCRUBBER.days;
    sfx.buy();
    story.flush(); story.line('hub-air');
    ctx.autosave(true);
    shopMenu.render();
  }
  function setView(w) {
    view = w;
    $('hub-view-main').hidden = w !== 'main';
    $('hub-view-shop').hidden = w !== 'shop';
    if (w === 'shop') { shopMenu.reset(); shopMenu.render(); } else { mainMenu.render(); }
  }

  function status() {
    const bits = [`<span class="shards">◆ ${G.wayshards} WAYSHARDS</span>`, 'HULL ' + Math.round(G.ship.hull * 100) + '%'];
    if (G.lanternLost) bits.push('<span class="air low">LANTERN LOST</span>');
    else if (G.lanternDark) bits.push(`<span class="${G.air <= 3 ? 'air low' : 'air'}">RESERVE AIR ${airText(G.air)}</span>`);
    else bits.push('<span class="line">WAYLINE LIVE</span>');
    bits.push('RELICS ' + relicN() + ' / 3');
    return bits.join('<i>·</i>');
  }
  let lastStatus = '', lastTask = null;
  function radio() {
    const c = G.comms[G.comms.length - 1];
    const el = $('hub-radio');
    const on = c && c.t < (c.dur || 6) + 0.6;
    el.classList.toggle('on', !!on);
    if (on && el.dataset.key !== c.text) {
      el.dataset.key = c.text;
      el.querySelector('.who').textContent = c.short || c.from;
      el.querySelector('.who').style.color = 'rgb(' + c.rgb + ')';
      el.querySelector('.txt').textContent = c.text;
      el.style.borderLeftColor = 'rgb(' + c.rgb + ')';
    }
  }

  return {
    get visible() { return rig.visible; },
    get view() { return view; },
    // after the fade: hull patched, overlay up, Ilsa talks
    open() {
      place(); t = 0; rig.visible = true;
      G.ship.hull = 1; G.ship.shield = 1; G.ship.boostEnergy = 1;
      ctx.show('hub', true);
      setView('main'); mainMenu.reset(); mainMenu.render();
      // the tutorial's Lantern stop does its own talking (and its lessons wait on their lines)
      if (ctx.tutorial && ctx.tutorial()) { G.dockCount = (G.dockCount || 0) + 1; return; }
      story.clear();
      const due = BRIEFINGS.filter((b) => !G.briefed.has(b.id) && b.when(G));
      if (due.length) {
        const ids = [];
        for (const b of due) { G.briefed.add(b.id); ids.push(...briefingLines(b, G)); }
        story.lines(ids.length ? ids : G.lanternLost ? ['hub-lost-back'] : []);
        mainMenu.render(); // the BRIEFING item appears now
      } else story.line(G.lanternLost ? 'hub-lost-back' : G.dockCount % 2 ? 'hub-back-2' : 'hub-back-1');
      // saves from before the kits (they never had the tutorial's Lantern stop): Ilsa mentions them once
      if (!G.lanternLost && !G.heard.has('t-hub-2') && !G.heard.has('hub-kits')) story.line('hub-kits');
      G.dockCount = (G.dockCount || 0) + 1;
    },
    close() { rig.visible = false; ctx.show('hub', false); },
    // resume after a pause: the view is still placed
    reshow() { rig.visible = true; ctx.show('hub', true); },
    hideView() { rig.visible = false; },
    updateCamera,
    update(dt, P) {
      if (view === 'shop' && P.has('back')) { setView('main'); return; }
      (view === 'shop' ? shopMenu : mainMenu).nav(P);
      const s = status();
      if (s !== lastStatus) { $('hub-status').innerHTML = s; lastStatus = s; }
      if (flashT > 0) { flashT -= dt; if (flashT <= 0) $('hub-status').classList.remove('short'); }
      if (view === 'shop') shopMenu.refresh();
      // the tutorial's task, while docked (the canopy HUD is hidden here)
      const tk = G.task && ctx.tutorial && ctx.tutorial() ? G.task.label + '|' + G.task.key() : '';
      if (tk !== lastTask) {
        lastTask = tk;
        const el = $('hub-task'); el.hidden = !tk;
        if (tk) { const [l, k] = tk.split('|'); el.innerHTML = '▸ ' + l + '<b>' + k + '</b>'; }
      }
      radio();
    },
  };
}
