const API_URL = 'https://hn.tinkerers.space/latest_summaries?limit=100';
const HN_ITEM_API_URL = 'https://hacker-news.firebaseio.com/v0/item';
const CACHE_KEY = 'hs_latest_summaries_cache';
const BOOKMARKS_KEY = 'hs_bookmarks';
// Short TTL so we pick up backend backfills quickly; stale cache still paints instantly
const CACHE_TTL_MS = 30 * 60 * 1000;
// Prefer stories posted within this window when picking randomly
const PREFERRED_STORY_AGE_MS = 36 * 60 * 60 * 1000;
const NOTE_MAX_LENGTH = 500;

// Default Settings
const defaultSettings = {
    theme: 'auto',
    font: 'sans',
    showPoints: true,
    showDomain: true,
    showAuthor: true,
    showSummary: true
};

let currentSettings = { ...defaultSettings };
/** Snapshot of the story currently shown on the new tab */
let currentStory = null;
/** Pending note modal: 'add' | 'edit' */
let noteModalMode = null;
let noteModalStoryId = null;

document.addEventListener('DOMContentLoaded', async () => {
    loadSettings();
    initSettingsUI();
    initBookmarksUI();
    initQuickBookmarkCommand();
    applySettings();

    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('content');
    const errorEl = document.getElementById('error');

    const titleEl = document.getElementById('title');
    const titleLinkEl = document.getElementById('title-link');
    const authorLinkEl = document.getElementById('author-link');
    const summaryEl = document.getElementById('summary');
    const pointsEl = document.getElementById('points');
    const pointsLinkEl = document.getElementById('points-link');
    const domainLinkEl = document.getElementById('domain-link');

    try {
        const data = await getRandomHackerNewsItem();
        currentStory = data;

        // Populate data
        titleEl.textContent = data.title;
        titleLinkEl.href = data.url || `https://news.ycombinator.com/item?id=${data.id}`;

        authorLinkEl.textContent = data.by;
        authorLinkEl.href = `https://news.ycombinator.com/user?id=${data.by}`;

        summaryEl.innerHTML = renderMarkdown(data.summary || "No summary available.");

        pointsEl.textContent = data.score || 0;
        pointsLinkEl.href = `https://news.ycombinator.com/item?id=${data.id}`;

        // Parse Domain
        if (data.url) {
            try {
                const urlObj = new URL(data.url);
                domainLinkEl.textContent = urlObj.hostname.replace('www.', '');
                domainLinkEl.href = urlObj.origin;
            } catch (e) {
                domainLinkEl.textContent = 'news.ycombinator.com';
                domainLinkEl.href = 'https://news.ycombinator.com';
            }
        } else {
            domainLinkEl.textContent = 'news.ycombinator.com';
            domainLinkEl.href = 'https://news.ycombinator.com';
        }

        updateStarUI();

        // Show content immediately — don't wait for realtime score refresh
        loadingEl.classList.add('hidden');
        contentEl.classList.remove('hidden');
        contentEl.style.animation = 'fadeIn 0.5s ease-out forwards';

        // Soft-update points after the page is already visible
        updateScoreInBackground(data.id, pointsEl);

    } catch (error) {
        console.error('Error fetching Hacker News item:', error);
        loadingEl.classList.add('hidden');
        errorEl.textContent = 'Failed to load content. Please try again later.';
        errorEl.classList.remove('hidden');
    }
});

function loadSettings() {
    const saved = localStorage.getItem('hs_settings');
    if (saved) {
        currentSettings = { ...defaultSettings, ...JSON.parse(saved) };
    }
}

function saveSettings() {
    localStorage.setItem('hs_settings', JSON.stringify(currentSettings));
    applySettings();
}

/**
 * Fast path for first paint:
 * 1. Fresh cache → instant
 * 2. Stale cache → show immediately, refresh list in background
 * 3. No cache → one API call for summaries, then show (no bulk score fan-out)
 */
async function getRandomHackerNewsItem() {
    const cachedItems = getCachedItems();
    const isCacheFresh = cachedItems && Date.now() - cachedItems.timestamp < CACHE_TTL_MS;

    if (isCacheFresh) {
        const item = pickRandomItem(cachedItems.items);
        if (item) return item;
    }

    // Stale-while-revalidate: paint now, refresh later
    if (cachedItems && cachedItems.items.length > 0) {
        refreshCacheInBackground();
        const item = pickRandomItem(cachedItems.items);
        if (item) return item;
    }

    // Cold start: only wait for the summaries endpoint
    const items = await fetchLatestSummaries();
    cacheItems(items);
    const item = pickRandomItem(items);
    if (!item) {
        throw new Error('No stories available');
    }
    return item;
}

