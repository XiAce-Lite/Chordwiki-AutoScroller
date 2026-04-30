'use strict';

const DEFAULT_DURATION_MS = 240000;
const STORAGE_NS = 'cw_as_v10';
const MAX_MINUTES = 99;
const SP_MIN = 0.5;
const SP_MAX = 3;
const FOCUS_RATIO = 0.42;
const EDGE = 34;
const EDGE_BASE = 200;
const EDGE_MAX = 720;
const WHEEL_PX_THRESHOLD = 72;
const SPEED_NUDGE = 0.05;
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
	return m + ':' + pad2(sec);
}
function stripTitle(txt) {
	const t = String(txt || '').trim().replace(/^[ 　]+|[ 　]+$/g, '');
	if (!t) return '';
	return t.replace(/[（(].*$/, '').trim();
}
function extractSongTitle() {
	const m = /\{\s*(title|t)\s*:\s*([^\}\n]+)\}/i.exec(document.body.innerText || '');
	return m ? stripTitle(m[2]) : null;
}
function extractSongArtist() {
	const m = /\{\s*(subtitle|st)\s*:\s*([^\}\n]+)\}/i.exec(document.body.innerText || '');
	if (!m) return null;
	let s = String(m[2]).trim();
	const k = s.search(/歌[:・]/);
	let rest = k >= 0 ? s.slice(k + 2) : s;
	const cut = rest.search(/作詞|作曲|編曲|歌[:・]|[ 　]/);
	if (cut >= 0) rest = rest.slice(0, cut);
	return rest.trim();
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
	const a = [...el.querySelectorAll('p.line, .comment, p[class*="line"]')];
	if (a.length) return a;
	return [...el.querySelectorAll('pre')].slice(0, 80);
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
});

function applyDefaults() {
	const sh = getSheetEl();
	const b = docBounds(sh);
	SC.dsy = b.t;
	SC.dey = b.b;
	const L = sheetLines(sh);
	if (L.length) {
		const r0 = L[0].getBoundingClientRect();
		const r1 = L[L.length - 1].getBoundingClientRect();
		SC.dsy = Math.round(r0.top + window.scrollY);
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
		m++;
		s -= 60;
	}
	while (s < 0 && m > 0) {
		m--;
		s += 60;
	}
	while (s < 0 && m === 0) {
		s = 0;
	}
	m = clamp(m, 0, MAX_MINUTES);
	s = clamp(s, 0, 59);
	const totalMs = clamp(m * 60 + s, 0, MAX_MINUTES * 60 + 59) * 1000;
	return { m: m, sec: s, totalMs };
}

