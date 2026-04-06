import os

with open("frontend/src/pages/Catalog.jsx", "r", encoding="utf-8") as f:
    text = f.read()

open_divs = text.count("<div")
close_divs = text.count("</div")
print(f"open: {open_divs}, close: {close_divs}")
