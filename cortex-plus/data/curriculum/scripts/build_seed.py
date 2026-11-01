import json,re,hashlib,csv,os,collections
D='/workspace/mufredat-data'; R=D+'/raw'
FETCHED='2026-11-01T10:00:00+03:00'
COG_AREAS={'1':'Doğal Sistemler','2':'Beşerî Sistemler','3':'Küresel Ortam: Bölgeler ve Ülkeler','4':'Çevre ve Toplum'}
def sha(p): return hashlib.sha256(open(p,'rb').read()).hexdigest()
A=json.load(open(D+'/out/layerA.json'))
Y=json.load(open(D+'/out/yks.json'))
def post(t):
    t=re.sub(r'\s+\d+$','',t)
    t=' '.join((w.replace('ı','I').replace('i','I').upper() if re.fullmatch(r'[IıiVvXx]{2,5}\.?|[IVX]\.?',w) else w) for w in t.split(' '))
    t=re.sub(r'’İ','’i',t)
    return re.sub(r'\((\w)',lambda m:'('+m.group(1).replace('i','İ').upper(),t)
def tcap0(t):
    small={'ve','ile','ya','da','de','veya','ki'}
    ws=t.replace('I','ı').replace('İ','i').lower().split(' ')
    cap=lambda w:'/'.join((p[:1].replace('i','İ').replace('ı','I').upper()+p[1:]) for p in w.split('/'))
    return ' '.join(cap(w) if (k==0 or w not in small) else w for k,w in enumerate(ws))
def fixcase(t):
    # Python .title() Türkçe büyük harfi bozar: 'TARİH'->'Tari̇h', 'OSMANLI'->'Osmanli'. İ kaynaklı i birleşik nokta taşır.
    out=[]
    for w in t.split(' '):
        r=''; i=0
        while i<len(w):
            c=w[i]
            if c=='i' and i>0:
                if i+1<len(w) and w[i+1]=='\u0307': r+='i'; i+=2; continue
                r+='ı'
            elif c=='\u0307': pass
            else: r+=c
            i+=1
        out.append(r.lower() if r.lower() in ('ve','ile','ya','da','de') and out else r)
    return ' '.join(out); Y=json.load(open(D+'/out/yks.json'))
SUBJ={'İNGİLİZCE':('ingilizce','İngilizce'),'TÜRKÇE':('turkce','Türkçe'),'MATEMATİK':('matematik','Matematik'),
'DİN KÜLTÜRÜ VE AHLAK BİLGİSİ':('dkab','Din Kültürü ve Ahlak Bilgisi'),'FEN BİLİMLERİ':('fen','Fen Bilimleri'),
'TÜRK DİLİ VE EDEBİYATI':('tde','Türk Dili ve Edebiyatı'),'FİZİK':('fizik','Fizik'),'KİMYA':('kimya','Kimya'),
'COĞRAFYA':('cografya','Coğrafya'),'BİYOLOJİ':('biyoloji','Biyoloji'),'SOSYAL BİLGİLER':('sosyal','Sosyal Bilgiler'),
'TARİH':('tarih','Tarih'),'T.C. İNKILAP TARİHİ VE ATATÜRKÇÜLÜK':('inkilap','T.C. İnkılap Tarihi ve Atatürkçülük'),
'T.C. INKİLAP TARİHİ VE ATATÜRKÇÜLÜK':('inkilap','T.C. İnkılap Tarihi ve Atatürkçülük'),'FELSEFE':('felsefe','Felsefe')}
BADGE={'maarif_2024':'Türkiye Yüzyılı Maarif Modeli','meb_2018':'MEB önceki program','meb_yks_2026':'MEB önceki program · YKS 2026 belgesiyle doğrulandı'}
sources={}
for k,s in A['sources'].items(): sources[k]=dict(s,fetched_at=FETCHED)
# xlsx sources
xl={}
for i in range(1,17):
    pass
