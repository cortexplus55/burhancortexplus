# -*- coding: utf-8 -*-
"""Gomulu TrueType fontlu, metin katmanli PDF uretici (Identity-H).

Neden elle: ortamda reportlab/fpdf yok, LibreOffice HTML'i yukleyemiyor,
canvas'in PDF yuzeyi kapali. Identity-H seciliyor cunku glif ADI cozumlemesine
hic guvenmiyor: Unicode -> glif kimligini fontun cmap'inden kendimiz okuyup
iceri$e dogrudan yaziyoruz, ToUnicode ile de geri esliyoruz. Boylece hem ekranda
dogru harf cikiyor hem metin cikarma calisiyor.
"""
import struct, zlib, sys

FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

def parse_ttf(path):
    d = open(path, "rb").read()
    num = struct.unpack(">H", d[4:6])[0]
    tabs = {}
    for i in range(num):
        o = 12 + 16*i
        tag = d[o:o+4].decode("latin-1")
        off, ln = struct.unpack(">II", d[o+8:o+16])
        tabs[tag] = (off, ln)
    ho, _ = tabs["head"]
    upem = struct.unpack(">H", d[ho+18:ho+20])[0]
    hho, _ = tabs["hhea"]
    nhm = struct.unpack(">H", d[hho+34:hho+36])[0]
    hmo, _ = tabs["hmtx"]
    widths = [struct.unpack(">H", d[hmo+4*i:hmo+4*i+2])[0] for i in range(nhm)]
    # cmap format 4, (3,1)
    co, _ = tabs["cmap"]
    n = struct.unpack(">H", d[co+2:co+4])[0]
    sub = None
    for i in range(n):
        p = co + 4 + 8*i
        pid, eid, off = struct.unpack(">HHI", d[p:p+8])
        if (pid, eid) in ((3,1),(0,3),(3,10)): sub = co + off; break
    assert sub, "cmap (3,1) yok"
    segX2 = struct.unpack(">H", d[sub+6:sub+8])[0]
    seg = segX2//2
    base = sub + 14
    end   = [struct.unpack(">H", d[base+2*i:base+2*i+2])[0] for i in range(seg)]
    start = [struct.unpack(">H", d[base+segX2+2+2*i:base+segX2+4+2*i])[0] for i in range(seg)]
    delta = [struct.unpack(">h", d[base+2*segX2+2+2*i:base+2*segX2+4+2*i])[0] for i in range(seg)]
    rngOff= base+3*segX2+2
    rng   = [struct.unpack(">H", d[rngOff+2*i:rngOff+2*i+2])[0] for i in range(seg)]
    def gid(u):
        for i in range(seg):
            if start[i] <= u <= end[i]:
                if rng[i] == 0: return (u + delta[i]) & 0xFFFF
                p = rngOff + 2*i + rng[i] + 2*(u - start[i])
                g = struct.unpack(">H", d[p:p+2])[0]
                return (g + delta[i]) & 0xFFFF if g else 0
        return 0
    return d, upem, widths, gid

RAW, UPEM, HMTX, GID = parse_ttf(FONT)
def adv(g): return HMTX[g] if g < len(HMTX) else HMTX[-1]
def w1000(g): return round(adv(g) * 1000 / UPEM)

used = {}
def enc(s):
    out = []
    for ch in s:
        g = GID(ord(ch))
        if g == 0: g = GID(ord("?"))
        used[g] = ch
        out.append(g)
    return out

def textwidth(s, size):
    return sum(w1000(g) for g in enc(s)) * size / 1000

# ---- sayfa icerigi -------------------------------------------------------
LINES = []   # (metin, punto, ustten bosluk)
def add(t, size=11, gap=5.5): LINES.append((t, size, gap))

add("FOTOSENTEZ", 17, 0)
add("9. Sınıf Biyoloji — Ders Notu", 10, 3)
add("1. Fotosentez nedir?", 12.5, 16)
add("Fotosentez, bitkilerin güneş ışığını kullanarak karbondioksit ve sudan", 11, 7)
add("kendi besinini üretmesidir. Bu olay yapraklardaki kloroplastlarda geçer.")
add("2. Denklem", 12.5, 14)
add("6 CO2 + 6 H2O + ışık enerjisi -> C6H12O6 + 6 O2", 11, 7)
add("Yani altı karbondioksit ve altı su molekülünden bir glikoz ve altı")
add("oksijen molekülü oluşur.")
add("3. Klorofil", 12.5, 14)
add("Kloroplastlardaki yeşil pigment klorofildir. Klorofil ışığın en çok mavi", 11, 7)
add("ve kırmızı dalga boylarını soğurur, yeşili yansıtır. Yaprakların yeşil")
add("görünmesinin sebebi budur.")
add("4. Fotosentez hızını etkileyen etkenler", 12.5, 14)
add("• Işık şiddeti: belli bir noktaya kadar artırır, sonra sabitlenir.", 11, 7)
add("• Karbondioksit derişimi: artarsa hız artar.")
add("• Sıcaklık: enzimler çalıştığı için optimum sıcaklık vardır.")
add("• Su miktarı: azalırsa stomalar kapanır ve hız düşer.")
add("5. Neden önemli?", 12.5, 14)
add("Fotosentez atmosferdeki oksijenin kaynağıdır ve besin zincirinin ilk", 11, 7)
add("halkasını oluşturur. Bitkiler üretici, diğerleri tüketicidir.")

