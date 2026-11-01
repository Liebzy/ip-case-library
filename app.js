/* 知产案例库 · 主逻辑
   数据存放：案例/设置/收藏/回顾 在 localStorage；附件原文在 IndexedDB。
   ⚠ API Key 在 config.js，设置页可覆盖（优先用设置页的值）。 */
'use strict';

const CFG = window.APP_CONFIG || {};
const LS = 'ipcase.v2';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const today = () => new Date().toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.floor((a - b) / 864e5);

/* ==================== 分类维度 ==================== */
const DIMS = [
  { key: 'biz', name: '业务类型', opts: ['诉讼', '非诉', '合规', '风控', '咨询', '交易', '监管应对', '其他'] },
  { key: 'obj', name: '权利客体', opts: ['专利', '商标', '著作权', '商业秘密', '不正当竞争', '数据知识产权', '集成电路布图', '植物新品种', '地理标志', '域名', '其他'] },
  { key: 'ind', name: '行业领域', opts: ['互联网/AI', '通信', '医药', '文娱', '智能制造', '消费品', '汽车', '金融', '教育', '其他'] },
  { key: 'stg', name: '程序阶段', opts: ['行政程序', '一审', '二审', '再审', '执行', '仲裁', '刑事', '协商和解'] },
  { key: 'nat', name: '争议性质', opts: ['侵权', '权属', '合同', '许可', '无效/撤销', '垄断', '不正当竞争', '其他'] },
  { key: 'src', name: '来源途径', opts: ['网络', '生活', '公开资料', '授课', '实务', '会议纪要', '聊天记录', '其他'] },
  { key: 'res', name: '处理结果', opts: ['胜诉', '败诉', '部分支持', '调解', '撤诉', '整改结案', '未决'] },
  { key: 'amt', name: '标的额', opts: ['100万以下', '100万-1000万', '1000万-1亿', '1亿以上', '未披露'] },
  { key: 'time', name: '时间', opts: ['近1个月', '近3个月', '近1年', '1-3年', '3年以上', '未标日期'] },
  { key: 'tag', name: '研究主题', opts: [] }
];
const DIM = Object.fromEntries(DIMS.map(d => [d.key, d]));
const OBJ_COLOR = {
  '专利': '#4a6fa5', '商标': '#a5614a', '著作权': '#7a5ea8', '商业秘密': '#3f7d6a',
  '不正当竞争': '#b0813c', '数据知识产权': '#4a8a8a', '集成电路布图': '#6b6b8f',
  '植物新品种': '#5c8552', '地理标志': '#96703f', '域名': '#7d7d7d', '其他': '#8a8f93'
};
const GRADE = { A: { t: '我录入', c: 'a' }, B: { t: '公开可查', c: '' }, C: { t: 'AI补全·待核实', c: 'c' } };

/* ==================== 数据 ==================== */
const DEF = {
  cases: [], favs: [], reviews: {}, logs: {}, live: { updated: '', count: 0, seen: '' },
  settings: {
    key: '', model: CFG.model || 'deepseek-chat', baseURL: CFG.baseURL || 'https://api.deepseek.com',
    theme: 'light', fields: ['专利', '商标', '著作权', '商业秘密', '不正当竞争', '数据知识产权'],
    weights: { law: 40, focus: 30, obj: 20, ind: 10 },
    recoDay: '', recoIdx: 0
  }
};
let DB = load();
function load() {
  try {
    const raw = localStorage.getItem(LS);
    if (raw) {
      const d = JSON.parse(raw);
      return { ...DEF, ...d, settings: { ...DEF.settings, ...(d.settings || {}) } };
    }
  } catch (e) { }
  return JSON.parse(JSON.stringify(DEF));
}
function save() { try { localStorage.setItem(LS, JSON.stringify(DB)); } catch (e) { toast('存储空间不足，建议清理附件'); } }

