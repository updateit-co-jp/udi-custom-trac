アップグレード手順
============================

uv で運用している Trac を配布 wheel で更新する手順です。
本家 Trac 1.6.x から移行する場合は `本家の Trac 1.6.x から引っ越してくる <migration-1.6.html>`__ を参照してください。
以下では `インストール手順 <install.html>`__ の構成を例にします。別の構成では
サービス名、仮想環境、プロジェクト、wheel のパスを実際のものに置き換えます。

更新前に確認する
--------------------------------

- `GitHub Releases <https://github.com/updateit-co-jp/udi-custom-trac/releases>`__ から
  更新先の wheel とリリースノートを取得します。戻すときに備えて旧 wheel と依存パッケージも確保します。
- `UPGRADE.rst（英語の原文） <https://github.com/updateit-co-jp/udi-custom-trac/blob/main/UPGRADE.rst>`__ の
  ``pip`` の手順は、このフォークの運用対象外です。この手順書の ``uv pip`` と ``uv run --no-project`` を使ってください。
- Trac 1.8 系には Python 3.13 以上が必要です。この手順では uv 管理の Python 3.14 を使います。
  更新時に Python も切り替える場合は、事前に別の作業ディレクトリに Python 3.14 の仮想環境を
  用意し、新しい wheel と必要な依存パッケージを入れてください。
- プラグイン、データベースドライバー、Subversion の Python バインディングを使っている場合は、
  更新先の Trac と Python で動作する組み合わせを確認します。
  本番のバックアップを復元した検証環境で、更新と復旧を試してから作業します。

サービスを停止してバックアップする
------------------------------------------------------------------

OS 管理者がサービスを停止し、利用者からの書き込みを止めます。

.. code-block::

   sudo systemctl stop trac.service

``trac`` ユーザーで、更新前の仮想環境を使ってバックアップします。
``hotcopy`` の出力先には、まだ存在しないディレクトリを指定してください。

.. code-block::

   cd ~/udi-custom-trac
   mkdir -p "$PWD/backups"
   backup_id=$(date +%Y%m%d-%H%M%S)
   uv run --no-project trac-admin "$PWD/project" hotcopy "$PWD/backups/project-$backup_id"
   uv pip freeze --python .venv/bin/python > "$PWD/backups/python-$backup_id.txt"

既存環境が uv 以外で作られている場合も、バックアップには現在使っている環境の
``trac-admin`` を使用します。認証ファイルやプロジェクト外の設定・データも別途保存し、
PostgreSQL や MySQL を使っている場合はデータベースの復元手順も確認します。
バックアップが完了したことを確認してから更新に進みます。

新しい wheel とプロジェクトを更新する
----------------------------------------------------------------------

同じ Python を使う場合は、``trac`` ユーザーで、サービスが使う ``.venv`` に
更新先の wheel をインストールします。

.. code-block::

   uv pip install --python .venv/bin/python --upgrade /path/to/trac-X.Y.Z-py3-none-any.whl

Python も切り替える場合は、上で用意した新しい作業ディレクトリで以降のコマンドを実行し、
``trac.service`` の ``WorkingDirectory`` をそのディレクトリに更新します。
プロジェクトや認証ファイルには実際に保存されている絶対パスを指定します。
ユニットを編集した場合は、サービスの起動前に OS 管理者が ``sudo systemctl daemon-reload``
を実行します。

仮想環境の依存関係と Trac のバージョンを確認します。

.. code-block::

   uv pip check --python .venv/bin/python
   uv run --no-project tracd --version

表示されたバージョンが更新先と一致したら、プロジェクトを更新します。
以下は元の作業ディレクトリで実行する場合の例です。

.. code-block::

   uv run --no-project trac-admin "$PWD/project" upgrade

同梱 Wiki ドキュメントを更新する場合は、続けて
``uv run --no-project trac-admin "$PWD/project" wiki upgrade`` を実行します。
``upgrade`` が失敗した場合は、サービスを停止したままエラーを確認します。

再起動と確認
------------------------

OS 管理者がサービスを起動し、状態とログを確認します。

.. code-block::

   sudo systemctl start trac.service
   sudo systemctl status trac.service
   sudo journalctl -u trac.service -n 50

公開 URL でログイン、チケット閲覧・登録、添付ファイル、日本語表示、利用中のプラグインを確認します。
復旧が必要な場合はサービスを止め、旧バージョンの実行環境と更新前のプロジェクト・データベースを
セットで復元してから起動します。

旧バージョン固有の移行作業は、
`アップグレード原文（英語） <https://github.com/updateit-co-jp/udi-custom-trac/blob/main/UPGRADE.rst>`__
も参照してください。
