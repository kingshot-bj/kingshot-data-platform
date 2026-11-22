-- 公開の王国ページ「戦力が近い王国」を順位で引くための索引（全件を読まない）。
CREATE INDEX IF NOT EXISTS idx_kingdom_stats_current_power_rank ON kingdom_stats_current (power_rank);
