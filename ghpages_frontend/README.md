# ghpages_frontend

GitHub Pages に公開するサイト（フォーク版 Trac のダウンロード・インストール案内）のソースです。
静的サイトは `scripts/build.mjs` が `dist/` に生成し、`.github/workflows/pages.yml` が `gh-pages` ブランチへ公開します。

## 構成

- `scripts/build.mjs` — ビルドスクリプト（nunjucks でテンプレートを描画）
- `scripts/render_rst.py` — リポジトリの `INSTALL.rst` / `UPGRADE.rst` を docutils で HTML に変換
- `src/templates/` — ページのテンプレート（`base.njk`、`page.njk`、`index.njk`）
- `src/static/` — CSS などの静的ファイル（そのまま `dist/` にコピー）
- `requirements.txt` — Python 側の依存（docutils）
- `package.json` / `pnpm-lock.yaml` — Node 側の依存（pnpm 管理、nunjucks）

RST の本文はリポジトリの文書が正なので、ここでは書き直さず変換のみを行います。

## ローカルでのビルド

前提: Node.js 20 以上、pnpm、Python 3.12 以上。

```sh
cd ghpages_frontend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
pnpm install
PYTHON=.venv/bin/python pnpm build
```

`dist/index.html` をブラウザで開いて確認します。ビルドのたびに `dist/` は作り直されます。

## 公開

- `main` に push されると（`ghpages_frontend/**`、`INSTALL.rst`、`UPGRADE.rst`、ワークフローの変更時）自動で `gh-pages` ブランチが更新されます。
- 手動実行は GitHub の Actions 画面から `GitHub Pages` ワークフローの `Run workflow` を使います。
- 公開先: https://updateit-co-jp.github.io/udi-custom-trac/
- GitHub Pages の配信元は `gh-pages` ブランチ（ルート）に設定します。