/* 附件存 IndexedDB */
const DBX = (() => {
  let p = null;
  const open = () => p || (p = new Promise(res => {
    const r = indexedDB.open('ipcase_files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('f', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  }));
  return {
    async put(id, name, blob) {
      const d = await open(); if (!d) return;
      await new Promise(res => {
        const t = d.transaction('f', 'readwrite');
        t.objectStore('f').put({ id, name, blob, at: Date.now() });
        t.oncomplete = res; t.onerror = res;
      });
    },
    async get(id) {
      const d = await open(); if (!d) return null;
      return await new Promise(res => {
        const t = d.transaction('f', 'readonly').objectStore('f').get(id);
        t.onsuccess = () => res(t.result); t.onerror = () => res(null);
      });
    }
  };
})();

/* ==================== 通用 UI ==================== */
function toast(msg, ms) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms || 2000);
}
function sheet(html) {
  const m = document.createElement('div');
  m.className = 'mask';
  m.innerHTML = `<div class="sheet">${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  $('#layer').appendChild(m);
  return m;
}
function closeSheet() { const m = $('#layer').lastElementChild; if (m) m.remove(); }

/* ==================== 路由 ==================== */
let page = 'home';
function go(p) {
  if (p === 'add') { openAdd(); return; }
  page = p;
  $$('.page').forEach(s => s.classList.toggle('on', s.id === 'p-' + p));
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.go === p));
  render();
  window.scrollTo(0, 0);
}
$$('.tab').forEach(b => b.onclick = () => go(b.dataset.go));

function render() {
  if (page === 'home') renderHome();
  if (page === 'lib') renderLib();
  if (page === 'ai') renderAI();
  if (page === 'me') renderMe();
}

/* ==================== 首页 ==================== */
function recoPool() {
  // 每日轮换：用日期做种子，从推荐池取 5 条
  const pool = RECO;
  const n = pool.length;
  const seed = today().split('-').join('') | 0;
  const start = seed % n;
  return Array.from({ length: Math.min(5, n) }, (_, i) => pool[(start + i) % n]);
}
function dueReview() {
  const gaps = [1, 3, 7, 15, 30, 60];
  const now = Date.now();
  return DB.cases.filter(c => {
    const r = DB.reviews[c.id] || { n: 0, at: c.createdAt || now };
    const gap = gaps[Math.min(r.n, gaps.length - 1)];
    return dayDiff(now, r.at) >= gap;
  }).slice(0, 3);
}

/* ==================== 首页发现流 ====================
   先排「我的 → 研究方向」命中的客体，已收录的沉到后面，往下翻自动加载。 */
let feedState = { n: 8 };
function feedList() {
  const fav = DB.settings.fields || [];
  return RECO
    .map((c, i) => {
      let s = -i * 0.001;
      if (fav.includes(c.obj)) s += 100;
      if (fav.includes(c.ind)) s += 30;
      if (DB.cases.some(x => x.title === (c.t || c.title))) s -= 50;
      return { c, s };
    })
    .sort((a, b) => b.s - a.s)
    .map(x => x.c);
}
function feedHTML(list, from, to) {
  return list.slice(from, to).map(c => caseHTML(recoToCase(c), { feed: true })).join('');
}
function bindFeed() {
  const more = $('#feedMore');
  const box = $('#feed');
  if (!more || !box) return;
  if (window._feedIO) window._feedIO.disconnect();
  const list = feedList();
  const io = new IntersectionObserver(es => {
    if (!es[0].isIntersecting) return;
    if (feedState.n >= list.length) return;
    const from = feedState.n;
    feedState.n = Math.min(feedState.n + 8, list.length);
    box.insertAdjacentHTML('beforeend', feedHTML(list, from, feedState.n));
    more.textContent = feedState.n >= list.length ? '已经到底了' : '继续往下翻';
    bindCases();
  }, { rootMargin: '200px' });
  io.observe(more);
  window._feedIO = io;
}

function renderHome() {
  const recos = recoPool();
  const dues = dueReview();
  const newCount = RECO.filter(r => !DB.cases.some(c => c.title === r.t)).length;
  const mine = DB.cases.filter(c => !String(c.id).startsWith('seed-')).sort((a, b) => b.updatedAt - a.updatedAt);

  $('#p-home').innerHTML = `
    <div class="top"><div class="top-row">
      <div><h1>首页</h1><p>${today()} · 每日五例，24 小时轮换${DB.live && DB.live.updated ? ` · 案例包 ${esc(DB.live.updated)}` : ''}</p></div>
      <button class="btn sm" id="reflive">刷新</button>
    </div></div>
    ${newCount > 0 ? `<div class="live-tip" id="gonew">案例包里有 ${newCount} 条你还没收录，点这里挑 <span>›</span></div>` : ''}

    <div class="sec-t">今日五例 · 24 小时轮换<span class="lnk" id="allreco2">全部 ${RECO.length} 例</span></div>
    <div class="slider">
      ${recos.map((c, i) => slideHTML(c, i)).join('')}
    </div>

    ${dues.length ? `<div class="sec-t">该回顾了（遗忘曲线）</div>
      ${dues.map(c => caseHTML(c, { review: true })).join('')}` : ''}

    <div class="sec-t">按客体浏览<span class="lnk" id="allreco">全部 ${RECO.length} 例</span></div>
    <div class="filters">
      ${objGroups().map(([o, n]) => `<button class="chip" data-objlib="${esc(o)}">${esc(o)} ${n}</button>`).join('')}
    </div>

    ${mine.length ? `<div class="sec-t">我自己录的 · 最近</div>
      ${mine.slice(0, 4).map(c => caseHTML(c)).join('')}` : ''}

    <div class="sec-t">发现 · 先给你研究方向上的<span class="lnk" id="feedreset">回到开头</span></div>
    <div id="feed">${feedHTML(feedList(), 0, feedState.n)}</div>
    <div id="feedMore" class="feed-more">${feedState.n >= feedList().length ? '已经到底了' : '继续往下翻'}</div>
  `;

  const ab = $('#allreco');
  if (ab) ab.onclick = openAllReco;
  const ab2 = $('#allreco2');
  if (ab2) ab2.onclick = openAllReco;
  const rf = $('#reflive');
  if (rf) rf.onclick = () => refreshLive(false);
  const gn = $('#gonew');
  if (gn) gn.onclick = openAllReco;
  bindFeed();
  const fr = $('#feedreset');
  if (fr) fr.onclick = () => { feedState.n = 8; render(); window.scrollTo(0, 0); };
  $$('[data-objlib]').forEach(b => b.onclick = () => {
    libState = { dim: 'obj', val: b.dataset.objlib, sub: {}, q: '', cmp: [] };
    go('lib');
  });
  bindCases();
}

function objGroups() {
  const m = {};
  RECO.forEach(c => { m[c.obj || '其他'] = (m[c.obj || '其他'] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}
function openAllReco() {
  const groups = {};
  RECO.forEach(c => { (groups[c.obj] = groups[c.obj] || []).push(c); });
  const m = sheet(`<h3>全部典型案例 · ${RECO.length} 例</h3>
    <p class="sub">均为公开报道案例，未标案号，引用前请核原判</p>
    ${Object.entries(groups).map(([obj, list]) => `
      <div class="sec-t">${esc(obj)} · ${list.length}</div>
      ${list.map(c => caseHTML(recoToCase(c))).join('')}`).join('')}
    <div style="height:8px"></div><button class="btn wide" id="cl">关闭</button>`);
  m.querySelector('#cl').onclick = () => m.remove();
  m.querySelectorAll('.case').forEach(el => el.onclick = () => { m.remove(); openCase(el.dataset.id); });
}

function slideHTML(c) {
  const inLib = DB.cases.some(x => x.title === c.title);
  return `<div class="slide" data-id="reco-${esc(c.title)}" data-reco="${esc(c.title)}">
    <div class="kick">${esc(c.obj || '知识产权')} · ${esc(c.nat || '')}</div>
    <h3>${esc(c.title)}</h3>
    <div class="focus">${esc(c.focus || '')}</div>
    <div class="kick" style="margin-top:8px">结果 · ${esc(c.result || '')}</div>
    <button class="add" data-addreco="${esc(c.title)}" title="${inLib ? '查看详情' : '加入我的案例库'}">
      <svg viewBox="0 0 24 24">${inLib ? '<path d="M5 12h14M13 6l6 6-6 6"/>' : '<path d="M12 5v14M5 12h14"/>'}</svg>
    </button>
  </div>`;
}
function recoToCase(r) {
  return {
    ...r, id: 'reco-' + r.title, brief: r.brief || (r.focus || '').slice(0, 30),
    issue: r.issue || r.focus, holding: r.holding || '', grade: 'B',
    source: r.source || '公开资料', tags: r.tags && r.tags.length ? r.tags : [r.obj, r.nat].filter(Boolean),
    files: []
  };
}

function caseHTML(c, opt = {}) {
  const col = OBJ_COLOR[c.obj] || '#8a8f93';
  const g = GRADE[c.grade] || GRADE.B;
  const fcs = (c.focus || c.issue || '').slice(0, 70);
  let brief = (c.brief || '').slice(0, 30);
  if (brief && fcs.startsWith(brief)) brief = '';
  return `<div class="case" data-id="${esc(c.id)}" style="border-left:2px solid ${col}">
    <h4>${esc(c.title)}</h4>
    ${fcs ? `<p class="fc">${esc(fcs)}</p>` : ''}
    ${brief ? `<p class="br">${esc(brief)}…</p>` : ''}
    <div class="mt">
      ${c.obj ? `<span class="tag k">${esc(c.obj)}</span>` : ''}
      ${c.source ? `<span class="tag">${esc(c.source)}</span>` : ''}
      ${opt.review ? `<span class="tag warn">待回顾</span>` : ''}
      ${opt.feed && DB.cases.some(x => x.title === c.title) ? `<span class="tag ok">已收录</span>` : ''}
      ${c.verified === true ? `<span class="tag ok">案号已核</span>` : c.verified === false ? `<span class="tag warn">案号未核</span>` : ''}
      <span class="grade ${g.c}">${g.t}</span>
    </div>
    ${!DB.cases.some(x => x.title === c.title)
      ? `<button class="add" data-addreco="${esc(c.title)}"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>`
      : ''}
  </div>`;
}

function bindCases() {
  $$('#p-home .case[data-id]').forEach(el => {
    if (!el.dataset.id.startsWith('reco-')) el.onclick = () => openCase(el.dataset.id);
  });
  $$('#p-home .slide[data-id]').forEach(el => {
    el.onclick = e => { if (!e.target.closest('[data-addreco]')) openCase(el.dataset.id); };
  });
  $$('[data-addreco]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    addReco(b.dataset.addreco);
  });
}
function addReco(title) {
  const r = RECO.find(x => x.t === title || x.title === title);
  if (!r) return;
  const hit = DB.cases.find(c => c.title === title);
  if (hit) { openCase(hit.id); return; }
  const c = recoToCase(r);
  c.id = uid(); c.createdAt = Date.now(); c.updatedAt = Date.now();
  c.source = '公开资料';
  DB.cases.unshift(c); save();
  toast('已加入案例库，可再补充你自己的批注');
  render();
}

/* 首次使用：把内置 50 例灌进案例库（用户删空后不再自动恢复） */
function seedIfEmpty() {
  if (DB.seeded || !SEED.length) return;
  if (!DB.cases.length) {
    const now = Date.now();
    DB.cases = SEED.map((s, i) => {
      const c = recoToCase(s);
      c.id = 'seed-' + i;
      const t = Date.parse((s.date || '') + '-12-31');
      c.createdAt = isNaN(t) ? now - i * 1000 : t;
      c.updatedAt = c.createdAt;
      return c;
    });
  }
  DB.seeded = true;
  save();
}

/* ==================== 案例库 ==================== */
let libState = { dim: 'obj', val: '', sub: {}, q: '', cmp: [] };

function matchDim(c, dim, val) {
  if (!val) return true;
  if (dim === 'time') {
    const t = Date.parse(c.date) || c.createdAt || c.updatedAt;
    const d = dayDiff(Date.now(), t);
    if (val === '近1个月') return d <= 31;
    if (val === '近3个月') return d <= 92;
    if (val === '近1年') return d <= 366;
    if (val === '1-3年') return d > 366 && d <= 1096;
    if (val === '3年以上') return d > 1096;
    if (val === '未标日期') return !c.date;
    return true;
  }
  if (dim === 'tag') return (c.tags || []).includes(val);
  return c[dim] === val;
}
function dimOpts(key) {
  if (key !== 'tag') return DIM[key].opts;
  const s = new Set();
  DB.cases.forEach(c => (c.tags || []).forEach(t => s.add(t)));
  return [...s].slice(0, 40);
}

function renderLib() {
  const dim = { ...DIM[libState.dim], opts: dimOpts(libState.dim) };
  const sub = DIM[libState.sub.dim] ? { ...DIM[libState.sub.dim], opts: dimOpts(libState.sub.dim) } : null;
  let list = [...DB.cases];
  list = list.filter(c => matchDim(c, libState.dim, libState.val));
  if (sub && libState.sub.val) list = list.filter(c => matchDim(c, libState.sub.dim, libState.sub.val));
  if (libState.q) {
    const s = libState.q.toLowerCase();
    list = list.filter(c => JSON.stringify([c.title, c.facts, c.issue, c.holding, c.result, c.refs, c.tags, c.takeaway]).toLowerCase().includes(s));
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);

  $('#p-lib').innerHTML = `
    <div class="top"><div class="top-row">
      <div><h1>案例库</h1><p>${DB.cases.length} 个案例 · 默认按添加时间倒序</p></div>
      <div class="sp"></div>
      ${libState.cmp.length === 2 ? `<button class="btn sm pri" id="doCmp">对比</button>` : ''}
    </div>
      <input id="q" placeholder="搜名称 / 焦点 / 法条 / 标签" value="${esc(libState.q)}"
        style="width:100%;margin-top:10px;border:1px solid var(--line);border-radius:11px;background:var(--bg-2);padding:9px 12px">
    </div>

    <div class="dims">
      ${DIMS.map(d => `<button class="chip ${d.key === libState.dim ? 'on' : ''}" data-dim="${d.key}">${d.name}</button>`).join('')}
    </div>
    <div class="filters">
      <button class="chip ${!libState.val ? 'on' : ''}" data-val="">全部</button>
      ${dim.opts.map(o => `<button class="chip ${libState.val === o ? 'on' : ''}" data-val="${esc(o)}">${esc(o)}</button>`).join('')}
    </div>
    ${sub ? `<div class="sec-t">二级筛选 · ${sub.name}</div><div class="filters">
      <button class="chip ${!libState.sub.val ? 'on' : ''}" data-sub="">全部</button>
      ${sub.opts.map(o => `<button class="chip ${libState.sub.val === o ? 'on' : ''}" data-sub="${esc(o)}">${esc(o)}</button>`).join('')}
    </div>` : ''}
    <div style="margin:-4px 0 10px"><button class="btn sm gh" id="subDim">＋ 二级筛选</button>
      ${libState.cmp.length ? `<span class="muted">已选 ${libState.cmp.length} 个待对比</span>` : ''}</div>

    ${list.length ? list.map(c => caseHTML(c)).join('') : `<div class="empty">这个筛选下还没有案例</div>`}
  `;

  $$('#p-lib [data-dim]').forEach(b => b.onclick = () => { libState.dim = b.dataset.dim; libState.val = ''; libState.sub = {}; render(); });
  $$('#p-lib [data-val]').forEach(b => b.onclick = () => { libState.val = b.dataset.val; render(); });
  $$('#p-lib [data-sub]').forEach(b => b.onclick = () => { libState.sub.val = b.dataset.sub; render(); });
  $('#q').oninput = e => { libState.q = e.target.value; const p = e.target.selectionStart; render(); const q = $('#q'); q.focus(); q.setSelectionRange(p, p); };
  $('#subDim').onclick = pickSubDim;
  $$('#p-lib .case').forEach(el => {
    const id = el.dataset.id;
    const on = libState.cmp.includes(id);
    const b = document.createElement('button');
    b.className = 'add cmpb';
    b.title = '加入对比';
    b.dataset.on = on ? '1' : '';
    b.style.cssText = on
      ? 'color:var(--bg-2);background:var(--accent);border-color:var(--accent)'
      : 'color:var(--ink-3);background:var(--bg-2);border-color:var(--line)';
    b.innerHTML = `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="7" height="14" rx="1.5"/><rect x="14" y="5" width="7" height="14" rx="1.5"/></svg>`;
    b.onclick = e => {
      e.stopPropagation();
      libState.cmp = on ? libState.cmp.filter(x => x !== id) : [...libState.cmp, id].slice(-2);
      render();
    };
    el.appendChild(b);
  });
  bindLibDelegation();
}

function bindLibDelegation() {
  const el = $('#p-lib');
  if (el.dataset.bound) return;
  el.dataset.bound = '1';
  el.addEventListener('click', e => {
    if (e.target.closest('.cmpb')) return;           // 由按钮自身处理
    if (e.target.closest('#doCmp')) { openCompare(libState.cmp[0], libState.cmp[1]); return; }
    const card = e.target.closest('.case');
    if (card && card.dataset.id) openCase(card.dataset.id);
  });
}

function pickSubDim() {
  const m = sheet(`<h3>二级筛选维度</h3><p class="sub">在当前分类下再叠一层</p>
    ${DIMS.filter(d => d.key !== libState.dim).map(d => `<button class="opt" data-s="${d.key}">
      <div class="ic"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg></div>
      <div><div class="t">${d.name}</div><div class="d">${d.opts.slice(0, 4).join(' / ')}…</div></div></button>`).join('')}
    <button class="btn wide" id="cl">取消</button>`);
  m.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
    libState.sub = { dim: b.dataset.s, val: '' }; m.remove(); render();
  });
  m.querySelector('#cl').onclick = () => m.remove();
}

/* ==================== 案例详情 ==================== */
function openCase(id) {
  const c = DB.cases.find(x => x.id === id) || RECO.map(recoToCase).find(x => x.id === id);
  if (!c) return;
  const m = sheet(`
    <div class="row" style="margin-bottom:6px">
      <button class="btn sm gh" id="cl">返回</button><div style="flex:1"></div>
      ${id.startsWith('reco-') || !DB.cases.some(x => x.id === id) ? '' : `
        <button class="btn sm" id="fav">${DB.favs.includes(id) ? '已收藏' : '收藏'}</button>
        <button class="btn sm" id="ed">编辑</button>`}
    </div>
    <h3 style="font-size:19px;line-height:1.5">${esc(c.title)}</h3>
    <div class="mt" style="display:flex;flex-wrap:wrap;gap:5px;margin:9px 0">
      ${c.obj ? `<span class="tag k">${esc(c.obj)}</span>` : ''}
      ${c.biz ? `<span class="tag">${esc(c.biz)}</span>` : ''}
      ${c.nat ? `<span class="tag">${esc(c.nat)}</span>` : ''}
      ${c.stg ? `<span class="tag">${esc(c.stg)}</span>` : ''}
      ${c.res ? `<span class="tag">${esc(c.res)}</span>` : ''}
      ${c.source ? `<span class="tag">${esc(c.source)}</span>` : ''}
      <span class="grade ${(GRADE[c.grade] || GRADE.B).c}">${(GRADE[c.grade] || GRADE.B).t}</span>
    </div>
    ${row('案号 / 法院 / 日期', [c.caseNo, c.court, c.date].filter(Boolean).join(' · '))}
    ${c.verified === true
      ? `<div class="blk"><h5>核实状态</h5><p style="font-size:13px;line-height:1.6">案号已经公开来源核对${c.src ? `（${esc(c.src)}）` : ''}。${c.note ? esc(c.note) : ''}</p></div>`
      : c.verified === false
        ? `<div class="blk"><h5>核实状态 · 案号未核</h5><p style="font-size:13px;line-height:1.6;color:var(--warm)">未取得可核实的案号，引用到正式材料前请自行核原判。${c.src ? `已知来源：${esc(c.src)}。` : ''} ${c.note ? esc(c.note) : ''}</p></div>`
        : ''}
    ${blk('案件事实', c.facts)}
    ${blk('争议焦点', c.issue)}
    ${blk('裁判要旨 / 处理思路', c.holding)}
    ${blk('处理结果', c.result)}
    ${blk('涉及法条', c.refs)}
    ${c.takeaway ? `<div class="blk"><h5>我的批注 · 可复用要点</h5><p class="quote">${esc(c.takeaway)}</p></div>` : ''}
    ${c.tags && c.tags.length ? `<div class="blk"><h5>标签</h5>${c.tags.map(t => `<span class="tag">${esc(t)}</span> `).join('')}</div>` : ''}
    ${c.files && c.files.length ? `<div class="blk"><h5>附件</h5>${c.files.map(f => `<span class="pill">${esc(f.name)}</span> `).join('')}</div>` : ''}
    ${c.link ? `<div class="blk"><h5>来源链接</h5><p style="font-size:13px;word-break:break-all"><a href="${esc(c.link)}" target="_blank" style="color:var(--accent)">${esc(c.link)}</a></p></div>` : ''}
    <div class="hr"></div>
    <div class="row">
      <button class="btn" id="sim">相似案例</button>
      <button class="btn" id="ask">问助手</button>
      <div style="flex:1"></div>
      ${DB.cases.some(x => x.id === id) ? `<button class="btn dg" id="del">删除</button>` : `<button class="btn pri" id="take">加入我的库</button>`}
    </div>
  `);
  $('#layer').lastElementChild.querySelector('#cl').onclick = closeSheet;
  const q = s => m.querySelector(s);
  if (q('#fav')) q('#fav').onclick = () => {
    DB.favs = DB.favs.includes(id) ? DB.favs.filter(x => x !== id) : [...DB.favs, id];
    save(); closeSheet(); toast(DB.favs.includes(id) ? '已收藏' : '已取消'); render();
  };
  if (q('#ed')) q('#ed').onclick = () => { closeSheet(); openEdit(id); };
  if (q('#del')) q('#del').onclick = () => {
    if (!confirm('删除这个案例？')) return;
    DB.cases = DB.cases.filter(x => x.id !== id); save(); closeSheet(); render(); toast('已删除');
  };
  if (q('#take')) q('#take').onclick = () => { closeSheet(); addReco(c.title); };
  q('#sim').onclick = () => { closeSheet(); openSimilar(id); };
  q('#ask').onclick = () => { closeSheet(); go('ai'); setTimeout(() => askAbout(c), 200); };
  markReviewed(id);
}
function row(t, v) { return v ? `<div class="blk"><h5>${t}</h5><p>${esc(v)}</p></div>` : ''; }
function blk(t, v) { return v ? `<div class="blk"><h5>${t}</h5><p>${esc(v)}</p></div>` : ''; }

function markReviewed(id) {
  if (!DB.cases.some(c => c.id === id)) return;
  const r = DB.reviews[id] || { n: 0, at: 0 };
  if (dayDiff(Date.now(), r.at) >= 1) { DB.reviews[id] = { n: r.n + 1, at: Date.now() }; save(); }
}

function openSimilar(id) {
  const base = DB.cases.find(x => x.id === id);
  if (!base) return;
  const list = similar(base).filter(x => x.id !== id).slice(0, 8);
  const m = sheet(`<h3>相似案例</h3><p class="sub">按 法条 / 争议焦点 / 权利客体 / 行业 加权匹配</p>
    ${list.length ? list.map(c => `<div style="margin-bottom:8px">${caseHTML(c)}<div class="muted" style="margin-top:4px">相似度 ${c._s}</div></div>`).join('')
      : `<div class="empty">还没有可比对的案例</div>`}
    <div class="hr"></div><button class="btn wide" id="cl">关闭</button>`);
  m.querySelector('#cl').onclick = () => m.remove();
  m.querySelectorAll('.case').forEach(el => el.onclick = () => { m.remove(); openCase(el.dataset.id); });
}

/* 中文分字：二字组合，解决整句无法匹配的问题；常见虚词不参与匹配 */
const STOP = new Set(['企业', '公司', '客户', '案例', '代理', '相关', '问题', '哪些', '可以', '如何', '怎么', '一个', '我们', '他们', '这个', '那个', '是否', '现在', '目前', '进行', '使用', '通过', '因为', '所以', '已经', '还是', '什么', '需要', '应该', '可能', '情况', '处理', '涉及', '有关', '内容', '方式', '方面', '帮我', '我的', '想请', '请问']);
function grams(s) {
  const t = String(s || '').replace(/([a-zA-Z0-9]+)/g, ' $1 ').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').trim();
  const set = new Set();
  t.split(/\s+/).filter(Boolean).forEach(w => {
    if (/^[\u4e00-\u9fa5]+$/.test(w)) {
      if (w.length <= 2) { if (!STOP.has(w)) set.add(w); }
      else for (let i = 0; i < w.length - 1; i++) {
        const g = w.slice(i, i + 2);
        if (!STOP.has(g)) set.add(g);
      }
    } else set.add(w.toLowerCase());
  });
  return set;
}
const caseText = c => [c.title, c.focus, c.issue, c.holding, c.result, c.refs, c.facts, (c.tags || []).join(' '), c.obj, c.nat, c.ind].join(' ');

/* 相似度：权重可在「我的 → 关联权重」拖动 */
function similar(base) {
  const w = DB.settings.weights;
  const tok = grams;
  const bl = tok(base.refs), bf = tok(base.issue + base.focus), bt = new Set(base.tags || []);
  return DB.cases.map(c => {
    let s = 0;
    const cl = tok(c.refs), cf = tok(c.issue + c.focus), ct = new Set(c.tags || []);
    const jac = (a, b) => { if (!a.size || !b.size) return 0; let i = 0; a.forEach(x => { if (b.has(x)) i++; }); return i / (a.size + b.size - i); };
    s += w.law * jac(bl, cl);
    s += w.focus * jac(bf, cf);
    s += w.obj * (base.obj && base.obj === c.obj ? 1 : 0);
    s += w.ind * (base.ind && base.ind === c.ind ? 1 : 0);
    s += 12 * jac(bt, ct);
    return { ...c, _s: Math.round(s) };
  }).filter(c => c._s > 0).sort((a, b) => b._s - a._s);
}

function openCompare(a, b) {
  const A = DB.cases.find(x => x.id === a), B = DB.cases.find(x => x.id === b);
  if (!A || !B) return;
  const rows = [['案件事实', 'facts'], ['争议焦点', 'issue'], ['裁判要旨', 'holding'], ['处理结果', 'result'], ['涉及法条', 'refs'], ['我的批注', 'takeaway']];
  const m = sheet(`<h3>并排对比</h3><p class="sub">看区别，划适用边界</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div><div class="tag k">${esc(A.obj || '')}</div><h4 style="margin:6px 0 10px;font-size:14px;line-height:1.5">${esc(A.title)}</h4></div>
      <div><div class="tag k">${esc(B.obj || '')}</div><h4 style="margin:6px 0 10px;font-size:14px;line-height:1.5">${esc(B.title)}</h4></div>
    </div>
    ${rows.map(([t, k]) => (A[k] || B[k]) ? `<div class="blk"><h5>${t}</h5>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <p style="font-size:13.5px">${esc((A[k] || '—').slice(0, 400))}</p>
        <p style="font-size:13.5px">${esc((B[k] || '—').slice(0, 400))}</p></div></div>` : '').join('')}
    <div class="hr"></div>
    <button class="btn wide pri" id="ai">让助手总结两者适用边界</button>
    <div style="height:9px"></div><button class="btn wide" id="cl">关闭</button>`);
  m.querySelector('#cl').onclick = () => { m.remove(); libState.cmp = []; render(); };
  m.querySelector('#ai').onclick = () => {
    m.remove(); go('ai');
    setTimeout(() => askAbout(null, `对比这两个案例的适用边界，指出什么情形下该用哪一个的思路：\n1.${A.title}\n2.${B.title}`), 200);
  };
}

/* ==================== 编辑 ==================== */
function openEdit(id, draft, after) {
  const c = draft || (id ? DB.cases.find(x => x.id === id) : null) || blankCase();
  const m = sheet(`
    <div class="row" style="margin-bottom:6px"><button class="btn sm gh" id="cl">返回</button>
      <div style="flex:1"></div><button class="btn sm pri" id="sv">保存</button></div>
    <input class="ti" id="e-title" placeholder="案件名称" value="${esc(c.title)}">
    <div class="dims" style="margin:10px 0">
      ${DIMS.map(d => `<button class="chip" data-jump="${d.key}">${d.name}</button>`).join('')}
    </div>
    <div class="grid2">
      ${sel('权利客体', 'e-obj', DIM.obj.opts, c.obj)}
      ${sel('业务类型', 'e-biz', DIM.biz.opts, c.biz)}
      ${sel('争议性质', 'e-nat', DIM.nat.opts, c.nat)}
      ${sel('程序阶段', 'e-stg', DIM.stg.opts, c.stg)}
      ${sel('行业领域', 'e-ind', DIM.ind.opts, c.ind)}
      ${sel('处理结果', 'e-res', DIM.res.opts, c.res)}
      ${sel('来源途径', 'e-src', DIM.src.opts, c.source)}
      ${sel('标的额', 'e-amt', DIM.amt.opts, c.amt)}
    </div>
    <div class="grid2">
      <div class="f"><label>案号</label><input id="e-no" value="${esc(c.caseNo)}"></div>
      <div class="f"><label>审理法院 / 机关</label><input id="e-court" value="${esc(c.court)}"></div>
    </div>
    <div class="grid2">
      <div class="f"><label>裁判 / 结案日期</label><input id="e-date" placeholder="2024-06-01" value="${esc(c.date)}"></div>
      <div class="f"><label>可信度</label><select id="e-grade">
        <option value="A" ${c.grade === 'A' ? 'selected' : ''}>我录入（一手）</option>
        <option value="B" ${c.grade !== 'A' && c.grade !== 'C' ? 'selected' : ''}>公开可查</option>
        <option value="C" ${c.grade === 'C' ? 'selected' : ''}>AI 补全 · 待核实</option></select></div>
    </div>
    <div class="f"><label>案件事实</label><textarea id="e-facts">${esc(c.facts)}</textarea></div>
    <div class="f"><label>争议焦点</label><textarea id="e-issue">${esc(c.issue)}</textarea></div>
    <div class="f"><label>裁判要旨 / 处理思路</label><textarea id="e-holding">${esc(c.holding)}</textarea></div>
    <div class="f"><label>处理结果</label><textarea id="e-result">${esc(c.result)}</textarea></div>
    <div class="f"><label>涉及法条</label><input id="e-refs" value="${esc(c.refs)}"></div>
    <div class="f"><label>我的批注 · 可复用要点</label><textarea id="e-take">${esc(c.takeaway)}</textarea></div>
    <div class="f"><label>标签（逗号分隔）</label><input id="e-tags" value="${esc((c.tags || []).join(','))}"></div>
    <div class="f"><label>来源链接</label><input id="e-link" value="${esc(c.link)}"></div>
    ${id ? `<button class="btn dg wide" id="del">删除这个案例</button>` : ''}
  `);
  const g = s => m.querySelector(s).value.trim();
  m.querySelector('#cl').onclick = () => m.remove();
  m.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => {
    const k = b.dataset.jump;
    const el = m.querySelector('#e-' + ({ obj: 'obj', biz: 'biz', nat: 'nat', stg: 'stg', ind: 'ind', res: 'res', src: 'src', amt: 'amt' }[k]));
    if (el) el.scrollIntoView({ block: 'center' });
  });
  if (m.querySelector('#del')) m.querySelector('#del').onclick = () => {
    if (!confirm('删除？')) return;
    DB.cases = DB.cases.filter(x => x.id !== id); save(); m.remove(); render();
  };
  m.querySelector('#sv').onclick = () => {
    const t = g('#e-title');
    if (!t) { toast('先写案件名称'); return; }
    const o = {
      title: t, obj: g('#e-obj'), biz: g('#e-biz'), nat: g('#e-nat'), stg: g('#e-stg'),
      ind: g('#e-ind'), res: g('#e-res'), source: g('#e-src'), amt: g('#e-amt'),
      caseNo: g('#e-no'), court: g('#e-court'), date: g('#e-date'), grade: g('#e-grade'),
      facts: g('#e-facts'), issue: g('#e-issue'), holding: g('#e-holding'), result: g('#e-result'),
      refs: g('#e-refs'), takeaway: g('#e-take'), link: g('#e-link'),
      tags: g('#e-tags').split(/[,，]/).map(s => s.trim()).filter(Boolean)
    };
    o.focus = o.issue; o.brief = (o.facts || o.issue || '').slice(0, 30);
    // 表单里没有、但必须跟着走的字段：附件、核实状态、来源材料
    o.files = c.files || []; o.verified = !!c.verified; o.src = c.src || ''; o.note = c.note || '';
    if (id) { Object.assign(DB.cases.find(x => x.id === id), o, { updatedAt: Date.now() }); }
    else if (after) { m.remove(); after(o); return; }
    else { DB.cases.unshift({ id: uid(), ...o, createdAt: Date.now(), updatedAt: Date.now() }); }
    save(); m.remove(); render(); toast('已保存');
  };
}
function sel(label, id, opts, val) {
  return `<div class="f"><label>${label}</label><select id="${id}">
    <option value="">—</option>${opts.map(o => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
}
function blankCase() {
  return { title: '', obj: '', biz: '', nat: '', stg: '', ind: '', res: '', source: '网络', amt: '', caseNo: '', court: '', date: '', grade: 'A', facts: '', issue: '', holding: '', result: '', refs: '', takeaway: '', link: '', tags: [] };
}

/* ==================== 推荐池：内置典型案例（见 cases.js） ==================== */
const SEED = window.SEED_CASES || [];
const RECO = SEED.map(c => ({ ...c, t: c.title }));

/* ==================== 添加 ==================== */
function openAdd() {
  const m = sheet(`
    <h3>添加案例</h3>
    <p class="sub">会议纪要 / 聊天记录 / 文书原文，助手先找出里面提到的案子，再逐个补全</p>
    <div class="drop" id="dz">
      <div class="b">拖文件到这里，或点击选择</div>
      <div class="s">Word / PDF / 图片 / 文本 · 一次最多 5 个</div>
      <input type="file" id="fi" multiple accept=".doc,.docx,.pdf,.md,.txt,.rtf,image/*" hidden>
    </div>
    <button class="opt" id="o-paste"><div class="ic"><svg viewBox="0 0 24 24"><path d="M9 3h6v3H9zM7 5h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M9 12h6M9 16h4"/></svg></div>
      <div><div class="t">粘贴文字</div><div class="d">会议纪要、聊天记录、判决全文</div></div></button>
    <button class="opt" id="o-link"><div class="ic"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg></div>
      <div><div class="t">粘贴链接</div><div class="d">抓取不到时会自动打开权威源帮你找</div></div></button>
    <button class="opt" id="o-hand"><div class="ic"><svg viewBox="0 0 24 24"><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5 17.5 10.5"/></svg></div>
      <div><div class="t">手写录入</div><div class="d">自己填全部字段</div></div></button>
    <div class="hr"></div>
    <button class="btn wide" id="cl">取消</button>
    <div class="muted" style="margin-top:10px">材料里提到几个案子，就出几条：先列给你勾，再逐条补全，最后逐条入库存好。不确定的部分标「待核实」，绝不替你编案号和金额。</div>
  `);
  const dz = m.querySelector('#dz'), fi = m.querySelector('#fi'), st = m.querySelector('.sub');
  dz.onclick = () => fi.click();
  ['dragenter', 'dragover'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => { const fs = [...e.dataTransfer.files].slice(0, 5); if (fs.length) ingest(fs, st, m); });
  fi.onchange = () => { const fs = [...fi.files].slice(0, 5); if (fs.length) ingest(fs, st, m); };
  m.querySelector('#cl').onclick = () => m.remove();
  m.querySelector('#o-hand').onclick = () => { m.remove(); openEdit(null); };
  m.querySelector('#o-paste').onclick = () => { m.remove(); openPaste(); };
  m.querySelector('#o-link').onclick = () => { m.remove(); openLink(); };
}

function openPaste() {
  const m = sheet(`<h3>粘贴文字</h3><p class="sub">纪要、聊天记录、判决原文都行</p>
    <div class="f"><textarea id="tx" style="min-height:180px" placeholder="把内容贴进来…"></textarea></div>
    <div class="row"><div style="flex:1"><select id="sc" class="chip">
      ${DIM.src.opts.map(o => `<option>${o}</option>`).join('')}</select></div>
      <button class="btn" id="raw">直接存</button><button class="btn pri" id="ai">找出里面的案子</button></div>
    <div style="height:10px"></div><button class="btn wide gh" id="cl">取消</button>`);
  m.querySelector('#cl').onclick = () => m.remove();
  m.querySelector('#raw').onclick = () => {
    const t = m.querySelector('#tx').value.trim(); if (!t) { toast('还没贴内容'); return; }
    m.remove(); openEdit(null, { ...blankCase(), source: m.querySelector('#sc').value, facts: t.slice(0, 8000), brief: t.slice(0, 30) });
  };
  m.querySelector('#ai').onclick = () => {
    const t = m.querySelector('#tx').value.trim(); if (!t) { toast('还没贴内容'); return; }
    m.remove(); aiBatch(t, m.querySelector('#sc').value);
  };
}

function openLink() {
  const m = sheet(`<h3>粘贴链接</h3><p class="sub">先填链接，助手按它提炼；抓不到会自动开权威源</p>
    <div class="f"><input id="lk" placeholder="https://…"></div>
    <button class="btn pri wide" id="go">提炼</button>
    <div style="height:10px"></div>
    <div class="sec-t">没有链接？直接去权威源搜</div>
    ${(CFG.sources || []).map(s => `<button class="opt" data-u="${esc(s.url)}" data-f="${s.free ? '' : '付费'}">
      <div class="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg></div>
      <div><div class="t">${esc(s.name)} ${s.free ? '' : '<span class="tag warn">需账号</span>'}</div>
      <div class="d">${s.free ? '公开免费' : '付费库，给你入口自己查'}</div></div></button>`).join('')}
    <div style="height:10px"></div><button class="btn wide gh" id="cl">取消</button>`);
  m.querySelector('#cl').onclick = () => m.remove();
  m.querySelector('#go').onclick = () => {
    const u = m.querySelector('#lk').value.trim();
    if (!u) { toast('先填链接'); return; }
    m.remove();
    openEdit(null, { ...blankCase(), source: '网络', link: u });
    toast('浏览器不能直接抓页面，建议打开原文复制后「粘贴文字」');
    window.open(u, '_blank');
  };
  m.querySelectorAll('[data-u]').forEach(b => b.onclick = () => {
    const kw = prompt('搜什么关键词？', '');
    window.open(b.dataset.u.replace('{q}', encodeURIComponent(kw || '')), '_blank');
  });
}

/* 文件解析 */
async function ingest(files, st, m) {
  const out = [];
  for (const f of files) {
    st.textContent = `正在解析 ${f.name} …`;
    let text = '', kind = '';
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    try {
      if (['txt', 'md', 'rtf'].includes(ext)) { text = await f.text(); kind = '文本'; }
      else if (['doc', 'docx'].includes(ext)) { text = await docxText(f); kind = 'Word'; }
      else if (ext === 'pdf') { text = await pdfText(f); kind = 'PDF'; }
      else if (f.type.startsWith('image/')) { text = await ocrText(f); kind = '图片OCR'; }
      else { text = await f.text(); kind = '其他'; }
    } catch (e) { text = ''; kind = '解析失败：' + e.message; }
    const fid = uid();
    await DBX.put(fid, f.name, f);
    out.push({ fid, name: f.name, kind, text: (text || '').trim() });
  }
  const all = out.map(o => `【${o.name}】\n${o.text}`).join('\n\n').slice(0, 24000);
  m.remove();
  if (!all.replace(/【.*?】/g, '').trim()) {
    openEdit(null, { ...blankCase(), files: out.map(o => ({ id: o.fid, name: o.name, type: o.kind })), source: '公开资料' });
    toast('没能提取文字，已存为附件，请手动补充');
    return;
  }
  aiBatch(all, '公开资料', out.map(o => ({ id: o.fid, name: o.name, type: o.kind })));
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('库加载失败，可能没联网'));
    document.head.appendChild(s);
  });
}
async function docxText(f) {
  if (!window.mammoth) await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
  const r = await window.mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
  return r.value;
}
async function pdfText(f) {
  if (!window.pdfjsLib) {
    await loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }
  const pdf = await window.pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
  let out = '';
  for (let i = 1; i <= Math.min(pdf.numPages, 40); i++) {
    const p = await pdf.getPage(i);
    const tc = await p.getTextContent();
    out += tc.items.map(x => x.str).join(' ') + '\n';
  }
  return out;
}
async function ocrText(f) {
  if (!window.Tesseract) {
    toast('首次使用需下载中文识别包，请稍候');
    await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js');
  }
  const w = await window.Tesseract.createWorker('chi_sim');
  const r = await w.recognize(f);
  await w.terminate();
  return r.data.text;
}

/* ==================== DeepSeek ==================== */
function key() { return DB.settings.key || CFG.deepseekKey || window.LOCAL_KEY || ''; }
async function dsk(messages, onChunk, opt = {}) {
  const k = key();
  if (!k) { toast('还没填 API Key：我的 → 模型与密钥'); throw new Error('no key'); }
  const body = {
    model: DB.settings.model || 'deepseek-chat',
    messages, stream: !!onChunk, temperature: opt.t ?? 0.3
  };
  const r = await fetch((DB.settings.baseURL || 'https://api.deepseek.com').replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('接口 ' + r.status + '：' + (t.slice(0, 160) || '可能被跨域拦截，可在设置里填代理网关'));
  }
  if (!onChunk) { const j = await r.json(); return j.choices[0].message.content; }
  const rd = r.body.getReader(), dec = new TextDecoder();
  let buf = '', full = '';
  while (true) {
    const { done, value } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) {
      const s = l.replace(/^data:\s*/, '').trim();
      if (!s || s === '[DONE]') continue;
      try {
        const j = JSON.parse(s);
        const d = j.choices?.[0]?.delta?.content || '';
        if (d) { full += d; onChunk(d, full); }
      } catch (e) { }
    }
  }
  return full;
}

