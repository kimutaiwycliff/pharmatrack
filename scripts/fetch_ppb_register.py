#!/usr/bin/env python3
"""Fetch the Pharmacy and Poisons Board (Kenya) public register of retained
human medicines into a CSV, for building PharmaTrack's shared drug catalogue.

Source: https://products.pharmacyboardkenya.org/ppb_admin/pages/public_view_retention_products.php
(public table; no robots.txt on that host at the time of writing).

Polite by design: identifies itself, fetches 100 rows per request with a pause
between requests, retries gently, and stops on repeated errors. Re-run monthly;
the register grows as products are renewed. Please credit "Source: Pharmacy
and Poisons Board, Kenya" wherever this data is shown.

Usage:  python3 scripts/fetch_ppb_register.py [--out DIR] [--delay SECONDS]
Stdlib only.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import html as htmllib
import http.cookiejar
import os
import re
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://products.pharmacyboardkenya.org/ppb_admin"
PAGE = f"{BASE}/pages/public_view_retention_products.php"
AJAX = f"{BASE}/xcrud/xcrud_ajax.php"
UA = "PharmaTrack-catalog-builder/1.0 (+https://pharmatrack.co.ke; contact: support@pharmatrack.co.ke)"
LIMIT = 100

COLUMNS = [
    "registration_no", "trade_name", "inn", "dosage_form", "country_of_origin",
    "local_foreign", "mah", "local_technical_rep", "registration_date", "expiry_date",
]


def field(page: str, name: str) -> str | None:
    m = re.search(r'name="%s" value="([^"]*)"' % re.escape(name), page)
    return m.group(1) if m else None


def cells(row_html: str) -> list[str]:
    tds = re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.S)
    return [re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", td))).strip() for td in tds]


def to_iso(text: str) -> str:
    """'2026 September 29' -> '2026-09-29' (blank if unparseable)."""
    for fmt in ("%Y %B %d", "%Y %b %d", "%d-%m-%Y", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(text.strip(), fmt).date().isoformat()
        except ValueError:
            pass
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "packages", "db", "data", "ppb"))
    ap.add_argument("--delay", type=float, default=3.0, help="seconds between requests (be kind)")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = [("User-Agent", UA)]

    first = opener.open(PAGE, timeout=60).read().decode("utf-8", "replace")
    instance, key = field(first, "instance"), field(first, "key")
    if not instance or not key:
        print("Couldn't find the register's table settings — the page layout may have changed.", file=sys.stderr)
        return 1
    starts = [int(s) for s in re.findall(r'data-start="(\d+)"', first)]
    approx_total = (max(starts) + 10) if starts else None

    rows: dict[str, list[str]] = {}
    start, failures = 0, 0
    while True:
        body = urllib.parse.urlencode({
            "xcrud[instance]": instance, "xcrud[key]": key, "xcrud[task]": "list",
            "xcrud[start]": start, "xcrud[limit]": LIMIT,
            "xcrud[order]": "asc", "xcrud[orderby]": "tbl_vw_all_items_prims_gbt.product_registration_no",
        }).encode()
        req = urllib.request.Request(AJAX, data=body, headers={"X-Requested-With": "XMLHttpRequest", "Referer": PAGE})
        try:
            out = opener.open(req, timeout=90).read().decode("utf-8", "replace")
        except Exception as err:  # network hiccup: back off, give up after 3
            failures += 1
            if failures >= 3:
                print(f"Stopping after repeated errors at row {start}: {err}", file=sys.stderr)
                break
            time.sleep(args.delay * 5 * failures)
            continue
        failures = 0
        key = field(out, "key") or key  # the table rotates its key on every request
        page_rows = re.findall(r'<tr class="xcrud-row[^"]*">(.*?)</tr>', out, re.S)
        if not page_rows:
            break
        for r in page_rows:
            c = cells(r)
            # c[0] is the row number; the 10 register columns follow.
            if len(c) < 11 or not c[1]:
                continue
            reg, trade, inn, form, country, lf, mah, rep, reg_date, exp_date = c[1:11]
            rows[reg] = [reg, trade, inn, form, country, lf, mah, rep, to_iso(reg_date), to_iso(exp_date)]
        print(f"  fetched {start + len(page_rows)}{f' of ~{approx_total}' if approx_total else ''}", file=sys.stderr)
        if len(page_rows) < LIMIT:
            break
        start += LIMIT
        time.sleep(args.delay)

    path = os.path.join(args.out, "retained-products.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        for reg in sorted(rows):
            w.writerow(rows[reg])

    today = dt.date.today().isoformat()
    with open(os.path.join(args.out, "SOURCE.md"), "w", encoding="utf-8") as f:
        f.write(
            "# PPB retained human medicines\n\n"
            f"- Source: Pharmacy and Poisons Board, Kenya — {PAGE}\n"
            f"- Fetched: {today} by scripts/fetch_ppb_register.py ({len(rows)} products)\n"
            "- Public register data; credit \"Source: Pharmacy and Poisons Board, Kenya\" where shown.\n"
            "- Columns: " + ", ".join(COLUMNS) + " (dates as YYYY-MM-DD).\n"
            "- Strength is not a separate field in the register; it is usually part of the trade name.\n"
        )
    print(f"Wrote {len(rows)} products to {os.path.normpath(path)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
