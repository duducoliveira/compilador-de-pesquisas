#!/usr/bin/env python3
"""Baixa e normaliza as pesquisas de intenção de voto para Presidente (Brasil 2026).

Fonte: página da Wikipédia "Opinion polling for the 2026 Brazilian presidential
election", que compila as pesquisas divulgadas pelos institutos com link para a
fonte original de cada uma.

Uso:
    python3 scripts/atualizar_dados.py               # baixa da Wikipédia
    python3 scripts/atualizar_dados.py arquivo.wiki  # usa wikitext local

Gera data/pesquisas.json e data/pesquisas.js (o .js permite abrir o
index.html direto do disco, sem servidor).
"""
from __future__ import annotations

import datetime as dt
import html
import itertools
import json
import re
import sys
import urllib.request
from pathlib import Path

PAGINA = "Opinion_polling_for_the_2026_Brazilian_presidential_election"
URL_RAW = f"https://en.wikipedia.org/wiki/{PAGINA}?action=raw"
URL_PAGINA = f"https://en.wikipedia.org/wiki/{PAGINA}"
USER_AGENT = "compilador-de-pesquisas/1.0 (https://github.com/duducoliveira/compilador-de-pesquisas)"

RAIZ = Path(__file__).resolve().parent.parent
SAIDA_JSON = RAIZ / "data" / "pesquisas.json"
SAIDA_JS = RAIZ / "data" / "pesquisas.js"

MESES = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}

# Partidos: nome do artigo na Wikipédia em inglês -> sigla usada no Brasil
SIGLAS = {
    "Mission": "Missão", "Repub.": "Republicanos",
    "Workers' Party (Brazil)": "PT", "Liberal Party (Brazil, 2006)": "PL",
    "Republicans (Brazil)": "Republicanos", "Brazilian Social Democracy Party": "PSDB",
    "Social Democratic Party (Brazil, 2011)": "PSD", "New Party (Brazil)": "Novo",
    "Brazil Union": "União Brasil", "Avante (political party)": "Avante",
    "Mission Party (Brazil)": "Missão",
}

# Nome curto usado na Wikipédia -> nome como é conhecido no Brasil
NOMES = {
    "F. Bolsonaro": "Flávio Bolsonaro", "Freitas": "Tarcísio", "Santos": "Renan Santos",
    "Gomes": "Ciro Gomes", "Ratinho": "Ratinho Jr.", "Leite": "Eduardo Leite",
    "Cury": "Augusto Cury", "Caiado": "Caiado", "Zema": "Zema", "Lula": "Lula",
}

# Tradução dos eventos mais comuns que aparecem como marcos nas tabelas
EVENTOS_PT = [
    (r"^First round of the elections", "1º turno das eleições"),
    (r"^Last day of free electoral broadcast", "Último dia do horário eleitoral gratuito"),
    (r"^Beginning of free electoral broadcast", "Início do horário eleitoral gratuito"),
    (r"^Beginning of the election campaign", "Início oficial da campanha"),
    (r"^Deadline for the registration of candidacies", "Prazo para registro das candidaturas"),
    (r"^Beginning of the institutional crisis at the Supreme Federal Court", "Início da crise institucional no STF"),
    (r"^Beginning of the period for party conventions", "Início do período de convenções partidárias"),
    (r"^Electoral resignation deadline", "Prazo de desincompatibilização"),
    (r"^Leaked audio recordings linked Fl[áa]vio Bolsonaro to Daniel Vorcaro",
     "Vazamento de áudios ligando Flávio Bolsonaro a Daniel Vorcaro (caso Banco Master)"),
    (r"^The Workers' Party's National Convention formally nominated Lula",
     "Convenção do PT oficializa Lula, com Alckmin de vice"),
    (r"^The Mission Party's National Convention officially nominated Renan Santos",
     "Convenção do Missão oficializa Renan Santos"),
    (r"^Ratinho J[úu]nior withdraws", "Ratinho Júnior desiste da candidatura"),
    (r"^PSD selects Ronaldo Caiado", "PSD escolhe Ronaldo Caiado como candidato"),
    (r"^Jair Bolsonaro is sentenced", "Jair Bolsonaro é condenado a 27 anos de prisão por trama golpista"),
    (r"^Jair Bolsonaro is arrested", "Jair Bolsonaro é preso pela Polícia Federal"),
    (r"^Fl[áa]vio Bolsonaro announces his candidacy", "Flávio Bolsonaro anuncia pré-candidatura com apoio do pai"),
    (r"^Ronaldo Caiado joins the PSD", "Ronaldo Caiado se filia ao PSD"),
    (r"^Avante announced the candidacy", "Avante anuncia pré-candidatura de Augusto Cury"),
    (r"^Ciro Gomes .* Governor of Cear", "Ciro Gomes confirma candidatura ao governo do Ceará"),
    (r"^A[ée]cio Neves .* rules out", "Aécio Neves (PSDB) descarta candidatura"),
    (r"^Liberal Party's National Convention", "Convenção do PL oficializa Flávio Bolsonaro"),
    (r"^Social Democratic Party's National Convention", "Convenção do PSD oficializa Ronaldo Caiado"),
    (r"^New Party's National Convention", "Convenção do Novo oficializa Romeu Zema"),
    (r"^Avante's National Convention", "Convenção do Avante oficializa Augusto Cury"),
    (r"^First televised presidential debate", "1º debate presidencial na TV"),
]


