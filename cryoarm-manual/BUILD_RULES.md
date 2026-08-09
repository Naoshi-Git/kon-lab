# CryoARM Manual — build / publication rules

## 1. 正本

`cryoarm-manual/manual.md` を唯一の内容正本とする。

- 手順、数値、注意事項、版情報を変更するときは **必ず `manual.md` を先に更新する**。
- GitHub Pages上の `cryoarm-manual/index.html` は派生物であり、**直接編集しない**。
- HTMLにだけ存在する手順・数値を作らない。
- Web表示上の装飾、目次、検索、印刷、responsive layoutは `build.py` が担当する。

## 2. Build

```bash
python -m pip install -r cryoarm-manual/requirements.txt
python cryoarm-manual/build.py
```

出力:

```text
dist/cryoarm-manual/index.html
```

HTMLは単一fileで、CSS/JavaScriptを内包する。閲覧時に外部CDNへ依存しない。

## 3. GitHub Pagesへの反映

GitHub Pagesは既存の `gh-pages` branch `/` をsourceとしているため、workflowはrepository全体を置換せず、`gh-pages/cryoarm-manual/` だけを更新する。

`main` の以下が変更されると自動buildする。

- `cryoarm-manual/manual.md`
- `cryoarm-manual/build.py`
- `cryoarm-manual/requirements.txt`
- workflow自身

build失敗時は公開物を更新しない。

## 4. Source traceability

生成HTMLには次を表示する。

- `manual.md` のSHA-256短縮値
- build日時
- Markdown正本へのlink
- Review元である `Naoshi-Git/Git-dir#40` へのlink

これにより、表示中HTMLがどのMarkdownに由来するか判別できる。

## 5. Git-dirとの関係

2026-08-09時点では、内容レビューの作業branchは `Naoshi-Git/Git-dir` PR #40 にある。

Web閲覧版を更新するときは、PR #40で採用された本文変更を `kon-lab/cryoarm-manual/manual.md` へ反映し、その後HTMLを自動生成する。HTMLからMarkdownへ逆輸入しない。

将来、運用上の正本repoを一本化する場合も、**Markdown → generated HTML** の一方向依存を維持する。

## 6. 公開範囲

`Naoshi-Git/Git-dir` はprivate repositoryだが、現状の個人account配下のGitHub Pagesではrepository読者だけに限定したprivate Pagesを構成できない。private Pages access controlはGitHub Enterprise Cloud organization向け機能である。

そのため今回のfallbackとして、既に公開Pagesを運用している `Naoshi-Git/kon-lab` を使用する。

**重要:** `kon-lab` とそのPagesはpublicである。認証情報、個人情報、未公開研究データ、施設外秘情報を `manual.md` に入れない。

## 7. Review rule

本文更新時は最低限、以下を確認する。

1. `manual.md` が意図した内容になっている。
2. `python cryoarm-manual/build.py` がerrorなく完了する。
3. HTMLの目次linkが機能する。
4. mobile幅で表と本文が読める。
5. `manual.md` SHA表示が更新されている。
6. GitHub Pages URLで新versionが閲覧できる。