async function fetchLatestSummaries() {
    const response = await fetch(API_URL);

    if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
    }

    const items = await response.json();

    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Invalid latest summaries response');
    }

    return items;
}

function refreshCacheInBackground() {
    fetchLatestSummaries()
        .then(items => cacheItems(items))
        .catch(error => {
            console.warn('Background cache refresh failed:', error);
        });
}

async function updateScoreInBackground(itemId, pointsEl) {
    if (!itemId || !pointsEl) {
        return;
    }

    try {
        const score = await fetchRealtimeScore(itemId, Number(pointsEl.textContent) || 0);
        pointsEl.textContent = score;
        if (currentStory && currentStory.id === itemId) {
            currentStory.score = score;
        }
    } catch (error) {
        // Non-critical; keep the score we already showed
        console.warn('Background score update failed:', error);
    }
}

async function fetchRealtimeScore(itemId, fallbackScore = 0) {
    const fallback = Number.isFinite(Number(fallbackScore)) ? Number(fallbackScore) : 0;

    if (!itemId) {
        return fallback;
    }

    try {
        const response = await fetch(`${HN_ITEM_API_URL}/${encodeURIComponent(itemId)}.json`);

        if (!response.ok) {
            throw new Error(`Failed to fetch realtime score: ${response.status} ${response.statusText}`);
        }

        const item = await response.json();
        const realtimeScore = Number(item && item.score);

        return Number.isFinite(realtimeScore) ? realtimeScore : fallback;
    } catch (error) {
        console.warn('Using cached Hacker News score after realtime refresh failed:', error);
        return fallback;
    }
}

function getCachedItems() {
    const saved = localStorage.getItem(CACHE_KEY);

    if (!saved) {
        return null;
    }

    try {
        const cached = JSON.parse(saved);

        if (
            typeof cached.timestamp !== 'number' ||
            !Array.isArray(cached.items) ||
            cached.items.length === 0
        ) {
            return null;
        }

        return cached;
    } catch (error) {
        console.warn('Ignoring malformed Hacker News cache:', error);
        return null;
    }
}

function cacheItems(items) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            items
        }));
    } catch (error) {
        // QuotaExceeded or private mode — non-fatal
        console.warn('Failed to write Hacker News cache:', error);
    }
}

function pickRandomItem(items) {
    if (!items || items.length === 0) {
        return null;
    }

    const nowSeconds = Date.now() / 1000;
    const preferredMaxAgeSeconds = PREFERRED_STORY_AGE_MS / 1000;

    // Bias toward fresher posts so a day-old long tail doesn't dominate
    const fresh = items.filter(item => {
        const age = nowSeconds - Number(item.time || 0);
        return Number.isFinite(age) && age >= 0 && age <= preferredMaxAgeSeconds;
    });

    const pool = fresh.length > 0 ? fresh : items;
    return pool[Math.floor(Math.random() * pool.length)];
}

function applySettings() {
    const body = document.body;

    // Apply Theme
    body.classList.remove('theme-light', 'theme-dark');
    if (currentSettings.theme !== 'auto') {
        body.classList.add(`theme-${currentSettings.theme}`);
    }

    // Apply Font
    body.classList.remove('font-sans', 'font-serif', 'font-mono');
    body.classList.add(`font-${currentSettings.font}`);

    // Apply Visibility
    toggleVisibility('points-container', currentSettings.showPoints);
    toggleVisibility('domain-container', currentSettings.showDomain);
    toggleVisibility('author-container', currentSettings.showAuthor);
    toggleVisibility('summary', currentSettings.showSummary);
}

function toggleVisibility(elementId, isVisible) {
    const el = document.getElementById(elementId);
    if (el) {
        if (isVisible) {
            el.classList.remove('hidden');
            // Ensure flex items display correctly if they were hidden
            if (el.classList.contains('meta-item')) {
                el.style.display = 'inline';
            } else {
                el.style.display = '';
            }
        } else {
            el.classList.add('hidden');
            el.style.display = 'none';
        }
    }
}

