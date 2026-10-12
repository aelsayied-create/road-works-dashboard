# Road Works Coordination Dashboard

A web GIS dashboard for coordinating road works across a city: which segments are **active**, **coordinated** or **closed**, which **contractor** and **sector** they belong to, and which works are starting in the next 30 days.

> ⚠️ **Anonymised sample data.** The map shows a small educational sample (200 of ~27,000) of road segments. Contractor names are replaced with *Contractor A–E*, and project codes, permit numbers, consultants and project names are removed or replaced with generic IDs. The companion repo [road-works-pipeline](https://github.com/aelsayied-create/road-works-pipeline) shows the processing logic on fully synthetic data.

> 💼 **About my production work.** This repo is a public sample. My real production dashboards for Riyadh Municipality run on Netlify behind password protection, because they belong to my employer. I can demonstrate them live during an interview.

**Live demo:** https://aelsayied-create.github.io/road-works-dashboard/

![screenshot](docs/screenshot.png)

## Features
- Road segments on an interactive map, coloured by status, with detailed pop-ups
- Filters: sector, contractor, class (Utilized / Available / Wasted), start window (active + next 7/30 days), free-text search
- Duplicates flagged by the pipeline can be shown as dashed lines
- KPI cards, contractor distribution doughnut and summary table (click a row to filter)
- Light map / satellite imagery switch
- Export of the filtered view as **CSV** or **GeoJSON**
- Optional site-wide **password gate** via a Netlify Edge Function
- Responsive layout; no build step, libraries vendored for reliability

## How it fits together
```
road-works-pipeline  ──►  segments.geojson / REST API (PostGIS)  ──►  this dashboard
 (Python rules, QA)                                                    (Leaflet + Chart.js)
```
The dashboard reads `web/data/segments.geojson`. To read live data instead, point `DATA_URL` in `web/app.js` at the pipeline's API, e.g. `https://<api-host>/segments?include_duplicates=true`.

## Run locally
```bash
cd web && python -m http.server 8000     # open http://localhost:8000
```

## Deploy
- **GitHub Pages (live demo):** every push to `main` deploys `web/` via `.github/workflows/pages.yml`.
- **Netlify (alternative):** import the repo in Netlify; `netlify.toml` handles the settings. Set `SITE_PASSWORD` to enable the optional password gate (Edge Function).

## Tech
Leaflet 1.9 · Chart.js 4 · vanilla JavaScript · GitHub Pages / Netlify (static hosting, Edge Functions) · GitHub Actions

## Author
**Amna Abdein** — GIS Engineer & Geospatial Web Developer