ksdt_page='https://odsgm.meb.gov.tr/www/1donem-konu-soru-dagilim-tablolari-2026-2027/icerik/1724/tr'
# map xlsx url -> local file by name if exists
import glob
local={}
URLS={1:'dkab_orta3',2:'fen3_2',3:'ilkmat2',4:'turkce2',5:'sosyal2',6:'ingilizce_orta2',7:'edebiyat2',8:'matematik2',9:'fizik2',10:'kimya4',11:'biyoloji3_4',12:'cografya4',13:'tarih3',14:'felsefe3',15:'dkab_lise2',16:'ingilizce_lise2'}
for i,n in URLS.items(): local[n+'.xlsx']=R+f'/ksdt_{i}.xlsx'
xlsx_sha={}
for r in A['rows']:
    u=r['url']; n=u.rsplit('/',1)[1]
    if u not in xlsx_sha:
        p=local.get(n)
        xlsx_sha[u]=sha(p) if p else None
missing=[u for u,v in xlsx_sha.items() if v is None]
# fallback: ksdt_N.xlsx files in raw named by index; hash by matching content via parse? record
for u in list(xlsx_sha):
    sid='odsgm_ksdt_'+u.rsplit('/',1)[1].replace('.xlsx','')
    sources[sid]=dict(id=sid,url=u,sha256=xlsx_sha[u],program_version='ksdt_2026_2027_d1',publisher='MEB ÖDSGM',title='1. Dönem Konu-Soru Dağılım Tablosu ('+u.rsplit('/',1)[1]+')',page=ksdt_page,fetched_at=FETCHED)
programs=collections.OrderedDict()
for r in A['rows']:
    key,name=SUBJ[r['subject_raw']]
    if r['file'].startswith('sosyal') and r['grade']==8: key,name='inkilap','T.C. İnkılap Tarihi ve Atatürkçülük'
    g=r['grade']; pid=f'meb-{g}-{key}'
    vs=r['validated_source']; pv=r['program_version']
    if vs=='meb_yks_2026': pv='meb_yks_2026'
    p=programs.setdefault(pid,dict(id=pid,kind='okul',grade=g,subjectKey=key,subject=name,label=f'{g}. Sınıf {name}',
        programVersion=pv,badge=BADGE[pv],scope='1. dönem ortak yazılı kapsamı (2026-2027)',
        sourceIds=[],units=[],exams={}))
    xsid='odsgm_ksdt_'+r['url'].rsplit('/',1)[1].replace('.xlsx','')
    for s in (vs,xsid):
        if s not in p['sourceIds']: p['sourceIds'].append(s)
    unit=(r['unit'] or '').strip() or 'Ünite'
    u=next((x for x in p['units'] if x['title']==unit),None)
    if not u: u=dict(title=unit,outcomes=[]); p['units'].append(u)
    lim=r['limitations'] or []
    u['outcomes'].append(dict(code=r['code'],text=r['text'],topic=r['topic'],limitations=lim,
        quotas=r['quotas'],sourceId=vs,xlsxSourceId=xsid,similarity=round(r['text_similarity'],3)))
    for ek,sc in r['scenarios'].items():
        if ek.endswith('_ulke'): continue
        e=p['exams'].setdefault(ek,dict(scenarios=sorted(set(sc)),national=False))
        e['scenarios']=sorted(set(e['scenarios'])|set(sc))
    for f in r['ulke']:
        ek=f.replace('_ulke',''); p['exams'].setdefault(ek,dict(scenarios=[],national=True))['national']=True
