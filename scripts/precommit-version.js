'use strict';

const { execSync } = require('child_process');
const fs = require('fs');

const MANIFEST_PATH = 'manifest.json';

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

function manifestExists() {
	try {
		fs.accessSync(MANIFEST_PATH, fs.constants.R_OK);
		return true;
	} catch (_e) {
		return false;
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

	if (!manifestExists()) {
		console.log('[pre-commit] manifest.json がありません: skip version bump（manifest.example.json をコピーしてください）');
		return;
	}

	execSync('node scripts/version-sync.js bump', { stdio: 'inherit' });
	execSync('git add manifest.example.json', { stdio: 'inherit' });
	execSync('node scripts/version-sync.js check', { stdio: 'inherit' });
}

main();
