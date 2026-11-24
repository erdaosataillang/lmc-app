# lmc-app
## フロントエンドの公開

`app.urakatabu.com` は複数アプリ共用です。LMCだけのファイルでHostingをデプロイすると、他のアプリが削除されます。

公開には [ポータルのリポジトリ](https://github.com/erdaosataillang/festival-radios) の最新mainを使い、そこで `node scripts/prepare-pages.mjs` → `firebase deploy --only hosting:portal --project urakata-app --non-interactive` を実行します。LMCの最新mainと全アプリをまとめて構築し、公開済みアプリの欠落を検査します。検査を省略しないでください。このリポジトリからはFunctions・Firestoreの明示した対象だけを公開します。
