インストール手順
============================

Ubuntu の仮想マシンで、配布 wheel から Trac を新規導入する手順です。
構成例は SQLite、単一の Trac プロジェクト、systemd、同じ VM 上の HTTPS リバースプロキシです。
既存プロジェクトを引き継ぐ場合は、`アップグレード手順 <upgrade.html>`__ を参照してください。

動作環境と準備
----------------------------

- Trac は Python 3.13 以上に対応しています。ここでは開発環境と同じ Python 3.14 を uv で導入します。
  Ubuntu 24.04 などで標準の Python が 3.12 以下でも、OS の Python はそのまま使えます。
- サービス用 OS ユーザー ``trac`` をホームディレクトリ ``/home/trac`` 付きで用意します。
  uv の導入、wheel のインストール、Trac の管理コマンドはすべてこのユーザーで実行します。
  systemd とリバースプロキシの設定は OS 管理者が行います。
- `GitHub Releases <https://github.com/updateit-co-jp/udi-custom-trac/releases>`__ から対象の wheel を取得し、
  ``trac`` ユーザーが読める場所に置きます。日付付き開発版のファイル名には ``.devYYYYMMDD`` が入ります。

uv と wheel をインストールする
------------------------------------------------------

`uv の公式手順 <https://docs.astral.sh/uv/getting-started/installation/>`__ に沿って ``trac`` ユーザーで uv を導入し、
``uv --version`` で確認します。以降はそのユーザーで実行してください。
wheel のパスは実際のダウンロード先とファイル名に置き換えます。

.. code-block::

   mkdir -p ~/udi-custom-trac
   cd ~/udi-custom-trac
   uv python install 3.14
   uv venv --no-project --python 3.14 --managed-python .venv
   uv pip install --python .venv/bin/python /path/to/trac-X.Y.Z-py3-none-any.whl Babel
   uv run --no-project python --version
   uv run --no-project tracd --version

このディレクトリには実行用の ``.venv`` を置きます。以降の ``uv run --no-project`` は
別の仮想環境を有効にしていない状態でここから実行し、wheel を導入した ``.venv`` を使います。
Babel は Trac の日本語表示に必要です。
PostgreSQL や MySQL を使う場合は、対応する Python ドライバーも同じ仮想環境に入れます。

ネットワークに出られない VM に導入する
------------------------------------------------------

``uv python install`` と ``uv pip install`` は通常インターネットから取得します。
VM から外に出られない場合は、同じ OS・CPU 種別の接続できるマシンで次の材料を集め、VM に持ち込みます。

.. code-block::

   # 接続できるマシンで実行する
   uv python install 3.14
   uv python find 3.14 --managed-python            # 例: ~/.local/share/uv/python/cpython-3.14.x-...
   mkdir -p ~/offline/wheelhouse
   uv pip download --python-version 3.14 --only-binary :all: -d ~/offline/wheelhouse \
       /path/to/trac-X.Y.Z-py3-none-any.whl Babel
   # 本番に入れる Python 本体（上の uv python find が示したディレクトリ）を ~/offline/python にコピーする

VM では、持ち込んだ Python と wheelhouse を使い、外部への接続なしで仮想環境を作ります。

.. code-block::

   # VM で実行する（~/offline を VM の trac ユーザーのホームに置いた場合）
   uv venv --no-project --python ~/offline/python/bin/python3.14 .venv
   uv pip install --python .venv/bin/python --no-index --find-links ~/offline/wheelhouse \
       ~/offline/wheelhouse/trac-X.Y.Z-py3-none-any.whl Babel
   uv run --no-project --no-python-downloads tracd --version

``uv python`` が持ち込んだ Python を認識しない場合は、``--python`` に持ち込んだ実行ファイルの絶対パスを指定します。
この手順は接続できるマシンで材料を集める前提で、実機での検証はまだ行っていません。
systemd のユニットで ``--no-python-downloads`` を指定しているため、起動時にインターネットへ取りに行くことはありません。

Trac プロジェクトを作成する
------------------------------------------------------

プロジェクトデータを ``~/udi-custom-trac/project`` に作る例です。

