"""Generate the two GitHub summary cards used in the profile README.

The cards are committed as static SVG files instead of being fetched from a
third-party service at page-view time. That keeps the profile loading even
when community stats services are down or rate limited, and it means every
number can be traced back to this script and the GitHub API.

Usage (PowerShell):

    $env:GITHUB_TOKEN = "<token>"
    python scripts/profile_stats.py

The token only needs public read access. Generate light and dark variants and
write them to ``assets/``.
"""

from __future__ import annotations

import collections
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

USER = "ajaybe-ops"
API = "https://api.github.com"
ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
GENERATED = dt.date.today().isoformat()

LANG_COLORS = {
    "Jupyter Notebook": "#DA5B0B",
    "Python": "#3572A5",
    "TypeScript": "#3178C6",
    "HTML": "#E34C26",
    "CSS": "#563D7C",
    "JavaScript": "#F1E05A",
    "Dockerfile": "#384D54",
    "Shell": "#89E051",
    "PowerShell": "#012456",
    "Batchfile": "#C1F12E",
}

THEMES = {
    "light": {
        "bg": "#ffffff",
        "border": "#d0d7de",
        "text": "#1f2328",
        "muted": "#656d76",
        "track": "#eaeef2",
        "divider": "#d8dee4",
    },
    "dark": {
        "bg": "#0d1117",
        "border": "#30363d",
        "text": "#e6edf3",
        "muted": "#8d96a0",
        "track": "#21262d",
        "divider": "#30363d",
    },
}


def request(url: str, token: str, *, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "ajaybe-ops-profile-stats",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def collect(token: str) -> dict:
    user = request(f"{API}/users/{USER}", token)
    repos = []
    page = 1
    while True:
        batch = request(
            f"{API}/users/{USER}/repos?per_page=100&page={page}&type=owner",
            token,
        )
        repos.extend(batch)
        if len(batch) < 100:
            break
        page += 1

    owned = [repo for repo in repos if not repo["fork"]]
    stars = sum(repo["stargazers_count"] for repo in owned)

    today = dt.date.today()
    start = today - dt.timedelta(days=365)
    query = f"""query {{
      user(login: "{USER}") {{
        contributionsCollection(from: "{start}T00:00:00Z", to: "{today}T00:00:00Z") {{
          contributionCalendar {{ totalContributions }}
        }}
      }}
    }}"""
    graph = request(f"{API}/graphql", token, payload={"query": query})
    contributions = graph["data"]["user"]["contributionsCollection"][
        "contributionCalendar"
    ]["totalContributions"]

    languages: collections.Counter[str] = collections.Counter()
    for repo in owned:
        try:
            data = request(f"{API}/repos/{USER}/{repo['name']}/languages", token)
        except urllib.error.HTTPError as exc:  # pragma: no cover - network edge
            print(f"skip {repo['name']}: {exc}", file=sys.stderr)
            continue
        languages.update(data)

    return {
        "repos": user["public_repos"],
        "stars": stars,
        "followers": user["followers"],
        "contributions": contributions,
        "languages": languages,
    }


def esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def stats_svg(stats: dict, theme: dict) -> str:
    cells = [
        (stats["repos"], "PUBLIC REPOS"),
        (stats["stars"], "STARS EARNED"),
        (stats["followers"], "FOLLOWERS"),
        (stats["contributions"], "CONTRIBUTIONS"),
    ]
    width, height = 410, 160
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" '
        f'height="{height}" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="GitHub statistics">',
        "<style>"
        "text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}"
        "</style>",
        f'<rect x="0.5" y="0.5" width="{width - 1}" height="{height - 1}" '
        f'rx="10" fill="{theme["bg"]}" stroke="{theme["border"]}"/>',
        f'<text x="20" y="27" font-size="10" letter-spacing="1.6" '
        f'font-weight="600" fill="{theme["muted"]}">GITHUB · PUBLIC ACTIVITY</text>',
        f'<text x="{width - 20}" y="27" font-size="9" text-anchor="end" '
        f'fill="{theme["muted"]}">12 MO · {GENERATED}</text>',
        f'<line x1="20" y1="40" x2="{width - 20}" y2="40" '
        f'stroke="{theme["divider"]}"/>',
    ]
    cell_width = (width - 40) / len(cells)
    for index, (value, label) in enumerate(cells):
        cx = 20 + cell_width * index + cell_width / 2
        parts.append(
            f'<text x="{cx:.1f}" y="84" font-size="28" font-weight="700" '
            f'text-anchor="middle" fill="{theme["text"]}">{value}</text>'
        )
        parts.append(
            f'<text x="{cx:.1f}" y="104" font-size="9" letter-spacing="1.1" '
            f'text-anchor="middle" fill="{theme["muted"]}">{label}</text>'
        )
    parts.append(
        f'<text x="{width / 2}" y="138" font-size="9" text-anchor="middle" '
        f'fill="{theme["muted"]}">Generated from the GitHub API · not a quality signal</text>'
    )
    parts.append("</svg>")
    return "\n".join(parts)


