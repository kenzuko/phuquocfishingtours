from pathlib import Path

path = Path("worker.js")
text = path.read_text(encoding="utf-8")
old = 'const tripPage = new URL("/trip.html",request.url);'
new = 'const tripPage = new URL("/trip",request.url);'
if new not in text:
    if old not in text:
        raise SystemExit("trip asset marker missing")
    text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
print("Customer tracking page now uses the clean Pages asset path.")
