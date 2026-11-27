"""Generate the Turbofan build guide from the hand-written chapters + the REAL project files.

Chapters live in src/content/build/turbofan/part*.md, split by `<!-- chapter: id | Title -->` lines.
`{{file:path}}` (or `{{file:path|lang}}`) is replaced by the complete file from the tf-telemetry repo,
so every line of code in the guide is the project's actual code.

    python3 scripts/gen_buildguide.py /path/to/tf-telemetry                 # -> src/content/buildguide.json
    python3 scripts/gen_buildguide.py /path/to/tf-telemetry --md out.md     # also one Markdown file
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
SRC = HERE / "src" / "content" / "build" / "turbofan"
LANG = {".py": "python", ".yml": "yaml", ".yaml": "yaml", ".sh": "bash", ".txt": "text", ".md": "markdown", ".json": "json"}


def lang_of(path):
    name = Path(path).name
    if name == "Dockerfile":
        return "dockerfile"
    if name.startswith("."):
        return "text"
    return LANG.get(Path(path).suffix, "text")


def expand(md, repo):
    def rep(m):
        path, _, lang = m.group(1).partition("|")
        f = repo / path.strip()
        if not f.exists():
            raise SystemExit(f"missing project file referenced in guide: {path}")
        body = f.read_text().rstrip("\n")
        fence = "````" if "```" in body else "```"
        return f"{fence}{(lang or lang_of(path)).strip()}\n{body}\n{fence}"
    return re.sub(r"\{\{file:([^}]+)\}\}", rep, md)


def main():
    repo = Path(sys.argv[1] if len(sys.argv) > 1 else "../../tf-telemetry").resolve()
    chapters = []
    for part in sorted(SRC.glob("part*.md")):
        text = part.read_text()
        for m in re.finditer(r"<!-- chapter: (\w+) \| (.+?) -->\n(.*?)(?=<!-- chapter:|\Z)", text, re.S):
            chapters.append({"id": m.group(1), "title": m.group(2).strip(), "md": expand(m.group(3).strip(), repo)})
    ids = [c["id"] for c in chapters]
    assert len(ids) == len(set(ids)), "duplicate chapter id"
    out = {"title": "Build Turbofan Telemetry, step by step", "repo": "github.com/YuvrajDevs/tf-telemetry", "chapters": chapters}
    (HERE / "src" / "content" / "buildguide.json").write_text(json.dumps(out, indent=1))
    if "--md" in sys.argv:
        dest = Path(sys.argv[sys.argv.index("--md") + 1])
        head = ("# Build Turbofan Telemetry from zero: a step-by-step guide\n\n"
                "Every file below is the project's real code. Chapters:\n\n"
                + "\n".join(f"- [{c['title']}](#{c['id']})" for c in chapters) + "\n")
        dest.write_text(head + "\n\n" + "\n\n---\n\n".join(f'<a id="{c["id"]}"></a>\n\n' + c["md"] for c in chapters) + "\n")
    print(f"{len(chapters)} chapters, {sum(len(c['md']) for c in chapters):,} characters")


if __name__ == "__main__":
    main()