W, H, MARGIN = 595.28, 841.89, 56.7
parts = ["BT"]
y = H - MARGIN
first = True
for t, size, gap in LINES:
    y -= (gap + size * 1.05)
    hexs = "".join(f"{g:04X}" for g in enc(t))
    if first:
        parts.append(f"/F1 {size:g} Tf 1 0 0 1 {MARGIN:.2f} {y:.2f} Tm <{hexs}> Tj")
        first = False
    else:
        parts.append(f"/F1 {size:g} Tf 1 0 0 1 {MARGIN:.2f} {y:.2f} Tm <{hexs}> Tj")
parts.append("ET")
content = "\n".join(parts).encode("utf-8")

# ---- ToUnicode ----------------------------------------------------------
items = sorted(used.items())
tu = ["/CIDInit /ProcSet findresource begin","12 dict begin","begincmap",
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
      "/CMapName /Adobe-Identity-UCS def","/CMapType 2 def",
      "1 begincodespacerange","<0000> <FFFF>","endcodespacerange"]
for i in range(0, len(items), 100):
    chunk = items[i:i+100]
    tu.append(f"{len(chunk)} beginbfchar")
    for g, ch in chunk:
        tu.append(f"<{g:04X}> <{ord(ch):04X}>")
    tu.append("endbfchar")
tu += ["endcmap","CMapName currentdict /CMap defineresource pop","end","end"]
tounicode = "\n".join(tu).encode("utf-8")

# ---- W dizisi -----------------------------------------------------------
warr = " ".join(f"{g} [{w1000(g)}]" for g, _ in items)

objs = {}
objs[1] = b"<< /Type /Catalog /Pages 2 0 R >>"
objs[2] = b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>"
objs[3] = f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {W:.2f} {H:.2f}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>".encode()
comp = zlib.compress(content, 9)
objs[4] = b"<< /Length " + str(len(comp)).encode() + b" /Filter /FlateDecode >>\nstream\n" + comp + b"\nendstream"
objs[5] = b"<< /Type /Font /Subtype /Type0 /BaseFont /LiberationSans /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 8 0 R >>"
objs[6] = ("<< /Type /Font /Subtype /CIDFontType2 /BaseFont /LiberationSans "
  "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> "
  "/FontDescriptor 7 0 R /DW 556 /W [" + warr + "] /CIDToGIDMap /Identity >>").encode()
objs[7] = (b"<< /Type /FontDescriptor /FontName /LiberationSans /Flags 32 "
  b"/FontBBox [-203 -303 1050 910] /ItalicAngle 0 /Ascent 905 /Descent -212 "
  b"/CapHeight 716 /StemV 80 /FontFile2 9 0 R >>")
tuc = zlib.compress(tounicode, 9)
objs[8] = b"<< /Length " + str(len(tuc)).encode() + b" /Filter /FlateDecode >>\nstream\n" + tuc + b"\nendstream"
fc = zlib.compress(RAW, 9)
objs[9] = (b"<< /Length " + str(len(fc)).encode() + b" /Length1 " + str(len(RAW)).encode()
  + b" /Filter /FlateDecode >>\nstream\n" + fc + b"\nendstream")

out = bytearray(b"%PDF-1.4\n%\xc3\xa7\xc5\x9f\xc4\x9f\n")
offs = {}
for n in sorted(objs):
    offs[n] = len(out)
    out += f"{n} 0 obj\n".encode() + objs[n] + b"\nendobj\n"
xref = len(out)
out += f"xref\n0 {len(objs)+1}\n".encode() + b"0000000000 65535 f \n"
for n in sorted(objs):
    out += f"{offs[n]:010d} 00000 n \n".encode()
out += (f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n").encode()

open(sys.argv[1], "wb").write(bytes(out))
print(f"yazildi: {sys.argv[1]} · {len(out)} bayt · {len(items)} glif · 1 sayfa")
