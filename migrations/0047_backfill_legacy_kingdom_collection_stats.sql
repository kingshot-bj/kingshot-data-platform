-- Backfill pre-0046 kingdom collection coverage.
-- Before collection_source existed, EagleEye did not retain the actor for historical
-- successful collections. The service is still pre-launch, so existing materialized
-- ranking + player data is intentionally classified as OPERATOR for the initial ledger.
-- This records only a conservative "at least one successful collection" baseline:
-- one row per kingdom, total_collection_count=1. Historical repeat counts are not inferred.
-- The operation is idempotent and does not modify ranking/player/history data.

WITH ranking_kids AS (
  SELECT
    kid,
    MIN(observed_at) AS first_ranking_at,
    MAX(observed_at) AS last_ranking_at
  FROM kingdom_ranking_current
  WHERE target_type = 'PLAYER'
  GROUP BY kid
),
player_kids AS (
  SELECT
    kid,
    MIN(observed_at) AS first_player_at,
    MAX(observed_at) AS last_player_at
  FROM players
  WHERE governor_id IS NOT NULL
  GROUP BY kid
)
INSERT INTO kingdom_collection_stats (
  kid,
  first_collected_at,
  last_collected_at,
  total_collection_count,
  operator_collection_count,
  user_collection_count,
  last_source,
  created_at,
  updated_at
)
SELECT
  r.kid,
  MIN(r.first_ranking_at, p.first_player_at),
  MAX(r.last_ranking_at, p.last_player_at),
  1,
  1,
  0,
  'OPERATOR',
  MAX(MIN(r.first_ranking_at, p.first_player_at), MIN(r.first_ranking_at, p.first_player_at)),
  MAX(r.last_ranking_at, p.last_player_at)
FROM ranking_kids r
JOIN player_kids p ON p.kid = r.kid
WHERE r.kid IS NOT NULL
  AND p.kid IS NOT NULL
ON CONFLICT(kid) DO NOTHING;
