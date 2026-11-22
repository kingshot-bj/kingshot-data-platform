// 動画（CM）の場面セットの検証と整形。Worker（/owner/social/video）と動画を作るスクリプト（scripts/social/feature-video.mjs）の両方で使う。
// ・オーナーが画面で書いた台本をそのまま撮影に使うので、ここで必ず通す。
// ・字幕・見出しで使える装飾は <b> と <br> だけ（ほかのタグはすべて文字として表示）。
// ・映せるページは EagleEye の中（/ から始まるパス）だけ。

import { EAGLEEYE_THEMES } from "./themes.js";

export const SLIDE_TYPES = Object.freeze(["title", "text", "signup", "outro"]);
// 着せ替え（themes.js の id）。台本全体（skin）と場面ごと（scene.skin）に指定できる。
export const VIDEO_SKINS = Object.freeze(EAGLEEYE_THEMES.map(t => t.id));
const skinOf = v => VIDEO_SKINS.includes(String(v || "")) ? String(v) : "";
export const SCENE_LIMITS = Object.freeze({ scenes: 12, seconds: 20, total: 90, text: 120, page: 300, scroll: 20000, post: 12, postLine: 400, name: 40, title: 60 });
export const SCENE_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 文字を全部エスケープしてから、<b> </b> <br> だけ戻す。
export function sanitizeRich(value, max = SCENE_LIMITS.text) {
  const s = String(value ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").slice(0, max);
  return esc(s).replace(/&lt;(\/?)b&gt;/gi, "<$1b>").replace(/&lt;br\s*\/?&gt;/gi, "<br>");
}

// 画面に見せる文字（タグを外す）
export function plainText(rich) {
  return String(rich || "").replace(/<br>/g, " ").replace(/<\/?b>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

export function safePagePath(value) {
  const p = String(value ?? "").trim();
  if (p.length > SCENE_LIMITS.page || !/^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*$/.test(p)) return null;
  if (/^\/(api|owner|admin|preview)(\/|$)/i.test(p)) return null;
  return p;
}

const num = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };

// 返り値：{ ok: true, set } か { ok: false, error }（error は画面に出す日本語）
export function normalizeSceneSet(input) {
  if (!input || typeof input !== "object") return { ok: false, error: "台本が読めません" };
  const name = String(input.name || "").trim().toLowerCase();
  if (!SCENE_NAME.test(name)) return { ok: false, error: "名前は半角の小文字・数字・ハイフン（40文字まで）にしてください" };
  const raw = Array.isArray(input.scenes) ? input.scenes : [];
  if (!raw.length) return { ok: false, error: "場面が1つもありません" };
  if (raw.length > SCENE_LIMITS.scenes) return { ok: false, error: `場面は${SCENE_LIMITS.scenes}個までです` };
  const scenes = [];
  for (let i = 0; i < raw.length; i++) {
    const sc = raw[i] || {};
    const seconds = Math.round(num(sc.seconds, 0, SCENE_LIMITS.seconds, 0) * 10) / 10;
    if (!(seconds > 0)) return { ok: false, error: `${i + 1}番目の場面：秒数は0〜${SCENE_LIMITS.seconds}秒にしてください` };
    if (sc.slide) {
      const slide = String(sc.slide);
      if (!SLIDE_TYPES.includes(slide)) return { ok: false, error: `${i + 1}番目の場面：種類が正しくありません` };
      const out = { slide, seconds };
      if (skinOf(sc.skin)) out.skin = skinOf(sc.skin);
      if (slide === "text") { out.heading = sanitizeRich(sc.heading); out.sub = sanitizeRich(sc.sub); if (!plainText(out.heading).trim()) return { ok: false, error: `${i + 1}番目の場面：見出しを入れてください` }; }
      scenes.push(out);
    } else {
      const page = safePagePath(sc.page);
      if (!page) return { ok: false, error: `${i + 1}番目の場面：ページは EagleEye の中のパス（/ から始まる）にしてください` };
      const out = { page, caption: sanitizeRich(sc.caption), seconds, scroll: Math.round(num(sc.scroll, 0, SCENE_LIMITS.scroll, 0)) };
      if (sc.login) out.login = true;
      if (skinOf(sc.skin)) out.skin = skinOf(sc.skin);
      // 押すボタン（#id か .class だけ・3つまで）と、押したあとに待つ時間（共有画像などができるまで）。2026-11-17
      const click = (Array.isArray(sc.click) ? sc.click : []).map(String).filter(x => /^[#.][A-Za-z][A-Za-z0-9_-]{0,40}$/.test(x)).slice(0, 3);
      if (click.length) out.click = click;
      if (Number(sc.afterClickMs) > 0) out.afterClickMs = Math.round(num(sc.afterClickMs, 0, 10000, 0));
      scenes.push(out);
    }
  }
  const total = scenes.reduce((a, s) => a + s.seconds, 0);
  if (total > SCENE_LIMITS.total) return { ok: false, error: `合計は${SCENE_LIMITS.total}秒までです（今は${Math.round(total)}秒）` };
  const post = (Array.isArray(input.post) ? input.post : String(input.post || "").split("\n")).slice(0, SCENE_LIMITS.post).map(l => String(l ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").slice(0, SCENE_LIMITS.postLine));
  const title = String(input.title || name).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, SCENE_LIMITS.title);
  const set = { name, title, output: `eagleeye-${name}.mp4`, post, scenes };
  if (skinOf(input.skin)) set.skin = skinOf(input.skin);
  // 画面の色（EagleEye のページ）：light（標準）か dark。着せ替えを見せるときは dark。
  if (input.mode === "dark" || input.mode === "light") set.mode = input.mode;
  return { ok: true, set };
}
