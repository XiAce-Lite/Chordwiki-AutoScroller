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

function updatePageLinkStatus() {
	const statusEl = document.getElementById('cw-page-status');
	if (!statusEl) return;

	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		const tab = tabs[0];
		chrome.runtime.sendMessage(
			{
				type: 'ensureContentScript',
				tabId: tab?.id,
				url: tab?.url,
			},
			(resp) => {
				if (chrome.runtime.lastError) {
					statusEl.textContent = 'ページ未接続（拡張の再読み込みを試してください）';
					statusEl.dataset.tone = 'error';
					return;
				}
				if (!resp?.alive) {
					statusEl.textContent =
						'ページ未接続（ChordWikiの曲ページを開き、再読み込みしてください）';
					statusEl.dataset.tone = 'error';
					return;
				}
				if (resp.contentEnabled === false) {
					statusEl.textContent =
						'ページ側がOFFです。下のボタンでONにしてください';
					statusEl.dataset.tone = 'error';
					return;
				}
				statusEl.textContent = '';
				statusEl.dataset.tone = 'ok';
			}
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

	refreshToggleState(btn);
	updatePageLinkStatus();

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
			updatePageLinkStatus();
		});
	});
});
