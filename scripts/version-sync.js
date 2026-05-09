'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const MANIFEST_EXAMPLE_PATH = path.join(ROOT, 'manifest.example.json');
const BACKGROUND_PATH = path.join(ROOT, 'background.js');

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const UA_VERSION_RE = /(Chordwiki-AutoScroller\/)(\d+\.\d+\.\d+)(\s*\(https:\/\/github\.com\/\))/;
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

function readBackground() {
	return fs.readFileSync(BACKGROUND_PATH, 'utf8');
}

function getBackgroundVersion(source) {
	const m = UA_VERSION_RE.exec(source);
	if (!m) {
		throw new Error('background.js の User-Agent バージョンを検出できません');
	}
	return m[2];
}

function writeBackgroundVersion(version) {
	const src = readBackground();
	if (!UA_VERSION_RE.test(src)) {
		throw new Error('background.js の User-Agent バージョン置換に失敗しました');
	}
	const next = src.replace(UA_VERSION_RE, `$1${version}$3`);
	fs.writeFileSync(BACKGROUND_PATH, next, 'utf8');
}

/** manifest.json（ローカル）から `key` を除いた複製を manifest.example.json に書く（コミット用）。 */
function writeManifestExampleFromManifest() {
	const { json } = readManifest();
	const out = { ...json };
	delete out.key;
	fs.writeFileSync(MANIFEST_EXAMPLE_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
	console.log(`Wrote ${path.relative(ROOT, MANIFEST_EXAMPLE_PATH)} (key omitted)`);
}

function checkSync() {
	const { json } = readManifest();
	const manifestVersion = json.version;
	parseVersion(manifestVersion);
	const backgroundVersion = getBackgroundVersion(readBackground());
	parseVersion(backgroundVersion);
	if (manifestVersion !== backgroundVersion) {
		throw new Error(
			`version 不一致: manifest=${manifestVersion}, background(User-Agent)=${backgroundVersion}`
		);
	}
	console.log(`OK: version synchronized (${manifestVersion})`);
}

function syncToManifest() {
	const { json } = readManifest();
	const manifestVersion = json.version;
	parseVersion(manifestVersion);
	writeBackgroundVersion(manifestVersion);
	console.log(`Synced User-Agent version to ${manifestVersion}`);
}

function bumpAndSync() {
	const { json } = readManifest();
	const current = json.version;
	const next = bumpVersion(current);
	writeManifestVersion(next);
	writeBackgroundVersion(next);
	writeManifestExampleFromManifest();
	console.log(`Bumped version: ${current} -> ${next}`);
}

function main() {
	const mode = process.argv[2] || 'check';
	if (mode === 'check') {
		checkSync();
		return;
	}
	if (mode === 'sync') {
		syncToManifest();
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
	throw new Error('usage: node scripts/version-sync.js [check|sync|bump|write-example]');
}

main();
