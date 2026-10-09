import { Minimap } from './minimap.js';
import { formatTime } from '../game/storage.js';
import { ITEMS, TOOLS, BIKE, MILK } from '../game/config.js';

const $ = (root, sel) => root.querySelector(sel);

// All in-game DOM: quest card, compass arrow, timer/money, minimap, health,
// backpack, station menus, prompts, toasts, newspaper headlines, trophies.
export class HUD {
  constructor(root, { onPause, onMapToggle, onPhoto } = {}) {
    this.root = root;
    this.onPause = onPause;
    this.onPhoto = onPhoto;
    this.onMapToggle = onMapToggle;
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="hud-quest paper">
        <div class="q-title"></div>
        <div class="q-text"></div>
        <div class="q-bar"><i></i></div>
        <div class="q-week"></div>
        <div class="q-hint"></div>
      </div>
      <div class="hud-compass"><svg viewBox="0 0 40 40"><path d="M20 3 L31 30 L20 23 L9 30 Z"/></svg><div class="c-label"></div></div>
      <div class="hud-topright">
        <div class="hud-stats paper"><div class="t-time">0:00.0</div><div class="t-money">$0</div></div>
        <canvas class="minimap clickable" title="M：展開地圖"></canvas>
        <button class="hud-photo btn btn--small clickable" title="拍照（C）"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>拍照</button>
      </div>
      <div class="hud-left">
        <div class="hp paper"><div class="hp-fill"></div><div class="hp-text"></div></div>
        <div class="chips"></div>
      </div>
      <div class="hud-bag paper"></div>
      <div class="hud-target"><div class="tg-label"></div><div class="tg-bar"><i></i></div></div>
      <div class="hud-eye paper"></div>
      <div class="hud-prompt paper"></div>
      <div class="hud-menu paper clickable"></div>
      <button class="hud-action btn btn--gold clickable"></button>
      <button class="hud-pause btn btn--small clickable" title="暫停（P）">暫停</button>
      <div class="hud-toasts"></div>
      <div class="hud-headline"></div>
      <div class="hud-trophies"></div>
      <div class="hud-dialog paper"></div>
      <div class="hud-down"></div>
      <div class="crosshair"></div>
      <div class="hud-bigmap clickable"><div class="paper"><canvas></canvas><div class="bm-foot">按 M 或點一下關閉</div></div></div>
    `;
    root.appendChild(this.el);
    this.q = {
      title: $(this.el, '.q-title'), text: $(this.el, '.q-text'), bar: $(this.el, '.q-bar'), barFill: $(this.el, '.q-bar i'),
      week: $(this.el, '.q-week'), hint: $(this.el, '.q-hint'),
    };
    this.compass = $(this.el, '.hud-compass');
    this.compassSvg = $(this.el, '.hud-compass svg');
    this.compassLabel = $(this.el, '.c-label');
    this.timeEl = $(this.el, '.t-time');
    this.moneyEl = $(this.el, '.t-money');
    this.mapCanvas = $(this.el, '.minimap');
    this.bigMap = $(this.el, '.hud-bigmap');
    this.bigCanvas = $(this.el, '.hud-bigmap canvas');
    this.minimap = new Minimap(this.mapCanvas, this.bigCanvas);
    this.hpFill = $(this.el, '.hp-fill');
    this.hpText = $(this.el, '.hp-text');
    this.chips = $(this.el, '.chips');
    this.bagEl = $(this.el, '.hud-bag');
    this.targetEl = $(this.el, '.hud-target');
    this.targetLabel = $(this.el, '.tg-label');
    this.targetFill = $(this.el, '.tg-bar i');
    this.eyeEl = $(this.el, '.hud-eye');
    this.promptEl = $(this.el, '.hud-prompt');
    this.menuEl = $(this.el, '.hud-menu');
    this.actionBtn = $(this.el, '.hud-action');
    this.toastsEl = $(this.el, '.hud-toasts');
    this.headlineEl = $(this.el, '.hud-headline');
    this.trophiesEl = $(this.el, '.hud-trophies');
    this.dialogEl = $(this.el, '.hud-dialog');
    this.downEl = $(this.el, '.hud-down');
    this.cache = {};
    this.time = 0;
    this.bigOpen = false;

    $(this.el, '.hud-pause').addEventListener('click', () => this.onPause?.());
    $(this.el, '.hud-photo').addEventListener('click', () => this.onPhoto?.());
    this.mapCanvas.addEventListener('click', () => this.toggleMap());
    this.bigMap.addEventListener('click', () => this.toggleMap(false));
    // pointerup rather than click: on phones a second finger tapping while the first holds the
    // joystick never produces a click. Touch pointers are captured by the element they started on,
    // so a look-drag that ends over the menu does not buy anything.
    this.menuEl.addEventListener('pointerup', (e) => {
      const b = e.target.closest('[data-opt]');
      if (b && !b.disabled && this.game) this.game.choose(b.dataset.opt);
    });
    this.actionBtn.addEventListener('pointerup', () => this.game?.doAction());
    this.hide();
  }

  show() { this.el.style.display = ''; }
  hide() { this.el.style.display = 'none'; this.toggleMap(false); }

  toggleMap(force) {
    this.bigOpen = force ?? !this.bigOpen;
    this.bigMap.style.display = this.bigOpen ? 'flex' : 'none';
    this.onMapToggle?.(this.bigOpen);
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  toast(text) {
    const t = document.createElement('div');
    t.className = 'toast paper';
    t.textContent = text;
    this.toastsEl.appendChild(t);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2800);
    setTimeout(() => t.remove(), 3300);
  }

  headline(title, sub) {
    this.headlineEl.innerHTML = `<div class="news"><div class="news-mast">甘蔗日報 · 號外</div><div class="news-title"></div><div class="news-sub"></div></div>`;
    $(this.headlineEl, '.news-title').textContent = title;
    $(this.headlineEl, '.news-sub').textContent = sub;
    this.headlineEl.classList.remove('out');
    this.headlineEl.style.display = 'flex';
    clearTimeout(this.headlineTimer);
    this.headlineTimer = setTimeout(() => {
      this.headlineEl.classList.add('out');
      setTimeout(() => (this.headlineEl.style.display = 'none'), 450);
    }, 3600);
  }

  dialog(who, text) {
    this.dialogEl.innerHTML = '<b></b><span></span>';
    $(this.dialogEl, 'b').textContent = who;
    $(this.dialogEl, 'span').textContent = text;
    this.dialogEl.style.display = 'block';
    clearTimeout(this.dialogTimer);
    this.dialogTimer = setTimeout(() => (this.dialogEl.style.display = 'none'), 3400);
  }

  trophy(def) {
    const t = document.createElement('div');
    t.className = `trophy paper tier-${def.tier}`;
    t.innerHTML = '<div class="tr-cup"></div><div><div class="tr-k">獲得獎盃</div><div class="tr-name"></div></div>';
    $(t, '.tr-name').textContent = def.name;
    this.trophiesEl.appendChild(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3700);
  }

  // Full-screen paper card for a time skip.
  dawnCard(title, sub) {
    const c = document.createElement('div');
    c.className = 'dawn-card';
    c.innerHTML = '<div class="paper"><div class="dc-title"></div><div class="dc-sub"></div></div>';
    c.querySelector('.dc-title').textContent = title;
    c.querySelector('.dc-sub').textContent = sub;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3000);
  }

  down(on, lost = 0) {
    this.downEl.style.display = on ? 'flex' : 'none';
    if (on) this.downEl.innerHTML = `<div class="paper"><div class="d-title">你倒下了…</div><div class="d-sub">${lost ? `掉了 ${lost} 個素材，` : ''}馬上回大安基地</div></div>`;
  }

  togglePause() {
    this.onPause?.();
  }

  update(game, dt) {
    this.game = game;
    this.time += dt;
    const o = game.objective;

    // quest card
    this.set('qt', this.q.title, o.title);
    this.set('qx', this.q.text, o.text);
    const hasBar = o.progress != null;
    this.set('qbd', this.q.bar.style, hasBar ? 'block' : 'none', 'display');
    if (hasBar) this.set('qbw', this.q.barFill.style, `${Math.round(o.progress * 100)}%`, 'width');
    const week = o.week != null ? `本週還剩 ${Math.ceil(o.week)} 秒` : '';
    this.set('qw', this.q.week, week);
    this.set('qh', this.q.hint, o.hint || '');

    // compass arrow towards the objective
    if (o.target && !game.finished) {
      const p = game.player.pos, yaw = game.player.yaw;
      const dx = o.target.x - p.x, dz = o.target.z - p.z;
      const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const ly = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
      const ang = Math.atan2(lx, ly);
      const dist = Math.hypot(dx, dz);
      this.compass.style.display = '';
      this.compassSvg.style.transform = `rotate(${ang}rad)`;
      this.set('cl', this.compassLabel, `${o.target.label || ''} ${Math.round(dist)}m`);
    } else this.compass.style.display = 'none';

    this.set('time', this.timeEl, formatTime(game.time));
    this.set('money', this.moneyEl, `$${game.money.toLocaleString()}`);

    // minimap (redraw ~15fps)
    this.mapClock = (this.mapClock || 0) - dt;
    if (this.mapClock <= 0) {
      this.mapClock = 0.066;
      this.drawMap(game, o);
    }

    // health and status
    const hpPct = Math.max(0, game.hp / game.hpMax);
    this.set('hpw', this.hpFill.style, `${(hpPct * 100).toFixed(1)}%`, 'width');
    this.set('hpc', this.hpFill.style, game.status.poison > 0 ? '#86c56a' : hpPct < 0.3 ? '#e0614f' : '#e8836f', 'background');
    this.set('hpt', this.hpText, `${Math.ceil(game.hp)} / ${game.hpMax}`);
    const S = game.status;
    const chips = [];
    if (S.poison > 0) chips.push(['中毒', 'green']);
    if (S.slow > 0) chips.push(['變慢', 'gray']);
    if (S.haste > 0) chips.push([`攻速 ×1.5 ${Math.ceil(S.haste)}s`, 'gold']);
    if (S.shame > 0) chips.push([`炎上中 ${Math.ceil(S.shame)}s`, 'red']);
    if (game.blessed) chips.push(['甘蔗的祝福', 'gold']);
    if (game.underUmbrella) chips.push(['遮陽傘下', 'blue']);
    if (game.inSafeZone(game.player.pos.x, game.player.pos.z)) chips.push(['安全區', 'blue']);
    chips.push([TOOLS[game.levels.tool].name, 'ink']);
    if (game.levels.bike) chips.push([BIKE[game.levels.bike].name, 'ink']);
    if (game.workers) chips.push([`工人 ×${game.workers}`, 'ink']);
    const chipHtml = chips.map(([t, c]) => `<span class="chip chip-${c}">${t}</span>`).join('');
    this.set('chips', this.chips, chipHtml, 'innerHTML');

    // backpack
    const counts = { wood: 0, tail: 0, bigtail: 0 };
    for (const it of game.bag) counts[it.type]++;
    const cap = game.bagCap();
    const parts = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `<span>${ITEMS[k].name} ×${n}</span>`);
    let bagHtml = `<b class="${game.bag.length >= cap ? 'full' : ''}">背包 ${game.bag.length}/${cap}</b>${parts.join('')}`;
    if (game.holding === 'cane') bagHtml = '<b>手上：甘蔗</b><span>（不能攻擊）</span>';
    if (game.holding === 'crate') bagHtml = `<b>手上：鮮奶箱</b><span>剩 ${game.milk.bottles} 瓶</span>`;
    this.set('bag', this.bagEl, bagHtml, 'innerHTML');

    // target under the crosshair
    const t = game.target;
    let tLabel = '', tPct = 0;
    if (t) {
      if (t.kind === 'rat') { tLabel = t.ref.kind === 'big' ? '大老鼠' : '老鼠'; tPct = t.ref.hp / t.ref.def.hp; }
      else if (t.kind === 'king') { tLabel = '復活的老鼠王'; tPct = t.ref.hp / t.ref.max; }
      else if (t.kind === 'nest') { tLabel = '鼠窩'; tPct = t.ref.hp / t.ref.max; }
      else if (t.kind === 'tree') { tLabel = `${game.treeLabel(t.ref)}（約 $${game.treeWorth(t.ref)}）`; tPct = t.ref.hp / t.ref.maxHp; }
      else if (t.kind === 'block') { tLabel = t.ref.label + (game.levels.tool < t.ref.tier ? `（要${TOOLS[t.ref.tier].name}）` : ''); tPct = t.ref.hp / t.ref.max; }
    }
    this.set('tgd', this.targetEl.style, t ? 'block' : 'none', 'display');
    if (t) {
      this.set('tgl', this.targetLabel, tLabel);
      this.set('tgw', this.targetFill.style, `${Math.max(0, tPct * 100).toFixed(0)}%`, 'width');
    }

    // who can see you (only while holding the sugarcane)
    if (game.holding === 'cane') {
      const n = game.watchers;
      this.set('eyed', this.eyeEl.style, 'block', 'display');
      this.set('eye', this.eyeEl, n ? `有 ${n} 個人看得到你` : '現在沒人看到你，可以丟了', 'textContent');
      this.set('eyec', this.eyeEl, `hud-eye paper ${n ? 'seen' : 'clear'}`, 'className');
    } else this.set('eyed', this.eyeEl.style, 'none', 'display');

    // context action
    const a = game.currentAction();
    const touch = game.input.isTouch;
    this.set('pr', this.promptEl, a && !touch ? `[E] ${a.label}` : '');
    this.set('prd', this.promptEl.style, a && !touch ? 'block' : 'none', 'display');
    this.set('act', this.actionBtn, a ? a.label : '');
    this.set('actd', this.actionBtn.style, a && touch ? 'block' : 'none', 'display');

    // station menu
    const m = game.menu;
    const sig = m ? JSON.stringify(m) + game.money : '';
    if (sig !== this.cache.menu) {
      this.cache.menu = sig;
      if (!m) this.menuEl.style.display = 'none';
      else {
        this.menuEl.style.display = 'block';
        const opts = m.options.map((op, i) => {
          const poor = op.cost != null && game.money < op.cost;
          return `<button class="m-opt ${op.disabled ? 'off' : ''} ${poor ? 'poor' : ''}" data-opt="${op.id}" ${op.disabled ? 'disabled' : ''}>
            <span class="m-key">${touch ? '' : i + 1}</span><span class="m-label">${op.label}</span>${op.cost != null ? `<span class="m-cost">$${op.cost}</span>` : ''}</button>`;
        }).join('');
        this.menuEl.innerHTML = `<div class="m-title">${m.title}</div><div class="m-note">${m.note || ''}</div>${opts}`;
      }
    }
  }

  drawMap(game, o) {
    const c = this.mapCanvas;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    if (!w) return;
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    this.minimap.draw(c.getContext('2d'), c.width, c.height, game, { objective: o, time: this.time });
    if (this.bigOpen) {
      const b = this.bigCanvas;
      const bw = b.clientWidth, bh = b.clientHeight;
      if (b.width !== Math.round(bw * dpr)) {
        b.width = Math.round(bw * dpr);
        b.height = Math.round(bh * dpr);
      }
      this.minimap.draw(b.getContext('2d'), b.width, b.height, game, { labels: true, objective: o, time: this.time });
    }
  }
}