function initSettingsUI() {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');

    // Toggle Panel
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeBookmarksPanel();
        const willOpen = settingsPanel.classList.contains('hidden');
        settingsPanel.classList.toggle('hidden');
        if (willOpen) {
            refreshShortcutsDisplay();
        }
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsPanel.classList.add('hidden');
        }
    });

    // Theme Buttons — clear HTML defaults, then mark the saved value only
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === currentSettings.theme);

        btn.addEventListener('click', () => {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSettings.theme = btn.dataset.value;
            saveSettings();
        });
    });

    // Font Buttons — same: only one active (HTML may hardcode "active" on Sans)
    document.querySelectorAll('.font-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === currentSettings.font);

        btn.addEventListener('click', () => {
            document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSettings.font = btn.dataset.value;
            saveSettings();
        });
    });

    // Toggles
    const toggles = [
        { id: 'toggle-points', key: 'showPoints' },
        { id: 'toggle-domain', key: 'showDomain' },
        { id: 'toggle-author', key: 'showAuthor' },
        { id: 'toggle-summary', key: 'showSummary' }
    ];

    toggles.forEach(toggle => {
        const el = document.getElementById(toggle.id);
        el.checked = currentSettings[toggle.key];

        el.addEventListener('change', () => {
            currentSettings[toggle.key] = el.checked;
            saveSettings();
        });
    });

    // Shortcuts help
    const openShortcutsBtn = document.getElementById('open-chrome-shortcuts');
    if (openShortcutsBtn) {
        openShortcutsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openChromeShortcutSettings();
        });
    }

    // Static platform hint for note save (always page-level, not chrome.commands)
    const saveNoteKeys = document.getElementById('shortcut-save-note');
    if (saveNoteKeys) {
        saveNoteKeys.textContent = isApplePlatform() ? '⌘↵' : 'Ctrl+↵';
    }

    refreshShortcutsDisplay();
}

function openChromeShortcutSettings() {
    const url = 'chrome://extensions/shortcuts';
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url }).catch(() => {
            // Fallback: some contexts block chrome:// — show the URL
            window.prompt('Open this URL in Chrome to change shortcuts:', url);
        });
        return;
    }
    window.prompt('Open this URL in Chrome to change shortcuts:', url);
}

/**
 * Format a chrome.commands shortcut string for display.
 * Chrome returns values like "Ctrl+B", "Command+B", "⌘B", or "".
 */
function formatCommandShortcut(shortcut) {
    if (!shortcut || !String(shortcut).trim()) {
        return 'Not set';
    }

    let s = String(shortcut).trim();

    // Normalize verbose names to symbols when on Apple-style display
    if (isApplePlatform()) {
        s = s
            .replace(/Command\+/gi, '⌘')
            .replace(/Cmd\+/gi, '⌘')
            .replace(/Option\+/gi, '⌥')
            .replace(/Alt\+/gi, '⌥')
            .replace(/Control\+/gi, '⌃')
            .replace(/Ctrl\+/gi, '⌃')
            .replace(/Shift\+/gi, '⇧')
            .replace(/\+/g, '');
    } else {
        s = s
            .replace(/Command\+/gi, 'Ctrl+')
            .replace(/Cmd\+/gi, 'Ctrl+')
            .replace(/Control\+/gi, 'Ctrl+');
    }

    return s;
}

function refreshShortcutsDisplay() {
    const el = document.getElementById('shortcut-quick-bookmark');
    if (!el) return;

    // Fallback labels when chrome.commands is unavailable (e.g. opened as a file)
    // Alt+B = Option+B on Mac — avoids stealing Ctrl/⌘+B (bold) from other sites
    const fallback = isApplePlatform() ? '⌥B' : 'Alt+B';

    if (typeof chrome === 'undefined' || !chrome.commands || !chrome.commands.getAll) {
        el.textContent = fallback;
        el.title = 'Quick bookmark';
        return;
    }

    chrome.commands.getAll((commands) => {
        const cmd = (commands || []).find(c => c.name === 'quick-bookmark');
        if (!cmd || !cmd.shortcut) {
            el.textContent = 'Not set';
            el.title = 'Assign in Chrome extension shortcuts';
            return;
        }
        el.textContent = formatCommandShortcut(cmd.shortcut);
        el.title = cmd.shortcut;
    });
}

