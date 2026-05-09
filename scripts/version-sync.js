'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const MANIFEST_EXAMPLE_PATH = path.join(ROOT, 'manifest.example.json');

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const MAX_PART = 99;

function readManifest() {
	const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
	const json = JSON.parse(raw);
	if (!json || typeof json.version !== 'string') {
		throw new Error('manifest.json に version がありません');
	}
	return { raw, json };
}

function parseVersion(version) {
	const m = VERSION_RE.exec(String(version).trim());
	if (!m) {
		throw new Error(`不正なバージョン形式: ${version}`);
	}
	const major = Number(m[1]);
	const minor = Number(m[2]);
	const revision = Number(m[3]);
	for (const v of [major, minor, revision]) {
		if (!Number.isInteger(v) || v < 0 || v > MAX_PART) {
			throw new Error(`バージョン範囲外: ${version}`);
		}
	}
	return { major, minor, revision };
}

function formatVersion(v) {
	return `${v.major}.${v.minor}.${v.revision}`;
}

function bumpVersion(version) {
	const next = parseVersion(version);
	next.revision += 1;
	if (next.revision > MAX_PART) {
		next.revision = 0;
		next.minor += 1;
	}
	if (next.minor > MAX_PART) {
		next.minor = 0;
		next.major += 1;
	}
	if (next.major > MAX_PART) {
		throw new Error('バージョン上限 99.99.99 に到達しました');
	}
	return formatVersion(next);
}

function writeManifestVersion(version) {
	const { json } = readManifest();
	json.version = version;
	fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}

/** manifest のトップレベルで名前が `key` とみなせるプロパティを除く（公開鍵など）。 */
function stripManifestKeyField(obj) {
	const out = JSON.parse(JSON.stringify(obj));
	for (const prop of Object.keys(out)) {
		const canon = String(prop).normalize('NFKC').toLowerCase();
		if (canon === 'key') {
			delete out[prop];
		}
	}
	return out;
}

/** manifest.json（ローカル）から key を除いた複製を manifest.example.json に書く（コミット用）。 */
function writeManifestExampleFromManifest() {
	const { json } = readManifest();
	const out = stripManifestKeyField(json);
	fs.writeFileSync(MANIFEST_EXAMPLE_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
	console.log(`Wrote ${path.relative(ROOT, MANIFEST_EXAMPLE_PATH)} (key omitted)`);
}

function checkSync() {
	const { json } = readManifest();
	const manifestVersion = json.version;
	parseVersion(manifestVersion);
	console.log(`OK: manifest version (${manifestVersion})`);
}

function bumpAndSync() {
	const { json } = readManifest();
	const current = json.version;
	const next = bumpVersion(current);
	writeManifestVersion(next);
	writeManifestExampleFromManifest();
	console.log(`Bumped version: ${current} -> ${next}`);
}

function main() {
	const mode = process.argv[2] || 'check';
	if (mode === 'check') {
		checkSync();
		return;
	}
	if (mode === 'bump') {
		bumpAndSync();
		return;
	}
	if (mode === 'write-example') {
		writeManifestExampleFromManifest();
		return;
	}
	throw new Error('usage: node scripts/version-sync.js [check|bump|write-example]');
}

main();
