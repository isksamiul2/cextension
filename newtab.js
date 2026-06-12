/**
 * newtab.js  –  Phase 4: Real-time Bookmark Search
 *
 * New in this phase:
 *  - Flat bookmark index built during tree traversal (title + url + path)
 *  - Real-time filtering on input (debounced 80 ms)
 *  - Match highlighting with <mark class="hl">
 *  - "No results" state
 *  - Ctrl+K / Cmd+K keyboard shortcut to focus search bar
 *  - Search panel swaps in/out with main category view
 */

/* ── DOM refs ──────────────────────────────────────────────────────── */
const main         = document.getElementById('main');
const totalBadge   = document.getElementById('total-badge');
const searchInput  = document.getElementById('search-input');
const searchPanel  = document.getElementById('search-panel');
const searchGrid   = document.getElementById('search-grid');
const searchSummary= document.getElementById('search-summary');
const noResults    = document.getElementById('no-results');

/* ── State ─────────────────────────────────────────────────────────── */
let totalBookmarks = 0;
let cardIndex      = 0;

/**
 * Flat index of every bookmark.
 * Each entry: { title: string, url: string, path: string[] }
 * path = folder names from root → parent (e.g. ['Bookmarks bar', 'Dev'])
 */
const bookmarkIndex = [];

/* ── Favicon helper ────────────────────────────────────────────────── */
const FAVICON_API = 'https://www.google.com/s2/favicons?sz=32&domain_url=';

function makeFavicon(url, title) {
  const wrap = document.createElement('div');
  wrap.className = 'favicon-wrap';

  const img = document.createElement('img');
  img.className = 'favicon';
  img.loading   = 'lazy';
  img.alt       = '';

  try {
    const domain = new URL(url).hostname;
    img.src = `${FAVICON_API}${encodeURIComponent(domain)}`;
  } catch {
    img.src = '';
  }

  img.onerror = () => {
    wrap.innerHTML = '';
    const fb = document.createElement('span');
    fb.className   = 'favicon-fallback';
    fb.textContent = (title || '?')[0].toUpperCase();
    wrap.appendChild(fb);
  };

  wrap.appendChild(img);
  return wrap;
}

/* ── Regular bookmark card (used in category view) ─────────────────── */
function makeCard(node) {
  const a = document.createElement('a');
  a.className            = 'bookmark-card';
  a.href                 = node.url;
  a.target               = '_blank';
  a.rel                  = 'noopener noreferrer';
  a.title                = node.url;
  a.style.animationDelay = `${cardIndex * 18}ms`;
  cardIndex++;

  a.appendChild(makeFavicon(node.url, node.title));

  const span = document.createElement('span');
  span.className   = 'bookmark-title';
  span.textContent = node.title || node.url;
  a.appendChild(span);

  return a;
}

/* ── Count bookmarks in a subtree ──────────────────────────────────── */
function countBookmarks(nodes) {
  return nodes.reduce((sum, n) => {
    if (n.url) return sum + 1;
    if (n.children) return sum + countBookmarks(n.children);
    return sum;
  }, 0);
}

/* ── Build flat index + render children into a container ───────────── */
/**
 * @param {chrome.bookmarks.BookmarkTreeNode[]} nodes
 * @param {HTMLElement} container  – parent element to append into
 * @param {number}      depth      – nesting depth (1 = top-level folder child)
 * @param {string[]}    path       – accumulated folder names for index
 */
