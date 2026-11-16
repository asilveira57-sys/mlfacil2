"""Gera public/sitemap.xml. Uso: python3 sitemap.py dados.json
dados.json = {"posts":["slug|AAAA-MM-DD"], "cats":["slug"], "help":[...], "tips":[...]}
Os dados vêm de consultas ao banco (só posts publicados com data <= hoje)."""
import json, sys, datetime
BASE = "https://www.mktpfacil.com"
d = json.load(open(sys.argv[1]))
today = datetime.date.today().isoformat()
urls = []
def add(path, lastmod=today, freq="weekly", prio="0.6"):
    urls.append((path, lastmod, freq, prio))
add("/", freq="weekly", prio="1.0")
add("/planos", prio="0.9")
add("/blog", freq="daily", prio="0.9")
add("/ferramentas", prio="0.8")
for t in ["precificacao", "comissoes", "zpl", "tendencias"]:
    add(f"/ferramentas/{t}", prio="0.8")
add("/consultoria", prio="0.7")
for m in ["gestao-anuncios", "dashboard-analises", "precificacao-custos", "radiografia-seed",
          "tendencias-concorrencia", "automacoes-alertas"]:
    add(f"/modulo/{m}", freq="monthly", prio="0.7")
for c in d.get("cats", []):
    add(f"/blog/categoria/{c}", freq="weekly", prio="0.6")
for p in d.get("posts", []):
    s, lm = p.split("|"); add(f"/blog/{s}", lm, "monthly", "0.8")
add("/central-de-ajuda", freq="monthly", prio="0.5")
for p in d.get("help", []):
    s, lm = p.split("|"); add(f"/central-de-ajuda/{s}", lm, "monthly", "0.4")
for p in d.get("tips", []):
    s, lm = p.split("|"); add(f"/dica/{s}", lm, "monthly", "0.5")
add("/contato", freq="yearly", prio="0.3")
for p in ["/termos-de-uso", "/politica-de-privacidade", "/politica-de-cookies", "/lgpd"]:
    add(p, freq="yearly", prio="0.2")
out = ['<?xml version="1.0" encoding="UTF-8"?>',
       '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for path, lm, f, pr in urls:
    out.append(f"  <url><loc>{BASE}{path}</loc><lastmod>{lm}</lastmod><changefreq>{f}</changefreq><priority>{pr}</priority></url>")
out.append("</urlset>")
open("public/sitemap.xml", "w").write("\n".join(out) + "\n")
print(len(urls), "URLs")