function initQuickBookmarkCommand() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) {
        return;
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!message || message.type !== 'HS_QUICK_BOOKMARK') {
            return;
        }

        handleQuickBookmark();
        sendResponse({ ok: true });
    });
}

/**
 * Instant bookmark with empty note (Alt+B / Option+B).
 * Already saved → no-op + star pulse. Never unbookmarks.
 */
function handleQuickBookmark() {
    if (!currentStory || currentStory.id == null) {
        return;
    }

    if (isBookmarked(currentStory.id)) {
        pulseStar();
        return;
    }

    addBookmark(currentStory, '');
    pulseStar();
}

function pulseStar() {
    const starBtn = document.getElementById('bookmark-star');
    if (!starBtn) return;

    starBtn.classList.remove('is-pulsing');
    // Restart animation if already running
    void starBtn.offsetWidth;
    starBtn.classList.add('is-pulsing');

    const onEnd = () => {
        starBtn.classList.remove('is-pulsing');
        starBtn.removeEventListener('animationend', onEnd);
    };
    starBtn.addEventListener('animationend', onEnd);
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

function getBookmarks() {
    const saved = localStorage.getItem(BOOKMARKS_KEY);
    if (!saved) {
        return [];
    }

    try {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter(b => b && b.id != null);
    } catch (error) {
        console.warn('Ignoring malformed bookmarks store:', error);
        return [];
    }
}

function saveBookmarks(bookmarks) {
    try {
        localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    } catch (error) {
        console.warn('Failed to write bookmarks:', error);
    }
}

function isBookmarked(storyId) {
    if (storyId == null) return false;
    return getBookmarks().some(b => String(b.id) === String(storyId));
}

function getBookmarkById(storyId) {
    return getBookmarks().find(b => String(b.id) === String(storyId)) || null;
}

function extractDomain(url) {
    if (!url) {
        return 'news.ycombinator.com';
    }
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
        return 'news.ycombinator.com';
    }
}

function storyArticleUrl(story) {
    if (story && story.url) {
        return story.url;
    }
    const id = story && story.id;
    return id != null
        ? `https://news.ycombinator.com/item?id=${id}`
        : 'https://news.ycombinator.com';
}

function storyCommentsUrl(story) {
    const id = story && story.id;
    return id != null
        ? `https://news.ycombinator.com/item?id=${id}`
        : 'https://news.ycombinator.com';
}

function addBookmark(story, note) {
    if (!story || story.id == null) {
        return;
    }

    const bookmarks = getBookmarks().filter(b => String(b.id) !== String(story.id));
    const snapshot = {
        id: story.id,
        title: story.title || 'Untitled',
        url: story.url || null,
        by: story.by || null,
        score: Number(story.score) || 0,
        summary: story.summary || '',
        time: story.time || null,
        domain: extractDomain(story.url),
        note: (note || '').trim().slice(0, NOTE_MAX_LENGTH),
        bookmarkedAt: Date.now()
    };

    // Newest first
    bookmarks.unshift(snapshot);
    saveBookmarks(bookmarks);
    updateStarUI();
    renderBookmarksList();
}

function removeBookmark(storyId) {
    const bookmarks = getBookmarks().filter(b => String(b.id) !== String(storyId));
    saveBookmarks(bookmarks);
    updateStarUI();
    renderBookmarksList();
}

function updateBookmarkNote(storyId, note) {
    const bookmarks = getBookmarks();
    const idx = bookmarks.findIndex(b => String(b.id) === String(storyId));
    if (idx === -1) {
        return;
    }
    bookmarks[idx] = {
        ...bookmarks[idx],
        note: (note || '').trim().slice(0, NOTE_MAX_LENGTH)
    };
    saveBookmarks(bookmarks);
    renderBookmarksList();
}

function updateStarUI() {
    const starBtn = document.getElementById('bookmark-star');
    if (!starBtn) return;

    const bookmarked = currentStory ? isBookmarked(currentStory.id) : false;
    const quickHint = isApplePlatform() ? '⌥B' : 'Alt+B';
    starBtn.classList.toggle('is-bookmarked', bookmarked);
    starBtn.setAttribute('aria-pressed', bookmarked ? 'true' : 'false');
    starBtn.setAttribute(
        'aria-label',
        bookmarked
            ? 'Remove bookmark'
            : `Bookmark this story (${quickHint} for quick save)`
    );
    starBtn.title = bookmarked
        ? 'Remove bookmark'
        : `Bookmark · ${quickHint} quick save`;
}