function renderChildren(nodes, container, depth, path) {
  const grid = document.createElement('div');
  grid.className = 'bookmarks-grid';

  nodes.forEach(node => {
    if (node.url) {
      // ── Bookmark ──────────────────────────────────────────────
      grid.appendChild(makeCard(node));

      // Add to flat search index
      bookmarkIndex.push({
        title: node.title || '',
        url:   node.url,
        path:  [...path],
      });
    } else {
      // ── Sub-folder ────────────────────────────────────────────
      if (grid.children.length > 0) {
        container.appendChild(grid.cloneNode(true));
        while (grid.firstChild) grid.removeChild(grid.firstChild);
      }

      if (!node.children || node.children.length === 0) return;

      const sub = document.createElement('div');
      sub.className = 'subcategory';

      const hdr = document.createElement('div');
      hdr.className = 'subcategory-header';

      const ic = document.createElement('span');
      ic.textContent   = '📂';
      ic.style.fontSize = '13px';
      hdr.appendChild(ic);

      const ttl = document.createElement('span');
      ttl.className   = 'subcategory-title';
      ttl.textContent = node.title || 'Untitled';
      hdr.appendChild(ttl);

      const cnt = document.createElement('span');
      cnt.className   = 'subcategory-count';
      cnt.textContent = `(${countBookmarks(node.children)})`;
      hdr.appendChild(cnt);

      sub.appendChild(hdr);
      renderChildren(node.children, sub, depth + 1, [...path, node.title || 'Untitled']);
      container.appendChild(sub);
    }
  });

  if (grid.children.length > 0) {
    container.appendChild(grid);
  }
}

/* ── Build a top-level category panel ─────────────────────────────── */
function makeCategory(folderNode) {
  const count = countBookmarks(folderNode.children || []);
  if (count === 0 && !(folderNode.children && folderNode.children.length)) return null;

  totalBookmarks += count;

  const section = document.createElement('section');
  section.className = 'category';

  /* header */
  const hdr = document.createElement('div');
  hdr.className = 'category-header';
  hdr.setAttribute('role', 'button');
  hdr.setAttribute('tabindex', '0');
  hdr.setAttribute('aria-expanded', 'true');

  const left = document.createElement('div');
  left.className = 'category-header-left';

  const icon = document.createElement('div');
  icon.className   = 'category-icon';
  icon.textContent = '📁';
  left.appendChild(icon);

  const titleEl = document.createElement('span');
  titleEl.className   = 'category-title';
  titleEl.textContent = folderNode.title || 'Untitled';
  left.appendChild(titleEl);

  hdr.appendChild(left);

  const cntBadge = document.createElement('span');
  cntBadge.className   = 'category-count';
  cntBadge.textContent = count;
  hdr.appendChild(cntBadge);

  const chevron = document.createElement('span');
  chevron.className   = 'category-chevron';
  chevron.textContent = '▾';
  chevron.setAttribute('aria-hidden', 'true');
  hdr.appendChild(chevron);

  section.appendChild(hdr);

  /* body */
  const body = document.createElement('div');
  body.className = 'category-body';

  if (folderNode.children && folderNode.children.length > 0) {
    renderChildren(folderNode.children, body, 1, [folderNode.title || 'Untitled']);
  }

  body.style.maxHeight = 'none';
  section.appendChild(body);

  /* toggle */
  function toggle() {
    const isCollapsed = section.classList.toggle('collapsed');
    hdr.setAttribute('aria-expanded', String(!isCollapsed));
    body.style.maxHeight = isCollapsed ? '0px' : body.scrollHeight + 'px';
  }

  hdr.addEventListener('click', toggle);
  hdr.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });

  return section;
}

/* ═══════════════════════════════════════════════════════════════════════
   SEARCH ENGINE
═══════════════════════════════════════════════════════════════════════ */

/** Escape special regex chars in user input */
function escRx(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Wrap matching substrings in <mark class="hl"> within a text node fragment.
 * Uses split-with-capture-group so odd indices are always the matched parts.
 */
function highlight(text, query) {
  if (!query) return document.createTextNode(text);
  const parts = text.split(new RegExp(`(${escRx(query)})`, 'gi'));
  const frag  = document.createDocumentFragment();
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const mark = document.createElement('mark');
      mark.className   = 'hl';
      mark.textContent = part;
      frag.appendChild(mark);
    } else if (part) {
      frag.appendChild(document.createTextNode(part));
    }
  });
  return frag;
}

