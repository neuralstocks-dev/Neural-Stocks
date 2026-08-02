"""Generate OG share cards (1200×630 JPEG) for KidStocks marketing pages.

Run once via `python3 /app/scripts/generate_og_cards.py`. Writes:
  • /app/frontend/public/og-kids-landing.jpg
  • /app/frontend/public/og-kids-parents.jpg

JPEG (not PNG) so the cards render reliably in WhatsApp's link-preview crawler.

Pure Pillow — no headless browser. The cards mirror the in-app design:
coral/cream/navy palette, KS logo mark on the left, hero copy on the
right, with NeuLab attribution.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Brand palette
CORAL = (255, 118, 118)
NAVY = (26, 26, 46)
SAND = (255, 248, 240)
CREAM = (255, 248, 240)
GOLD = (255, 181, 112)
SAND_BORDER = (229, 213, 184)
TEXT_MUTED = (90, 90, 110)

W, H = 1200, 630

FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"


def _font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def _draw_logo_badge(img: Image.Image, x: int, y: int, size: int = 120) -> None:
    """Render the KS monogram badge — coral rounded square + gold spark + KS."""
    radius = int(size * 0.22)
    badge = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(badge)
    bd.rounded_rectangle((0, 0, size, size), radius=radius, fill=CORAL)
    # gold spark
    spark = int(size * 0.06)
    bd.ellipse((size - 2 * spark - 8, 8, size - 8, 2 * spark + 8), fill=GOLD)
    # KS text
    ks_font = _font(FONT_BOLD, int(size * 0.55))
    bbox = bd.textbbox((0, 0), "KS", font=ks_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    bd.text(
        ((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1] - 4),
        "KS",
        font=ks_font,
        fill=CREAM,
    )
    img.paste(badge, (x, y), badge)


def _wrap(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""
    for w in words:
        candidate = (cur + " " + w).strip()
        if font.getlength(candidate) <= max_width:
            cur = candidate
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def render_card(*, eyebrow: str, headline: str, sub: str, footer: str, out_path: Path) -> None:
    img = Image.new("RGB", (W, H), SAND)
    draw = ImageDraw.Draw(img)

    # Top-left logo + brand wordmark
    _draw_logo_badge(img, 70, 70, size=110)
    brand_font = _font(FONT_BOLD, 38)
    draw.text((200, 95), "KidStocks", font=brand_font, fill=NAVY)
    by_font = _font(FONT_REG, 17)
    draw.text((200, 142), "by NeuLab · ages 8-18", font=by_font, fill=TEXT_MUTED)

    # Eyebrow
    eyebrow_font = _font(FONT_BOLD, 18)
    draw.text((70, 245), eyebrow.upper(), font=eyebrow_font, fill=CORAL)

    # Headline (wrap)
    head_font = _font(FONT_BOLD, 64)
    head_lines = _wrap(headline, head_font, W - 140)
    y = 285
    for line in head_lines:
        draw.text((70, y), line, font=head_font, fill=NAVY)
        y += 78

    # Subtitle
    sub_font = _font(FONT_REG, 26)
    sub_lines = _wrap(sub, sub_font, W - 140)
    y += 12
    for line in sub_lines:
        draw.text((70, y), line, font=sub_font, fill=TEXT_MUTED)
        y += 36

    # Footer accent bar
    draw.rectangle((0, H - 8, W, H), fill=CORAL)
    foot_font = _font(FONT_REG, 17)
    draw.text((70, H - 50), footer, font=foot_font, fill=TEXT_MUTED)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "JPEG", quality=90, optimize=True)
    print(f"wrote {out_path} ({out_path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    public_dir = Path("/app/frontend/public")
    render_card(
        eyebrow="AI-powered learning · ages 8-18",
        headline="Show your kid how the AI thinks.",
        sub="Same engine our adult investors use, rewritten in language a 9-year-old can understand. Virtual money only.",
        footer="kidstocks.net · educational only · not financial advice",
        out_path=public_dir / "og-kids-landing.jpg",
    )
    render_card(
        eyebrow="For parents",
        headline="The investing app that teaches kids to think.",
        sub="See how KidStocks compares to Greenlight, Fidelity Youth, Bibit Junior, and 4 other platforms.",
        footer="kidstocks.net · educational only · not financial advice",
        out_path=public_dir / "og-kids-parents.jpg",
    )
