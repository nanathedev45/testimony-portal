import os
from PIL import Image, ImageDraw, ImageFont

# ---- Design tokens (match renderTestimonyImage.js as closely as possible) ----
WIDTH = 1080
HEIGHT = 1080
PADDING = 100

COLORS = {
    "bg": (57, 34, 130),              # #392282
    "accent": (236, 231, 0),          # #ece700
    "text": (245, 243, 255),          # #f5f3ff
    "text_muted": (160, 152, 190),    # muted purple-ish white
}

# Faded alpha for the not-yet-played bars (0-255)
FADED_ALPHA = 70

# ---- Font paths (macOS dev setup — swap to bundled fonts before deploy) ----
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_MONO = "/System/Library/Fonts/Supplemental/Arial.ttf"

# ---- Layout constants ----
HEADER_TEXT = "WIND OF FAITH 2026 ANONYMOUS TESTIMONY"
HEADER_FONT_SIZE = 28
HEADER_Y = PADDING

DIVIDER_Y = PADDING + 60

PLAY_RADIUS = 60
PLAY_CENTER_X = PADDING + PLAY_RADIUS
PLAY_CENTER_Y = 600

GAP_AFTER_PLAY = 40
WAVEFORM_HEIGHT = 120
BAR_COUNT = 48
BAR_GAP = 6

TIMER_FONT_SIZE = 28
DATE_FONT_SIZE = 24

FPS = 10  # frames per second


def _format_time(seconds: float) -> str:
    s = max(0, int(seconds))
    m = s // 60
    r = s % 60
    return f"{m}:{r:02d}"


def _load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def _draw_static_background(img: Image.Image) -> None:
    """Draws the parts that stay the same across all frames."""
    draw = ImageDraw.Draw(img)

    # Top yellow bar
    draw.rectangle([(0, 0), (WIDTH, 16)], fill=COLORS["accent"])

    # Header text
    header_font = _load_font(FONT_BOLD, HEADER_FONT_SIZE)
    draw.text((PADDING, HEADER_Y), HEADER_TEXT, font=header_font, fill=COLORS["accent"])

    # Divider
    draw.line(
        [(PADDING, DIVIDER_Y), (WIDTH - PADDING, DIVIDER_Y)],
        fill=(90, 70, 150),
        width=1,
    )


def _draw_play_button(draw: ImageDraw.ImageDraw) -> None:
    """Draws the yellow play button with a triangle inside."""
    cx, cy = PLAY_CENTER_X, PLAY_CENTER_Y
    r = PLAY_RADIUS

    # Circle
    draw.ellipse([(cx - r, cy - r), (cx + r, cy + r)], fill=COLORS["accent"])

    # Triangle (in bg color)
    tri_size = r * 0.7
    off_x = r * 0.15
    points = [
        (cx - tri_size * 0.5 + off_x, cy - tri_size * 0.7),
        (cx - tri_size * 0.5 + off_x, cy + tri_size * 0.7),
        (cx + tri_size * 0.7 + off_x, cy),
    ]
    draw.polygon(points, fill=COLORS["bg"])


def _draw_waveform(
        img: Image.Image,
        waveform: list[float],
        progress: float,
) -> None:
    """
    Draws the waveform with progressive fill.
    Bars up to `progress` (0..1) are bright; bars after are faded.
    Bars are drawn as rounded pills.
    """
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)

    waveform_start_x = PLAY_CENTER_X + PLAY_RADIUS + GAP_AFTER_PLAY
    waveform_width = WIDTH - PADDING - waveform_start_x
    total_bar_space = waveform_width / BAR_COUNT
    actual_bar_width = total_bar_space - BAR_GAP

    # Pill radius: half the bar width gives fully rounded ends
    radius = actual_bar_width / 2

    # Small minimum height so silent chunks still render visibly
    min_height_factor = 0.05

    playhead_index = int(progress * BAR_COUNT)

    for i in range(BAR_COUNT):
        idx = min(len(waveform) - 1, int((i / BAR_COUNT) * len(waveform)))
        height_factor = max(min_height_factor, waveform[idx] if waveform else 0.0)

        bar_height = WAVEFORM_HEIGHT * height_factor
        x0 = waveform_start_x + i * total_bar_space
        y0 = PLAY_CENTER_Y - bar_height / 2
        x1 = x0 + actual_bar_width
        y1 = y0 + bar_height

        if i < playhead_index:
            # Bright yellow
            overlay_draw.rounded_rectangle(
                [(x0, y0), (x1, y1)],
                radius=radius,
                fill=COLORS["accent"] + (255,),
            )
        else:
            # Faded yellow
            overlay_draw.rounded_rectangle(
                [(x0, y0), (x1, y1)],
                radius=radius,
                fill=COLORS["accent"] + (FADED_ALPHA,),
            )

    img.paste(overlay, (0, 0), overlay)


def _draw_timer(img: Image.Image, current_seconds: float, total_seconds: float) -> None:
    """Draws '0:03 / 0:07' below the waveform."""
    draw = ImageDraw.Draw(img)

    waveform_start_x = PLAY_CENTER_X + PLAY_RADIUS + GAP_AFTER_PLAY
    timer_y = PLAY_CENTER_Y + PLAY_RADIUS + 24

    text = f"{_format_time(current_seconds)} / {_format_time(total_seconds)}"
    font = _load_font(FONT_MONO, TIMER_FONT_SIZE)

    draw.text((waveform_start_x, timer_y), text, font=font, fill=COLORS["text_muted"])


def _draw_date(img: Image.Image, date_str: str) -> None:
    draw = ImageDraw.Draw(img)
    font = _load_font(FONT_REGULAR, DATE_FONT_SIZE)
    draw.text((PADDING, HEIGHT - PADDING - DATE_FONT_SIZE), date_str, font=font, fill=COLORS["text_muted"])


def _format_date(created_at: str) -> str:
    """Convert an ISO date string to a display-friendly form."""
    try:
        from datetime import datetime
        cleaned = created_at.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        return dt.strftime("%b %d, %Y, %I:%M %p").replace(" 0", " ")
    except Exception:
        return created_at


def generate_frames(
        waveform: list[float],
        duration_seconds: float,
        created_at: str,
        output_dir: str,
        fps: int = FPS,
) -> tuple[int, float]:
    """
    Generates PNG frames into output_dir.
    Returns (frame_count, frame_duration).

    Each frame is 1080x1080. Frames are named frame_0001.png, frame_0002.png, ...
    """
    os.makedirs(output_dir, exist_ok=True)

    frame_duration = 1.0 / fps
    total_frames = max(1, int(round(duration_seconds * fps)))

    date_display = _format_date(created_at)

    for i in range(total_frames):
        current_time = i * frame_duration
        progress = current_time / duration_seconds if duration_seconds > 0 else 1.0

        img = Image.new("RGB", (WIDTH, HEIGHT), COLORS["bg"])

        _draw_static_background(img)
        _draw_play_button(ImageDraw.Draw(img))
        _draw_waveform(img, waveform, progress)
        _draw_timer(img, current_time, duration_seconds)
        _draw_date(img, date_display)

        filename = f"frame_{i + 1:04d}.png"
        img.save(os.path.join(output_dir, filename), "PNG")

    return total_frames, frame_duration