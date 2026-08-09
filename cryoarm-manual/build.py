#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import html
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from markdown_it import MarkdownIt

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "manual.md"
OUTPUT = ROOT.parent / "dist" / "cryoarm-manual" / "index.html"


def split_frontmatter(text: str):
    meta = {}
    if not text.startswith("---\n"):
        return meta, text
    end = text.find("\n---\n", 4)
    if end == -1:
        return meta, text
    front = text[4:end]
    body = text[end + 5 :]
    for line in front.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, body


def slug(text: str, used: set[str], fallback: str):
    s = re.sub(r"<[^>]+>", "", text)
    s = re.sub(r"[^0-9A-Za-zぁ-んァ-ヶ一-龠々ー]+", "-", s).strip("-").lower()
    if not s:
        s = fallback
    base = s
    n = 2
    while s in used:
        s = f"{base}-{n}"
        n += 1
    used.add(s)
    return s


def build():
    source_text = SOURCE.read_text(encoding="utf-8")
    meta, body = split_frontmatter(source_text)
    digest = hashlib.sha256(source_text.encode("utf-8")).hexdigest()[:12]

    md = MarkdownIt("commonmark", {"html": True, "linkify": True, "typographer": False}).enable("table")
    tokens = md.parse(body)

    toc = []
    used = set()
    heading_index = 0
    for i, tok in enumerate(tokens):
        if tok.type == "heading_open" and tok.tag in {"h2", "h3"}:
            heading_index += 1
            title = tokens[i + 1].content if i + 1 < len(tokens) else f"Section {heading_index}"
            hid = slug(title, used, f"section-{heading_index}")
            tok.attrSet("id", hid)
            toc.append((2 if tok.tag == "h2" else 3, hid, title))

    article = md.renderer.render(tokens, md.options, {})
    toc_html = "\n".join(
        f'<a class="toc-link level-{level}" href="#{hid}" data-title="{html.escape(title.lower())}">{html.escape(title)}</a>'
        for level, hid, title in toc
    )

    title = meta.get("title", "CryoARM 撮影一気通貫マニュアル")
    status = meta.get("status", "draft")
    updated = meta.get("updated", "")
    basis = meta.get("basis", "")
    scope = meta.get("scope", "")
    source_pr = meta.get("source_pr", "")
    built = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    pr_url = "https://github.com/Naoshi-Git/Git-dir/pull/40"
    md_url = "https://github.com/Naoshi-Git/kon-lab/blob/main/cryoarm-manual/manual.md"

    page = f'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>{html.escape(title)} | Kon-Lab</title>
