/**
 * Chordwiki-AutoScroller — service worker (MV3)
 * Duration lookup (iTunes → MusicBrainz), options storage, message relay to tabs.
 */

const STORAGE_OPTIONS_KEY = 'cw_autoscroller_options';
const STORAGE_SESSION_SPEED_KEY = 'cw_autoscroller_session_speed';
const STORAGE_EXTENSION_ENABLED_KEY = 'cw_autoscroller_enabled';
const CHORDWIKI_HOSTNAME = 'ja.chordwiki.org';

const DEFAULT_OPTIONS = {
	debugQueryOutput: false,
};

const DEFAULT_DURATION_MS = 240_000;

/** MusicBrainz requires a descriptive User-Agent. */
const MUSICBRAINZ_USER_AGENT =
	'Chordwiki-AutoScroller/1.0.4 (https://github.com/)';

// -----------------------------------------------------------------------------
// Options
// -----------------------------------------------------------------------------

async function getOptions() {
	const data = await chrome.storage.sync.get(STORAGE_OPTIONS_KEY);
	const merged = { ...DEFAULT_OPTIONS, ...(data[STORAGE_OPTIONS_KEY] || {}) };
	merged.debugQueryOutput = merged.debugQueryOutput === true;
	return merged;
}

async function saveOptions(options) {
	const next = {
		...DEFAULT_OPTIONS,
		debugQueryOutput: options?.debugQueryOutput === true,
	};
	await chrome.storage.sync.set({ [STORAGE_OPTIONS_KEY]: next });
	return next;
}

async function getSessionScrollSpeed() {
	const data = await chrome.storage.session.get(STORAGE_SESSION_SPEED_KEY);
	const v = data[STORAGE_SESSION_SPEED_KEY];
	if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
		return v;
	}
	return 1.0;
}

async function setSessionScrollSpeed(value) {
	const speed =
		typeof value === 'number' && Number.isFinite(value) ? Math.min(3, Math.max(0.25, value)) : 1.0;
	await chrome.storage.session.set({ [STORAGE_SESSION_SPEED_KEY]: speed });
	return speed;
}

async function getExtensionEnabled() {
	const data = await chrome.storage.sync.get(STORAGE_EXTENSION_ENABLED_KEY);
	return data[STORAGE_EXTENSION_ENABLED_KEY] !== false;
}

async function setExtensionEnabled(enabled) {
	const next = enabled !== false;
	await chrome.storage.sync.set({ [STORAGE_EXTENSION_ENABLED_KEY]: next });
	return next;
}

// -----------------------------------------------------------------------------
// Duration APIs
// -----------------------------------------------------------------------------

function sanitizeSearchPart(s) {
	return String(s ?? '')
		.trim()
		.replace(/\s+/g, ' ');
}

/**
 * Lucene special chars for MusicBrainz search (subset; escape backslash first).
 */
