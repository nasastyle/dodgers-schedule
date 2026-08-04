#!/usr/bin/env python3
"""J SPORTS公式番組表からドジャース戦の放送チャンネル(1〜4)と時刻を取得し、
data/jsports.json に保存するスクリプト。GitHub Actionsから定期実行される。

仕組み:
- チャンネル別番組一覧(one〜four)からドジャース戦の番組詳細URLを収集
- 各詳細ページの「放送予定」表(ch1〜ch4列)から放送日時とチャンネルを抽出
- 番組タイトルの (MM/DD) は米国現地日付で、MLB StatsAPIのofficialDateと対応する
"""

import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = "https://www.jsports.co.jp"
CHANNEL_PAGES = ["one", "two", "three", "four"]
UA = "Mozilla/5.0 (compatible; DodgersScheduleBot/1.0; personal study app)"
JST = timezone(timedelta(hours=9))
SEASON = 2026


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", errors="replace")


def collect_program_urls():
    """チャンネル別ページからドジャース戦の詳細ページURLを集める"""
    urls = {}
    for ch in CHANNEL_PAGES:
        try:
            html = fetch(f"{BASE}/program_guide/channel/japanese/{ch}/")
        except Exception as e:
            print(f"warn: channel page {ch} failed: {e}", file=sys.stderr)
            continue
        for m in re.finditer(r'<a href="(/program_guide/[^"]+)">\s*([^<]*)</a>', html):
            href, text = m.group(1), m.group(2)
            if "メジャーリーグ" in text and "ドジャース" in text:
                urls[href] = text.strip()
    return urls


def parse_time(label):
    """「深夜3:10」「午前7:00」「午後6:00」→ 0時起点の分数(深夜は+24h)"""
    m = re.search(r"(深夜|午前|午後)?\s*(\d{1,2}):(\d{2})", label)
    if not m:
        return None
    prefix, h, mi = m.group(1), int(m.group(2)), int(m.group(3))
    if prefix == "午後":
        h += 12
    elif prefix == "深夜":
        h += 24
    return h * 60 + mi


def parse_detail(html):
    """詳細ページから (試合の現地日付, 放送一覧) を返す"""
    tm = re.search(r"<title>([^<]*)</title>", html)
    title = tm.group(1).split("|")[0].strip() if tm else ""

    gm = re.search(r"\((\d{2})/(\d{2})\)", title)
    if not gm:
        return None
    game_date = f"{SEASON}-{gm.group(1)}-{gm.group(2)}"

    seg_m = re.search(r"放送予定.*?</table>", html, re.S)
    if not seg_m:
        return None
    seg = seg_m.group(0)

    airings = []
    row_re = re.compile(
        r'<th class="w-programGuide__th--row">(\d{1,2})月(\d{1,2})日[^<]*</th>(.*?)</tr>', re.S
    )
    for row in row_re.finditer(seg):
        month, day = int(row.group(1)), int(row.group(2))
        tds = re.findall(r"<td>(.*?)</td>", row.group(3), re.S)
        for idx, td in enumerate(tds):
            text = re.sub(r"<[^>]+>", "", td).strip()
            if not text:
                continue
            start_min = parse_time(text.split("～")[0])
            if start_min is None:
                continue
            # 深夜表記(+24h)は翌日の実時刻に正規化
            year = SEASON if month >= 2 else SEASON + 1
            base = datetime(year, month, day, tzinfo=JST)
            start = base + timedelta(minutes=start_min)
            airings.append({
                "channel": idx + 1,
                "start": start.strftime("%Y-%m-%dT%H:%M+09:00"),
                "raw": text,
            })

    if not airings:
        return None
    return {"title": title, "gameDate": game_date, "airings": airings}


def main():
    urls = collect_program_urls()
    print(f"found {len(urls)} program pages", file=sys.stderr)

    programs = []
    seen_dates = set()
    for href in sorted(urls):
        try:
            detail = parse_detail(fetch(BASE + href))
        except Exception as e:
            print(f"warn: detail {href} failed: {e}", file=sys.stderr)
            continue
        if not detail:
            continue
        detail["url"] = BASE + href
        # 同一試合の重複ページは放送情報をマージ
        if detail["gameDate"] in seen_dates:
            for p in programs:
                if p["gameDate"] == detail["gameDate"]:
                    known = {(a["channel"], a["start"]) for a in p["airings"]}
                    p["airings"] += [a for a in detail["airings"]
                                     if (a["channel"], a["start"]) not in known]
                    break
        else:
            seen_dates.add(detail["gameDate"])
            programs.append(detail)

    programs.sort(key=lambda p: p["gameDate"])
    out = {
        "updated": datetime.now(JST).strftime("%Y-%m-%dT%H:%M:%S+09:00"),
        "source": "jsports.co.jp 番組表",
        "programs": programs,
    }
    with open("data/jsports.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"wrote data/jsports.json ({len(programs)} games)", file=sys.stderr)


if __name__ == "__main__":
    main()
