/**
 * newtab.js  –  Phase 2: Folder-based categories with collapsible sections
 *
 * Strategy:
 *  - Folders  → <details open> + <summary> (collapsible, open by default)
 *  - Bookmarks → <li><a target="_blank">
 *  - Nested folders are rendered recursively inside the parent <details>
 *  - Top-level Chrome root nodes ("Bookmarks bar", "Other bookmarks", etc.)
 *    are treated as top-level categories.
 */

const root   = document.getElementById('bookmark-root');
const status = document.getElementById('status');

/* ── Helpers ──────────────────────────────────────────────────────────── */

/**
 * Create a collapsible <details> block for a folder.
 * @param {string}  title      - Folder display name
 * @param {boolean} openByDefault - Whether details[open] is set initially
 * @returns {{ details: HTMLElement, contentTarget: HTMLElement }}
 *   contentTarget is the element children should be appended to.
 */
function createFolderBlock(title, openByDefault) {
  const details  = document.createElement('details');
  if (openByDefault) details.open = true;

  const summary  = document.createElement('summary');
  summary.textContent = `📁 ${title || 'Untitled Folder'}`;
  details.appendChild(summary);

  // Children go into a wrapper div inside <details>
  const wrapper = document.createElement('div');
  details.appendChild(wrapper);

  return { details, contentTarget: wrapper };
}

/**
 * Create a <ul class="bookmark-list"> containing one <li> per bookmark node.
 * Folders inside this level are rendered as nested <details> blocks.
 *
 * @param {chrome.bookmarks.BookmarkTreeNode[]} nodes
 * @param {HTMLElement} container  - element to append into
 * @param {number}      depth      - current nesting depth (for auto-open logic)
 */
function renderChildren(nodes, container, depth) {
  // Separate bookmarks and sub-folders so we can render them together in order
  // (we preserve original order from the tree)
  const ul = document.createElement('ul');
  ul.className = 'bookmark-list';
  let hasBookmarks = false;

  nodes.forEach(node => {
    if (node.url) {
      // ── Bookmark link ──────────────────────────────────────────
      const li = document.createElement('li');
      const a  = document.createElement('a');
      a.href        = node.url;
      a.textContent = node.title || node.url;
      a.target      = '_blank';
      a.rel         = 'noopener noreferrer';
      li.appendChild(a);
      ul.appendChild(li);
      hasBookmarks = true;
    } else {
      // ── Sub-folder: flush the current <ul> first, then add a <details> ──
      if (hasBookmarks || ul.children.length > 0) {
        container.appendChild(ul.cloneNode(true));
        // Reset the ul for items after this folder
        while (ul.firstChild) ul.removeChild(ul.firstChild);
        hasBookmarks = false;
      }

      // Nested folders are auto-collapsed beyond depth 1
      const { details, contentTarget } = createFolderBlock(node.title, depth < 2);
      if (node.children && node.children.length > 0) {
        renderChildren(node.children, contentTarget, depth + 1);
      }
      container.appendChild(details);
    }
  });

  // Append any remaining bookmarks
  if (ul.children.length > 0) {
    container.appendChild(ul);
  }
}

/* ── Entry point ──────────────────────────────────────────────────────── */

chrome.bookmarks.getTree(function (treeNodes) {
  status.remove();

  if (!treeNodes || treeNodes.length === 0) {
    const msg = document.createElement('p');
    msg.textContent = 'No bookmarks found.';
    root.appendChild(msg);
    return;
  }

  // treeNodes[0] is the invisible root; its children are the real top-level
  // folders ("Bookmarks bar", "Other bookmarks", "Mobile bookmarks").
  const topLevel = treeNodes[0].children || [];

  topLevel.forEach(folderNode => {
    // Skip empty top-level folders silently
    if (!folderNode.children || folderNode.children.length === 0) return;

    const { details, contentTarget } =
      createFolderBlock(folderNode.title, true /* top-level open by default */);

    renderChildren(folderNode.children, contentTarget, 1);
    root.appendChild(details);
  });

  // Edge case: no renderable content at all
  if (root.children.length === 0) {
    const msg = document.createElement('p');
    msg.textContent = 'No bookmarks found.';
    root.appendChild(msg);
  }
});