/* ==================== 批量入库：认出材料里的多个案子 → 逐个补全 → 逐条入库 ==================== */
function jsonOf(s) {
  s = String(s || '').replace(/```json|```/g, '').trim();
  try { return JSON.parse(s); } catch (e) { }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) { } }
  return null;
}
const FIELD_RULE = `   以下字段必须严格从给定值里选一个，不许自造（例如行业只能写「通信」，不能写「通信/5G」）：
   obj：专利/商标/著作权/商业秘密/不正当竞争/数据知识产权/集成电路布图/植物新品种/地理标志/域名/其他
   biz：诉讼/非诉/合规/风控/咨询/交易/监管应对/其他
   nat：侵权/权属/合同/许可/无效/撤销/垄断/不正当竞争/其他
   stg：行政程序/一审/二审/再审/执行/仲裁/刑事/协商和解
   ind：互联网/AI/通信/医药/文娱/智能制造/消费品/汽车/金融/教育/其他
   res：胜诉/败诉/部分支持/调解/撤诉/整改结案/未决
   amt：100万以下/100万-1000万/1000万-1亿/1亿以上/未披露`;

/* 兜底：模型偶尔会自造取值（如「通信/5G」），这里拉回合法选项，拉不回就留空 */
function fixEnum(c) {
  ['obj', 'biz', 'nat', 'stg', 'ind', 'res', 'amt'].forEach(k => {
    const v = String(c[k] == null ? '' : c[k]).trim();
    if (!v) return;
    const opts = DIM[k].opts;
    if (opts.includes(v)) return;
    c[k] = opts.find(o => v.includes(o) || o.includes(v)) || '';
  });
  if (Array.isArray(c.refs)) c.refs = c.refs.join('；');
  return c;
}

