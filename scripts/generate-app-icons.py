"""
The app icon, the splash screens and the store icon of the Android app (2026-11-08), drawn from the lettering of the
lounge banner (android/store/saseok-lettering.png: "사석에서", transparent, the header's wordmark at full size).

    python scripts/generate-app-icons.py

Icon: "사석" in that lettering on the site's dark warm brown. Splash: "사석에서" on the same brown.
Needs Pillow and numpy.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
STORE = ROOT / 'android' / 'store'
BG_EDGE = np.array([26, 17, 13], dtype=np.float32)    # #1a110d, the site's background
BG_CENTER = np.array([58, 38, 26], dtype=np.float32)  # a warmer glow in the middle
IVORY = np.array([250, 240, 224], dtype=np.float32)

lettering = Image.open(STORE / 'saseok-lettering.png').convert('RGBA')
# lift the lettering's greyish gradient toward the header's cream, as the header wordmark does
pixels = np.asarray(lettering).astype(np.float32)
pixels[..., :3] = pixels[..., :3] * 0.4 + IVORY * 0.6
lettering = Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8), 'RGBA')


def trimmed(image: Image.Image) -> Image.Image:
    box = image.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
    return image.crop(box)


# "사석" is the first two syllables: up to the gap before "에" (columns measured on the lettering).
two = trimmed(lettering.crop((0, 0, 308, lettering.height)))
four = trimmed(lettering)


def background(width: int, height: int) -> Image.Image:
    y, x = np.mgrid[0:height, 0:width].astype(np.float32)
    distance = np.sqrt(((x - width / 2) / (width / 2)) ** 2 + ((y - height / 2) / (height / 2)) ** 2)
    mix = np.clip(distance / 1.25, 0, 1)[..., None]
    rgb = BG_CENTER * (1 - mix) + BG_EDGE * mix
    return Image.fromarray(rgb.astype(np.uint8), 'RGB').convert('RGBA')


def placed(art: Image.Image, width: int, height: int, art_width: float, dy: float = 0) -> Image.Image:
    """`art` scaled to `art_width` of the canvas width, centred (moved down by `dy` of the height)."""
    canvas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    w = round(width * art_width)
    h = round(art.height * w / art.width)
    scaled = art.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(scaled, ((width - w) // 2, (height - h) // 2 + round(height * dy)))
    return canvas


def rounded(image: Image.Image, radius: float) -> Image.Image:
    mask = Image.new('L', image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, image.width - 1, image.height - 1), round(image.width * radius), fill=255)
    out = Image.new('RGBA', image.size, (0, 0, 0, 0))
    out.paste(image, (0, 0), mask)
    return out


def circle(image: Image.Image) -> Image.Image:
    mask = Image.new('L', image.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, image.width - 1, image.height - 1), fill=255)
    out = Image.new('RGBA', image.size, (0, 0, 0, 0))
    out.paste(image, (0, 0), mask)
    return out


MASTER = 1024
# The adaptive icon's foreground: the launcher masks a 108dp square to its shape and keeps the middle 66dp safe, so
# the lettering takes about half the width.
foreground = placed(two, MASTER, MASTER, 0.5, dy=-0.01)
full = background(MASTER, MASTER)
full.alpha_composite(placed(two, MASTER, MASTER, 0.62, dy=-0.01))

densities = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for name, scale in densities.items():
    folder = RES / f'mipmap-{name}'
    adaptive = round(108 * scale)
    foreground.resize((adaptive, adaptive), Image.LANCZOS).save(folder / 'ic_launcher_foreground.png', optimize=True)
    background(adaptive, adaptive).convert('RGB').save(folder / 'ic_launcher_background.png', optimize=True)
    legacy = round(48 * scale)
    rounded(full.resize((legacy, legacy), Image.LANCZOS), 0.18).save(folder / 'ic_launcher.png', optimize=True)
    circle(full.resize((legacy, legacy), Image.LANCZOS)).save(folder / 'ic_launcher_round.png', optimize=True)

# Splash for Android 11 and older (12 and newer show the icon on windowSplashScreenBackground).
splash_sizes = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}
for name, (w, h) in splash_sizes.items():
    for orientation, (sw, sh) in (('port', (w, h)), ('land', (h, w))):
        art = background(sw, sh)
        art.alpha_composite(placed(four, sw, sh, 0.5 if orientation == 'port' else 0.3))
        art.convert('RGB').save(RES / f'drawable-{orientation}-{name}' / 'splash.png', optimize=True)
art = background(480, 320)
art.alpha_composite(placed(four, 480, 320, 0.45))
art.convert('RGB').save(RES / 'drawable' / 'splash.png', optimize=True)

# The Play Store listing icon: 512 x 512, square (Play rounds it).
full.resize((512, 512), Image.LANCZOS).convert('RGB').save(STORE / 'play-icon-512.png', optimize=True)
print('icons, splash screens and the store icon written')
