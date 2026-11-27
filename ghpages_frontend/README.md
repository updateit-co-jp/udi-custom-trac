# ghpages_frontend

GitHub Pages に公開するサイト（フォーク版 Trac のダウンロード・インストール案内）のソースです。
静的サイトは `scripts/build.mjs` が `dist/` に生成し、`.github/workflows/pages.yml` が GitHub Pages の Actions デプロイで公開します。

## 構成

- `scripts/build.mjs` — ビルドスクリプト（nunjucks でテンプレートを描画）
- `scripts/render_rst.py` — docutils で reStructuredText を HTML に変換
- `src/docs/` — 日本語のインストール、HTTPS 公開、本家 Trac 1.6.x からの移行、フォーク版のアップグレード手順
- `src/templates/` — ページのテンプレート（`base.njk`、`page.njk`、`index.njk`）
- `src/static/` — CSS などの静的ファイル（そのまま `dist/` にコピー）
- `requirements.txt` — Python 側の依存（docutils）
- `package.json` / `pnpm-lock.yaml` — Node 側の依存（pnpm 管理、nunjucks）

日本語の手順はこのフォークの uv 運用を対象とします。汎用手順とバージョン固有の注意事項は、各ページからリポジトリ直下の `INSTALL.rst` / `UPGRADE.rst`（英語の原文）を参照できます。原文の pip 手順は、このフォークの運用対象ではありません。

## ローカルでのビルド

前提は Node.js 20 以上、pnpm、uv です。

```sh
cd ghpages_frontend
uv python install 3.14
uv venv --python 3.14 --managed-python .venv
uv pip install --python .venv/bin/python -r requirements.txt
pnpm install
PYTHON=.venv/bin/python pnpm build
```

`dist/index.html` をブラウザで開いて確認します。ビルドのたびに `dist/` は作り直されます。

## 公開

- 配信元は **GitHub Actions** に設定します（リポジトリの Settings → Pages → Build and deployment → Source）。
  `gh-pages` ブランチは使いません。
- `main` への push で `ghpages_frontend/**` かワークフローが変わると、`GitHub Pages` ワークフローが
  ビルドしてそのまま配信します。ブランチへの push を伴わないため、`GITHUB_TOKEN` の制限には影響されません。
- `ghpages_frontend/**` と `.github/workflows/pages.yml` だけの変更では、push・プルリクエストともに本体の `build` は起動しません。
- 手動実行は GitHub の Actions 画面から `GitHub Pages` ワークフローの `Run workflow` を使います。
- 反映の確認は Actions の実行結果と公開 URL の両方で行います。
- 公開先: https://updateit-co-jp.github.io/udi-custom-trac/