.. code-block::

   uv run --no-project trac-admin "$PWD/project" initenv "開発プロジェクト" "sqlite:db/trac.db"
   uv run --no-project trac-admin "$PWD/project" permission add admin TRAC_ADMIN

``admin`` は次に作成する Trac のログイン名です。認証ファイルを使う例では、
OS 管理者が Ubuntu の ``apache2-utils`` を導入し、``trac`` ユーザーで以下を実行します。

.. code-block::

   uv pip install --python .venv/bin/python passlib 'bcrypt<4.1.0'
   (umask 077; htpasswd -cB "$PWD/htpasswd" admin)

``-c`` は認証ファイルを新規作成する初回だけ指定します。既存ファイルへのユーザー追加には
``htpasswd -B`` を使います。公開前に、管理者のログインと匿名ユーザーの権限を確認してください。

最初は VM 内で ``tracd`` を起動して応答を確認できます。次のコマンドを実行し、
別の端末から ``http://127.0.0.1:8000/`` の表示を確認したら Ctrl+C で停止します。

.. code-block:: sh

   uv run --no-project tracd --hostname 127.0.0.1 --port 8000 --single-env "$PWD/project"

systemd で常時起動する
----------------------------------------------

OS 管理者が ``/etc/systemd/system/trac.service`` を作成します。
``ExecStart`` の uv のパスは、``trac`` ユーザーで実行した ``command -v uv`` の結果に合わせてください。
``--basic-auth`` の先頭の ``project`` は Trac のデータディレクトリ名です。

.. code-block::

   [Unit]
   Description=Trac
   After=network.target

   [Service]
   Type=simple
   User=trac
   WorkingDirectory=/home/trac/udi-custom-trac
   ExecStart=/home/trac/.local/bin/uv run --no-project --no-python-downloads tracd --hostname 127.0.0.1 --port 8000 --single-env --basic-auth=project,/home/trac/udi-custom-trac/htpasswd,Trac /home/trac/udi-custom-trac/project
   Restart=on-failure

   [Install]
   WantedBy=multi-user.target

.. code-block::

   sudo systemctl daemon-reload
   sudo systemctl enable --now trac.service
   sudo systemctl status trac.service
   sudo journalctl -u trac.service -n 50

HTTPS で公開する
--------------------------------

公開するホスト名の DNS と TLS 証明書を用意し、同じ VM 上のリバースプロキシから
``127.0.0.1:8000`` に転送します。nginx の場合は、HTTPS 用の ``server`` ブロックに次を追加します。

.. code-block::

   location / {
       proxy_pass http://127.0.0.1:8000;
       proxy_set_header Host $host;
   }

次の項目を ``project/conf/trac.ini`` の既存の ``[trac]`` セクションに設定します。
``trac.example.com`` は実際の公開ホスト名に置き換えます。

.. code-block::

   [trac]
   base_url = https://trac.example.com
   use_base_url_for_redirect = true
   secure_cookies = true
   default_language = ja

プロキシ設定の検証・反映と Trac の再起動後に、公開 URL でページ表示、ログイン、
チケット登録、添付ファイルのアップロードを確認します。日常のバックアップや wheel の交換手順は
`アップグレード手順 <upgrade.html>`__ を参照してください。

ソースから開発・ビルドする
------------------------------------------------------

開発時はソースをチェックアウトしたディレクトリで実行します。
翻訳のコンパイル後に ``uv sync`` で Trac 本体をインストールします。

.. code-block::

   uv python install 3.14
   uv sync --no-install-project
   make PYTHON="uv run --no-sync python" compile
   uv sync
   uv run tracd --version
   make PYTHON="uv run python" wheel

配布用 wheel は ``dist/`` に生成されます。開発時のコマンドやテストは
`開発ガイド <https://github.com/updateit-co-jp/udi-custom-trac/blob/main/AGENTS.md>`__、
データベース、リポジトリ連携、その他の構成は
`インストール原文（英語） <https://github.com/updateit-co-jp/udi-custom-trac/blob/main/INSTALL.rst>`__
を参照してください。
