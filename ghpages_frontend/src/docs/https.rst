HTTPS で公開する
============================

`インストール手順 <install.html>`__ の単一プロジェクトを HTTPS で公開します。
Apache2 に証明書の管理と HTTP からの転送を任せる方法と、``tracd`` が直接 TLS 接続を受ける方法があります。
どちらの場合も、公開ホスト名の DNS と、そのホスト名に対して利用者のブラウザーが信頼する TLS 証明書を用意します。

Trac の公開 URL と Cookie を設定する
------------------------------------------------------

``/home/trac/udi-custom-trac/project/conf/trac.ini`` の既存の ``[trac]`` セクションに次を設定します。
``base_url`` には利用者が開く URL を指定します。8443 番で直接公開する場合は
``https://trac.example.com:8443`` にします。

.. code-block:: ini

   [trac]
   base_url = https://trac.example.com
   use_base_url_for_redirect = true
   secure_cookies = true

Apache2 を介して公開する
----------------------------------------------

Ubuntu 上の Apache2 が 443 番で HTTPS を受け、同じ VM の ``127.0.0.1:8000`` に転送する例です。
インストール手順の ``trac.service`` を使い、``tracd`` はループバックで待ち受けます。
認証も同手順の ``tracd --basic-auth`` で行います。

OS 管理者が Apache2 に次の仮想ホストを ``/etc/apache2/sites-available/trac.conf`` として設定します。
ホスト名と証明書のパスは実環境に合わせてください。80 番を開ける場合は、例のように HTTPS への転送に使います。

.. code-block:: apache

   <VirtualHost *:80>
       ServerName trac.example.com
       Redirect permanent / https://trac.example.com/
   </VirtualHost>

   <VirtualHost *:443>
       ServerName trac.example.com
       SSLEngine on
       SSLCertificateFile /etc/ssl/certs/trac-fullchain.pem
       SSLCertificateKeyFile /etc/ssl/private/trac-key.pem

       ProxyRequests Off
       ProxyPreserveHost On
       ProxyPass        / http://127.0.0.1:8000/
       ProxyPassReverse / http://127.0.0.1:8000/
   </VirtualHost>

.. code-block:: sh

   sudo a2enmod ssl proxy proxy_http alias
   sudo a2ensite trac.conf
   sudo apache2ctl configtest
   sudo systemctl restart trac.service
   sudo systemctl reload apache2

ファイアウォールでは公開用の 443 番と、転送を使う場合の 80 番を許可します。
証明書を更新したら Apache2 を再読み込みします。
各設定項目は `Apache のリバースプロキシの資料 <https://httpd.apache.org/docs/2.4/howto/reverse_proxy.html>`__ を参照してください。

Trac だけで公開する
----------------------------------------------

``tracd`` の ``--protocol https``、``--certfile``、``--keyfile`` を使います。
証明書ファイルにはサーバー証明書と必要な中間証明書を PEM 形式で用意します。
秘密鍵は ``trac`` サービスユーザーが読める場所に配置し、そのユーザーと OS 管理者にアクセスを限定します。
以下は 8443 番で待ち受ける例です。``0.0.0.0`` は全 IPv4 インターフェースで待ち受ける指定です。
公開範囲に合わせて待受アドレスとファイアウォールを設定してください。

OS 管理者が ``sudo systemctl edit trac.service`` を実行し、既存ユニットの起動コマンドを次のように上書きします。
空の ``ExecStart=`` で元のコマンドを取り消し、次の行で HTTPS 用のコマンドを指定します。

.. code-block::

   [Service]
   ExecStart=
   ExecStart=/home/trac/.local/bin/uv run --no-project --no-python-downloads tracd --protocol https --certfile /etc/trac/tls/fullchain.pem --keyfile /etc/trac/tls/privkey.pem --hostname 0.0.0.0 --port 8443 --single-env --basic-auth=project,/home/trac/udi-custom-trac/htpasswd,Trac /home/trac/udi-custom-trac/project

標準の 443 番を使う場合は、そのポートが空いていることを確認し、``--port 443`` に変更します。
一般ユーザーによる 443 番の待受が制限されている環境では、同じ ``[Service]`` に次を追加し、
``User=trac`` のサービスに低位ポートの待受権限を付与します。

.. code-block::

   AmbientCapabilities=CAP_NET_BIND_SERVICE
   CapabilityBoundingSet=CAP_NET_BIND_SERVICE

.. code-block:: sh

   sudo systemctl daemon-reload
   sudo systemctl restart trac.service
   sudo systemctl status trac.service
   sudo journalctl -u trac.service -n 50

利用者には HTTPS の URL を案内します。この構成の待受ポートは HTTPS 専用です。
証明書を更新したら、更新済みの証明書と秘密鍵を所定の場所に配置して ``trac.service`` を再起動します。
利用できる起動オプションは、``trac`` ユーザーで ``uv run --no-project tracd --help`` を実行すると確認できます。

公開後に確認する
----------------------------------------------

- ブラウザーで公開 URL を開き、証明書のホスト名・有効期限・信頼チェーンを確認します。
- ログイン後の遷移先が公開 URL になり、ログアウト、チケット登録、添付ファイルのアップロードと取得ができることを確認します。
- Apache2 を介する場合は、別ホストから Trac のバックエンド用ポートへ接続できないことを確認します。