function initBookmarksUI() {
    const starBtn = document.getElementById('bookmark-star');
    const bookmarksBtn = document.getElementById('bookmarks-btn');
    const bookmarksPanel = document.getElementById('bookmarks-panel');
    const noteModal = document.getElementById('note-modal');
    const noteInput = document.getElementById('note-input');
    const noteSave = document.getElementById('note-save');
    const noteCancel = document.getElementById('note-cancel');
    const settingsPanel = document.getElementById('settings-panel');

    starBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!currentStory) return;

        if (isBookmarked(currentStory.id)) {
            removeBookmark(currentStory.id);
            return;
        }

        openNoteModal({
            mode: 'add',
            storyId: currentStory.id,
            title: currentStory.title || '',
            initialNote: ''
        });
    });

    bookmarksBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (settingsPanel) {
            settingsPanel.classList.add('hidden');
        }
        const willOpen = bookmarksPanel.classList.contains('hidden');
        if (willOpen) {
            openBookmarksPanel();
        } else {
            closeBookmarksPanel();
        }
    });

    document.addEventListener('click', (e) => {
        if (
            !bookmarksPanel.classList.contains('hidden') &&
            !bookmarksPanel.contains(e.target) &&
            !bookmarksBtn.contains(e.target)
        ) {
            closeBookmarksPanel();
        }
    });

    noteSave.addEventListener('click', () => commitNoteModal());
    noteCancel.addEventListener('click', () => closeNoteModal(false));

    noteModal.querySelectorAll('[data-note-dismiss]').forEach(el => {
        el.addEventListener('click', () => closeNoteModal(false));
    });

    noteInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commitNoteModal();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            closeNoteModal(false);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;

        if (!noteModal.classList.contains('hidden')) {
            e.preventDefault();
            closeNoteModal(false);
            return;
        }

        if (!bookmarksPanel.classList.contains('hidden')) {
            closeBookmarksPanel();
        }
    });

    renderBookmarksList();
}

function openBookmarksPanel() {
    const panel = document.getElementById('bookmarks-panel');
    const btn = document.getElementById('bookmarks-btn');
    renderBookmarksList();
    panel.classList.remove('hidden');
    btn.classList.add('is-open');
}

function closeBookmarksPanel() {
    const panel = document.getElementById('bookmarks-panel');
    const btn = document.getElementById('bookmarks-btn');
    if (panel) panel.classList.add('hidden');
    if (btn) btn.classList.remove('is-open');
}

function isApplePlatform() {
    const platform = (navigator.userAgentData && navigator.userAgentData.platform)
        || navigator.platform
        || '';
    const ua = navigator.userAgent || '';
    return /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X|Macintosh/i.test(ua);
}

/** ⌘↵ on Apple, Ctrl+↵ elsewhere — shown on the Save button */
function getSaveShortcutParts() {
    if (isApplePlatform()) {
        return { keys: ['⌘', '↵'], title: 'Save (⌘Enter)' };
    }
    return { keys: ['Ctrl', '↵'], title: 'Save (Ctrl+Enter)' };
}

function renderSaveShortcut() {
    const shortcutEl = document.getElementById('note-save-shortcut');
    const saveBtn = document.getElementById('note-save');
    if (!shortcutEl || !saveBtn) return;

    const { keys, title } = getSaveShortcutParts();
    shortcutEl.innerHTML = '';
    keys.forEach(key => {
        const kbd = document.createElement('kbd');
        kbd.className = 'kbd';
        kbd.textContent = key;
        shortcutEl.appendChild(kbd);
    });
    saveBtn.title = title;
}

function openNoteModal({ mode, storyId, title, initialNote }) {
    noteModalMode = mode;
    noteModalStoryId = storyId;

    const modal = document.getElementById('note-modal');
    const titleEl = document.getElementById('note-modal-title');
    const subtitleEl = document.getElementById('note-modal-subtitle');
    const input = document.getElementById('note-input');
    const saveLabel = document.getElementById('note-save-label');

    titleEl.textContent = mode === 'edit' ? 'Edit note' : 'Add a note';
    subtitleEl.textContent = title || '';
    input.value = initialNote || '';
    if (saveLabel) {
        saveLabel.textContent = mode === 'edit' ? 'Update' : 'Save';
    }
    renderSaveShortcut();

    modal.classList.remove('hidden');
    // Focus after paint so the caret lands reliably
    requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    });
}

