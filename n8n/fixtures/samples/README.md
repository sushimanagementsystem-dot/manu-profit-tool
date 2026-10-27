# Sample documents

Two generators that build the documents MP-01 was tested against. The documents themselves
are not committed — run a generator to rebuild one beside its script.

| Script | Builds | Why it is shaped this way |
|---|---|---|
| `make-invoice-pdf.py` | `sunrise-invoice.pdf` | A real PDF with no library, so the content stream is plain text. It carries a `6 x 2.5kg` case, a pack column reading `dozen`, a delivery charge that must **not** become an ingredient, and a printed total that does not equal its own lines. |
| `make-menu-photo.py` | `menu-photo.jpg` | A menu rendered and then degraded the way a phone photo is — tilted, soft, unevenly lit, JPEG at quality 72. It carries a dish with no price, two sizes of one drink, and section headings that must not become dishes. Needs Pillow. |

Both are deliberately awkward: each one encodes a mistake that was actually made, so rerunning
them catches it coming back. The invoice found a pack column being ignored (buns would have
costed 12× too high); the photo found that two sizes of one drink leave a POS line genuinely
ambiguous, which the analysis must surface rather than guess.