# YKS
yks_src='meb_yks_2026'
YNAME={'biyoloji':'Biyoloji','cografya':'Coğrafya','dkab':'Din Kültürü ve Ahlak Bilgisi','felsefe':'Felsefe','fizik':'Fizik','kimya':'Kimya','matematik':'Matematik','tarih':'Tarih'}
excluded=[]
for sec,name in YNAME.items():
    outs=[];seen=set();drop=0
    heads=Y[sec]['heads']
    for o in Y[sec]['outcomes']:
        code,text=o['code'],o['text'].strip()
        m=re.search(r'(\d{1,2}\.\d+\.\d+\.\d+)\s+(.+)$',text)
        if 'Anahtar Kavramlar' in text and m: code,text=m.group(1),m.group(2)
        parts=code.split('.')
        if sec=='felsefe' and len(parts)==4 and int(parts[3])>=10 and text.startswith('yüzyıl'):
            text=parts[3]+'. '+text; code='.'.join(parts[:3]); parts=parts[:3]
        if not parts[0].isdigit() or int(parts[0]) not in (9,10,11,12) or len(parts)<3 or 'Anahtar Kavramlar' in text or len(text)<8:
            drop+=1; continue
        if code in seen: drop+=1; continue
        seen.add(code)
        g=int(parts[0]); uc='.'.join(parts[:2])
        unit=(heads.get(uc) or o.get('unit') or uc)
        unit=re.split(r'\s*(?:Anahtar [Kk]avramlar|Ünite Açıklaması)',unit)[0].strip()[:120]
        if 'ÖĞRETİM PROGRAMI' in unit: unit=name
        elif unit.isupper(): unit=post(tcap0(unit))
        lim=[l.strip() for l in (o.get('limitations') or []) if l and l.strip()]
        if sec=='tarih': unit=re.sub(r'^(\d+)\. Ün\S+: ',r'\1. ',post(fixcase(unit)))
        outs.append(dict(code=code,text=text,grade=g,unitCode=uc,unit=unit,limitations=lim))
    if sec=='cografya':
        # PDF yan sütunundaki öğrenme alanı başlıkları bazı kazanım satırlarını bozuyor; eksik kodları resmî metinden geri al
        _L=open(R+'/yksk.txt').read().split('\n'); _a=next(i for i,l in enumerate(_L) if 'COĞRAFYA DERSİ (9, 10, 11 VE 12' in l)
        _L=_L[_a:_a+450]; have={o['code'] for o in outs}; rec=0
        for i,l in enumerate(_L):
            for m in re.finditer(r'(?<![\d.])((?:9|10|11|12)\.[1-4]\.\d{1,2})\.\s*(\S.*)',l):
                c=m.group(1)
                if c in have: continue
                t=re.split(r'\s{3,}',m.group(2).strip())[0]; j=i+1
                while not t.endswith('.') and j<len(_L) and _L[j].strip():
                    nx=re.sub(r'^\s*(?:[A-ZÇĞİÖŞÜÎ:]+\s+)+(?=\S)','',_L[j]).strip()
                    if re.match(r'(?:[a-zç]\)|\d+\.\d)',nx): break
                    t+=' '+nx; j+=1
                g=int(c.split('.')[0]); have.add(c); rec+=1
                outs.append(dict(code=c,text=t,grade=g,unitCode='.'.join(c.split('.')[:2]),unit=name,limitations=[]))
        _H=r'\s*\b(?:DOĞAL SİSTEMLER|BEŞER[ÎİI] SİSTEMLER|KÜRESEL ORTAM ?:? BÖLGELER VE ÜLKELER|ÇEVRE VE TOPLUM|SİSTEMLER|TOPLUM)\b'
        for o in outs:
            cl=[]
            for l in o['limitations']:
                l=re.split(r'\s+(?:\d{2,3}\s+)?(?:\S+\s+){0,12}?(?:9|10|11|12)\.[1-4]\.\d{1,2}\.',l)[0]
                l=re.sub(_H,' ',l); l=re.sub(r'\s+\d{2,3}$','',re.sub(r'\s{2,}',' ',l)).strip()
                l=' '.join(w for w in l.split() if w not in ('KÜRESEL','ORTAM:','ORTAM','BÖLGELER','VE','ÜLKELER','ÇEVRE','TOPLUM','DOĞAL','SİSTEMLER'))
                if l and not re.match(r'(?:9|10|11|12)\.[1-4]\.\d{1,2}\.',l): cl.append(l)
            o['limitations']=cl
        outs.sort(key=lambda o:tuple(int(x) for x in o['code'].split('.')))
        excluded.append(dict(source=yks_src,section=sec,reason=f'{rec} kazanım yan sütun başlığı nedeniyle tablo dışında kaldı; resmî metinden geri alındı'))
    if drop: excluded.append(dict(source=yks_src,section=sec,reason=f'{drop} satır başlık/bozuk kod/tekrar olarak elendi'))
    pid=f'yks-2026-{sec}'
    p=dict(id=pid,kind='yks',grade=None,subjectKey=sec,subject=name,label=f'YKS {name} (9–12)',programVersion='meb_yks_2026',
        badge='ÖSYM 2026 YKS’ye esas kazanımlar (MEB)',scope='9–12. sınıf YKS kazanımları; 2027 sürümü henüz yayımlanmadı',sourceIds=[yks_src],units=[],exams={})
    for o in outs:
        unit=o['unit']
        # Coğrafya PDF'inde ünite sütunu yalnız öğrenme alanı adıdır (yksk.txt ~3540-3950, 9-12. sınıf tabloları);
        # kodun 2. hanesi öğrenme alanını verir: x.1 DOĞAL SİSTEMLER, x.2 BEŞERÎ SİSTEMLER, x.3 KÜRESEL ORTAM: BÖLGELER VE ÜLKELER, x.4 ÇEVRE VE TOPLUM
        if sec=='cografya' and unit==name:
            unit=COG_AREAS[o['code'].split('.')[1]]
        title=f"{o['grade']}. Sınıf · {unit}"
        u=next((x for x in p['units'] if x['title']==title),None)
        if not u: u=dict(title=title,outcomes=[]); p['units'].append(u)
        u['outcomes'].append(dict(code=o['code'],text=o['text'],topic=None,grade=o['grade'],limitations=o['limitations'],quotas={},sourceId=yks_src))
    programs[pid]=p
