// Road Works Coordination — Explore · Insights · Story (Leaflet + Chart.js, no build step)
(async function () {
  const TODAY = new Date("2026-10-05");           // snapshot date of the sample
  const fc = await fetch("data/segments.geojson?v=5").then(r => r.json());
  const ALL = fc.features.filter(f => !f.properties.duplicate_to_cancel);
  ALL.forEach(f => {
    const p = f.properties;
    p._start = new Date(p.start_date);
    p._km = (p.length_m || 0) / 1000;
    p._grp = statusGroup(p.status);
    p._cls = classGroup(p.segment_class);
  });

  // ---------- helpers ----------
  const $ = id => document.getElementById(id);
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const fmt = n => Math.round(n).toLocaleString("en-US");
  const km = n => (n >= 100 ? fmt(n) : n.toFixed(1)) + " km";
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const sum = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);
  const uniq = (arr, k) => [...new Set(arr.map(f => f.properties[k]))].filter(Boolean).sort();
  const count = (arr, k) => arr.reduce((m, f) => (m[f.properties[k]] = (m[f.properties[k]] || 0) + 1, m), {});
  const dayMs = 864e5;
  const fmtDate = d => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  $("asof").textContent = fmtDate(TODAY);

  function statusGroup(s) {
    if (s === "Active") return "Active";
    if (s === "Coordinated") return "Coordinated";
    if (/Closed/.test(s)) return "Closed";
    return "Other";
  }
  function classGroup(c) {
    return ["Available", "Utilized", "Wasted"].includes(c) ? c : "Other";
  }

  // Colours follow the entity (fixed order), validated categorical slots.
  const STATUS = ["Active", "Coordinated", "Closed", "Other"];
  const CLASS = ["Available", "Utilized", "Wasted", "Other"];
  const CONTRACTORS = uniq(ALL, "contractor");
  const SECTORS = uniq(ALL, "sector");
  function palette() {
    return {
      status: { Active: css("--c3"), Coordinated: css("--c1"), Closed: css("--c2"), Other: css("--neutral") },
      class: { Available: css("--c1"), Utilized: css("--c3"), Wasted: css("--red"), Other: css("--neutral") },
      contractor: Object.fromEntries(CONTRACTORS.map((c, i) => [c, css(`--c${i + 1}`) || css("--neutral")])),
    };
  }
  let PAL = palette();
  const LABELS = { status: "Status", class: "Class", contractor: "Contractor" };
  const keyOf = (dim, p) => dim === "status" ? p._grp : dim === "class" ? p._cls : p.contractor;
  const orderOf = dim => dim === "status" ? STATUS : dim === "class" ? CLASS : CONTRACTORS;

  // ---------- state ----------
  const state = { sector: "", contractor: "", status: "", cls: "", window: "", q: "", colorBy: "status", view: "explore" };

  // ---------- filters ----------
  $("f-sector").innerHTML = ["", ...SECTORS].map(s => `<button data-s="${s}" class="${s ? "" : "on"}">${s || "All sectors"}</button>`).join("");
  const opt = (id, vals) => vals.forEach(v => $(id).insertAdjacentHTML("beforeend", `<option>${v}</option>`));
  opt("f-contractor", CONTRACTORS); opt("f-status", STATUS); opt("f-class", CLASS);

  function filtered(src = ALL) {
    const q = state.q.trim().toLowerCase();
    const horizon = state.window ? new Date(TODAY.getTime() + +state.window * dayMs) : null;
    return src.filter(({ properties: p }) =>
      (!state.sector || p.sector === state.sector) &&
      (!state.contractor || p.contractor === state.contractor) &&
      (!state.status || p._grp === state.status) &&
      (!state.cls || p._cls === state.cls) &&
      (!horizon || ((p._grp === "Active" || p._grp === "Coordinated") && p._start <= horizon)) &&
      (!q || p.project_code.toLowerCase().includes(q) || p.district.toLowerCase().includes(q)));
  }
  function syncControls() {
    document.querySelectorAll("#f-sector button").forEach(b => b.classList.toggle("on", b.dataset.s === state.sector));
    $("f-contractor").value = state.contractor; $("f-status").value = state.status;
    $("f-class").value = state.cls; $("f-window").value = state.window; $("f-search").value = state.q;
    document.querySelectorAll("#colorby button").forEach(b => b.classList.toggle("on", b.dataset.c === state.colorBy));
  }
  $("f-sector").onclick = e => { const b = e.target.closest("button"); if (!b) return; state.sector = b.dataset.s; refresh(true); };
  [["f-contractor", "contractor"], ["f-status", "status"], ["f-class", "cls"], ["f-window", "window"]]
    .forEach(([id, k]) => $(id).onchange = () => { state[k] = $(id).value; refresh(true); });
  $("f-search").oninput = () => { state.q = $("f-search").value; refresh(false); };
  $("f-reset").onclick = () => { Object.assign(state, { sector: "", contractor: "", status: "", cls: "", window: "", q: "" }); refresh(true); };
  document.querySelectorAll("#colorby button").forEach(b => b.onclick = () => { state.colorBy = b.dataset.c; refresh(false); });

  // ---------- map ----------
  const map = L.map("map", { preferCanvas: true, zoomControl: true }).setView([24.71, 46.68], 10);
  const basemaps = {
    gray: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors", maxZoom: 16 }),
    imagery: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Imagery © Esri", maxZoom: 18 }),
  };
  basemaps.gray.addTo(map);
  document.querySelectorAll("#basemap button").forEach(b => b.onclick = () => {
    document.querySelectorAll("#basemap button").forEach(x => x.classList.toggle("on", x === b));
    Object.values(basemaps).forEach(l => map.removeLayer(l)); basemaps[b.dataset.b].addTo(map);
  });

  let layer = null;
  const popup = p => `<div class="pop"><b>${p.project_code}</b>
    <table>
      <tr><td>Status</td><td>${p.status}</td></tr>
      <tr><td>Class</td><td>${p.segment_class}</td></tr>
      <tr><td>Contractor</td><td>${p.contractor}</td></tr>
      <tr><td>Sector</td><td>${p.sector}</td></tr>
      <tr><td>District</td><td>${p.district}</td></tr>
      <tr><td>Type</td><td>${p.project_type}</td></tr>
      <tr><td>Length</td><td>${fmt(p.length_m)} m</td></tr>
      <tr><td>Dates</td><td>${p.start_date} → ${p.end_date}</td></tr>
    </table></div>`;

  function drawMap(feats, dim, context = []) {
    if (layer) map.removeLayer(layer);
    const ctx = L.geoJSON({ type: "FeatureCollection", features: context }, {
      style: () => ({ color: css("--neutral"), weight: 2, opacity: 0.35 }), interactive: false });
    const main = L.geoJSON({ type: "FeatureCollection", features: feats }, {
      style: f => ({ color: PAL[dim][keyOf(dim, f.properties)] || css("--neutral"), weight: 5, opacity: 0.95, lineCap: "round" }),
      onEachFeature: (f, l) => {
        l.bindPopup(popup(f.properties));
        l.on("mouseover", () => l.setStyle({ weight: 8 }));
        l.on("mouseout", () => l.setStyle({ weight: 5 }));
      },
    });
    layer = L.layerGroup([ctx, main]).addTo(map);
    drawLegend(dim, feats);
    return main;
  }
  function drawLegend(dim, feats) {
    const c = count(feats.map(f => ({ properties: { k: keyOf(dim, f.properties) } })), "k");
    $("legend").innerHTML = `<h4>${LABELS[dim]}</h4>` + orderOf(dim).filter(k => c[k])
      .map(k => `<div><i style="background:${PAL[dim][k]}"></i>${k} <span style="color:var(--muted)">${c[k]}</span></div>`).join("");
  }
  const fitTo = (lyr, pad = 30) => { try { const b = lyr.getBounds(); if (b.isValid()) map.flyToBounds(b, { padding: [pad, pad], duration: 0.8, maxZoom: 14 }); } catch (e) {} };

  // ---------- KPIs ----------
  function drawKpis(f) {
    const n = f.length, total = sum(f, x => x.properties._km);
    const g = k => f.filter(x => x.properties._grp === k), c = k => f.filter(x => x.properties._cls === k);
    const items = [
      ["Segments", fmt(n), "", ""],
      ["Network length", km(total), "", ""],
      ["Active now", fmt(g("Active").length), PAL.status.Active, `${pct(g("Active").length, n)}% of segments`],
      ["Coordinated", fmt(g("Coordinated").length), PAL.status.Coordinated, `${pct(g("Coordinated").length, n)}% of segments`],
      ["Available (no permit)", fmt(c("Available").length), PAL.class.Available, km(sum(c("Available"), x => x.properties._km))],
      ["Wasted windows", fmt(c("Wasted").length), PAL.class.Wasted, "closed without permit"],
    ];
    $("kpis").innerHTML = items.map(([t, v, col, s]) =>
      `<div class="kpi"><span>${col ? `<i style="background:${col}"></i>` : ""}${t}</span><b>${v}</b>${s ? `<small>${s}</small>` : ""}</div>`).join("");
  }

  // ---------- Chart.js theme ----------
  function themeCharts() {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = css("--ink-2");
    Chart.defaults.borderColor = css("--line");
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.boxHeight = 10;
    Chart.defaults.plugins.tooltip.backgroundColor = css("--ink");
    Chart.defaults.plugins.tooltip.titleColor = css("--surface");
    Chart.defaults.plugins.tooltip.bodyColor = css("--surface");
  }
  themeCharts();
  const bar = (label, data, color, extra = {}) => ({ label, data, backgroundColor: color, borderColor: css("--surface"), borderWidth: 1, borderRadius: 3, borderSkipped: false, maxBarThickness: 26, ...extra });
  const charts = {};
  function mk(id, cfg) { if (charts[id]) charts[id].destroy(); charts[id] = new Chart($(id), cfg); return charts[id]; }
  const stackedH = (pctMode) => ({
    indexAxis: "y", maintainAspectRatio: false, responsive: true,
    interaction: { mode: "nearest", intersect: true },
    plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${pctMode ? c.raw.toFixed(0) + "%" : c.raw}` } } },
    scales: { x: { stacked: true, grid: { color: css("--line") }, max: pctMode ? 100 : undefined, ticks: { callback: v => pctMode ? v + "%" : v } }, y: { stacked: true, grid: { display: false } } },
  });

  // ---------- Explore panel ----------
  function drawExplore(f) {
    const rows = CONTRACTORS.map(c => {
      const s = f.filter(x => x.properties.contractor === c);
      return { c, n: s.length, km: sum(s, x => x.properties._km), a: s.filter(x => x.properties._grp === "Active").length, av: s.filter(x => x.properties._cls === "Available").length, s };
    });
    mk("c-workload", {
      type: "bar",
      data: { labels: CONTRACTORS, datasets: STATUS.map(st => bar(st, rows.map(r => r.s.filter(x => x.properties._grp === st).length), PAL.status[st])) },
      options: { ...stackedH(false), onClick: (e, els) => { if (els[0]) { const c = CONTRACTORS[els[0].index]; state.contractor = state.contractor === c ? "" : c; refresh(true); } } },
    });
    $("tbl").tBodies[0].innerHTML = rows.map(r => `<tr data-c="${r.c}"${state.contractor === r.c ? ' style="font-weight:700"' : ""}>
      <td><span class="sw" style="background:${PAL.contractor[r.c]}"></span>${r.c}</td><td class="r">${r.n}</td><td class="r">${r.km.toFixed(1)}</td><td class="r">${r.a}</td><td class="r">${r.av}</td></tr>`).join("");
    $("tbl").tFoot.innerHTML = `<tr><td>Total</td><td class="r">${f.length}</td><td class="r">${sum(f, x => x.properties._km).toFixed(1)}</td><td class="r">${sum(rows, r => r.a)}</td><td class="r">${sum(rows, r => r.av)}</td></tr>`;
    $("tbl").querySelectorAll("tbody tr").forEach(tr => tr.onclick = () => { state.contractor = state.contractor === tr.dataset.c ? "" : tr.dataset.c; refresh(true); });
  }

  // ---------- Insights ----------
  function drawInsights(f) {
    // months
    const months = [...new Set(f.map(x => x.properties.start_date.slice(0, 7)))].sort();
    const from = months.findIndex(m => m >= "2026-01"); const shown = months.slice(Math.max(0, from)).slice(0, 18);
    const mLabel = m => new Date(m + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    mk("c-months", {
      type: "bar",
      data: { labels: shown.map(mLabel), datasets: STATUS.map(st => bar(st, shown.map(m => f.filter(x => x.properties._grp === st && x.properties.start_date.startsWith(m)).length), PAL.status[st], { maxBarThickness: 34 })) },
      options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom" } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: { color: css("--line") }, ticks: { precision: 0 } } } },
    });
    // sector by class
    mk("c-sector", {
      type: "bar",
      data: { labels: SECTORS, datasets: CLASS.map(c => bar(c, SECTORS.map(s => f.filter(x => x.properties.sector === s && x.properties._cls === c).length), PAL.class[c])) },
      options: stackedH(false),
    });
    // km by contractor (single series -> no legend, sorted)
    const kmRows = CONTRACTORS.map(c => ({ c, v: sum(f.filter(x => x.properties.contractor === c), x => x.properties._km) })).sort((a, b) => b.v - a.v);
    mk("c-km", {
      type: "bar",
      data: { labels: kmRows.map(r => r.c), datasets: [bar("km", kmRows.map(r => +r.v.toFixed(1)), kmRows.map(r => PAL.contractor[r.c]))] },
      options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.raw} km` } } },
        scales: { x: { grid: { color: css("--line") }, ticks: { callback: v => v + " km" } }, y: { grid: { display: false } } } },
    });
    // class mix %
    mk("c-mix", {
      type: "bar",
      data: { labels: CONTRACTORS, datasets: CLASS.map(c => bar(c, CONTRACTORS.map(k => { const s = f.filter(x => x.properties.contractor === k); return s.length ? s.filter(x => x.properties._cls === c).length / s.length * 100 : 0; }), PAL.class[c])) },
      options: stackedH(true),
    });
    // districts table
    const d = Object.entries(count(f, "district")).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = d.length ? d[0][1] : 1;
    $("t-districts").tBodies[0].innerHTML = d.map(([name, n]) => `<tr data-q="${name}"><td>${name}</td>
      <td><div class="b"><i style="width:${n / max * 100}%"></i><span>${n}</span></div></td>
      <td class="r">${sum(f.filter(x => x.properties.district === name), x => x.properties._km).toFixed(1)}</td></tr>`).join("");
    $("t-districts").querySelectorAll("tbody tr").forEach(tr => tr.onclick = () => { state.q = tr.dataset.q; setView("explore"); refresh(true); });
    // findings
    $("findings").innerHTML = findings(f).map(([t, s]) => `<div class="finding"><b>${t}</b>${s}</div>`).join("");
  }

  function findings(f) {
    if (!f.length) return [["No segments", "Adjust the filters to see insights."]];
    const n = f.length;
    const av = f.filter(x => x.properties._cls === "Available").length;
    const wa = f.filter(x => x.properties._cls === "Wasted");
    const bySector = Object.entries(count(f, "sector")).sort((a, b) => b[1] - a[1]);
    const next30 = upcoming(f, 30);
    const busy = Object.entries(count(next30, "contractor")).sort((a, b) => b[1] - a[1])[0];
    const wasteBy = Object.entries(count(wa, "contractor")).sort((a, b) => b[1] - a[1])[0];
    return [
      [`${pct(av, n)}% still need a permit`, `${av} of ${n} segments are coordinated but have no permit yet.`],
      [`${bySector[0][0]} carries the most work`, `${bySector[0][1]} segments (${pct(bySector[0][1], n)}% of the filtered sample).`],
      [`${next30.length} start within 30 days`, busy ? `${busy[0]} has the heaviest near-term load (${busy[1]}).` : "No upcoming starts in this view."],
      [`${wa.length} wasted windows`, wasteBy ? `Closed without a permit; most for ${wasteBy[0]} (${wasteBy[1]}).` : "None in this view."],
    ];
  }
  function upcoming(f, days) {
    const h = new Date(TODAY.getTime() + days * dayMs);
    return f.filter(x => (x.properties._grp === "Active" || x.properties._grp === "Coordinated") && x.properties._start <= h);
  }

  // ---------- Story ----------
  const bySectorAll = Object.entries(count(ALL, "sector")).sort((a, b) => b[1] - a[1]);
  const STEPS = [
    {
      title: "The network at a glance", dim: "status", pick: () => ALL,
      hero: f => km(sum(f, x => x.properties._km)), heroL: f => `across ${f.length} sample segments`,
      text: f => `This sample covers five city sectors and ${uniq(f, "municipality").length} municipalities. Each line is a road segment that a contractor plans to resurface; its colour shows where it is in the coordination cycle.`,
      mini: f => breakdown(f, "status"),
    },
    {
      title: "Work happening right now", dim: "contractor", pick: () => ALL.filter(x => x.properties._grp === "Active"),
      hero: f => fmt(f.length), heroL: () => "segments active today",
      text: f => { const top = Object.entries(count(f, "sector")).sort((a, b) => b[1] - a[1])[0]; return `Active works are spread across the city${top ? `, with ${top[0]} sector leading (${top[1]})` : ""}. Coloured by contractor, the map shows who is on site where.`; },
      mini: f => breakdown(f, "contractor"),
    },
    {
      title: "Coordinated, but no permit yet", dim: "class", pick: () => ALL.filter(x => x.properties._cls === "Available"),
      hero: f => pct(f.length, ALL.length) + "%", heroL: f => `of segments (${km(sum(f, x => x.properties._km))})`,
      text: () => `These segments are planned and coordinated, but no excavation permit has been issued. This is the window where utility companies can still lay cables and pipes before the new asphalt goes down.`,
      mini: f => breakdown(f, "contractor"),
    },
    {
      title: "Wasted coordination windows", dim: "contractor", pick: () => ALL.filter(x => x.properties._cls === "Wasted"),
      hero: f => fmt(f.length), heroL: () => "segments closed without a permit",
      text: f => { const top = Object.entries(count(f, "contractor")).sort((a, b) => b[1] - a[1])[0]; return `When a segment closes without anyone using its window, the opportunity to coordinate is lost and the road may be dug up again later.${top ? ` ${top[0]} has the most (${top[1]}).` : ""}`; },
      mini: f => breakdown(f, "contractor"),
    },
    {
      title: "The next 30 days", dim: "contractor", pick: () => upcoming(ALL, 30),
      hero: f => fmt(f.length), heroL: () => `segments active or starting by ${fmtDate(new Date(TODAY.getTime() + 30 * dayMs))}`,
      text: f => { const top = Object.entries(count(f, "contractor")).sort((a, b) => b[1] - a[1])[0]; return `This is the short-term workload each contractor receives as a monthly distribution.${top ? ` ${top[0]} carries the heaviest load with ${top[1]} segments.` : ""}`; },
      mini: f => breakdown(f, "contractor"),
    },
    {
      title: `Focus on the ${bySectorAll[0][0]} sector`, dim: "class", pick: () => ALL.filter(x => x.properties.sector === bySectorAll[0][0]),
      hero: f => pct(f.length, ALL.length) + "%", heroL: () => `of all sample segments`,
      text: f => `${bySectorAll[0][0]} sector has the most planned work in the sample. ${pct(f.filter(x => x.properties._cls === "Available").length, f.length)}% of its segments still await a permit. Use the Explore tab to filter any sector, contractor or district yourself.`,
      mini: f => breakdown(f, "class"),
    },
  ];
  let step = 0;
  function breakdown(f, dim) {
    const c = {}; f.forEach(x => { const k = keyOf(dim, x.properties); c[k] = (c[k] || 0) + 1; });
    const max = Math.max(1, ...Object.values(c));
    return orderOf(dim).filter(k => c[k]).map(k => `<div class="row"><span>${k}</span><div class="bar"><i style="width:${c[k] / max * 100}%;background:${PAL[dim][k]}"></i></div><span class="v">${c[k]}</span></div>`).join("");
  }
  function drawStory() {
    const s = STEPS[step], f = s.pick();
    $("st-count").textContent = `Story · ${step + 1} of ${STEPS.length}`;
    $("st-dots").innerHTML = STEPS.map((_, i) => `<button aria-label="Step ${i + 1}" class="${i === step ? "on" : ""}" data-i="${i}"></button>`).join("");
    $("st-title").textContent = s.title;
    $("st-hero").textContent = s.hero(f); $("st-hero-l").textContent = s.heroL(f);
    $("st-text").textContent = s.text(f);
    $("st-mini").innerHTML = s.mini(f);
    $("st-prev").disabled = step === 0;
    $("st-next").textContent = step === STEPS.length - 1 ? "Explore the data →" : "Next →";
    const context = ALL.filter(x => !f.includes(x));
    const main = drawMap(f, s.dim, context);
    drawKpis(f);
    fitTo(main.getLayers().length ? main : L.geoJSON({ type: "FeatureCollection", features: ALL }), 40);
  }
  $("st-dots").onclick = e => { const b = e.target.closest("button"); if (b) { step = +b.dataset.i; drawStory(); } };
  $("st-prev").onclick = () => { if (step > 0) { step--; drawStory(); } };
  $("st-next").onclick = () => { if (step < STEPS.length - 1) { step++; drawStory(); } else setView("explore"); };
  document.addEventListener("keydown", e => {
    if (state.view !== "story") return;
    if (e.key === "ArrowRight") $("st-next").click();
    if (e.key === "ArrowLeft") $("st-prev").click();
  });

  // ---------- views ----------
  function setView(v) {
    state.view = v;
    document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.view === v));
    $("map-layout").hidden = v === "insights";
    $("view-insights").hidden = v !== "insights";
    $("panel-explore").hidden = v !== "explore";
    $("panel-story").hidden = v !== "story";
    $("filterbar").hidden = v === "story";
    if (v !== "insights") setTimeout(() => map.invalidateSize(), 50);
    if (v === "story") { step = 0; drawStory(); } else refresh(v === "explore");
  }
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => setView(b.dataset.view));

  // ---------- export ----------
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const cols = Object.keys(ALL[0].properties).filter(k => !k.startsWith("_"));
  $("dl-csv").onclick = () => {
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    download("road_works_filtered.csv", [cols.join(","), ...filtered().map(x => cols.map(c => esc(x.properties[c])).join(","))].join("\n"), "text/csv");
  };
  $("dl-geojson").onclick = () => download("road_works_filtered.geojson",
    JSON.stringify({ type: "FeatureCollection", features: filtered().map(x => ({ type: "Feature", geometry: x.geometry, properties: Object.fromEntries(cols.map(c => [c, x.properties[c]])) })) }), "application/geo+json");

  // ---------- refresh ----------
  function refresh(fit) {
    syncControls();
    const f = filtered();
    drawKpis(f);
    if (state.view === "insights") { drawInsights(f); return; }
    if (state.view === "story") return;
    const main = drawMap(f, state.colorBy);
    drawExplore(f);
    if (fit && f.length) fitTo(main);
  }

  // re-theme on OS dark/light change
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { PAL = palette(); themeCharts(); state.view === "story" ? drawStory() : refresh(false); });

  refresh(true);
})();
