"""Google Play feature graphic 1024x500 — Cjenko banner."""
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    raise SystemExit("Install Pillow: py -m pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "android-twa" / "feature-graphic-1024x500.png"
W, H = 1024, 500
BG = "#EF9F27"
WHITE = "#FFFFFF"


def _font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    names = (
        ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"]
        if bold
        else ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"]
    )
    names.append("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
    for name in names:
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


def draw_smiley(draw: ImageDraw.ImageDraw, ox: float, oy: float, size: float) -> None:
    """Draw white Cjenko face (68 viewBox) at offset (ox, oy) scaled to `size` px."""
    s = size / 68.0

    def pt(x: float, y: float) -> tuple[float, float]:
        return (ox + x * s, oy + y * s)

    for cx in (22, 46):
        x0, y0, x1, y1 = (cx - 5.5, 26 - 6, cx + 5.5, 26 + 6)
        draw.ellipse((*pt(x0, y0), *pt(x1, y1)), fill=WHITE)

    smile = _bezier_points((19, 36), (34, 52), (49, 36))
    smile = [pt(x, y) for x, y in smile]
    mouth_w = max(int(3.5 * s), 2)
    draw.line(smile, fill=WHITE, width=mouth_w, joint="curve")


def main() -> None:
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    pad_x = 72
    title_font = _font(88)
    subtitle_font = _font(30, bold=False)

    title = "Cjenko"
    subtitle = "Pronađi najbolje akcije u supermarketima"

    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    title_h = title_bbox[3] - title_bbox[1]
    sub_bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    sub_h = sub_bbox[3] - sub_bbox[1]
    gap = 18
    block_h = title_h + gap + sub_h
    text_top = (H - block_h) / 2

    draw.text((pad_x, text_top), title, fill=WHITE, font=title_font)
    draw.text(
        (pad_x, text_top + title_h + gap),
        subtitle,
        fill=WHITE,
        font=subtitle_font,
    )

    face_size = 340
    face_x = W - pad_x - face_size
    face_y = (H - face_size) / 2
    draw_smiley(draw, face_x, face_y, face_size)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, format="PNG", optimize=True)
    print(f"Wrote {OUT} ({W}x{H})")


if __name__ == "__main__":
    main()
