'use strict';

function setToggleUi(btn, state) {
	if (!(btn instanceof HTMLButtonElement)) return;
	btn.disabled = false;
	if (state === 'on') {
		btn.dataset.state = 'on';
		btn.textContent = '拡張機能: ON（クリックでOFF）';
		return;
	}
	btn.dataset.state = 'off';
	btn.textContent = '拡張機能: OFF（クリックでON）';
}

/** ポップアップ表示時に ChordWiki タブへ content script を接続（activeTab） */
function ensurePageConnection() {
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		const tab = tabs[0];
		if (tab?.id == null) return;
		chrome.runtime.sendMessage(
			{
				type: 'ensureContentScript',
				tabId: tab.id,
				url: tab.url,
			},
			() => void chrome.runtime.lastError
		);
	});
}

function refreshToggleState(btn) {
	chrome.runtime.sendMessage({ type: 'getExtensionEnabled' }, (resp) => {
		if (chrome.runtime.lastError || !resp || resp.ok !== true) {
			setToggleUi(btn, 'off');
			return;
		}
		setToggleUi(btn, resp.enabled ? 'on' : 'off');
	});
}

document.addEventListener('DOMContentLoaded', () => {
	const verEl = document.getElementById('cw-popup-version');
	if (verEl) {
		try {
			const v = chrome.runtime.getManifest()?.version ?? '';
			verEl.textContent = v ? `AutoScroller v${v}` : 'AutoScroller';
		} catch (_e) {
			verEl.textContent = 'AutoScroller';
		}
	}

	const btn = document.getElementById('toggle');
	if (!(btn instanceof HTMLButtonElement)) return;

	ensurePageConnection();
	refreshToggleState(btn);

	btn.addEventListener('click', () => {
		btn.disabled = true;
		chrome.runtime.sendMessage({ type: 'toggleExtensionEnabled' }, (resp) => {
			if (chrome.runtime.lastError || !resp || resp.ok !== true) {
				btn.disabled = false;
				refreshToggleState(btn);
				return;
			}
			setToggleUi(btn, resp.enabled ? 'on' : 'off');
			btn.disabled = false;
			ensurePageConnection();
		});
	});
});
