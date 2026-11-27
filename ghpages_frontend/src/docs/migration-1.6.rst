本家の Trac 1.6.x から引っ越してくる
==============================================

このフォークは、本家 Trac 1.6 系の利用を続ける中で見つかったセキュリティ上の問題に自分たちで対応し、
必要な修正や開発を本家のリリースを待たずに進めるために始めました。
このページでは、Edgewall の Trac 1.6.x で運用中のプロジェクトを、チケット番号、Wiki の履歴、
添付ファイル、権限を引き継いでフォーク版の 1.8 系へ移行します。

例は Ubuntu 上の単一プロジェクトです。新しいホストに Python 3.14 と uv の実行環境を用意し、
既存環境のコピーに対して更新を実行します。同じホストで作業する場合も、実行環境、プロジェクト、
データベース、待受ポートを分けてください。複数プロジェクトでは、バックアップと更新を各環境に対して行います。

1. 移行元を調べる
----------------------------------------------

旧サービスが実際に使用している ``trac-admin`` の場所と Trac 環境ディレクトリを確認します。
環境ディレクトリは ``conf/trac.ini`` がある場所です。パッケージ導入や mod_wsgi の場合は、
サービス定義や Apache の ``TRAC_ENV``、``TRAC_ENV_PARENT_DIR``、``python-home`` の設定も調べます。
以下のパスは実環境に置き換え、旧環境を扱う OS ユーザーで実行してください。

.. code-block:: sh

   old_admin=/opt/trac-1.6/bin/trac-admin
   old_env=/srv/trac/project
   "$old_admin" --version
   "$old_admin" "$old_env" permission list
   "$old_admin" "$old_env" repository list

- ``[trac] database`` と、``[inherit] file`` など継承先の設定を確認します。接続先や SQLite ファイルの位置を控えます。
- 公開 URL、パス接頭辞（例 ``/trac``）、認証方式、ユーザー名、レルム、SMTP、連携ジョブを記録します。
  Apache や LDAP、SSO が認証を担当している場合は、ログイン名が Trac に渡る経路も確認します。
- 管理画面で有効なプラグインとバージョンを控え、``plugins/``、共有プラグイン、テンプレート、ロゴ、
  カスタム CSS、Git・Subversion リポジトリの保管場所を確認します。旧実行環境のパッケージ一覧や設定も保存します。
- 正常に開けるチケット、古い Wiki リビジョン、添付ファイル、レポート、リポジトリの代表例を控えます。
  管理者、一般ユーザー、匿名ユーザーそれぞれで見える範囲を移行後に比較します。

2. Python とフォーク版の wheel を用意する
------------------------------------------------------

`インストール手順 <install.html#uv-wheel>`__ を参照し、新ホストの ``trac`` ユーザーで uv を導入します。
`GitHub Releases <https://github.com/updateit-co-jp/udi-custom-trac/releases>`__ のリリースノートを確認し、
対象の wheel を選びます。以下を新ホストの ``trac`` ユーザーで実行します。

.. code-block:: sh

   mkdir -p ~/udi-custom-trac
   cd ~/udi-custom-trac
   uv python install 3.14
   uv venv --no-project --python 3.14 --managed-python .venv
   uv pip install --python .venv/bin/python /path/to/trac-X.Y.Z-py3-none-any.whl Babel
   uv pip check --python .venv/bin/python
   uv run --no-project trac-admin --version
   uv run --no-project tracd --version

表示された Trac のバージョンが選んだ wheel と一致することを確認します。
SQLite は Python に同梱されています。PostgreSQL なら ``psycopg2`` または ``psycopg2-binary``、
MySQL なら ``PyMySQL`` を同じ仮想環境に入れます。
``tracd --basic-auth`` で既存の bcrypt 形式の htpasswd を使う場合は、インストール手順と同様に
``passlib`` と ``bcrypt<4.1.0`` を導入します。SHA-256、SHA-512、従来の DES crypt 形式にも ``passlib`` が必要です。

プラグインや Subversion の Python バインディングは、新しい Python 向けのものを用意します。
ソースから入れる拡張やプロジェクト内のプラグインも、更新処理の前に互換性を確認してください。
業務で使うプラグインに移行処理がある場合は、必要なバージョンを入れた状態で ``upgrade`` を実行します。
Apache mod_wsgi を引き続き使う場合は、mod_wsgi 自体が仮想環境と同じ Python でビルドされていることを確認します。
Apache2 をリバースプロキシとして使う構成では、``tracd`` が uv の Python で動きます。

