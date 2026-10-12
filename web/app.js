// Road Works Coordination Dashboard — Leaflet + Chart.js, no build step.
(async function () {
  const DATA_URL = "data/segments.geojson"; // or the pipeline's REST API: <api>/segments?include_duplicates=true
  const TODAY = new Date("2026-10-01");     // "as of" date of the sample data
  const fc = await fetch(DATA_URL).then(r => r.json());
  const all = fc.features;

  const STATUS_COLORS = { "Active": "#2a9d8f", "Coordinated": "#3a86ff", "Initially Closed": "#8d6e63", "Cancelled": "#b3b3b3" };
  const PALETTE = ["#2a9d8f", "#e9c46a", "#264653", "#3a86ff", "#f4a261", "#8d6e63"];
  const fmt = n => n.toLocaleString("en-US");
  const uniq = k => [...new Set(all.map(f => f.properties[k]))].sort();

  document.getElementById("asof").textContent = "as of " + TODAY.toISOString().slice(0, 10);

  // ---------- filters ----------
  const el = id => document.getElementById(id);
  const fill = (id, vals) => vals.forEach(v => el(id).insertAdjacentHTML("beforeend", `<option>${v}</option>`));
  fill("f-sector", uniq("sector")); fill("f-contractor", uniq("contractor")); fill("f-class", uniq("segment_class"));

  function filtered() {
    const sec = el("f-sector").value, con = el("f-contractor").value, cls = el("f-class").value;
    const win = el("f-window").value, dups = el("f-dups").checked, q = el("f-search").value.trim().toLowerCase();
    const horizon = win ? new Date(TODAY.getTime() + +win * 864e5) : null;
    return all.filter(({ properties: p }) =>
      (!sec || p.sector === sec) && (!con || p.contractor === con) && (!cls || p.segment_class === cls) &&
      (dups || !p.duplicate_to_cancel) &&
      (!horizon || ((p.status === "Active" || p.status === "Coordinated") && new Date(p.start_date) <= horizon)) &&
      (!q || p.project_code.toLowerCase().includes(q) || p.district.toLowerCase().includes(q)));
  }

  // ---------- map ----------
  const map = L.map("map", { preferCanvas: true }).setView([24.71, 46.68], 11);
  const basemaps = {
    light: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { attribution: "© OpenStreetMap © CARTO", maxZoom: 19 }),
    imagery: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Imagery © Esri", maxZoom: 19 }),
  };
  basemaps.light.addTo(map);
  let layer = null;

  const popup = p => `<div class="pop"><b>${p.project_code}</b>${p.duplicate_to_cancel ? ' <span style="color:#b00">· duplicate – cancel</span>' : ""}
    <table>
      <tr><td>Type</td><td>${p.project_type}</td></tr>
      <tr><td>Status</td><td>${p.status} · ${p.segment_class}</td></tr>
      <tr><td>Contractor</td><td>${p.contractor}</td></tr>
      <tr><td>Sector</td><td>${p.sector}</td></tr>
      <tr><td>Municipality</td><td>${p.municipality}</td></tr>
      <tr><td>District</td><td>${p.district}</td></tr>
      <tr><td>Reference</td><td>${p.ref_no}</td></tr>
      <tr><td>Permit</td><td>${p.permit_no || "—"}</td></tr>
      <tr><td>Dates</td><td>${p.start_date} → ${p.end_date}</td></tr>
    </table></div>`;

  function drawMap(feats) {
    if (layer) map.removeLayer(layer);
    layer = L.geoJSON({ type: "FeatureCollection", features: feats }, {
      style: f => ({ color: STATUS_COLORS[f.properties.status] || "#666", weight: 5, opacity: 0.9,
                     dashArray: f.properties.duplicate_to_cancel ? "4 6" : null }),
      onEachFeature: (f, l) => l.bindPopup(popup(f.properties)),
    }).addTo(map);
  }
  el("legend").innerHTML = Object.entries(STATUS_COLORS)
    .map(([k, c]) => `<div><i style="background:${c}"></i>${k}</div>`).join("") +
    `<div><i style="background:repeating-linear-gradient(90deg,#666 0 4px,transparent 4px 8px)"></i>Duplicate</div>`;

  // ---------- KPIs ----------
  function drawKpis(feats) {
    const n = s => feats.filter(f => f.properties.status === s).length;
    const cls = c => feats.filter(f => f.properties.segment_class === c).length;
    const items = [
      ["Segments", feats.length, "#1c2b2a"], ["Active", n("Active"), STATUS_COLORS.Active],
      ["Coordinated", n("Coordinated"), STATUS_COLORS.Coordinated], ["Available (no permit)", cls("Available"), "#e9c46a"],
      ["Wasted", cls("Wasted"), "#f4a261"],
    ];
    el("kpis").innerHTML = items.map(([t, v, c]) => `<div class="kpi" style="--c:${c}"><span>${t}</span><b>${fmt(v)}</b></div>`).join("");
  }

  // ---------- contractor table + donut ----------
  const donut = new Chart(el("donut"), {
    type: "doughnut",
    data: { labels: [], datasets: [{ data: [], backgroundColor: PALETTE, borderWidth: 2 }] },
    options: { maintainAspectRatio: false, cutout: "58%",
               plugins: { legend: { position: "right", labels: { boxWidth: 10, font: { size: 11 } } } } },
  });

  function drawTable(feats) {
    const rows = {};
    feats.forEach(({ properties: p }) => {
      const r = rows[p.contractor] ||= { a: 0, c: 0, t: 0 };
      r.t++; if (p.status === "Active") r.a++; if (p.status === "Coordinated") r.c++;
    });
    const total = feats.length || 1, names = Object.keys(rows).sort();
    el("tbl").tBodies[0].innerHTML = names.map(n => `<tr data-c="${n}"><td>${n}</td><td class="r">${rows[n].a}</td>
      <td class="r">${rows[n].c}</td><td class="r">${rows[n].t}</td><td class="r">${(rows[n].t / total * 100).toFixed(1)}%</td></tr>`).join("");
    const s = k => names.reduce((x, n) => x + rows[n][k], 0);
    el("tbl").tFoot.innerHTML = `<tr><td>Total</td><td class="r">${s("a")}</td><td class="r">${s("c")}</td><td class="r">${s("t")}</td><td class="r">100%</td></tr>`;
    el("tbl").querySelectorAll("tbody tr").forEach(tr => tr.onclick = () => { el("f-contractor").value = tr.dataset.c; refresh(); });
    donut.data.labels = names; donut.data.datasets[0].data = names.map(n => rows[n].t); donut.update();
  }

  // ---------- export ----------
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  el("dl-csv").onclick = () => {
    const f = filtered(), cols = Object.keys(all[0].properties);
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    download("road_works_filtered.csv", [cols.join(","), ...f.map(x => cols.map(c => esc(x.properties[c])).join(","))].join("\n"), "text/csv");
  };
  el("dl-geojson").onclick = () =>
    download("road_works_filtered.geojson", JSON.stringify({ type: "FeatureCollection", features: filtered() }), "application/geo+json");

  // ---------- wiring ----------
  function refresh(fit) {
    const f = filtered();
    drawMap(f); drawKpis(f); drawTable(f);
    if (fit && f.length) map.fitBounds(layer.getBounds(), { padding: [20, 20] });
  }
  ["f-sector", "f-contractor", "f-class", "f-window", "f-dups"].forEach(id => el(id).onchange = () => refresh(true));
  el("f-search").oninput = () => refresh(false);
  document.querySelectorAll("#basemap button").forEach(b => b.onclick = () => {
    document.querySelectorAll("#basemap button").forEach(x => x.classList.toggle("on", x === b));
    Object.values(basemaps).forEach(l => map.removeLayer(l)); basemaps[b.dataset.b].addTo(map);
  });

  refresh(true);
})();
