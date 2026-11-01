import re,json,collections
exec(open('/workspace/dec.py').read())
SECT={'mantik':(239,246),'sosyoloji':(247,257),'psikoloji':(258,271)}
def clean(t): return re.sub(r'\s+',' ',t.replace('=',' ')).strip()
res={}
for sec,(a,b) in SECT.items():
    units=[];cur=None;last=None;lost=0
    for i in range(a,b):
        L=page_lines(i)
        if not L: continue
        hi=[o for o in L if o['y1']>600]
        if not hi: continue
        ky=collections.Counter(round(o['y1']) for o in hi).most_common(1)[0][0]
        kcol=[o for o in L if abs(o['y1']-ky)<=4]
        kx=next((o['x'] for o in L if o['t'].startswith('KAZANIM')),0)
        heads=[o for o in L if o['bold'] and o['x']<kx-5 and 'KAZANIM' not in o['t'] and 'AÇIKLAMA' not in o['t'] and len(o['t'])>5 and not re.match(r'^\d{1,2}\.\s*[a-zçğıöşüA-ZÇĞİÖŞÜ][a-zçğıöşü]',o['t'])]
        acol=[o for o in L if o['y1']<600 and o['x']>kx+5 and abs(o['y1']-ky)>4]
        events=[]
        for h in heads: events.append((h['x'],0,'H',clean(h['t'])))
        for o in kcol:
            if o['x']<=kx+5: continue
            events.append((o['x'],1,'K',clean(o['t'])))
        ktxt=' '.join(clean(o['t']) for o in kcol).replace(' ','')
        acol=[o for o in acol if clean(o['t']).replace(' ','') not in ktxt]
        if acol:
            rmax=collections.defaultdict(float)
            for o in acol: rmax[round(o['x'])]=max(rmax[round(o['x'])],o['y1'])
            top=collections.Counter(round(v/4) for v in rmax.values()).most_common(1)[0][0]*4
            rows=collections.defaultdict(list)
            for o in acol:
                rows[round(o['x'])].append(o)
            merged=[]
            for x in sorted(rows):
                if merged and x-merged[-1][0]<=4: merged[-1][1].extend(rows[x])
                else: merged.append([x,list(rows[x])])
            for x,os_ in merged:
                cand=[o for o in os_ if o['y1']>=top-12 and '?' not in o['t'] and '~' not in o['t']]
                if not cand: lost+=1; continue
                best=max(cand,key=lambda o:len(o['t']))
                events.append((x,2,'A',clean(best['t'])))
        events.sort(key=lambda e:(round(e[0]),e[1]))
        for x,_,k,t in events:
            if k=='H':
                t=re.sub(r'^(?:ÜNİTE\s*\d+\s*:|\d+\.\s*ÜNİTE\s*:?|[IVX]+\.\s*ÜNİTE\s*:|\d+\.)\s*',lambda m:'',t).strip()
                cur=dict(title=f"{len(units)+1}. Ünite: {t}",outcomes=[]);units.append(cur);last=None;continue
            if k=='K':
                m=re.match(r'^(\d{1,2})\.\s*(\S.*)$',t)
                if m and cur is not None:
                    last=dict(code=m.group(1),text=m.group(2),acc=[]);cur['outcomes'].append(last)
                elif last: last['text']+=' '+t
            if k=='A' and last is not None: last['acc'].append(t)
    for u in units:
        for o in u['outcomes']:
            o['text']=clean(o['text'])
            items=[]
            for t in o.pop('acc'):
                if re.match(r'^(\[!\]|\*|[a-zçğış]\)|•)',t) or not items: items.append(t)
                else: items[-1]+=' '+t
            o['limitations']=[clean(re.sub(r'^(\[!\]\s*\.?|\*)\s*','',x)) for x in items]
    codes=[int(o['code']) for u in units for o in u['outcomes']]
    print(sec,len(codes),codes==list(range(1,len(codes)+1)),'lost_rows',lost,[(u['title'],len(u['outcomes'])) for u in units])
    res[sec]=units
json.dump(res,open('/workspace/mufredat-data/out/felsefe_grubu.json','w'),ensure_ascii=False,indent=1)
