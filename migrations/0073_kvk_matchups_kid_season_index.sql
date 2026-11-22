-- 王国ページの「直近のKvKの相手」（WHERE kid = ? ORDER BY season DESC LIMIT 1）を索引で引く。
-- 主キーは (season, kid) なので、この索引が無いと 1 回ごとに全組み合わせ（約1,200行）を読んでいた（2026-11-17）。
-- kvk_matchups はシーズンの発表時にしか書かれないので、索引による書き込みの増加はほぼ無い。
CREATE INDEX IF NOT EXISTS idx_kvk_matchups_kid_season ON kvk_matchups(kid, season);
