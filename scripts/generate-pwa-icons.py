"""Generate PWA icons: orange #EF9F27 background, white Cjenko smiley."""
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    raise SystemExit("Install Pillow: py -m pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent / "public"
BG = "#EF9F27"
WHITE = "#FFFFFF"


def draw_face(draw: ImageDraw.ImageDraw, size: int) -> None:
    s = size / 68.0
    # eyes
    for cx in (22, 46):
        draw.ellipse(
            (
                (cx - 5.5) * s,
                (26 - 6) * s,
                (cx + 5.5) * s,
                (26 + 6) * s,
            ),
            fill=WHITE,
        )
    # smile arc (thick stroke via polygon approximation)
    mouth_w = int(3.5 * s) or 2
    draw.arc(
        (
            19 * s,
            30 * s,
            49 * s,
            52 * s,
        ),
        start=200,
        end=340,
        fill=WHITE,
        width=mouth_w,
    )


def make_icon(size: int, path: Path) -> None:
    img = Image.new("RGB", (size, size), BG)
    draw = ImageDraw.Draw(img)
    draw_face(draw, size)
    img.save(path, format="PNG", optimize=True)
    print(f"Wrote {path}")


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    make_icon(192, ROOT / "icon-192.png")
    make_icon(512, ROOT / "icon-512.png")
    make_icon(180, ROOT / "apple-touch-icon.png")


if __name__ == "__main__":
    main()
