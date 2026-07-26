// Static reference check. `node --check` validates SYNTAX only — it will happily pass a
// call to a function that does not exist, which is exactly how a renamed helper shipped
// with a stale call site and hung the loader. This strips comments and string literals,
// collects everything that is defined (functions, consts, classes, class methods,
// parameters, destructured bindings) and flags any bare call to something undefined.
import fs from 'fs';
const raw=fs.readFileSync(process.argv[2]||'chk.mjs','utf8');

// --- blank out comments and string/template literals -------------------------
let s='', i=0, n=raw.length;
while(i<n){
  const c=raw[i], d=raw[i+1];
  if(c==='/'&&d==='/'){ while(i<n&&raw[i]!=='\n'){ s+=' '; i++; } continue; }
  if(c==='/'&&d==='*'){ while(i<n&&!(raw[i]==='*'&&raw[i+1]==='/')){ s+=(raw[i]==='\n'?'\n':' '); i++; } s+='  '; i+=2; continue; }
  if(c==='"'||c==="'"||c==='`'){
    const q=c; s+=' '; i++;
    while(i<n&&raw[i]!==q){ if(raw[i]==='\\'){ s+='  '; i+=2; continue; } s+=(raw[i]==='\n'?'\n':' '); i++; }
    s+=' '; i++; continue;
  }
  s+=c; i++;
}

// --- collect definitions -----------------------------------------------------
const defined=new Set();
const add=x=>{ x=x.trim(); if(/^[A-Za-z_$][\w$]*$/.test(x)) defined.add(x); };
let m;
for(const re of [/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)/g,
                 /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
                 /\bclass\s+([A-Za-z_$][\w$]*)/g,
                 /^\s*(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm,
                 /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g]){
  while((m=re.exec(s))) add(m[1]);
}
// destructured bindings
while((m=/\b(?:const|let|var)\s*\{([^}]*)\}/g.exec(s))!==null){ break; }
for(const mm of s.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g))
  for(const p of mm[1].split(',')) add(p.split(':').pop().split('=')[0]);
for(const mm of s.matchAll(/\b(?:const|let|var)\s*\[([^\]]*)\]/g))
  for(const p of mm[1].split(',')) add(p.split('=')[0]);
// parameters of every function-ish construct
for(const mm of s.matchAll(/(?:function\s*\*?\s*[A-Za-z_$][\w$]*\s*|function\s*|^\s*(?:async\s+)?(?:static\s+)?[A-Za-z_$][\w$]*\s*)\(([^()]*)\)\s*\{/gm))
  for(const p of mm[1].split(',')) add(p.split(/[:=]/)[0].replace(/[{}\[\]. ]/g,''));
for(const mm of s.matchAll(/\(([^()]*)\)\s*=>/g))
  for(const p of mm[1].split(',')) add(p.split(/[:=]/)[0].replace(/[{}\[\]. ]/g,''));
for(const mm of s.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) add(mm[1]);
// ES import bindings: import {A, B as C} from '...'  /  import D from '...'
for(const mm of s.matchAll(/\bimport\s*\{([^}]*)\}/g))
  for(const p of mm[1].split(',')) add(p.split(/\s+as\s+/).pop());
for(const mm of s.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)\s+from/g)) add(mm[1]);
for(const mm of s.matchAll(/\bimport\s*\*\s*as\s+([A-Za-z_$][\w$]*)/g)) add(mm[1]);

const HOST=new Set(['if','for','while','switch','catch','return','typeof','function','await','new',
 'console','Math','Object','Array','Map','Set','WeakMap','JSON','Promise','Number','String','Boolean',
 'Date','parseInt','parseFloat','isFinite','isNaN','setTimeout','setInterval','clearTimeout',
 'clearInterval','requestAnimationFrame','cancelAnimationFrame','fetch','document','window',
 'performance','THREE','Int8Array','Uint8Array','Uint8ClampedArray','Float32Array','Uint16Array',
 'Uint32Array','Int32Array','encodeURIComponent','decodeURIComponent','Error','RegExp','Symbol',
 'super','this','import','export','do','else','try','finally','throw','delete','void','in','of',
 'AudioContext','webkitAudioContext','alert','structuredClone','queueMicrotask','Audio','Image',
 'URL','Blob','FileReader','matchMedia','getComputedStyle','CustomEvent','Event','navigator']);

const bad=new Map();
s.split('\n').forEach((L,idx)=>{
  for(const mm of L.matchAll(/(?:^|[^.\w$?])([A-Za-z_$][\w$]*)\s*\(/g)){
    const name=mm[1];
    if(HOST.has(name)||defined.has(name)) continue;
    if(!bad.has(name)) bad.set(name, idx+1);
  }
});
if(bad.size===0){ console.log('REFCHECK OK — every called identifier resolves'); }
else { console.log('REFCHECK FAILED — called but never defined:');
  for(const [k,v] of bad) console.log(`   ${k}  (line ${v})`); process.exit(1); }
