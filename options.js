'use strict';

function clampSpeed(v) {
	const n = typeof v === 'number' ? v : parseFloat(String(v));
	if (!Number.isFinite(n)) return 1;
	return Math.min(3, Math.max(0.25, n));
}

document.addEventListener('DOMContentLoaded', () => {
	const form = document.getElementById('options-form');
	const speedInput = document.getElementById('default-speed');
	const status = document.getElementById('options-status');

	chrome.runtime.sendMessage({ type: 'getOptions' }, (resp) => {
		if (chrome.runtime.lastError) return;
		const d = resp?.options?.defaultSpeed;
		if (typeof d === 'number') {
			speedInput.value = String(clampSpeed(d));
		}
	});

	form.addEventListener('submit', (e) => {
		e.preventDefault();
		const options = {
			defaultSpeed: clampSpeed(parseFloat(speedInput.value)),
		};
		chrome.runtime.sendMessage({ type: 'saveOptions', options }, (r) => {
			if (chrome.runtime.lastError) {
				status.textContent = '保存に失敗しました';
				return;
			}
			if (r?.options) {
				status.textContent = '保存しました';
			}
		});
	});
});
