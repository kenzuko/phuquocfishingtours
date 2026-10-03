from pathlib import Path

path = Path("worker.js")
text = path.read_text(encoding="utf-8")
old = 'if (/^\\/(?:trip\\/)?[A-Za-z0-9_-]{16,80}$/.test(url.pathname)) {'
new = 'if (/^\\/(?:trip\\/)?[A-Za-z0-9_-]{16,80}\\/?$/.test(url.pathname)) {'
if new not in text:
    if old not in text:
        raise SystemExit("customer tracking route marker missing")
    text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
print("Customer tracking route accepts optional trailing slash.")
