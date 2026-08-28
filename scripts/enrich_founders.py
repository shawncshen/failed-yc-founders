#!/usr/bin/env python3
"""Enrich Inactive YC founders from YC company pages, then LinkdAPI when needed."""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPANIES_PATH = ROOT / "data" / "companies.json"
FOUNDERS_PATH = ROOT / "data" / "founders.json"
ENV_PATH = ROOT / ".env"

DATA_PAGE_RE = re.compile(
    r'data-page="([^"]+)"',
    re.IGNORECASE,
)


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        os.environ.setdefault(key, value)


def http_get(url: str, headers: dict[str, str] | None = None, timeout: int = 45) -> str:
    request_headers = {"User-Agent": "failed-yc-founders/1.0"}
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(url, headers=request_headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="replace")
    except Exception:
        cmd = ["curl", "-fsSL", "-A", "failed-yc-founders/1.0"]
        for key, value in request_headers.items():
            cmd.extend(["-H", f"{key}: {value}"])
        cmd.append(url)
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        return result.stdout


def linkedin_username(url: str | None) -> str | None:
    if not url:
        return None
    match = re.search(r"linkedin\.com/in/([^/?#]+)", url)
    if not match:
        return None
    return urllib.parse.unquote(match.group(1)).rstrip("/")


def normalize_linkedin_url(url: str | None) -> str | None:
    username = linkedin_username(url)
    if not username:
        return None
    return f"https://www.linkedin.com/in/{username}/"


def split_name(full_name: str) -> tuple[str, str]:
    parts = [part for part in full_name.strip().split() if part]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[-1]


def parse_yc_founders(page_html: str) -> list[dict]:
    match = DATA_PAGE_RE.search(page_html)
    if not match:
        return []
    payload = json.loads(html.unescape(match.group(1)))
    company = (payload.get("props") or {}).get("company") or {}
    founders = company.get("founders") or []
    rows = []
    for founder in founders:
        full_name = (founder.get("full_name") or "").strip()
        if not full_name:
            continue
        rows.append(
            {
                "full_name": full_name,
                "title": founder.get("title") or "",
                "founder_bio": founder.get("founder_bio") or "",
                "linkedin_url": normalize_linkedin_url(founder.get("linkedin_url")),
                "twitter_url": founder.get("twitter_url") or "",
                "yc_user_id": founder.get("user_id"),
                "is_active_founder": founder.get("is_active"),
            }
        )
    return rows


def founder_key(company_slug: str, full_name: str) -> str:
    return f"{company_slug}::{full_name.strip().lower()}"


def load_existing() -> dict[str, dict]:
    if not FOUNDERS_PATH.exists():
        return {}
    payload = json.loads(FOUNDERS_PATH.read_text(encoding="utf-8"))
    return {
        founder_key(row["yc_company_slug"], row["full_name"]): row
        for row in payload.get("founders", [])
        if row.get("yc_company_slug") and row.get("full_name")
    }


def write_founders(rows: list[dict], companies_synced_at: str) -> None:
    rows = sorted(
        rows,
        key=lambda row: (
            row.get("yc_batch") or "",
            row.get("yc_company") or "",
            row.get("full_name") or "",
        ),
    )
    payload = {
        "source": {
            "companies": "data/companies.json",
            "yc_pages": "https://www.ycombinator.com/companies/{slug}",
            "linkdapi": "https://linkdapi.com/",
        },
        "definition": "Founders of YC Inactive companies, Winter 2020–Winter 2026",
        "companies_synced_at": companies_synced_at,
        "enriched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(rows),
        "founders": rows,
    }
    FOUNDERS_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def linkdapi_get(path: str, params: dict[str, str], api_key: str) -> dict | None:
    query = urllib.parse.urlencode({k: v for k, v in params.items() if v})
    url = f"https://linkdapi.com{path}?{query}"
    try:
        raw = http_get(url, headers={"X-linkdapi-apikey": api_key})
    except (subprocess.CalledProcessError, urllib.error.URLError, OSError) as exc:
        print(f"  LinkdAPI error: {exc}", file=sys.stderr)
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        print("  LinkdAPI returned non-JSON", file=sys.stderr)
        return None


