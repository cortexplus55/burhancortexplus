import json,re,hashlib,os,csv,datetime,unicodedata
R='/workspace/mufredat-data/raw'; O='/workspace/mufredat-data/out'
FETCHED='2026-11-01T10:00:00+03:00'
def sha(p): return hashlib.sha256(open(p,'rb').read()).hexdigest()
urls={}
for l in open(R+'/pdf/urls.txt'):
    p=l.split(None,1)
    if len(p)==2: urls[p[0].strip()]=p[1].strip()
TYMM={'2340','2352','2334','2347','1903','2150','2153','1974','2270','2256','2254','2255','2250','2252','2271','2251','2253','1906'}
def src_pdf(pid): 
    return dict(id='meb_pid_'+pid,url=urls.get(pid),sha256=sha(f'{R}/pdf/{pid}.pdf'),program_version='maarif_2024' if pid in TYMM else 'meb_2018',publisher='MEB TTKB',title='Öğretim Programı PID '+pid)
CODE=re.compile(r'(?<![\w.])((?:[A-ZÇĞİÖŞÜ]{1,5}\s?)?[A-ZÇĞİÖŞÜa-z.]{0,8}?\d+(?:\.\s?[A-Z0-9]+)+\.?)')
LIMKW=re.compile(r'(girilmez|yer verilmez|değinilmez|ele alınmaz|dikkate alınmaz|sınırlı kalınır|ile sınırlı|kullanılmaz|verilmez|tutulur|sınırlandırılır)',re.I)
def norm(c): return re.sub(r'\s+','',c).rstrip('.')
def numkey(c):
    n=norm(c); m=re.search(r'\d.*',n); return (re.sub(r'[\d.]','',n[:m.start()]) if m else n, m.group(0) if m else '')
def index_text(path):
    lines=open(path,encoding='utf-8',errors='ignore').read().split('\n'); idx={}
    starts=[]
    for i,l in enumerate(lines):
        for m in re.finditer(CODE.pattern+r'(?=\s|$)',l):
            c=m.group(1)
            if '.' in c and re.search(r'\d\.\s?\d',c): starts.append((i,c,l[m.end():]))
    for k,(i,c,t) in enumerate(starts):
        end=starts[k+1][0] if k+1<len(starts) else min(i+30,len(lines))
        block=[x.strip() for x in lines[i+1:min(end,i+40)] if x.strip()]
        # continuation of text until a sentence-ish end
        text=t.strip(); j=0
        while not re.search(r'[.:!?)]$',text) and j<len(block) and j<4: text+=' '+block[j]; j+=1
        lims=[]
        for s in re.split(r'(?<=[.])\s+',' '.join(block[j:])):
            if LIMKW.search(s) and 10<len(s)<400: lims.append(s.strip())
        idx.setdefault(numkey(c),[]).append(dict(code=norm(c),text=text,limitations=lims))
    return idx
def good(m):
    t=m['text'].strip(); return len(t)>=8 and not (t.upper()==t and re.search(r'[A-ZÇĞİÖŞÜ]{6}',t))
import difflib
SIM=float(os.environ.get('SIM','0.3'))
def sim(a,b):
    f=lambda x: re.sub(r'[^a-zçğıöşü0-9 ]','',x.lower().replace('İ','i').replace('I','ı'))
    a,b=f(a),f(b); L=min(len(a),len(b),120)
    return difflib.SequenceMatcher(None,a[:L],b[:L]).ratio() if L else 0
def match(idx,code,grade=None,xtext=''):
    p,n=numkey(code); P=p.replace('İ','I')
    for exact in (True,False):
        for (pp,nn),v in idx.items():
            if nn!=n: continue
            Q=pp.replace('İ','I')
            ok=(Q==P) if exact else ((bool(P) and bool(Q) and (Q.startswith(P) or P.startswith(Q))) or ((not P or not Q) and grade is not None and n.startswith(str(grade)+'.')))
            if ok:
                gs=sorted([x for x in v if good(x) and (exact and Q==P and P or not xtext or sim(xtext,x['text'])>=SIM)],key=lambda x:-sim(xtext,x['text']))
                if gs: return gs[0]
    return None
# XLSX file -> grade -> candidate sources (data, not code branches)
FILEMAP=json.load(open('/workspace/mufredat-data/scripts/filemap.json'))
rows=json.load(open('/workspace/mufredat-data/xlsx_rows.json'))
cache={}
def getidx(s):
    if s not in cache:
        p=f'{R}/pdf/{s}.raw.txt' if not s.startswith('yks:') else f'{R}/yks/{s[4:]}.txt'
        cache[s]=index_text(p)
    return cache[s]
yks_src=dict(id='meb_yks_2026',url='https://ttkb.meb.gov.tr/meb_iys_dosyalar/2025_11/26164023_2026_yks.pdf',sha256=sha(R+'/yks2026_kazanim.pdf'),program_version='meb_yks_2026',publisher='MEB TTKB',title='2026 YKS Kazanım ve Açıklamaları')
sources={}; out=[]; rej=[]
groups={}
for r in rows: groups.setdefault((r['file'],r['grade']),[]).append(r)
for (f,g),rs in groups.items():
    cands=FILEMAP.get(f"{f}:{g}") or FILEMAP.get(f) or []
    best=None
    for c in cands:
        hits=[(r,match(getidx(c),r['code'],r['grade'],r['text'])) for r in rs]
        n=sum(sim(r['text'],m['text'])+0.01 for r,m in hits if m)
        if best is None or n>best[0]: best=(n,c,hits)
    n,c,hits=best
    s=yks_src if c.startswith('yks:') else src_pdf(c); sources[s['id']]=s
    for r,m in hits:
        if not (m and good(m)): rej.append({**r,'reason':'kod seçilen resmi program PDF’inde (%s) bulunamadı'%c,'tried':cands}); continue
        out.append({**r,'program_version':s['program_version'],'validated_source':s['id'],'matched_code':m['code'],'text_similarity':round(sim(r['text'],m['text']),2),'pdf_text':m['text'],'limitations':m['limitations']})
json.dump(dict(rows=out,rejected=rej,sources=sources),open(O+'/layerA.json','w'),ensure_ascii=False,indent=1)
from collections import Counter
print('ok',len(out),'rej',len(rej)); print(Counter((os.path.basename(x['file']),x['grade'],x['program_version']) for x in out))
for x in rej: print('REJ',os.path.basename(x['file']),x['grade'],x['code'],x['tried'])
