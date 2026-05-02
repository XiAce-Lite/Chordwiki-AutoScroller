'use strict';

const DEFAULT_DURATION_MS = 240000;
const STORAGE_NS = 'cw_as_v10';
const STORAGE_UI_VISIBLE_KEY = 'cw_ui_visible';
const STORAGE_UI_POS_KEY = 'cw_ui_pos';
const STORAGE_UI_COLLAPSED_KEY = 'cw_ui_collapsed';
const MARKER_MODEL = 'p-line-v1';
const MAX_MINUTES = 99;
const SP_MIN = 0.5;
const SP_MAX = 3;
const FOCUS_RATIO = 0.42;
const VARIABLE_FOCUS_RATIO_START = 0.2;
const VARIABLE_FOCUS_RATIO_FINAL = 0.4;
const VARIABLE_LEAD_IN_MS = 1000;
const MANUAL_INTERACTION_HOLD_MS = 260;
const EDGE = 34;
const EDGE_BASE = 200;
const EDGE_MAX = 720;
const SPEED_NUDGE = 0.05;
const FOCUS_OVERLAY_MIN_LINES = 4;
const FOCUS_OVERLAY_MIN_SCROLL_PX = 72;
function clamp(v, a, b) {
	return Math.max(a, Math.min(b, v));
}
function vmax() {
	return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}
function pad2(n) {
	return String(n).padStart(2, '0');
}
function fmtDur(ms0) {
	const ms = clamp(ms0 | 0, 0, 1e12);
	const s = clamp(Math.round(ms / 1000), 0, MAX_MINUTES * 60 + 59);
	const m = Math.floor(s / 60);
	const sec = s % 60;
	return pad2(m) + ':' + pad2(sec);
}

function fmtSpeed(spd0) {
	const spd = clamp(Number(spd0) || 1, SP_MIN, SP_MAX);
	return spd.toFixed(2) + 'x';
}
function stripTitle(txt) {
	const t = String(txt || '').trim().replace(/^[ 　]+|[ 　]+$/g, '');
	if (!t) return '';
	return t.replace(/[（(].*$/, '').trim();
}

function normalizeMetaText(txt) {
	return String(txt || '')
		.replace(/[\t\r\n]+/g, ' ')
		.replace(/[ ]{2,}/g, ' ')
		.replace(/\u3000{2,}/g, '　')
		.trim();
}

function getSongTitleSourceText() {
	const titleEl = document.querySelector('h1.title');
	if (titleEl?.textContent) {
		return normalizeMetaText(titleEl.textContent);
	}

	const fallback = /\{\s*(title|t)\s*:\s*([^\}\n]+)\}/i.exec(document.body.innerText || '');
	return fallback ? normalizeMetaText(fallback[2]) : '';
}

function getSongSubtitleSourceText() {
	const subtitleEl = document.querySelector('h2.subtitle');
	if (subtitleEl?.textContent) {
		return normalizeMetaText(subtitleEl.textContent);
	}

	const fallback = /\{\s*(subtitle|st)\s*:\s*([^\}\n]+)\}/i.exec(document.body.innerText || '');
	return fallback ? normalizeMetaText(fallback[2]) : '';
}

function extractSongTitle() {
	const source = getSongTitleSourceText();
	if (!source) {
		return null;
	}

	const stripped = stripTitle(source);
	return stripped || null;
}

function trimArtistBoundaryText(value) {
	return String(value || '')
		.replace(/^[\s\u3000:：・]+/, '')
		.replace(/[\s\u3000]+$/, '')
		.trim();
}

function findArtistStartIndex(subtitle) {
	const patterns = [
		/歌[：:]/,
		/歌・(?:作詞・作曲|作詞|作曲|編曲)[：:]/,
		/歌・/
	];

	for (const pattern of patterns) {
		const match = pattern.exec(subtitle);
		if (match && typeof match.index === 'number') {
			return match.index + match[0].length;
		}
	}

	return 0;
}

function findArtistEndIndex(subtitle, startIndex) {
	const roleKanji = '(?:作詞|作曲|編曲|補作詞|訳詞)';
	const roleAlpha = '(?:Words|Music|Arranged|Produced)';
	const compoundKanji = `${roleKanji}(?:・${roleKanji})*`;
	const rolePattern = new RegExp(
		`(?:^|[\\s\\u3000])(?:${compoundKanji}|${roleAlpha})\\s*[：:]`,
		'i'
	);
	const target = subtitle.slice(Math.max(0, startIndex));
	const match = rolePattern.exec(target);
	if (!match || typeof match.index !== 'number') {
		return subtitle.length;
	}

	return startIndex + match.index;
}