def enrich_with_linkdapi(row: dict, company_name: str, api_key: str) -> dict:
    username = linkedin_username(row.get("linkedin_url"))
    if username:
        overview = linkdapi_get(
            "/api/v1/profile/overview",
            {"username": username},
            api_key,
        )
        data = (overview or {}).get("data") or overview or {}
        headline = data.get("headline") or data.get("occupation") or ""
        if headline:
            row["current_headline"] = headline
            row["match_status"] = "yc_page+linkdapi"
            row["last_verified"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            return row

    first, last = split_name(row["full_name"])
    search = linkdapi_get(
        "/api/v1/search/people",
        {
            "firstName": first,
            "lastName": last,
            "keyword": company_name,
            "count": "5",
        },
        api_key,
    )
    people = ((search or {}).get("data") or {}).get("people") or (search or {}).get("people") or []
    if not people and isinstance((search or {}).get("data"), list):
        people = (search or {}).get("data") or []

    best = None
    for person in people:
        name = (person.get("fullName") or person.get("name") or "").strip().lower()
        if name == row["full_name"].strip().lower():
            best = person
            break
    if best is None and people:
        best = people[0]

    if not best:
        row["match_status"] = "unmatched"
        row["last_verified"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return row

    profile_url = (
        best.get("linkedinUrl")
        or best.get("url")
        or best.get("profileUrl")
        or (
            f"https://www.linkedin.com/in/{best['username']}/"
            if best.get("username")
            else None
        )
    )
    row["linkedin_url"] = normalize_linkedin_url(profile_url) or row.get("linkedin_url")
    row["current_headline"] = best.get("headline") or row.get("current_headline") or ""
    row["match_status"] = "linkdapi"
    row["last_verified"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    username = linkedin_username(row.get("linkedin_url"))
    if username and not row.get("current_headline"):
        overview = linkdapi_get(
            "/api/v1/profile/overview",
            {"username": username},
            api_key,
        )
        data = (overview or {}).get("data") or overview or {}
        headline = data.get("headline") or data.get("occupation") or ""
        if headline:
            row["current_headline"] = headline
    return row


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=0, help="Max companies to process (0 = all)")
    parser.add_argument("--sleep", type=float, default=0.25, help="Delay between YC page fetches")
    parser.add_argument(
        "--skip-linkdapi",
        action="store_true",
        help="Only scrape YC pages; do not call LinkdAPI",
    )
    parser.add_argument(
        "--with-headlines",
        action="store_true",
        help="Also call LinkdAPI profile overview when a LinkedIn URL already exists",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-fetch even when a founder row already exists",
    )
    args = parser.parse_args()

    load_dotenv(ENV_PATH)
    api_key = os.environ.get("LINKDAPI_API_KEY", "").strip()
    use_linkdapi = bool(api_key) and not args.skip_linkdapi
    if not use_linkdapi:
        print("LinkdAPI disabled (missing LINKDAPI_API_KEY or --skip-linkdapi)")
    elif not args.with_headlines:
        print("LinkdAPI enabled for missing LinkedIn URLs only (pass --with-headlines for overviews)")

    companies_payload = json.loads(COMPANIES_PATH.read_text(encoding="utf-8"))
    companies = companies_payload["companies"]
    if args.limit:
        companies = companies[: args.limit]

    existing = {} if args.force else load_existing()
    by_key = dict(existing)
    processed_companies = 0

    for index, company in enumerate(companies, start=1):
        slug = company["slug"]
        name = company["name"]
        print(f"[{index}/{len(companies)}] {name} ({slug})")
        url = company.get("url") or f"https://www.ycombinator.com/companies/{slug}"
        try:
            page_html = http_get(url)
            yc_founders = parse_yc_founders(page_html)
        except Exception as exc:
            print(f"  failed to fetch/parse YC page: {exc}", file=sys.stderr)
            yc_founders = []
            time.sleep(args.sleep)
            continue

        if not yc_founders:
            print("  no founders listed on YC page")
        for founder in yc_founders:
            key = founder_key(slug, founder["full_name"])
            if key in by_key and not args.force:
                row = by_key[key]
                needs_link = not row.get("linkedin_url")
                needs_headline = args.with_headlines and not row.get("current_headline")
                if use_linkdapi and (needs_link or needs_headline):
                    print(f"  enriching cached {founder['full_name']}")
                    row = enrich_with_linkdapi(row, name, api_key)
                    by_key[key] = row
                    time.sleep(0.2)
                continue

            row = {
                "full_name": founder["full_name"],
                "yc_company": name,
                "yc_company_slug": slug,
                "yc_batch": company.get("batch"),
                "yc_title": founder.get("title") or "",
                "yc_founder_bio": founder.get("founder_bio") or "",
                "linkedin_url": founder.get("linkedin_url"),
                "twitter_url": founder.get("twitter_url") or "",
                "current_headline": founder.get("founder_bio") or "",
                "match_status": "yc_page" if founder.get("linkedin_url") else "yc_page_no_linkedin",
                "last_verified": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "yc_url": url,
            }
            needs_link = not row["linkedin_url"]
            needs_headline = args.with_headlines and bool(row["linkedin_url"])
            if use_linkdapi and (needs_link or needs_headline):
                print(f"  LinkdAPI for {founder['full_name']}")
                row = enrich_with_linkdapi(row, name, api_key)
                time.sleep(0.2)
            by_key[key] = row
            print(
                f"  + {row['full_name']} | {row.get('match_status')} | {row.get('linkedin_url') or 'no linkedin'}"
            )

        processed_companies += 1
        if processed_companies % 25 == 0:
            write_founders(list(by_key.values()), companies_payload.get("synced_at", ""))
            print(f"  checkpoint: {len(by_key)} founders written")
        time.sleep(args.sleep)

    write_founders(list(by_key.values()), companies_payload.get("synced_at", ""))
    print(f"Done. {len(by_key)} founders -> {FOUNDERS_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
