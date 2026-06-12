/**
 * newtab.js — Phases 1-6 (complete)
 * Phase 6 adds: Caching · Clock · Notes · Weather · Drag&Drop · FAB
 */

/* ── DEFAULTS ──────────────────────────────────────────────────────── */
const DEFAULTS = {
  theme: 'dark', view: 'grid', cardSize: 'md', hiddenCategories: [],
};
let settings = { ...DEFAULTS };

/* ── DOM REFS ──────────────────────────────────────────────────────── */
const main          = document.getElementById('main');
const totalBadge    = document.getElementById('total-badge');
const searchInput   = document.getElementById('search-input');
const searchPanel   = document.getElementById('search-panel');
const searchGrid    = document.getElementById('search-grid');
const searchSummary = document.getElementById('search-summary');
const noResults     = document.getElementById('no-results');
const settingsClose = document.getElementById('settings-close');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsDrawer  = document.getElementById('settings-drawer');
const categoryToggles = document.getElementById('category-toggles');

/* ══════════════════════════════════════════════════════════════════════
   PHASE 6 — BOOKMARK CACHING (5-min TTL)
══════════════════════════════════════════════════════════════════════ */
const CACHE_TTL = 5 * 60 * 1000;

function getBookmarkTree() {
  return new Promise(resolve => {
    chrome.storage.local.get(['bmTreeCache', 'bmTreeTime'], r => {
      if (r.bmTreeCache && (Date.now() - (r.bmTreeTime || 0)) < CACHE_TTL) {
        resolve(r.bmTreeCache);
      } else {
        chrome.bookmarks.getTree(tree => {
          chrome.storage.local.set({ bmTreeCache: tree, bmTreeTime: Date.now() });
          resolve(tree);
        });
      }
    });
  });
}

function invalidateCache(cb) {
  chrome.storage.local.remove(['bmTreeCache', 'bmTreeTime'], cb);
}


/* ══════════════════════════════════════════════════════════════════════
   PHASE 6 — DRAG & DROP (categories + bookmark cards)
══════════════════════════════════════════════════════════════════════ */
function saveCategoryOrder() {
  const order = [...main.querySelectorAll('.category[data-cat-title]')]
    .map(el => el.dataset.catTitle);
  chrome.storage.local.set({ bmCategoryOrder: order });
}

function enableCategoryDnD() {
  let src = null;
  main.querySelectorAll('.category').forEach(cat => {
    cat.setAttribute('draggable', 'true');
    // Add drag handle to header
    const hdr = cat.querySelector('.category-header-left');
    if (hdr && !hdr.querySelector('.drag-handle')) {
      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.textContent = '⠿';
      handle.setAttribute('aria-hidden', 'true');
      hdr.prepend(handle);
    }
    cat.addEventListener('dragstart', e => {
      src = cat;
      cat.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', cat.dataset.catTitle || '');
    });
    cat.addEventListener('dragend', () => {
      cat.classList.remove('dragging');
      main.querySelectorAll('.category').forEach(c => c.classList.remove('drag-over'));
      saveCategoryOrder();
    });
    cat.addEventListener('dragover', e => {
      e.preventDefault();
      if (cat !== src) cat.classList.add('drag-over');
    });
    cat.addEventListener('dragleave', () => cat.classList.remove('drag-over'));
    cat.addEventListener('drop', e => {
      e.preventDefault();
      cat.classList.remove('drag-over');
      if (src && src !== cat) {
        const cats = [...main.querySelectorAll('.category')];
        if (cats.indexOf(src) < cats.indexOf(cat)) {
          main.insertBefore(src, cat.nextSibling);
        } else {
          main.insertBefore(src, cat);
        }
      }
    });
  });
}

function applySavedCategoryOrder(savedOrder) {
  if (!savedOrder || savedOrder.length === 0) return;
  savedOrder.forEach(title => {
    const el = main.querySelector(`.category[data-cat-title="${CSS.escape(title)}"]`);
    if (el) main.appendChild(el);
  });
}

