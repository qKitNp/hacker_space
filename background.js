/**
 * Routes browser-level chrome.commands to the active tab.
 * Only our new-tab page listens for HS_QUICK_BOOKMARK, so other sites are no-ops
 * (sendMessage fails with no receiver — no tabs permission required).
 */

const QUICK_BOOKMARK_COMMAND = 'quick-bookmark';

chrome.commands.onCommand.addListener(async (command) => {
    if (command !== QUICK_BOOKMARK_COMMAND) {
        return;
    }

    try {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const tab = tabs && tabs[0];
        if (!tab || tab.id == null) {
            return;
        }

        await chrome.tabs.sendMessage(tab.id, { type: 'HS_QUICK_BOOKMARK' });
    } catch (error) {
        // Active tab is not Hacker Space (or page not ready) — ignore by design
        console.debug('quick-bookmark not delivered:', error && error.message);
    }
});