3. 書き込みを止めてバックアップする
------------------------------------------------------

最初はリハーサル用のバックアップを取ります。バックアップを取得する間、旧サービスの書き込みを止めます。
Web の入口をメンテナンス状態に切り替え、旧 Trac のプロセス、受信メール、リポジトリフック、定期ジョブ、
API 連携など、対象環境に書き込む経路を止めます。

旧環境の OS ユーザーで、手順 1 の変数を設定したシェルから次を実行します。
``hotcopy`` の行き先には、まだ存在しないディレクトリを指定してください。

.. code-block:: sh

   umask 077
   backup_dir=$(mktemp -d "$HOME/trac-1.6-backup.XXXXXXXX")
   "$old_admin" "$old_env" hotcopy "$backup_dir/project"

- **SQLite** で DB が環境内にある場合、通常はこのコピーに DB ファイルも含まれます。
  ``[trac] database`` に絶対パスを指定した場合や環境外へのシンボリックリンクがある場合は、
  書き込み停止中に実ファイルも別途保存します。
- **PostgreSQL / MySQL** では Trac のバックアップ結果を確認し、復元に使う DB のダンプを確保します。
  DB 管理者がダンプを別途取得する例は下にあります。クライアントツールと接続設定を用意してください。
- 環境外の htpasswd・htdigest、共有設定、継承したテンプレートやプラグイン、リポジトリとフック、
  Web サーバーや systemd の設定を別途保存します。コピーに含まれるシンボリックリンクの参照先も確認します。
  設定やバックアップには認証情報が含まれるため、転送先でもアクセスを作業者に限定します。

PostgreSQL での取得・復元例です。ホストと DB 名を置き換え、移行先に空の DB を用意します。
復元先で Trac がスキーマの更新に必要な権限を持つよう、復元時のロールと所有者を設定します。

.. code-block:: sh

   pg_dump -h old-db -U trac -Fc -f "$backup_dir/project.pg.dump" trac_old
   pg_restore --exit-on-error --no-owner --no-privileges -h new-db -U trac \
       -d trac_new /path/to/project.pg.dump

MySQL での取得・復元例です。移行先に元の文字セットと照合順序を引き継いだ空の DB を用意します。
各復元コマンドは、ダンプを移行先で読める場所へ移してから実行します。

.. code-block:: sh

   mysqldump -h old-db -u trac -p --single-transaction trac_old > "$backup_dir/project.mysql.sql"
   mysql -h new-db -u trac -p trac_new < /path/to/project.mysql.sql

各コマンドの終了ステータスと出力を確認します。利用中の DB のバージョンに対応した手順は
`PostgreSQL の pg_dump <https://www.postgresql.org/docs/current/app-pgdump.html>`__ または
`MySQL の mysqldump <https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html>`__ を参照してください。
リハーサル用の取得が完了したら旧サービスを再開できます。本番切替では、当日のバックアップ取得から切替判定まで書き込みを停止します。

4. 別の環境に復元して Trac のデータを更新する
------------------------------------------------------

新ホストでは、バックアップを ``trac`` ユーザーが読み取れる場所に転送します。
``~/udi-custom-trac/project`` がまだ存在しない状態で、プロジェクトをコピーします。
``project`` は例のディレクトリ名です。旧環境と同じ名前で単一プロジェクトを運用する場合は、以降のコマンドや
ユニットの ``--basic-auth`` にもその名前を使います。

.. code-block:: sh

   cd ~/udi-custom-trac
   cp -a /path/to/transferred-backup/project "$PWD/project"

新しい ``trac`` ユーザーが環境の設定、DB、添付ファイル、ログの読み書きに必要な権限を持つことを確認します。
OS ユーザーが異なる場合は、OS 管理者が新環境側の所有者とグループを調整します。
``conf/trac.ini`` と継承先の設定、シンボリックリンクを見直し、次を済ませてから新しい ``trac-admin`` を実行してください。

- SQLite ではコピー側のファイルを参照します。環境外から持ち込んだ SQLite ファイルは、
  例えば新環境の ``db/trac.db`` に置いて ``database = sqlite:db/trac.db`` にします。
- PostgreSQL / MySQL では復元済みの新しい DB を接続先に設定します。リハーサルと本番用でも DB を分けます。
  新環境の DB ユーザーの権限や接続制御も変更し、旧本番 DB に接続できないようにします。
- ``[inherit]``、添付ファイルの保管場所、認証ファイル、リポジトリ、ログや静的ファイルの絶対パスを新環境に合わせます。
  リポジトリは別途復元し、フックと CI 連携の向き先を確認します。