function enableCardDnD() {
  main.querySelectorAll('.bookmarks-grid').forEach(grid => {
    let src = null;
    grid.querySelectorAll('.bookmark-card').forEach(card => {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', e => {
        src = card;
        card.classList.add('card-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('card-dragging');
        grid.querySelectorAll('.bookmark-card').forEach(c => c.classList.remove('card-drag-over'));
        saveCardOrder(grid);
      });
      card.addEventListener('dragover', e => {
        e.preventDefault();
        if (card !== src) card.classList.add('card-drag-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('card-drag-over'));
      card.addEventListener('drop', e => {
        e.preventDefault();
        card.classList.remove('card-drag-over');
        if (src && src !== card) {
          const cards = [...grid.querySelectorAll('.bookmark-card')];
          if (cards.indexOf(src) < cards.indexOf(card)) {
            grid.insertBefore(src, card.nextSibling);
          } else {
            grid.insertBefore(src, card);
          }
        }
      });
    });
  });
}

function saveCardOrder(grid) {
  // keyed by first card's href to identify the grid
  const key = grid.querySelector('.bookmark-card')?.href;
  if (!key) return;
  const order = [...grid.querySelectorAll('.bookmark-card')].map(c => c.href);
  chrome.storage.local.get('bmCardOrders', r => {
    const orders = r.bmCardOrders || {};
    // Use parent category title + grid index as stable key
    const cat = grid.closest('.category');
    const gridIdx = [...(cat?.querySelectorAll('.bookmarks-grid') || [])].indexOf(grid);
    const catTitle = cat?.dataset.catTitle || 'root';
    orders[`${catTitle}__${gridIdx}`] = order;
    chrome.storage.local.set({ bmCardOrders: orders });
  });
}

function applySavedCardOrders(savedOrders) {
  if (!savedOrders) return;
  main.querySelectorAll('.category').forEach(cat => {
    const catTitle = cat.dataset.catTitle || 'root';
    cat.querySelectorAll('.bookmarks-grid').forEach((grid, gridIdx) => {
      const order = savedOrders[`${catTitle}__${gridIdx}`];
      if (!order) return;
      order.forEach(url => {
        const card = grid.querySelector(`.bookmark-card[href="${CSS.escape(url)}"]`);
        if (card) grid.appendChild(card);
      });
    });
  });
}

/* ══════════════════════════════════════════════════════════════════════
   PHASE 6 — FLOATING ACTION BUTTON
══════════════════════════════════════════════════════════════════════ */
function initFAB() {
  const fabMain    = document.getElementById('fab-main');
  const fabActions = document.getElementById('fab-actions');
  const fabTop     = document.getElementById('fab-top');
  const fabSett    = document.getElementById('fab-settings');
  const fabRef     = document.getElementById('fab-refresh');

  function toggleFAB(force) {
    const open = force !== undefined ? force : !fabMain.classList.contains('open');
    fabMain.classList.toggle('open', open);
    fabActions.classList.toggle('open', open);
    fabMain.setAttribute('aria-expanded', String(open));
    fabMain.textContent = open ? '✕' : '+';
  }

  fabMain.addEventListener('click', () => toggleFAB());

  fabTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toggleFAB(false);
  });

  fabSett.addEventListener('click', () => {
    toggleFAB(false);
    openSettings();
  });

  fabRef.addEventListener('click', () => {
    fabRef.textContent = '⏳';
    invalidateCache(() => location.reload());
  });

  // Close FAB when clicking elsewhere
  document.addEventListener('click', e => {
    if (!e.target.closest('#fab-wrap')) toggleFAB(false);
  });
}

/* ══════════════════════════════════════════════════════════════════════
   SETTINGS — LOAD / SAVE / APPLY
══════════════════════════════════════════════════════════════════════ */
function loadSettings(cb) {
  chrome.storage.local.get('bmSettings', r => {
    settings = { ...DEFAULTS, ...(r.bmSettings || {}) };
    applySettings();
    cb();
  });
}

