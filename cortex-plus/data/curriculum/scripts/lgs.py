# Parse 8. sınıf sections of MEB 2018/2019 programs (official PDFs, pdftotext -layout-free raw text).
import re, json, sys
R='/workspace/mufredat-data/raw/pdf/'
SPEC={
 'matematik':dict(f='329',pre=r'M\.\s?8',start='8. SINIF KAZANIM VE AÇIKLAMALARI'),
 'fen':dict(f='325',pre=r'F\.8',start=None),
 'turkce':dict(f='663',pre=r'T\.8',start='8. SINIF KAZANIM VE AÇIKLAMALARI',subheads=True),
 'inkilap':dict(f='355',pre=r'İTA\.8',start='KAZANIM VE AÇIKLAMALAR',units=r'^(\d)\.\s?ÜNİTE:\s*(.+)$'),
 'dkab':dict(f='318',pre=r'8',start=None),
}
NOISE=re.compile(r'^(\d+|.*Dersi Öğretim Programı|.*ÖĞRETİM PROGRAMI.*)$')
def tcap(s):
    s=s.strip().rstrip('.')
    if s.upper()!=s: return s
    w=[]
    for x in s.split():
        lo=x.replace('I','ı').replace('İ','i').lower()
        w.append(lo if lo in('ve','ile','veya','da','de') else lo[:1].replace('i','İ').upper()+lo[1:])
    return '/'.join(p[:1].replace('i','İ').upper()+p[1:] for p in ' '.join(w).split('/'))
def parse(key,sp):
    L=[l.rstrip() for l in open(R+sp['f']+'.raw.txt',encoding='utf-8')]
    i0=0
    if sp['start']:
        i0=max(i for i,l in enumerate(L) if l.strip()==sp['start'])
    cre=re.compile(r'^\s*('+sp['pre']+r'(?:\.\d+)+)\.\s*(\D.+)$')
    units={};topics={};outs=[];cur=None;unit_names={};subhead=None;mode=None
    first=None
    for i in range(i0,len(L)):
        s=L[i].strip()
        if not s or NOISE.match(s): continue
        if 'SINIF KAZANIM' in s and i>i0 and sp['start'] and s!=sp['start']: break
        if sp.get('units'):
            m=re.match(sp['units'],s)
            if m: unit_names[m.group(1)]=tcap(m.group(2)); cur=None; continue
        m=cre.match(s)
        if m:
            code=m.group(1).replace(' ','');txt=m.group(2).strip()
            parts=code.split('.')
            if first is None: first=parts
            if txt.startswith('.') or re.search(r'\.{5,}',txt): continue  # TOC
            depth=len(parts)
            leaf={'matematik':5,'fen':5,'turkce':4,'inkilap':4,'dkab':3}[key]
            if (depth==leaf-2 and key in('matematik','fen')) or (depth==leaf-1 and key in('turkce','dkab')):
                units[parts[-1]]=tcap(re.split(r'\s+/\s+',txt)[0]); subhead=None; cur=None; continue
            if depth==leaf-1 and key in('matematik','fen'):
                topics[code]=tcap(txt); cur=None; continue
            if depth!=leaf: continue
            cur=dict(code=code,text=txt,limitations=[],_open=not txt.endswith('.'),subhead=subhead)
            outs.append(cur); continue
        if cur is None:
            if sp.get('subheads') and len(s)<40 and not s.endswith('.') and ':' not in s and i+1<len(L) and cre.match(L[i+1].strip() or 'x'):
                subhead=s
            continue
        if cur['_open']:
            cur['text']+=' '+s; cur['_open']=not s.endswith('.'); continue
        if sp.get('subheads') and len(s)<40 and not s.endswith('.') and ':' not in s and i+1<len(L) and cre.match(L[i+1].strip() or 'x'):
            subhead=s; cur=None; continue
        if len(re.findall(r'[A-Za-zÇĞİÖŞÜçğıöşü]{3,}',s))<3 or re.search(r'[\ue000-\uf8ff●▬|\ufffd]',s.lstrip('\uf0b7\uf06e\uf0a7 ')): continue
        s=s.lstrip('\uf0b7\u2022\uf06e\uf0a7 ').strip()
        if re.match(r'^[a-zçğıöşü]\)\s',s) or not cur['limitations'] or cur['limitations'][-1].endswith(('.',':')):
            cur['limitations'].append(s)
        else: cur['limitations'][-1]+=' '+s
    # dedupe codes (keep first full occurrence)
    seen=set();res=[]
    for o in outs:
        if o['code'] in seen: continue
        seen.add(o['code']); o.pop('_open')
        p=o['code'].split('.')
        un=p[2] if key in('matematik','fen','turkce','inkilap') else p[1]
        if key=='inkilap': o['unit']=f"{un}. Ünite: {unit_names.get(un,'?')}"
        else: o['unit']=units.get(un,'?')
        if key in('matematik','fen'): o['topic']=topics.get('.'.join(p[:-1]),None)
        elif key=='turkce': o['topic']=(o['unit']+' · '+o['subhead']) if o['subhead'] else None
        else: o['topic']=None
        o.pop('subhead');res.append(o)
    return res
if __name__=='__main__':
    out={}
    for k,sp in SPEC.items():
        r=parse(k,sp); out[k]=r
        from collections import Counter
        print(k,len(r),Counter(o['unit'] for o in r).most_common(), len({o['topic'] for o in r}))
    json.dump(out,open('/workspace/mufredat-data/out/lgs_a.json','w'),ensure_ascii=False,indent=1)

def ingilizce():
    L=[l.strip() for l in open(R+'327.raw.txt',encoding='utf-8')]
    cre=re.compile(r'^(E8\.(\d+)\.[A-Z]+\d+)\.\s*(.+)$')
    names={};outs=[];cur=None;last=(None,None)
    for i,s in enumerate(L):
        if s=='Unit /' and L[i+1]=='Theme':
            j=i+2
            while not L[j]: j+=1
            num=L[j]; k=j+1
            while not L[k]: k+=1
            if num.isdigit(): last=(num,L[k])
            continue
        m=cre.match(s)
        if m:
            names.setdefault(m.group(2),last[1] if last[0]==m.group(2) else '?')
            cur=dict(code=m.group(1),text=m.group(3),limitations=[],unit=None,topic=None); outs.append(cur); continue
        if cur and not cur['text'].endswith('.') and s: cur['text']+=' '+s
        elif s=='' : pass
    # codes sharing a raw line with another column: read that column from the -layout text
    have={o['code'] for o in outs}
    LY=open(R+'327.txt',encoding='utf-8').read().split('\n')
    for i,l in enumerate(LY):
        for m in re.finditer(r'(E8\.(\d+)\.[A-Z]+\d+)\.\s*',l):
            if m.group(1) in have: continue
            c=m.start(); t=l[m.end():].split('   ')[0].strip(); j=i+1
            while not t.endswith('.') and j<i+6:
                t+=' '+LY[j][c:].strip().split('   ')[0].strip(); j+=1
            outs.append(dict(code=m.group(1),text=t.strip(),limitations=[],unit=None,topic=None)); have.add(m.group(1))
    outs.sort(key=lambda o:(int(o['code'].split('.')[1]),))
    for o in outs: n=o['code'].split('.')[1]; o['unit']=f"{n}. {names[n]}"
    return outs
if __name__=='__main__':
    last=None
    r=ingilizce(); out['ingilizce']=r
    from collections import Counter
    print('ingilizce',len(r),Counter(o['unit'] for o in r))
    json.dump(out,open('/workspace/mufredat-data/out/lgs_a.json','w'),ensure_ascii=False,indent=1)