/**
 * Build a search result card (different from regular bookmark card —
 * shows folder path + highlighted title).
 */
function makeSearchCard(entry, query, delay) {
  const a = document.createElement('a');
  a.className            = 'search-card';
  a.href                 = entry.url;
  a.target               = '_blank';
  a.rel                  = 'noopener noreferrer';
  a.title                = entry.url;
  a.style.animationDelay = `${delay}ms`;

  a.appendChild(makeFavicon(entry.url, entry.title));

  const info = document.createElement('div');
  info.className = 'search-card-info';

  const titleEl = document.createElement('div');
  titleEl.className = 'search-card-title';
  titleEl.appendChild(highlight(entry.title || entry.url, query));
  info.appendChild(titleEl);

  if (entry.path.length > 0) {
    const pathEl = document.createElement('div');
    pathEl.className   = 'search-card-path';
    pathEl.textContent = entry.path.join(' › ');
    info.appendChild(pathEl);
  }

  a.appendChild(info);
  return a;
}

let debounceTimer = null;

/** Main search handler — called on every input event */
function handleSearch(raw) {
  const query = raw.trim();

  if (!query) {
    // ── Empty query: show main categories ────────────────────
    searchPanel.classList.add('hidden');
    main.style.display = '';
    return;
  }

  // ── Active query: hide categories, show search panel ─────
  main.style.display = 'none';
  searchPanel.classList.remove('hidden');

  // Filter index (title OR url, case-insensitive)
  const lower   = query.toLowerCase();
  const results = bookmarkIndex.filter(e =>
    e.title.toLowerCase().includes(lower) ||
    e.url.toLowerCase().includes(lower)
  );

  // Clear previous results
  searchGrid.innerHTML = '';
  noResults.classList.add('hidden');

  if (results.length === 0) {
    searchSummary.innerHTML = `No results for <strong>"${query}"</strong>`;
    noResults.classList.remove('hidden');
    return;
  }

  const plural = results.length === 1 ? 'result' : 'results';
  searchSummary.innerHTML =
    `<strong>${results.length}</strong> ${plural} for <strong>"${query}"</strong>`;

  results.forEach((entry, i) => {
    searchGrid.appendChild(makeSearchCard(entry, query, i * 15));
  });
}

/** Debounce wrapper so we don't re-render on every keystroke */
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => handleSearch(searchInput.value), 80);
});

/** Ctrl+K / Cmd+K → focus search */
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
  // Escape → clear search and return to categories
  if (e.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.value = '';
    handleSearch('');
    searchInput.blur();
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   ENTRY POINT
═══════════════════════════════════════════════════════════════════════ */
chrome.bookmarks.getTree(function (treeNodes) {
  if (!treeNodes || treeNodes.length === 0) {
    showEmpty();
    return;
  }

  const topLevel = (treeNodes[0].children || []).filter(
    n => n.children && n.children.length > 0
  );

  if (topLevel.length === 0) {
    showEmpty();
    return;
  }

  topLevel.forEach(folder => {
    const panel = makeCategory(folder);
    if (panel) main.appendChild(panel);
  });

  // Lock max-heights after first paint for collapse animation
  requestAnimationFrame(() => {
    main.querySelectorAll('.category-body').forEach(b => {
      if (b.style.maxHeight === 'none') {
        b.style.maxHeight = b.scrollHeight + 'px';
      }
    });

    totalBadge.textContent =
      `${totalBookmarks} bookmark${totalBookmarks !== 1 ? 's' : ''}`;
  });
});

function showEmpty() {
  totalBadge.textContent = '0 bookmarks';
  main.innerHTML = `
    <div class="empty-state">
      <span class="empty-state-icon">🔖</span>
      <h2>No bookmarks yet</h2>
      <p>Add some bookmarks in Chrome and they'll appear here.</p>
    </div>
  `;
}
