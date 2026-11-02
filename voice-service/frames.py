import math
import os
from PIL import Image, ImageDraw, ImageFont

# Design tokens — values must match renderTestimonyImage.js
WIDTH = 1080
HEIGHT = 1080
PADDING = 100

COLORS = {
    "bg": (57, 34, 130),
    "accent": (236, 231, 0),
    "text": (245, 243, 255),
    "text_muted": (160, 152, 190),
}

# Alpha applied to bars not yet reached by the playhead
FADED_ALPHA = 70

# Bundled fonts are required in production; the macOS paths below are for local dev.
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_MONO = "/System/Library/Fonts/Supplemental/Arial.ttf"

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

FPS = 10


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


def _synthesize_waveform(num_bars: int = BAR_COUNT) -> list[float]:
    """
    Generate a placeholder waveform when real data is unavailable.
    Uses a sine arc so the silhouette reads as a voice clip rather than random noise.
    """
    values = []
    for i in range(num_bars):
        peak = math.sin((i / (num_bars - 1)) * math.pi)
        variation = 0.6 + 0.4 * math.sin(i * 1.7)
        values.append(peak * variation)
    return values


def _draw_static_background(img: Image.Image) -> None:
    draw = ImageDraw.Draw(img)

    draw.rectangle([(0, 0), (WIDTH, 16)], fill=COLORS["accent"])

    header_font = _load_font(FONT_BOLD, HEADER_FONT_SIZE)
    draw.text((PADDING, HEADER_Y), HEADER_TEXT, font=header_font, fill=COLORS["accent"])

    draw.line(
        [(PADDING, DIVIDER_Y), (WIDTH - PADDING, DIVIDER_Y)],
        fill=(90, 70, 150),
        width=1,
    )


def _draw_play_button(draw: ImageDraw.ImageDraw) -> None:
    cx, cy = PLAY_CENTER_X, PLAY_CENTER_Y
    r = PLAY_RADIUS

    draw.ellipse([(cx - r, cy - r), (cx + r, cy + r)], fill=COLORS["accent"])

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
    Draw each bar with a rounded-rectangle mask.
    Bars behind the playhead render bright; ahead of it render faded.
    """
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)

    waveform_start_x = PLAY_CENTER_X + PLAY_RADIUS + GAP_AFTER_PLAY
    waveform_width = WIDTH - PADDING - waveform_start_x
    total_bar_space = waveform_width / BAR_COUNT
    actual_bar_width = total_bar_space - BAR_GAP

    radius = actual_bar_width / 2
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
            overlay_draw.rounded_rectangle(
                [(x0, y0), (x1, y1)],
                radius=radius,
                fill=COLORS["accent"] + (255,),
            )
        else:
            overlay_draw.rounded_rectangle(
                [(x0, y0), (x1, y1)],
                radius=radius,
                fill=COLORS["accent"] + (FADED_ALPHA,),
            )

    img.paste(overlay, (0, 0), overlay)


def _draw_timer(img: Image.Image, current_seconds: float, total_seconds: float) -> None:
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
    try:
        from datetime import datetime
        cleaned = created_at.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        return dt.strftime("%b %-d, %Y, %-I:%M %p")
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
    Render PNG frames into output_dir and return (frame_count, frame_duration).
    If waveform is empty or None, a synthetic shape is used so video rendering
    still succeeds for testimonies stored before waveform extraction was added.
    """
    os.makedirs(output_dir, exist_ok=True)

    if not waveform:
        waveform = _synthesize_waveform()

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