def languages_svg(languages: collections.Counter[str], theme: dict) -> str:
    total = sum(languages.values()) or 1
    ranked = languages.most_common()
    top = ranked[:4]
    rest = sum(value for _, value in ranked[4:])
    rows = [(name, value / total * 100) for name, value in top]
    if rest:
        rows.append(("Other", rest / total * 100))

    width, height = 410, 160
    bar_x, bar_width = 126, 224
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" '
        f'height="{height}" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="Top languages by bytes">',
        "<style>"
        "text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif}"
        "</style>",
        f'<rect x="0.5" y="0.5" width="{width - 1}" height="{height - 1}" '
        f'rx="10" fill="{theme["bg"]}" stroke="{theme["border"]}"/>',
        f'<text x="20" y="27" font-size="10" letter-spacing="1.6" '
        f'font-weight="600" fill="{theme["muted"]}">TOP LANGUAGES</text>',
        f'<text x="{width - 20}" y="27" font-size="9" text-anchor="end" '
        f'fill="{theme["muted"]}">BY BYTES · PUBLIC REPOS</text>',
        f'<line x1="20" y1="40" x2="{width - 20}" y2="40" '
        f'stroke="{theme["divider"]}"/>',
    ]
    y = 56
    for name, pct in rows:
        color = LANG_COLORS.get(name, theme["muted"])
        filled = max(bar_width * pct / 100, 0.6)
        parts.append(
            f'<text x="20" y="{y + 4}" font-size="11" fill="{theme["text"]}">'
            f"{esc(name)}</text>"
        )
        parts.append(
            f'<rect x="{bar_x}" y="{y - 3}" width="{bar_width}" height="7" '
            f'rx="3.5" fill="{theme["track"]}"/>'
        )
        parts.append(
            f'<rect x="{bar_x}" y="{y - 3}" width="{filled:.1f}" height="7" '
            f'rx="3.5" fill="{color}"/>'
        )
        parts.append(
            f'<text x="{width - 20}" y="{y + 4}" font-size="10" '
            f'text-anchor="end" fill="{theme["muted"]}">{pct:.1f}%</text>'
        )
        y += 19
    parts.append("</svg>")
    return "\n".join(parts)


def main() -> int:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        print("Set GITHUB_TOKEN or GH_TOKEN first.", file=sys.stderr)
        return 2

    stats = collect(token)
    ASSETS.mkdir(exist_ok=True)
    for suffix, theme in THEMES.items():
        name = "" if suffix == "light" else f"-{suffix}"
        (ASSETS / f"github-stats{name}.svg").write_text(
            stats_svg(stats, theme), encoding="utf-8"
        )
        (ASSETS / f"top-languages{name}.svg").write_text(
            languages_svg(stats["languages"], theme), encoding="utf-8"
        )

    print(
        f"repos={stats['repos']} stars={stats['stars']} "
        f"followers={stats['followers']} contributions={stats['contributions']}"
    )
    for name, value in stats["languages"].most_common(6):
        print(f"  {name}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
