# Documentation Index

このディレクトリには、EagleEyeの設計・技術調査・運用引継ぎ資料を整理して保存しています。

## Public / reviewer-friendly

- [Engineering Case Study](./ENGINEERING_CASE_STUDY.md) — プロジェクトの技術的な課題、設計判断、アーキテクチャ、開発上の役割
- [Repository README](../README.md) — プロジェクト概要、主な機能、技術スタック

## Engineering records

日付付きの設計書・調査記録・引継ぎMDは、実装の背景や意思決定を追跡するための記録です。内容には当時の状態や未確認事項が含まれる場合があります。現在の仕様を判断するときは、必ず最新の `main` と実コードを優先してください。

## Archive

[`archive/`](./archive/) — 古いREADMEや過去の開発引継ぎ資料を履歴として保管する場所です。現在の実装仕様を示す文書とは限りません。

## Reading order for reviewers

1. Repository README
2. Engineering Case Study
3. Relevant source modules under `src/`
4. Related migrations and tests
5. Dated engineering records, when historical context is needed

## Status terminology

- **Implemented:** 実コードで確認できる状態
- **Merged:** `main` に取り込まれた状態
- **Deployed:** Cloudflareへのデプロイ成功を別途確認した状態
- **Verified:** 対象のテストまたは実環境で確認した状態

これらは同じ意味ではありません。コミットやPRだけを根拠に本番反映済みと判断しないでください。