exec(open(D+'/scripts/seed_extra.py').read())
for r in A['rejected']:
    excluded.append(dict(source='odsgm_ksdt',section=f"{r.get('file')}:{r.get('grade')}",code=r.get('code'),reason='Kod öğretim programı PDF’inde doğrulanamadı'))
# sources: ÖSYM etc
def add(sid,url,path,pub,title,pv):
    sources[sid]=dict(id=sid,url=url,sha256=sha(path),program_version=pv,publisher=pub,title=title,fetched_at=FETCHED)
add('meb_lgs_2026','https://www.meb.gov.tr/meb_iys_dosyalar/2026_04/03170012_LGS_Basvuru_ve_Uygulama_Kilavuzu_2026_.pdf',R+'/lgs2026.pdf','MEB ÖDSGM','2026 LGS Başvuru ve Uygulama Kılavuzu','lgs_2026')
add('osym_yks_2026','https://dokuman.osym.gov.tr/pdfdokuman/2026/YKS/basvuru_kilavuz06022026.pdf',R+'/yks2026_kilavuz.pdf','ÖSYM','2026 YKS Kılavuzu','yks_2026')
add('osym_takvim_2027','https://dokuman.osym.gov.tr/web/2026/10/osym-2027-yili-sinav-takvimi-7d09wi-28090734.pdf',R+'/osym2027.pdf','ÖSYM','ÖSYM 2027 Yılı Sınav Takvimi','takvim_2027')
add('meb_bulten_2026','https://yegitek.meb.gov.tr/meb_iys_dosyalar/2026_10/6ac38d2960bc7272781422_eyl%C3%BCle-b%C3%BClten-son.pdf',R+'/meb_bulten.pdf','MEB','2026-2027 Eğitim Öğretim Yılı Çalışma Takvimi','takvim_2026_2027')
ou={l.split()[0]:l.split()[1] for l in open(R+'/osym/urls.txt') if l.strip()}
ou['ales']='https://dokuman.osym.gov.tr/web/2026/10/basvuru-kilavuzu-pijez5-06105839.pdf'
for n,t in [('ales','2026 ALES Kılavuzu'),('dgs','2026 DGS Kılavuzu'),('kpss','2026 KPSS Lisans Kılavuzu'),('tus','2026 TUS 2. Dönem Kılavuzu'),('dus','2026 DUS 2. Dönem Kılavuzu'),('yds','2026 YDS/2 Kılavuzu')]:
    add('osym_'+n+'_2026',ou[n],R+f'/osym/{n}.pdf','ÖSYM',t,n+'_2026')