/* 第一步：从材料里认出提到的每个案子 */
async function aiBatch(text, source, files) {
  const SRC = text.slice(0, 20000);
  const tag = (files && files.length) ? files.map(f => f.name).join('、') : (source || '材料');
  const bail = msg => {
    openEdit(null, { ...blankCase(), source, facts: text.slice(0, 8000), files: files || [] });
    if (msg) toast(msg);
  };
  const m = sheet(`<h3>读材料中</h3><p class="sub" id="st">正在通读，找出里面提到的每个案子…</p>
    <div class="card" style="padding:14px"><span class="spin"></span> <span class="muted">只认材料里真实出现的，不脑补</span></div>
    <div style="height:10px"></div><button class="btn wide gh" id="cl">取消（改为手动填）</button>`);
  m.querySelector('#cl').onclick = () => { m.remove(); bail(''); };
  let items = [];
  try {
    const raw = await dsk([
      { role: 'system', content: `你是知识产权法务助手。给你一份会议纪要/聊天记录/文书，请找出材料里【具体提到的每一个案件或纠纷】。
规则：
1. 只列材料里确实出现过的（有当事人、品牌、产品或案由），同一个案子多次提到只算一条。
2. 泛泛而谈的话题（例如"最近商标抢注挺多"）不要列。
3. 笼统指代的（例如"上次那个华为的案子"）也要列出来，并把 ambig 设为 true。
4. 输出纯 JSON，不要解释、不要 markdown 代码块：
{"items":[{"name":"案件简称，如 A公司诉B公司 商标侵权案","quote":"材料中的一句原话，20字以内","note":"一句话说明是什么纠纷","ambig":false}]}
一个案子都没有就输出 {"items":[]}。` },
      { role: 'user', content: '材料如下：\n' + SRC }
    ], null, { t: 0.1 });
    const j = jsonOf(raw);
    const arr = j ? (j.items || (Array.isArray(j) ? j : null)) : null;
    const seen = new Set();
    items = (arr || []).filter(x => {
      const k = String(x.name || '').trim();
      if (!k || seen.has(k)) return false;
      seen.add(k); return true;
    }).slice(0, 20);
  } catch (e) {
    m.remove(); bail('读材料失败：' + e.message); return;
  }
  m.remove();
  if (!items.length) { bail('没认出具体案子，已存为一条待整理记录'); return; }
  pickCases(items, SRC, source, files, tag);
}

