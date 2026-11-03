"""
Generate two new screenshots matching the existing TOCS voting app style:
  04-multi-choice.png   — multi-choice motion card
  04-motion-closed.png  — per-motion voting window (one motion closed)

Run from project root:
    python3 docs/make_screenshots.py
"""

import os
from PIL import Image, ImageDraw, ImageFont

SCREENSHOTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
FONT_DIR = "/System/Library/Fonts"

# ---------------------------------------------------------------------------
# Colours  (matched pixel-for-pixel from existing screenshots)
# ---------------------------------------------------------------------------
C_BG         = (243, 237, 227)   # warm beige page background
C_NAVY       = (15,  27,  45)    # nav bar / AGM header / headings
C_WHITE      = (255, 255, 255)
C_GOLD       = (201, 168, 76)    # building-name label / motion number
C_TEXT       = (44,  62,  80)    # body text
C_MUTED      = (107, 114, 128)   # secondary / description text
C_BORDER     = (220, 213, 200)   # card border
C_CARD_BG    = (255, 255, 255)   # motion card background
C_GREEN_BG   = (240, 253, 244)   # FOR button background
C_GREEN_TXT  = (22,  163, 74)    # FOR button text
C_RED_BG     = (254, 242, 242)   # AGAINST button background
C_RED_TXT    = (220, 38,  38)    # AGAINST button text
C_ABST_BG    = (249, 250, 251)   # ABSTAIN button background
C_ABST_TXT   = (107, 114, 128)   # ABSTAIN button text
C_BADGE_GEN_BG  = (241, 245, 249)   # GENERAL badge bg
C_BADGE_GEN_TXT = (71,  85,  105)   # GENERAL badge text
C_BADGE_MC_BG   = (237, 233, 254)   # MULTI-CHOICE badge bg
C_BADGE_MC_TXT  = (109, 40,  217)   # MULTI-CHOICE badge text
C_CLOSED_BG     = (254, 243, 199)   # MOTION CLOSED badge bg
C_CLOSED_TXT    = (146, 64,  14)    # MOTION CLOSED badge text
C_BADGE_SPE_BG  = (254, 249, 195)   # SPECIAL badge bg
C_BADGE_SPE_TXT = (133, 77,  14)    # SPECIAL badge text
C_DISABLED_BG   = (243, 244, 246)   # disabled button background
C_DISABLED_TXT  = (209, 213, 219)   # disabled button text / border
C_MC_COUNTER    = (71,  85,  105)   # multi-choice counter text
C_FOR_ACTIVE_BG = (220, 252, 231)   # active FOR selection bg (brighter)

W, H = 1280, 980

