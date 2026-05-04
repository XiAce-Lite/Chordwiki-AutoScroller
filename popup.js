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
	const btn = document.getElementById('toggle');
	if (!(btn instanceof HTMLButtonElement)) return;

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
		});
	});
});