function saveSettings() {
  chrome.storage.local.set({ bmSettings: settings });
}

function applySettings() {
  const html = document.documentElement;
  const body = document.body;
  html.toggleAttribute('data-theme', false);
  if (settings.theme === 'light') html.setAttribute('data-theme', 'light');
  body.classList.toggle('view-list', settings.view === 'list');
  body.classList.remove('card-sm','card-md','card-lg');
  body.classList.add(`card-${settings.cardSize}`);
  document.querySelectorAll('.category[data-cat-title]').forEach(el => {
    el.classList.toggle('cat-hidden', settings.hiddenCategories.includes(el.dataset.catTitle));
  });
  syncSettingsUI();
}

function syncSettingsUI() {
  setActiveBtn('theme-group', settings.theme);
  setActiveBtn('view-group',  settings.view);
  setActiveBtn('size-group',  settings.cardSize);
}

function setActiveBtn(groupId, value) {
  const g = document.getElementById(groupId);
  if (!g) return;
  g.querySelectorAll('.btn-opt').forEach(b => b.classList.toggle('active', b.dataset.value === value));
}

/* ── Settings drawer open/close ── */
function openSettings() {
  settingsDrawer.classList.add('open');
  settingsOverlay.classList.add('open');
  syncSettingsUI();
}
function closeSettings() {
  settingsDrawer.classList.remove('open');
  settingsOverlay.classList.remove('open');
}

settingsClose.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', closeSettings);

function wireGroup(groupId, key) {
  const g = document.getElementById(groupId);
  if (!g) return;
  g.addEventListener('click', e => {
    const btn = e.target.closest('.btn-opt');
    if (!btn) return;
    settings[key] = btn.dataset.value;
    saveSettings();
    applySettings();
  });
}
wireGroup('theme-group', 'theme');
wireGroup('view-group',  'view');
wireGroup('size-group',  'cardSize');

function buildCategoryToggles(titles) {
  categoryToggles.innerHTML = '';
  titles.forEach(title => {
    const row = document.createElement('div');
    row.className = 'cat-toggle-row';
    const name = document.createElement('span');
    name.className = 'cat-toggle-name';
    name.textContent = `📁 ${title}`;
    const label = document.createElement('label');
    label.className = 'toggle';
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.checked = !settings.hiddenCategories.includes(title);
    inp.setAttribute('aria-label', `Toggle ${title}`);
    inp.addEventListener('change', () => {
      settings.hiddenCategories = inp.checked
        ? settings.hiddenCategories.filter(t => t !== title)
        : [...new Set([...settings.hiddenCategories, title])];
      saveSettings();
      applySettings();
    });
    const track = document.createElement('span');
    track.className = 'toggle-track';
    label.append(inp, track);
    row.append(name, label);
    categoryToggles.appendChild(row);
  });
}

/* ══════════════════════════════════════════════════════════════════════
   FAVICON
══════════════════════════════════════════════════════════════════════ */
const FAV_API = 'https://www.google.com/s2/favicons?sz=32&domain_url=';

function makeFavicon(url, title) {
  const wrap = document.createElement('div');
  wrap.className = 'favicon-wrap';
  const img = document.createElement('img');
  img.className = 'favicon';
  img.loading = 'lazy';
  img.alt = '';
  try { img.src = FAV_API + encodeURIComponent(new URL(url).hostname); }
  catch { img.src = ''; }
  img.onerror = () => {
    wrap.innerHTML = '';
    const fb = document.createElement('span');
    fb.className = 'favicon-fallback';
    fb.textContent = (title || '?')[0].toUpperCase();
    wrap.appendChild(fb);
  };
  wrap.appendChild(img);
  return wrap;
}

/* ══════════════════════════════════════════════════════════════════════
   BOOKMARK RENDERING
══════════════════════════════════════════════════════════════════════ */
let totalBookmarks = 0;
let cardIdx = 0;
const bookmarkIndex = [];