/* 第二步：勾选要入库的案子 */
function pickCases(items, SRC, source, files, tag) {
  const m = sheet(`<h3>认出 ${items.length} 个案子</h3>
    <p class="sub">点一下取消勾选，确认后逐个补全</p>
    <div id="list"></div>
    <div class="row" style="margin-top:10px"><button class="btn" id="cl">取消</button>
      <div style="flex:1"></div><button class="btn pri" id="go">补全选中的</button></div>`);
  const list = m.querySelector('#list');
  items.forEach(it => {
    const b = document.createElement('button');
    b.className = 'opt'; b.dataset.on = '1'; b.style.background = 'var(--accent-soft)';
    b.innerHTML = `<div class="ic"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
      <div><div class="t">${esc(it.name)} ${it.ambig ? '<span class="tag warn">指代不明</span>' : ''}</div>
      <div class="d">${esc(it.quote || '')}${it.note ? ' · ' + esc(it.note) : ''}</div></div>`;
    b.onclick = () => {
      b.dataset.on = b.dataset.on === '1' ? '0' : '1';
      b.style.background = b.dataset.on === '1' ? 'var(--accent-soft)' : '';
    };
    list.appendChild(b);
  });
  m.querySelector('#cl').onclick = () => m.remove();
  m.querySelector('#go').onclick = () => {
    const picked = items.filter((_, i) => list.children[i].dataset.on === '1');
    if (!picked.length) { toast('一个都没选'); return; }
    m.remove();
    enrichLoop(picked, SRC, source, files, tag);
  };
}

