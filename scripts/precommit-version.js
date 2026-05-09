'use strict';

const { execSync } = require('child_process');
const fs = require('fs');

const MANIFEST_PATH = 'manifest.json';
const POPUP_PATH = 'popup.html';
const POPUP_VERSION_RE = /(AutoScroller\s+v)(\d+\.\d+\.\d+)/;

function getStagedFiles() {
	const out = execSync('git diff --cached --name-only --diff-filter=ACMR', {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	return out
		.split(/\r?\n/)
		.map((s) => s.trim())
		.filter(Boolean);
}

function isCodeFile(filePath) {
	return /\.(js|mjs|cjs|json|css|html)$/i.test(filePath);
}

function getManifestVersion() {
	const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
	const json = JSON.parse(raw);
	if (!json || typeof json.version !== 'string') {
		throw new Error('manifest.json に version がありません');
	}
	return json.version;
}

function syncPopupVersion(version) {
	const src = fs.readFileSync(POPUP_PATH, 'utf8');
	if (!POPUP_VERSION_RE.test(src)) {
		throw new Error('popup.html のバージョン表記を検出できません');
	}
	const next = src.replace(POPUP_VERSION_RE, `$1${version}`);
	if (next !== src) {
		fs.writeFileSync(POPUP_PATH, next, 'utf8');
		console.log(`[pre-commit] synced popup.html version to ${version}`);
	}
}

function main() {
	const staged = getStagedFiles();
	if (!staged.length) {
		console.log('[pre-commit] no staged files: skip version bump');
		return;
	}

	const hasCodeChange = staged.some((f) => isCodeFile(f));
	if (!hasCodeChange) {
		console.log('[pre-commit] non-code commit: skip version bump');
		return;
	}

	execSync('node scripts/version-sync.js bump', { stdio: 'inherit' });
	const version = getManifestVersion();
	syncPopupVersion(version);
	execSync('git add manifest.example.json background.js popup.html', { stdio: 'inherit' });
	execSync('node scripts/version-sync.js check', { stdio: 'inherit' });
}

main();
