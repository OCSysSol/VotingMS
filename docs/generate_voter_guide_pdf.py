"""
Generate docs/voter-guide.pdf from voter-guide.md + screenshots.
Uses ReportLab + Pillow. Run from the project root:
    python3 docs/generate_voter_guide_pdf.py
"""

import os
from PIL import Image as PILImage
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame,
    Paragraph, Spacer, Image, HRFlowable,
    KeepTogether, Table, TableStyle, PageBreak,
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus.flowables import Flowable

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SCREENSHOTS_DIR = os.path.join(SCRIPT_DIR, "screenshots")
OUTPUT_PDF = os.path.join(SCRIPT_DIR, "voter-guide.pdf")

# ---------------------------------------------------------------------------
# Fonts  (SF Pro / New York from macOS system fonts)
# ---------------------------------------------------------------------------
FONT_DIR = "/System/Library/Fonts"

pdfmetrics.registerFont(TTFont("SFPro",       os.path.join(FONT_DIR, "SFNS.ttf")))
pdfmetrics.registerFont(TTFont("SFProItalic", os.path.join(FONT_DIR, "SFNSItalic.ttf")))
pdfmetrics.registerFont(TTFont("SFMono",      os.path.join(FONT_DIR, "SFNSMono.ttf")))
pdfmetrics.registerFont(TTFont("NYSerif",     os.path.join(FONT_DIR, "NewYork.ttf")))
pdfmetrics.registerFont(TTFont("NYSerifItalic", os.path.join(FONT_DIR, "NewYorkItalic.ttf")))

# ---------------------------------------------------------------------------
# Brand colours (matches the TOCS app palette)
# ---------------------------------------------------------------------------
C_NAVY      = HexColor("#0f1b2d")   # navbar / headings
C_GOLD      = HexColor("#c9a84c")   # accent
C_BG        = HexColor("#f3ede3")   # page background
C_WHITE     = HexColor("#ffffff")
C_LIGHT     = HexColor("#f8f5f0")   # card / callout background
C_BORDER    = HexColor("#e0d9cf")   # divider lines
C_TEXT      = HexColor("#2c3e50")   # body text
C_MUTED     = HexColor("#6b7280")   # secondary text
C_GREEN     = HexColor("#22c55e")   # FOR badge
C_RED       = HexColor("#ef4444")   # AGAINST badge
C_AMBER     = HexColor("#d97706")   # ARREAR badge
C_PURPLE    = HexColor("#7c3aed")   # MULTI-CHOICE badge
C_STEP_BG   = HexColor("#0f1b2d")   # step header background

# ---------------------------------------------------------------------------
# Page geometry
# ---------------------------------------------------------------------------
PAGE_W, PAGE_H = A4
MARGIN_LEFT   = 18 * mm
MARGIN_RIGHT  = 18 * mm
MARGIN_TOP    = 22 * mm
MARGIN_BOTTOM = 20 * mm
CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT

# ---------------------------------------------------------------------------
# Paragraph styles
# ---------------------------------------------------------------------------
def ps(name, **kw):
    defaults = dict(fontName="SFPro", fontSize=10, leading=15, textColor=C_TEXT,
                    spaceAfter=0, spaceBefore=0, leftIndent=0, rightIndent=0,
                    alignment=TA_LEFT)
    defaults.update(kw)
    return ParagraphStyle(name, **defaults)

S_DOC_TITLE  = ps("DocTitle",  fontName="NYSerif",  fontSize=28, leading=34,
                   textColor=C_NAVY, spaceAfter=4, alignment=TA_CENTER)
S_DOC_SUB    = ps("DocSub",    fontName="SFProItalic", fontSize=12, leading=16,
                   textColor=C_MUTED, alignment=TA_CENTER)
S_STEP_TITLE = ps("StepTitle", fontName="NYSerif",  fontSize=15, leading=20,
                   textColor=C_WHITE, spaceAfter=0)
S_H2         = ps("H2",        fontName="NYSerif",  fontSize=13, leading=18,
                   textColor=C_NAVY, spaceBefore=6, spaceAfter=4)
S_H3         = ps("H3",        fontName="SFPro",    fontSize=10.5, leading=14,
                   textColor=C_NAVY, spaceBefore=4, spaceAfter=3)
S_BODY       = ps("Body",      fontName="SFPro",    fontSize=9.5, leading=14,
                   textColor=C_TEXT, spaceAfter=5)
