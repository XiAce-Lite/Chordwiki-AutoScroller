'use strict';

const { execSync } = require('child_process');

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
	execSync('git add manifest.json background.js', { stdio: 'inherit' });
	execSync('node scripts/version-sync.js check', { stdio: 'inherit' });
}

main();
