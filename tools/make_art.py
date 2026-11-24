#!/usr/bin/env python3
"""Jewel Grove - all art drawn in code with PIL. No AI images, no downloads.
Original jewel theme: six faceted gems, each a distinct shape + colour so
tiles are readable by shape as well as colour, plus a golden star drop tile,
a gold ring for special tiles, and a grove background (sky, trees, grass).
Outputs PNGs into art/ (project root is the parent of tools/).
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(os.path.dirname(HERE), "art")
os.makedirs(ART, exist_ok=True)

rng = random.Random(20261122)

S = 128  # tile canvas


def save(img, name):
    p = os.path.join(ART, name)
    img.save(p, "PNG")
    print("wrote", p, img.size)


def circle(d, cx, cy, r, fill, outline=None, width=1):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill,
              outline=outline, width=width)


def rounded_tile(d, inset, fill, outline, width=5):
    d.rounded_rectangle([inset, inset, S - inset, S - inset], radius=22,
                        fill=fill, outline=outline, width=width)


def facet_gem(d, cx, cy, r, pts, light, mid, dark, outline):
    """A faceted gem: polygon with a darker lower half and a white glint."""
    d.polygon(pts, fill=mid, outline=outline, width=4)
    # top facet (lighter)
    top = [(cx, cy - r), (cx - r * 0.62, cy - r * 0.1),
           (cx + r * 0.62, cy - r * 0.1)]
    d.polygon(top, fill=light)
    # bottom facet (darker)
    bot = [(cx, cy + r), (cx - r * 0.62, cy - r * 0.1),
           (cx + r * 0.62, cy - r * 0.1)]
    d.polygon(bot, fill=dark)
    # table line + glint
    d.line([(cx - r * 0.62, cy - r * 0.1), (cx + r * 0.62, cy - r * 0.1)],
           fill=outline, width=3)
    d.polygon([(cx - 14, cy - 26), (cx - 2, cy - 26), (cx - 10, cy - 8),
               (cx - 20, cy - 8)], fill=(255, 255, 255, 220))


def diamond_pts(cx, cy, r):
    return [(cx, cy - r), (cx + r * 0.72, cy - r * 0.25), (cx + r * 0.45, cy + r),
            (cx - r * 0.45, cy + r), (cx - r * 0.72, cy - r * 0.25)]


def hexagon_pts(cx, cy, r):
    return [(cx + r * math.cos(-math.pi / 2 + k * math.pi / 3),
             cy + r * math.sin(-math.pi / 2 + k * math.pi / 3)) for k in range(6)]


def octagon_pts(cx, cy, r):
    return [(cx + r * math.cos(-math.pi / 2 + k * math.pi / 4),
             cy + r * math.sin(-math.pi / 2 + k * math.pi / 4)) for k in range(8)]


def round_pts(cx, cy, r):
    return [(cx + r * math.cos(a), cy + r * math.sin(a))
            for a in [i * math.pi / 12 for i in range(24)]]


def icon_ruby(d, cx, cy):
    facet_gem(d, cx, cy, 40, diamond_pts(cx, cy, 40),
              (255, 150, 160), (235, 60, 85), (170, 20, 50), (140, 10, 40))


def icon_sapphire(d, cx, cy):
    facet_gem(d, cx, cy, 40, hexagon_pts(cx, cy, 40),
              (120, 170, 255), (50, 110, 235), (25, 60, 170), (15, 40, 130))


def icon_emerald(d, cx, cy):
    facet_gem(d, cx, cy, 40, octagon_pts(cx, cy, 40),
              (120, 235, 150), (45, 190, 95), (15, 130, 60), (10, 100, 45))


def icon_topaz(d, cx, cy):
    facet_gem(d, cx, cy, 40, diamond_pts(cx, cy, 40),
              (255, 225, 130), (245, 180, 40), (200, 130, 10), (160, 100, 5))


def icon_amethyst(d, cx, cy):
    facet_gem(d, cx, cy, 40, hexagon_pts(cx, cy, 40),
              (205, 150, 255), (155, 85, 225), (105, 45, 170), (80, 30, 140))


def icon_pearl(d, cx, cy):
    pts = round_pts(cx, cy, 38)
    d.polygon(pts, fill=(250, 240, 245), outline=(190, 160, 180, 255))
    d.ellipse([cx - 38, cy - 38, cx + 10, cy + 10],
              fill=(255, 255, 255, 255))
    d.ellipse([cx - 12, cy - 20, cx + 20, cy + 12],
              fill=(255, 210, 225, 255))
    circle(d, cx - 16, cy - 16, 7, (255, 255, 255, 255))


def icon_star_tile(d, cx, cy):
    pts = []
    for k in range(10):
        r = 42 if k % 2 == 0 else 18
        a = -math.pi / 2 + k * math.pi / 5
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d.polygon(pts, fill=(255, 200, 60, 255), outline=(200, 130, 10, 255))
    circle(d, cx - 9, cy - 4, 3, (150, 100, 0, 255))
    circle(d, cx + 9, cy - 4, 3, (150, 100, 0, 255))
    d.arc([cx - 10, cy + 2, cx + 10, cy + 14], 15, 165,
          fill=(150, 100, 0, 255), width=3)
    # sparkles
    for (sx, sy, s) in [(-34, -30, 5), (34, -34, 4), (38, 22, 5), (-36, 26, 4)]:
        d.polygon([(cx + sx, cy + sy - s), (cx + sx + 2, cy + sy - 2),
                   (cx + sx + s, cy + sy), (cx + sx + 2, cy + sy + 2),
                   (cx + sx, cy + sy + s), (cx + sx - 2, cy + sy + 2),
                   (cx + sx - s, cy + sy), (cx + sx - 2, cy + sy - 2)],
                  fill=(255, 240, 180, 255))


TILES = [
    ("ruby", (255, 238, 240), (140, 10, 40), icon_ruby),
    ("sapphire", (235, 242, 255), (15, 40, 130), icon_sapphire),
    ("emerald", (232, 250, 235), (10, 100, 45), icon_emerald),
    ("topaz", (255, 246, 220), (160, 100, 5), icon_topaz),
    ("amethyst", (244, 236, 255), (80, 30, 140), icon_amethyst),
    ("pearl", (255, 250, 250), (150, 120, 135), icon_pearl),
]


def make_tile(name, tint, border, draw_icon):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([8, 12, S - 8, S - 4], radius=22,
                                         fill=(0, 0, 0, 70))
    sh = sh.filter(ImageFilter.GaussianBlur(4))
    img.alpha_composite(sh)
    d = ImageDraw.Draw(img)
    rounded_tile(d, 4, tint + (255,), border + (255,), 5)
    d.rounded_rectangle([12, 12, S - 12, S - 12], radius=17,
                        outline=(255, 255, 255, 160), width=2)
    draw_icon(d, S // 2, S // 2 + 2)
    save(img, f"tile_{name}.png")


for _n, _t, _b, _f in TILES:
    make_tile(_n, _t, _b, _f)

# Star drop tile: a golden star on a deep amber tile face.
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(sh).rounded_rectangle([8, 12, S - 8, S - 4], radius=22,
                                     fill=(0, 0, 0, 70))
sh = sh.filter(ImageFilter.GaussianBlur(4))
img.alpha_composite(sh)
d = ImageDraw.Draw(img)
rounded_tile(d, 4, (255, 232, 170, 255), (200, 130, 10, 255), 5)
icon_star_tile(d, S // 2, S // 2 + 2)
save(img, "tile_star.png")


def make_dot(name, size, color):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    circle(d, size // 2, size // 2, size // 2 - 1, color)
    save(img, name)


make_dot("particle.png", 32, (255, 255, 255, 255))


def make_star():
    S2 = 96
    img = Image.new("RGBA", (S2, S2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = S2 // 2
    pts = []
    for k in range(10):
        r = 42 if k % 2 == 0 else 18
        a = -math.pi / 2 + k * math.pi / 5
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d.polygon(pts, fill=(255, 200, 60, 255), outline=(220, 150, 20, 255))
    save(img, "star.png")


def make_lock():
    W2, H2 = 64, 80
    img = Image.new("RGBA", (W2, H2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([10, 34, 54, 72], radius=8,
                        fill=(90, 100, 120, 255), outline=(50, 60, 80, 255), width=3)
    d.arc([18, 10, 46, 44], 180, 360, fill=(50, 60, 80, 255), width=7)
    circle(d, 32, 50, 7, (255, 220, 90, 255))
    d.rectangle([29, 50, 35, 62], fill=(255, 220, 90, 255))
    save(img, "lock.png")


def make_ring():
    # Gold ring drawn behind special tiles (line-clearers and bombs).
    R = 128
    img = Image.new("RGBA", (R, R), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([6, 6, R - 6, R - 6], outline=(255, 200, 60, 255), width=9)
    d.ellipse([14, 14, R - 14, R - 14], outline=(255, 240, 170, 255), width=3)
    save(img, "ring.png")


make_star()
make_lock()
make_ring()


def make_bg():
    W, H = 1136, 640
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    # sky gradient: dawn blue -> soft lilac -> warm grove green
    for y in range(H):
        t = y / H
        if t < 0.5:
            a, b = (125, 190, 245), (215, 200, 245)
            col = tuple(int(a[i] + (b[i] - a[i]) * (t / 0.5)) for i in range(3))
        elif t < 0.68:
            a, b = (215, 200, 245), (170, 220, 160)
            col = tuple(int(a[i] + (b[i] - a[i]) * ((t - 0.5) / 0.18)) for i in range(3))
        else:
            col = (140, 200, 120)
        d.line([(0, y), (W, y)], fill=col)
    # sun
    circle(d, 1020, 82, 52, (255, 225, 120))
    circle(d, 1020, 82, 40, (255, 240, 170))
    # clouds
    for (x, y, s) in [(140, 78, 1.0), (430, 52, 0.7), (720, 88, 0.85),
                      (250, 148, 0.75), (880, 168, 0.6)]:
        for (dx, dy, r) in [(0, 0, 30), (30, 7, 23), (-30, 9, 21), (10, -12, 21)]:
            circle(d, int(x + dx * s), int(y + dy * s), int(r * s),
                   (255, 255, 255))
    # grove trees on the right side (behind the mission panel)
    for (tx, ty, s) in [(760, 300, 1.0), (900, 260, 1.25), (1050, 320, 0.9),
                        (820, 430, 0.8), (990, 460, 0.7)]:
        d.rectangle([int(tx - 8 * s), int(ty), int(tx + 8 * s), int(ty + 70 * s)],
                    fill=(120, 80, 40))
        circle(d, int(tx), int(ty - 20 * s), int(58 * s), (60, 160, 80))
        circle(d, int(tx - 34 * s), int(ty + 8 * s), int(40 * s), (75, 175, 95))
        circle(d, int(tx + 34 * s), int(ty + 8 * s), int(40 * s), (50, 145, 70))
    # distant hills left
    d.ellipse([-220, 340, 420, 560], fill=(135, 200, 130))
    # grass band
    d.rectangle([0, 470, W, H], fill=(100, 180, 95))
    d.rectangle([0, 470, W, 482], fill=(120, 200, 110))
    # wildflowers
    for _ in range(36):
        x = rng.randint(15, W - 15)
        y = rng.randint(495, H - 15)
        col = rng.choice([(255, 120, 160), (255, 210, 80), (255, 255, 255),
                          (200, 140, 240)])
        for k in range(5):
            a = k * (2 * math.pi / 5)
            px, py = x + int(6 * math.cos(a)), y + int(6 * math.sin(a))
            circle(d, px, py, 4, col)
        circle(d, x, y, 3, (255, 220, 60))
    save(img.convert("RGBA"), "background.png")


make_bg()
print("art done")
