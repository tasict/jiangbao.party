import { TITLE, SUBTITLE, TAGLINE, DIFFICULTY, NICKNAMES, MILK } from '../game/config.js';
import { ACHIEVEMENTS } from '../game/achievements.js';
import { getBoard, formatTime, formatTimeZh, load, save } from '../game/storage.js';
import { homescreenSection, bindHomescreen } from './homescreen.js';
import { isMobile } from './device.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Menus and overlays outside of play. Each screen replaces the content of #screens.
export class Screens {
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers;
  }

  clear() {
    this.root.innerHTML = '';
  }

  mount(html, cls = '') {
    this.root.innerHTML = `<div class="screen ${cls}">${html}</div>`;
    const el = this.root.firstElementChild;
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.h.click?.()));
    return el;
  }

  title() {
    const best = getBoard('normal')[0];
    const el = this.mount(`
      <div class="paper title-card">
        <h1>${TITLE}</h1>
        <div class="sub">— ${SUBTITLE} —</div>
        <div class="tag">${TAGLINE}</div>
        <div class="menu">
          <button class="btn btn--gold" data-go="start">開始遊戲</button>
          <div class="row">
            <button class="btn" data-go="board">排行榜</button>
            <button class="btn" data-go="trophies">成就</button>
          </div>
          <div class="row">
            <button class="btn" data-go="howto">遊玩方式</button>
            <button class="btn" data-go="settings">設定</button>
          </div>
        </div>
        <div class="best">${best ? `你的普通最佳：${esc(best.name)} ${formatTime(best.time)}` : '還沒有通關紀錄，搶第一！'}</div>
        <div class="foot">劇情純屬虛構。排行榜和成就只存在這台裝置的瀏覽器。</div>
      </div>`, 'screen--title');
    el.querySelector('[data-go=start]').onclick = () => this.start();
    el.querySelector('[data-go=board]').onclick = () => this.board('normal', () => this.title());
    el.querySelector('[data-go=trophies]').onclick = () => this.trophies(() => this.title());
    el.querySelector('[data-go=howto]').onclick = () => this.howto(() => this.title());
    el.querySelector('[data-go=settings]').onclick = () => this.settings(() => this.title());
  }

  start() {
    const lastName = load('name', '') || NICKNAMES[Math.floor(Math.random() * NICKNAMES.length)];
    let diff = load('diff', 'normal');
    const el = this.mount(`
      <div class="paper panel">
        <h2>出發前</h2>
        <label class="field"><span>暱稱（最多 10 個字，會顯示在排行榜）</span>
          <div class="name-row"><input maxlength="10" value="${esc(lastName)}" /><button class="btn btn--small" data-go="dice">換一個</button></div>
        </label>
        <div class="field"><span>難度</span>
          <div class="diffs">
            ${Object.values(DIFFICULTY).map((d) => `<button class="diff ${d.key === diff ? 'on' : ''}" data-diff="${d.key}"><b>${d.label}</b>${d.notes.map((n) => `<small>${n}</small>`).join('')}</button>`).join('')}
          </div>
        </div>
        <div class="actions">
          <button class="btn" data-go="back">返回</button>
          <button class="btn btn--gold" data-go="go">出發</button>
        </div>
      </div>`);
    const input = el.querySelector('input');
    el.querySelector('[data-go=dice]').onclick = () => {
      input.value = NICKNAMES[Math.floor(Math.random() * NICKNAMES.length)];
    };
    el.querySelectorAll('[data-diff]').forEach((b) => (b.onclick = () => {
      diff = b.dataset.diff;
      el.querySelectorAll('[data-diff]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    el.querySelector('[data-go=back]').onclick = () => this.title();
    const go = () => {
      const name = input.value.trim().slice(0, 10) || NICKNAMES[0];
      save('name', name);
      save('diff', diff);
      this.h.start(diff, name);
    };
    el.querySelector('[data-go=go]').onclick = go;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  howto(back) {
    const el = this.mount(`
      <div class="paper panel">
        <h2>遊玩方式</h2>
        <ol class="howto">
          <li><b>甘蔗的祝福</b>：到中山福德宮晚宴，福德宮董事長會送你一根甘蔗。拿著甘蔗不能攻擊，記者會跟著你。躲到沒人看得見的地方按 E 丟掉，或扛回大安神明桌供起來（攻擊速度永久加成）。被看到丟甘蔗會上頭條、收購價打折。</li>
          <li><b>生生喝鮮奶</b>：到金滑國小門口的鮮奶車搬一箱，走近學生就會自動發。每人每週只能領一瓶（一週 ${MILK.weekSec} 秒），可以花錢加碼成兩瓶。</li>
          <li><b>拆掉松山機場</b>：發完鮮奶機場大門就會打開。機庫要電鋸、航廈和塔台要怪手才拆得動。小心起飛的飛機。全部拆完就通關，越快越好。</li>
          <li><b>賺錢</b>：靠近樹、老鼠、鼠窩就會自動攻擊，素材自動進背包。樹砍了就不會再長回來。背包滿了就找最近的收購攤（大安、北投、萬華、信義都有），站上金色圓圈就會有人來買。拆鼠窩有獎金和短暫攻速加成。</li>
          <li><b>升級</b>：大安招聘站請工人、信義商店買背包／收購價／YouBike、北投工具場買工具和護具。金色圓圈都是安全區。</li>
          <li><b>小心</b>：越危險的區域掉落越值錢（大安 → 信義 → 北投 → 萬華）。大老鼠咬人會中毒。萬華的遮陽傘下老鼠咬不到你。別誤闖信義的吸菸所；北投的溫泉怪怪的。路上倒地的阿婆記得扶。</li>
        </ol>
        <div class="controls">
          <div><b>電腦</b>：點畫面鎖定滑鼠，WASD 移動、滑鼠轉頭、E 互動、1–4 選商店選項、M 地圖、V 切換第一／第三人稱、C 拍照、P 或 Esc 暫停</div>
          <div><b>手機</b>：用左下角的方向搖桿移動，另一邊拖曳轉頭（搖桿可以在「設定」換到右邊或隱藏），點按鈕互動，點小地圖展開，點「拍照」可以分享或存到相簿</div>
        </div>
        <div class="actions"><button class="btn" data-go="back">返回</button></div>
      </div>`);
    el.querySelector('[data-go=back]').onclick = back;
  }

  board(diff, back) {
    const list = getBoard(diff);
    const rows = list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${formatTime(r.time)}</td><td>${r.deaths}</td><td>${new Date(r.date).toLocaleDateString('zh-TW')}</td></tr>`).join('');
    const el = this.mount(`
      <div class="paper panel">
        <h2>排行榜</h2>
        <div class="tabs">${Object.values(DIFFICULTY).map((d) => `<button class="tab ${d.key === diff ? 'on' : ''}" data-diff="${d.key}">${d.label}榜</button>`).join('')}</div>
        ${list.length ? `<table class="board"><thead><tr><th>名次</th><th>暱稱</th><th>時間</th><th>倒下</th><th>日期</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">還沒有人通關，搶第一！</div>'}
        <div class="note">排行榜只記錄在這台裝置的瀏覽器。</div>
        <div class="actions"><button class="btn" data-go="back">返回</button></div>
      </div>`);
    el.querySelectorAll('[data-diff]').forEach((b) => (b.onclick = () => this.board(b.dataset.diff, back)));
    el.querySelector('[data-go=back]').onclick = back;
  }

  trophies(back) {
    const earned = new Set(load('achievements', []));
    const items = ACHIEVEMENTS.map((a) => {
      const got = earned.has(a.id);
      const secret = a.hidden && !got;
      return `<div class="trophy-card ${got ? 'got' : ''} tier-${a.tier}"><div class="tr-cup"></div><div><b>${secret ? '？？？' : a.name}</b><small>${secret ? '隱藏獎盃' : a.desc}</small></div></div>`;
    }).join('');
    const el = this.mount(`
      <div class="paper panel panel--wide">
        <h2>成就</h2>
        <div class="trophy-count">已取得 ${earned.size} / ${ACHIEVEMENTS.length}</div>
        <div class="trophy-grid">${items}</div>
        <div class="actions"><button class="btn" data-go="back">返回</button></div>
      </div>`);
    el.querySelector('[data-go=back]').onclick = back;
  }

  settings(back) {
    const s = this.h.getSettings();
    const slider = (key, label) => `<label class="field slider"><span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${s[key]}" data-k="${key}" /></label>`;
    const el = this.mount(`
      <div class="paper panel">
        <h2>設定</h2>
        ${slider('master', '總音量')}
        ${slider('music', '配樂')}
        ${slider('sfx', '音效')}
        <label class="field slider"><span>轉頭靈敏度</span><input type="range" min="0.3" max="2.5" step="0.05" value="${s.sensitivity}" data-k="sensitivity" /></label>
        <div class="field"><span>視角（遊戲中按 V 也能切換）</span>
          <div class="tabs">
            <button class="tab ${s.view !== 'third' ? 'on' : ''}" data-view="first">第一人稱</button>
            <button class="tab ${s.view === 'third' ? 'on' : ''}" data-view="third">第三人稱（看得到蔣寶）</button>
          </div>
        </div>
        <div class="field"><span>畫質</span>
          <div class="tabs">
            <button class="tab ${s.quality === 'high' ? 'on' : ''}" data-q="high">精緻（有陰影）</button>
            <button class="tab ${s.quality === 'low' ? 'on' : ''}" data-q="low">流暢（手機建議）</button>
          </div>
        </div>
        ${isMobile ? `
        <div class="field"><span>方向搖桿</span>
          <div class="tabs">
            <button class="tab ${s.stick ? 'on' : ''}" data-stick="1">顯示</button>
            <button class="tab ${!s.stick ? 'on' : ''}" data-stick="0">隱藏（直接拖曳畫面移動）</button>
          </div>
        </div>
        <div class="field"><span>搖桿在哪一邊（另一邊拖曳轉頭）</span>
          <div class="tabs">
            <button class="tab ${s.stickSide !== 'right' ? 'on' : ''}" data-side="left">左邊</button>
            <button class="tab ${s.stickSide === 'right' ? 'on' : ''}" data-side="right">右邊（左撇子）</button>
          </div>
        </div>` : ''}
        ${homescreenSection()}
        <div class="actions"><button class="btn" data-go="back">返回</button></div>
      </div>`);
    el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
      this.h.setSetting(inp.dataset.k, parseFloat(inp.value));
    }));
    el.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => {
      this.h.setSetting('view', b.dataset.view);
      el.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    el.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => {
      this.h.setSetting('quality', b.dataset.q);
      el.querySelectorAll('[data-q]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    el.querySelectorAll('[data-stick]').forEach((b) => (b.onclick = () => {
      this.h.setSetting('stick', b.dataset.stick === '1');
      el.querySelectorAll('[data-stick]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    el.querySelectorAll('[data-side]').forEach((b) => (b.onclick = () => {
      this.h.setSetting('stickSide', b.dataset.side);
      el.querySelectorAll('[data-side]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    bindHomescreen(el);
    el.querySelector('[data-go=back]').onclick = back;
  }

  pause() {
    const el = this.mount(`
      <div class="paper panel panel--narrow">
        <h2>暫停</h2>
        <div class="menu-col">
          <button class="btn btn--gold" data-go="resume">繼續</button>
          <button class="btn" data-go="howto">遊玩方式</button>
          <button class="btn" data-go="settings">設定</button>
          <button class="btn btn--red" data-go="quit">放棄這局</button>
        </div>
      </div>`);
    el.querySelector('[data-go=resume]').onclick = () => this.h.resume();
    el.querySelector('[data-go=howto]').onclick = () => this.howto(() => this.pause());
    el.querySelector('[data-go=settings]').onclick = () => this.settings(() => this.pause());
    el.querySelector('[data-go=quit]').onclick = () => this.h.quit();
  }

  photo(src, { mobile, share, save, close }) {
    const el = this.mount(`
      <div class="paper panel photo-panel">
        <img class="photo-img" src="${src}" alt="遊戲截圖" />
        <div class="actions">
          <button class="btn btn--gold" data-go="share">分享</button>
          <button class="btn" data-go="save">${mobile ? '存到相簿' : '下載照片'}</button>
          <button class="btn" data-go="back">繼續玩</button>
        </div>
        <div class="photo-note">點「分享」可以自己選要分享到哪裡</div>
      </div>`, 'screen--photo');
    const noteEl = el.querySelector('.photo-note');
    const note = (text) => (noteEl.textContent = text);
    el.querySelector('[data-go=share]').onclick = () => share(note);
    el.querySelector('[data-go=save]').onclick = () => save(note);
    el.querySelector('[data-go=back]').onclick = close;
  }

  result(game, rank, entry, newTrophies) {
    const st = game.stats;
    const diff = DIFFICULTY[game.diff.key];
    const el = this.mount(`
      <div class="paper panel result">
        <h2>松山機場拆光了！</h2>
        <div class="r-time">${formatTimeZh(entry.time)}</div>
        <div class="r-rank">${diff.label}榜 第 ${rank || '—'} 名${rank === 1 ? '・新紀錄！' : ''}</div>
        <div class="r-stats">
          <div><b>${st.trees}</b><small>砍樹</small></div>
          <div><b>${st.rats}</b><small>打老鼠</small></div>
          <div><b>${st.nests}</b><small>拆鼠窩</small></div>
          <div><b>$${st.earned.toLocaleString()}</b><small>賺的錢</small></div>
          <div><b>${game.workers}</b><small>工人</small></div>
          <div><b>${st.deaths}</b><small>倒下</small></div>
          <div><b>${st.spotted}</b><small>被拍到</small></div>
          <div><b>${game.blessed ? '供奉' : '丟掉'}</b><small>甘蔗</small></div>
        </div>
        ${newTrophies.length ? `<div class="r-trophies"><div class="r-k">這局新拿到的獎盃（${newTrophies.length}）</div>${newTrophies.map((t) => `<span class="chip chip-gold">${t.name}</span>`).join('')}</div>` : ''}
        <div class="actions">
          <button class="btn btn--gold" data-go="again">再玩一次</button>
          <button class="btn" data-go="share">分享</button>
          <button class="btn" data-go="board">看排行榜</button>
          <button class="btn" data-go="home">回首頁</button>
        </div>
      </div>`);
    el.querySelector('[data-go=again]').onclick = () => this.h.start(game.diff.key, game.name);
    el.querySelector('[data-go=board]').onclick = () => this.board(game.diff.key, () => this.result(game, rank, entry, newTrophies));
    el.querySelector('[data-go=home]').onclick = () => this.h.home();
    el.querySelector('[data-go=share]').onclick = async (e) => {
      const text = `我在《${TITLE} - ${SUBTITLE}》用 ${formatTimeZh(entry.time)}拆光了松山機場！（${diff.label}）`;
      const url = location.href.split('?')[0];
      try {
        if (navigator.share) await navigator.share({ text, url });
        else {
          await navigator.clipboard.writeText(`${text} ${url}`);
          e.target.textContent = '已複製！';
        }
      } catch {
        // user cancelled the share sheet
      }
    };
  }
}
