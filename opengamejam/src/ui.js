// DOM menus that work with mouse, keyboard and gamepad.
import { sfx } from './audio.js';

export function createMenu(el, getItems, onFocus) {
  let items = [], buttons = [], focus = 0;

  function mark() { buttons.forEach((b, i) => b.classList.toggle("focus", i === focus)); if (onFocus) onFocus(items[focus], focus); }

  function refresh() {
    buttons.forEach((b, i) => {
      const it = items[i];
      const lab = b.querySelector('.lab');
      if (lab) lab.textContent = typeof it.label === 'function' ? it.label() : it.label;
      const v = b.querySelector('.val');
      if (v && it.value) v.textContent = it.value();
    });
  }

  function activate(dir) {
    const it = items[focus];
    if (!it) return;
    sfx.ui();
    if (it.adjust) it.adjust(dir);
    else if (it.act) it.act();
    refresh();
  }

  function render() {
    items = getItems();
    el.innerHTML = '';
    buttons = items.map((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      const l = document.createElement('span'); l.className = 'lab';
      b.appendChild(l);
      if (it.value) { const v = document.createElement('span'); v.className = 'val'; b.appendChild(v); }
      b.addEventListener('click', (e) => {
        b.blur();
        if (e.detail === 0) return; // keyboard-triggered clicks are handled by nav()
        focus = i; mark(); activate(1);
      });
      b.addEventListener('mouseenter', () => { focus = i; mark(); });
      el.appendChild(b);
      return b;
    });
    if (focus >= items.length) focus = 0;
    refresh(); mark();
  }

  function nav(pressed) {
    if (!items.length) return;
    if (pressed.has('up')) { focus = (focus - 1 + items.length) % items.length; mark(); sfx.uiMove(); }
    if (pressed.has('down')) { focus = (focus + 1) % items.length; mark(); sfx.uiMove(); }
    const it = items[focus];
    if (it && it.adjust) {
      if (pressed.has('left')) { it.adjust(-1); refresh(); sfx.uiMove(); }
      if (pressed.has('right')) { it.adjust(1); refresh(); sfx.uiMove(); }
    }
    if (pressed.has('accept')) activate(1);
  }

  return { render, nav, refresh, reset() { focus = 0; } };
}
