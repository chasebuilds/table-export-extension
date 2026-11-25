"""Headless smoke test for the demo page: CSV and XLSX downloads and Copy as TSV.

Usage: python demo/smoke_test.py [--url URL] [--screenshot PATH]  (run `node demo/build.mjs` first)
"""

from __future__ import annotations

import argparse
import functools
import http.server
import io
import sys
import threading
from pathlib import Path

from openpyxl import load_workbook
from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parent.parent / "_site"


def serve(folder: Path) -> str:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(folder))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{httpd.server_port}/"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url")
    ap.add_argument("--screenshot")
    args = ap.parse_args()
    problems: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 900}, accept_downloads=True,
            permissions=["clipboard-read", "clipboard-write"],
        )
        page = ctx.new_page()
        page.on("pageerror", lambda e: problems.append(f"page error: {e}"))
        page.goto(args.url or serve(SITE))
        page.wait_for_selector("body[data-ready='1']", state="attached", timeout=30_000)
        found = page.inner_text("#found")
        print(found)
        if not found.startswith("3 data tables"):
            problems.append(f"expected 3 data tables: {found}")

        with page.expect_download() as d:
            page.click("#csv")
        csv = Path(d.value.path()).read_bytes().decode("utf-8-sig")
        print(f"{d.value.suggested_filename}:\n{csv}")
        for needle in ["Region,2025 / Q1,2025 / Q2,Growth", "North,1200.5,1350", "-45.25", "'=HYPERLINK"]:
            if needle not in csv:
                problems.append(f"CSV missing {needle!r}")

        page.click("#tables .tab >> nth=1")
        with page.expect_download() as d:
            page.click("#xlsx")
        ws = load_workbook(io.BytesIO(Path(d.value.path()).read_bytes())).active
        rows = [[c.value for c in r] for r in ws.iter_rows()]
        print(f"{d.value.suggested_filename}: {rows}")
        if rows[1][:3] != ["007", "Hinge, brass", 1234.56]:
            problems.append(f"XLSX row 2 wrong: {rows[1]}")

        page.click("#tsv")
        tsv = page.evaluate("navigator.clipboard.readText()")
        print(f"TSV:\n{tsv}")
        if "0123\tBracket, \"heavy duty\"\t12,90\t220" not in tsv:  # one comma: ambiguous, kept as text
            problems.append("TSV on clipboard is wrong")
        if args.screenshot:
            page.click("#tables .tab >> nth=0")
            page.locator("main").screenshot(path=args.screenshot)
        browser.close()
    for msg in problems:
        print(f"FAIL: {msg}")
    print("PASS" if not problems else "FAILED")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
