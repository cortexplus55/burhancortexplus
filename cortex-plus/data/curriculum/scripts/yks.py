import re,json,os,collections
D='/workspace/mufredat-data/raw/yks'
CODE=re.compile(r'^\s{0,12}((?:[A-Z]\.)?\d+\.(?:\s?\d+\.)*)\s+(\S.*)$')
LIM=re.compile(r'(girilmez|yer verilmez|değinilmez|ele alınmaz|dikkate alınmaz|sınırlı|kullanılmaz|verilmez|tutulur|sınırlandırılır|işlenmez)',re.I)
def gap_ends(l):
    """2+ boşluktan sonra metnin başladığı sütunlar (pdftotext -layout konumu)."""
    return [m.end() for m in re.finditer(r'(?:^|\S)( {2,})(?=\S)', l)] + ([len(l)-len(l.lstrip())] if l[:1]==' ' and l.strip() else [])
def column_of(page):
    """Sayfadaki iki sütunlu (kazanım | açıklama) tablonun sağ sütun başlangıcı; yoksa None.
    Sağ sütun: 30. karakterden sonra en sık görülen metin başlangıcı (±2), en az 4 satırda ve sayfada en az bir kazanım kodu satırı (açıklama hücresi kod satırıyla aynı hizada olmayabilir)."""
    hist=collections.Counter()
    for l in page:
        for e in set(gap_ends(l)):
            if e>=30: hist[e]+=1
    if not hist or not any(CODE.match(l) for l in page): return None
    # Birden çok blok farklı hizada olabilir: ±2 kümesinde en az 4 başlangıç olan tüm tepeler.
    peaks=[]
    for c in sorted(hist, key=lambda c: -sum(hist[c+d] for d in (-2,-1,0,1,2))):
        if sum(hist[c+d] for d in (-2,-1,0,1,2))<4: break
        if all(abs(c-q)>3 for q in peaks): peaks.append(c)
    return tuple(sorted(peaks)) or None
COL=None
def split(l):
    if COL is None:
        m=re.search(r'\S(\s{4,})\S',l)
        return (l[:m.start(1)+1].strip(), l[m.end(1)-1:].strip()) if m else (l.strip(),'')
    ind=len(l)-len(l.lstrip())
    if l.strip() and ind>=min(COL)-3: return ('', l.strip())
    for m in re.finditer(r'\S( {2,})(?=\S)', l):
        if any(abs(m.end()-c)<=3 for c in COL): return (l[:m.start(1)+1].strip(), l[m.end():].strip())
    # Sütunlar tek boşlukla bitişmişse (taşan satır): sağ sütun başına ±1 düşen boşluktan böl.
    if len(l)>min(COL)+3:
        for m in re.finditer(r'\S( )(?=\S)', l):
            if any(abs(m.end()-c)<=1 for c in COL): return (l[:m.start(1)+1].strip(), l[m.end():].strip())
    return (l.strip(),'')
res={}; TWO={}
for f in sorted(os.listdir(D)):
    sec=f[:-4]; pages=open(f'{D}/{f}',encoding='utf-8').read().split('\f')
    lines=[]
    for pg in pages:
        pl=pg.split('\n'); col=column_of(pl); lines+=[(col,l) for l in pl]
    TWO[sec]=sum(1 for pg in pages if column_of(pg.split('\n')) is not None)
    items=[]; grade=None; unit_label=None
    for COL,l in lines:
        g=re.search(r'\b(9|10|11|12)\.\s*SINIF',l)
        if g: grade=int(g.group(1))
        u=re.match(r'^\s*(\d+)\.\s*ÜNİTE\s*:?\s*(.+?)\s*$',split(l)[0])
        if u: unit_label=f"{u.group(1)}. Ünite: {u.group(2).title()}"; items.append(dict(kind='unit_label',label=unit_label,grade=grade)); continue
        left,right=split(l)
        if re.fullmatch(r'\d{1,3}',right): right=''   # sayfa numarası
        if re.fullmatch(r'\d{1,3}',left): left=''
        m=CODE.match(left)
        if m and not re.match(r'^\d+\.\d+\.?$',m.group(1).replace(' ','')) or (m and sec in()):
            code=m.group(1).replace(' ','').rstrip('.')
            items.append(dict(kind='code',code=code,left=[m.group(2)],right=[right] if right else [],grade=grade,unit_label=unit_label))
        elif m:
            code=m.group(1).replace(' ','').rstrip('.')
            items.append(dict(kind='code',code=code,left=[m.group(2)],right=[right] if right else [],grade=grade,unit_label=unit_label))
        elif items and items[-1]['kind']=='code':
            if left: items[-1]['left'].append(left)
            if right: items[-1]['right'].append(right)
    codes=[i for i in items if i['kind']=='code']
    allc=set(i['code'] for i in codes)
    # skip TOC-ish section numbers (3.2 etc) – headings that have no descendants AND belong to doc numbering (start with 3.)
    out=[]; heads={}
    for i in codes:
        c=i['code']
        is_head=any(o!=c and o.startswith(c+'.') for o in allc)
        if is_head:
            heads[c]=' '.join(i['left']).strip(); continue
        if re.match(r'^3\.\d',c) and not re.match(r'^\d{1,2}\.',c[2:]): continue
        # kazanım text: left until sentence end
        txt=[];rest=[]
        for k,x in enumerate(i['left']):
            if not rest and (not txt or not re.search(r'[.:]$',' '.join(txt))): txt.append(x)
            else: rest.append(x)
        expl=' '.join(rest+i['right']).strip()
        # Açıklama sütunu kazanımın sınırlama/açıklama alanına; a)/b) veya a./b. maddelerine bölünür.
        lims=[x.strip() for x in re.split(r'\s+(?=[a-zçğ]\)\s)',expl) if x.strip()] if expl else []
        gm=re.match(r'^(9|10|11|12)\.',c)
        out.append(dict(code=c,text=' '.join(txt).strip(),explanation=expl[:4000],limitations=lims,grade=int(gm.group(1)) if gm else i['grade'],unit_label=i['unit_label']))
    for o in out:
        parts=o['code'].split('.')
        o['unit_code']=next((p for p in ['.'.join(parts[:k]) for k in range(len(parts)-1,0,-1)] if p in heads),None)
        o['unit']=heads.get(o['unit_code']) or o['unit_label']
        # topic: nearest head deeper than unit
    res[sec]=dict(outcomes=out,heads=heads)
    print(sec,len(out),len(heads),collections.Counter(o['grade'] for o in out))
print('two-column pages',TWO)
json.dump(res,open('/workspace/mufredat-data/out/yks.json','w'),ensure_ascii=False,indent=1)
