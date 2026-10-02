"""Convert the master translation glossary (.docx) into src/i18n/glossary.json.
Usage: python3 scripts/glossary_to_json.py path/to/Glossary.docx
Every column after 'Where / meaning' is a language; its header names the language."""
import json, re, subprocess, sys
from bs4 import BeautifulSoup
LANGS = {"italiano":("it","Italiano"),"español":("es","Español"),"espanol":("es","Español"),"français":("fr","Français"),
         "francais":("fr","Français"),"deutsch":("de","Deutsch"),"português":("pt","Português"),"portugues":("pt","Português")}
html = subprocess.run(["pandoc", sys.argv[1], "-t", "html"], capture_output=True, text=True, check=True).stdout
soup = BeautifulSoup(html, "lxml")
langs, entries, seen = {}, [], set()
def add(en, tr):
    en = en.strip(); 
    if not en or en in seen: return
    seen.add(en); entries.append({"en": en, **tr})
for table in soup.find_all("table"):
    rows = [[c.get_text(" ", strip=True) for c in r.find_all(["th","td"])] for r in table.find_all("tr")]
    head, cols = rows[0], {}
    for i, h in enumerate(head[2:], start=2):
        key = re.split(r"[\s(]", h.strip().lower())[0]
        if key in LANGS: cols[i] = LANGS[key]; langs[LANGS[key][0]] = LANGS[key][1]
    for r in rows[1:]:
        if len(r) < 3: continue
        tr = {code: r[i].strip() for i,(code,_) in cols.items() if i < len(r) and r[i].strip()}
        if not tr: continue
        en_parts = [p.strip() for p in r[0].split(" / ")]
        split = len(en_parts) > 1 and all("(" not in v and len(v.split(" / ")) == len(en_parts) for v in tr.values())
        if split:
            for k, p in enumerate(en_parts): add(p, {c: v.split(" / ")[k].strip() for c, v in tr.items()})
        add(r[0], tr)
out = {"languages": [{"code":"en","label":"English"}] + [{"code":c,"label":l} for c,l in langs.items()], "entries": entries}
json.dump(out, open("src/i18n/glossary.json","w"), ensure_ascii=False, indent=1)
print(len(entries), "entries;", out["languages"])
