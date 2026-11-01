"""PDF satır birleşmesinden kalan yapışık metni düzelten genel normalleştirici (tüm ayrıştırıcılar için)."""
import re
L = 'a-zçğıöşüâîû'
U = 'A-ZÇĞİÖŞÜÂÎÛ'
# "yansıtabilmea) Bölme": küçük harfe yapışık alt madde imi (a)–h)), ardından büyük harfle başlayan madde.
_MARK = re.compile(rf'(?<=[{L}])([a-hçğ]\))(?=\s+[{U}])')
# "kelimeSonraki": en az 3 küçük harfin ardından Büyük+küçük harfle başlayan söz. pH, NaCl, mmHg, McDonald, eTwinning dokunulmaz.
_CAMEL = re.compile(rf'(?:(?<=\s)|(?<=^)|(?<=[("“‘]))([{L}]*[{L}]{{3}})(?=[{U}][{L}])')


def _inside_paren(text: str, at: int) -> bool:
    pre = text[:at]
    return pre.rfind('(') > pre.rfind(')')


def normalize_text(text: str) -> str:
    if not text:
        return text
    out = []
    last = 0
    for m in _MARK.finditer(text):
        if _inside_paren(text, m.start()):
            continue
        out.append(text[last:m.start()] + ' ')
        last = m.start()
    out.append(text[last:])
    text = ''.join(out)
    text = _CAMEL.sub(lambda m: m.group(1) + ' ', text)
    return re.sub(r'[ \t]{2,}', ' ', text)


def tr_title(t: str) -> str:
    """Resmî BÜYÜK HARF ünite adını Türkçe başlık biçimine çevirir; 2 harfli kısaltmalar (MÖ, MS) korunur."""
    small = {'ve', 'ile', 'ya', 'da', 'de', 'veya', 'ki'}
    def low(w): return w.replace('I', 'ı').replace('İ', 'i').lower()
    def cap(w): return w[:1].replace('i', 'İ').replace('ı', 'I').upper() + w[1:]
    words = []
    for k, w in enumerate(t.split()):
        parts = []
        for p in w.split('-'):
            if len(p) == 2 and p.isalpha() and p.isupper() and low(p) not in small:
                parts.append(p)
            elif k > 0 and low(p) in small:
                parts.append(low(p))
            else:
                parts.append(cap(low(p)))
        words.append('-'.join(parts))
    return ' '.join(words)


def unit_table(txt: str) -> dict:
    """Resmî öğretim programı metnindeki 'ÜNİTE n: AD' başlıklarını, ardından gelen ilk kazanım kodunun sınıfıyla eşler.
    Dönen: {'10.1': 'Felsefeyi Tanıma', ...}. Sınıf/ünite numarası koddan doğrulanır."""
    lines = txt.split('\n')
    table = {}
    for i, l in enumerate(lines):
        m = re.match(r'\s*ÜNİTE\s+(\d+)\s*:\s*(\S.*?)\s*$', l)
        if not m:
            continue
        n, title = m.group(1), m.group(2)
        for nx in lines[i + 1:i + 40]:
            c = re.match(r'\s*(\d{1,2})\.(\d+)\.\d+\.', nx)
            if c:
                if c.group(2) == n:
                    table.setdefault(f'{c.group(1)}.{n}', tr_title(title))
                break
    return table
