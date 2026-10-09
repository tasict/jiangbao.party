import { TITLE, SUBTITLE } from '../game/config.js';
import { isIOS } from './device.js';

// In-game camera: grabs the rendered frame, mounts it on a paper photo card with the title and
// the site address, and hands it to the system share sheet, where the player picks the app.


export const SITE_URL = 'https://jiangbao.party/';
const FONT = '"LXGW WenKai TC", "PingFang TC", "Noto Sans TC", sans-serif';
const SHARE_TEXT = `在《${TITLE} - ${SUBTITLE}》拍到的 📸`;

export class PhotoBooth {
  constructor(canvas) {
    this.canvas = canvas;
    this.pending = null;
  }

  // Ask for the next rendered frame; `done` receives the finished JPEG blob.
  request(done) {
    this.pending = done;
  }

  // Call straight after rendering, while the WebGL drawing buffer still holds the frame.
  afterRender() {
    if (!this.pending) return;
    const done = this.pending;
    this.pending = null;
    const src = this.canvas;
    const s = Math.min(1, 1600 / Math.max(src.width, src.height));
    const shot = document.createElement('canvas');
    shot.width = Math.round(src.width * s);
    shot.height = Math.round(src.height * s);
    shot.getContext('2d').drawImage(src, 0, 0, shot.width, shot.height);
    compose(shot).then(done);
  }
}

// A white flash over the screen when the shutter fires.
export function flash() {
  const el = document.createElement('div');
  el.className = 'photo-flash';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function dateStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

async function compose(shot) {
  await document.fonts?.load(`700 40px "LXGW WenKai TC"`).catch(() => {});
  const w = shot.width, h = shot.height, base = Math.min(w, h);
  const pad = Math.round(base * 0.04), cap = Math.round(base * 0.17);
  const c = document.createElement('canvas');
  c.width = w + pad * 2;
  c.height = h + pad + cap;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f6efe0';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(shot, pad, pad);
  ctx.strokeStyle = 'rgba(51, 48, 46, 0.7)';
  ctx.lineWidth = Math.max(2, base * 0.004);
  ctx.strokeRect(pad, pad, w, h);

  // orange date stamp in the corner, like an old film camera
  ctx.font = `700 ${Math.round(base * 0.042)}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(240, 122, 42, 0.92)';
  ctx.fillText(dateStamp(), pad + w - base * 0.03, pad + h - base * 0.025);

  // caption: title on the first line, subtitle and address on the second
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#c63d2c';
  ctx.font = `700 ${Math.round(cap * 0.36)}px ${FONT}`;
  ctx.fillText(TITLE, pad, pad + h + cap * 0.38);
  ctx.font = `400 ${Math.round(cap * 0.2)}px ${FONT}`;
  ctx.fillStyle = '#6b625a';
  ctx.fillText(`— ${SUBTITLE} —`, pad, pad + h + cap * 0.74);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#33302e';
  ctx.fillText('jiangbao.party', pad + w, pad + h + cap * 0.74);
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.9));
}

const fileName = () => `jiangbao-${dateStamp().replaceAll('.', '')}.jpg`;
const asFile = (blob) => new File([blob], fileName(), { type: 'image/jpeg' });
const canShareFile = (file) => !!navigator.canShare?.({ files: [file] });

function download(blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// System share sheet with the picture attached; the player picks where it goes.
export async function sharePhoto(blob, note) {
  const file = asFile(blob);
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], text: `${SHARE_TEXT} ${SITE_URL}` });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  download(blob);
  note('這個瀏覽器不能直接分享，照片已經下載，可以自己上傳');
}

// Browsers can't write to the photo library. On iOS the share sheet's 儲存影像 can; elsewhere
// the download lands in the Downloads folder, which phone gallery apps pick up.
export async function savePhoto(blob, note, mobile) {
  const file = asFile(blob);
  if (isIOS && canShareFile(file)) {
    note('在選單裡點「儲存影像」就會存進相簿');
    try {
      await navigator.share({ files: [file] });
    } catch {
      // cancelled
    }
    return;
  }
  download(blob);
  note(mobile ? '照片存到「下載」資料夾了，相簿 App 裡就看得到' : '照片已經下載');
}
