"""Google Play icon: Cjenko smiley + -50% tag (matches CjenkoFace.jsx)."""
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    raise SystemExit("Install Pillow: py -m pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
OUT_PATHS = (
    ROOT / "android-twa" / "google-play-icon-512.png",
    ROOT / "public" / "icon-512.png",
)
SIZE = 512
BG = "#EF9F27"
WHITE = "#FFFFFF"
SCALE = SIZE / 68.0


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in (
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _bezier_points(p0, p1, p2, steps: int = 80) -> list[tuple[float, float]]:
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]
        y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]
        pts.append((x, y))
    return pts


def draw_cjenko_face(draw: ImageDraw.ImageDraw, s: float) -> None:
    for cx in (22, 46):
        draw.ellipse(
            ((cx - 5.5) * s, (26 - 6) * s, (cx + 5.5) * s, (26 + 6) * s),
            fill=WHITE,
        )

    smile = _bezier_points((19, 36), (34, 52), (49, 36))
    smile = [(x * s, y * s) for x, y in smile]
    mouth_w = max(int(3.5 * s), 2)
    draw.line(smile, fill=WHITE, width=mouth_w, joint="curve")

    font_size = max(int(9 * s), 12)
    font = _font(font_size)
    draw.text((34 * s, 58.5 * s), "-50%", fill=WHITE, font=font, anchor="mm")


def main() -> None:
    img = Image.new("RGB", (SIZE, SIZE), BG)
    draw = ImageDraw.Draw(img)
    draw_cjenko_face(draw, SCALE)
    for path in OUT_PATHS:
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path, format="PNG", optimize=True)
        print(f"Wrote {path} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    main()
