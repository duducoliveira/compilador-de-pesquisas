# Compilador de pesquisas — Presidente 2026

Painel que reúne as pesquisas de intenção de voto para Presidente da República
(eleição de 2026) divulgadas pelos institutos (Quaest, Datafolha, AtlasIntel,
PoderData, Nexus, Futura, Ideia, MDA, Real Time, Palver, Vox Brasil, Paraná
Pesquisas, Indexa, Gerp, Ipespe…), do início de 2025 até o 2º turno.

## Como abrir

Abra o `index.html` no navegador (funciona direto do disco, sem servidor) ou
publique o repositório no GitHub Pages (Settings → Pages → branch `main`, pasta `/`).

Para ter um arquivo único, com os dados embutidos, rode
`python3 scripts/gerar_pagina_unica.py` e use `dist/compilador.html`.

## O que dá para fazer

- **1º e 2º turno** em abas separadas. No 2º turno, escolha o confronto
  (Lula × Flávio Bolsonaro, Lula × Caiado, Lula × Zema, Lula × Tarcísio…).
- **Período**: atalhos (após o 1º turno, campanha oficial, 2026, tudo), datas
  livres ou zoom arrastando na faixa abaixo do gráfico.
- **Filtros** por instituto e por candidato; **destacar** um instituto no gráfico.
- **Votos totais ou votos válidos** (exclui brancos, nulos e indecisos).
- **Cenários**: só o cenário principal de cada pesquisa ou todos os cenários estimulados.
- **Linha de tendência** com três níveis de suavização (ou desligada).
- **Marcos da campanha** (convenções, horário eleitoral, debates, crise no STF…)
  e o **resultado oficial do TSE** no gráfico.
- **Tabela das pesquisas do recorte** com caixa de seleção em cada linha:
  desmarque uma pesquisa e ela sai do gráfico, das médias e das análises.
  Clicar num ponto do gráfico localiza a pesquisa na tabela; passar o mouse
  numa linha da tabela destaca o ponto no gráfico. Ordena por qualquer coluna.
- **Análises**: diferença entre os dois primeiros ao longo do tempo, última
  pesquisa de cada instituto, viés médio de cada instituto em relação à média
  e ranking de **quem acertou o 1º turno**.
- **Exportar** as pesquisas marcadas em CSV (copiar ou baixar).
- Os filtros ficam salvos no navegador.

## Dados

`data/pesquisas.json` (e o espelho `data/pesquisas.js`) é gerado por
`scripts/atualizar_dados.py`, que lê as tabelas da página
[Opinion polling for the 2026 Brazilian presidential election](https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Brazilian_presidential_election)
da Wikipédia. Cada pesquisa traz instituto, período de campo, percentuais por
candidato, outros, brancos/nulos/indecisos, margem de erro, amostra e o link
para a publicação original.

```bash
python3 scripts/atualizar_dados.py            # baixa a versão mais recente
python3 scripts/atualizar_dados.py pagina.wiki  # ou processa um wikitext salvo
```

O workflow `.github/workflows/atualizar-dados.yml` roda o script a cada 6 horas
e faz commit quando entram pesquisas novas.

### Estrutura de cada registro

| campo | descrição |
|---|---|
| `turno` | 1 ou 2 |
| `instituto` | nome do instituto |
| `inicio`, `fim` | datas do trabalho de campo (ISO) |
| `candidatos` | `{nome: percentual}` em votos totais |
| `outros`, `brancos_nulos_indecisos` | percentuais |
| `margem`, `amostra` | margem de erro (pp) e número de entrevistas |
| `pesquisa_id`, `cenario`, `total_cenarios` | agrupa os cenários de uma mesma pesquisa |
| `link` | fonte original |

## Método

- **Tendência**: média ponderada com kernel gaussiano sobre a data central do
  campo de cada pesquisa; peso proporcional à raiz do tamanho da amostra
  (limitado a 6.000 entrevistas).
- **Viés por instituto**: média, por instituto, da diferença entre a margem
  (1º − 2º colocado) que ele mediu e a margem da linha de tendência na mesma data.
- **Acerto no 1º turno**: última pesquisa de cada instituto a partir de 25/set,
  convertida em votos válidos e comparada ao resultado do TSE; erro médio é a
  média do erro absoluto dos seis candidatos.
