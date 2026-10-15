/* Compilador de pesquisas — eleição presidencial 2026 */
(function () {
  "use strict";

  const D = window.PESQUISAS;
  const DIA = 86400000;
  const DATA_1T = "2026-10-04";
  const INICIO_CAMPANHA = "2026-08-16";

  // Cor fixa por candidato (a cor segue a pessoa, nunca a posição)
  const COR = {
    "Lula": "--c-lula", "Flávio Bolsonaro": "--c-flavio", "Caiado": "--c-caiado", "Zema": "--c-zema",
    "Renan Santos": "--c-renan", "Augusto Cury": "--c-cury", "Tarcísio": "--c-tarcisio", "Ratinho Jr.": "--c-ratinho",
  };
  const cor = (c) => `var(${COR[c] || "--c-outro"})`;

  // ---------- utilidades ----------
  const $ = (s) => document.querySelector(s);
  const parseD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const isoD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDias = (s, n) => isoD(new Date(parseD(s).getTime() + n * DIA));
  const locale = d3.timeFormatLocale({
    dateTime: "%A, %e de %B de %Y. %X", date: "%d/%m/%Y", time: "%H:%M:%S", periods: ["AM", "PM"],
    days: ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"],
    shortDays: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
    months: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
    shortMonths: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
  });
  const fDia = locale.format("%d/%m");
  const fDiaAno = locale.format("%d/%m/%Y");
  const fMesCurto = locale.format("%b");
  const fDiaMes = locale.format("%e %b");
  const multiFormat = (d) => (d.getDate() === 1 ? (d.getMonth() === 0 ? locale.format("%Y")(d) : fMesCurto(d)) : fDiaMes(d));
  const num = (v, casas = 1) => (v == null || isNaN(v) ? "–" : v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas }));
  const num1 = (v) => (v == null || isNaN(v) ? "–" : v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const num2 = (v) => (v == null || isNaN(v) ? "–" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const sinal = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + num1(Math.abs(v));
  const el = (tag, attrs = {}, ...filhos) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v; else if (k === "style") e.style.cssText = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
    }
    for (const f of filhos.flat()) if (f != null) e.append(f.nodeType ? f : document.createTextNode(String(f)));
    return e;
  };
  const guardar = (k, v) => { try { localStorage.setItem("compilador:" + k, JSON.stringify(v)); } catch (e) { /* ignorado */ } };
  const ler = (k, padrao) => { try { const v = localStorage.getItem("compilador:" + k); return v == null ? padrao : JSON.parse(v); } catch (e) { return padrao; } };

  // ---------- preparação dos dados ----------
  const TODAS = D.pesquisas.map((p) => {
    const ini = parseD(p.inicio || p.fim).getTime();
    const fim = parseD(p.fim).getTime();
    return Object.assign({}, p, { tMeio: (ini + fim) / 2, tFim: fim, confronto: Object.keys(p.candidatos).sort().join(" × ") });
  });
  const ULTIMA_DATA = d3.max(TODAS, (p) => p.fim);
  const PRIMEIRA_DATA = d3.min(TODAS, (p) => p.inicio || p.fim);
  const INSTITUTOS = Array.from(new Set(TODAS.map((p) => p.instituto))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const EVENTOS = D.eventos.slice().sort((a, b) => a.data.localeCompare(b.data));
  const RESULTADO = D.resultados || {};

  function valor(p, c, metrica) {
    const v = p.candidatos[c];
    if (v == null) return null;
    if (metrica !== "validos") return v;
    let base = 0;
    for (const x of Object.values(p.candidatos)) base += x;
    if (p.turno === 1 && p.outros != null) base += p.outros;
    return base > 0 ? (v / base) * 100 : null;
  }

  // ---------- estado ----------
  const PRESETS = {
    1: [
      ["campanha", "Campanha", INICIO_CAMPANHA, DATA_1T],
      ["2026", "2026", "2026-01-01", DATA_1T],
      ["tudo", "Tudo", PRIMEIRA_DATA, DATA_1T],
    ],
    2: [
      ["pos1t", "Após o 1º turno", DATA_1T, ULTIMA_DATA],
      ["campanha", "Campanha", INICIO_CAMPANHA, ULTIMA_DATA],
      ["2026", "2026", "2026-01-01", ULTIMA_DATA],
      ["tudo", "Tudo", PRIMEIRA_DATA, ULTIMA_DATA],
    ],
  };
  const padraoTurno = (t) => ({
    preset: "campanha", ini: INICIO_CAMPANHA, fim: t === 1 ? DATA_1T : ULTIMA_DATA,
    candidatosOff: [], confronto: "Flávio Bolsonaro × Lula",
  });
  const estado = Object.assign({
    turno: 1,
    t: { 1: padraoTurno(1), 2: padraoTurno(2) },
    cenario: "principal",
    metrica: "totais",
    banda: 10,
    pontos: true, eventos: true, resultado: true,
    institutosOff: [],
    excluidas: [],
    destaque: "",
    soMarcadas: false,
    ordem: { col: "fim", dir: -1 },
  }, ler("estado", {}));
  // a data final dos presets acompanha a atualização dos dados
  for (const t of [1, 2]) {
    const p = PRESETS[t].find((x) => x[0] === estado.t[t].preset);
    if (p) { estado.t[t].ini = p[2]; estado.t[t].fim = p[3]; }
  }
  if (location.hash === "#segundo-turno") estado.turno = 2;
  if (location.hash === "#primeiro-turno") estado.turno = 1;
  let foco = null; // id da pesquisa destacada pela interação

  const T = () => estado.t[estado.turno];
  const salvar = () => guardar("estado", estado);

  // ---------- seleção de dados ----------
  function cenariosDoTurno() {
    return TODAS.filter((p) => p.turno === estado.turno);
  }
  function confrontosDisponiveis() {
    const cont = d3.rollup(cenariosDoTurno().filter((p) => Object.keys(p.candidatos).length === 2), (v) => v.length, (p) => p.confronto);
    return Array.from(cont, ([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
  }
  function baseSemPeriodo() {
    let ps = cenariosDoTurno();
    if (estado.turno === 2) ps = ps.filter((p) => p.confronto === T().confronto);
    else if (estado.cenario === "principal") ps = ps.filter((p) => p.cenario === 1);
    return ps;
  }
  function noPeriodo(ps) {
    const { ini, fim } = T();
    return ps.filter((p) => p.fim >= ini && p.fim <= fim);
  }
  function filtradas() {
    const off = new Set(estado.institutosOff);
    return noPeriodo(baseSemPeriodo()).filter((p) => !off.has(p.instituto));
  }
  function candidatosDoTurno(ps) {
    if (estado.turno === 2) return T().confronto.split(" × ").sort((a, b) => (a === "Lula" ? -1 : b === "Lula" ? 1 : 0));
    // ordena pela média das pesquisas mais recentes
    const recentes = ps.filter((p) => p.tFim >= d3.max(ps, (x) => x.tFim) - 30 * DIA);
    const cs = new Set();
    ps.forEach((p) => Object.keys(p.candidatos).forEach((c) => cs.add(c)));
    const media = (c) => d3.mean(recentes, (p) => p.candidatos[c]) ?? d3.mean(ps, (p) => p.candidatos[c]) ?? 0;
    return Array.from(cs).sort((a, b) => media(b) - media(a));
  }

  // ---------- tendência (kernel gaussiano) ----------
  function tendencia(ps, c, h, t0, t1) {
    const pts = ps.map((p) => ({ t: p.tMeio, v: valor(p, c, estado.metrica), w: Math.sqrt(Math.min(p.amostra || 1000, 6000) / 1000) }))
      .filter((d) => d.v != null);
    if (pts.length < 2 || !h) return [];
    const out = [];
    const hm = h * DIA;
    const primeiro = d3.min(pts, (d) => d.t), ultimo = d3.max(pts, (d) => d.t);
    const ini = Math.max(t0, primeiro), fim = Math.min(t1, ultimo);
    for (let t = ini; t <= fim + 1; t += DIA / 2) {
      let sw = 0, sv = 0;
      for (const d of pts) {
        const z = (t - d.t) / hm;
        if (Math.abs(z) > 3) continue;
        const w = Math.exp(-0.5 * z * z) * d.w;
        sw += w; sv += w * d.v;
      }
      if (sw > 0.15) out.push({ t, v: sv / sw });
    }
    return out;
  }
  function tendenciaEm(serie, t) {
    if (!serie.length) return null;
    const i = d3.bisector((d) => d.t).center(serie, t);
    return Math.abs(serie[i].t - t) <= DIA ? serie[i].v : null;
  }
  // diferença A − B por pesquisa e tendência dela
  function difPesquisa(p, a, b) {
    const va = valor(p, a, estado.metrica), vb = valor(p, b, estado.metrica);
    return va == null || vb == null ? null : va - vb;
  }

  // ---------- tooltip ----------
  const tip = $("#tooltip");
  function mostrarTip(evt, conteudo, host) {
    tip.replaceChildren(...conteudo);
    tip.hidden = false;
    const box = host.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = evt.clientX + 14, y = evt.clientY + 14;
    if (x + tw > window.innerWidth - 8) x = evt.clientX - tw - 14;
    if (y + th > window.innerHeight - 8) y = evt.clientY - th - 14;
    tip.style.left = (x + window.scrollX) + "px";
    tip.style.top = (y + window.scrollY) + "px";
    void box;
  }
  const esconderTip = () => { tip.hidden = true; };
  const ttLinha = (c, v, extra) => el("div", { class: "tt-r" }, el("i", { style: `background:${cor(c)}` }), el("b", {}, v), el("span", {}, c, extra || ""));
  function ttPesquisa(p, cands) {
    const linhas = [
      el("div", { class: "tt-t" }, p.instituto),
      el("div", { class: "tt-s" }, `Campo: ${p.periodo}${p.inicio && p.inicio.slice(0, 4) !== "2026" ? " de " + p.inicio.slice(0, 4) : ""}` + (p.total_cenarios > 1 ? ` · cenário ${p.cenario} de ${p.total_cenarios}` : "")),
    ];
    const vs = cands.map((c) => [c, valor(p, c, estado.metrica)]).filter((x) => x[1] != null).sort((a, b) => b[1] - a[1]);
    vs.forEach(([c, v]) => linhas.push(ttLinha(c, num(v) + "%")));
    const extra = [];
    if (p.amostra) extra.push(`${p.amostra.toLocaleString("pt-BR")} entrevistas`);
    if (p.margem != null) extra.push(`±${num(p.margem)} pp`);
    if (extra.length) linhas.push(el("div", { class: "tt-s" }, extra.join(" · ")));
    return linhas;
  }

  // resultado oficial: todos os candidatos, comparados à média das pesquisas na data
  function ttResultado(turno, series) {
    const res = RESULTADO[String(turno)];
    const rm = estado.metrica === "validos" ? res.validos : res.totais;
    const tr = parseD(res.data).getTime();
    const linhas = [
      el("div", { class: "tt-t" }, `Resultado oficial do ${turno}º turno · TSE`),
      el("div", { class: "tt-s" }, `${fDiaAno(parseD(res.data))} · ${estado.metrica === "validos" ? "votos válidos" : "votos totais"}`),
    ];
    Object.entries(rm.candidatos).sort((a, b) => b[1] - a[1]).forEach(([c, v]) => {
      const media = series ? tendenciaEm(series.get(c) || [], tr) : null;
      linhas.push(ttLinha(c, num2(v) + "%", media != null ? ` · média ${num1(media)}` : ""));
    });
    if (rm.outros != null) linhas.push(el("div", { class: "tt-r" }, el("i", { style: "background:var(--c-outro)" }), el("b", {}, num2(rm.outros) + "%"), el("span", {}, "Outros")));
    if (rm.brancos_nulos != null) linhas.push(el("div", { class: "tt-r" }, el("i", { style: "background:var(--rule)" }), el("b", {}, num2(rm.brancos_nulos) + "%"), el("span", {}, "Brancos e nulos")));
    const vs = Object.entries(rm.candidatos).sort((a, b) => b[1] - a[1]);
    if (vs.length >= 2) linhas.push(el("hr"), el("div", { class: "tt-s" }, `${vs[0][0]} à frente por ${num2(vs[0][1] - vs[1][1])} pp`));
    return linhas;
  }

  // ---------- controles ----------
  function renderPresets() {
    const box = $("#presets");
    box.replaceChildren(...PRESETS[estado.turno].map(([id, rot, ini, fim]) =>
      el("button", {
        "aria-pressed": String(T().preset === id),
        onclick: () => { Object.assign(T(), { preset: id, ini, fim }); atualizar(); },
      }, rot)));
    $("#data-ini").value = T().ini;
    $("#data-fim").value = T().fim;
    $("#data-ini").min = $("#data-fim").min = PRIMEIRA_DATA;
    $("#data-ini").max = $("#data-fim").max = ULTIMA_DATA > DATA_1T ? ULTIMA_DATA : DATA_1T;
  }
  function renderControles() {
    for (const t of [1, 2]) {
      const b = $(`#tab-t${t}`);
      b.setAttribute("aria-selected", String(estado.turno === t));
      $(`#n-t${t}`).textContent = new Set(TODAS.filter((p) => p.turno === t).map((p) => p.pesquisa_id)).size;
    }
    renderPresets();
    $("#grupo-cenario").hidden = estado.turno !== 1;
    $("#grupo-confronto").hidden = estado.turno !== 2;
    if (estado.turno === 2) {
      const sel = $("#confronto");
      const ops = confrontosDisponiveis();
      if (!ops.some((o) => o.k === T().confronto) && ops.length) T().confronto = ops[0].k;
      sel.replaceChildren(...ops.map((o) => {
        const nomes = o.k.split(" × ").sort((a, b) => (a === "Lula" ? -1 : b === "Lula" ? 1 : 0)).join(" × ");
        return el("option", { value: o.k, selected: o.k === T().confronto }, `${nomes} (${o.n})`);
      }));
    }
    document.querySelectorAll("#cenario button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === estado.cenario)));
    document.querySelectorAll("#metrica button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === estado.metrica)));
    $("#banda").value = String(estado.banda);
    $("#opt-pontos").checked = estado.pontos;
    $("#opt-eventos").checked = estado.eventos;
    $("#opt-resultado").checked = estado.resultado;
    $("#opt-resultado").closest("label").hidden = !RESULTADO[String(estado.turno)];
    $("#opt-so-marcadas").checked = estado.soMarcadas;

    // institutos com contagem no período/cenário atual
    const base = noPeriodo(baseSemPeriodo());
    const cont = d3.rollup(base, (v) => new Set(v.map((p) => p.pesquisa_id)).size, (p) => p.instituto);
    const off = new Set(estado.institutosOff);
    $("#institutos").replaceChildren(...INSTITUTOS.filter((i) => cont.get(i)).map((i) =>
      el("button", {
        class: "chip", "aria-pressed": String(!off.has(i)),
        onclick: () => { off.has(i) ? off.delete(i) : off.add(i); estado.institutosOff = Array.from(off); atualizar(); },
      }, i, el("span", { class: "n" }, cont.get(i)))));
    const dest = $("#destaque");
    dest.replaceChildren(el("option", { value: "" }, "nenhum"), ...INSTITUTOS.filter((i) => cont.get(i)).map((i) => el("option", { value: i, selected: estado.destaque === i }, i)));
  }
  function renderCandidatos(cands) {
    const off = new Set(T().candidatosOff);
    $("#candidatos").replaceChildren(...cands.map((c) =>
      el("button", {
        class: "chip", "aria-pressed": String(!off.has(c)), title: (D.candidatos[c] || {}).nome_completo,
        onclick: () => { off.has(c) ? off.delete(c) : off.add(c); T().candidatosOff = Array.from(off); atualizar(); },
      }, el("span", { class: "sw", style: `background:${cor(c)}` }), c,
      el("span", { class: "n" }, (D.candidatos[c] || {}).partido || ""))));
  }

  // ---------- KPIs ----------
  function renderKPIs(ps, cands, series) {
    const box = $("#kpis");
    if (!ps.length) { box.replaceChildren(); return; }
    const tUlt = d3.max(ps, (p) => p.tMeio);
    const itens = [];
    cands.slice(0, 4).forEach((c) => {
      const s = series.get(c) || [];
      let atual = s.length ? s[s.length - 1].v : d3.mean(ps.filter((p) => p.tMeio === tUlt), (p) => valor(p, c, estado.metrica));
      const antes = tendenciaEm(s, (s.length ? s[s.length - 1].t : tUlt) - 14 * DIA);
      itens.push(el("div", { class: "kpi" },
        el("div", { class: "rot" }, el("span", { class: "sw", style: `background:${cor(c)}` }), c),
        el("div", { class: "val" }, num1(atual), el("small", {}, "%")),
        el("div", { class: "sub" }, antes != null ? el("span", { class: "delta" }, sinal(atual - antes) + " pp") : "", antes != null ? " em 14 dias" : "média das pesquisas")));
    });
    if (cands.length >= 2) {
      const [a, b] = cands;
      const sa = series.get(a) || [], sb = series.get(b) || [];
      if (sa.length && sb.length) {
        const d = sa[sa.length - 1].v - sb[sb.length - 1].v;
        const lider = d >= 0 ? a : b;
        itens.push(el("div", { class: "kpi" },
          el("div", { class: "rot" }, "Vantagem na média"),
          el("div", { class: "val" }, num1(Math.abs(d)), el("small", {}, " pp")),
          el("div", { class: "sub" }, Math.abs(d) < 0.05 ? "empate" : `${lider} à frente`)));
      }
    }
    const nPesq = new Set(ps.map((p) => p.pesquisa_id)).size;
    const nInst = new Set(ps.map((p) => p.instituto)).size;
    const ult = ps.reduce((m, p) => (p.fim > m.fim ? p : m), ps[0]);
    itens.push(el("div", { class: "kpi" },
      el("div", { class: "rot" }, "Pesquisas no recorte"),
      el("div", { class: "val" }, nPesq),
      el("div", { class: "sub" }, `${nInst} institutos · última: ${ult.instituto} ${fDia(parseD(ult.fim))}`)));
    box.replaceChildren(...itens);
  }

  // ---------- gráfico principal ----------
  function dimensoes(host, alturaBase) {
    const w = Math.max(300, host.clientWidth || 800);
    const h = w < 560 ? Math.round(alturaBase * 0.8) : alturaBase;
    return { w, h };
  }

  function renderPrincipal(ps, cands, series) {
    const host = $("#g-principal");
    host.replaceChildren();
    const legenda = $("#legenda-principal");
    legenda.replaceChildren(...[
      ...cands.map((c) => el("span", {}, el("i", { style: `background:${cor(c)}` }), c)),
      estado.pontos ? el("span", {}, el("i", { class: "pt", style: "background:var(--ink-3)" }), "pesquisa") : null,
      estado.eventos ? el("span", {}, el("i", { class: "ev" }), "marco") : null,
      estado.resultado && RESULTADO[String(estado.turno)] ? el("span", {}, el("i", { class: "res" }), "resultado") : null,
    ].filter(Boolean));
    $("#titulo-principal").textContent = estado.turno === 1
      ? `1º turno · ${estado.metrica === "validos" ? "votos válidos" : "votos totais"}`
      : `2º turno · ${candidatosDoTurno().join(" × ")} · ${estado.metrica === "validos" ? "votos válidos" : "votos totais"}`;
    if (!ps.length || !cands.length) { host.append(el("div", { class: "vazio" }, "Nenhuma pesquisa no recorte. Ajuste o período ou os institutos.")); return; }

    const { w, h } = dimensoes(host, 420);
    const m = { t: 22, r: w < 560 ? 92 : 124, b: 26, l: 34 };
    const t0 = parseD(T().ini).getTime(), t1 = parseD(T().fim).getTime() + DIA * 0.5;
    const x = d3.scaleTime().domain([t0 - DIA, t1]).range([m.l, w - m.r]);
    const res = RESULTADO[String(estado.turno)];
    const resMap = res ? (estado.metrica === "validos" ? res.validos : res.totais) : null;
    let ymax = d3.max(ps, (p) => d3.max(cands, (c) => valor(p, c, estado.metrica))) || 50;
    if (resMap && estado.resultado) ymax = Math.max(ymax, d3.max(cands, (c) => resMap.candidatos[c] || 0));
    // no 2º turno as linhas ficam entre 35% e 55%: eixo recortado para ler a disputa
    let ymin = 0;
    if (estado.turno === 2) {
      const vmin = d3.min(ps, (p) => d3.min(cands, (c) => valor(p, c, estado.metrica))) ?? 0;
      ymin = Math.max(0, Math.floor((vmin - 3) / 5) * 5);
    }
    const y = d3.scaleLinear().domain([ymin, Math.ceil((ymax + 3) / (ymin ? 5 : 10)) * (ymin ? 5 : 10)]).range([h - m.b, m.t]);

    const svg = d3.select(host).append("svg").attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`)
      .attr("role", "img").attr("aria-label", "Gráfico de intenção de voto por data");
    svg.append("g").selectAll("line").data(y.ticks(6)).join("line").attr("class", "gridline")
      .attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
    svg.append("g").attr("class", "eixo").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(6).tickSize(0).tickPadding(6).tickFormat((d) => d + "%")).call((g) => g.select(".domain").remove());
    svg.append("g").attr("class", "eixo").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).ticks(w < 560 ? 4 : 8).tickSizeOuter(0).tickFormat(multiFormat));

    // marcos
    const evs = estado.eventos ? EVENTOS.filter((e) => { const t = parseD(e.data).getTime(); return t >= t0 && t <= t1; }) : [];
    const gEv = svg.append("g");
    evs.forEach((e) => {
      const xe = x(parseD(e.data).getTime());
      const forte = e.data === DATA_1T;
      gEv.append("line").attr("x1", xe).attr("x2", xe).attr("y1", m.t - 6).attr("y2", h - m.b)
        .attr("stroke", forte ? "var(--ink-2)" : "var(--event)").attr("stroke-width", forte ? 1.2 : 1).attr("stroke-dasharray", forte ? null : "3 3").attr("opacity", forte ? .7 : .55);
      const mk = gEv.append("path").attr("d", d3.symbol(d3.symbolTriangle, 34)()).attr("transform", `translate(${xe},${m.t - 10}) rotate(180)`)
        .attr("fill", forte ? "var(--ink-2)" : "var(--event)").attr("tabindex", 0).style("cursor", "help");
      const conteudo = () => [el("div", { class: "tt-s" }, fDiaAno(parseD(e.data))), el("div", { class: "tt-t" }, e.texto)];
      mk.on("pointerenter", (ev) => mostrarTip(ev, conteudo(), host)).on("pointerleave", esconderTip)
        .on("focus", (ev) => { const r = ev.target.getBoundingClientRect(); mostrarTip({ clientX: r.x, clientY: r.y + 10 }, conteudo(), host); }).on("blur", esconderTip);
      if (forte) gEv.append("text").attr("x", xe + 4).attr("y", m.t - 6).text("1º turno").attr("font-size", 10.5).style("fill", "var(--ink-2)").style("font-weight", 600);
    });

    // pontos
    const pontos = [];
    if (estado.pontos) {
      ps.forEach((p) => cands.forEach((c) => {
        const v = valor(p, c, estado.metrica);
        if (v != null) pontos.push({ p, c, v, px: x(p.tMeio), py: y(v) });
      }));
      const gP = svg.append("g");
      gP.selectAll("circle").data(pontos).join("circle")
        .attr("cx", (d) => d.px).attr("cy", (d) => d.py)
        .attr("r", (d) => (foco === d.p.id || (estado.destaque && d.p.instituto === estado.destaque) ? 4.6 : 3.2))
        .attr("fill", (d) => cor(d.c))
        .attr("stroke", (d) => (foco === d.p.id ? "var(--ink)" : estado.destaque && d.p.instituto === estado.destaque ? "var(--surface)" : "none"))
        .attr("stroke-width", (d) => (foco === d.p.id ? 1.5 : 1.2))
        .attr("opacity", (d) => (estado.destaque ? (d.p.instituto === estado.destaque ? .95 : .14) : foco ? (foco === d.p.id ? 1 : .3) : (estado.banda ? .42 : .8)));
    }

    // tendência
    const gL = svg.append("g").attr("fill", "none");
    const linha = d3.line().x((d) => x(d.t)).y((d) => y(d.v)).curve(d3.curveMonotoneX);
    cands.forEach((c) => {
      const s = series.get(c);
      if (s && s.length) gL.append("path").attr("d", linha(s)).attr("stroke", cor(c)).attr("stroke-width", 2.2).attr("stroke-linejoin", "round").attr("stroke-linecap", "round");
    });

    // resultado oficial
    const resPts = [];
    if (resMap && estado.resultado) {
      const tr = parseD(res.data).getTime();
      if (tr >= t0 - DIA && tr <= t1) {
        const gR = svg.append("g");
        cands.forEach((c) => {
          const v = resMap.candidatos[c];
          if (v == null) return;
          resPts.push({ px: x(tr), py: y(v) });
          gR.append("path").attr("d", d3.symbol(d3.symbolDiamond, 64)()).attr("transform", `translate(${x(tr)},${y(v)})`)
            .attr("fill", cor(c)).attr("stroke", "var(--surface)").attr("stroke-width", 1.5);
        });
      }
    }

    // rótulos diretos à direita (valor final da tendência, ou resultado)
    const rot = cands.map((c) => {
      const s = series.get(c) || [];
      if (!s.length) return null;
      const v = s[s.length - 1].v;
      return { c, v, y: y(v), x: x(s[s.length - 1].t) };
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    for (let i = 1; i < rot.length; i++) if (rot[i].y - rot[i - 1].y < 14) rot[i].y = rot[i - 1].y + 14;
    for (let i = rot.length - 1; i >= 0; i--) if (rot[i].y > h - m.b - 4) rot[i].y = h - m.b - 4;
    for (let i = rot.length - 2; i >= 0; i--) if (rot[i + 1].y - rot[i].y < 14) rot[i].y = rot[i + 1].y - 14;
    const gT = svg.append("g");
    rot.forEach((r) => {
      gT.append("line").attr("x1", r.x + 3).attr("x2", w - m.r + 6).attr("y1", y(r.v)).attr("y2", r.y).attr("stroke", cor(r.c)).attr("stroke-width", 1).attr("opacity", .5);
      const t = gT.append("text").attr("x", w - m.r + 9).attr("y", r.y).attr("dy", "0.35em");
      t.append("tspan").text(num1(r.v)).style("font-family", "var(--font-data)").style("fill", "var(--ink)").style("font-weight", 500);
      t.append("tspan").text(" " + r.c).style("fill", "var(--ink-2)");
    });

    // camada de interação: crosshair + ponto mais próximo
    const cross = svg.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--ink-3)").attr("stroke-width", 1).attr("opacity", 0);
    const delaunay = pontos.length ? d3.Delaunay.from(pontos, (d) => d.px, (d) => d.py) : null;
    const maisProximo = (mx, my) => {
      if (!delaunay) return null;
      const i = delaunay.find(mx, my);
      const d = pontos[i];
      return Math.hypot(d.px - mx, d.py - my) < 16 ? d : null;
    };
    svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", w - m.l - m.r).attr("height", h - m.t - m.b)
      .attr("fill", "transparent").style("cursor", "crosshair")
      .on("pointermove", (ev) => {
        const [mx, my] = d3.pointer(ev);
        const t = x.invert(mx).getTime();
        cross.attr("x1", mx).attr("x2", mx).attr("opacity", .6);
        if (resPts.some((r) => Math.hypot(r.px - mx, r.py - my) < 14)) { mostrarTip(ev, ttResultado(estado.turno, series), host); return; }
        const pt = maisProximo(mx, my);
        if (pt) { mostrarTip(ev, ttPesquisa(pt.p, cands), host); return; }
        const linhas = [el("div", { class: "tt-s" }, `Média em ${fDiaAno(new Date(t))}`)];
        const vals = cands.map((c) => [c, tendenciaEm(series.get(c) || [], t)]).filter((v) => v[1] != null).sort((a, b) => b[1] - a[1]);
        if (!vals.length) { esconderTip(); return; }
        vals.forEach(([c, v]) => linhas.push(ttLinha(c, num1(v) + "%")));
        const doDia = ps.filter((p) => Math.abs(p.tFim - t) < DIA * 0.75);
        if (doDia.length) {
          linhas.push(el("hr"));
          linhas.push(el("div", { class: "tt-s" }, "Divulgadas neste dia: " + Array.from(new Set(doDia.map((p) => p.instituto))).join(", ")));
        }
        if (resPts.length && Math.abs(resPts[0].px - mx) < 6) linhas.push(el("hr"), ...ttResultado(estado.turno, null));
        mostrarTip(ev, linhas, host);
      })
      .on("pointerleave", () => { cross.attr("opacity", 0); esconderTip(); })
      .on("click", (ev) => {
        const [mx, my] = d3.pointer(ev);
        const pt = maisProximo(mx, my);
        if (pt) { focar(pt.p.id, true); }
      });
  }

  // ---------- faixa de zoom (brush) ----------
  function renderBrush(cands) {
    const host = $("#g-brush");
    host.replaceChildren();
    const base = baseSemPeriodo().filter((p) => !estado.institutosOff.includes(p.instituto) && !estado.excluidas.includes(p.id));
    if (!base.length) return;
    const w = Math.max(300, host.clientWidth || 800), h = 58;
    const m = { t: 4, r: w < 560 ? 92 : 124, b: 18, l: 34 };
    const presets = PRESETS[estado.turno];
    const dIni = presets[presets.length - 1][2], dFim = presets[0][3] > presets[presets.length - 1][3] ? presets[0][3] : presets[presets.length - 1][3];
    const x = d3.scaleTime().domain([parseD(dIni).getTime(), parseD(dFim).getTime() + DIA]).range([m.l, w - m.r]);
    const ymax = d3.max(base, (p) => d3.max(cands, (c) => valor(p, c, estado.metrica))) || 50;
    const y = d3.scaleLinear().domain([0, ymax]).range([h - m.b, m.t]);
    const svg = d3.select(host).append("svg").attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`)
      .attr("aria-label", "Faixa para escolher o período");
    svg.append("g").attr("class", "eixo").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).ticks(w < 560 ? 4 : 10).tickSizeOuter(0).tickFormat(multiFormat));
    const serieTodas = new Map(cands.slice(0, 4).map((c) => [c, tendencia(base, c, 14, -Infinity, Infinity)]));
    const linha = d3.line().x((d) => x(d.t)).y((d) => y(d.v)).curve(d3.curveMonotoneX);
    serieTodas.forEach((s, c) => { if (s.length) svg.append("path").attr("d", linha(s)).attr("fill", "none").attr("stroke", cor(c)).attr("stroke-width", 1.2).attr("opacity", .8); });
    const brush = d3.brushX().extent([[m.l, m.t], [w - m.r, h - m.b]])
      .on("end", (ev) => {
        if (!ev.sourceEvent) return;
        if (!ev.selection) { const p = PRESETS[estado.turno][0]; Object.assign(T(), { preset: p[0], ini: p[2], fim: p[3] }); atualizar(); return; }
        const [a, b] = ev.selection.map((v) => x.invert(v));
        Object.assign(T(), { preset: null, ini: isoD(a), fim: isoD(b) });
        atualizar();
      });
    const gb = svg.append("g").attr("class", "brush").call(brush);
    gb.call(brush.move, [Math.max(m.l, x(parseD(T().ini).getTime())), Math.min(w - m.r, x(parseD(T().fim).getTime() + DIA))]);
  }

  // ---------- diferença entre os dois primeiros ----------
  function renderMargem(ps, cands) {
    const host = $("#g-margem");
    host.replaceChildren();
    if (cands.length < 2) { host.append(el("div", { class: "vazio" }, "Selecione ao menos dois candidatos.")); return; }
    const [a, b] = cands;
    $("#titulo-margem").textContent = `Diferença ${a} − ${b}`;
    $("#nota-margem").textContent = `Pontos acima de zero: ${a} à frente; abaixo: ${b} à frente. A faixa cinza marca ±2 pp, margem de erro típica das pesquisas nacionais.`;
    const dados = ps.map((p) => ({ p, d: difPesquisa(p, a, b) })).filter((x) => x.d != null);
    if (!dados.length) { host.append(el("div", { class: "vazio" }, "Sem pesquisas com os dois candidatos no recorte.")); return; }
    const { w, h } = dimensoes(host, 260);
    const m = { t: 12, r: 14, b: 26, l: 38 };
    const t0 = parseD(T().ini).getTime(), t1 = parseD(T().fim).getTime() + DIA * 0.5;
    const x = d3.scaleTime().domain([t0 - DIA, t1]).range([m.l, w - m.r]);
    const ext = Math.max(6, d3.max(dados, (d) => Math.abs(d.d)) + 1);
    const y = d3.scaleLinear().domain([-ext, ext]).nice().range([h - m.b, m.t]);
    const svg = d3.select(host).append("svg").attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`);
    svg.append("rect").attr("x", m.l).attr("width", w - m.l - m.r).attr("y", y(2)).attr("height", y(-2) - y(2)).attr("fill", "var(--surface-2)");
    svg.append("g").selectAll("line").data(y.ticks(6)).join("line").attr("class", "gridline").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
    svg.append("line").attr("class", "zero").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0));
    svg.append("g").attr("class", "eixo").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(0).tickPadding(6).tickFormat((d) => (d > 0 ? "+" : "") + d)).call((g) => g.select(".domain").remove());
    svg.append("g").attr("class", "eixo").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(w < 560 ? 3 : 6).tickSizeOuter(0).tickFormat(multiFormat));
    svg.append("text").attr("x", m.l + 6).attr("y", m.t + 10).text(`${a} à frente ↑`).attr("font-size", 11);
    svg.append("text").attr("x", m.l + 6).attr("y", h - m.b - 6).text(`${b} à frente ↓`).attr("font-size", 11);
    if (DATA_1T >= T().ini && DATA_1T <= T().fim) {
      const xe = x(parseD(DATA_1T).getTime());
      svg.append("line").attr("x1", xe).attr("x2", xe).attr("y1", m.t).attr("y2", h - m.b).attr("stroke", "var(--ink-2)").attr("opacity", .5);
    }
    const pts = dados.map((d) => ({ ...d, px: x(d.p.tMeio), py: y(d.d) }));
    svg.append("g").selectAll("circle").data(pts).join("circle").attr("cx", (d) => d.px).attr("cy", (d) => d.py).attr("r", 3.4)
      .attr("fill", (d) => (d.d >= 0 ? cor(a) : cor(b)))
      .attr("opacity", (d) => (estado.destaque ? (d.p.instituto === estado.destaque ? .95 : .15) : .6))
      .attr("stroke", (d) => (foco === d.p.id ? "var(--ink)" : "none")).attr("stroke-width", 1.5);
    // tendência da diferença
    if (estado.banda) {
      const sa = tendencia(ps, a, estado.banda, t0, t1), sb = tendencia(ps, b, estado.banda, t0, t1);
      const mb = new Map(sb.map((d) => [d.t, d.v]));
      const sd = sa.filter((d) => mb.has(d.t)).map((d) => ({ t: d.t, v: d.v - mb.get(d.t) }));
      if (sd.length) svg.append("path").attr("d", d3.line().x((d) => x(d.t)).y((d) => y(d.v)).curve(d3.curveMonotoneX)(sd)).attr("fill", "none").attr("stroke", "var(--ink)").attr("stroke-width", 2);
    }
    const res = RESULTADO[String(estado.turno)];
    let resDif = null;
    if (res && estado.resultado) {
      const rm = estado.metrica === "validos" ? res.validos : res.totais;
      const tr = parseD(res.data).getTime();
      if (rm && rm.candidatos[a] != null && rm.candidatos[b] != null && tr >= t0 - DIA && tr <= t1) {
        resDif = { px: x(tr), py: y(rm.candidatos[a] - rm.candidatos[b]), d: rm.candidatos[a] - rm.candidatos[b] };
        svg.append("path").attr("d", d3.symbol(d3.symbolDiamond, 70)()).attr("transform", `translate(${x(tr)},${y(rm.candidatos[a] - rm.candidatos[b])})`).attr("fill", "var(--ink)").attr("stroke", "var(--surface)").attr("stroke-width", 1.5);
      }
    }
    const delaunay = d3.Delaunay.from(pts, (d) => d.px, (d) => d.py);
    svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", w - m.l - m.r).attr("height", h - m.t - m.b).attr("fill", "transparent")
      .on("pointermove", (ev) => {
        const [mx, my] = d3.pointer(ev);
        if (resDif && Math.hypot(resDif.px - mx, resDif.py - my) < 14) {
          mostrarTip(ev, [el("div", { class: "tt-t" }, `Resultado oficial do ${estado.turno}º turno · TSE`), el("div", { class: "tt-r" }, el("b", {}, sinal(resDif.d)), el("span", {}, `${a} − ${b}`))], host);
          return;
        }
        const d = pts[delaunay.find(mx, my)];
        if (!d || Math.hypot(d.px - mx, d.py - my) > 18) { esconderTip(); return; }
        mostrarTip(ev, [...ttPesquisa(d.p, [a, b]), el("hr"), el("div", { class: "tt-r" }, el("b", {}, sinal(d.d)), el("span", {}, `${a} − ${b}`))], host);
      })
      .on("pointerleave", esconderTip)
      .on("click", (ev) => {
        const [mx, my] = d3.pointer(ev);
        const d = pts[delaunay.find(mx, my)];
        if (d && Math.hypot(d.px - mx, d.py - my) < 18) focar(d.p.id, true);
      });
  }

  // ---------- última pesquisa por instituto ----------
  function renderUltimas(ps, cands) {
    const host = $("#g-ultimas");
    host.replaceChildren();
    if (!ps.length || !cands.length) { host.append(el("div", { class: "vazio" }, "Sem pesquisas no recorte.")); return; }
    const [a, b] = cands;
    const porInst = d3.rollup(ps, (v) => v.reduce((m, p) => (p.tFim > m.tFim || (p.tFim === m.tFim && p.cenario < m.cenario) ? p : m)), (p) => p.instituto);
    const linhas = Array.from(porInst.values()).map((p) => ({ p, d: b ? difPesquisa(p, a, b) : 0 }))
      .sort((x, y) => (y.d ?? -999) - (x.d ?? -999));
    const { w } = dimensoes(host, 0);
    const rh = 26, m = { t: 22, r: 46, b: 22, l: w < 560 ? 112 : 150 };
    const h = m.t + m.b + linhas.length * rh;
    const vmax = d3.max(linhas, (l) => d3.max(cands, (c) => valor(l.p, c, estado.metrica))) || 50;
    const x = d3.scaleLinear().domain([0, Math.ceil((vmax + 2) / 10) * 10]).range([m.l, w - m.r]);
    const svg = d3.select(host).append("svg").attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`);
    svg.append("g").selectAll("line").data(x.ticks(5)).join("line").attr("class", "gridline").attr("x1", x).attr("x2", x).attr("y1", m.t - 4).attr("y2", h - m.b);
    svg.append("g").attr("class", "eixo").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickSize(0).tickPadding(6).tickFormat((d) => d + "%")).call((g) => g.select(".domain").remove());
    linhas.forEach((l, i) => {
      const yy = m.t + i * rh + rh / 2;
      const g = svg.append("g").style("cursor", "pointer").attr("opacity", estado.destaque && l.p.instituto !== estado.destaque ? .35 : 1)
        .on("click", () => focar(l.p.id, true));
      g.append("rect").attr("x", 0).attr("y", yy - rh / 2).attr("width", w).attr("height", rh).attr("fill", foco === l.p.id ? "var(--surface-2)" : "transparent");
      g.append("text").attr("x", 0).attr("y", yy).attr("dy", "0.35em").text(l.p.instituto).style("fill", "var(--ink)").style("font-weight", 600);
      g.append("text").attr("x", m.l - 8).attr("y", yy).attr("dy", "0.35em").attr("text-anchor", "end").text(fDia(parseD(l.p.fim))).style("font-family", "var(--font-data)").attr("font-size", 10.5).style("fill", "var(--ink-3)");
      const vs = cands.map((c) => [c, valor(l.p, c, estado.metrica)]).filter((v) => v[1] != null);
      if (a && b && l.p.candidatos[a] != null && l.p.candidatos[b] != null) {
        g.append("line").attr("x1", x(valor(l.p, a, estado.metrica))).attr("x2", x(valor(l.p, b, estado.metrica))).attr("y1", yy).attr("y2", yy).attr("stroke", "var(--ink-3)").attr("stroke-width", 2).attr("opacity", .5);
      }
      vs.slice().reverse().forEach(([c, v]) => {
        g.append("circle").attr("cx", x(v)).attr("cy", yy).attr("r", cands.indexOf(c) < 2 ? 5.5 : 4).attr("fill", cor(c)).attr("stroke", "var(--surface)").attr("stroke-width", 2);
      });
      if (l.d != null) g.append("text").attr("x", w - m.r + 8).attr("y", yy).attr("dy", "0.35em").text(sinal(l.d)).style("font-family", "var(--font-data)").attr("font-size", 11).style("fill", "var(--ink)");
      g.on("pointermove", (ev) => mostrarTip(ev, [...ttPesquisa(l.p, cands), l.d != null ? el("div", { class: "tt-s" }, `${a} − ${b}: ${sinal(l.d)} pp`) : null].filter(Boolean), host)).on("pointerleave", esconderTip);
    });
    if (a && b) svg.append("text").attr("x", w).attr("text-anchor", "end").attr("y", 8).text(`${a.split(" ")[0]}−${b.split(" ")[0]}`).attr("font-size", 10).style("fill", "var(--ink-3)");
  }

  // ---------- viés por instituto ----------
  function renderVies(ps, cands) {
    const host = $("#g-vies");
    host.replaceChildren();
    if (cands.length < 2) { host.append(el("div", { class: "vazio" }, "Selecione ao menos dois candidatos.")); return; }
    const [a, b] = cands;
    $("#nota-vies").textContent = `Quanto, em média, cada instituto mostra a diferença ${a} − ${b} acima (para ${a}) ou abaixo (para ${b}) da média de todas as pesquisas na mesma data. Só institutos com 2 ou mais pesquisas no recorte.`;
    const t0 = parseD(T().ini).getTime() - 30 * DIA, t1 = parseD(T().fim).getTime() + DIA;
    const h0 = Math.max(estado.banda || 10, 7);
    const sa = tendencia(ps, a, h0, t0, t1), sb = tendencia(ps, b, h0, t0, t1);
    const desv = [];
    ps.forEach((p) => {
      const d = difPesquisa(p, a, b);
      const ta = tendenciaEm(sa, p.tMeio), tb = tendenciaEm(sb, p.tMeio);
      if (d != null && ta != null && tb != null) desv.push({ inst: p.instituto, v: d - (ta - tb), pid: p.pesquisa_id });
    });
    const grupos = Array.from(d3.group(desv, (d) => d.inst), ([inst, v]) => ({ inst, v: d3.mean(v, (x) => x.v), n: new Set(v.map((x) => x.pid)).size }))
      .filter((g) => g.n >= 2).sort((x, y) => y.v - x.v);
    if (!grupos.length) { host.append(el("div", { class: "vazio" }, "Poucas pesquisas no recorte para estimar.")); return; }
    const { w } = dimensoes(host, 0);
    const rh = 24, m = { t: 22, r: 16, b: 22, l: w < 560 ? 112 : 150 };
    const h = m.t + m.b + grupos.length * rh;
    const ext = Math.max(3, d3.max(grupos, (g) => Math.abs(g.v)) + 1);
    const x = d3.scaleLinear().domain([-ext, ext]).nice().range([m.l, w - m.r]);
    const svg = d3.select(host).append("svg").attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`);
    svg.append("g").selectAll("line").data(x.ticks(6)).join("line").attr("class", "gridline").attr("x1", x).attr("x2", x).attr("y1", m.t - 4).attr("y2", h - m.b);
    svg.append("line").attr("class", "zero").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t - 6).attr("y2", h - m.b);
    svg.append("g").attr("class", "eixo").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6).tickSize(0).tickPadding(6).tickFormat((d) => (d > 0 ? "+" : "") + d)).call((g) => g.select(".domain").remove());
    svg.append("text").attr("x", x(0) + 6).attr("y", 10).text(`favorece ${a} →`).attr("font-size", 11);
    svg.append("text").attr("x", x(0) - 6).attr("y", 10).attr("text-anchor", "end").text(`← favorece ${b}`).attr("font-size", 11);
    grupos.forEach((g, i) => {
      const yy = m.t + i * rh + rh / 2;
      const x0 = x(0), x1 = x(g.v);
      const gg = svg.append("g").attr("opacity", estado.destaque && g.inst !== estado.destaque ? .35 : 1);
      gg.append("text").attr("x", 0).attr("y", yy).attr("dy", "0.35em").text(g.inst).style("fill", "var(--ink)").style("font-weight", 600);
      gg.append("text").attr("x", m.l - 8).attr("y", yy).attr("dy", "0.35em").attr("text-anchor", "end").text(`n=${g.n}`).style("font-family", "var(--font-data)").attr("font-size", 10.5).style("fill", "var(--ink-3)");
      const bw = Math.max(1, Math.abs(x1 - x0));
      gg.append("rect").attr("x", Math.min(x0, x1)).attr("y", yy - 7).attr("width", bw).attr("height", 14).attr("rx", 3)
        .attr("fill", g.v >= 0 ? cor(a) : cor(b)).attr("opacity", .85);
      const lx = g.v >= 0 ? x1 + 5 : x1 - 5;
      gg.append("text").attr("x", lx).attr("y", yy).attr("dy", "0.35em").attr("text-anchor", g.v >= 0 ? "start" : "end").text(sinal(g.v)).style("font-family", "var(--font-data)").attr("font-size", 11).style("fill", "var(--ink)");
      gg.append("rect").attr("x", 0).attr("y", yy - rh / 2).attr("width", w).attr("height", rh).attr("fill", "transparent")
        .on("pointermove", (ev) => mostrarTip(ev, [el("div", { class: "tt-t" }, g.inst), el("div", { class: "tt-s" }, `${g.n} pesquisas no recorte`), el("div", { class: "tt-r" }, el("b", {}, sinal(g.v) + " pp"), el("span", {}, `na diferença ${a} − ${b} vs. média`))], host))
        .on("pointerleave", esconderTip);
    });
  }

  // ---------- acerto no 1º turno ----------
  function renderAcerto() {
    const tab = $("#t-acerto");
    const res = RESULTADO["1"];
    const painel = $("#painel-acerto");
    if (!res || !res.validos) { painel.hidden = true; return; }
    painel.hidden = false;
    const real = res.validos.candidatos;
    const finais = TODAS.filter((p) => p.turno === 1 && p.cenario === 1 && p.fim >= "2026-09-25" && p.fim < res.data);
    const porInst = d3.rollup(finais, (v) => v.reduce((m, p) => (p.tFim > m.tFim ? p : m)), (p) => p.instituto);
    const cs = Object.keys(real);
    const linhas = Array.from(porInst.values()).map((p) => {
      const erros = cs.map((c) => { const v = valor(p, c, "validos"); return v == null ? null : v - real[c]; }).filter((e) => e != null);
      const dl = valor(p, "Lula", "validos"), df = valor(p, "Flávio Bolsonaro", "validos");
      return {
        p, mae: d3.mean(erros, Math.abs),
        lula: dl, flavio: df, dif: dl - df, errDif: (dl - df) - (real["Lula"] - real["Flávio Bolsonaro"]),
      };
    }).sort((a, b) => a.mae - b.mae);
    const difReal = real["Lula"] - real["Flávio Bolsonaro"];
    const th = (t, cls) => el("th", { class: "nao-ord " + (cls || "") }, t);
    tab.replaceChildren(
      el("thead", {}, el("tr", {}, th("#", "txt"), th("Instituto", "txt"), th("Campo"), th("Lula"), th("Flávio"), th("Lula−Flávio"), th("Erro dif."), th("Erro médio"))),
      el("tbody", {},
        el("tr", {}, el("td", { class: "txt" }, ""), el("td", { class: "txt" }, el("b", {}, "Resultado TSE")), el("td", { class: "num" }, "04/10"),
          el("td", { class: "num" }, num(real["Lula"], 2)), el("td", { class: "num" }, num(real["Flávio Bolsonaro"], 2)), el("td", { class: "num" }, sinal(difReal)), el("td", {}, ""), el("td", {}, "")),
        ...linhas.map((l, i) => el("tr", {},
          el("td", { class: "txt num" }, i + 1),
          el("td", { class: "txt" }, l.p.link ? el("a", { href: l.p.link, target: "_blank", rel: "noopener" }, l.p.instituto) : l.p.instituto),
          el("td", { class: "num" }, fDia(parseD(l.p.fim))),
          el("td", { class: "num" }, num1(l.lula)), el("td", { class: "num" }, num1(l.flavio)),
          el("td", { class: "num" }, sinal(l.dif)),
          el("td", { class: "num" }, sinal(l.errDif)),
          el("td", { class: "num" }, el("b", {}, num1(l.mae) + " pp"))))));
  }

  // ---------- tabela de pesquisas ----------
  function renderTabela(psRecorte, cands) {
    const tab = $("#t-pesquisas");
    const excl = new Set(estado.excluidas);
    let linhas = psRecorte.slice();
    if (estado.soMarcadas) linhas = linhas.filter((p) => !excl.has(p.id));
    const { col, dir } = estado.ordem;
    const chave = (p) => {
      if (col === "fim") return p.tFim * 10 - p.cenario;
      if (col === "instituto") return p.instituto;
      if (col === "amostra") return p.amostra ?? -1;
      if (col === "margem") return p.margem ?? -1;
      if (col === "bni") return p.brancos_nulos_indecisos ?? -1;
      if (col.startsWith("c:")) return valor(p, col.slice(2), estado.metrica) ?? -999;
      return 0;
    };
    linhas.sort((a, b) => { const ka = chave(a), kb = chave(b); return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir; });

    const nMarc = psRecorte.filter((p) => !excl.has(p.id)).length;
    const nPesqMarc = new Set(psRecorte.filter((p) => !excl.has(p.id)).map((p) => p.pesquisa_id)).size;
    $("#contagem").replaceChildren(el("b", {}, nPesqMarc), " pesquisas no gráfico", nMarc !== nPesqMarc ? ` (${nMarc} cenários)` : "", " · ", el("b", {}, psRecorte.length - nMarc), " desmarcadas");

    const cabs = [
      ["sel", "", "nao-ord"], ["instituto", "Instituto", "txt"], ["fim", "Campo", "txt"],
      ...cands.map((c) => ["c:" + c, c, ""]),
      ...(estado.turno === 1 && estado.metrica === "totais" ? [["outros", "Outros", "nao-ord"]] : []),
      ...(estado.metrica === "totais" ? [["bni", "Br/Nul/Ind", ""]] : []),
      ["margem", "Margem", ""], ["amostra", "Amostra", ""], ["link", "Fonte", "nao-ord txt"],
    ];
    const todasMarcadas = psRecorte.length > 0 && nMarc === psRecorte.length;
    const thead = el("thead", {}, el("tr", {}, ...cabs.map(([k, t, cls]) => {
      if (k === "sel") {
        const cb = el("input", { type: "checkbox", "aria-label": "Marcar todas", onchange: (e) => { marcarTodas(e.target.checked); } });
        cb.checked = todasMarcadas; cb.indeterminate = !todasMarcadas && nMarc > 0;
        return el("th", { class: "nao-ord txt" }, cb);
      }
      const ordenavel = !cls.includes("nao-ord");
      return el("th", {
        class: cls, "aria-sort": col === k ? (dir > 0 ? "ascending" : "descending") : null, tabindex: ordenavel ? 0 : null,
        onclick: ordenavel ? () => { estado.ordem = { col: k, dir: col === k ? -dir : (k === "instituto" ? 1 : -1) }; atualizar(); } : null,
        onkeydown: ordenavel ? (e) => { if (e.key === "Enter") e.target.click(); } : null,
      }, t);
    })));
    const tbody = el("tbody");
    for (const p of linhas) {
      const vals = cands.map((c) => valor(p, c, estado.metrica));
      const vmax = d3.max(vals);
      const on = !excl.has(p.id);
      const cb = el("input", { type: "checkbox", "aria-label": `Incluir ${p.instituto} ${p.periodo}`, onchange: (e) => alternar(p.id, e.target.checked) });
      cb.checked = on;
      const tr = el("tr", { "data-id": p.id, class: [on ? "" : "off", foco === p.id ? "foco" : "", p.cenario > 1 ? "cenario-extra" : ""].join(" ").trim() },
        el("td", { class: "txt" }, cb),
        el("td", { class: "txt" }, p.instituto, p.total_cenarios > 1 && estado.turno === 1 ? el("span", { class: "tag" }, `cen. ${p.cenario}`) : null),
        el("td", { class: "txt num", title: `${p.inicio || ""} a ${p.fim}` }, p.inicio && p.inicio !== p.fim ? `${fDia(parseD(p.inicio))}–${fDia(parseD(p.fim))}` : fDia(parseD(p.fim)), p.fim.slice(0, 4) !== "2026" ? "/" + p.fim.slice(2, 4) : ""),
        ...vals.map((v) => el("td", { class: "num" }, v == null ? "–" : (v === vmax ? el("span", { class: "lider" }, num(v)) : num(v)))),
        ...(estado.turno === 1 && estado.metrica === "totais" ? [el("td", { class: "num" }, num(p.outros))] : []),
        ...(estado.metrica === "totais" ? [el("td", { class: "num" }, num(p.brancos_nulos_indecisos))] : []),
        el("td", { class: "num" }, p.margem != null ? "±" + num(p.margem) : "–"),
        el("td", { class: "num" }, p.amostra ? p.amostra.toLocaleString("pt-BR") : "–"),
        el("td", { class: "txt" }, p.link ? el("a", { href: p.link, target: "_blank", rel: "noopener" }, dominio(p.link)) : "–"));
      tr.addEventListener("pointerenter", () => destacarPonto(p.id, true));
      tr.addEventListener("pointerleave", () => destacarPonto(p.id, false));
      tbody.append(tr);
    }
    if (!linhas.length) tbody.append(el("tr", {}, el("td", { colspan: cabs.length, class: "vazio" }, "Nenhuma pesquisa no recorte.")));
    tab.replaceChildren(thead, tbody);
  }
  const dominio = (u) => { try { return new URL(u).hostname.replace(/^www\d?\./, "").replace(/^(g1|noticias|admin)\./, "$1."); } catch (e) { return "link"; } };

  function destacarPonto(id, on) {
    d3.select("#g-principal").selectAll("circle")
      .filter((d) => d && d.p && d.p.id === id)
      .attr("r", on ? 6 : (foco === id ? 4.6 : 3.2)).attr("stroke", on ? "var(--ink)" : "none").attr("stroke-width", 1.5).attr("opacity", on ? 1 : null)
      .raise();
    if (!on) atualizarSoGraficos();
  }

  function alternar(id, on) {
    const s = new Set(estado.excluidas);
    on ? s.delete(id) : s.add(id);
    estado.excluidas = Array.from(s);
    atualizar();
  }
  function marcarTodas(on) {
    const ids = filtradas().map((p) => p.id);
    const s = new Set(estado.excluidas);
    ids.forEach((id) => (on ? s.delete(id) : s.add(id)));
    estado.excluidas = Array.from(s);
    atualizar();
  }
  function focar(id, rolar) {
    foco = foco === id && !rolar ? null : id;
    const p = TODAS.find((x) => x.id === id);
    if (p && estado.excluidas.includes(id)) { /* mantém desmarcada, só localiza */ }
    if (p && estado.soMarcadas && estado.excluidas.includes(id)) estado.soMarcadas = false;
    atualizar();
    if (rolar) {
      const tr = document.querySelector(`#t-pesquisas tr[data-id="${CSS.escape(id)}"]`);
      if (tr) {
        const box = tr.closest(".scroll-y");
        box.scrollTop = tr.offsetTop - box.clientHeight / 2;
        tr.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }

  // ---------- CSV ----------
  function csv() {
    const ps = filtradas().filter((p) => !estado.excluidas.includes(p.id));
    const cands = candidatosDoTurno(ps);
    const esc = (v) => { const s = v == null ? "" : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const cab = ["turno", "instituto", "inicio", "fim", "cenario", ...cands, "outros", "brancos_nulos_indecisos", "margem", "amostra", "base", "fonte"];
    const linhas = ps.map((p) => [p.turno, p.instituto, p.inicio, p.fim, p.cenario,
      ...cands.map((c) => { const v = valor(p, c, estado.metrica); return v == null ? "" : +v.toFixed(2); }),
      p.outros, p.brancos_nulos_indecisos, p.margem, p.amostra, estado.metrica, p.link]);
    return [cab, ...linhas].map((l) => l.map(esc).join(",")).join("\n");
  }
  function toast(msg) {
    const t = el("div", { class: "toast", role: "status" }, msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 2200);
  }

  // ---------- ciclo de renderização ----------
  let cache = null;
  function calcular() {
    const ps = filtradas();
    const ativas = ps.filter((p) => !estado.excluidas.includes(p.id));
    const todosCands = candidatosDoTurno(ativas.length ? ativas : ps);
    const off = new Set(T().candidatosOff);
    const cands = todosCands.filter((c) => !off.has(c));
    const t0 = parseD(T().ini).getTime() - DIA, t1 = parseD(T().fim).getTime() + DIA;
    const series = new Map(cands.map((c) => [c, estado.banda ? tendencia(ativas, c, estado.banda, t0, t1) : []]));
    return { ps, ativas, todosCands, cands, series };
  }
  function atualizarSoGraficos() {
    if (!cache) return;
    const { ativas, cands, series } = cache;
    renderPrincipal(ativas, cands, series);
  }
  function atualizar() {
    salvar();
    renderControles();
    cache = calcular();
    const { ps, ativas, todosCands, cands, series } = cache;
    renderCandidatos(todosCands);
    renderKPIs(ativas, cands, series);
    renderPrincipal(ativas, cands, series);
    renderBrush(cands);
    renderMargem(ativas, cands);
    renderUltimas(ativas, cands);
    renderVies(ativas, cands);
    renderAcerto();
    renderTabela(ps, cands);
  }

  // ---------- eventos dos controles ----------
  document.querySelectorAll(".turnos button").forEach((b) => b.addEventListener("click", () => {
    estado.turno = Number(b.dataset.turno); foco = null;
    try { history.replaceState(null, "", estado.turno === 2 ? "#segundo-turno" : "#primeiro-turno"); } catch (e) { /* ignorado */ }
    atualizar();
  }));
  document.querySelectorAll("#cenario button").forEach((b) => b.addEventListener("click", () => { estado.cenario = b.dataset.v; atualizar(); }));
  document.querySelectorAll("#metrica button").forEach((b) => b.addEventListener("click", () => { estado.metrica = b.dataset.v; atualizar(); }));
  $("#confronto").addEventListener("change", (e) => { T().confronto = e.target.value; T().candidatosOff = []; atualizar(); });
  $("#banda").addEventListener("change", (e) => { estado.banda = Number(e.target.value); atualizar(); });
  $("#opt-pontos").addEventListener("change", (e) => { estado.pontos = e.target.checked; atualizar(); });
  $("#opt-eventos").addEventListener("change", (e) => { estado.eventos = e.target.checked; atualizar(); });
  $("#opt-resultado").addEventListener("change", (e) => { estado.resultado = e.target.checked; atualizar(); });
  $("#opt-so-marcadas").addEventListener("change", (e) => { estado.soMarcadas = e.target.checked; atualizar(); });
  $("#destaque").addEventListener("change", (e) => { estado.destaque = e.target.value; atualizar(); });
  const mudarData = () => {
    let ini = $("#data-ini").value, fim = $("#data-fim").value;
    if (!ini || !fim) return;
    if (ini > fim) [ini, fim] = [fim, ini];
    Object.assign(T(), { preset: null, ini, fim });
    atualizar();
  };
  $("#data-ini").addEventListener("change", mudarData);
  $("#data-fim").addEventListener("change", mudarData);
  $("#cand-todos").addEventListener("click", () => { T().candidatosOff = []; atualizar(); });
  $("#cand-dois").addEventListener("click", () => { T().candidatosOff = cache.todosCands.slice(2); atualizar(); });
  $("#inst-todos").addEventListener("click", () => { estado.institutosOff = []; atualizar(); });
  $("#inst-nenhum").addEventListener("click", () => { estado.institutosOff = INSTITUTOS.slice(); atualizar(); });
  $("#sel-todas").addEventListener("click", () => marcarTodas(true));
  $("#sel-nenhuma").addEventListener("click", () => marcarTodas(false));
  $("#sel-inverter").addEventListener("click", () => {
    const s = new Set(estado.excluidas);
    filtradas().forEach((p) => (s.has(p.id) ? s.delete(p.id) : s.add(p.id)));
    estado.excluidas = Array.from(s);
    atualizar();
  });
  $("#copiar-csv").addEventListener("click", () => {
    const texto = csv();
    navigator.clipboard.writeText(texto).then(() => toast("CSV copiado — cole numa planilha"), () => {
      const ta = el("textarea", { style: "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0" });
      ta.value = texto; document.body.append(ta); ta.select();
      try { document.execCommand("copy"); toast("CSV copiado"); } catch (e) { toast("Não foi possível copiar"); }
      ta.remove();
    });
  });
  // download direto só fora de um ambiente embutido (ex.: GitHub Pages ou arquivo local)
  if (window.top === window.self) {
    const b = $("#baixar-csv");
    b.hidden = false;
    b.addEventListener("click", () => {
      const blob = new Blob(["﻿" + csv()], { type: "text/csv;charset=utf-8" });
      const a = el("a", { href: URL.createObjectURL(blob), download: `pesquisas-${estado.turno}t-${T().ini}-a-${T().fim}.csv` });
      document.body.append(a); a.click(); a.remove();
    });
  }
  let tmr;
  window.addEventListener("resize", () => { clearTimeout(tmr); tmr = setTimeout(atualizar, 150); });

  const fonte = $("#fonte");
  fonte.href = D.fonte.url; fonte.textContent = "Wikipédia (Opinion polling for the 2026 Brazilian presidential election)";
  $("#atualizacao").textContent = `Dados até ${fDiaAno(parseD(ULTIMA_DATA))} · atualizado em ${fDiaAno(new Date(D.atualizado_em))}`;

  atualizar();
})();
