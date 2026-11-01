import openpyxl,json,re,sys,glob,os
URLS={1:"dkab_orta3",2:"fen3_2",3:"ilkmat2",4:"turkce2",5:"sosyal2",6:"ingilizce_orta2",7:"edebiyat2",8:"matematik2",9:"fizik2",10:"kimya4",11:"biyoloji3_4",12:"cografya4",13:"tarih3",14:"felsefe3",15:"dkab_lise2",16:"ingilizce_lise2"}
CODE=re.compile(r'^\s*((?:[A-ZÇĞİÖŞÜ]{2,5} )?[A-ZÇĞİÖŞÜa-z.]{0,8}\d[A-Z0-9.]*\.?)\s+(.*)$',re.S)
def s(v): return "" if v is None else re.sub(r'\s+',' ',str(v)).strip()
out=[]
for i,name in URLS.items():
    wb=openpyxl.load_workbook(f"/workspace/mufredat-data/raw/ksdt_{i}.xlsx",data_only=True)
    for ws in wb.worksheets:
        rows=[[s(c) for c in r] for r in ws.iter_rows(values_only=True)]
        while rows and all((not r) or r[0]=="" for r in rows): rows=[r[1:] for r in rows]
        title=next((c for r in rows[:4] for c in r if c),"")
        m=re.match(r'\s*(\d+)\.?\s*SINIF\s*(.+?)\s*DERS',title.upper())
        if not m: print("SKIP",i,ws.title,title,file=sys.stderr); continue
        grade=int(m.group(1)); subj=m.group(2).strip()
        hi=next((k for k,r in enumerate(rows) if any(("Öğrenme Çıktı" in c or c.upper().startswith("KAZANIM")) for c in r)),None)
        if hi is None: print("NOHDR",i,ws.title,file=sys.stderr); continue
        h1=rows[hi]
        si=next((k for k in range(hi+1,hi+4) if any("Senaryo" in c or "Ülke Geneli" in c for c in rows[k])),hi+1)
        h2=rows[si]
        ocol=next(k for k,c in enumerate(h1) if ("Öğrenme Çıktı" in c or c.upper().startswith("KAZANIM")))
        topcol=next((k for k,c in enumerate(h1) if k<ocol and k>0 and (c.upper().startswith("KONU") or c.startswith("Alt "))),None)
        # exam groups
        groups={}; cur=None
        for k in range(ocol+1,len(h1)):
            if "1. Ortak" in h1[k]: cur="d1y1"
            elif "2. Ortak" in h1[k]: cur="d1y2"
            if cur and k<len(h2):
                sm=re.search(r'Senaryo\s*(\d)',h2[k])
                if sm: groups.setdefault(cur,{})[int(sm.group(1))]=k
                elif "Ülke Geneli" in h2[k]: groups.setdefault(cur+"_ulke",{})
        notes=[r[0] for r in rows[si+1:] if r and r[0] and len(r[0])>60]
        unit=topic=""; order=0
        for r in rows[si+1:]:
            if len(r)<=ocol: continue
            if r[0] and len(r[0])<80: unit=r[0]
            if topcol is not None and r[topcol]: topic=r[topcol]
            t=r[ocol]
            mm=CODE.match(t)
            if not t or not mm or '.' not in mm.group(1): continue
            order+=1
            q={}
            for g,cols in groups.items():
                if g.endswith("_ulke"): continue
                q[g]={str(n):int(float(r[c])) for n,c in cols.items() if c<len(r) and re.fullmatch(r'\d+(\.0)?',r[c] or "")}
            out.append(dict(file=name,url=f"https://cdn.eba.gov.tr/yardimcikaynaklar/2026/09/KSDT/{name}.xlsx",grade=grade,subject_raw=subj,unit=unit,topic=topic,code=mm.group(1).rstrip('.'),text=mm.group(2).strip(),order=order,quotas=q,scenarios={g:sorted(c) for g,c in groups.items()},ulke=[g for g in groups if g.endswith("_ulke")]))
json.dump(out,open("/workspace/mufredat-data/xlsx_rows.json","w"),ensure_ascii=False,indent=0)
from collections import Counter
c=Counter((o["file"],o["grade"]) for o in out)
for k,v in sorted(c.items()): print(k,v)