/* 第三步：逐条补全 */
async function enrichLoop(picked, SRC, source, files, tag) {
  const m = sheet(`<h3>逐个补全</h3><p class="sub" id="st">准备中…</p>
    <div class="card" style="padding:14px"><span class="spin"></span> <span class="muted">每补完一条就往下列一条</span></div>
    <div id="box"></div>
    <div style="height:10px"></div><button class="btn wide gh" id="cl">停下，保留已补完的</button>`);
  const box = m.querySelector('#box'), st = m.querySelector('#st');
  m.querySelector('#cl').onclick = () => { m.remove(); reviewCases(out, files, source); };
  const out = [];
  for (let i = 0; i < picked.length; i++) {
    const it = picked[i];
    st.textContent = `正在补全 ${i + 1}/${picked.length}：${it.name}`;
    try {
      const c = await enrichOne(it, SRC, source, files, tag);
      out.push(c);
      const d = document.createElement('div');
      d.className = 'card'; d.style.padding = '12px'; d.style.marginTop = '8px';
      d.innerHTML = `<div style="font-weight:600">${esc(c.title)}</div>
        <div class="muted" style="font-size:13px;margin-top:4px">${esc(c.focus || c.issue || '')}</div>`;
      box.appendChild(d);
    } catch (e) {
      out.push({ __err: 1, title: it.name, note: e.message });
      const d = document.createElement('div');
      d.className = 'card'; d.style.padding = '12px'; d.style.marginTop = '8px';
      d.innerHTML = `<div style="font-weight:600">${esc(it.name)}</div>
        <div class="muted" style="font-size:13px;margin-top:4px">补全失败：${esc(e.message)}</div>`;
      box.appendChild(d);
    }
  }
  m.remove();
  reviewCases(out, files, source);
}

async function enrichOne(it, SRC, source, files, tag) {
  const sys = `你是知识产权法务助手。材料里提到了一个案件：「${it.name}」。请只针对这一个案件，整理成结构化案例卡片。
硬性要求：
1. 主要依据材料里与这个案件有关的内容来写；材料没写的，可以补你确信的公开信息，但绝不能编造案号、法院、日期、金额。不确定就留空，并写进 uncertain。
2. 输出纯 JSON，不要任何解释文字、不要 markdown 代码块。
3. 字段：title, obj, biz, nat, stg, ind, res, amt, caseNo, court, date, facts, issue, holding, result, refs, takeaway, tags(数组), uncertain(数组)。
${FIELD_RULE}
4. facts 写成 150 字以内案情摘要，开头先说材料里关于这个案子讲了什么（例如"会议中提到：……"）；issue 一句话争议焦点；holding 是裁判或处理思路；takeaway 是"下次遇到同类事可以直接照做的一句话"。`;
  const raw = await dsk([
    { role: 'system', content: sys },
    { role: 'user', content: '材料全文：\n' + SRC + '\n\n请只整理这个案件：' + it.name }
  ], null, { t: 0.2 });
  const j = jsonOf(raw);
  if (!j) throw new Error('返回不是 JSON');
  const c = {
    ...blankCase(), ...j,
    title: j.title || it.name,
    source: source || '网络', grade: 'C', verified: false, src: tag,
    files: files || []
  };
  c.tags = Array.isArray(j.tags) ? j.tags : [];
  fixEnum(c);
  if (j.uncertain && j.uncertain.length) c.takeaway = (c.takeaway || '') + '\n【待核实】' + j.uncertain.join('；');
  c.brief = (c.facts || c.issue || '').slice(0, 30);
  c.focus = c.issue;
  return c;
}