for y,i in [(2028,185),(2029,186),(2030,187)]:
    sources[f'diyanet_{y}']=dict(id=f'diyanet_{y}',url=f'https://vakithesaplama.diyanet.gov.tr/icerik.php?icerik={i}',sha256=sha(R+f'/diy{i}.html'),program_version=f'dini_gunler_{y}',publisher='Diyanet İşleri Başkanlığı',title=f'{y} Dini Günler',fetched_at=FETCHED)
sources['odsgm_lgs_2027']=dict(id='odsgm_lgs_2027',url='https://odsgm.meb.gov.tr/www/lgs-kapsamindaki-merkezi-sinavin-tarihi-belli-oldu/icerik/1755',sha256=sha(R+'/lgs2027.html'),program_version='lgs_2027',publisher='MEB ÖDSGM',title='LGS 2027 tarihi duyurusu',fetched_at=FETCHED)
S=[]
def st(exam,section,subject,count,src,weight=None,minutes=None,order=0): S.append(dict(exam=exam,section=section,subject=subject,count=count,weight=weight,minutes=minutes,sourceId=src,order=len(S)))
for s,c,w in [('Türkçe',20,4),('T.C. İnkılap Tarihi ve Atatürkçülük',10,1),('Din Kültürü ve Ahlak Bilgisi',10,1),('Yabancı Dil',10,1)]: st('LGS','Sözel Bölüm (75 dk)',s,c,'meb_lgs_2026',w,75)
for s,c,w in [('Matematik',20,4),('Fen Bilimleri',20,4)]: st('LGS','Sayısal Bölüm (80 dk)',s,c,'meb_lgs_2026',w,80)
for s,c in [('Türkçe',40),('Tarih',5),('Coğrafya',5),('Felsefe',5),('Din Kültürü ve Ahlak Bilgisi (veya ilave Felsefe)',5),('Temel Matematik',40),('Fizik',7),('Kimya',7),('Biyoloji',6)]: st('TYT','Temel Yeterlilik Testi',s,c,'osym_yks_2026')
for sec,items in [('Türk Dili ve Edebiyatı-Sosyal Bilimler-1',[('Türk Dili ve Edebiyatı',24),('Tarih-1',10),('Coğrafya-1',6)]),('Sosyal Bilimler-2',[('Tarih-2',11),('Coğrafya-2',11),('Felsefe Grubu',12),('Din Kültürü ve Ahlak Bilgisi',6)]),('Matematik',[('Matematik',40)]),('Fen Bilimleri',[('Fizik',14),('Kimya',13),('Biyoloji',13)])]:
    for s,c in items: st('AYT',sec,s,c,'osym_yks_2026')
