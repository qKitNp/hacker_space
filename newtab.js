const API_URL = 'https://hn.tinkerers.space/random';

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
        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Populate data
        titleEl.textContent = data.title;
        titleLinkEl.href = data.url || `https://news.ycombinator.com/item?id=${data.id}`;

        authorLinkEl.textContent = data.by;
        authorLinkEl.href = `https://news.ycombinator.com/user?id=${data.by}`;

        summaryEl.textContent = data.summary || "No summary available.";

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
