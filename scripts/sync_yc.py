#!/usr/bin/env python3
"""Fetch YC companies and keep Inactive ones from Winter 2020 through Winter 2026."""

from __future__ import annotations

import csv
import json
import ssl
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

YC_OSS_URL = "https://yc-oss.github.io/api/companies/all.json"

# Inclusive of Winter 2020 through Winter 2026, including Summer/Fall/Spring
# batches that fall in between. Spring 2026 and later are excluded.
INCLUDED_BATCHES = {
    "Winter 2020",
    "Summer 2020",
    "Winter 2021",
    "Summer 2021",
    "Winter 2022",
    "Summer 2022",
    "Winter 2023",
    "Summer 2023",
    "Winter 2024",
    "Summer 2024",
    "Fall 2024",
    "Winter 2025",
    "Spring 2025",
    "Summer 2025",
    "Fall 2025",
    "Winter 2026",
}

KEEP_FIELDS = (
    "id",
    "name",
    "slug",
    "former_names",
    "website",
    "one_liner",
    "long_description",
    "batch",
    "status",
    "industry",
    "subindustry",
    "industries",
    "tags",
    "all_locations",
    "regions",
    "team_size",
    "stage",
    "url",
    "small_logo_thumb_url",
    "launched_at",
)

CSV_COLUMNS = (
    "id",
    "name",
    "slug",
    "batch",
    "status",
    "industry",
    "subindustry",
    "one_liner",
    "website",
    "all_locations",
    "team_size",
    "url",
)

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
JSON_PATH = DATA_DIR / "companies.json"
CSV_PATH = DATA_DIR / "companies.csv"


def fetch_companies() -> list[dict]:
    request = urllib.request.Request(
        YC_OSS_URL,
        headers={"User-Agent": "failed-yc-founders/1.0"},
    )
    try:
        context = ssl.create_default_context()
        with urllib.request.urlopen(request, timeout=60, context=context) as response:
            return json.load(response)
    except Exception:
        result = subprocess.run(
            ["curl", "-fsSL", YC_OSS_URL],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(result.stdout)


def slim(company: dict) -> dict:
    return {field: company.get(field) for field in KEEP_FIELDS}


def write_csv(companies: list[dict]) -> None:
    with CSV_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for company in companies:
            writer.writerow({column: company.get(column) or "" for column in CSV_COLUMNS})


def main() -> int:
    raw = fetch_companies()
    inactive = [
        slim(company)
        for company in raw
        if company.get("status") == "Inactive" and company.get("batch") in INCLUDED_BATCHES
    ]
    inactive.sort(key=lambda company: (company.get("batch") or "", company.get("name") or ""))

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": YC_OSS_URL,
        "definition": "YC status Inactive, batches Winter 2020 through Winter 2026",
        "batches": sorted(INCLUDED_BATCHES),
        "synced_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(inactive),
        "companies": inactive,
    }
    JSON_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    write_csv(inactive)
    print(f"Wrote {len(inactive)} Inactive companies to {JSON_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