st('YDT','Yabancı Dil Testi','Yabancı Dil',80,'osym_yks_2026')
st('ALES','ALES (150 dk)','Sayısal',50,'osym_ales_2026',None,150); st('ALES','ALES (150 dk)','Sözel',50,'osym_ales_2026',None,150)
st('DGS','DGS (135 dk)','Sayısal',50,'osym_dgs_2026',None,135); st('DGS','DGS (135 dk)','Sözel',50,'osym_dgs_2026',None,135)
st('KPSS','Genel Yetenek-Genel Kültür (130 dk)','Genel Yetenek',60,'osym_kpss_2026',None,130); st('KPSS','Genel Yetenek-Genel Kültür (130 dk)','Genel Kültür',60,'osym_kpss_2026',None,130)
for s,m in [('İşletme',50),('Muhasebe',50),('İstatistik',60),('Hukuk',50),('Kamu Yönetimi',50),('İktisat',50),('Maliye',50),('Uluslararası İlişkiler',50),('Çalışma Ekonomisi ve Endüstri İlişkileri',50)]: st('KPSS','Alan Bilgisi',s,40,'osym_kpss_2026',None,m)
for s,c in [('Anatomi',13),('Histoloji ve Embriyoloji',7),('Fizyoloji',8),('Tıbbi Biyokimya',18),('Tıbbi Mikrobiyoloji',18),('Tıbbi Patoloji',18),('Tıbbi Farmakoloji',18)]: st('TUS','Temel Tıp Bilimleri Testi',s,c,'osym_tus_2026')
for s,c in [('Dâhiliye Grubu',35),('Pediatri',25),('Cerrahi Grubu',30),('Kadın Hastalıkları ve Doğum',10)]: st('TUS','Klinik Tıp Bilimleri Testi',s,c,'osym_tus_2026')
for s,c in [('Anatomi',6),('Histoloji ve Embriyoloji',4),('Fizyoloji',6),('Tıbbi Biyokimya',6),('Tıbbi Mikrobiyoloji',6),('Tıbbi Patoloji',4),('Tıbbi Farmakoloji',4),('Tıbbi Biyoloji ve Genetik',4)]: st('DUS','Temel Bilimler Testi',s,c,'osym_dus_2026')
for s in ['Restoratif Diş Tedavisi','Protetik Diş Tedavisi','Ağız, Diş ve Çene Cerrahisi','Ağız, Diş ve Çene Radyolojisi','Periodontoloji','Ortodonti','Endodonti','Çocuk Diş Hekimliği']: st('DUS','Klinik Bilimler Testi',s,10,'osym_dus_2026')
st('YDS','YDS','Yabancı Dil',80,'osym_yds_2026')
C=[]
def ev(kind,label,s,e,src,exam=None): C.append(dict(id=f"{kind}-{s}-{len(C)}",kind=kind,label=label,starts=s,ends=e or s,sourceId=src,exam=exam))
for l,s,e in [('1. dönem ara tatili','2026-11-16','2026-11-20'),('Yarıyıl tatili','2027-01-25','2027-02-05'),('2. dönem başlangıcı','2027-02-08',None),('2. dönem ara tatili','2027-03-08','2027-03-12'),('Ders yılı sonu','2027-06-25',None)]: ev('meb',l,s,e,'meb_bulten_2026')
ev('sinav','LGS 2027','2027-06-13',None,'odsgm_lgs_2027','LGS')
for l,s,e,x in [('MSÜ','2027-03-20',None,'MSU'),('TUS 1. Dönem','2027-03-27',None,'TUS'),('YDS/1','2027-03-28',None,'YDS'),('ALES/1','2027-04-18',None,'ALES'),('YKS TYT','2027-06-19',None,'TYT'),('YKS AYT','2027-06-20',None,'AYT'),('YKS YDT','2027-06-20',None,'YDT'),('ALES/2','2027-07-11',None,'ALES'),('DGS','2027-07-18',None,'DGS'),('TUS 2. Dönem','2027-08-22',None,'TUS'),('KPSS Lisans GY-GK','2027-09-12',None,'KPSS'),('KPSS Alan Bilgisi','2027-09-18','2027-09-19','KPSS'),('DUS','2027-10-24',None,'DUS'),('YDS/2','2027-11-21',None,'YDS'),('ALES/3','2027-11-28',None,'ALES')]: ev('sinav',l,s,e,'osym_takvim_2027',x)
for y,ra,rs,re_,ka,ks,ke in [(2028,'02-25','02-26','02-28','05-04','05-05','05-08'),(2029,'02-13','02-14','02-16','04-23','04-24','04-27'),(2030,'02-03','02-04','02-06','04-12','04-13','04-16')]:
    ev('dini',f'Ramazan Bayramı arifesi',f'{y}-{ra}',None,f'diyanet_{y}'); ev('dini','Ramazan Bayramı',f'{y}-{rs}',f'{y}-{re_}',f'diyanet_{y}')
    ev('dini','Kurban Bayramı arifesi',f'{y}-{ka}',None,f'diyanet_{y}'); ev('dini','Kurban Bayramı',f'{y}-{ks}',f'{y}-{ke}',f'diyanet_{y}')
reg=dict(version='2026-11-01',examGradeScopes=dict(TYT=[9,10],AYT=[11,12],YKS=[9,12]),fetchedAt=FETCHED,sources=sources,programs=list(programs.values()),examStructures=S,calendar=C,excluded=excluded)
json.dump(reg,open(D+'/out/registry.json','w'),ensure_ascii=False,indent=0)
print(len(programs),sum(len(o['outcomes']) for p in programs.values() for o in p['units']),len(S),len(C),len(excluded),missing[:3],len(missing))
