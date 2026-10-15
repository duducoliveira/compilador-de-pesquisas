#!/usr/bin/env python3
"""Gera dist/compilador.html: a página com dados e código embutidos num único arquivo.

Útil para enviar por e-mail ou publicar em qualquer lugar sem a pasta data/.
Com --fragmento, gera só o conteúdo (sem <html>/<head>/<body>), para hospedagens
que montam o documento por conta própria.
"""
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def trecho(texto: str, nome: str) -> str:
    m = re.search(rf"<!-- artifact:{nome}:start -->(.*?)<!-- artifact:{nome}:end -->", texto, re.S)
    return m.group(1).strip()


def main():
    html = (RAIZ / "index.html").read_text(encoding="utf-8")
    dados = (RAIZ / "data" / "pesquisas.js").read_text(encoding="utf-8")
    app = (RAIZ / "app.js").read_text(encoding="utf-8")
    scripts = trecho(html, "scripts")
    scripts = scripts.replace('<script src="data/pesquisas.js"></script>', f"<script>\n{dados}</script>")
    scripts = scripts.replace('<script src="app.js"></script>', f"<script>\n{app}</script>")
    if "--fragmento" in sys.argv:
        pagina = "\n".join([trecho(html, "head"), trecho(html, "body"), scripts]) + "\n"
        saida = RAIZ / "dist" / "compilador-fragmento.html"
    else:
        inicio, fim = html.index("<!-- artifact:scripts:start -->"), html.index("<!-- artifact:scripts:end -->")
        pagina = html[:inicio] + scripts + html[fim + len("<!-- artifact:scripts:end -->"):]
        saida = RAIZ / "dist" / "compilador.html"
    saida.parent.mkdir(exist_ok=True)
    saida.write_text(pagina, encoding="utf-8")
    print(f"{saida.relative_to(RAIZ)} ({len(pagina) // 1024} KB)")


if __name__ == "__main__":
    main()