# --------------------------------------------------------------------------
# Utilidades de wikitext
# --------------------------------------------------------------------------

def baixar_wikitext() -> str:
    req = urllib.request.Request(URL_RAW, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8")


def remover_refs(texto: str) -> str:
    texto = re.sub(r"<ref[^>/]*/>", "", texto)
    texto = re.sub(r"<ref[^>]*>.*?</ref>", "", texto, flags=re.S)
    return texto


def remover_templates(texto: str) -> str:
    """Remove {{...}} (aninhados), preservando {{small|X}} como X."""
    texto = re.sub(r"\{\{small\|([^{}]*)\}\}", r"\1", texto)
    anterior = None
    while anterior != texto:
        anterior = texto
        texto = re.sub(r"\{\{[^{}]*\}\}", "", texto)
    return texto


def texto_limpo(wik: str) -> str:
    t = remover_refs(wik)
    t = remover_templates(t)
    t = re.sub(r"\[\[(?:File|Image):[^\]]*\]\]", "", t)
    t = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[\[([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[https?://\S+\s*([^\]]*)\]", r"\1", t)
    t = re.sub(r"<br\s*/?>|<hr\s*/?>", " ", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("''", "")
    t = html.unescape(t)
    return re.sub(r"\s+", " ", t).strip()


def dividir_celula(linha: str) -> tuple[str, str]:
    """Separa 'atributos | conteúdo' de uma célula (ignorando | dentro de [[ ]] e {{ }})."""
    prof = 0
    i = 0
    while i < len(linha):
        par = linha[i:i + 2]
        if par in ("[[", "{{"):
            prof += 1
            i += 2
            continue
        if par in ("]]", "}}"):
            prof -= 1
            i += 2
            continue
        if linha[i] == "|" and prof == 0:
            return linha[:i], linha[i + 1:]
        i += 1
    return "", linha


def atributo_int(attrs: str, nome: str) -> int:
    m = re.search(nome + r'\s*=\s*"?(\d+)', attrs)
    return int(m.group(1)) if m else 1


_SERIAL = itertools.count(1)


def ler_tabela(linhas: list[str]) -> list[dict]:
    """Converte as linhas de uma wikitable em lista de linhas com células."""
    linhas_tab: list[dict] = []
    atual = None
    celula = None
    for linha in linhas:
        if linha.startswith("{|"):
            continue
        if linha.startswith("|}"):
            break
        if linha.startswith("|-"):
            atual = {"attrs": linha[2:], "cells": []}
            linhas_tab.append(atual)
            celula = None
            continue
        if atual is None:
            continue
        if linha.startswith("|+"):
            continue
        if linha.startswith("!") or linha.startswith("|"):
            header = linha.startswith("!")
            attrs, conteudo = dividir_celula(linha[1:])
            celula = {
                "uid": next(_SERIAL),
                "header": header,
                "attrs": attrs,
                "raw": conteudo,
                "rowspan": atributo_int(attrs, "rowspan"),
                "colspan": atributo_int(attrs, "colspan"),
            }
            atual["cells"].append(celula)
        elif celula is not None:
            celula["raw"] += "\n" + linha  # continuação de célula
    return [l for l in linhas_tab if l["cells"]]


def expandir_grade(linhas: list[dict]) -> list[list[dict]]:
    """Resolve rowspan/colspan, devolvendo uma matriz de células."""
    grade: list[list[dict]] = []
    pendentes: dict[int, tuple[dict, int]] = {}  # coluna -> (célula, linhas restantes)
    for linha in linhas:
        saida: list[dict] = []
        col = 0
        fila = list(linha["cells"])
        while fila or any(c >= col for c in pendentes):
            if col in pendentes:
                cel, resta = pendentes[col]
                saida.append(dict(cel, herdada=True))
                if resta <= 1:
                    del pendentes[col]
                else:
                    pendentes[col] = (cel, resta - 1)
                col += 1
                continue
            if not fila:
                col += 1
                if col > 100:
                    break
                continue
            cel = fila.pop(0)
            for k in range(cel["colspan"]):
                saida.append(dict(cel, herdada=k > 0))
                if cel["rowspan"] > 1:
                    pendentes[col] = (cel, cel["rowspan"] - 1)
                col += 1
        grade.append({"attrs": linha["attrs"], "cells": saida})
    return grade


def numero(raw: str):
    t = texto_limpo(raw)
    t = t.replace("%", "").replace("±", "").replace("pp", "").replace(",", "").strip()
    t = t.replace("–", "-").replace("−", "-")
    m = re.match(r"^-?\d+(\.\d+)?$", t)
    return float(m.group(0)) if m else None


def margem(raw: str):
    t = texto_limpo(raw).replace(",", ".")
    m = re.search(r"(\d+(?:\.\d+)?)", t)
    return float(m.group(1)) if m else None


def amostra(raw: str):
    t = texto_limpo(raw).replace(",", "").replace(".", "")
    m = re.search(r"(\d+)", t)
    return int(m.group(1)) if m else None


def parse_periodo(texto: str, ano: int):
    """'2–3 Oct', '30 Sep–3 Oct', '3 Oct', '28 Dec 2025–3 Jan 2026' -> (inicio, fim)."""
    t = texto.replace("—", "–").replace("-", "–")
    partes = [p.strip() for p in t.split("–") if p.strip()]
    if not partes:
        return None, None

    def interpretar(p: str, mes_padrao=None, ano_padrao=None):
        m = re.match(r"^(\d{1,2})(?:\s+([A-Za-z]{3})[a-z]*)?(?:\s+(\d{4}))?$", p)
        if not m:
            return None
        dia = int(m.group(1))
        mes = MESES.get(m.group(2).lower()[:3]) if m.group(2) else mes_padrao
        a = int(m.group(3)) if m.group(3) else ano_padrao
        return dia, mes, a

    fim = interpretar(partes[-1], ano_padrao=ano)
    if not fim or not fim[1]:
        return None, None
    ini = interpretar(partes[0], mes_padrao=fim[1], ano_padrao=None) if len(partes) > 1 else fim
    if not ini:
        return None, None
    ano_fim = fim[2] or ano
    ano_ini = ini[2] or (ano_fim - 1 if ini[1] > fim[1] else ano_fim)
    try:
        d_ini = dt.date(ano_ini, ini[1], ini[0])
        d_fim = dt.date(ano_fim, fim[1], fim[0])
    except ValueError:
        return None, None
    return d_ini.isoformat(), d_fim.isoformat()


# --------------------------------------------------------------------------
# Extração
# --------------------------------------------------------------------------

def mapa_refs(wikitext: str) -> dict[str, str]:
    """Nome da ref -> URL, para resolver <ref name=":76" />."""
    refs = {}
    for m in re.finditer(r'<ref\s+name\s*=\s*"?([^">/]+?)"?\s*>(.*?)</ref>', wikitext, flags=re.S):
        url = extrair_url(m.group(2))
        if url:
            refs[m.group(1).strip()] = url
    return refs


def extrair_url(raw: str, refs: dict[str, str] | None = None):
    m = re.search(r"\|\s*url\s*=\s*([^\s|}]+)", raw)
    if m:
        return m.group(1).strip()
    m = re.search(r"\[(https?://[^\s\]]+)", raw)
    if m:
        return m.group(1)
    if refs is not None:
        m = re.search(r'<ref\s+name\s*=\s*"?([^">/]+?)"?\s*/>', raw)
        if m:
            return refs.get(m.group(1).strip())
    return None


def info_candidato(raw: str):
    """Extrai nome curto, nome completo e partido do cabeçalho do candidato."""
    links = re.findall(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]", raw)
    links = [(a, b) for a, b in links if not a.startswith(("File:", "Image:"))]
    if not links:
        return None
    completo, curto = links[0][0], links[0][1] or links[0][0]
    partido = None
    m = re.search(r"\{\{small\|\[\[[^\]|]*\|([^\]]*)\]\]\}\}", raw)
    if m:
        partido = m.group(1)
    else:
        m = re.search(r"\|link=([^\]|]+)\]\]", raw)
        if m:
            partido = m.group(1)
    if partido:
        partido = SIGLAS.get(partido, partido)
    curto = texto_limpo(curto)
    return {"nome": NOMES.get(curto, curto), "nome_completo": completo.strip(), "partido": partido}


def classificar_coluna(texto: str):
    t = texto.lower()
    if "pollster" in t or "polling firm" in t:
        return "instituto"
    if "polling" in t and "period" in t:
        return "periodo"
    if t.startswith("others"):
        return "outros"
    if "blank" in t or "undec" in t:
        return "brancos_nulos_indecisos"
    if "margin" in t:
        return "margem"
    if "sample" in t:
        return "amostra"
    if t == "lead":
        return "lideranca"
    if t == "link":
        return "link"
    return None


def colunas_da_tabela(grade_cab: list[dict]):
    ncol = max(len(l["cells"]) for l in grade_cab)
    colunas = []
    for c in range(ncol):
        tipo = None
        cand = None
        for linha in grade_cab:
            if c >= len(linha["cells"]):
                continue
            cel = linha["cells"][c]
            txt = texto_limpo(cel["raw"])
            k = classificar_coluna(txt) if txt else None
            if k:
                tipo = k
                break
            info = info_candidato(cel["raw"])
            if info and info["nome"]:
                cand = info
                tipo = "candidato"
                break
        colunas.append({"tipo": tipo, "candidato": cand})
    return colunas


def e_linha_cabecalho(linha: dict) -> bool:
    cells = [c for c in linha["cells"] if not c.get("herdada")]
    if not cells:
        return False
    if all(c["header"] for c in cells):
        return True
    # linha de cores (| bgcolor=... |) sem conteúdo
    return all(not texto_limpo(c["raw"]) for c in cells)


def extrair(wikitext: str) -> dict:
    refs = mapa_refs(wikitext)
    linhas = wikitext.splitlines()

    turno = None
    ano = None
    secao = ""
    pesquisas = []
    eventos = []
    resultados = {}
    candidatos: dict[str, dict] = {}

    i = 0
    while i < len(linhas):
        linha = linhas[i]
        m = re.match(r"^(={2,4})\s*(.*?)\s*\1\s*$", linha)
        if m:
            nivel, titulo = len(m.group(1)), m.group(2)
            if nivel == 2:
                turno = 1 if titulo.lower().startswith("first round") else (
                    2 if titulo.lower().startswith("second round") else None)
                ano = None
            elif nivel == 3:
                ma = re.match(r"^(\d{4})$", titulo)
                ano = int(ma.group(1)) if ma else None
                secao = titulo
            else:
                secao = titulo
            i += 1
            continue

        if linha.startswith("{|"):
            j = i
            while j < len(linhas) and not linhas[j].startswith("|}"):
                j += 1
            bloco = linhas[i:j + 1]
            i = j + 1
            if turno is None or ano is None:
                continue
            tabela = ler_tabela(bloco)
            grade = expandir_grade(tabela)
            n_cab = 0
            while n_cab < len(grade) and e_linha_cabecalho(grade[n_cab]):
                n_cab += 1
            if n_cab == 0:
                continue
            colunas = colunas_da_tabela(grade[:n_cab])
            for c in colunas:
                if c["candidato"]:
                    info = c["candidato"]
                    chave = info["nome"]
                    if chave not in candidatos:
                        candidatos[chave] = info
                    elif not candidatos[chave].get("partido") and info.get("partido"):
                        candidatos[chave]["partido"] = info["partido"]
            processar_linhas(grade[n_cab:], colunas, turno, ano, secao, refs,
                             pesquisas, eventos, resultados)
            continue
        i += 1

    # identificadores e agrupamento por pesquisa (mesmo instituto + período + turno)
    vistos: dict[str, int] = {}
    for p in pesquisas:
        base = f"{p['turno']}-{slug(p['instituto'])}-{p['fim']}-{p['grupo']}"
        p["pesquisa_id"] = base
        vistos[base] = vistos.get(base, 0) + 1
        p["cenario"] = vistos[base]
        p["id"] = f"{base}-c{p['cenario']}"
    for p in pesquisas:
        p["total_cenarios"] = vistos[p["pesquisa_id"]]
        del p["grupo"]

    # eventos sem duplicatas
    unicos = {}
    for e in eventos:
        unicos.setdefault((e["data"], e["texto"]), e)
    eventos = sorted(unicos.values(), key=lambda e: e["data"])

    pesquisas.sort(key=lambda p: (p["fim"], p["instituto"], p["cenario"]), reverse=True)
    return {
        "atualizado_em": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
        "fonte": {"nome": "Wikipédia — Opinion polling for the 2026 Brazilian presidential election",
                  "url": URL_PAGINA},
        "candidatos": candidatos,
        "resultados": resultados,
        "eventos": eventos,
        "pesquisas": pesquisas,
    }


def slug(t: str) -> str:
    t = t.lower()
    t = re.sub(r"[^a-z0-9]+", "-", t)
    return t.strip("-")


def traduzir_evento(texto: str) -> str:
    for padrao, pt in EVENTOS_PT:
        if re.search(padrao, texto, flags=re.I):
            return pt
    return texto


def processar_linhas(grade, colunas, turno, ano, secao, refs, pesquisas, eventos, resultados):
    idx = {c["tipo"]: k for k, c in enumerate(colunas) if c["tipo"] and c["tipo"] != "candidato"}
    cand_cols = [(k, c["candidato"]["nome"]) for k, c in enumerate(colunas) if c["tipo"] == "candidato"]
    if "instituto" not in idx or "periodo" not in idx or not cand_cols:
        return

    for linha in grade:
        cells = linha["cells"]
        if len(cells) <= idx["periodo"]:
            continue
        # eventos: linha com célula de colspan grande
        largas = [c for c in cells if c["colspan"] >= 5 and not c.get("herdada")]
        if largas or "lightyellow" in linha["attrs"]:
            data_txt = texto_limpo(cells[idx["periodo"]]["raw"])
            ini, fim = parse_periodo(data_txt, ano)
            if fim and largas:
                texto = texto_limpo(largas[0]["raw"])
                eventos.append({"data": fim, "texto": traduzir_evento(texto), "texto_original": texto,
                                "turno": turno})
            continue

        cel_inst = cells[idx["instituto"]]
        instituto = texto_limpo(cel_inst["raw"])
        if not instituto:
            continue
        periodo_txt = texto_limpo(cells[idx["periodo"]]["raw"])

        valores = {}
        for k, nome in cand_cols:
            if k < len(cells):
                v = numero(cells[k]["raw"])
                if v is not None:
                    valores[nome] = v
        if not valores:
            continue

        def campo(nome, fn):
            k = idx.get(nome)
            if k is None or k >= len(cells):
                return None
            return fn(cells[k]["raw"])

        outros = campo("outros", numero)
        bni = campo("brancos_nulos_indecisos", numero)

        if instituto.lower() == "results":
            # duas linhas: votos válidos e votos totais (identificadas pela coluna "sample")
            rotulo = texto_limpo(cells[idx["amostra"]]["raw"]).lower() if "amostra" in idx else ""
            tipo = "validos" if "valid" in rotulo else "totais"
            _, fim = parse_periodo(periodo_txt, ano)
            r = resultados.setdefault(str(turno), {"data": fim})
            r[tipo] = {"candidatos": valores, "outros": outros, "brancos_nulos": bni}
            continue

        ini, fim = parse_periodo(periodo_txt, ano)
        if not fim:
            print(f"  aviso: período não reconhecido: {instituto} '{periodo_txt}'", file=sys.stderr)
            continue

        link = campo("link", lambda r: extrair_url(r, refs))
        pesquisas.append({
            "turno": turno,
            "instituto": instituto,
            "inicio": ini,
            "fim": fim,
            "periodo": periodo_txt,
            "secao": secao,
            "candidatos": valores,
            "outros": outros,
            "brancos_nulos_indecisos": bni,
            "margem": campo("margem", margem),
            "amostra": campo("amostra", amostra),
            "link": link,
            # células mescladas (rowspan) indicam vários cenários da mesma pesquisa
            "grupo": cel_inst["uid"],
        })


def main():
    if len(sys.argv) > 1:
        wikitext = Path(sys.argv[1]).read_text(encoding="utf-8")
    else:
        print("Baixando dados da Wikipédia…", file=sys.stderr)
        wikitext = baixar_wikitext()
    dados = extrair(wikitext)
    SAIDA_JSON.parent.mkdir(parents=True, exist_ok=True)
    texto = json.dumps(dados, ensure_ascii=False, indent=1)
    SAIDA_JSON.write_text(texto + "\n", encoding="utf-8")
    SAIDA_JS.write_text("window.PESQUISAS = " + texto + ";\n", encoding="utf-8")
    t1 = sum(1 for p in dados["pesquisas"] if p["turno"] == 1)
    t2 = sum(1 for p in dados["pesquisas"] if p["turno"] == 2)
    print(f"{len(dados['pesquisas'])} cenários ({t1} de 1º turno, {t2} de 2º turno), "
          f"{len(dados['eventos'])} eventos -> {SAIDA_JSON.relative_to(RAIZ)}", file=sys.stderr)


if __name__ == "__main__":
    main()
