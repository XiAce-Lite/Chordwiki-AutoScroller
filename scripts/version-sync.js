'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const MANIFEST_EXAMPLE_PATH = path.join(ROOT, 'manifest.example.json');
const MANIFEST_FIREFOX_PATH = path.join(ROOT, 'manifest.firefox.json');

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

const DEFAULT_GECKO = {
	id: 'chordwiki-autoscroller@xiace-lite',
	strict_min_version: '140.0',
	data_collection_permissions: {
		// iTunes / MusicBrainz へ曲名・アーティスト検索語を送信するため
		required: ['searchTerms'],
	},
};

const DEFAULT_GECKO_ANDROID = {
	strict_min_version: '142.0',
};

function writeManifestVersion(version) {
	const { json } = readManifest();
	json.version = version;
	fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
}

/** Chrome マニフェスト（key 除去）から Firefox 用を生成。gecko.id は既存値を維持。 */
function writeFirefoxManifestFromChrome() {
	const { json } = readManifest();
	const out = stripManifestKeyField(json);
	const gecko = JSON.parse(JSON.stringify(DEFAULT_GECKO));
	const geckoAndroid = JSON.parse(JSON.stringify(DEFAULT_GECKO_ANDROID));
	if (fs.existsSync(MANIFEST_FIREFOX_PATH)) {
		try {
			const prev = JSON.parse(fs.readFileSync(MANIFEST_FIREFOX_PATH, 'utf8'));
			const prevGecko = prev?.browser_specific_settings?.gecko;
			if (prevGecko && typeof prevGecko === 'object') {
				gecko.id = String(prevGecko.id || DEFAULT_GECKO.id);
				if (prevGecko.data_collection_permissions) {
					gecko.data_collection_permissions = prevGecko.data_collection_permissions;
				}
			}
		} catch (_e) {
			// keep defaults
		}
	}
	if (!gecko.data_collection_permissions) {
		gecko.data_collection_permissions = JSON.parse(
			JSON.stringify(DEFAULT_GECKO.data_collection_permissions)
		);
	}
	// Firefox は一時アドオン等で service_worker が無効なことがあるため scripts に変換する
	if (out.background && typeof out.background === 'object') {
		const sw = out.background.service_worker;
		if (typeof sw === 'string' && sw) {
			out.background = { scripts: [sw] };
		} else {
			delete out.background.type;
			delete out.background.service_worker;
		}
	}
	out.browser_specific_settings = {
		gecko,
		gecko_android: geckoAndroid,
	};
	if (typeof out.description === 'string') {
		out.description = out.description.replace(/\s*Chrome\s*拡張/g, 'ブラウザ拡張');
	}
	fs.writeFileSync(MANIFEST_FIREFOX_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
	console.log(`Wrote ${path.relative(ROOT, MANIFEST_FIREFOX_PATH)}`);
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
	writeFirefoxManifestFromChrome();
}

function checkSync() {
	const { json } = readManifest();
	const manifestVersion = json.version;
	parseVersion(manifestVersion);
	if (fs.existsSync(MANIFEST_FIREFOX_PATH)) {
		const firefoxJson = JSON.parse(fs.readFileSync(MANIFEST_FIREFOX_PATH, 'utf8'));
		if (firefoxJson.version !== manifestVersion) {
			throw new Error(
				`manifest.firefox.json version (${firefoxJson.version}) != manifest.json (${manifestVersion})`
			);
		}
		if (!firefoxJson.browser_specific_settings?.gecko?.id) {
			throw new Error('manifest.firefox.json に gecko.id がありません');
		}
		const dcp = firefoxJson.browser_specific_settings?.gecko?.data_collection_permissions;
		if (!dcp || !Array.isArray(dcp.required) || dcp.required.length === 0) {
			throw new Error('manifest.firefox.json に data_collection_permissions.required がありません');
		}
	}
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
