import { isMobile, isStandalone, browserKind } from './device.js';

// "Add to home screen" for phones: one button on the settings page. Chrome on Android installs
// straight from it; everywhere else it opens a bottom sheet with the steps for this browser.

let deferred = null;
addEventListener('beforeinstallprompt', (e) => {
  // keep Chrome's own banner from popping up mid-game; the settings button offers the install
  e.preventDefault();
  deferred = e;
});
addEventListener('appinstalled', () => (deferred = null));

const ICON = {
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M8 10H6v11h12V10h-2"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>',
  lines: '<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14"/></svg>',
  add: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
  install: '<svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3"/></svg>',
  compass: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
};
const i = (name) => `<i class="a2hs-ico">${ICON[name]}</i>`;
const pill = (text) => `<b class="a2hs-pill">${text}</b>`;
const DONE = '主畫面就會出現蔣寶的甘蔗圖示';

const GUIDES = {
  'ios-safari': {
    label: 'iPhone Safari',
    steps: [
      `點 Safari 的「分享」${i('share')}（新版 Safari 要先點 ${i('more')}）`,
      `往下滑，點「加入主畫面」${i('add')}`,
      `點右上角的 ${pill('加入')}，${DONE}`,
    ],
  },
  'ios-chrome': {
    label: 'iPhone Chrome',
    steps: [`點網址列右邊的「分享」${i('share')}`, `點「加入主畫面」${i('add')}`, `點右上角的 ${pill('加入')}，${DONE}`],
  },
  'ios-other': {
    label: 'iPhone',
    steps: [`點瀏覽器的「分享」${i('share')}`, `點「加入主畫面」${i('add')}`, `點右上角的 ${pill('加入')}，${DONE}`],
  },
  'android-chrome': {
    label: 'Android Chrome',
    steps: [`點右上角的選單 ${i('menu')}`, `點「加到主畫面」或「安裝應用程式」${i('install')}`, `點 ${pill('安裝')}，${DONE}`],
  },
  samsung: {
    label: 'Samsung 網際網路',
    steps: [`點下方的選單 ${i('lines')}`, `點「新增頁面至」${i('add')}`, `選「主畫面」，${DONE}`],
  },
  'android-other': {
    label: 'Android',
    steps: [`打開瀏覽器的選單 ${i('menu')}`, `找「加到主畫面」或「安裝」${i('install')}`, `確認加入，${DONE}`],
  },
  'in-app': {
    label: 'App 內建的瀏覽器',
    title: '先換到瀏覽器打開',
    note: '從 Threads、LINE、Facebook 等 App 裡開的網頁，不能加到主畫面',
    steps: [
      `點右上角的 ${i('more')} 或選單`,
      `選「用瀏覽器開啟」${i('compass')}（iPhone 選 Safari，Android 選 Chrome）`,
      '在瀏覽器裡到「設定」再按一次「加到主畫面」',
    ],
    copy: true,
  },
};

// Settings section: a single button, only on phones and tablets not already running from the home screen.
export function homescreenSection() {
  if (!isMobile || isStandalone()) return '';
  return `
    <div class="field a2hs">
      <button class="btn btn--gold a2hs-open" data-a2hs="open">${ICON.add}加到主畫面</button>
      <div class="a2hs-note">像 App 一樣從主畫面打開，畫面更大、不會被網址列擋住</div>
    </div>`;
}

export function bindHomescreen(el) {
  const btn = el.querySelector('[data-a2hs=open]');
  if (!btn) return;
  btn.onclick = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        deferred = null;
        if (outcome === 'accepted') {
          btn.disabled = true;
          btn.lastChild.textContent = '已加到主畫面';
        }
        return;
      } catch {
        // Chrome refused the prompt; show the steps instead
      }
    }
    openSheet(browserKind());
  };
}

function openSheet(kind) {
  const g = GUIDES[kind] || GUIDES['android-other'];
  const root = document.createElement('div');
  root.className = 'sheet-backdrop';
  root.innerHTML = `
    <div class="sheet paper" role="dialog" aria-modal="true" aria-label="${g.title || '加到主畫面'}">
      <div class="sheet-grip"></div>
      <h3>${g.title || '加到主畫面'}</h3>
      <div class="sheet-sub">${g.note || `偵測到你在用 ${g.label}，照著做就好`}</div>
      <ol class="a2hs-steps">${g.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
      <div class="sheet-actions">
        ${g.copy ? '<button class="btn" data-sheet="copy">複製網址</button>' : ''}
        <button class="btn btn--gold" data-sheet="close">知道了</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add('open'));
  const close = () => {
    root.classList.remove('open');
    setTimeout(() => root.remove(), 260);
  };
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  root.querySelector('[data-sheet=close]').onclick = close;
  const copy = root.querySelector('[data-sheet=copy]');
  if (copy) copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.href.split('?')[0]);
      copy.textContent = '已複製';
    } catch {
      copy.textContent = location.host;
    }
  };
  // a downward swipe on the sheet closes it too
  const sheet = root.querySelector('.sheet');
  let startY = null;
  sheet.addEventListener('touchstart', (e) => (startY = e.touches[0].clientY), { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    const dy = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', (e) => {
    const dy = startY === null ? 0 : e.changedTouches[0].clientY - startY;
    startY = null;
    sheet.style.transform = '';
    if (dy > 80) close();
  });
}
