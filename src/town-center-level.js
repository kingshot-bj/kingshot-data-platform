// 役場レベルの表示。ゲーム内は「30」の次が黄金バッジ1〜で、黄金レベル間は5マスの進行バー。
// MightPulse の値は 35=黄金1、40=黄金2… の5刻みで、間の値（31〜34、36〜39…）はバーの途中。
// テキスト版（CSV・変化履歴・aria用）とアイコン版（ゲームの金バッジを模したSVG）を持つ。
// クライアント側スクリプトへは townCenterBadgeHtml.toString() で埋め込むため、
// この関数は外部の変数を参照しない自己完結した書き方にしている。

export function formatTownCenterLevel(value) {
  if (value === null || value === undefined || value === "") return "-";
  const level = Number(value);
  if (!Number.isFinite(level)) return String(value);
  if (level <= 30) return `Lv.${level}`;
  if (level < 35) return `Lv.30（${level - 30}/5）`;
  const goldLevel = Math.floor((level - 35) / 5) + 1;
  const step = (level - 35) % 5;
  return step ? `黄金${goldLevel}（${step}/5）` : `黄金${goldLevel}`;
}

export function townCenterBadgeHtml(value) {
  if (value === null || value === undefined || value === "") return "-";
  var level = Number(value);
  if (!isFinite(level)) return String(value).replace(/[&<>"']/g, "");
  var bar = function (step) {
    var cells = "";
    for (var i = 0; i < 5; i++) cells += '<i style="display:inline-block;width:5px;height:6px;margin-left:1px;border-radius:1px;background:' + (i < step ? "rgb(250,214,60)" : "rgba(150,130,100,.45)") + '"></i>';
    return '<span style="display:inline-flex;align-items:center;margin-left:3px;vertical-align:middle">' + cells + "</span>";
  };
  if (level < 35) {
    var sub = level > 30 ? level - 30 : 0;
    var lv = level > 30 ? 30 : level;
    return '<span class="tc-badge" title="' + (sub ? "Lv.30（" + sub + "/5）" : "Lv." + lv) + '">Lv.' + lv + (sub ? bar(sub) : "") + "</span>";
  }
  var g = Math.floor((level - 35) / 5) + 1;
  var st = (level - 35) % 5;
  var label = "黄金" + g + (st ? "（" + st + "/5）" : "");
  var svg = '<svg width="1.35em" height="1.35em" viewBox="0 0 32 32" aria-hidden="true" style="display:block">' +
    '<circle cx="16" cy="16" r="14.5" fill="rgb(222,178,78)" stroke="rgb(120,82,32)" stroke-width="1.5"/>' +
    '<circle cx="16" cy="16" r="11.5" fill="rgb(176,128,48)"/>' +
    '<path d="M16 5 27 16 16 27 5 16Z" fill="rgb(240,150,38)" stroke="rgb(140,84,20)" stroke-width="1"/>' +
    '<path d="M16 5 27 16H5Z" fill="rgb(252,196,80)"/>' +
    '<text x="16" y="22" text-anchor="middle" font-size="17" font-weight="900" font-family="Arial,sans-serif" fill="rgb(255,255,255)" stroke="rgb(90,52,14)" stroke-width="2.4" paint-order="stroke">' + g + "</text></svg>";
  return '<span class="tc-badge" title="' + label + '" aria-label="' + label + '" style="display:inline-flex;align-items:center;white-space:nowrap;vertical-align:-.35em">' + svg + (st ? bar(st) : "") + "</span>";
}
