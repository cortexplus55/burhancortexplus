import re,json
L=open('/workspace/mufredat-data/raw/yks/tde.txt',encoding='utf-8').read().split('\n')
ti=next(i for i,l in enumerate(L) if 'ÜNİTE, SÜRE VE İÇERİK' in l)
K=L[:ti]; T=L[ti:]
inA=True;groups={};cur=None;o=None;ghead={}
for l in K:
    s=l.strip()
    if not s or re.fullmatch(r'\d{1,3}',s): continue
    g=re.match(r'^([1-4])\.\s+([A-ZÇĞİÖŞÜÂÎ].*)$',s)
    if s.startswith('B) YAZMA'): inA=False
    if inA and g and not re.match(r'^[A-C]\.',s) and s.isupper() or (g and '(' in s and s.split('(')[0].isupper()):
        cur='A.'+g.group(1); ghead[cur]=s; o=None; continue
    m=re.match(r'^([A-C])\.\s*(\d+)\.\s*(?:(\d+)\.)?\s*(.+)$',s)
    if m and m.group(1)=='A' and m.group(3):
        code=f"A.{m.group(2)}.{m.group(3)}"; o=dict(code=code,text=m.group(4),expl=[]); groups.setdefault(f"A.{m.group(2)}",[]).append(o); continue
    if m and m.group(1)!='A': o=None; continue  # B/C kazanımları ünitelere bağlanmaz
    if re.match(r'^[A-C]\)',s): o=None; continue
    if cur and ghead[cur].count('(')>ghead[cur].count(')'): ghead[cur]+=' '+s; continue
    if o is not None:
        if not o['expl'] and not re.search(r'[.]$',o['text']): o['text']+=' '+s
        else: o['expl'].append(s)
for k,v in groups.items():
    for o in v:
        ex=' '.join(o.pop('expl'))
        o['limitations']=[x.strip() for x in re.split(r'\s(?=[a-zçğ]\.\s)',ex) if x.strip()]
# genre lists from official headers
def trl(x): return x.replace('İ','i').replace('I','ı').lower()
G2=re.findall(r'\(([^()]*)\)',ghead['A.2'])[-1]
genre2=[trl(w.strip()) for w in re.split(r'[,/]',G2.replace('vb.','')) if w.strip()]
def genre(title):
    t=trl(title)
    if 'şiir' in t: return 'A.1'
    if any(w in t for w in genre2): return 'A.2'
    if 'tiyatro' in t: return 'A.3'
    if 'giriş' in t: return None
    return 'A.4'
units=[];grade=None
for l in T:
    g=re.match(r'^\s*(9|10|11|12)\.\s*SINIF',l)
    if g: grade=int(g.group(1)); continue
    u=re.match(r'^\s*(\d+)\.\s*ÜNİTE\s*:\s*(.+?)(?:\s{3,}.*)?$',l)
    if u and grade:
        title=re.sub(r'\s*/\s*','/',re.sub(r'E -POSTA','E-POSTA',u.group(2).strip()))
        units.append(dict(grade=grade,no=int(u.group(1)),title=title,genre=genre(title)))
print(ghead); print(genre2)
for u in units: print(u)
print({k:len(v) for k,v in groups.items()})
json.dump(dict(groups=groups,heads=ghead,units=units),open('/workspace/mufredat-data/out/tde.json','w'),ensure_ascii=False,indent=1)