function saveState() {
	try {
		localStorage.setItem(
			storageKeyPage(),
			JSON.stringify({
				sx: SC.sx,
				ex: SC.ex,
				ms: SC.ms,
				spd: SC.spd,
				variable: SC.variable ? 1 : 0,
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
		if (!o || typeof o.sx !== 'number') return false;
		SC.sx = o.sx;
		SC.ex = typeof o.ex === 'number' ? o.ex : SC.ex;
		SC.ms = o.ms || DEFAULT_DURATION_MS;
		SC.spd = clamp(o.spd ?? 1, SP_MIN, SP_MAX);
		SC.variable = o.variable !== 0;
		return true;
	} catch (e) {
		return false;
	}
}

function lyricLenGuess(el) {
	const inner = String(el.innerText || '').replace(/\s+/g, '');
	return clamp(inner.length || 1, 1, 5000);
}

/** @returns {null | {cumMs:number[], y:number[]}} */
function buildVarCurve() {
	const sh = getSheetEl();
	const lines = [];
	for (const el of sheetLines(sh)) {
		const r = el.getBoundingClientRect();
		const y = (r.top + r.bottom) / 2 + window.scrollY;
		if (y < SC.sx - 14 || y > SC.ex + 14) {
			continue;
		}
		lines.push({ y: y, lz: lyricLenGuess(el), h: Math.max(r.height || 14, 1) });
	}
	if (lines.length < 2) {
		return null;
	}
	let wgt = [];
	for (let i = 0; i < lines.length - 1; i++) {
		let w = Math.sqrt(lines[i].lz / 40 + 1) + lines[i].h / 32;
		w = clamp(w, 0.12, 8);
		wgt.push(w);
	}
	const sum = wgt.reduce(function (x, q) {
		return x + q;
	}, 0);
	const cumMs = [0];
	const ytab = [];
	for (let i = 0; i < lines.length; i++) {
		ytab.push(lines[i].y);
	}
	let acc = 0;
	for (let i = 0; i < wgt.length; i++) {
		acc += (wgt[i] / Math.max(sum, 1e-6)) * SC.ms;
		cumMs.push(acc);
	}
	return { cumMs: cumMs, ytab: ytab };
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
	return y[k] + (y[k + 1] - y[k]) * r;
}

function refreshVarCurve() {
	SC.varCurve = SC.variable ? buildVarCurve() : null;
}

function scrollToProg(u) {
	const u2 = clamp(u, 0, 1);
	if (SC.variable && SC.varCurve) {
		const fy = interpVar(SC.varCurve, u2 * SC.ms);
		window.scrollTo(0, clamp(fy - window.innerHeight * FOCUS_RATIO, 0, vmax()));
		return;
	}
	const a = yScrollStartFocus();
	const b = yScrollEndStop();
	const pos = clamp(a + (b - a) * u2, 0, vmax());
	window.scrollTo(0, pos);
}

function stopPlay(msg) {
	if (SC.frame) {
		cancelAnimationFrame(SC.frame);
		SC.frame = null;
	}
	SC.playing = false;
	SC.elapsed = 0;
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

function visibleEndEnough() {
	if (!(SC.mEnd instanceof Element)) return false;
	const r = SC.mEnd.getBoundingClientRect();
	return r.top < window.innerHeight - 94;
}

function frame(nowMs) {
	if (!SC.playing) {
		return;
	}
	if (!SC.tPrev) {
		SC.tPrev = nowMs;
	}
	let dtMs = clamp(nowMs - SC.tPrev, 0, 120);
	SC.tPrev = nowMs;
	SC.elapsed += dtMs * clamp(SC.spd || 1, SP_MIN, SP_MAX);
	let u = SC.elapsed / SC.ms;
	if (u >= 1) {
		stopPlay(SC.statusEl ? '終了しました' : null);
		scrollToProg(1);
		return;
	}
	scrollToProg(u);
	SC.frame = requestAnimationFrame(frame);
	if (SC.elapsed > 450 && visibleEndEnough()) {
		stopPlay('エンドまで到達');
	}
	if (SC.remainEl && SC.remainEl.textContent !== undefined) {
		SC.remainEl.textContent = fmtDur(Math.max(0, SC.ms - SC.elapsed));
	}
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
		window.scrollTo(0, ny);
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
	if (SC.inMin) SC.inMin.value = String(mi);
	if (SC.inSec) SC.inSec.value = String(ss);
	if (SC.estDurEl) SC.estDurEl.textContent = fmtDur(SC.ms);
	if (SC.srcEl) SC.srcEl.textContent = sourceLabel(SC.src);
}

function sourceLabel(s) {
	const map = { itunes: 'iTunes', musicbrainz: 'MusicBrainz', default: '既定', none: '' };
	return map[s] || '';
}

function applyDurationFromInputs(notify) {
	const n = normalizeMinSec(SC.inMin?.value, SC.inSec?.value);
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
	SC.playing = true;
	SC.elapsed = 0;
	SC.tPrev = 0;
	if (SC.btnPlay) {
		SC.btnPlay.textContent = '停止';
		SC.btnPlay.classList.toggle('cw-playing', true);
	}
	setStatus('再生中', 'lead-in');
	scrollToProg(0);
	SC.frame = requestAnimationFrame(frame);
	saveState();
}

function togglePlay() {
	if (SC.playing) {
		stopPlay('停止しました');
	} else {
		startPlay();
	}
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
		'<input id="cw-sec" type="number" min="0" max="59" step="1" value="0" inputmode="numeric" />' +
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
		'<div class="cw-speed-hint">再生中はホイール ↑ で遅く / ↓ で速く</div>' +
		'<div class="cw-actions">' +
		'<button type="button" id="cw-play">開始</button>' +
		'<button type="button" id="cw-reset-markers">↺ Marker</button>' +
		'<label class="cw-var-toggle"><input type="checkbox" id="cw-variable" checked /><span>可変スクロール</span></label>' +
		'</div>' +
		'<div class="cw-est-row">推定時間 <span id="cw-est-dur">--:--</span> <span id="cw-src" class="cw-src"></span></div>' +
		'<div class="cw-remain-row">残り時間 <span id="cw-remain">--:--</span></div>' +
		'<div class="cw-est-note">スライダーはページ・ポップアップ共通で速度を変更します</div>' +
		'</div>';

	document.body.appendChild(layer);
	document.body.appendChild(root);

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

	root.querySelector('#cw-collapse').addEventListener('click', () => {
		root.classList.toggle('cw-collapsed');
		const exp = !root.classList.contains('cw-collapsed');
		root.querySelector('#cw-collapse').setAttribute('aria-expanded', exp ? 'true' : 'false');
		try {
			localStorage.setItem('cw_ui_collapsed', exp ? '0' : '1');
		} catch (e) {
			void e;
		}
	});

	try {
		if (localStorage.getItem('cw_ui_collapsed') === '1') {
			root.classList.add('cw-collapsed');
			root.querySelector('#cw-collapse').setAttribute('aria-expanded', 'false');
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
	root.querySelector('#cw-sec').addEventListener('input', () => applyDurationFromInputs(false));

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

	window.addEventListener('scroll', placeMarkers, { passive: true });
	window.addEventListener('resize', onResizeLayout);

	window.addEventListener(
		'wheel',
		(ev) => {
			if (!SC.playing || ev.ctrlKey || ev.metaKey) return;
			const dy = Number(ev.deltaY) || 0;
			if (Math.abs(dy) < 4) return;
			const steps = clamp(Math.round(Math.abs(dy) / WHEEL_PX_THRESHOLD), 1, 4);
			nudgeSp((dy > 0 ? 1 : -1) * SPEED_NUDGE * steps);
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

	chrome.runtime.sendMessage({ type: 'getOptions' }, (resp) => {
		if (chrome.runtime.lastError) return;
		const o = resp?.options;
		if (o && typeof o.defaultSpeed === 'number') {
			SC.spd = clamp(o.defaultSpeed, SP_MIN, SP_MAX);
			syncSpeedUi();
		}
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
	return false;
});

function init() {
	bootstrapMarkersAndUi();
	const t = extractSongTitle();
	const a = extractSongArtist();
	if (t && a) {
		fetchRemoteDuration(t, a);
	}
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
