// Canopy HUD: reticle, flight-path marker, target brackets, off-screen arrows, prompts and notices.
import * as THREE from 'three';
import { fmtDist } from './cockpit.js';
import { settings } from './settings.js';

const FONT = '"Chakra Petch", sans-serif';
const CYAN = '110,242,255', AMBER = '255,179,90', GOLD = '255,211,106', RED = '255,77,109';

const tmp = new THREE.Vector3();
const camSpace = new THREE.Vector3();

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 1, H = 1, DPR = 1;

  function project(world, cam) {
    camSpace.copy(world).applyMatrix4(cam.matrixWorldInverse);
    tmp.copy(world).project(cam);
    return {
      x: (tmp.x * 0.5 + 0.5) * W,
      y: (-tmp.y * 0.5 + 0.5) * H,
      behind: camSpace.z > 0,
      cx: camSpace.x, cy: camSpace.y,
    };
  }

  function text(str, x, y, size, rgb, a = 1, align = 'center', weight = 600) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(${rgb},${a})`;
    ctx.fillText(str, x, y);
  }

  function brackets(x, y, r, rgb, a) {
    const L = Math.max(6, r * 0.45);
    ctx.strokeStyle = `rgba(${rgb},${a})`; ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.moveTo(x + sx * r, y + sy * (r - L)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - L), y + sy * r);
    }
    ctx.stroke();
  }

  function edgeArrow(p, rgb, label) {
    const cx = W / 2, cy = H * 0.4;
    let dx = p.cx, dy = -p.cy;
    if (p.behind && Math.hypot(dx, dy) < 1e-3) dy = 1;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const rx = W * 0.4, ry = H * 0.21; // stays clear of the subtitle box below
    const t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    const x = cx + dx * t, y = cy + dy * t;
    const ang = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = `rgba(${rgb},0.9)`;
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -9); ctx.lineTo(-2, 0); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (label) text(label, x - dx * 28, y - dy * 22, 13, rgb, 0.85);
  }

  function onScreen(p, m = 30) {
    return !p.behind && p.x > m && p.x < W - m && p.y > m && p.y < H * 0.64;
  }

  return {
    resize(w, h) {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = w; H = h;
      canvas.width = Math.round(w * DPR); canvas.height = Math.round(h * DPR);
    },
    draw(G, cam) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (G.state === 'title' || G.inAssault || G.inSurface) return;
      const s = G.ship;
      const scale = Math.min(W, H) / 900;
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));

      // planets
      G.planets.forEach((pl, i) => {
        const isT = i === G.targetIndex;
        const dist = pl.center.distanceTo(s.pos);
        const surf = Math.max(0, dist - pl.data.R);
        const p = project(pl.center, cam);
        const rgb = isT ? GOLD : AMBER;
        if (onScreen(p, 10)) {
          const ang = Math.asin(Math.min(1, pl.data.R / dist));
          const rpx = Math.tan(ang) / tanHalf * (H / 2);
          const r = Math.max(16, Math.min(rpx * 1.1, H * 0.3));
          if (rpx < H * 0.3) brackets(p.x, p.y, r, rgb, isT ? 0.95 : 0.55);
          const ly = rpx < H * 0.3 ? p.y - r - 16 : H * 0.12;
          text(pl.data.name + (isT ? '  ◆' : ''), p.x, ly - 15, 15 * Math.max(0.85, scale), rgb, isT ? 1 : 0.7, 'center', 700);
          text(fmtDist(surf), p.x, ly + 2, 13 * Math.max(0.85, scale), rgb, isT ? 0.9 : 0.6);
        } else if (isT) {
          edgeArrow(p, GOLD, pl.data.name);
        }
      });

      // Lantern's dock bay as the nav target: a gold diamond on the bay mouth
      if ((G.targetIndex === G.lanternNav || G.homeward) && G.bayMouth) { // always shown on the way home
        const bm = G.bayMouth(), p = project(bm.clone(), cam), d = bm.distanceTo(s.pos);
        if (onScreen(p, 10)) {
          const r = 16 * Math.max(0.9, scale);
          ctx.strokeStyle = `rgba(${GOLD},0.95)`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r, p.y); ctx.closePath(); ctx.stroke();
          text('LANTERN DOCK  ◆', p.x, p.y - r - 16, 15 * Math.max(0.85, scale), GOLD, 1, 'center', 700);
          text(fmtDist(d), p.x, p.y + r + 14, 13 * Math.max(0.85, scale), GOLD, 0.9);
        } else edgeArrow(p, GOLD, 'LANTERN');
      }

      // tutorial waypoint
      if (G.waypoint && G.waypoint.obj) {
        const wp = G.waypoint.obj.position;
        const p = project(wp, cam);
        if (onScreen(p, 10)) {
          const r = 18 * Math.max(0.9, scale), a = 0.7 + 0.3 * Math.sin(G.time * 6);
          ctx.strokeStyle = `rgba(${CYAN},${a})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r, p.y); ctx.closePath(); ctx.stroke();
          text(G.waypoint.label + ' · ' + fmtDist(wp.distanceTo(s.pos)), p.x, p.y + r + 14, 13 * Math.max(0.85, scale), CYAN, 0.9);
        } else edgeArrow(p, CYAN, G.waypoint.label);
      }
      if (G.lineTag && G.station) {
        // the stretch of the line just ahead of where we are along it
        const along = Math.max(0, tmp.copy(s.pos).sub(G.station.beamStart).dot(G.station.beamDir)) + 2500;
        tmp.copy(G.station.beamStart).addScaledVector(G.station.beamDir, along);
        const p = project(tmp.clone(), cam);
        if (onScreen(p, 10)) text('LANTERN WAYLINE', p.x, p.y - 18, 14 * Math.max(0.85, scale), GOLD, 0.95, 'center', 700);
        else edgeArrow(p, GOLD, 'WAYLINE');
      }

      // raider squadrons
      G.squads.forEach((sq) => {
        if (sq.state !== 'patrol') return;
        const d = sq.pos.distanceTo(s.pos);
        if (d > 9000) return;
        const p = project(sq.pos, cam);
        const near = d < 1600;
        const a = near ? 0.6 + 0.4 * Math.sin(G.time * 10) : 0.85;
        if (onScreen(p)) {
          const r = 14 * Math.max(0.9, scale);
          ctx.strokeStyle = `rgba(${RED},${a})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r, p.y); ctx.closePath(); ctx.stroke();
          text('THREAT ' + sq.level + ' · ' + fmtDist(d), p.x, p.y + r + 14, 13 * Math.max(0.85, scale), RED, a);
        } else if (d < 5000) {
          edgeArrow(p, RED, 'T' + sq.level);
        }
      });

      // flight path marker
      if (s.speed > 8) {
        tmp.copy(s.vel).normalize().multiplyScalar(5000).add(s.pos);
        const p = project(tmp, cam);
        if (onScreen(p, 0)) {
          ctx.strokeStyle = `rgba(${CYAN},0.85)`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
          ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x - 17, p.y); ctx.moveTo(p.x + 7, p.y); ctx.lineTo(p.x + 17, p.y);
          ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x, p.y - 13);
          ctx.stroke();
        }
      }

      // reticle
      const cx = W / 2, cy = H / 2, rr = 22 * Math.max(0.8, scale);
      ctx.strokeStyle = `rgba(${CYAN},0.75)`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0.25, Math.PI / 2 - 0.25); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, rr, Math.PI / 2 + 0.25, Math.PI - 0.25); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, rr, Math.PI + 0.25, Math.PI * 1.5 - 0.25); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, rr, Math.PI * 1.5 + 0.25, Math.PI * 2 - 0.25); ctx.stroke();
      ctx.fillStyle = `rgba(${CYAN},0.9)`; ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);

      // virtual mouse stick
      if (G.device === 'mouse' && settings.mouseMode === 'stick' && G.state === 'flight') {
        const R = Math.min(W, H) * 0.2;
        ctx.strokeStyle = `rgba(${CYAN},0.12)`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
        const mx = cx + G.mouseStick.x * R, my = cy + G.mouseStick.y * R;
        if (Math.hypot(G.mouseStick.x, G.mouseStick.y) > 0.05) {
          ctx.strokeStyle = `rgba(${CYAN},0.35)`; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(mx, my); ctx.stroke();
        }
        ctx.strokeStyle = `rgba(${CYAN},0.9)`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.stroke();
      }

      // notices
      const now = G.time;
      let ny = H * 0.16;
      for (const n of G.notes) {
        const age = now - n.t;
        if (age > 3.2) continue;
        const a = Math.min(1, age * 6) * Math.min(1, (3.2 - age) * 2);
        text(n.text, cx, ny, 20 * Math.max(0.85, scale), n.rgb || CYAN, a, 'center', 700);
        ny += 28 * Math.max(0.85, scale);
      }

      // subtitles for the line being spoken: speaker in their colour, text wrapped to two lines at most
      const last = G.comms[G.comms.length - 1];
      const life = last ? (last.dur || 7) + 0.8 : 0;
      if (last && last.t < life) {
        const a = Math.min(1, last.t * 6, (life - last.t) * 2);
        const fs = Math.round(18 * Math.max(0.85, scale));
        ctx.font = `500 ${fs}px ${FONT}`;
        const maxW = Math.min(W - 32, 760 * Math.max(0.85, scale));
        const words = last.text.split(' '), rows = [];
        let row = '';
        for (const wd of words) { const t2 = row ? row + ' ' + wd : wd; if (ctx.measureText(t2).width > maxW - 40 && row) { rows.push(row); row = wd; } else row = t2; }
        rows.push(row);
        const shownN = Math.floor(last.t * 60);
        const rgb = last.rgb || '110,242,255';
        const lh = fs * 1.35, top = H * 0.64, bh = rows.length * lh + 34;
        const bw = Math.min(maxW, Math.max(...rows.map((r) => ctx.measureText(r).width)) + 48);
        ctx.fillStyle = `rgba(2,10,16,${0.6 * a})`;
        ctx.fillRect(cx - bw / 2, top - 22, bw, bh);
        ctx.fillStyle = `rgba(${rgb},${a})`; ctx.fillRect(cx - bw / 2, top - 22, 3, bh);
        text((last.radio ? '◉ ' : '') + last.from, cx, top - 6, 12 * Math.max(0.85, scale), rgb, a, 'center', 700);
        let used = 0;
        rows.forEach((r, i) => {
          const vis = r.slice(0, Math.max(0, shownN - used)); used += r.length + 1;
          ctx.font = `500 ${fs}px ${FONT}`;
          const full = ctx.measureText(r).width;
          text(vis, cx - full / 2, top + 14 + i * lh, fs, '225,248,255', a, 'left', 500);
        });
      }

      // the tutorial's current task, with its key
      if (G.task && G.state === 'flight') {
        const label = G.task.label, key = G.task.key();
        const fs = Math.round(16 * Math.max(0.85, scale));
        ctx.font = `700 ${fs}px ${FONT}`;
        const kw = ctx.measureText(key).width + 18, lw = ctx.measureText(label).width;
        const bw = kw + lw + 36, x0 = cx - bw / 2, y = H * 0.1;
        const pulse = 0.7 + 0.3 * Math.sin(G.time * 4);
        ctx.fillStyle = 'rgba(2,10,16,0.6)'; ctx.fillRect(x0, y - 18, bw, 36);
        ctx.strokeStyle = `rgba(${GOLD},${pulse})`; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y - 18, bw, 36);
        ctx.fillStyle = `rgba(${GOLD},1)`; ctx.fillRect(x0 + 8, y - 12, kw, 24);
        text(key, x0 + 8 + kw / 2, y + 1, fs - 2, '2,10,16', 1, 'center', 700);
        text(label, x0 + 8 + kw + 12, y + 1, fs, GOLD, 1, 'left', 700);
      }

      // action prompt
      if (G.prompt && G.state === 'flight') {
        const key = G.device === 'gamepad' ? 'A' : 'F';
        const rgb = G.prompt.type === 'engage' ? RED : GOLD;
        const y = H * 0.555;
        const label = G.prompt.label;
        ctx.font = `700 ${Math.round(20 * Math.max(0.85, scale))}px ${FONT}`;
        const tw = ctx.measureText(label).width;
        const bw = tw + 90, bh = 42;
        const pulse = 0.75 + 0.25 * Math.sin(G.time * 5);
        ctx.fillStyle = `rgba(2,10,16,0.6)`; ctx.fillRect(cx - bw / 2, y - bh / 2, bw, bh);
        ctx.strokeStyle = `rgba(${rgb},${pulse})`; ctx.lineWidth = 2; ctx.strokeRect(cx - bw / 2, y - bh / 2, bw, bh);
        ctx.fillStyle = `rgba(${rgb},1)`; ctx.fillRect(cx - bw / 2 + 10, y - 13, 26, 26);
        text(key, cx - bw / 2 + 23, y + 1, 17, '2,10,16', 1, 'center', 700);
        text(label, cx + 18, y + 1, 20 * Math.max(0.85, scale), rgb, 1, 'center', 700);
      }

      if (G.state === 'flight' && G.device === 'mouse' && !G.locked) {
        text('CLICK TO CAPTURE THE MOUSE', cx, H * 0.36, 16, CYAN, 0.6 + 0.4 * Math.sin(G.time * 4));
      }
    },
  };
}