function makeCard(node) {
  const a = document.createElement('a');
  a.className = 'bookmark-card';
  a.href = node.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = node.url;
  a.style.animationDelay = `${cardIdx++ * 18}ms`;
  a.appendChild(makeFavicon(node.url, node.title));
  const span = document.createElement('span');
  span.className = 'bookmark-title';
  span.textContent = node.title || node.url;
  a.appendChild(span);
  return a;
}

function countBM(nodes) {
  return nodes.reduce((s, n) => s + (n.url ? 1 : countBM(n.children || [])), 0);
}

function renderChildren(nodes, container, depth, path) {
  const grid = document.createElement('div');
  grid.className = 'bookmarks-grid';
  nodes.forEach(node => {
    if (node.url) {
      grid.appendChild(makeCard(node));
      bookmarkIndex.push({ title: node.title || '', url: node.url, path: [...path] });
    } else {
      if (grid.children.length) { container.appendChild(grid.cloneNode(true)); grid.innerHTML = ''; }
      if (!node.children?.length) return;
      const sub = document.createElement('div');
      sub.className = 'subcategory';
      const hdr = document.createElement('div');
      hdr.className = 'subcategory-header';
      hdr.innerHTML = `<span style="font-size:13px">📂</span>
        <span class="subcategory-title">${node.title || 'Untitled'}</span>
        <span class="subcategory-count">(${countBM(node.children)})</span>`;
      sub.appendChild(hdr);
      renderChildren(node.children, sub, depth + 1, [...path, node.title || 'Untitled']);
      container.appendChild(sub);
    }
  });
  if (grid.children.length) container.appendChild(grid);
}

function makeCategory(folder) {
  const count = countBM(folder.children || []);
  if (!count && !folder.children?.length) return null;
  totalBookmarks += count;

  const section = document.createElement('section');
  section.className = 'category';
  section.dataset.catTitle = folder.title || '';

  const hdr = document.createElement('div');
  hdr.className = 'category-header';
  hdr.setAttribute('role', 'button');
  hdr.setAttribute('tabindex', '0');
  hdr.setAttribute('aria-expanded', 'true');

  const left = document.createElement('div');
  left.className = 'category-header-left';
  const icon = document.createElement('div');
  icon.className = 'category-icon';
  icon.textContent = '📁';
  const titleEl = document.createElement('span');
  titleEl.className = 'category-title';
  titleEl.textContent = folder.title || 'Untitled';
  left.append(icon, titleEl);

  const cntBadge = document.createElement('span');
  cntBadge.className = 'category-count';
  cntBadge.textContent = count;
  const chevron = document.createElement('span');
  chevron.className = 'category-chevron';
  chevron.textContent = '▾';
  chevron.setAttribute('aria-hidden', 'true');

  hdr.append(left, cntBadge, chevron);
  section.appendChild(hdr);

  const body = document.createElement('div');
  body.className = 'category-body';
  if (folder.children?.length) {
    renderChildren(folder.children, body, 1, [folder.title || 'Untitled']);
  }
  body.style.maxHeight = 'none';
  section.appendChild(body);

  function toggle() {
    const c = section.classList.toggle('collapsed');
    hdr.setAttribute('aria-expanded', String(!c));
    body.style.maxHeight = c ? '0px' : body.scrollHeight + 'px';
  }
  hdr.addEventListener('click', toggle);
  hdr.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' '){e.preventDefault();toggle();} });

  return section;
}

/* ══════════════════════════════════════════════════════════════════════
   SEARCH
══════════════════════════════════════════════════════════════════════ */
function escRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

function highlight(text, q) {
  if (!q) return document.createTextNode(text);
  const parts = text.split(new RegExp(`(${escRx(q)})`, 'gi'));
  const frag = document.createDocumentFragment();
  parts.forEach((p, i) => {
    if (i % 2 === 1) { const m=document.createElement('mark'); m.className='hl'; m.textContent=p; frag.appendChild(m); }
    else if (p) frag.appendChild(document.createTextNode(p));
  });
  return frag;
}