/* 第四步：看一遍再入库 */
function reviewCases(list, files, source) {
  const draw = () => {
    const ok = list.filter(x => !x.__err);
    const dup = c => DB.cases.some(x => x.title === c.title);
    m.querySelector('#box').innerHTML = list.map((c, i) => {
      if (c.__err) return `<div class="card" style="padding:12px;margin-top:8px;opacity:.6">
        <div style="font-weight:600">${esc(c.title)}</div>
        <div class="muted" style="font-size:13px">补全失败：${esc(c.note || '')}</div></div>`;
      return `<div class="card" style="padding:12px;margin-top:8px">
        <div class="row"><div style="flex:1;font-weight:600">${esc(c.title)}
          ${dup(c) ? '<span class="tag warn">库里已有同名</span>' : ''}
          <span class="tag warn">案号未核</span></div>
          <button class="btn sm gh" data-ed="${i}">改</button>
          <button class="btn sm gh" data-rm="${i}">删</button></div>
        <div class="muted" style="font-size:13px;margin-top:6px">${esc(c.focus || '')}</div>
        <div class="muted" style="font-size:12px;margin-top:4px">${esc((c.brief || '').slice(0, 40))}</div>
      </div>`;
    }).join('') || '<div class="muted">没有可入库的条目</div>';
    const btn = m.querySelector('#sv');
    btn.textContent = ok.length ? `把 ${ok.length} 条加入案例库` : '关闭';
    m.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { list.splice(+b.dataset.rm, 1); draw(); });
    m.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => {
      const i = +b.dataset.ed; m.remove();
      // 改完回到这一屏，剩下的条目还在，不会被丢掉
      openEdit(null, list[i], o => { list[i] = { ...list[i], ...o }; reviewCases(list, files, source); });
    });
  };
  const m = sheet(`<h3>补完了</h3><p class="sub">看一眼，不要的删掉，要细改的点「改」</p>
    <div id="box"></div>
    <div class="row" style="margin-top:12px"><button class="btn" id="cl">取消</button>
      <div style="flex:1"></div><button class="btn pri" id="sv">加入案例库</button></div>`);
  draw();
  m.querySelector('#cl').onclick = () => m.remove();
  m.querySelector('#sv').onclick = () => {
    const ok = list.filter(x => !x.__err);
    if (!ok.length) { m.remove(); return; }
    // 一次性展开，保证入库顺序跟列表一致（逐条 unshift 会倒过来）
    DB.cases.unshift(...ok.map(c => ({ id: uid(), ...c, createdAt: Date.now(), updatedAt: Date.now() })));
    save(); m.remove(); go('lib');
    toast(`已加入 ${ok.length} 条，案号待核实`);
  };
}

/* ==================== AI 助手 ==================== */
let chat = [];
function renderAI() {
  $('#p-ai').innerHTML = `
    <div class="top"><div class="top-row"><div><h1>案例助手</h1><p>${DB.settings.model} · 先查你的库，再给思路</p></div>
      <div class="sp"></div><button class="btn sm gh" id="clr">清空</button></div></div>
    <div class="chat" id="chat">
      ${chat.length ? chat.map(msgHTML).join('') : `<div class="empty">把你手上的案子说出来，助手会先在你的案例库里找相似案子，再给思路。<br><br>提示：涉及具体案号、金额、法条时，一定要自己核一遍。</div>`}
    </div>
    <div class="bar">
      <textarea id="in" rows="1" placeholder="描述你正在处理的情况…"></textarea>
      <button class="send" id="send">发送</button>
    </div>`;
  const ta = $('#in');
  ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; };
  $('#send').onclick = () => { const v = ta.value.trim(); if (v) { ta.value = ''; ta.style.height = 'auto'; ask(v); } };
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#send').click(); } };
  $('#clr').onclick = () => { chat = []; render(); };
  const c = $('#chat'); if (c) c.scrollTop = c.scrollHeight;
  window.scrollTo(0, document.body.scrollHeight);
}
function mdClean(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s*/gm, '').replace(/^\s*[-*]\s+/gm, '· ');
}
function msgHTML(m) {
  return `<div class="msg ${m.role === 'user' ? 'me' : ''}">
    <div class="av">${m.role === 'user' ? '我' : 'AI'}</div>
    <div class="bd">${mdClean(m.content)}${m.srcs && m.srcs.length ? `<div class="srcs">参考：${m.srcs.map(s => `<div>· ${esc(s)}</div>`).join('')}</div>` : ''}</div>
  </div>`;
}
function askAbout(c, preset) {
  const q = preset || `围绕这个案例帮我理思路：${c.title}\n争议焦点：${c.issue || c.focus || ''}\n我的批注：${c.takeaway || ''}`;
  $('#in').value = q;
  ask(q);
}
async function ask(q) {
  chat.push({ role: 'user', content: q });
  render();
  const hits = DB.cases.length ? similarGuess(q) : [];
  const ctx = hits.length
    ? '【我的案例库中可能相关的案例】\n' + hits.map(c => `- ${c.title}（${c.obj || ''}）\n  焦点：${(c.issue || c.focus || '').slice(0, 120)}\n  结果：${(c.result || '').slice(0, 120)}\n  法条：${(c.refs || '').slice(0, 100)}\n  案号：${c.caseNo || '未核实，不得引用'}\n  核实状态：${c.verified === true ? '已核对' : '未核，引用前必须自行核原判'}\n  我的批注：${(c.takeaway || '').slice(0, 120)}`).join('\n')
    : '【我的案例库中暂无相似案例】';
  const sys = `你是知识产权实务助手，服务一位法务/研究人员。
规则：
1. 先利用给定的案例库内容作答；库里没有的，再基于你确信的法律知识给思路框架。
2. 库内案例标注"已核对"的案号可直接引用并注明法院与年份；标注"未核"的一律不许给案号，必须说"需核实"并指出该去哪里查（裁判文书网、法院官网、北大法宝等）。
3. 回答结构：一、像哪类案子（引用库内案例标题）；二、争议焦点怎么定；三、可走的路径与步骤；四、风险与待核实事项。
4. 每点两三句，中文，术语给中英对照，词要简单，要具体例子。不要客套话。
5. 不要使用 Markdown 符号（**、#、- 列表符号），直接用"一、二、"与数字编号，纯文字排版。`;
  chat.push({ role: 'assistant', content: '', srcs: hits.slice(0, 3).map(c => c.title) });
  render();
  const idx = chat.length - 1;
  const bd = $$('#p-ai .msg .bd')[idx];
  try {
    await dsk([
      { role: 'system', content: sys },
      { role: 'user', content: ctx + '\n\n【我的问题】\n' + q }
    ], (d, full) => { chat[idx].content = full; if (bd) bd.innerHTML = mdClean(full) + (chat[idx].srcs.length ? `<div class="srcs">参考：${chat[idx].srcs.map(s => `<div>· ${esc(s)}</div>`).join('')}</div>` : ''); window.scrollTo(0, document.body.scrollHeight); });
  } catch (e) {
    chat[idx].content = '调用失败：' + e.message + '\n可到「我的 → 模型与密钥」检查 Key 或换网关地址。';
  }
  render();
}
function similarGuess(q) {
  const bg = grams(q);
  if (!bg.size || !DB.cases.length) return [];
  const scored = DB.cases.map(c => {
    const cb = grams(caseText(c));
    let hit = 0;
    bg.forEach(g => { if (cb.has(g)) hit++; });
    let s = hit;
    if (c.obj && q.includes(c.obj)) s += 2;
    if (c.nat && q.includes(c.nat)) s += 1;
    return { ...c, _s: s };
  }).sort((a, b) => b._s - a._s);
  const strong = scored.filter(c => c._s >= 2).slice(0, 6);
  return strong.length ? strong : scored.filter(c => c._s >= 1).slice(0, 3);
}