function closeNoteModal(/* saved */) {
    const modal = document.getElementById('note-modal');
    const input = document.getElementById('note-input');
    modal.classList.add('hidden');
    input.value = '';
    noteModalMode = null;
    noteModalStoryId = null;
}

function commitNoteModal() {
    const input = document.getElementById('note-input');
    const note = (input.value || '').trim().slice(0, NOTE_MAX_LENGTH);
    const mode = noteModalMode;
    const storyId = noteModalStoryId;

    if (mode === 'add') {
        // Snapshot from the live story when ids match (normal path)
        if (currentStory && String(currentStory.id) === String(storyId)) {
            addBookmark(currentStory, note);
        }
    } else if (mode === 'edit' && storyId != null) {
        updateBookmarkNote(storyId, note);
    }

    closeNoteModal(true);
}

function renderBookmarksList() {
    const listEl = document.getElementById('bookmarks-list');
    const emptyEl = document.getElementById('bookmarks-empty');
    const countEl = document.getElementById('bookmarks-count');
    if (!listEl || !emptyEl) return;

    const bookmarks = getBookmarks().slice().sort((a, b) => {
        return (b.bookmarkedAt || 0) - (a.bookmarkedAt || 0);
    });

    if (countEl) {
        countEl.textContent = bookmarks.length
            ? String(bookmarks.length)
            : '';
    }

    listEl.innerHTML = '';

    if (bookmarks.length === 0) {
        emptyEl.classList.remove('hidden');
        return;
    }

    emptyEl.classList.add('hidden');

    const fragment = document.createDocumentFragment();

    bookmarks.forEach(bookmark => {
        const li = document.createElement('li');
        li.className = 'bookmark-item';
        li.dataset.id = String(bookmark.id);

        const articleUrl = storyArticleUrl(bookmark);
        const commentsUrl = storyCommentsUrl(bookmark);
        const domain = bookmark.domain || extractDomain(bookmark.url);
        const note = (bookmark.note || '').trim();

        const title = document.createElement('a');
        title.className = 'bookmark-item-title';
        title.href = articleUrl;
        title.target = '_blank';
        title.rel = 'noopener noreferrer';
        title.textContent = bookmark.title || 'Untitled';

        const meta = document.createElement('div');
        meta.className = 'bookmark-item-meta';

        const domainSpan = document.createElement('span');
        domainSpan.className = 'bookmark-item-domain';
        domainSpan.textContent = domain;

        const hnLink = document.createElement('a');
        hnLink.className = 'bookmark-item-hn';
        hnLink.href = commentsUrl;
        hnLink.target = '_blank';
        hnLink.rel = 'noopener noreferrer';
        hnLink.textContent = 'comments';

        meta.appendChild(domainSpan);
        meta.appendChild(document.createTextNode('·'));
        meta.appendChild(hnLink);

        li.appendChild(title);
        li.appendChild(meta);

        if (note) {
            const noteEl = document.createElement('p');
            noteEl.className = 'bookmark-item-note';
            noteEl.textContent = note;
            li.appendChild(noteEl);
        }

        const actions = document.createElement('div');
        actions.className = 'bookmark-item-actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'bookmark-action-btn';
        editBtn.textContent = note ? 'Edit note' : 'Add note';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openNoteModal({
                mode: 'edit',
                storyId: bookmark.id,
                title: bookmark.title || '',
                initialNote: note
            });
        });

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'bookmark-action-btn danger';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeBookmark(bookmark.id);
        });

        actions.appendChild(editBtn);
        actions.appendChild(removeBtn);
        li.appendChild(actions);

        fragment.appendChild(li);
    });

    listEl.appendChild(fragment);
}

function renderMarkdown(text) {
    if (!text) return "";

    // Escape HTML to prevent XSS
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // Basic Markdown conversion
    html = html
        // Remove headings (strip # markers)
        .replace(/^#+\s+/gm, '')
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)\__/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/_(.*?)_/g, '<em>$1</em>')
        // Inline code
        .replace(/`(.*?)`/g, '<code>$1</code>')
        // Links
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        // Paragraphs (double newline)
        .replace(/\n\n/g, '</p><p>')
        // Line breaks (single newline)
        .replace(/\n/g, '<br>');

    // Wrap in paragraph if not already
    return `<p>${html}</p>`;
}
