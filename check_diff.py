import re

with open("frontend/src/pages/Admin.jsx", "r") as f:
    text = f.read()

def check_brackets(s):
    stack = []
    lines = s.split('\n')
    for i, line in enumerate(lines):
        # Very naive tag finding
        tags = re.findall(r'<\/?([A-Za-z0-9]+)[^>]*>', line)
        for t in tags:
            # wait, this is too hard to parse JSX with regex exactly, we skip self-closing.
            pass

# Let's instead write a tiny node script to parse it or just print lines 2190 to 2270
with open("frontend/src/pages/Admin.jsx", "r") as f:
    lines = f.readlines()
    for j in range(2190, 2270):
        print(f"{j+1}: {lines[j].rstrip()}")