# ---------------------------------------------------------------------------
# Font helpers
# ---------------------------------------------------------------------------
def load(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

FONT_PATHS = {
    "serif":       os.path.join(FONT_DIR, "NewYork.ttf"),
    "serif_italic":os.path.join(FONT_DIR, "NewYorkItalic.ttf"),
    "sans":        os.path.join(FONT_DIR, "SFNS.ttf"),
    "sans_italic": os.path.join(FONT_DIR, "SFNSItalic.ttf"),
    "mono":        os.path.join(FONT_DIR, "SFNSMono.ttf"),
}

def font(style, size):
    return load(FONT_PATHS[style], size)

# ---------------------------------------------------------------------------
# Drawing primitives
# ---------------------------------------------------------------------------
def rounded_rect(draw, xy, radius, fill=None, outline=None, width=1):
    x0, y0, x1, y1 = xy
    r = radius
    if fill:
        draw.rectangle([x0 + r, y0, x1 - r, y1], fill=fill)
        draw.rectangle([x0, y0 + r, x1, y1 - r], fill=fill)
        draw.ellipse([x0, y0, x0 + 2*r, y0 + 2*r], fill=fill)
        draw.ellipse([x1 - 2*r, y0, x1, y0 + 2*r], fill=fill)
        draw.ellipse([x0, y1 - 2*r, x0 + 2*r, y1], fill=fill)
        draw.ellipse([x1 - 2*r, y1 - 2*r, x1, y1], fill=fill)
    if outline:
        draw.arc([x0, y0, x0 + 2*r, y0 + 2*r], 180, 270, fill=outline, width=width)
        draw.arc([x1 - 2*r, y0, x1, y0 + 2*r], 270, 360, fill=outline, width=width)
        draw.arc([x0, y1 - 2*r, x0 + 2*r, y1], 90, 180,  fill=outline, width=width)
        draw.arc([x1 - 2*r, y1 - 2*r, x1, y1], 0,   90,  fill=outline, width=width)
        draw.line([x0 + r, y0, x1 - r, y0], fill=outline, width=width)
        draw.line([x0 + r, y1, x1 - r, y1], fill=outline, width=width)
        draw.line([x0, y0 + r, x0, y1 - r], fill=outline, width=width)
        draw.line([x1, y0 + r, x1, y1 - r], fill=outline, width=width)


def draw_badge(draw, text, x, y, bg, txt_color, f=None):
    """Draw a small pill badge and return its right edge x."""
    f = f or font("sans", 18)
    bbox = f.getbbox(text)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad_x, pad_y = 14, 6
    w = tw + pad_x * 2
    h = th + pad_y * 2
    rounded_rect(draw, (x, y, x + w, y + h), radius=h // 2, fill=bg)
    draw.text((x + pad_x, y + pad_y), text, font=f, fill=txt_color)
    return x + w


def draw_nav(draw):
    draw.rectangle([0, 0, W, 54], fill=C_NAVY)
    draw.text((48, 14), "T O C S", font=font("sans", 20), fill=C_WHITE)


def draw_back_btn(draw):
    draw.text((48, 82), "← Back", font=font("sans", 22), fill=C_MUTED)


def draw_agm_header(draw, building, title, meeting_date, closes_date, timer):
    x0, y0, x1, y1 = 24, 118, W - 24, 318
    rounded_rect(draw, (x0, y0, x1, y1), radius=14, fill=C_NAVY)
    # building name
    draw.text((x0 + 26, y0 + 22), building.upper(),
              font=font("sans", 16), fill=C_GOLD)
    # title
    draw.text((x0 + 26, y0 + 46), title,
              font=font("serif", 36), fill=C_WHITE)
    # dates row
    f_small = font("sans", 19)
    draw.text((x0 + 26, y0 + 102),
              f"Meeting  {meeting_date}    Closes  {closes_date}",
              font=f_small, fill=(160, 180, 200))
    # time remaining label
    draw.text((x0 + 26, y0 + 140), "TIME REMAINING",
              font=font("sans", 16), fill=(120, 145, 170))
    # countdown
    draw.text((x0 + 26, y0 + 162), timer,
              font=font("mono", 44), fill=C_WHITE)


def draw_progress_bar(draw, answered, total, y=344):
    f = font("sans", 20)
    draw.text((24, y), "Motions answered", font=f, fill=C_MUTED)
    label = f"{answered} / {total}"
    bbox = f.getbbox(label)
    draw.text((W - 24 - (bbox[2] - bbox[0]), y), label, font=f, fill=C_MUTED)
    # thin rule below
    draw.line([(24, y + 34), (W - 24, y + 34)], fill=C_BORDER, width=1)


def draw_vote_button(draw, x0, y0, x1, y1, label, bg, txt):
    rounded_rect(draw, (x0, y0, x1, y1), radius=8, fill=bg, outline=C_BORDER, width=1)
    f = font("sans", 20)
    bbox = f.getbbox(label)
    tw = bbox[2] - bbox[0]
    cx = (x0 + x1) // 2 - tw // 2
    cy = (y0 + y1) // 2 - (bbox[3] - bbox[1]) // 2
    draw.text((cx, cy), label, font=f, fill=txt)


def draw_motion_card(draw, y_top, motion_num, motion_label, title, description,
                     extra_badge=None, closed=False, show_mc_options=False,
                     mc_counter=None):
    """
    Draw a motion card.
    Returns the y coordinate just below the card.
    """
    x0, x1 = 24, W - 24
    pad = 26

    # estimate height
    if show_mc_options:
        card_h = 400
    elif closed:
        card_h = 220
    else:
        card_h = 196

    y1 = y_top + card_h
    rounded_rect(draw, (x0, y_top, x1, y1), radius=14,
                 fill=C_CARD_BG, outline=C_BORDER, width=1)

    # motion number label
    f_label = font("sans", 17)
    draw.text((x0 + pad, y_top + 20), motion_num.upper(),
              font=f_label, fill=C_GOLD)

    # type badge (top right)
    badge_x_right = x1 - pad
    if motion_label == "GENERAL":
        badge_bg, badge_txt = C_BADGE_GEN_BG, C_BADGE_GEN_TXT
    elif motion_label == "SPECIAL":
        badge_bg, badge_txt = C_BADGE_SPE_BG, C_BADGE_SPE_TXT
    else:
        badge_bg, badge_txt = C_BADGE_GEN_BG, C_BADGE_GEN_TXT

    f_badge = font("sans", 17)
    bbox = f_badge.getbbox(motion_label)
    bw = bbox[2] - bbox[0] + 28
    bh = bbox[3] - bbox[1] + 12
    bx0 = badge_x_right - bw
    rounded_rect(draw, (bx0, y_top + 14, bx0 + bw, y_top + 14 + bh),
                 radius=bh // 2, fill=badge_bg)
    draw.text((bx0 + 14, y_top + 20), motion_label, font=f_badge, fill=badge_txt)

    # extra badge (e.g. MULTI-CHOICE)
    if extra_badge:
        eb_f = font("sans", 17)
        eb_bbox = eb_f.getbbox(extra_badge)
        eb_w = eb_bbox[2] - eb_bbox[0] + 28
        eb_h = eb_bbox[3] - eb_bbox[1] + 12
        eb_x0 = bx0 - eb_w - 8
        rounded_rect(draw, (eb_x0, y_top + 14, eb_x0 + eb_w, y_top + 14 + eb_h),
                     radius=eb_h // 2, fill=C_BADGE_MC_BG)
        draw.text((eb_x0 + 14, y_top + 20), extra_badge, font=eb_f, fill=C_BADGE_MC_TXT)

    # title
    draw.text((x0 + pad, y_top + 54), title,
              font=font("serif", 30), fill=C_TEXT)

    # description
    draw.text((x0 + pad, y_top + 96), description,
              font=font("sans", 19), fill=C_MUTED)

    content_y = y_top + 128

    if closed:
        # MOTION CLOSED badge
        mc_f = font("sans", 18)
        mc_bbox = mc_f.getbbox("Motion Closed")
        mc_bw = mc_bbox[2] - mc_bbox[0] + 28
        mc_bh = mc_bbox[3] - mc_bbox[1] + 12
        rounded_rect(draw, (x0 + pad, content_y, x0 + pad + mc_bw, content_y + mc_bh),
                     radius=mc_bh // 2, fill=C_CLOSED_BG)
        draw.text((x0 + pad + 14, content_y + 6), "Motion Closed",
                  font=mc_f, fill=C_CLOSED_TXT)
        # disabled buttons below
        btn_y0 = content_y + mc_bh + 14
        btn_y1 = btn_y0 + 56
        bw_each = (x1 - x0 - pad * 2 - 16) // 3
        for i, label in enumerate(["FOR", "AGAINST", "ABSTAIN"]):
            bx = x0 + pad + i * (bw_each + 8)
            rounded_rect(draw, (bx, btn_y0, bx + bw_each, btn_y1),
                         radius=8, fill=C_DISABLED_BG, outline=C_DISABLED_TXT, width=1)
            bf = font("sans", 18)
            bbox = bf.getbbox(label)
            cx = bx + (bw_each - (bbox[2] - bbox[0])) // 2
            cy = btn_y0 + (56 - (bbox[3] - bbox[1])) // 2
            draw.text((cx, cy), label, font=bf, fill=C_DISABLED_TXT)
        return y1 + 12

    if show_mc_options:
        # counter
        if mc_counter:
            draw.text((x0 + pad, content_y), mc_counter,
                      font=font("sans", 18), fill=C_MC_COUNTER)
            content_y += 30

        options = [
            ("Candidate A — John Smith",    "for",      True),
            ("Candidate B — Maria Garcia",  None,       False),
            ("Candidate C — David Chen",    "against",  False),
        ]
        row_h = 54
        btn_w = 96
        gap = 8

        for opt_text, choice, is_first in options:
            row_y0 = content_y
            row_y1 = row_y0 + row_h
            # separator
            if not is_first:
                draw.line([(x0 + pad, row_y0), (x1 - pad, row_y0)],
                          fill=C_BORDER, width=1)

            # option label
            draw.text((x0 + pad, row_y0 + 14), opt_text,
                      font=font("sans", 20), fill=C_TEXT)

            # buttons (right-aligned)
            btns_x1 = x1 - pad
            btns_x0 = btns_x1 - 3 * btn_w - 2 * gap

            configs = [
                ("FOR",     C_GREEN_BG if choice == "for" else C_ABST_BG,
                            C_GREEN_TXT if choice == "for" else C_ABST_TXT),
                ("AGAINST", C_RED_BG if choice == "against" else C_ABST_BG,
                            C_RED_TXT if choice == "against" else C_ABST_TXT),
                ("ABSTAIN", C_ABST_BG, C_ABST_TXT),
            ]
            for i, (lbl, bg, tc) in enumerate(configs):
                bx0_b = btns_x0 + i * (btn_w + gap)
                bx1_b = bx0_b + btn_w
                by0 = row_y0 + 8
                by1 = row_y0 + row_h - 8
                # active: slightly stronger border
                outline = C_GREEN_TXT if (lbl == "FOR" and choice == "for") else \
                          C_RED_TXT   if (lbl == "AGAINST" and choice == "against") else \
                          C_BORDER
                rounded_rect(draw, (bx0_b, by0, bx1_b, by1),
                             radius=6, fill=bg, outline=outline, width=1)
                bf = font("sans", 16)
                bbox = bf.getbbox(lbl)
                cx = bx0_b + (btn_w - (bbox[2] - bbox[0])) // 2
                cy = by0 + (by1 - by0 - (bbox[3] - bbox[1])) // 2
                draw.text((cx, cy), lbl, font=bf, fill=tc)

            content_y += row_h

        return y1 + 12

    # Standard vote buttons
    btn_y0 = content_y + 6
    btn_y1 = btn_y0 + 64
    bw_each = (x1 - x0 - pad * 2 - 16) // 3
    for i, (label, bg, tc) in enumerate([
        ("FOR",     C_GREEN_BG, C_GREEN_TXT),
        ("AGAINST", C_RED_BG,   C_RED_TXT),
        ("ABSTAIN", C_ABST_BG,  C_ABST_TXT),
    ]):
        bx = x0 + pad + i * (bw_each + 8)
        rounded_rect(draw, (bx, btn_y0, bx + bw_each, btn_y1),
                     radius=8, fill=bg, outline=C_BORDER, width=1)
        bf = font("sans", 20)
        bbox = bf.getbbox(label)
        cx = bx + (bw_each - (bbox[2] - bbox[0])) // 2
        cy = btn_y0 + (64 - (bbox[3] - bbox[1])) // 2
        draw.text((cx, cy), label, font=bf, fill=tc)

    return y1 + 12


# ---------------------------------------------------------------------------
# Screenshot 1: 04-multi-choice.png
# ---------------------------------------------------------------------------
def make_multi_choice():
    img = Image.new("RGB", (W, H), C_BG)
    draw = ImageDraw.Draw(img)

    draw_nav(draw)
    draw_back_btn(draw)
    draw_agm_header(draw,
        building="WF Screenshot Test Building",
        title="WF Screenshot Test AGM",
        meeting_date="Mar 23, 2026, 9:05 PM",
        closes_date="Mar 23, 2027, 10:05 PM",
        timer="8759:59:42",
    )
    draw_progress_bar(draw, answered=1, total=2, y=334)

    y = 386
    # First card: standard motion, already answered (FOR active) — provides context
    # Second card: multi-choice
    y = draw_motion_card(
        draw, y,
        motion_num="Motion 1",
        motion_label="GENERAL",
        title="Motion 1 — Approval of AGM Minutes",
        description="That the minutes of the previous AGM be confirmed as a true and accurate record.",
    )

    draw_motion_card(
        draw, y,
        motion_num="Motion 2",
        motion_label="GENERAL",
        title="Motion 2 — Election of Committee Members",
        description="Select candidates to serve on the building committee for 2026–2027.",
        extra_badge="Multi-Choice",
        show_mc_options=True,
        mc_counter="Select up to 2 options — 1 voted For",
    )

    path = os.path.join(SCREENSHOTS_DIR, "04-multi-choice.png")
    img.save(path, "PNG")
    print(f"Saved: {path}")


# ---------------------------------------------------------------------------
# Screenshot 2: 04-motion-closed.png
# ---------------------------------------------------------------------------
def make_motion_closed():
    img = Image.new("RGB", (W, H), C_BG)
    draw = ImageDraw.Draw(img)

    draw_nav(draw)
    draw_back_btn(draw)
    draw_agm_header(draw,
        building="WF Screenshot Test Building",
        title="WF Screenshot Test AGM",
        meeting_date="Mar 23, 2026, 9:05 PM",
        closes_date="Mar 23, 2027, 10:05 PM",
        timer="8759:59:42",
    )
    draw_progress_bar(draw, answered=1, total=2, y=334)

    y = 386
    # First motion: normal and answered (FOR selected)
    y = draw_motion_card(
        draw, y,
        motion_num="Motion 1",
        motion_label="GENERAL",
        title="Motion 1 — Approval of AGM Minutes",
        description="That the minutes of the previous AGM be confirmed as a true and accurate record.",
    )

    # Second motion: closed
    draw_motion_card(
        draw, y,
        motion_num="Motion 2",
        motion_label="SPECIAL",
        title="Motion 2 — Special Levy Approval",
        description="That a special levy of $1,200 per lot be raised for lift modernisation works.",
        closed=True,
    )

    path = os.path.join(SCREENSHOTS_DIR, "04-motion-closed.png")
    img.save(path, "PNG")
    print(f"Saved: {path}")


if __name__ == "__main__":
    make_multi_choice()
    make_motion_closed()
