import { isIOS, isAndroid, isIOSChrome, isStandalone } from './device.js';

// "Add to home screen" help for the settings page on phones: Chrome on Android can install
// straight from a button; everywhere else the player follows the steps for their browser.

let deferred = null;
addEventListener('beforeinstallprompt', (e) => {
  // keep Chrome's own banner from popping up mid-game; the settings page offers the install
  e.preventDefault();
  deferred = e;
});
addEventListener('appinstalled', () => (deferred = null));

const ICON = {
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M8 10H6v11h12V10h-2"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>',
  add: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
  install: '<svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3"/></svg>',
};
const i = (name) => `<i class="a2hs-ico">${ICON[name]}</i>`;
const pill = (text) => `<b class="a2hs-pill">${text}</b>`;

const STEPS = {
  safari: [
    `點下方工具列的「分享」${i('share')}（新版 Safari 要先點右下角的 ${i('more')}）`,
    `往下滑，點「加入主畫面」${i('add')}`,
    `點右上角的 ${pill('加入')}，主畫面就會出現蔣寶的甘蔗圖示`,
  ],
  'ios-chrome': [
    `點網址列右邊的「分享」${i('share')}`,
    `點「加入主畫面」${i('add')}`,
    `點右上角的 ${pill('加入')}`,
  ],
  android: [
    `點右上角的選單 ${i('menu')}`,
    `點「加到主畫面」或「安裝應用程式」${i('install')}`,
    `點 ${pill('安裝')}，主畫面就會出現蔣寶的甘蔗圖示`,
  ],
};
const TABS = [['safari', 'iPhone Safari'], ['ios-chrome', 'iPhone Chrome'], ['android', 'Android Chrome']];

const steps = (key) => STEPS[key].map((s) => `<li>${s}</li>`).join('');

// Settings section; empty on desktops and when already opened from the home screen.
export function homescreenSection() {
  if (!(isIOS || isAndroid) || isStandalone()) return '';
  const pick = isIOSChrome ? 'ios-chrome' : isIOS ? 'safari' : 'android';
  return `
    <div class="field a2hs"><span>加到手機主畫面</span>
      <div class="a2hs-note">像 App 一樣從主畫面打開，畫面更大、不會被網址列擋住</div>
      ${deferred ? '<button class="btn btn--gold a2hs-install" data-a2hs="install">安裝到主畫面</button>' : ''}
      <div class="tabs">${TABS.map(([k, label]) => `<button class="tab ${k === pick ? 'on' : ''}" data-a2hs-tab="${k}">${label}</button>`).join('')}</div>
      <ol class="a2hs-steps">${steps(pick)}</ol>
    </div>`;
}

export function bindHomescreen(el) {
  const list = el.querySelector('.a2hs-steps');
  if (!list) return;
  el.querySelectorAll('[data-a2hs-tab]').forEach((b) => (b.onclick = () => {
    list.innerHTML = steps(b.dataset.a2hsTab);
    el.querySelectorAll('[data-a2hs-tab]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  const btn = el.querySelector('[data-a2hs=install]');
  if (btn) btn.onclick = async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    btn.textContent = outcome === 'accepted' ? '已加到主畫面' : '安裝到主畫面';
    btn.disabled = outcome === 'accepted';
  };
}