S_BODY_BOLD  = ps("BodyBold",  fontName="SFPro",    fontSize=9.5, leading=14,
                   textColor=C_TEXT, spaceAfter=5)
S_CAPTION    = ps("Caption",   fontName="SFProItalic", fontSize=8, leading=11,
                   textColor=C_MUTED, alignment=TA_CENTER, spaceAfter=6)
S_BULLET     = ps("Bullet",    fontName="SFPro",    fontSize=9.5, leading=14,
                   textColor=C_TEXT, leftIndent=12, spaceAfter=3,
                   bulletIndent=0, bulletFontName="SFPro", bulletFontSize=9.5)
S_CODE       = ps("Code",      fontName="SFMono",   fontSize=8.5, leading=13,
                   textColor=C_NAVY, backColor=C_LIGHT, spaceAfter=4,
                   leftIndent=8, rightIndent=8)
S_CALLOUT    = ps("Callout",   fontName="SFProItalic", fontSize=9, leading=13,
                   textColor=C_NAVY, leftIndent=10, rightIndent=10, spaceAfter=4)
S_TH         = ps("TH",        fontName="SFPro",    fontSize=8.5, leading=12,
                   textColor=C_WHITE, alignment=TA_LEFT)
S_TD         = ps("TD",        fontName="SFPro",    fontSize=8.5, leading=12,
                   textColor=C_TEXT, alignment=TA_LEFT)
S_FOOTER     = ps("Footer",    fontName="SFPro",    fontSize=7.5, leading=10,
                   textColor=C_MUTED, alignment=TA_CENTER)
S_ISSUE_KEY  = ps("IssueKey",  fontName="SFPro",    fontSize=9.5, leading=14,
                   textColor=C_NAVY, spaceAfter=1)
S_TOC_ITEM   = ps("TocItem",   fontName="SFPro",    fontSize=9.5, leading=15,
                   textColor=C_TEXT)

# ---------------------------------------------------------------------------
# Custom Flowables
# ---------------------------------------------------------------------------

class NavBar(Flowable):
    """Dark TOCS top nav bar — only used on the cover page."""
    HEIGHT = 14 * mm

    def __init__(self, width):
        Flowable.__init__(self)
        self.width = width
        self.height = self.HEIGHT

    def draw(self):
        c = self.canv
        c.setFillColor(C_NAVY)
        c.rect(0, 0, self.width, self.HEIGHT, fill=1, stroke=0)
        # TOCS wordmark
        c.setFillColor(C_WHITE)
        c.setFont("SFPro", 14)
        c.drawString(0, 4 * mm, "T O C S")


class GoldRule(Flowable):
    """A thin gold horizontal rule."""
    def __init__(self, width, thickness=0.8):
        Flowable.__init__(self)
        self.width = width
        self.height = thickness
        self._thickness = thickness

    def draw(self):
        self.canv.setStrokeColor(C_GOLD)
        self.canv.setLineWidth(self._thickness)
        self.canv.line(0, 0, self.width, 0)


class StepHeader(Flowable):
    """Dark navy pill/bar with step number + title."""
    HEIGHT = 11 * mm

    def __init__(self, number, title, width):
        Flowable.__init__(self)
        self.number = number
        self.title = title
        self.width = width
        self.height = self.HEIGHT

    def draw(self):
        c = self.canv
        r = 4
        h = self.HEIGHT
        w = self.width
        # background
        c.setFillColor(C_NAVY)
        c.roundRect(0, 0, w, h, r, fill=1, stroke=0)
        # gold step-number badge on left
        badge_w = 18 * mm
        c.setFillColor(C_GOLD)
        c.roundRect(3, 2.5, badge_w, h - 5, 3, fill=1, stroke=0)
        c.setFillColor(C_NAVY)
        c.setFont("SFPro", 8)
        c.drawCentredString(3 + badge_w / 2, 4.5, f"STEP {self.number}")
        # title
        c.setFillColor(C_WHITE)
        c.setFont("NYSerif", 11)
        c.drawString(badge_w + 7, 3.5, self.title)


