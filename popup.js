'use strict';

function formatSource(src) {
	const m = { itunes: 'iTunes', musicbrainz: 'MusicBrainz', default: '既定', none: '' };
	return m[src] || '';
}

function queryActiveChordwikiTab(cb) {
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		const tab = tabs[0];
		const url = tab?.url || '';
		const ok =
			url.includes('chordwiki.org') || url.includes('ja.chordwiki.org');
		cb(tab?.id, ok);
	});
}

function refreshDuration() {
	const el = document.getElementById('popup-duration');
	const srcEl = document.getElementById('popup-source');
	queryActiveChordwikiTab((tabId, ok) => {
		if (!ok || tabId == null) {
			el.textContent = '--:--';
			if (srcEl) srcEl.textContent = '';
			return;
		}
		chrome.tabs.sendMessage(tabId, { type: 'getPlaybackSnapshot' }, (r) => {
			if (chrome.runtime.lastError || !r) {
				el.textContent = '--:--';
				if (srcEl) srcEl.textContent = '';
				return;
			}
			el.textContent = r.formatted || '--:--';
			if (srcEl) srcEl.textContent = formatSource(r.source);
		});
	});
}

function clampSpeed(s) {
	return Math.min(3, Math.max(0.25, s));
}

document.addEventListener('DOMContentLoaded', () => {
	const spdRange = document.getElementById('popup-speed');
	const spdVal = document.getElementById('popup-speed-val');

	function showSpeed(v) {
		const x = typeof v === 'number' && Number.isFinite(v) ? v : parseFloat(spdRange.value);
		spdVal.textContent = (Number.isFinite(x) ? x : 1).toFixed(2) + 'x';
	}

	chrome.runtime.sendMessage({ type: 'getOptions' }, (resp) => {
		const d = resp?.options?.defaultSpeed;
		if (typeof d === 'number' && Number.isFinite(d)) {
			spdRange.value = String(clampSpeed(d));
			showSpeed(d);
		} else {
			showSpeed(parseFloat(spdRange.value));
		}
	});

	const sessApi = chrome.storage?.session;
	if (sessApi?.get) {
		sessApi.get(['cw_autoscroller_session_speed'], (data) => {
			const v = data.cw_autoscroller_session_speed;
			if (typeof v === 'number' && v > 0) {
				spdRange.value = String(clampSpeed(v));
				showSpeed(v);
			}
		});
	}

	spdRange.addEventListener('input', () => {
		const v = clampSpeed(parseFloat(spdRange.value));
		showSpeed(v);
		chrome.runtime.sendMessage({ type: 'adjustSpeed', value: v }, () => void chrome.runtime.lastError);
	});

	document.getElementById('popup-start').addEventListener('click', () => {
		chrome.runtime.sendMessage({ type: 'startScroll' }, () => void chrome.runtime.lastError);
	});
	document.getElementById('popup-stop').addEventListener('click', () => {
		chrome.runtime.sendMessage({ type: 'stopScroll' }, () => void chrome.runtime.lastError);
	});

	showSpeed(parseFloat(spdRange.value));
	refreshDuration();
});