function extractSongArtist() {
	const subtitle = getSongSubtitleSourceText();
	if (!subtitle) return null;

	const startIndex = findArtistStartIndex(subtitle);
	const endIndex = findArtistEndIndex(subtitle, startIndex);
	const candidate = trimArtistBoundaryText(subtitle.slice(startIndex, endIndex));
	return candidate || null;
}
function isLikelySongPage() {
	if (!/^ja\.chordwiki\.org$/i.test(window.location.hostname)) {
		return false;
	}

	if (window.location.pathname === '/' || window.location.pathname === '') {
		return false;
	}

	const bodyText = document.body?.innerText || '';
	if (document.querySelector('h1.title') || /\{\s*(title|t)\s*:/i.test(bodyText)) {
		return true;
	}

	const lineCount = document.querySelectorAll('p.line, .comment, p[class*="line"]').length;
	return lineCount >= 2;
}
function getSheetEl() {
	return (
		document.querySelector('article') ||
		document.querySelector('#body') ||
		document.querySelector('main') ||
		document.body
	);
}
function docBounds(el) {
	const r = el.getBoundingClientRect();
	return { t: r.top + window.scrollY, b: r.bottom + window.scrollY };
}
function sheetLines(el) {
	return [...el.querySelectorAll('p.line')].filter((node) =>
		node instanceof HTMLParagraphElement
		&& node.classList.length === 1
		&& node.classList.contains('line')
	);
}
function storageKeyPage() {
	return STORAGE_NS + ':' + window.location.pathname;
}

/** @typedef {{sx:number,ex:number,ms:number,spd:number}} PersistShapeJson */
const SC = /** @type {Record<string, any>} */ ({
	sx: 0,
	ex: 0,
	dsy: 0,
	dey: 0,
	ms: DEFAULT_DURATION_MS,
	src: 'default',
	spd: 1,
	variable: true,
	varCurve: null,
	elapsed: 0,
	tPlay: 0,
	tPrev: 0,
	playing: false,
	frame: null,
	drag: null,
	btnPlay: null,
	statusEl: null,
	remainEl: null,
	mLay: null,
	mStart: null,
	mEnd: null,
	uiRoot: null,
	sheetEl: null,
	isSongPage: false,
	uiVisible: true,
	rewindPending: false,
	userScrollOverrideUntilMs: 0,
	hasScrollStarted: false,
	phase: 'main',
	phaseElapsedMs: 0,
	focusRatioCurrent: VARIABLE_FOCUS_RATIO_FINAL,
	playStartScrollY: 0,
	virtualScrollY: 0,
	debugQueryOutput: false,
	debugUrlEl: null,
	queryTitle: '',
	queryArtist: '',
	queryPairEl: null,
	focusOverlayEl: null,
	highlightEnabled: false,
});

function loadUiVisibleState() {
	try {
		return localStorage.getItem(STORAGE_UI_VISIBLE_KEY) === '1';
	} catch (e) {
		void e;
		return false;
	}
}

function saveUiVisibleState(visible) {
	try {
		localStorage.setItem(STORAGE_UI_VISIBLE_KEY, visible ? '1' : '0');
	} catch (e) {
		void e;
	}
}

function applyDefaults() {
	const sh = getSheetEl();
	const b = docBounds(sh);
	SC.dsy = b.t;
	SC.dey = b.b;
	const topLines = sheetLines(sh);
	if (topLines.length) {
		const r0 = topLines[0].getBoundingClientRect();
		SC.dsy = Math.round(r0.top + window.scrollY);
	}
	const chordPLines = [...sh.querySelectorAll('p.line')].filter((lineEl) =>
		lineEl instanceof HTMLParagraphElement && lineEl.querySelector('span.chord')
	);
	if (chordPLines.length) {
		const r1 = chordPLines[chordPLines.length - 1].getBoundingClientRect();
		SC.dey = Math.round(r1.bottom + window.scrollY);
	}
}

function clampMark(which, yy) {
	const b = docBounds(getSheetEl());
	let y = clamp(yy, b.t, b.b);
	if (which === 's') {
		y = Math.min(y, Math.max(SC.ex - 44, b.t));
	} else {
		y = Math.max(y, Math.min(SC.sx + 44, b.b));
	}
	return y;
}

function yScrollStartFocus() {
	return clamp(Math.round(SC.sx - window.innerHeight * FOCUS_RATIO), 0, vmax());
}

function yScrollEndStop() {
	return clamp(Math.round(SC.ex - window.innerHeight * 0.88), 0, vmax());
}

function normalizeMinSec(ma, sb) {
	let m = parseInt(String(ma || '0'), 10);
	let s = parseInt(String(sb || '0'), 10);
	if (!Number.isFinite(m)) m = 0;
	if (!Number.isFinite(s)) s = 0;
	while (s >= 60) {
		m += 1;
		s -= 60;
	}
	while (s < 0) {
		m -= 1;
		s += 60;
	}
	m = clamp(m, 0, MAX_MINUTES);
	let totalSec = (m * 60) + s;
	totalSec = clamp(totalSec, 1, MAX_MINUTES * 60 + 59);
	const nm = Math.floor(totalSec / 60);
	const ns = totalSec % 60;
	return { m: nm, sec: ns, totalMs: totalSec * 1000 };
}

function saveState() {
	try {
		localStorage.setItem(
			storageKeyPage(),
			JSON.stringify({
				markerModel: MARKER_MODEL,
				sx: SC.sx,
				ex: SC.ex,
				ms: SC.ms,
				spd: SC.spd,
				variable: SC.variable ? 1 : 0,
				highlight: SC.highlightEnabled ? 1 : 0,
			})
		);
	} catch (e) {
		void e;
	}
}

function restoreState() {
	try {
		const raw = localStorage.getItem(storageKeyPage());
		if (!raw) return false;
		const o = JSON.parse(raw);
		if (!o) return false;
		const markerRestored =
			o.markerModel === MARKER_MODEL
			&& typeof o.sx === 'number'
			&& typeof o.ex === 'number';
		if (markerRestored) {
			SC.sx = o.sx;
			SC.ex = o.ex;
		}
		SC.ms = o.ms || DEFAULT_DURATION_MS;
		SC.spd = clamp(o.spd ?? 1, SP_MIN, SP_MAX);
		SC.variable = o.variable !== 0;
		SC.highlightEnabled = o.highlight !== 0;
		return markerRestored;
	} catch (e) {
		return false;
	}
}

const VAR_WEIGHT_FLOOR = 0.12;

// 歌詞文字数カウントで除外する記号類
const LYRIC_SYMBOL_RE = /[\s\u0000-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u00BF\u30FB\u30FC\u2010-\u2027\u2030-\u205E\u2060-\u206F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/g;

function lyricLenFromEl(el) {
	if (!(el instanceof Element)) return 0;
	// chord span を除いたテキストのみ集計（参考実装と同方式）
	let total = 0;
	el.querySelectorAll('span:not(.chord)').forEach((node) => {
		total += String(node.textContent || '').replace(LYRIC_SYMBOL_RE, '').length;
	});
	// span 構造がない場合（fallback）
	if (total === 0) {
		total = String(el.innerText || '').replace(LYRIC_SYMBOL_RE, '').length;
	}
	return total;
}

function normalizeVarWeights(rawWeights) {
	if (!rawWeights.length) return [];
	const min = Math.min(...rawWeights);
	const max = Math.max(...rawWeights);
	if (!Number.isFinite(min) || !Number.isFinite(max) || Math.abs(max - min) < 0.0001) {
		return rawWeights.map(() => Math.max(VAR_WEIGHT_FLOOR, 1));
	}
	return rawWeights.map((v) => {
		const n = clamp((v - min) / (max - min), 0, 1);
		return VAR_WEIGHT_FLOOR + n * (1 - VAR_WEIGHT_FLOOR);
	});
}

/** @returns {null | {cumMs:number[], ytab:number[]}} */
function buildVarCurve() {
	const sh = getSheetEl();
	const entries = [];
	for (const el of sheetLines(sh)) {
		const r = el.getBoundingClientRect();
		const centerY = (r.top + r.bottom) / 2 + window.scrollY;
		if (centerY < SC.sx - 14 || centerY > SC.ex + 14) continue;
		entries.push({
			y: centerY,
			lz: lyricLenFromEl(el),
			h: 0, // unused
		});
	}
	if (entries.length < 2) return null;

	// 各エントリのウェイト計算（歌詞文字数のみ）
	const lyricRaw = entries.map((e) => e.lz);
	const finalWeights = normalizeVarWeights(lyricRaw);

	// セグメント間のウェイトでタイムライン構築（参考実装と同方式）
	const segWeights = finalWeights.slice(0, -1);
	const sum = Math.max(1e-6, segWeights.reduce((a, b) => a + b, 0));
	const cumMs = [0];
	const ytab = entries.map((e) => e.y);
	let acc = 0;
	for (let i = 0; i < segWeights.length; i++) {
		acc += (segWeights[i] / sum) * SC.ms;
		cumMs.push(acc);
	}
	return { cumMs, ytab };
}

function interpVar(curve, elapsedMs0) {
	const cum = curve.cumMs;
	const y = curve.ytab;
	const cap = cum[cum.length - 1] || SC.ms;
	const e = clamp(elapsedMs0, 0, cap + 1e-6);
	let k = 0;
	while (k + 1 < cum.length && e >= cum[k + 1] - 1e-9) {
		k++;
	}
	const t0 = cum[k];
	const t1 = cum[k + 1] || cum[k];
	const r = Math.abs(t1 - t0) < 1e-9 ? 0 : clamp((e - t0) / (t1 - t0), 0, 1);
	const nextY = k + 1 < y.length ? y[k + 1] : y[k];
	return y[k] + (nextY - y[k]) * r;
}

function interpVarElapsed(curve, focusY0) {
	const cum = curve?.cumMs;
	const y = curve?.ytab;
	if (!Array.isArray(cum) || !Array.isArray(y) || y.length < 2 || cum.length < 2) {
		return 0;
	}

	const focusY = Number(focusY0) || 0;
	let bestMs = 0;
	let bestDist = Number.POSITIVE_INFINITY;

	for (let i = 0; i < y.length - 1; i += 1) {
		const y0 = Number(y[i]) || 0;
		const y1 = Number(y[i + 1]) || y0;
		const t0 = Number(cum[i]) || 0;
		const t1 = Number(cum[i + 1]) || t0;

		let ratio = 0;
		if (Math.abs(y1 - y0) > 0.0001) {
			ratio = clamp((focusY - y0) / (y1 - y0), 0, 1);
		}

		const projectedY = y0 + ((y1 - y0) * ratio);
		const dist = Math.abs(projectedY - focusY);
		const candidateMs = t0 + ((t1 - t0) * ratio);

		if (dist < bestDist) {
			bestDist = dist;
			bestMs = candidateMs;
		}
	}

	return clamp(bestMs, 0, Math.max(0, SC.ms));
}

function refreshVarCurve() {
	SC.varCurve = SC.variable ? buildVarCurve() : null;
}

function scrollToProg(u, focusRatio) {
	const u2 = clamp(u, 0, 1);
	let targetY;
	if (SC.variable && SC.varCurve) {
		const fy = interpVar(SC.varCurve, u2 * SC.ms);
		const ratio = clamp(
			typeof focusRatio === 'number' ? focusRatio : VARIABLE_FOCUS_RATIO_FINAL,
			0,
			1
		);
		targetY = clamp(fy - window.innerHeight * ratio, 0, vmax());
	} else {
		const a = yScrollStartFocus();
		const b = yScrollEndStop();
		targetY = clamp(a + (b - a) * u2, 0, vmax());
	}
	window.scrollTo({ top: targetY, behavior: 'instant' });
	SC.virtualScrollY = targetY;
}

function stopPlay(msg, options) {
	const reachedEnd = options?.reachedEnd === true;
	if (SC.frame) {
		cancelAnimationFrame(SC.frame);
		SC.frame = null;
	}
	SC.playing = false;
	SC.elapsed = 0;
	SC.tPrev = 0;
	SC.hasScrollStarted = false;
	SC.phase = 'main';
	SC.phaseElapsedMs = 0;
	SC.focusRatioCurrent = VARIABLE_FOCUS_RATIO_FINAL;
	SC.userScrollOverrideUntilMs = 0;
	SC.virtualScrollY = 0;
	SC.rewindPending = reachedEnd;
	setFocusOverlayActive(false);
	if (typeof msg === 'string' && SC.statusEl) {
		SC.statusEl.textContent = msg;
		SC.statusEl.dataset.tone = 'info';
	}
	if (SC.btnPlay) {
		SC.btnPlay.textContent = '開始';
		SC.btnPlay.classList.toggle('cw-playing', false);
	}
	if (SC.remainEl) {
		SC.remainEl.textContent = fmtDur(SC.ms);
	}
}

const END_STOP_BUFFER_PX = 10;

function visibleEndEnough() {
	if (!(SC.mEnd instanceof Element)) return false;
	const r = SC.mEnd.getBoundingClientRect();
	return r.top <= window.innerHeight - END_STOP_BUFFER_PX;
}

function frame(nowMs) {
	if (!SC.playing) {
		return;
	}
	if (!SC.tPrev) {
		SC.tPrev = nowMs;
	}

	const dtMs = clamp(nowMs - SC.tPrev, 0, 120);
	SC.tPrev = nowMs;

	if (nowMs < (SC.userScrollOverrideUntilMs || 0)) {
		SC.virtualScrollY = window.scrollY;
		updatePlayingStatusText();
		if (SC.remainEl) SC.remainEl.textContent = fmtDur(Math.max(0, SC.ms - SC.elapsed));
		SC.frame = requestAnimationFrame(frame);
		return;
	}

	// エンドマーカーが見えたら、カウントダウンより優先して停止（フレーム先頭チェック）
	if (visibleEndEnough()) {
		stopPlay('エンドまで到達しました。クリックで先頭へ戻ります。', { reachedEnd: true });
		return;
	}

	const speedFactor = clamp(SC.spd || 1, SP_MIN, SP_MAX);
	SC.elapsed = Math.min(SC.ms, SC.elapsed + dtMs * speedFactor);

	if (SC.elapsed >= SC.ms) {
		stopPlay(SC.statusEl ? '終了しました。クリックで先頭へ戻ります。' : null, { reachedEnd: true });
		scrollToProg(1, SC.variable ? VARIABLE_FOCUS_RATIO_FINAL : FOCUS_RATIO);
		return;
	}

	// ── lead-in フェーズ（可変モード専用）───────────────────────────────
	// C案: elapsed に対応するスクロール位置が初期位置を超えた瞬間に本編へ移行。
	// それまでは画面を動かさず「遅延開始中」を表示し続ける。
	if (SC.variable && SC.phase === 'lead-in') {
		const focusY = SC.varCurve ? interpVar(SC.varCurve, SC.elapsed) : SC.sx;
		const targetY = clamp(focusY - window.innerHeight * VARIABLE_FOCUS_RATIO_FINAL, 0, vmax());
		if (targetY > SC.playStartScrollY + 2) {
			// スクロールが必要な行に到達 → 本編へ移行（fall through）
			SC.phase = 'main';
			SC.focusRatioCurrent = VARIABLE_FOCUS_RATIO_FINAL;
			setFocusOverlayActive(true);
		} else {
			// まだ初期表示範囲内 → スクロールなし
			updatePlayingStatusText();
			if (SC.remainEl) SC.remainEl.textContent = fmtDur(Math.max(0, SC.ms - SC.elapsed));
			SC.frame = requestAnimationFrame(frame);
			return;
		}
	}
	// ─────────────────────────────────────────────────────────────────────

	if (!SC.hasScrollStarted) SC.hasScrollStarted = true;
	const u = SC.elapsed / SC.ms;
	scrollToProg(u, SC.variable ? VARIABLE_FOCUS_RATIO_FINAL : FOCUS_RATIO);
	updatePlayingStatusText();
	if (SC.remainEl) SC.remainEl.textContent = fmtDur(Math.max(0, SC.ms - SC.elapsed));

	// スクロール後の再チェック（スクロールで新たに見えた場合）
	if (visibleEndEnough()) {
		stopPlay('エンドまで到達しました。クリックで先頭へ戻ります。', { reachedEnd: true });
		return;
	}

	SC.frame = requestAnimationFrame(frame);
}

function setStatus(text, tone) {
	if (!SC.statusEl) return;
	SC.statusEl.textContent = text || '';
	SC.statusEl.dataset.tone = tone || 'info';
}

function markerLeftPx() {
	const sh = getSheetEl();
	const r = sh.getBoundingClientRect();
	return Math.max(6, Math.round(r.left - 56));
}

function placeMarkers() {
	if (!(SC.mLay instanceof Element)) return;
	SC.mLay.style.setProperty('--cw-marker-left', markerLeftPx() + 'px');
	if (SC.mStart instanceof Element) {
		SC.mStart.style.top = Math.round(SC.sx - window.scrollY) + 'px';
	}
	if (SC.mEnd instanceof Element) {
		SC.mEnd.style.top = Math.round(SC.ex - window.scrollY) + 'px';
	}
}

function setMarkerXY(which, docY, persist) {
	const next = clampMark(which === 's' ? 's' : 'e', docY);
	if (which === 's') {
		SC.sx = next;
	} else {
		SC.ex = next;
	}
	refreshVarCurve();
	placeMarkers();
	setFocusOverlayActive(SC.playing && SC.phase !== 'lead-in');
	if (persist) {
		saveState();
		setStatus('マーカーを保存しました', 'success');
	}
}

function stopMarkerEdgeAnim() {
	const d = SC.drag;
	if (!d) return;
	if (d.timer) {
		clearTimeout(d.timer);
		d.timer = 0;
	}
}

function markerEdgeSpeed(clientY) {
	let dir = 0;
	let ratio = 0;
	if (clientY < EDGE) {
		dir = -1;
		ratio = (EDGE - clientY) / EDGE;
	} else if (clientY > window.innerHeight - EDGE) {
		dir = 1;
		ratio = (clientY - (window.innerHeight - EDGE)) / EDGE;
	}
	ratio = clamp(ratio, 0, 1);
	if (!dir) return 0;
	return dir * (EDGE_BASE + (EDGE_MAX - EDGE_BASE) * ratio * ratio);
}


function runMarkerEdgeTick() {
	const d = SC.drag;
	if (!d || !d.timer) return;
	d.timer = 0;
	const now = performance.now();
	const prev = d.lastNow || now;
	const dt = Math.max(0, (now - prev) / 1000);
	d.lastNow = now;
	const vx = markerEdgeSpeed(d.clientY);
	const prevY = window.scrollY;
	const ny = clamp(prevY + vx * dt, 0, vmax());
	if (Math.abs(ny - prevY) > 0.5) {
		window.scrollTo({ top: ny, behavior: 'instant' });
	}
	const docY = d.clientY + window.scrollY - d.off;
	setMarkerXY(d.which, docY, false);
	if (Math.abs(vx) > 8) {
		d.timer = setTimeout(runMarkerEdgeTick, 16);
	}
}

function onMarkerDown(ev, which) {
	ev.preventDefault();
	SC.drag = {
		pid: ev.pointerId,
		which: which,
		off: ev.clientY + window.scrollY - (which === 's' ? SC.sx : SC.ex),
		clientY: ev.clientY,
		lastNow: 0,
		timer: 0,
	};
	ev.currentTarget.setPointerCapture(ev.pointerId);
	ev.currentTarget.classList.add('cw-marker-drag');
	document.body.classList.add('cw-drag-marker');
}

function onMarkerMove(ev) {
	const d = SC.drag;
	if (!d || d.pid !== ev.pointerId) return;
	d.clientY = ev.clientY;
	setMarkerXY(d.which, ev.clientY + window.scrollY - d.off, false);
	const vx = markerEdgeSpeed(ev.clientY);
	stopMarkerEdgeAnim();
	if (Math.abs(vx) > 8) {
		d.lastNow = performance.now();
		d.timer = setTimeout(runMarkerEdgeTick, 16);
	}
}

function onMarkerUp(ev) {
	const d = SC.drag;
	if (!d || d.pid !== ev.pointerId) return;
	stopMarkerEdgeAnim();
	ev.currentTarget.releasePointerCapture(ev.pointerId);
	ev.currentTarget.classList.remove('cw-marker-drag');
	document.body.classList.remove('cw-drag-marker');
	SC.drag = null;
	saveState();
	setStatus('マーカーを保存しました', 'success');
}

function onResizeLayout() {
	const prevSy = SC.dsy;
	const prevEy = SC.dey;
	applyDefaults();
	const dTop = SC.dsy - prevSy;
	const dBot = SC.dey - prevEy;
	if (Math.abs(dTop) > 0.5 || Math.abs(dBot) > 0.5) {
		SC.sx += dTop;
		SC.ex += dBot;
		SC.sx = clampMark('s', SC.sx);
		SC.ex = clampMark('e', SC.ex);
	}
	refreshVarCurve();
	placeMarkers();
	updateFocusOverlayGeometry();
	setFocusOverlayActive(SC.playing && SC.phase !== 'lead-in');
}

function estimateLineHeightPx() {
	const lines = sheetLines(getSheetEl());
	const heights = [];
	for (const line of lines.slice(0, 24)) {
		const rectH = Math.round(line.getBoundingClientRect().height);
		if (rectH >= 10 && rectH <= 160) {
			heights.push(rectH);
		}
	}
	if (!heights.length) {
		return 28;
	}
	heights.sort((a, b) => a - b);
	return heights[Math.floor(heights.length / 2)] || 28;
}

function updateFocusOverlayGeometry() {
	if (!(SC.focusOverlayEl instanceof Element)) return;
	const lineHeight = estimateLineHeightPx();
	const highlightH = clamp(Math.round(lineHeight * 11), 120, Math.max(140, window.innerHeight - 80));
	const top = Math.max(0, Math.round((window.innerHeight - highlightH) / 2));
	SC.focusOverlayEl.style.setProperty('--cw-focus-top', top + 'px');
	SC.focusOverlayEl.style.setProperty('--cw-focus-h', highlightH + 'px');
}

function countLinesInMarkerRange() {
	const lines = sheetLines(getSheetEl());
	if (!lines.length) return 0;
	let count = 0;
	for (const line of lines) {
		const r = line.getBoundingClientRect();
		const centerY = (r.top + r.bottom) / 2 + window.scrollY;
		if (centerY >= SC.sx - 14 && centerY <= SC.ex + 14) {
			count += 1;
		}
	}
	return count;
}

function canUseFocusOverlay() {
	if (!SC.highlightEnabled) return false;
	if (vmax() < FOCUS_OVERLAY_MIN_SCROLL_PX) return false;
	const lineCount = countLinesInMarkerRange();
	if (lineCount < FOCUS_OVERLAY_MIN_LINES) return false;
	const scrollRange = Math.abs(yScrollEndStop() - yScrollStartFocus());
	const rangeThreshold = Math.max(FOCUS_OVERLAY_MIN_SCROLL_PX, Math.round(estimateLineHeightPx() * 2));
	return scrollRange >= rangeThreshold;
}

function setFocusOverlayActive(active) {
	if (!(SC.focusOverlayEl instanceof Element)) return;
	const visible = active && SC.uiVisible && canUseFocusOverlay();
	SC.focusOverlayEl.style.display = visible ? '' : 'none';
}

function syncSpeedUi() {
	const sp = clamp(SC.spd, SP_MIN, SP_MAX);
	SC.spd = sp;
	if (SC.speedRangeEl) SC.speedRangeEl.value = String(sp);
	if (SC.speedLabelEl) SC.speedLabelEl.textContent = sp.toFixed(2) + 'x';
	const ds = SC.speedResetBtn;
	if (ds) ds.disabled = Math.abs(sp - 1) < 0.001;
	if (SC.speedLabelEl) {
		let st = 'normal';
		if (sp > 1.001) st = 'fast';
		else if (sp < 0.999) st = 'slow';
		SC.speedLabelEl.dataset.speedState = st;
	}
}

function syncDurationInputs() {
	const sec = clamp(Math.round(SC.ms / 1000), 1, MAX_MINUTES * 60 + 59);
	const mi = Math.floor(sec / 60);
	const ss = sec % 60;
	if (SC.inMin) SC.inMin.value = pad2(mi);
	if (SC.inSec) SC.inSec.value = pad2(ss);
	if (SC.estDurEl) SC.estDurEl.textContent = fmtDur(SC.ms);
	if (SC.srcEl) SC.srcEl.textContent = sourceLabel(SC.src);
}

function sourceLabel(s) {
	const map = { itunes: 'iTunes', musicbrainz: 'MusicBrainz', default: '該当なし', none: '' };
	return map[s] || '';
}

function getVariableFocusRatio(elapsedMs) {
	if (!SC.hasScrollStarted) {
		return VARIABLE_FOCUS_RATIO_START;
	}
	const progress = clamp((Number(elapsedMs) || 0) / VARIABLE_LEAD_IN_MS, 0, 1);
	return VARIABLE_FOCUS_RATIO_START + ((VARIABLE_FOCUS_RATIO_FINAL - VARIABLE_FOCUS_RATIO_START) * progress);
}

function updatePlayingStatusText() {
	if (!SC.playing) {
		return;
	}

	const remainingMs = Math.max(0, SC.ms - SC.elapsed);
	const baseMessage = `${fmtDur(remainingMs)} · ${fmtSpeed(SC.spd)}`;
	if (SC.variable && SC.phase === 'lead-in') {
		setStatus(`Playing · 遅延開始中 · ${baseMessage}`, 'lead-in');
		return;
	}

	setStatus(`Playing · ${baseMessage}`, 'info');
}

function setDebugQueryOutputEnabled(enabled) {
	SC.debugQueryOutput = enabled === true;
	if (!SC.debugQueryOutput && SC.debugUrlEl) {
		SC.debugUrlEl.hidden = true;
		SC.debugUrlEl.textContent = '';
	}
}

function showDurationDebugUrl(provider, url) {
	if (!SC.debugQueryOutput || !SC.debugUrlEl) {
		return;
	}

	SC.debugUrlEl.hidden = false;
	SC.debugUrlEl.textContent = `Debug ${String(provider || '').toUpperCase()} URL: ${String(url || '')}`;
}

function updateQueryPairDisplay() {
	if (!SC.queryPairEl) {
		return;
	}

	const title = String(SC.queryTitle || '').trim();
	const artist = String(SC.queryArtist || '').trim();
	SC.queryPairEl.textContent = `${title}:${artist}`;
}

function elapsedFromScrollY(scrollY) {
	const y = Number.isFinite(scrollY) ? scrollY : window.scrollY;

	if (SC.variable && SC.varCurve) {
		const focusY = y + (window.innerHeight * VARIABLE_FOCUS_RATIO_FINAL);
		return clamp(interpVarElapsed(SC.varCurve, focusY), 0, SC.ms);
	}

	const startY = yScrollStartFocus();
	const endY = yScrollEndStop();
	const range = Math.max(1, endY - startY);
	const ratio = clamp((y - startY) / range, 0, 1);
	return clamp(ratio * SC.ms, 0, SC.ms);
}

function syncPlaybackFromScrollY(scrollY) {
	if (!SC.playing) {
		return;
	}

	const y = Number.isFinite(scrollY) ? scrollY : window.scrollY;
	const nextElapsedMs = elapsedFromScrollY(y);
	const nowMs = performance.now();
	SC.elapsed = nextElapsedMs;
	SC.tPrev = nowMs;
	SC.virtualScrollY = y;
	SC.hasScrollStarted = true;
	SC.phase = 'main';
	updatePlayingStatusText();
}

function applyDurationFromInputs(notify, opts) {
	let mRaw = SC.inMin?.value;
	let sRaw = SC.inSec?.value;
	if (opts?.borrowFromOne === true) {
		const mNum = parseInt(String(mRaw || '0'), 10);
		const sNum = parseInt(String(sRaw || '0'), 10);
		if (Number.isFinite(mNum) && Number.isFinite(sNum) && sNum === 0) {
			if (mNum > 0) {
				mRaw = String(mNum - 1);
				sRaw = '59';
			} else {
				mRaw = '0';
				sRaw = '1';
			}
		}
	}
	const n = normalizeMinSec(mRaw, sRaw);
	SC.inMin.value = String(n.m);
	SC.inSec.value = String(n.sec);
	SC.ms = Math.max(1000, n.totalMs);
	refreshVarCurve();
	saveState();
	syncDurationInputs();
	if (notify && SC.statusEl) setStatus('曲時間を更新しました', 'info');
}

function presetDur(min0, sec0) {
	if (SC.inMin) SC.inMin.value = String(min0);
	if (SC.inSec) SC.inSec.value = String(sec0);
	applyDurationFromInputs(true);
}

function resetMarkersUi() {
	applyDefaults();
	SC.sx = SC.dsy;
	SC.ex = SC.dey;
	refreshVarCurve();
	placeMarkers();
	setFocusOverlayActive(SC.playing && SC.phase !== 'lead-in');
	saveState();
	setStatus('マーカーを既定位置へ', 'info');
}

function resetSpeedUi() {
	SC.spd = 1;
	syncSpeedUi();
	saveState();
	chrome.runtime.sendMessage({ type: 'adjustSpeed', value: SC.spd }, () => void chrome.runtime.lastError);
}

function startPlay() {
	if (SC.playing) return;
	refreshVarCurve();
	if (SC.ex <= SC.sx + 12) {
		setStatus('エンドをスタートより下に置いてください', 'warn');
		return;
	}
	if (SC.ms < 800) {
		setStatus('曲時間が短すぎます', 'warn');
		return;
	}

	const startScrollY = yScrollStartFocus();
	const isNearStart = Math.abs(window.scrollY - startScrollY) <= 30;
	const shouldStartFromMarker = SC.rewindPending || isNearStart;

	SC.playing = true;
	SC.tPrev = 0;
	SC.hasScrollStarted = false;
	SC.userScrollOverrideUntilMs = 0;

	if (shouldStartFromMarker) {
		SC.elapsed = 0;
		if (SC.variable && SC.varCurve) {
			// lead-in: 先頭歌詞を FOCUS_RATIO_FINAL の位置に表示して固定
			const startFocusY = interpVar(SC.varCurve, 0);
			const leadInStartY = clamp(startFocusY - window.innerHeight * VARIABLE_FOCUS_RATIO_FINAL, 0, vmax());
			window.scrollTo({ top: leadInStartY, behavior: 'instant' });
			SC.virtualScrollY = leadInStartY;
			SC.playStartScrollY = leadInStartY;
			SC.phase = 'lead-in';
			SC.phaseElapsedMs = 0;
			SC.focusRatioCurrent = VARIABLE_FOCUS_RATIO_FINAL;
		} else {
			SC.phase = 'main';
			SC.phaseElapsedMs = 0;
			SC.focusRatioCurrent = FOCUS_RATIO;
			scrollToProg(0, FOCUS_RATIO);
			SC.playStartScrollY = SC.virtualScrollY;
		}
	} else {
		SC.phase = 'main';
		SC.phaseElapsedMs = 0;
		SC.focusRatioCurrent = VARIABLE_FOCUS_RATIO_FINAL;
		SC.hasScrollStarted = true;
		SC.playStartScrollY = window.scrollY;
		SC.virtualScrollY = window.scrollY;
		syncPlaybackFromScrollY(window.scrollY);
	}

	if (SC.btnPlay) {
		SC.btnPlay.textContent = '停止';
		SC.btnPlay.classList.toggle('cw-playing', true);
	}
	updateFocusOverlayGeometry();
	setFocusOverlayActive(SC.phase !== 'lead-in');
	updatePlayingStatusText();
	SC.frame = requestAnimationFrame(frame);
	saveState();
}

function togglePlay() {
	if (SC.playing) {
		stopPlay('停止しました');
	} else {
		SC.rewindPending = false;
		startPlay();
	}
}

function scrollBackToStartByClick() {
	scrollToProg(0);
	SC.rewindPending = false;
	setStatus('先頭へ戻りました。もう一度クリックで開始します。', 'warn');
}

function handlePrimarySheetClick(ev) {
	if (ev.defaultPrevented || ev.button !== 0) return;
	if (!(ev.target instanceof Element)) return;

	if (ev.target.closest('#cw-autoscroll-root, #cw-autoscroll-marker-layer, a, button, input, select, textarea, label')) {
		return;
	}

	if (SC.drag) {
		return;
	}

	if (!SC.playing && SC.rewindPending) {
		scrollBackToStartByClick();
		return;
	}

	togglePlay();
}

function setUiVisibility(visible) {
	SC.uiVisible = visible !== false;
	if (SC.uiRoot) {
		SC.uiRoot.style.display = SC.uiVisible ? '' : 'none';
	}
	if (SC.mLay) {
		SC.mLay.style.display = SC.uiVisible ? '' : 'none';
	}
	setFocusOverlayActive(SC.playing);
	saveUiVisibleState(SC.uiVisible);
}

function toggleUiVisibility() {
	const nextVisible = !SC.uiVisible;
	if (!nextVisible && SC.playing) {
		stopPlay('UIを閉じたため停止しました');
	}
	setUiVisibility(nextVisible);
	return nextVisible;
}

function wireMarkerLayer(layer) {
	SC.mLay = layer;
	SC.mStart = layer.querySelector('[data-cw-marker="start"]');
	SC.mEnd = layer.querySelector('[data-cw-marker="end"]');
	for (const btn of [SC.mStart, SC.mEnd]) {
		if (!btn) continue;
		btn.addEventListener('pointerdown', (e) =>
			onMarkerDown(e, btn.dataset.cwMarker === 'start' ? 's' : 'e'));
		btn.addEventListener('pointermove', onMarkerMove);
		btn.addEventListener('pointerup', onMarkerUp);
		btn.addEventListener('pointercancel', onMarkerUp);
	}
}

function mountUi() {
	if (document.getElementById('cw-autoscroll-root')) return;
	const focusOverlay = document.createElement('div');
	focusOverlay.id = 'cw-autoscroll-focus-overlay';
	focusOverlay.className = 'cw-focus-overlay';

	const layer = document.createElement('div');
	layer.id = 'cw-autoscroll-marker-layer';
	layer.className = 'cw-marker-layer';
	layer.innerHTML =
		'<button type="button" class="cw-marker cw-marker-start" data-cw-marker="start" aria-label="Start">' +
		'<span class="cw-marker-pin"></span><span class="cw-marker-label">Start</span></button>' +
		'<button type="button" class="cw-marker cw-marker-end" data-cw-marker="end" aria-label="End">' +
		'<span class="cw-marker-pin"></span><span class="cw-marker-label">End</span></button>';

	const root = document.createElement('div');
	root.id = 'cw-autoscroll-root';
	root.className = 'cw-autoscroll-ui';
	root.innerHTML =
		'<div class="cw-autoscroll-head">' +
		'<div class="cw-autoscroll-head-main">' +
		'<div class="cw-autoscroll-title">Song Controls</div>' +
		'<div id="cw-status" class="cw-autoscroll-status" data-tone="info">停止中</div>' +
		'</div>' +
		'<button type="button" id="cw-collapse" class="cw-collapse-btn" aria-expanded="true">≫</button>' +
		'</div>' +
		'<div class="cw-autoscroll-body">' +
		'<div class="cw-section-title">オートスクロール</div>' +
		'<div class="cw-duration-row">' +
		'<input id="cw-min" type="number" min="0" max="99" step="1" value="4" inputmode="numeric" />' +
		'<span class="cw-colon">:</span>' +
		'<input id="cw-sec" type="number" min="0" step="1" value="0" inputmode="numeric" />' +
		'<button type="button" id="cw-reset-time" class="cw-inline-reset">↺ Time</button>' +
		'</div>' +
		'<div class="cw-presets">' +
		'<button type="button" class="cw-preset" data-m="3" data-s="0">3:00</button>' +
		'<button type="button" class="cw-preset" data-m="3" data-s="30">3:30</button>' +
		'<button type="button" class="cw-preset" data-m="4" data-s="0">4:00</button>' +
		'<button type="button" class="cw-preset" data-m="4" data-s="30">4:30</button>' +
		'<button type="button" class="cw-preset" data-m="5" data-s="0">5:00</button>' +
		'</div>' +
		'<div class="cw-speed-row">' +
		'<button type="button" id="cw-spd-down">－</button>' +
		'<span id="cw-spd-lbl" class="cw-speed-lbl" data-speed-state="normal">1.00x</span>' +
		'<button type="button" id="cw-spd-up">＋</button>' +
		'<button type="button" id="cw-spd-reset" class="cw-inline-reset">↺ Speed</button>' +
		'</div>' +
		'<div class="cw-speed-hint">再生中のホイール操作でスピードを変更します</div>' +
		'<div class="cw-actions">' +
		'<button type="button" id="cw-play">開始</button>' +
		'<button type="button" id="cw-reset-markers">↺ Marker</button>' +
		'<div class="cw-toggle-stack">' +
		'<label class="cw-var-toggle"><input type="checkbox" id="cw-variable" checked /><span>可変スクロール</span></label>' +
		'<label class="cw-hl-toggle"><input type="checkbox" id="cw-highlight" checked /><span>ハイライト表示</span></label>' +
		'</div>' +
		'</div>' +
		'<div class="cw-est-row">推定時間 <span id="cw-est-dur">--:--</span> <span id="cw-src" class="cw-src"></span> <span id="cw-query-pair" class="cw-query-pair">:</span></div>' +
		'<div class="cw-remain-row">残り時間 <span id="cw-remain">--:--</span></div>' +
		'<div id="cw-debug-url" class="cw-debug-url" hidden></div>' +
		'<div class="cw-est-note">スライダーはページ・ポップアップ共通で速度を変更します</div>' +
		'</div>';

	document.body.appendChild(focusOverlay);
	document.body.appendChild(layer);
	document.body.appendChild(root);
	SC.focusOverlayEl = focusOverlay;
	updateFocusOverlayGeometry();
	setFocusOverlayActive(false);

	wireMarkerLayer(layer);

	SC.statusEl = root.querySelector('#cw-status');
	SC.btnPlay = root.querySelector('#cw-play');
	SC.inMin = root.querySelector('#cw-min');
	SC.inSec = root.querySelector('#cw-sec');
	SC.estDurEl = root.querySelector('#cw-est-dur');
	SC.srcEl = root.querySelector('#cw-src');
	SC.speedRangeEl = null;
	SC.speedLabelEl = root.querySelector('#cw-spd-lbl');
	SC.speedResetBtn = root.querySelector('#cw-spd-reset');
	SC.remainEl = root.querySelector('#cw-remain');
	SC.queryPairEl = root.querySelector('#cw-query-pair');
	SC.debugUrlEl = root.querySelector('#cw-debug-url');
	SC.uiRoot = root;
	updateQueryPairDisplay();

	const UI_RIGHT_MARGIN_PX = 22;
	const headEl = root.querySelector('.cw-autoscroll-head');
	const collapseBtn = root.querySelector('#cw-collapse');
	let drag = null;
	let lastExpandedLeftPx = '';

	function saveUiPosition() {
		if (root.classList.contains('cw-collapsed')) return;
		const left = parseInt(root.style.left, 10);
		const top = parseInt(root.style.top, 10);
		if (!Number.isFinite(left) || !Number.isFinite(top)) return;
		try {
			localStorage.setItem(STORAGE_UI_POS_KEY, JSON.stringify({ x: left, y: top }));
		} catch (e) {
			void e;
		}
	}

	function clampUiInViewport() {
		const maxTop = Math.max(0, window.innerHeight - root.offsetHeight);
		let top = parseInt(root.style.top, 10);
		if (!Number.isFinite(top)) {
			top = Math.round(root.getBoundingClientRect().top);
		}
		root.style.top = clamp(top, 0, maxTop) + 'px';

		if (root.classList.contains('cw-collapsed')) {
			root.style.left = '';
			root.style.right = `max(${UI_RIGHT_MARGIN_PX}px, env(safe-area-inset-right, 0px))`;
			return;
		}

		let left = parseInt(root.style.left, 10);
		if (!Number.isFinite(left)) {
			left = Math.round(root.getBoundingClientRect().left);
		}
		const maxLeft = Math.max(0, window.innerWidth - root.offsetWidth);
		root.style.left = clamp(left, 0, maxLeft) + 'px';
		root.style.right = 'auto';
	}

	// 位置復元（x, y のみ）
	try {
		const pos = JSON.parse(localStorage.getItem(STORAGE_UI_POS_KEY) || 'null');
		if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
			root.style.left = pos.x + 'px';
			root.style.top = pos.y + 'px';
			root.style.right = 'auto';
		}
	} catch (e) {
		void e;
	}

	function onDragMove(ev) {
		if (!drag) return;
		const maxLeft = Math.max(0, window.innerWidth - root.offsetWidth);
		const maxTop = Math.max(0, window.innerHeight - root.offsetHeight);
		const nextLeft = clamp(ev.clientX - drag.offX, 0, maxLeft);
		const nextTop = clamp(ev.clientY - drag.offY, 0, maxTop);
		root.style.left = nextLeft + 'px';
		root.style.top = nextTop + 'px';
		root.style.right = 'auto';
	}

	function onDragEnd() {
		if (!drag) return;
		drag = null;
		document.removeEventListener('pointermove', onDragMove);
		document.removeEventListener('pointerup', onDragEnd);
		document.removeEventListener('pointercancel', onDragEnd);
		root.style.cursor = '';
		document.body.style.cursor = '';
		saveUiPosition();
	}

	headEl?.addEventListener('pointerdown', (ev) => {
		if (ev.button !== 0) return;
		if (!(ev.target instanceof Element)) return;
		if (ev.target.closest('button, input, select, textarea, label, a')) return;
		const rect = root.getBoundingClientRect();
		root.style.left = Math.round(rect.left) + 'px';
		root.style.top = Math.round(rect.top) + 'px';
		root.style.right = 'auto';
		drag = {
			offX: ev.clientX - rect.left,
			offY: ev.clientY - rect.top,
		};
		root.style.cursor = 'move';
		document.body.style.cursor = 'move';
		document.addEventListener('pointermove', onDragMove);
		document.addEventListener('pointerup', onDragEnd);
		document.addEventListener('pointercancel', onDragEnd);
		ev.preventDefault();
	});

	window.addEventListener('resize', () => {
		clampUiInViewport();
		saveUiPosition();
	});

	clampUiInViewport();

	collapseBtn?.addEventListener('click', () => {
		const willCollapse = !root.classList.contains('cw-collapsed');
		if (willCollapse) {
			const rect = root.getBoundingClientRect();
			lastExpandedLeftPx = root.style.left || (Math.round(rect.left) + 'px');
			root.classList.add('cw-collapsed');
			root.style.left = '';
			root.style.right = `max(${UI_RIGHT_MARGIN_PX}px, env(safe-area-inset-right, 0px))`;
			clampUiInViewport();
		} else {
			root.classList.remove('cw-collapsed');
			if (lastExpandedLeftPx) {
				root.style.left = lastExpandedLeftPx;
				root.style.right = 'auto';
			}
			clampUiInViewport();
			saveUiPosition();
		}
		const expanded = !root.classList.contains('cw-collapsed');
		collapseBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
		try {
			localStorage.setItem(STORAGE_UI_COLLAPSED_KEY, expanded ? '0' : '1');
		} catch (e) {
			void e;
		}
	});

	try {
		if (localStorage.getItem(STORAGE_UI_COLLAPSED_KEY) === '1') {
			const rect = root.getBoundingClientRect();
			lastExpandedLeftPx = root.style.left || (Math.round(rect.left) + 'px');
			root.classList.add('cw-collapsed');
			root.style.left = '';
			root.style.right = `max(${UI_RIGHT_MARGIN_PX}px, env(safe-area-inset-right, 0px))`;
			collapseBtn?.setAttribute('aria-expanded', 'false');
			clampUiInViewport();
		}
	} catch (e) {
		void e;
	}

	root.querySelector('#cw-reset-time').addEventListener('click', () => {
		SC.ms = DEFAULT_DURATION_MS;
		syncDurationInputs();
		applyDurationFromInputs(true);
	});

	root.querySelector('#cw-min').addEventListener('input', () => applyDurationFromInputs(false));
	root.querySelector('#cw-sec').addEventListener('input', (ev) => {
		const secEl = ev.currentTarget;
		const secNum = parseInt(String(secEl?.value || '0'), 10);
		const totalSec = clamp(Math.round(SC.ms / 1000), 1, MAX_MINUTES * 60 + 59);
		const prevSec = totalSec % 60;
		const borrowFromOne = Number.isFinite(secNum) && prevSec === 1 && secNum === 0;
		applyDurationFromInputs(false, { borrowFromOne });
	});

	root.querySelectorAll('.cw-preset').forEach((btn) => {
		btn.addEventListener('click', () =>
			presetDur(parseInt(btn.dataset.m, 10), parseInt(btn.dataset.s, 10)));
	});

	function nudgeSp(delta) {
		SC.spd = clamp(Math.round((SC.spd + delta) * 100) / 100, SP_MIN, SP_MAX);
		syncSpeedUi();
		saveState();
		chrome.runtime.sendMessage({ type: 'adjustSpeed', value: SC.spd }, () => void chrome.runtime.lastError);
	}

	root.querySelector('#cw-spd-down').addEventListener('click', () => nudgeSp(-SPEED_NUDGE));
	root.querySelector('#cw-spd-up').addEventListener('click', () => nudgeSp(SPEED_NUDGE));
	root.querySelector('#cw-spd-reset').addEventListener('click', resetSpeedUi);

	SC.btnPlay.addEventListener('click', togglePlay);
	root.querySelector('#cw-reset-markers').addEventListener('click', resetMarkersUi);

	const varCb = root.querySelector('#cw-variable');
	varCb.checked = SC.variable;
	varCb.addEventListener('change', () => {
		SC.variable = varCb.checked;
		if (SC.playing) {
			stopPlay('可変スクロール設定を変更しました');
		}
		refreshVarCurve();
		saveState();
		setStatus(SC.variable ? '可変スクロール ON' : '等速モード', 'info');
	});

	const highlightCb = root.querySelector('#cw-highlight');
	highlightCb.checked = SC.highlightEnabled;
	highlightCb.addEventListener('change', () => {
		SC.highlightEnabled = highlightCb.checked;
		saveState();
		updateFocusOverlayGeometry();
		setFocusOverlayActive(SC.playing && SC.phase !== 'lead-in');
		setStatus(SC.highlightEnabled ? 'ハイライト表示 ON' : 'ハイライト表示 OFF', 'info');
	});

	window.addEventListener('scroll', () => {
		placeMarkers();
		if (
			SC.playing
			&& Math.abs(window.scrollY - (SC.virtualScrollY || 0)) > 3
		) {
			syncPlaybackFromScrollY(window.scrollY);
			SC.userScrollOverrideUntilMs = performance.now() + MANUAL_INTERACTION_HOLD_MS;
		}
	}, { passive: true });
	window.addEventListener('resize', onResizeLayout);
	SC.sheetEl = getSheetEl();
	if (SC.sheetEl) {
		SC.sheetEl.addEventListener('click', handlePrimarySheetClick);
	}

	window.addEventListener(
		'wheel',
		(ev) => {
			if (!SC.playing || ev.defaultPrevented || ev.ctrlKey || ev.metaKey) return;
			const dy = Number(ev.deltaY) || 0;
			if (Math.abs(dy) < 4) return;
			const steps = Math.min(4, Math.max(1, Math.round(Math.abs(dy) / 72)));
			nudgeSp(SPEED_NUDGE * steps * (dy > 0 ? 1 : -1));
		},
		{ passive: true }
	);
}

function bootstrapMarkersAndUi() {
	applyDefaults();
	const ok = restoreState();
	if (!ok) {
		SC.sx = SC.dsy;
		SC.ex = SC.dey;
	}
	SC.sx = clampMark('s', SC.sx);
	SC.ex = clampMark('e', SC.ex);
	mountUi();
	syncSpeedUi();
	syncDurationInputs();
	if (SC.remainEl) {
		SC.remainEl.textContent = fmtDur(SC.ms);
	}
	refreshVarCurve();
	placeMarkers();
	setStatus('停止中 · ' + fmtDur(SC.ms), 'info');
	setUiVisibility(loadUiVisibleState());

	chrome.runtime.sendMessage({ type: 'getOptions' }, (resp) => {
		if (chrome.runtime.lastError) return;
		const o = resp?.options;
		setDebugQueryOutputEnabled(o?.debugQueryOutput === true);
	});
}

function fetchRemoteDuration(title, artist) {
	chrome.runtime.sendMessage({ type: 'getDuration', title: title, artist: artist }, (resp) => {
		if (chrome.runtime.lastError || !resp || resp.type !== 'durationResult') return;
		const ms = typeof resp.duration === 'number' ? resp.duration : DEFAULT_DURATION_MS;
		SC.ms = Math.max(1000, ms);
		SC.src = resp.source || 'default';
		syncDurationInputs();
		saveState();
		if (SC.src === 'default' || resp.unavailable) {
			setStatus('外部APIから曲時間を取得できませんでした（既定 4:00）', 'warn');
			return;
		}
		setStatus('曲時間を取得 · ' + fmtDur(SC.ms) + ' · ' + sourceLabel(SC.src), 'success');
	});
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
	if (msg?.type === 'getPlaybackSnapshot') {
		sendResponse({
			duration: SC.ms,
			source: SC.src,
			formatted: fmtDur(SC.ms),
			playing: SC.playing,
		});
		return true;
	}
	if (msg?.type === 'getDurationFromContent') {
		sendResponse({
			duration: SC.ms,
			source: SC.src,
			formatted: fmtDur(SC.ms),
		});
		return true;
	}
	if (msg?.type === 'startAutoScroll') {
		if (typeof msg.speed === 'number') {
			SC.spd = clamp(msg.speed, SP_MIN, SP_MAX);
			syncSpeedUi();
		}
		if (!SC.uiVisible) {
			setUiVisibility(true);
		}
		startPlay();
		sendResponse({ ok: true });
		return true;
	}
	if (msg?.type === 'stopAutoScroll') {
		stopPlay('停止しました');
		sendResponse({ ok: true });
		return true;
	}
	if (msg?.type === 'setScrollSpeed') {
		SC.spd = clamp(Number(msg.speed) || 1, SP_MIN, SP_MAX);
		syncSpeedUi();
		saveState();
		sendResponse({ ok: true });
		return true;
	}
	if (msg?.type === 'toggleUiVisibility') {
		if (!SC.isSongPage) {
			sendResponse({ ok: false, reason: 'notSongPage' });
			return true;
		}
		const visible = toggleUiVisibility();
		sendResponse({ ok: true, visible });
		return true;
	}
	if (msg?.type === 'durationDebugUrl') {
		showDurationDebugUrl(msg.provider, msg.url);
		sendResponse({ ok: true });
		return true;
	}
	return false;
});

function init() {
	SC.isSongPage = isLikelySongPage();
	if (!SC.isSongPage) {
		return;
	}

	bootstrapMarkersAndUi();
	const t = extractSongTitle();
	const a = extractSongArtist();
	SC.queryTitle = String(t || '');
	SC.queryArtist = String(a || '');
	updateQueryPairDisplay();
	if (t && a) {
		fetchRemoteDuration(t, a);
	}
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