class Badge(Flowable):
    """Inline coloured pill badge (FOR / AGAINST / etc)."""
    def __init__(self, text, bg_color, text_color=None, width=None, height=6*mm):
        Flowable.__init__(self)
        self._text = text
        self._bg = bg_color
        self._fg = text_color or C_WHITE
        self.height = height
        self.width = width or (len(text) * 5 + 10)

    def draw(self):
        c = self.canv
        c.setFillColor(self._bg)
        c.roundRect(0, 0, self.width, self.height, 2.5, fill=1, stroke=0)
        c.setFillColor(self._fg)
        c.setFont("SFPro", 7)
        c.drawCentredString(self.width / 2, 1.5, self._text)


class CalloutBox(Flowable):
    """Light-background callout / tip box with left gold border."""
    def __init__(self, para, width, padding=8):
        Flowable.__init__(self)
        self._para = para
        self.width = width
        self._padding = padding
        # We'll measure height after wrapping
        self._wrapped = None

    def wrap(self, aW, aH):
        inner_w = self.width - self._padding * 2 - 4  # 4 for border
        w, h = self._para.wrap(inner_w, aH)
        self.height = h + self._padding * 2
        return self.width, self.height

    def draw(self):
        c = self.canv
        p = self._padding
        # background
        c.setFillColor(C_LIGHT)
        c.roundRect(0, 0, self.width, self.height, 3, fill=1, stroke=0)
        # gold left border
        c.setFillColor(C_GOLD)
        c.rect(0, 0, 3, self.height, fill=1, stroke=0)
        # draw paragraph
        self._para.drawOn(c, p + 4, p)


# ---------------------------------------------------------------------------
# Helper: screenshot image flowable (centred, max width)
# ---------------------------------------------------------------------------
def screenshot(filename, caption=None, max_width=None, max_height=80*mm):
    path = os.path.join(SCREENSHOTS_DIR, filename)
    if not os.path.exists(path):
        return []
    mw = max_width or CONTENT_W * 0.92
    # get natural size
    with PILImage.open(path) as img:
        iw, ih = img.size
    # scale to fit
    scale = min(mw / iw, max_height / ih, 1.0)
    w, h = iw * scale, ih * scale
    items = [
        Spacer(1, 2*mm),
        Image(path, width=w, height=h, hAlign="CENTER"),
    ]
    if caption:
        items.append(Paragraph(caption, S_CAPTION))
    items.append(Spacer(1, 2*mm))
    return items


# ---------------------------------------------------------------------------
# Helper: table
# ---------------------------------------------------------------------------
def make_table(headers, rows, col_widths=None):
    cw = col_widths or [CONTENT_W / len(headers)] * len(headers)
    header_row = [Paragraph(h, S_TH) for h in headers]
    data = [header_row] + [[Paragraph(str(c), S_TD) for c in row] for row in rows]
    t = Table(data, colWidths=cw, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), C_NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_WHITE, C_LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.4, C_BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t

# ---------------------------------------------------------------------------
# Helper: bullet list
# ---------------------------------------------------------------------------
def bullets(items, indent=0):
    result = []
    style = ParagraphStyle("BulletIndent", parent=S_BULLET, leftIndent=12 + indent)
    for item in items:
        result.append(Paragraph(f"\u2022\u00a0\u00a0{item}", style))
    return result


def b(text):
    """Bold inline span."""
    return f"<b>{text}</b>"


def it(text):
    """Italic inline span."""
    return f"<i>{text}</i>"


def code(text):
    """Inline code span."""
    return f"<font name='SFMono' size='8.5' color='#0f1b2d'>{text}</font>"


# ---------------------------------------------------------------------------
# Page template with header rule + footer
# ---------------------------------------------------------------------------
def on_page(canvas, doc):
    canvas.saveState()
    # thin gold top rule
    canvas.setStrokeColor(C_GOLD)
    canvas.setLineWidth(1.5)
    canvas.line(MARGIN_LEFT, PAGE_H - MARGIN_TOP + 4*mm,
                PAGE_W - MARGIN_RIGHT, PAGE_H - MARGIN_TOP + 4*mm)
    # footer
    canvas.setFont("SFPro", 7.5)
    canvas.setFillColor(C_MUTED)
    canvas.drawCentredString(PAGE_W / 2, MARGIN_BOTTOM - 8*mm,
                             f"AGM Online Voting — Voter Guide   ·   Page {doc.page}")
    canvas.restoreState()


def on_first_page(canvas, doc):
    canvas.saveState()
    canvas.restoreState()