function makeSearchCard(e, q, delay) {
  const a = document.createElement('a');
  a.className = 'search-card';
  a.href = e.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.style.animationDelay = `${delay}ms`;
  a.appendChild(makeFavicon(e.url, e.title));
  const info = document.createElement('div');
  info.className = 'search-card-info';
  const t = document.createElement('div');
  t.className = 'search-card-title';
  t.appendChild(highlight(e.title || e.url, q));
  info.appendChild(t);
  if (e.path.length) {
    const p = document.createElement('div');
    p.className = 'search-card-path';
    p.textContent = e.path.join(' › ');
    info.appendChild(p);
  }
  a.appendChild(info);
  return a;
}

let debounceT = null;
function handleSearch(raw) {
  const q = raw.trim();
  if (!q) { searchPanel.classList.add('hidden'); main.style.display = ''; return; }
  main.style.display = 'none';
  searchPanel.classList.remove('hidden');
  const lower = q.toLowerCase();
  const res = bookmarkIndex.filter(e =>
    e.title.toLowerCase().includes(lower) || e.url.toLowerCase().includes(lower));
  searchGrid.innerHTML = '';
  noResults.classList.add('hidden');
  if (!res.length) {
    searchSummary.innerHTML = `No results for <strong>"${q}"</strong>`;
    noResults.classList.remove('hidden');
    return;
  }
  searchSummary.innerHTML = `<strong>${res.length}</strong> result${res.length!==1?'s':''} for <strong>"${q}"</strong>`;
  res.forEach((e,i) => searchGrid.appendChild(makeSearchCard(e, q, i*15)));
}

searchInput.addEventListener('input', () => {
  clearTimeout(debounceT);
  debounceT = setTimeout(() => handleSearch(searchInput.value), 80);
});

document.addEventListener('keydown', e => {
  if ((e.ctrlKey||e.metaKey) && e.key==='k') { e.preventDefault(); searchInput.focus(); searchInput.select(); }
  if (e.key==='Escape') {
    if (settingsDrawer.classList.contains('open')) { closeSettings(); return; }
    if (document.activeElement===searchInput) { searchInput.value=''; handleSearch(''); searchInput.blur(); }
  }
});

/* ══════════════════════════════════════════════════════════════════════
   ENTRY POINT
══════════════════════════════════════════════════════════════════════ */
loadSettings(async () => {

  // Init FAB
  initFAB();

  // Load bookmarks (cached or fresh)
  const treeNodes = await getBookmarkTree();
  if (!treeNodes?.length) { showEmpty(); return; }

  const topLevel = (treeNodes[0].children || []).filter(n => n.children?.length > 0);
  if (!topLevel.length) { showEmpty(); return; }

  const titles = [];
  topLevel.forEach(folder => {
    const panel = makeCategory(folder);
    if (panel) { main.appendChild(panel); titles.push(folder.title || ''); }
  });

  // Restore saved orders from storage
  chrome.storage.local.get(['bmCategoryOrder','bmCardOrders'], r => {
    applySavedCategoryOrder(r.bmCategoryOrder);
    applySavedCardOrders(r.bmCardOrders);

    // Enable drag & drop AFTER order is restored
    enableCategoryDnD();
    enableCardDnD();

    requestAnimationFrame(() => {
      main.querySelectorAll('.category-body').forEach(b => {
        if (b.style.maxHeight === 'none') b.style.maxHeight = b.scrollHeight + 'px';
      });
      totalBadge.textContent = `${totalBookmarks} bookmark${totalBookmarks!==1?'s':''}`;
    });

    applySettings();
    buildCategoryToggles(titles);
  });
});

function showEmpty() {
  totalBadge.textContent = '0 bookmarks';
  main.innerHTML = `<div class="empty-state">
    <span class="empty-state-icon">🔖</span>
    <h2>No bookmarks yet</h2>
    <p>Add some bookmarks in Chrome and they'll appear here.</p>
  </div>`;
}
