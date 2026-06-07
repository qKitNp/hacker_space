const API_URL = 'https://hn.tinkerers.space/latest_summaries?limit=100';
const HN_ITEM_API_URL = 'https://hacker-news.firebaseio.com/v0/item';
const CACHE_KEY = 'hs_latest_summaries_cache';
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

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

document.addEventListener('DOMContentLoaded', async () => {
    loadSettings();
    initSettingsUI();
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

        // Show content
        loadingEl.classList.add('hidden');
        contentEl.classList.remove('hidden');
        contentEl.style.animation = 'fadeIn 0.5s ease-out forwards';

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

async function getRandomHackerNewsItem() {
    const cachedItems = getCachedItems();
    const isCacheFresh = cachedItems && Date.now() - cachedItems.timestamp < CACHE_TTL_MS;

    if (isCacheFresh) {
        return pickRandomItem(cachedItems.items);
    }

    try {
        const items = await refreshScores(await fetchLatestSummaries());
        cacheItems(items);
        return pickRandomItem(items);
    } catch (error) {
        if (cachedItems) {
            console.warn('Using expired Hacker News cache after refresh failed:', error);
            return pickRandomItem(cachedItems.items);
        }

        throw error;
    }
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

async function refreshScores(items) {
    return Promise.all(items.map(async item => ({
        ...item,
        score: await fetchRealtimeScore(item.id, item.score)
    })));
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
    localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        items
    }));
}

function pickRandomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
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
        settingsPanel.classList.toggle('hidden');
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsPanel.classList.add('hidden');
        }
    });

    // Theme Buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
        if (btn.dataset.value === currentSettings.theme) btn.classList.add('active');

        btn.addEventListener('click', () => {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSettings.theme = btn.dataset.value;
            saveSettings();
        });
    });

    // Font Buttons
    document.querySelectorAll('.font-btn').forEach(btn => {
        if (btn.dataset.value === currentSettings.font) btn.classList.add('active');

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
