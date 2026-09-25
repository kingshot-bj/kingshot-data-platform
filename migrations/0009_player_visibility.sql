CREATE TABLE IF NOT EXISTS player_visibility_settings (
  item_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  basic_enabled INTEGER NOT NULL DEFAULT 0,
  advanced_enabled INTEGER NOT NULL DEFAULT 0,
  admin_enabled INTEGER NOT NULL DEFAULT 1,
  owner_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

INSERT OR IGNORE INTO player_visibility_settings
(item_key, category, label, description, basic_enabled, advanced_enabled, admin_enabled, owner_enabled, updated_at)
VALUES
('base_identity','基本情報','プレイヤー識別情報','領主ID・UID・FID・プレイヤー名・王国',1,1,1,1,strftime('%s','now')),
('base_power','基本情報','戦力・役場','戦力・役場レベル',1,1,1,1,strftime('%s','now')),
('base_vip','基本情報','VIP','VIPレベル',0,1,1,1,strftime('%s','now')),
('base_coordinates','基本情報','座標','X/Y座標',0,1,1,1,strftime('%s','now')),
('base_kills','基本情報','撃破数','撃破数',1,1,1,1,strftime('%s','now')),
('base_activity','基本情報','オンライン・最終活動','オンライン状態・最終活動・最終ログイン',1,1,1,1,strftime('%s','now')),
('base_profile','基本情報','プロフィール補助情報','アバター・言語・シールド・炎上状態・役職',0,1,1,1,strftime('%s','now')),
('alliance_identity','同盟','同盟基本情報','同盟ID・略称・同盟名',1,1,1,1,strftime('%s','now')),
('alliance_rank','同盟','同盟順位情報','同盟内順位・順位ラベル',0,1,1,1,strftime('%s','now')),
('alliance_stats','同盟','同盟戦力・人数','同盟戦力・人数・盟主・旗',0,1,1,1,strftime('%s','now')),
('heroes_list','英雄','英雄一覧','英雄名・レベル・星・品質・戦力・配置',0,1,1,1,strftime('%s','now')),
('heroes_skills','英雄','英雄スキル','各英雄のスキルレベル',0,1,1,1,strftime('%s','now')),
('heroes_exclusive_gear','英雄','英雄専用装備','専用装備・補正・SLG属性',0,1,1,1,strftime('%s','now')),
('heroes_gear','英雄','英雄通常装備','兜・手袋・鎧・靴の装備情報',0,1,1,1,strftime('%s','now')),
('ranks_core','ランキング','主要個人ランキング','戦力・撃破・役場・移民・ミスティック順位',0,1,1,1,strftime('%s','now')),
('ranks_leaderboards','ランキング','その他個人ランキング','leaderboards配列',0,1,1,1,strftime('%s','now')),
('gov_gear_list','領主装備','領主装備一覧','領主装備のスロット・品質・ティア・星・強化・スコア・戦闘力',0,1,1,1,strftime('%s','now')),
('gov_gear_gems','領主装備','領主装備の宝石','装着宝石のスロット・ID',0,1,1,1,strftime('%s','now'));
