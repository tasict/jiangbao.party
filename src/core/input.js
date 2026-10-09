// Keyboard + mouse (pointer lock, drag fallback) + touch (a joystick on one side, drag to look on the other).

export class Input {
  constructor(canvas, joystickEl) {
    this.canvas = canvas;
    this.keys = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.pressed = new Set();
    this.enabled = false;
    this.locked = false;
    this.touchMove = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.touchLook = { id: null, x: 0, y: 0 };
    this.mouseDrag = null;
    this.joystickEl = joystickEl;
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    // shown: the stick sits in its corner during play; otherwise it only appears under the thumb
    this.stick = { shown: true, side: 'left', active: false };
    addEventListener('resize', () => this.renderStick());
    // any finger on the screen means touch play, even on a tablet with a keyboard attached
    addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || this.isTouch) return;
      this.isTouch = true;
      this.renderStick();
    });

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (this.enabled && !this.isTouch && !this.locked) canvas.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.onLockChange?.(this.locked);
    });
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      } else if (this.mouseDrag) {
        this.lookDX += e.clientX - this.mouseDrag.x;
        this.lookDY += e.clientY - this.mouseDrag.y;
        this.mouseDrag = { x: e.clientX, y: e.clientY };
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) this.mouseDrag = { x: e.clientX, y: e.clientY };
    });
    addEventListener('mouseup', () => (this.mouseDrag = null));

    const opts = { passive: false };
    canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), opts);
    canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), opts);
    canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), opts);
    canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), opts);
  }

  setStick(shown, side) {
    Object.assign(this.stick, { shown, side });
    document.body.classList.toggle('stick-right', side === 'right');
    this.renderStick();
  }

  // Only during play: hidden behind menus, cutscenes and the photo preview.
  setStickActive(active) {
    if (active === this.stick.active) return;
    this.stick.active = active;
    this.renderStick();
  }

  // Resting centre of the stick, clear of the health bar and the bag.
  stickHome() {
    const x = this.stick.side === 'right' ? innerWidth - 96 : 96;
    return { x, y: innerHeight - 180 };
  }

  inMoveZone(x) {
    return this.stick.side === 'right' ? x > innerWidth * 0.55 : x < innerWidth * 0.45;
  }

  onTouchStart(e) {
    e.preventDefault();
    this.isTouch = true;
    for (const t of e.changedTouches) {
      if (this.inMoveZone(t.clientX) && this.touchMove.id === null) {
        // grab the stick where it sits, or bring it to the thumb anywhere else on that side
        const home = this.stickHome();
        const o = this.stick.shown && Math.hypot(t.clientX - home.x, t.clientY - home.y) < 80 ? home : { x: t.clientX, y: t.clientY };
        Object.assign(this.touchMove, { id: t.identifier, ox: o.x, oy: o.y, x: t.clientX, y: t.clientY });
        this.renderStick();
      } else if (this.touchLook.id === null) {
        Object.assign(this.touchLook, { id: t.identifier, x: t.clientX, y: t.clientY });
      }
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.touchMove.id) {
        this.touchMove.x = t.clientX;
        this.touchMove.y = t.clientY;
        this.renderStick();
      } else if (t.identifier === this.touchLook.id) {
        this.lookDX += (t.clientX - this.touchLook.x) * 1.6;
        this.lookDY += (t.clientY - this.touchLook.y) * 1.6;
        this.touchLook.x = t.clientX;
        this.touchLook.y = t.clientY;
      }
    }
  }

  onTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.touchMove.id) {
        this.touchMove.id = null;
        this.renderStick();
      } else if (t.identifier === this.touchLook.id) {
        this.touchLook.id = null;
      }
    }
  }

  renderStick() {
    const el = this.joystickEl;
    if (!el) return;
    const m = this.touchMove, dragging = m.id !== null;
    const on = this.stick.active && this.isTouch && (dragging || this.stick.shown);
    el.style.display = on ? 'block' : 'none';
    if (!on) return;
    const o = dragging ? { x: m.ox, y: m.oy } : this.stickHome();
    el.style.left = `${o.x}px`;
    el.style.top = `${o.y}px`;
    el.classList.toggle('held', dragging);
    const v = this.touchVector();
    el.firstElementChild.style.transform = `translate(${v.x * 34}px, ${v.y * 34}px)`;
  }

  touchVector() {
    const m = this.touchMove;
    if (m.id === null) return { x: 0, y: 0 };
    let x = (m.x - m.ox) / 50, y = (m.y - m.oy) / 50;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  // Movement intent in camera space: x = strafe right, y = forward.
  moveVector() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) y += 1;
    if (k.has('s') || k.has('arrowdown')) y -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    const t = this.touchVector();
    x += t.x;
    y -= t.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  consumeLook() {
    const d = { x: this.lookDX, y: this.lookDY };
    this.lookDX = this.lookDY = 0;
    return d;
  }

  wasPressed(k) {
    return this.pressed.has(k);
  }

  endFrame() {
    this.pressed.clear();
  }
}