function escapeMusicBrainzQueryTerm(raw) {
	let s = String(raw ?? '');
	s = s.replace(/\\/g, '\\\\');
	s = s.replace(/"/g, '\\"');
	s = s.replace(/\+/g, '\\+');
	s = s.replace(/\-/g, '\\-');
	s = s.replace(/\!/g, '\\!');
	s = s.replace(/\(/g, '\\(');
	s = s.replace(/\)/g, '\\)');
	s = s.replace(/\{/g, '\\{');
	s = s.replace(/\}/g, '\\}');
	s = s.replace(/\[/g, '\\[');
	s = s.replace(/\]/g, '\\]');
	s = s.replace(/\^/g, '\\^');
	s = s.replace(/\~/g, '\\~');
	s = s.replace(/\*/g, '\\*');
	s = s.replace(/\?/g, '\\?');
	s = s.replace(/\:/g, '\\:');
	s = s.replace(/\&\&/g, '\\&\\&');
	s = s.replace(/\|\|/g, '\\|\\|');
	return s.trim();
}

async function fetchDurationFromItunes(title, artist, reportDebugUrl) {
	const q = sanitizeSearchPart(`${title} ${artist}`);
	if (!q) {
		return null;
	}

	const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=5`;
	reportDebugUrl?.('itunes', url);

	try {
		const resp = await fetch(url);
		if (!resp.ok) {
			return null;
		}
		const data = await resp.json();
		const results = Array.isArray(data.results) ? data.results : [];
		const item = results.find((i) => typeof i.trackTimeMillis === 'number' && i.trackTimeMillis > 0);
		if (item) {
			return { duration: Math.round(item.trackTimeMillis), source: 'itunes' };
		}
	} catch {
		// ignore
	}
	return null;
}

async function fetchDurationFromMusicBrainz(title, artist, reportDebugUrl) {
	const t = sanitizeSearchPart(title);
	const a = sanitizeSearchPart(artist);
	if (!t || !a) {
		return null;
	}

	const q = `recording:"${escapeMusicBrainzQueryTerm(t)}" AND artist:"${escapeMusicBrainzQueryTerm(a)}"`;
	const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=5`;
	reportDebugUrl?.('musicbrainz', url);

	try {
		const resp = await fetch(url, {
			headers: {
				Accept: 'application/json',
				'User-Agent': MUSICBRAINZ_USER_AGENT,
			},
		});
		if (!resp.ok) {
			return null;
		}
		const data = await resp.json();
		const recordings = Array.isArray(data.recordings) ? data.recordings : [];
		const rec = recordings.find((r) => typeof r.length === 'number' && r.length > 0);
		if (rec) {
			return { duration: Math.round(rec.length), source: 'musicbrainz' };
		}
	} catch {
		// ignore
	}
	return null;
}

async function resolveDuration(title, artist, reportDebugUrl) {
	let result = await fetchDurationFromItunes(title, artist, reportDebugUrl);
	if (!result) {
		result = await fetchDurationFromMusicBrainz(title, artist, reportDebugUrl);
	}
	if (!result) {
		return { duration: DEFAULT_DURATION_MS, source: 'default', unavailable: true };
	}
	return { ...result, unavailable: false };
}

function reportDebugDurationQuery({ provider, url, sender, enabled }) {
	if (!enabled || !url) {
		return;
	}

	console.info(`[duration-debug][${provider}] ${url}`);

	const tabId = sender?.tab?.id;
	if (typeof tabId !== 'number') {
		return;
	}

	chrome.tabs.sendMessage(tabId, { type: 'durationDebugUrl', provider, url }, () => {
		void chrome.runtime.lastError;
	});
}

function handleGetDuration(message, sender, sendResponse) {
	const title = sanitizeSearchPart(message?.title);
	const artist = sanitizeSearchPart(message?.artist);

	if (!title || !artist) {
		sendResponse({
			type: 'durationResult',
			duration: DEFAULT_DURATION_MS,
			source: 'default',
			unavailable: true,
		});
		return;
	}

	getOptions()
		.catch(() => DEFAULT_OPTIONS)
		.then((options) => {
			const debugEnabled = options?.debugQueryOutput === true;
			const reportDebugUrl = (provider, url) => {
				reportDebugDurationQuery({ provider, url, sender, enabled: debugEnabled });
			};

			return resolveDuration(title, artist, reportDebugUrl);
		})
		.then((payload) => {
			sendResponse({ type: 'durationResult', ...payload });
		})
		.catch(() => {
			sendResponse({
				type: 'durationResult',
				duration: DEFAULT_DURATION_MS,
				source: 'default',
				unavailable: true,
			});
		});
}

// -----------------------------------------------------------------------------
// Relay to active chordwiki tab (popup → background → content)
// -----------------------------------------------------------------------------

function isChordwikiUrl(url) {
	if (!url || typeof url !== 'string') {
		return false;
	}
	try {
		const u = new URL(url);
		return u.hostname === CHORDWIKI_HOSTNAME;
	} catch {
		return false;
	}
}

function isChordwikiSongPageUrl(url) {
	if (!isChordwikiUrl(url)) {
		return false;
	}

	try {
		const u = new URL(url);
		if (!u.pathname.startsWith('/wiki/')) {
			return false;
		}
		if (u.pathname === '/' || u.pathname === '') {
			return false;
		}
		if (u.pathname.startsWith('/ranking') || u.pathname.startsWith('/search')) {
			return false;
		}
		return true;
	} catch {
		return false;
	}
}

async function getActiveChordwikiTabId() {
	const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
	const tab = tabs[0];
	if (tab?.id != null && isChordwikiUrl(tab.url)) {
		return tab.id;
	}
	return null;
}

async function relayStartScroll() {
	if (!(await getExtensionEnabled())) {
		return;
	}
	const tabId = await getActiveChordwikiTabId();
	if (tabId == null) {
		return;
	}
	const speed = await getSessionScrollSpeed();
	try {
		await chrome.tabs.sendMessage(tabId, { type: 'startAutoScroll', speed });
	} catch {
		// tab may have no content script
	}
}

async function relayStopScroll() {
	if (!(await getExtensionEnabled())) {
		return;
	}
	const tabId = await getActiveChordwikiTabId();
	if (tabId == null) {
		return;
	}
	try {
		await chrome.tabs.sendMessage(tabId, { type: 'stopAutoScroll' });
	} catch {
		// ignore
	}
}

async function relayAdjustSpeed(value) {
	if (!(await getExtensionEnabled())) {
		return;
	}
	const speed = await setSessionScrollSpeed(value);
	const tabId = await getActiveChordwikiTabId();
	if (tabId == null) {
		return;
	}
	try {
		await chrome.tabs.sendMessage(tabId, { type: 'setScrollSpeed', speed });
	} catch {
		// ignore
	}
}

async function toggleUiOnActiveSongTab() {
	if (!(await getExtensionEnabled())) {
		return;
	}
	const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
	const tab = tabs[0];
	if (tab?.id == null || !isChordwikiSongPageUrl(tab.url)) {
		return;
	}

	try {
		await chrome.tabs.sendMessage(tab.id, { type: 'toggleUiVisibility' });
	} catch {
		// ignore: no receiver or page not ready
	}
}

async function broadcastExtensionEnabled(enabled) {
	const tabs = await chrome.tabs.query({});
	for (const tab of tabs) {
		if (tab?.id == null || !isChordwikiUrl(tab.url)) {
			continue;
		}
		try {
			await chrome.tabs.sendMessage(tab.id, { type: 'setExtensionEnabled', enabled });
		} catch {
			// ignore: no receiver or tab not ready
		}
	}
}

// -----------------------------------------------------------------------------
// Message router
// -----------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (!message || typeof message !== 'object') {
		return false;
	}

	switch (message.type) {
		case 'getExtensionEnabled':
			getExtensionEnabled()
				.then((enabled) => sendResponse({ ok: true, enabled }))
				.catch(() => sendResponse({ ok: true, enabled: true }));
			return true;

		case 'setExtensionEnabled':
			setExtensionEnabled(message.enabled)
				.then((enabled) => broadcastExtensionEnabled(enabled).then(() => enabled))
				.then((enabled) => sendResponse({ ok: true, enabled }))
				.catch(() => sendResponse({ ok: false }));
			return true;

		case 'toggleExtensionEnabled':
			getExtensionEnabled()
				.then((enabled) => setExtensionEnabled(!enabled))
				.then((enabled) => broadcastExtensionEnabled(enabled).then(() => enabled))
				.then((enabled) => sendResponse({ ok: true, enabled }))
				.catch(() => sendResponse({ ok: false }));
			return true;

		case 'getDuration':
			handleGetDuration(message, sender, sendResponse);
			return true;

		case 'saveOptions':
			saveOptions(message.options)
				.then((options) => {
					sendResponse({ type: 'optionsResult', options });
				})
				.catch(() => {
					sendResponse({ type: 'optionsResult', options: DEFAULT_OPTIONS });
				});
			return true;

		case 'getOptions':
			getOptions()
				.then((options) => {
					sendResponse({ type: 'optionsResult', options });
				})
				.catch(() => {
					sendResponse({ type: 'optionsResult', options: DEFAULT_OPTIONS });
				});
			return true;

		case 'startScroll':
			relayStartScroll().then(() => sendResponse({ ok: true }));
			return true;

		case 'stopScroll':
			relayStopScroll().then(() => sendResponse({ ok: true }));
			return true;

		case 'adjustSpeed':
			relayAdjustSpeed(message.value).then(() => sendResponse({ ok: true }));
			return true;

		case 'toggleUiVisibility':
			toggleUiOnActiveSongTab().then(() => sendResponse({ ok: true }));
			return true;

		default:
			return false;
	}
});

chrome.action.onClicked.addListener(() => {
	toggleUiOnActiveSongTab().catch(() => {
		// ignore
	});
});
