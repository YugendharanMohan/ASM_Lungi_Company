from app.core.sheet_grid import Word, build_sheet

LOOMS = ["8", "9", "10", "11", "12", "13", "14"]
DATA = [
    ["04", "03",    "04",    "04",    "03.50", "02.50", "03"],
    ["17", "17.50", "18.50", "19.50", "16",    "18",    "17"],
    ["12.50", "17",  "18.50", "18.50", "08",   "19",    "18"],
    ["17", "17",    "17",    "18.50", "12",    "18",    "17"],
    ["17.50", "17", "18",    "18",    "17.50", "18",    "18"],
    ["17", "17",    "16",    "19",    "17",    "17",    "17"],
    ["17", "18",    "17",    "19",    "18",    "18",    "13"],
]
TOTALS = ["102", "106.50", "109", "116.50", "101", "110.50", "103"]

def make_words(noise=True, jitter=0.0):
    ws = []
    for col, loom in enumerate(LOOMS):
        ws.append(Word(loom, x=100 + col * 120, y=100))
    for row, line in enumerate(DATA):
        for col, val in enumerate(line):
            ws.append(Word(val, x=100 + col * 120 + jitter * (col % 3 - 1),
                           y=180 + row * 55, confidence=0.9))
    for col, tot in enumerate(TOTALS):
        ws.append(Word(tot, x=100 + col * 120, y=180 + 7 * 55))
    if noise:
        ws += [Word("August", x=60, y=40), Word("23", x=60, y=60),
               Word("2024", x=900, y=45), Word("748.50", x=300, y=900),
               Word("FRIDAY", x=950, y=70)]
    return ws

def report(title, sheet):
    print(f"\n=== {title} ===")
    print(f"  columns: {[c.loom_number for c in sheet.columns]}")
    for c in sheet.columns:
        ok = {True: "ok", False: "MISMATCH", None: "-"}[c.matches]
        print(f"    loom {c.loom_number:>2}  computed {c.computed_total:>7.2f}  "
              f"written {str(c.written_total):>7}  {ok}")
    print(f"  grand total {sheet.grand_total} (sheet says 748.50)")
    print(f"  flagged: {sheet.mismatched_looms or 'none'}")
    return sheet

s = report("with page noise", build_sheet(make_words(), 7))
assert [c.loom_number for c in s.columns] == LOOMS, "columns wrong"
assert s.columns[0].computed_total == 102.0
assert s.columns[0].matches is True

# Column 12 row 3 is the cell the photo has a handwritten "?" beside — the
# writer was unsure of it too, and my reading of it is 9 metres short of the
# written column total. The checksum must surface that rather than quietly
# accepting whatever was read.
assert "12" in s.mismatched_looms, "the ambiguous column was not flagged"
assert s.columns[0].matches is True, "a good column should not be flagged"

report("no noise", build_sheet(make_words(noise=False), 7))
report("columns drifting +-25px (crowded margins)", build_sheet(make_words(jitter=25), 7))

print("\n  all assertions passed")