# ---------------------------------------------------------------------------
# Build story
# ---------------------------------------------------------------------------
def build_story():
    story = []
    SP = Spacer

    # ── COVER ──────────────────────────────────────────────────────────────
    story.append(SP(1, 8*mm))
    story.append(NavBar(CONTENT_W))
    story.append(SP(1, 10*mm))
    story.append(GoldRule(CONTENT_W))
    story.append(SP(1, 8*mm))
    story.append(Paragraph("AGM Online Voting", S_DOC_TITLE))
    story.append(SP(1, 3*mm))
    story.append(Paragraph("Voter Guide", ps("CoverSub", fontName="SFProItalic",
                 fontSize=16, leading=22, textColor=C_GOLD, alignment=TA_CENTER)))
    story.append(SP(1, 6*mm))
    story.append(Paragraph(
        "Step-by-step instructions for casting your vote at an Annual General Meeting "
        "using the online voting portal.",
        ps("CoverBody", fontName="SFPro", fontSize=11, leading=17,
           textColor=C_MUTED, alignment=TA_CENTER)))
    story.append(SP(1, 8*mm))
    story.append(GoldRule(CONTENT_W))
    story.append(SP(1, 10*mm))

    # Cover screenshot
    story += screenshot("01-home.png",
                        caption="The voting portal home page — select your building to get started.",
                        max_height=100*mm)

    story.append(SP(1, 6*mm))
    story.append(GoldRule(CONTENT_W, thickness=0.4))
    story.append(SP(1, 4*mm))

    # Table of contents
    story.append(Paragraph("Contents", ps("TocHead", fontName="NYSerif", fontSize=13,
                            leading=18, textColor=C_NAVY, spaceAfter=4)))
    toc_items = [
        ("Before you start",                    ""),
        ("Step 1",  "Find your meeting"),
        ("Step 2",  "Verify your identity"),
        ("Step 3",  "Select your lots"),
        ("Step 4",  "Cast your votes"),
        ("Step 5",  "Submit your ballot"),
        ("Step 6",  "Confirmation"),
        ("",        "Proxy voting"),
        ("",        "Signing out"),
        ("",        "Common issues"),
    ]
    for step, title in toc_items:
        if step:
            line = f"<b>{step}</b> — {title}" if title else f"<b>{title or step}</b>"
        else:
            line = title
        story.append(Paragraph(line, S_TOC_ITEM))
    story.append(SP(1, 4*mm))
    story.append(PageBreak())

    # ── BEFORE YOU START ───────────────────────────────────────────────────
    story.append(Paragraph("Before you start", S_H2))
    story.append(GoldRule(CONTENT_W, thickness=0.5))
    story.append(SP(1, 3*mm))
    story.append(Paragraph("You will need:", S_BODY))
    story += bullets([
        "The email address registered with your building manager",
        "Access to that email inbox (to receive a verification code)",
    ])
    story.append(SP(1, 2*mm))
    story.append(Paragraph(
        "You do not need to create an account or install anything.", S_BODY))
    story.append(SP(1, 6*mm))

    # ── STEP 1 ─────────────────────────────────────────────────────────────
    story.append(StepHeader("1", "Find Your Meeting", CONTENT_W))
    story.append(SP(1, 4*mm))
    story += bullets([
        "Open the voting portal link provided by your building manager.",
        "Type your building name into the search box and select it from the results.",
        "Find your meeting in the list.",
    ])
    story.append(SP(1, 3*mm))
    story.append(Paragraph("A meeting can have one of three statuses:", S_BODY))
    story.append(SP(1, 2*mm))
    story.append(make_table(
        ["Status", "What you see", "What it means"],
        [
            ["Not yet open", "\"Voting Not Yet Open\" (greyed out)",
             "Voting hasn't started — check back later"],
            ["Open",   "\"Enter Voting\" (clickable)", "You can vote now"],
            ["Closed", "\"View My Submission\"",
             "Voting has ended — you can review what you submitted"],
        ],
        col_widths=[28*mm, 52*mm, CONTENT_W - 80*mm],
    ))
    story.append(SP(1, 3*mm))
    story.append(Paragraph(f"Click {b('Enter Voting')} to begin.", S_BODY))
    story += screenshot("01-home.png",
                        caption="Home page — building search box and meeting list.")
    story.append(SP(1, 4*mm))

    # ── STEP 2 ─────────────────────────────────────────────────────────────
    story.append(StepHeader("2", "Verify Your Identity", CONTENT_W))
    story.append(SP(1, 4*mm))
    story.append(Paragraph(
        "Voting uses a one-time code sent to your email — no password required.",
        S_BODY))
    story.append(SP(1, 2*mm))
    story += bullets([
        f"Enter your registered email address and click {b('Send Verification Code')}.",
        f"Check your inbox for an email with an 8-character code (e.g. {code('A3BX92KL')}).",
        f"The code expires in {b('5 minutes')}. If you don't see it, check your spam/junk folder.",
        f"Enter the code and click {b('Verify')}.",
    ])

    imgs_step2 = (
        screenshot("02-auth-email.png", caption="Step 2a — enter your email address.",
                   max_width=CONTENT_W * 0.48) +
        screenshot("03-auth-code.png", caption="Step 2b — enter the verification code.",
                   max_width=CONTENT_W * 0.48)
    )
    # Side-by-side using a two-column table
    img_left  = [i for i in imgs_step2[:len(imgs_step2)//2]]
    img_right = [i for i in imgs_step2[len(imgs_step2)//2:]]

    from reportlab.platypus import KeepInFrame
    col_w = CONTENT_W / 2 - 3*mm
    t2 = Table([[img_left, img_right]], colWidths=[col_w, col_w])
    t2.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING",   (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
    ]))
    story.append(t2)

    story.append(SP(1, 3*mm))
    callout_p = Paragraph(
        f"{b('Already voted recently?')} If you return to the portal within 30 minutes, "
        "you will be taken straight to voting without needing to verify again.",
        ps("CalloutInner", fontName="SFProItalic", fontSize=9, leading=13, textColor=C_NAVY))
    story.append(CalloutBox(callout_p, CONTENT_W))
    story.append(SP(1, 4*mm))

    # ── STEP 3 ─────────────────────────────────────────────────────────────
    story.append(StepHeader("3", "Select Your Lots", CONTENT_W))
    story.append(SP(1, 4*mm))
    story.append(Paragraph(
        f"If you are associated with more than one lot, you will see a {b('Your Lots')} panel "
        f"on the left side of the screen (or tap {b('☰ Your Lots')} on mobile to open it).",
        S_BODY))
    story.append(SP(1, 2*mm))
    story.append(Paragraph("Use the shortcut buttons to quickly adjust your selection:", S_BODY))
    story += bullets([
        f"{b('Select All')} — tick all lots that haven't been submitted yet",
        f"{b('Deselect All')} — untick all lots",
        f"{b('Select Proxy Lots')} — tick only proxy lots (shown when you have both owned and proxy lots)",
        f"{b('Select Owned Lots')} — tick only your own lots",
    ])
    story.append(SP(1, 2*mm))
    story += bullets([
        "You can submit votes for some lots now and return later to vote for the rest.",
        f"Lots already submitted are shown as {b('Already submitted')} and cannot be changed.",
        f"The {b('View Submission')} button appears in the panel as soon as any lot has been submitted.",
    ])
    story += screenshot("03-lots.png",
                        caption="Your Lots panel showing Select All / Deselect All / "
                                "Select Proxy Lots / Select Owned Lots shortcut buttons.")
    story.append(SP(1, 4*mm))

    # ── STEP 4 ─────────────────────────────────────────────────────────────
    story.append(StepHeader("4", "Cast Your Votes", CONTENT_W))
    story.append(SP(1, 4*mm))
    story.append(Paragraph(
        "Each motion is listed as a card showing the motion number, a "
        f"{b('General')} or {b('Special')} badge, and the motion title. "
        "A progress bar at the top shows how many motions you have answered.",
        S_BODY))
    story.append(SP(1, 3*mm))

    # Standard motions
    story.append(Paragraph("Standard (binary) motions", S_H3))
    story.append(Paragraph("For each motion, choose one of:", S_BODY))
    story.append(make_table(
        ["Choice", "Meaning"],
        [
            ["For",       "You support the motion"],
            ["Against",   "You oppose the motion"],
            ["Abstained", "You choose not to vote on this motion"],
        ],
        col_widths=[30*mm, CONTENT_W - 30*mm],
    ))
    story.append(SP(1, 2*mm))
    story += screenshot("04-voting.png",
                        caption="Voting page — motion cards with For / Against / Abstain buttons "
                                "and progress bar.")

    # Multi-choice motions
    story.append(Paragraph("Multi-choice motions", S_H3))
    story.append(Paragraph(
        f"Some motions present a list of options instead of a single For/Against choice. "
        f"These are marked with a {b('Multi-Choice')} badge.",
        S_BODY))
    story += bullets([
        "For each option in the list, choose one of For, Against, or Abstain.",
        "A counter shows how many options you have voted For and the maximum allowed.",
        "You can change your selections at any time before submitting.",
    ])
    story += screenshot("04-multi-choice.png",
                        caption="Multi-choice motion card — per-option For / Against / Abstain "
                                "buttons with a selection counter above.")

    # Per-motion windows
    story.append(Paragraph("Per-motion voting windows", S_H3))
    story.append(Paragraph(
        f"Occasionally a motion may close before the overall meeting closes. "
        f"A {b('Motion Closed')} badge will appear on that card and its buttons will be disabled. "
        f"Motions that close before you answer them are excluded from your progress bar.",
        S_BODY))
    story += screenshot("04-motion-closed.png",
                        caption="A closed motion shows the amber \"Motion Closed\" badge "
                                "and greyed-out disabled buttons.")
    story.append(SP(1, 1*mm))

    # Arrear
    story.append(Paragraph("If your lot is in arrears", S_H3))
    story.append(Paragraph(
        f"If your lot has an outstanding financial obligation to the building, "
        f"it will be marked {b('In Arrear')}.",
        S_BODY))
    story += bullets([
        f"You can still vote on {b('Special Motions')} — your vote will be counted normally.",
        f"On {b('General Motions')}, your vote will be recorded as {b('Not eligible')} "
         "regardless of your selection.",
    ])
    story.append(Paragraph(
        "A notice at the top of the page will explain this if it applies to you.", S_BODY))
    story += screenshot("06-arrear.png",
                        caption="In-arrear warning banner and In Arrear badge on the lot.")

    # Countdown
    story.append(Paragraph("Voting countdown", S_H3))
    story.append(Paragraph(
        "The voting screen shows a countdown timer. When less than 5 minutes remain, "
        "a warning banner will appear. Once the timer reaches zero, voting closes and "
        "you will not be able to submit.",
        S_BODY))
    story.append(SP(1, 4*mm))

    # ── STEP 5 ─────────────────────────────────────────────────────────────
    story.append(StepHeader("5", "Submit Your Ballot", CONTENT_W))
    story.append(SP(1, 4*mm))
    story.append(Paragraph("When you are ready to submit:", S_BODY))
    story += bullets([
        f"Click {b('Submit ballot')}.",
        "If you have selected lots with different prior vote histories, a warning dialog "
        f"will appear — review it and click {b('Continue')} to proceed or {b('Go back')} "
        "to adjust your selection.",
        "A confirmation dialog will appear. If any motions were left unanswered, "
        f"they will be listed — they will be recorded as {b('Abstained')} if you proceed.",
        f"Click {b('Submit ballot')} to confirm.",
    ])
    story.append(SP(1, 3*mm))
    warn_p = Paragraph(
        "Your votes cannot be changed after submission.",
        ps("WarnInner", fontName="SFPro", fontSize=9.5, leading=13, textColor=C_NAVY))
    story.append(CalloutBox(warn_p, CONTENT_W))
    story.append(SP(1, 4*mm))

    # ── STEP 6 ─────────────────────────────────────────────────────────────
    story.append(StepHeader("6", "Confirmation", CONTENT_W))
    story.append(SP(1, 4*mm))
    story.append(Paragraph(
        "After submitting you will see a confirmation screen showing:", S_BODY))
    story += bullets([
        "The building and meeting name",
        "Your email address",
        "Each motion and the vote you cast for each lot — for multi-choice motions, "
        "each option's choice is shown individually",
    ])
    story.append(Paragraph(
        f"You can return to this page at any time (even after the meeting closes) "
        f"by clicking {b('View My Submission')} on the home page.",
        S_BODY))
    story += screenshot("05-confirmation.png",
                        caption="Confirmation page showing submitted votes for each motion.")
    story.append(SP(1, 4*mm))

    # ── PROXY VOTING ───────────────────────────────────────────────────────
    story.append(Paragraph("Proxy Voting", S_H2))
    story.append(GoldRule(CONTENT_W, thickness=0.5))
    story.append(SP(1, 3*mm))
    story.append(Paragraph(
        f"If someone has nominated you as their proxy, their lots will appear in your lot "
        f"list marked {b('via Proxy')}. You vote on their behalf by selecting those lots "
        "and submitting votes as normal.",
        S_BODY))
    story.append(Paragraph(
        f"If you have both your own lots and proxy lots, use the {b('Select Proxy Lots')} "
        f"and {b('Select Owned Lots')} shortcut buttons to switch between them.",
        S_BODY))
    story += screenshot("07-proxy.png",
                        caption="Your Lots panel showing an owned lot and a proxy lot "
                                "with Select Proxy Lots / Select Owned Lots buttons.")
    story.append(SP(1, 4*mm))

    # ── SIGNING OUT ────────────────────────────────────────────────────────
    story.append(Paragraph("Signing Out", S_H2))
    story.append(GoldRule(CONTENT_W, thickness=0.5))
    story.append(SP(1, 3*mm))
    story.append(Paragraph(
        f"To end your session, click {b('Sign out')} at the top of the voting page. "
        "This invalidates your session immediately on the server and returns you to "
        "the home page.",
        S_BODY))
    story.append(SP(1, 4*mm))

    # ── COMMON ISSUES ──────────────────────────────────────────────────────
    story.append(Paragraph("Common Issues", S_H2))
    story.append(GoldRule(CONTENT_W, thickness=0.5))
    story.append(SP(1, 3*mm))

    issues = [
        (
            '"Email address not found for this building"',
            "Your email address is not registered with this building. Contact your "
            "building manager to confirm the email on file.",
        ),
        (
            '"Invalid or expired code"',
            f"The verification code has expired (they last 5 minutes) or was entered "
            f"incorrectly. Click {b('Resend code')} to get a new one. "
            "You must wait 60 seconds between resend requests.",
        ),
        (
            "Voting closes while you are on the page",
            "A banner will appear and all vote buttons will be disabled. If you have "
            "not submitted yet, your votes have not been recorded — contact your "
            "building manager.",
        ),
        (
            "You return after submitting some lots",
            f"You will be taken to the confirmation page. Click {b('Vote for remaining lots')} "
            "to continue voting for any lots you have not yet submitted.",
        ),
        (
            'The portal shows "Voting Not Yet Open"',
            "Voting has not started for this meeting. Check with your building manager "
            "for the scheduled time.",
        ),
        (
            'A motion card shows "Motion Closed"',
            "That motion's individual voting window has ended. You cannot vote on it — "
            "it will not count against your unanswered total.",
        ),
    ]

    for key, detail in issues:
        story.append(Paragraph(key, S_ISSUE_KEY))
        story.append(Paragraph(detail, ps("IssueDetail", parent=S_BODY,
                                           leftIndent=8, spaceAfter=8,
                                           textColor=C_MUTED)))

    story.append(SP(1, 4*mm))

    # ── NEED HELP ──────────────────────────────────────────────────────────
    need_help_p = Paragraph(
        f"{b('Need help?')} Contact your building manager or strata management company "
        "if you experience any issues not covered in this guide.",
        ps("NeedHelp", fontName="SFPro", fontSize=9.5, leading=14, textColor=C_NAVY))
    story.append(CalloutBox(need_help_p, CONTENT_W))

    return story


# ---------------------------------------------------------------------------
# Assemble document
# ---------------------------------------------------------------------------
def main():
    doc = BaseDocTemplate(
        OUTPUT_PDF,
        pagesize=A4,
        leftMargin=MARGIN_LEFT,
        rightMargin=MARGIN_RIGHT,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
        title="AGM Online Voting — Voter Guide",
        author="TOCS",
    )

    frame = Frame(
        MARGIN_LEFT, MARGIN_BOTTOM,
        CONTENT_W, PAGE_H - MARGIN_TOP - MARGIN_BOTTOM,
        id="main",
        leftPadding=0, rightPadding=0,
        topPadding=0, bottomPadding=0,
    )

    # Cover page uses a bare template (no header rule / footer)
    cover_template = PageTemplate(id="cover", frames=[frame], onPage=on_first_page)
    body_template  = PageTemplate(id="body",  frames=[frame], onPage=on_page)
    doc.addPageTemplates([cover_template, body_template])

    story = build_story()
    # Switch to body template after the first page
    from reportlab.platypus import NextPageTemplate
    story.insert(1, NextPageTemplate("body"))

    doc.build(story)
    print(f"PDF written to: {OUTPUT_PDF}")


if __name__ == "__main__":
    main()
