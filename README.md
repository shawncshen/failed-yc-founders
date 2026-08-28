# failed-yc-founders

YC companies marked **Inactive** from **Winter 2020 through Winter 2026**, plus what we know about their founders — including LinkedIn URLs when available.

## What counts as failed

YC’s public directory uses four statuses: `Active`, `Inactive`, `Acquired`, `Public`.

This repo only includes:

- `status === "Inactive"`
- batch in Winter 2020 … Winter 2026 (including Summer / Fall / Spring batches in that window)

`Acquired` and `Public` companies are intentionally excluded.

## Quick start

```bash
# refresh the Inactive company census
python3 scripts/sync_yc.py

# enrich founders (YC pages + LinkdAPI for missing LinkedIn)
cp .env.example .env
# put LINKDAPI_API_KEY=... in .env
python3 scripts/enrich_founders.py

# open the dashboard
python3 -m http.server
# then visit http://127.0.0.1:8000/site/
```

On the Founders tab, **each founder’s name is a link to their LinkedIn** when we found a URL.

## Data

| File | Contents |
| --- | --- |
| `data/companies.json` | Inactive companies in the batch window |
| `data/companies.csv` | Same census as CSV |
| `data/founders.json` | Founders with LinkedIn + current bio/headline |

Sources:

1. [yc-oss API](https://yc-oss.github.io/api/companies/all.json) — YC directory mirror
2. YC company pages — founder names and LinkedIn when listed
3. [LinkdAPI](https://linkdapi.com/) — fill LinkedIn gaps (`LINKDAPI_API_KEY`)

Never commit `.env`. Use `.env.example` as the template.

## Scripts

- `scripts/sync_yc.py` — fetch + filter Inactive companies
- `scripts/enrich_founders.py` — scrape YC founders; optional LinkdAPI
  - `--limit N` process first N companies
  - `--skip-linkdapi` YC pages only
  - `--with-headlines` also call LinkdAPI profile overview when LinkedIn already exists
  - `--force` rebuild cached founder rows

## GitHub Pages

Enable Pages for this repo from the `main` branch root, then open `/site/`.
