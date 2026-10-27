"""Renders a menu and then degrades it the way a phone photo would, to test the image path."""
import pathlib
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1400, 1900
FONTS = r"C:/Windows/Fonts"


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(f"{FONTS}/{name}", size)


title = font("georgiab.ttf", 86)
heading = font("georgiab.ttf", 46)
item = font("georgia.ttf", 44)
note = font("georgiai.ttf", 32)

MENU = [
    ("heading", "MAINS"),
    ("item", "Classic Burger", "14.50", "6oz Irish beef, aged cheddar, brioche bun"),
    ("item", "Chicken Caesar Salad", "12.00", "Grilled chicken, baby gem, parmesan"),
    ("item", "Margherita Pizza", "11.50", "San Marzano tomato, buffalo mozzarella"),
    ("heading", "SIDES"),
    ("item", "House Fries", "4.50", None),
    ("item", "Garlic Bread", None, "Ask your server"),
    ("heading", "DRINKS"),
    ("item", "Craft Lager (pint)", "6.00", None),
    ("item", "Craft Lager (half)", "3.40", None),
]

page = Image.new("RGB", (W, H), (247, 243, 233))
draw = ImageDraw.Draw(page)

draw.text((W // 2, 150), "THE BRASS LANTERN", font=title, fill=(42, 36, 28), anchor="mm")
draw.text((W // 2, 225), "14 Quay Street, Galway", font=note, fill=(110, 98, 80), anchor="mm")
draw.line([(240, 285), (W - 240, 285)], fill=(150, 130, 95), width=3)

y = 380
for entry in MENU:
    if entry[0] == "heading":
        y += 30
        draw.text((W // 2, y), f"— {entry[1]} —", font=heading, fill=(120, 80, 40), anchor="mm")
        y += 90
        continue

    _, name, price, description = entry
    draw.text((170, y), name, font=item, fill=(32, 28, 22))
    if price:
        draw.text((W - 170, y), price, font=item, fill=(32, 28, 22), anchor="ra")
        name_end = 170 + draw.textlength(name, font=item) + 20
        price_start = W - 170 - draw.textlength(price, font=item) - 20
        dot_y = y + 34
        x = name_end
        while x < price_start:
            draw.ellipse([x, dot_y, x + 3, dot_y + 3], fill=(170, 155, 130))
            x += 16
    y += 58
    if description:
        draw.text((190, y), description, font=note, fill=(118, 104, 84))
        y += 46
    y += 34

draw.text((W // 2, H - 110), "All prices include VAT", font=note, fill=(118, 104, 84), anchor="mm")

# --- make it look photographed rather than printed ---
page = page.rotate(-1.6, resample=Image.BICUBIC, expand=True, fillcolor=(30, 28, 26))
page = page.filter(ImageFilter.GaussianBlur(0.9))

# Uneven light falling across the page, brighter top-left.
light = Image.linear_gradient("L").rotate(35, resample=Image.BICUBIC, expand=False).resize(page.size)
page = Image.composite(page, Image.blend(page, Image.new("RGB", page.size, (22, 20, 18)), 0.28), light)

page = page.resize((int(page.width * 0.78), int(page.height * 0.78)), Image.LANCZOS)

target = pathlib.Path(__file__).with_name("menu-photo.jpg")
page.save(target, "JPEG", quality=72)
print("wrote", target, target.stat().st_size, "bytes", page.size)
