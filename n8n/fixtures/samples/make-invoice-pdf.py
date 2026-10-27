"""Writes a valid one-page PDF supplier invoice, with no library, to test MP-01 for real."""
import pathlib

LINES = [
    ("SUNRISE FOODS LTD", 16),
    ("Unit 7, Blanchardstown Industrial Estate, Dublin 15", 9),
    ("VAT Reg. No: IE9876543X   Tel: 01 824 7700", 9),
    ("", 9),
    ("INVOICE", 14),
    ("", 9),
    ("Invoice No:  SF-7741", 10),
    ("Invoice Date: 12/09/2026", 10),
    ("Deliver To:  The Brass Lantern, 14 Quay Street, Galway", 10),
    ("", 9),
    ("Code    Description                     Qty  Pack     Unit Pr     Net", 10),
    ("--------------------------------------------------------------------", 10),
    ("BM250   Beef Mince 6 x 2.5kg              2  case       45.00    90.00", 10),
    ("BUN12   Brioche Burger Buns              10  dozen       3.60    36.00", 10),
    ("CHD2K   Irish Cheddar 2kg                 3  2kg        16.00    48.00", 10),
    ("POT25   Rooster Potatoes 25kg             4  25kg       12.50    50.00", 10),
    ("LET01   Romaine Lettuce                  20  each        1.20    24.00", 10),
    ("TOM5K   Vine Tomatoes 5kg                 6  5kg         8.00    48.00", 10),
    ("DEL     Delivery Charge                   1                7.50     7.50", 10),
    ("--------------------------------------------------------------------", 10),
    ("                                       Goods Net            296.00", 10),
    ("                                       VAT @ 0%               0.00", 10),
    ("                                       TOTAL DUE            303.50", 10),
    ("", 9),
    ("Payment due 30 days from invoice date. E&OE.", 9),
]


def escape(text: str) -> str:
    return text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def content_stream() -> bytes:
    parts = ["BT"]
    y = 780
    for text, size in LINES:
        font = "F2" if size > 11 else "F1"
        parts.append(f"/{font} {size} Tf")
        parts.append(f"1 0 0 1 56 {y} Tm")
        if text:
            parts.append(f"({escape(text)}) Tj")
        y -= int(size * 1.55) + 4
    parts.append("ET")
    return "\n".join(parts).encode("latin-1")


def build() -> bytes:
    stream = content_stream()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"

    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_at}\n%%EOF\n"
    ).encode()
    return bytes(out)


target = pathlib.Path(__file__).with_name("sunrise-invoice.pdf")
target.write_bytes(build())
print("wrote", target, target.stat().st_size, "bytes")