<style>
:root{{--bg:#f4f7fb;--surface:#fff;--surface2:#f8fafc;--text:#172033;--muted:#64748b;--line:#dce3ed;--accent:#175cd3;--accent2:#0b4aa2;--warn:#9a3412;--warnbg:#fff7ed;--ok:#166534;--code:#eef2f7;--shadow:0 10px 30px rgba(15,23,42,.08)}}
[data-theme="dark"]{{--bg:#0f172a;--surface:#111c30;--surface2:#162238;--text:#e5edf8;--muted:#9fb0c7;--line:#2b3a52;--accent:#73a7ff;--accent2:#9bc0ff;--warn:#fdba74;--warnbg:#341b11;--ok:#86efac;--code:#1b2940;--shadow:none}}
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP","Hiragino Sans",Meiryo,sans-serif;line-height:1.78}}
#progress{{position:fixed;top:0;left:0;height:3px;background:var(--accent);z-index:100;width:0}}
.topbar{{position:sticky;top:0;z-index:80;height:58px;background:color-mix(in srgb,var(--surface) 92%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;padding:0 18px}}
.brand{{font-weight:800;white-space:nowrap}}.topbar .spacer{{flex:1}}button,.source-btn{{border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:9px;padding:8px 11px;font:inherit;font-size:13px;text-decoration:none;cursor:pointer}}button:hover,.source-btn:hover{{border-color:var(--accent)}}
.layout{{display:grid;grid-template-columns:292px minmax(0,860px);gap:28px;max-width:1240px;margin:0 auto;padding:28px 22px 80px}}
.sidebar{{position:sticky;top:86px;align-self:start;max-height:calc(100vh - 110px);overflow:auto;padding:2px 5px 30px}}
.search{{width:100%;border:1px solid var(--line);background:var(--surface);color:var(--text);padding:10px 12px;border-radius:10px;margin-bottom:12px;font:inherit}}
.toc-title{{font-size:12px;color:var(--muted);font-weight:700;letter-spacing:.08em;margin:10px 8px}}
.toc-link{{display:block;text-decoration:none;color:var(--muted);border-left:2px solid transparent;padding:6px 9px;font-size:13px;line-height:1.4}}.toc-link.level-3{{padding-left:22px;font-size:12px}}.toc-link:hover,.toc-link.active{{color:var(--accent);border-left-color:var(--accent);background:color-mix(in srgb,var(--accent) 7%,transparent)}}
.hero{{background:linear-gradient(145deg,var(--surface),var(--surface2));border:1px solid var(--line);border-radius:20px;padding:28px 30px;box-shadow:var(--shadow);margin-bottom:22px}}
.eyebrow{{font-size:12px;font-weight:800;color:var(--accent);letter-spacing:.08em;text-transform:uppercase}}h1{{font-size:clamp(27px,4vw,40px);line-height:1.25;margin:.3em 0 .5em}}.lead{{color:var(--muted);margin:0 0 20px}}
.meta{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}}.meta-card{{border:1px solid var(--line);background:var(--surface);border-radius:11px;padding:10px 12px}}.meta-k{{display:block;font-size:10px;text-transform:uppercase;color:var(--muted);letter-spacing:.07em}}.meta-v{{display:block;font-size:13px;font-weight:700;margin-top:2px;overflow-wrap:anywhere}}
.notice{{margin-top:18px;border-left:4px solid #f59e0b;background:var(--warnbg);color:var(--text);padding:12px 15px;border-radius:8px;font-size:13px}}
article{{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:34px clamp(22px,5vw,54px);box-shadow:var(--shadow)}}
article h1{{display:none}}article h2{{font-size:25px;line-height:1.35;margin:2.5em 0 .8em;padding-top:15px;border-top:1px solid var(--line)}}article h2:first-of-type{{margin-top:.5em;border-top:0}}article h3{{font-size:18px;margin:2em 0 .7em}}article p,article li{{font-size:15px}}article strong{{font-weight:800}}article a{{color:var(--accent)}}article hr{{border:0;border-top:1px solid var(--line);margin:36px 0}}
article blockquote{{margin:20px 0;border-left:4px solid var(--accent);background:color-mix(in srgb,var(--accent) 6%,var(--surface));padding:14px 18px;border-radius:7px;color:var(--text)}}article blockquote p{{margin:.4em 0}}
code{{font-family:"SFMono-Regular",Consolas,monospace;background:var(--code);padding:.15em .38em;border-radius:5px;font-size:.9em;overflow-wrap:anywhere}}pre{{overflow:auto;background:var(--code);padding:16px;border-radius:10px}}pre code{{padding:0}}
table{{width:100%;border-collapse:separate;border-spacing:0;margin:18px 0 25px;font-size:14px;border:1px solid var(--line);border-radius:10px;overflow:hidden}}th,td{{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}}th{{background:var(--surface2);font-weight:800}}tr:last-child td{{border-bottom:0}}
ul,ol{{padding-left:1.6em}}li{{margin:.28em 0}}
.footer{{color:var(--muted);font-size:12px;padding:18px 5px;text-align:center}}
@media(max-width:950px){{.layout{{grid-template-columns:1fr;max-width:900px}}.sidebar{{position:relative;top:auto;max-height:none;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px}}.toc-links{{max-height:260px;overflow:auto}}.meta{{grid-template-columns:repeat(2,1fr)}}}}
@media(max-width:600px){{.topbar{{padding:0 10px}}.brand{{font-size:13px}}.hide-sm{{display:none}}.layout{{padding:14px 10px 55px;gap:14px}}.hero,article{{border-radius:14px;padding:20px 17px}}.meta{{grid-template-columns:1fr 1fr}}article h2{{font-size:21px}}table{{display:block;overflow-x:auto;white-space:normal}}}}
@media print{{.topbar,.sidebar,#progress,.notice{{display:none!important}}body{{background:white;color:black}}.layout{{display:block;padding:0;max-width:none}}.hero,article{{box-shadow:none;border:0;padding:0}}article h2{{break-after:avoid}}a{{color:black!important;text-decoration:none}}}}
</style>
</head>
<body>
<div id="progress"></div>
<header class="topbar"><div class="brand">CryoARM Manual</div><span class="spacer"></span><a class="source-btn hide-sm" href="{md_url}">MD正本</a><a class="source-btn hide-sm" href="{pr_url}">Review PR</a><button onclick="window.print()">印刷</button><button id="themeBtn" aria-label="テーマ切替">◐</button></header>
<div class="layout">
<aside class="sidebar"><input id="tocSearch" class="search" type="search" placeholder="目次を検索…"><div class="toc-title">CONTENTS</div><nav class="toc-links">{toc_html}</nav></aside>
<main>
<section class="hero"><div class="eyebrow">Kon-Lab / Cryo-EM SOP</div><h1>{html.escape(title)}</h1><p class="lead">260809手書き最終版を第一根拠として整理した、Sample登録から自動撮影初期確認までの連続手順。</p><div class="meta">
<div class="meta-card"><span class="meta-k">STATUS</span><span class="meta-v">{html.escape(status.upper())}</span></div>
<div class="meta-card"><span class="meta-k">UPDATED</span><span class="meta-v">{html.escape(updated)}</span></div>
<div class="meta-card"><span class="meta-k">BASIS</span><span class="meta-v">{html.escape(basis)}</span></div>
<div class="meta-card"><span class="meta-k">SOURCE</span><span class="meta-v">SHA256 {digest}</span></div>
</div><div class="notice"><strong>公開範囲:</strong> このURLはGitHub Pages上の公開サイトです。個人情報、認証情報、未公開研究データなどの機密情報は記載しないでください。</div></section>
<article id="manual">{article}</article>
<div class="footer">Markdown is canonical · generated {built} · source {digest} · {html.escape(source_pr)}</div>
</main></div>
<script>
const root=document.documentElement;const saved=localStorage.getItem('cryo-theme');if(saved)root.dataset.theme=saved;
document.getElementById('themeBtn').onclick=()=>{{const next=root.dataset.theme==='dark'?'light':'dark';root.dataset.theme=next;localStorage.setItem('cryo-theme',next)}};
const search=document.getElementById('tocSearch');search.addEventListener('input',()=>{{const q=search.value.trim().toLowerCase();document.querySelectorAll('.toc-link').forEach(a=>{{a.style.display=(!q||a.dataset.title.includes(q))?'block':'none'}})}});
const links=[...document.querySelectorAll('.toc-link')];const heads=links.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);
const obs=new IntersectionObserver(entries=>{{entries.forEach(e=>{{if(e.isIntersecting){{links.forEach(a=>a.classList.remove('active'));const a=document.querySelector(`.toc-link[href="#${{e.target.id}}"]`);if(a)a.classList.add('active')}}}})}},{{rootMargin:'-18% 0px -72% 0px'}});heads.forEach(h=>obs.observe(h));
window.addEventListener('scroll',()=>{{const h=document.documentElement;const max=h.scrollHeight-h.clientHeight;document.getElementById('progress').style.width=(max?100*h.scrollTop/max:0)+'%'}},{{passive:true}});
</script>
</body></html>'''

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(page, encoding="utf-8")
    print(f"built {OUTPUT} from {SOURCE} sha256={digest}")


if __name__ == "__main__":
    try:
        build()
    except Exception as exc:
        print(f"build failed: {exc}", file=sys.stderr)
        raise
