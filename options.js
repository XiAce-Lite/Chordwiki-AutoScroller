'use strict';

document.addEventListener('DOMContentLoaded', () => {
	const form = document.getElementById('options-form');
	const debugInput = document.getElementById('debug-query-output');
	const status = document.getElementById('options-status');

	chrome.runtime.sendMessage({ type: 'getOptions' }, (resp) => {
		if (chrome.runtime.lastError) return;
		debugInput.checked = resp?.options?.debugQueryOutput === true;
	});

	form.addEventListener('submit', (e) => {
		e.preventDefault();
		const options = {
			debugQueryOutput: debugInput.checked === true,
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