/* ==================== 我的 ==================== */
function renderMe() {
  const s = DB.settings;
  const byObj = {};
  DB.cases.forEach(c => byObj[c.obj || '未分类'] = (byObj[c.obj || '未分类'] || 0) + 1);
  $('#p-me').innerHTML = `
    <div class="top"><h1>我的</h1><p>${DB.cases.length} 个案例 · 收藏 ${DB.favs.length} 个</p></div>

    <div class="card" style="padding:14px;margin-top:12px">
      <div class="row"><div style="flex:1"><div class="tt">夜间模式</div><div class="dd">柔和深色，读案例不刺眼</div></div>
        <div class="sw ${s.theme === 'dark' ? 'on' : ''}" id="th"><i></i></div></div>
    </div>

    <div class="sec-t">案例构成</div>
    <div class="card" style="padding:14px">
      ${Object.keys(byObj).length ? Object.entries(byObj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `
        <div class="row" style="margin-bottom:8px"><span style="flex:1;font-size:14px">${esc(k)}</span>
        <span class="muted">${v}</span></div>
        <div style="height:5px;background:var(--line-2);border-radius:3px;margin-bottom:10px">
        <div style="height:5px;border-radius:3px;background:${OBJ_COLOR[k] || '#8a8f93'};width:${Math.round(v / DB.cases.length * 100)}%"></div></div>`).join('') : `<div class="muted">还没有案例</div>`}
    </div>

    <div class="sec-t">安装</div>
    <div class="card" style="padding:4px 14px">
      ${meRow('装到手机 / 电脑', '加主屏后就是独立 App，断网也能查', 'install')}
    </div>

    <div class="sec-t">数据与备份</div>
    <div class="card" style="padding:4px 14px">
      ${meRow('导出备份', '生成一个 JSON 文件，自己存好', 'export')}
      ${meRow('导入备份', '从 JSON 恢复（覆盖当前库）', 'import')}
      ${meRow('收藏夹', `${DB.favs.length} 个`, 'favs')}
    </div>

    <div class="sec-t">模型与密钥</div>
    <div class="card" style="padding:14px">
      <div class="f"><label>API Key（留空则用配置文件里的）</label>
        <input id="s-key" type="password" placeholder="sk-…" value="${esc(s.key)}"></div>
      <div class="f"><label>模型</label><select id="s-model">
        <option value="deepseek-chat" ${s.model === 'deepseek-chat' ? 'selected' : ''}>deepseek-chat · 快</option>
        <option value="deepseek-reasoner" ${s.model === 'deepseek-reasoner' ? 'selected' : ''}>deepseek-reasoner · 推理强</option></select></div>
      <div class="f"><label>网关地址（跨域被拦时填自建代理）</label><input id="s-base" value="${esc(s.baseURL)}"></div>
      <button class="btn pri wide" id="s-save">保存</button>
    </div>

    <div class="sec-t">我的研究方向</div>
    <div class="card" style="padding:14px">
      <div class="filters" style="margin-bottom:6px">
        ${DIM.obj.opts.map(o => `<button class="chip ${s.fields.includes(o) ? 'on' : ''}" data-f="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>
      <div class="muted">选中的方向会出现在首页个性化推荐里</div>
    </div>

    <div class="sec-t">相似案例关联权重</div>
    <div class="card" style="padding:14px">
      ${[['law', '法条'], ['focus', '争议焦点'], ['obj', '权利客体'], ['ind', '行业']].map(([k, n]) => `
        <div style="margin-bottom:10px"><div class="row"><span style="flex:1;font-size:13.5px">${n}</span>
        <span class="muted" id="w-${k}">${s.weights[k]}</span></div>
        <input type="range" min="0" max="100" value="${s.weights[k]}" data-w="${k}"></div>`).join('')}
    </div>

    <div class="sec-t">账号</div>
    <div class="card" style="padding:14px">
      <div class="muted">现在数据只存在这台设备。多人使用与云同步留了接口，等形态定下来再接。</div>
      <button class="btn wide" id="login" style="margin-top:10px">登录 / 注册（尚未开放）</button>
    </div>
    <div style="height:16px"></div>`;

  $('#th').onclick = () => { setTheme(s.theme === 'dark' ? 'light' : 'dark'); render(); };
  $$('#p-me [data-f]').forEach(b => b.onclick = () => {
    const f = b.dataset.f;
    s.fields = s.fields.includes(f) ? s.fields.filter(x => x !== f) : [...s.fields, f];
    save(); render();
  });
  $$('#p-me [data-w]').forEach(r => r.oninput = e => {
    s.weights[r.dataset.w] = +e.target.value;
    $('#w-' + r.dataset.w).textContent = e.target.value; save();
  });
  $('#s-save').onclick = () => {
    s.key = $('#s-key').value.trim(); s.model = $('#s-model').value; s.baseURL = $('#s-base').value.trim();
    save(); toast('已保存'); render();
  };
  $('#login').onclick = () => toast('还没接后端，先本地用起来');
  $$('#p-me [data-me]').forEach(b => b.onclick = () => meAction(b.dataset.me));
}
function meRow(t, d, a) {
  return `<div class="setrow"><div style="flex:1"><div class="tt">${t}</div><div class="dd">${d}</div></div>
    <button class="btn sm" data-me="${a}">${a === 'export' ? '导出' : a === 'import' ? '导入' : '查看'}</button></div>`;
}
function meAction(a) {
  if (a === 'export') {
    const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(blob), el = document.createElement('a');
    el.href = u; el.download = `知产案例库备份-${today()}.json`; el.click();
    setTimeout(() => URL.revokeObjectURL(u), 3000);
    toast('已导出');
  }
  if (a === 'import') {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async () => {
      const f = i.files[0]; if (!f) return;
      try {
        const d = JSON.parse(await f.text());
        if (!d.cases) throw 0;
        if (confirm(`导入 ${d.cases.length} 个案例，会覆盖当前库，继续？`)) { DB = { ...DEF, ...d, settings: { ...DEF.settings, ...(d.settings || {}) } }; save(); render(); toast('导入完成'); }
      } catch (e) { toast('文件不对'); }
    };
    i.click();
  }
  if (a === 'install') {
    const m = sheet(`<h3>装到设备上</h3><p class="sub">装完是独立图标，全屏打开，不显示浏览器地址栏</p>
      <div class="blk"><h5>iPhone / iPad</h5><p style="font-size:14px">用 Safari 打开这个页面 → 点底部「分享」→「添加到主屏幕」。</p></div>
      <div class="blk"><h5>安卓</h5><p style="font-size:14px">用 Chrome 打开 → 右上角菜单 →「安装应用」或「添加到主屏幕」。</p></div>
      <div class="blk"><h5>Mac / Windows</h5><p style="font-size:14px">Chrome / Edge 打开 → 地址栏右侧的「安装」图标，或菜单里的「安装此应用」。</p></div>
      <div class="blk"><h5>注意</h5><p style="font-size:14px">现在文件在电脑上，手机要访问得让电脑和手机在同一网络，用电脑的局域网地址打开；等以后挂到服务器上就能直接用链接装。</p></div>
      <button class="btn wide" id="cl">知道了</button>`);
    m.querySelector('#cl').onclick = () => m.remove();
  }
  if (a === 'favs') {
    const list = DB.cases.filter(c => DB.favs.includes(c.id));
    const m = sheet(`<h3>收藏夹</h3><p class="sub">${list.length} 个</p>
      ${list.length ? list.map(c => caseHTML(c)).join('') : `<div class="empty">还没有收藏</div>`}
      <div style="height:8px"></div><button class="btn wide" id="cl">关闭</button>`);
    m.querySelector('#cl').onclick = () => m.remove();
    m.querySelectorAll('.case').forEach(el => el.onclick = () => { m.remove(); openCase(el.dataset.id); });
  }
}

/* ==================== 初始化 ==================== */
function setTheme(t) {
  DB.settings.theme = t;
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = t === 'dark' ? '#15181a' : '#264a3f';
  save();
}
setTheme(DB.settings.theme || 'light');

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}

/* 从别的 App「分享」过来（系统分享面板 / 网页分享） */
const sp = new URLSearchParams(location.search);
const shared = sp.get('text') || sp.get('title') || sp.get('url');
if (shared) {
  setTimeout(() => {
    openEdit(null, { ...blankCase(), source: '聊天记录', facts: shared.slice(0, 8000), brief: shared.slice(0, 30) });
    history.replaceState({}, '', location.pathname);
  }, 400);
}

/* 一次性带 Key 的链接：#k=sk-xxx，只在本地写入，hash 不会发到服务器 */
(function () {
  const m = location.hash.match(/k=(sk-[A-Za-z0-9]+)/);
  if (m) {
    DB.settings.key = m[1];
    save();
    history.replaceState({}, '', location.pathname + location.search);
    setTimeout(() => toast('密钥已写入本机，可开始用助手'), 300);
  }
})();

seedIfEmpty();
render();

/* ==================== 远端案例包 ====================
   每次打开自动拉 live/latest.json，拿到就刷新推荐池（不动你自己的库）。
   离线或拉取失败时静默用内置包。 */
async function fetchLive() {
  try {
    const r = await fetch('./live/latest.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    if (!Array.isArray(j.cases) || !j.cases.length) return false;
    const list = j.cases.map(c => ({ ...c, t: c.title || c.t })).filter(c => c.t);
    RECO.length = 0;
    list.forEach(c => RECO.push(c));
    DB.live = { updated: j.updated || '', count: list.length, seen: DB.live && DB.live.seen || '' };
    save();
    return true;
  } catch (e) {
    return false;
  }
}
async function refreshLive(silent) {
  const ok = await fetchLive();
  if (!ok && !silent) toast('没拉到新案例包，用的还是本地这批');
  if (ok && !silent) toast('案例包已更新到 ' + (DB.live.updated || ''));
  render();
}
fetchLive().then(ok => { if (ok) render(); });

