/**
 * newtab.js  –  Phase 3: Dashboard UI
 *
 * Features:
 *  - Favicon via Google S2 API with emoji fallback
 *  - Top-level folders → collapsible category panels
 *  - Nested folders → sub-sections inside a panel
 *  - Staggered card animation using CSS animation-delay
 *  - Live bookmark + folder count in header badge
 */

/* ── DOM refs ──────────────────────────────────────────────────────── */
const main        = document.getElementById('main');
const totalBadge  = document.getElementById('total-badge');

/* ── Counters ──────────────────────────────────────────────────────── */
let totalBookmarks = 0;

/* ── Favicon helper ────────────────────────────────────────────────── */
const FAVICON_API = 'https://www.google.com/s2/favicons?sz=32&domain_url=';

/**
 * Return a favicon <img> element; falls back to a letter/emoji on error.
 */
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

/* ── Bookmark card ─────────────────────────────────────────────────── */
let cardIndex = 0;

function makeCard(node) {
  const a = document.createElement('a');
  a.className           = 'bookmark-card';
  a.href                = node.url;
  a.target              = '_blank';
  a.rel                 = 'noopener noreferrer';
  a.title               = node.url;
  a.style.animationDelay = `${cardIndex * 18}ms`;
  cardIndex++;

  a.appendChild(makeFavicon(node.url, node.title));

  const span = document.createElement('span');
  span.className   = 'bookmark-title';
  span.textContent = node.title || node.url;
  a.appendChild(span);

  return a;
}

/* ── Count bookmarks in subtree ────────────────────────────────────── */
function countBookmarks(nodes) {
  return nodes.reduce((sum, n) => {
    if (n.url) return sum + 1;
    if (n.children) return sum + countBookmarks(n.children);
    return sum;
  }, 0);
}

/* ── Render bookmarks + nested folders into a container ────────────── */
function renderChildren(nodes, container, depth) {
  const grid = document.createElement('div');
  grid.className = 'bookmarks-grid';

  nodes.forEach(node => {
    if (node.url) {
      // Direct bookmark
      grid.appendChild(makeCard(node));
    } else {
      // Sub-folder → flush current grid, then render sub-section
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
      ic.textContent = '📂';
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
      renderChildren(node.children, sub, depth + 1);
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

  /* wrapper */
  const section = document.createElement('section');
  section.className = 'category';

  /* ── header (click to collapse) ── */
  const hdr = document.createElement('div');
  hdr.className   = 'category-header';
  hdr.setAttribute('role', 'button');
  hdr.setAttribute('tabindex', '0');
  hdr.setAttribute('aria-expanded', 'true');

  const left = document.createElement('div');
  left.className = 'category-header-left';

  const icon = document.createElement('div');
  icon.className   = 'category-icon';
  icon.textContent = '📁';
  left.appendChild(icon);

  const title = document.createElement('span');
  title.className   = 'category-title';
  title.textContent = folderNode.title || 'Untitled';
  left.appendChild(title);

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

  /* ── body ── */
  const body = document.createElement('div');
  body.className = 'category-body';

  if (folderNode.children && folderNode.children.length > 0) {
    renderChildren(folderNode.children, body, 1);
  }

  // Set natural height for smooth collapse animation
  section.appendChild(body);

  /* ── Toggle logic ── */
  function toggle() {
    const isCollapsed = section.classList.toggle('collapsed');
    hdr.setAttribute('aria-expanded', String(!isCollapsed));

    if (!isCollapsed) {
      // Expanding: set max-height to scrollHeight so transition plays
      body.style.maxHeight = body.scrollHeight + 'px';
    } else {
      body.style.maxHeight = body.scrollHeight + 'px'; // pin before CSS zeros it
      requestAnimationFrame(() => {
        body.style.maxHeight = '0px';
      });
    }
  }

  // Start open
  body.style.maxHeight = 'none'; // allow natural flow on first paint

  hdr.addEventListener('click', toggle);
  hdr.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });

  return section;
}

/* ── Entry point ───────────────────────────────────────────────────── */
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

  // After all panels are added, lock max-heights so collapse animation works
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