- リハーサルでは外部からのアクセスを制限し、SMTP や通知プラグインの送信先を検証用にします。
  連携ジョブやフックは本番システムに書き込まない状態で実施します。

更新するのは復元した環境です。``upgrade`` が失敗したら原因とログを確認し、修正した上で未更新のコピーからやり直します。
新しい ``trac-admin`` が既存のスキーマを判定します。``Database is up to date`` と表示された場合は、その DB の更新は不要です。

.. code-block:: sh

   cd ~/udi-custom-trac
   uv run --no-project trac-admin "$PWD/project" upgrade
   uv run --no-project trac-admin "$PWD/project" permission list
   uv run --no-project trac-admin "$PWD/project" repository list

同梱 Wiki のヘルプを更新する場合は ``uv run --no-project trac-admin "$PWD/project" wiki upgrade`` を実行します。
Web サーバーが ``/chrome/`` の静的ファイルを直接配信する場合は、
``uv run --no-project trac-admin "$PWD/project" deploy /path/to/new-deploy`` で生成し、配信先を切り替えます。
リポジトリのキャッシュ再同期が必要な場合は、パスと読み取り権限を確認してから
``uv run --no-project trac-admin "$PWD/project" repository resync <リポジトリ名>`` を実行します。

5. リハーサルで動作を照合する
------------------------------------------------------

`インストール手順 <install.html#systemd-daemon-trac>`__ のユニットを新環境のパスに合わせ、
`HTTPS 公開ガイド <https.html>`__ の構成を選びます。旧環境が ``/trac`` などの接頭辞を使っていた場合は、
``tracd --base-path``、プロキシの転送設定、``[trac] base_url`` に同じ接頭辞を反映し、既存のリンクを確認します。
旧サイトが Apache の外部認証を使う場合は、そのログイン名が新環境でも同じになるよう、検証時に認証を組み込んでください。
既存の htpasswd を引き継ぐ場合はサービスの ``--basic-auth`` にそのファイルを指定します。
Digest 認証を引き継ぐ場合は代わりに ``--auth`` を使い、``プロジェクト名,htdigest のパス,旧レルム`` を指定します。
認証方式を変更する場合は、管理画面で権限を確認する前に、既存の Trac ユーザー名との対応を確認します。

- ログイン・ログアウト、管理画面の操作、一般ユーザーと匿名ユーザーの閲覧・書き込み権限を旧環境と比較します。
- チケット番号、コメント・変更履歴、カスタムフィールド、ワークフロー、レポートを確認します。
- Wiki の履歴と添付ファイル、チケットの旧添付を開き、テスト用のチケット・Wiki・添付の作成や更新も試します。
- Git・Subversion の参照、変更セットへのリンク、通知、プラグイン、外部連携を確認します。
- Trac と Web サーバーのログにエラーがないことを確認し、バックアップの復元と旧構成への切り戻しを試します。

6. 本番を切り替える
------------------------------------------------------

1. 停止時間を案内し、旧サービスと連携ジョブを止めます。手順 3 のバックアップをこの時点で取り直します。
2. 手順 4 を当日のコピーと新しい空の DB に対して実行します。リハーサル中に作ったチケットなどが本番へ入らないよう、
   本番用の環境とリハーサル用の環境を別にします。
3. プロキシの転送先や DNS を切り替えます。ホスト名やパスを変える場合はリダイレクトを設定し、既存リンクが開くことを確認します。
   切替中は旧環境と新環境の両方に利用者が書き込める状態を避けます。
4. 作業者だけで HTTPS、ログイン、閲覧、書き込み、添付とログを確認します。確認後に利用者のアクセスと本番連携を再開します。
5. 旧サービス、旧プロジェクト、旧 DB、停止直後のバックアップは、切り戻しに備えて保持します。

7. 問題があれば切り戻す
------------------------------------------------------

新サービスと連携ジョブを止め、公開 URL の向き先を旧サービスに戻します。
旧バージョンは旧プロジェクトと旧 DB の組み合わせで起動します。旧データを変更していた場合は、
切替直前のプロジェクトと DB を組にして復元します。
旧環境でログイン、チケット表示、添付ダウンロード、書き込みを確認し、連携ジョブを再開します。

切替後に新環境で利用者の更新があった場合は、新環境のプロジェクトと DB も保全します。
更新差分を確認し、旧環境に反映する方法を決めてから利用者の書き込みを再開してください。

移行後のフォーク版の更新は `アップグレード手順 <upgrade.html>`__ を参照してください。
