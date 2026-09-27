# Cloudflare Analytics D1 Resource Monitoring

## Purpose

EagleEyeのD1 Free Tier使用量を、D1自身に保存せずCloudflare GraphQL Analytics APIから取得する。

これにより、D1がrows read/writeのFree Tier上限に到達した場合でも、`/status` がD1の診断テーブルに依存せず、Cloudflare側の使用量を表示できる。

## Monitored resources

- D1 Rows Read: Free 5,000,000 rows/day
- D1 Rows Written: Free 100,000 rows/day
- D1 Storage: 5 GiB
- D1 query count / write query count / response bytes / query timeも取得している

Cloudflare公式のD1 Metrics APIはGraphQL Analytics APIを使用し、D1のrowsRead / rowsWritten / databaseSizeBytes等を提供している。

## Required Worker variables

`wrangler.jsonc`:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID`

`CLOUDFLARE_ANALYTICS_TOKEN` は秘密情報なのでWranglerのsecretとして設定する。

### Production setup

Cloudflare Analytics API用のAPI Tokenは、Account → Account Analytics → Readの権限に限定する。

```bash
npx wrangler secret put CLOUDFLARE_ANALYTICS_TOKEN
```

Account IDを設定してからdeployする。

**実際のAPI TokenはGitHubへ絶対にコミットしない。**

## Status behavior

`/status` は以下を並列取得する。

1. Cloudflare GraphQL Analytics API
2. 既存のD1 diagnostics

Cloudflare Analytics APIはD1とは別系統なので、D1のFree Tier row limit到達時でもresource monitorを動作させられる。

Resource thresholds:

- `< 70%`: 正常
- `70% - <85%`: 警告
- `85% - <100%`: 危険
- `>=100%`: 上限到達

Analytics側に障害・認証エラーがある場合は、使用量を推測せず「未確認」とする。

## Important limitation

Cloudflare Analyticsは実利用量の監視に使えるが、最新値の反映には遅延が発生する可能性がある。

そのためEagleEyeでは、

- Cloudflare Analytics = 外部・独立した使用量監視
- D1 diagnostics = アプリ内で発生した実際のエラー
- Workers Logs = 詳細な実行ログ

という役割分担にする。

## Security

`CLOUDFLARE_ANALYTICS_TOKEN` はWorker内部からCloudflare GraphQL APIへアクセスするためだけに使用する。

公開`/status`には以下を表示しない。

- Cloudflare Account ID
- API Token
- GraphQLレスポンスの生データ
- Cloudflare内部エラーの詳細

表示するのは使用量、上限、割合、監視状態のみ。

## References

- Cloudflare D1 Metrics and Analytics: https://developers.cloudflare.com/d1/observability/metrics-analytics/
- Cloudflare GraphQL Analytics API: https://developers.cloudflare.com/analytics/graphql-api/
- Cloudflare Analytics API Token: https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/