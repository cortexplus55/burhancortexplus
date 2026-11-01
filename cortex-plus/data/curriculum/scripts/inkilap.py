import pymupdf as fitz,re,json
d=fitz.open('/workspace/mufredat-data/raw/yks2026_kazanim.pdf')
def find(title):
    for i in range(len(d)):
        if title in d[i].get_text(): yield i
units=[];cur=None;o=None;allo=[];pend=[]
start=None
for i in range(95,115):
    t=d[i].get_text()
    if 'İNKILAP' in t.upper() and '1. ÜNİTE' in t: start=i;break
end=next(i for i in range(start+1,130) if re.search(r'^\s*COĞRAFYA',d[i].get_text(),re.M) or 'COĞRAFYA DERSİ' in d[i].get_text())
for i in range(start,end):
    rows=[]
    for b in d[i].get_text('dict')['blocks']:
        for l in b.get('lines',[]):
            t=''.join(s['text'] for s in l['spans']).strip()
            if t: rows.append((l['bbox'][1],l['bbox'][0],t,'Bold' in l['spans'][0]['font']))
    rows.sort()
    for y,x,t,bold in rows:
        if re.fullmatch(r'\d{1,3}',t): continue
        m=re.match(r'^(\d+)\.\s*ÜNİTE\s*:\s*(.+)$',t)
        if m: cur=dict(title=f"{m.group(1)}. Ünite: {m.group(2).strip()}",outcomes=[]);units.append(cur);o=None;continue
        if t in('KAZANIMLAR','AÇIKLAMALAR') or cur is None: continue
        if x<300:
            m=re.match(r'^(\d\.\d{1,2})\.\s*(.+)$',t)
            if m and m.group(1).split('.')[0]==cur['title'].split('.')[0]:
                o=dict(code=m.group(1),text=m.group(2),expl=[],pos=(i,y));cur['outcomes'].append(o);allo.append(o)
            elif o: o['text']+=' '+t
        else: pend.append((i,y,t))
items=[]
for (pi,y,t) in pend:
    if re.match(r'^[a-zçğış] ?\)',t) or not items or items[-1][0]!=pi or y-items[-1][3]>16: items.append([pi,y,[t],y])
    else: items[-1][2].append(t); items[-1][3]=y
for pi,y,ts,_ in items:
    c=[o for o in allo if o['pos']<=(pi,y+20)]
    if not c: continue
    tgt=c[-1]
    if len(c)>1 and not tgt['expl'] and re.match(r'^[b-zçğış] ?\)',ts[0]): tgt=c[-2]
    tgt['expl'].append(' '.join(ts))
for u in units:
    for o in u['outcomes']:
        o['text']=re.sub(r'\s+',' ',o['text']).strip()
        o.pop('pos');o['expl2']=o.pop('expl')
        o['limitations']=[re.sub(r'\s+',' ',x).strip() for x in o.pop('expl2')]
print(start,end,[(u['title'],len(u['outcomes'])) for u in units])
json.dump(units,open('/workspace/mufredat-data/out/inkilap.json','w'),ensure_ascii=False,indent=1)
