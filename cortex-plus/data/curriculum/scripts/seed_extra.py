# YKS ek dersler (TDE, İnkılap, Mantık, Psikoloji, Sosyoloji), LGS 8. sınıf ve KPSS GY-GK. Yalnız resmî belgeler.
def tcap(t):
    small={'ve','ile','ya','da','de','ile','veya','ki'}
    t=t.replace('I','ı').replace('İ','i').lower()
    ws=t.split(' ')
    def cap(w): return '/'.join((p[:1].replace('i','İ').replace('ı','I').upper()+p[1:]) if p else p for p in w.split('/'))
    return post(' '.join(cap(w) if (k==0 or w not in small) else w for k,w in enumerate(ws)))
def yprog(sec,name,units,label=None,scope=None):
    pid=f'yks-2026-{sec}'
    programs[pid]=dict(id=pid,kind='yks',grade=None,subjectKey=sec,subject=name,label=label or f'YKS {name} (9–12)',programVersion='meb_yks_2026',
        badge='ÖSYM 2026 YKS’ye esas kazanımlar (MEB)',scope=scope or '9–12. sınıf YKS kazanımları; 2027 sürümü henüz yayımlanmadı',sourceIds=[yks_src],units=units,exams={})
# TDE: türe bağlı kazanımlar (A.1 şiir, A.2 öyküleyici, A.3 tiyatro, A.4 bilgilendirici) her sınıfın o türdeki ünitesine uygulanır
T=json.load(open(D+'/out/tde.json'))
units=[]; tde_skip=0
for u in T['units']:
    if not u['genre']: continue
    g=u['grade']; outs=[]
    for o in T['groups'][u['genre']]:
        only=None
        for l in o['limitations']:
            m=re.match(r'^(?:[a-zç]\.\s*)?Bu kazanım ([\d,\s]+ve\s*\d+)\.\s*sınıf düzeylerinde ele alınacaktır',l)
            if m: only={int(x) for x in re.findall(r'\d+',m.group(1))}
        if only and g not in only: tde_skip+=1; continue
        outs.append(dict(code=f"{g}.{u['no']}/{o['code']}",text=o['text'],topic=None,grade=g,limitations=o['limitations'],quotas={},sourceId=yks_src))
    units.append(dict(title=f"{g}. Sınıf · {u['no']}. {tcap(u['title'])}",outcomes=outs))
yprog('tde','Türk Dili ve Edebiyatı',units,scope='9–12. sınıf YKS kazanımları; TYT Türkçe bu ders adıyla sunulur')
excluded.append(dict(source=yks_src,section='tde',reason='Her sınıfın “Giriş” ünitesi ve B/C (sözlü/yazılı iletişim) kazanımları türe bağlı değil; ünite eşlemesi belgede yok, alınmadı'))
excluded.append(dict(source=yks_src,section='tde',reason=f'{tde_skip} kazanım “Bu kazanım 10, 11 ve 12. sınıf düzeylerinde ele alınacaktır” notu nedeniyle 9. sınıf ünitelerinden çıkarıldı'))
excluded.append(dict(source=yks_src,section='tde',reason='Kazanım kodları belgede sınıf içermez (A.2.1 …); ayırt etmek için sınıf.ünite öneki eklendi (ör. 9.2/A.2.1). A.4 bilgilendirici metin ünitelerine eşleme ünite türünden çıkarıldı'))
# İnkılap (12. sınıf)
I=json.load(open(D+'/out/inkilap.json'))
yprog('inkilap','T.C. İnkılap Tarihi ve Atatürkçülük',[dict(title='12. Sınıf · '+re.sub(r'^(\d+)\. Ünite:\s*',r'\1. ',u['title'].split(':',1)[0]+': '+tcap(u['title'].split(':',1)[1].strip()) if ':' in u['title'] else u['title']),
    outcomes=[dict(code='12.'+o['code'],text=o['text'],topic=None,grade=12,limitations=o['limitations'],quotas={},sourceId=yks_src) for o in u['outcomes']]) for u in I],
    label='YKS T.C. İnkılap Tarihi ve Atatürkçülük (12)',scope='12. sınıf YKS kazanımları (AYT)')
# Felsefe grubu: belgede sınıf yok -> grade None (yalnız AYT/YKS)
F=json.load(open(D+'/out/felsefe_grubu.json'))
BAD={'Ma','(karş','ünn','Öncül','İlişkisel','Düz ve ter belirtil','Kavramlar arasındaki ilişkiler (eşitlik-ayrıklık-tam girişimlik-eksik giriş'}
fdrop=0
for sec,name in [('mantik','Mantık'),('psikoloji','Psikoloji'),('sosyoloji','Sosyoloji')]:
    us=[]
    for u in F[sec]:
        os_=[]
        for o in u['outcomes']:
            lim=[]
            for l in o['limitations']:
                if l in BAD or l.startswith('Ma kavramlarına'): fdrop+=1; continue
                if lim and l[:1].islower(): lim[-1]+=' '+l; continue
                lim.append(l)
            os_.append(dict(code=f'{sec[:3].upper()}.{o["code"]}',text=o['text'],topic=None,limitations=lim,quotas={},sourceId=yks_src))
        t=u['title'].replace('ÖĞRENMEI','ÖĞRENME,'); m=re.match(r'^(\d+)\.\s*Ünite:\s*(.+)$',t)
        us.append(dict(title=f'{m.group(1)}. {tcap(m.group(2))}' if m else t,outcomes=os_))
    yprog(sec,name,us,label=f'YKS {name} (AYT)',scope='Belge sınıf düzeyi belirtmez; AYT Felsefe Grubu kapsamı')
excluded.append(dict(source=yks_src,section='felsefe-grubu',reason=f'{fdrop} bozuk/yarım açıklama parçası (PDF yazı tipi kodlaması) alınmadı; Mantık 7, Psikoloji 8 açıklama satırı metne çıkarılamadı'))
# LGS 8. sınıf
L=json.load(open(D+'/out/lgs_a.json'))
LG=[('turkce','Türkçe','663'),('matematik','Matematik','329'),('fen','Fen Bilimleri','325'),('inkilap','T.C. İnkılap Tarihi ve Atatürkçülük','355'),('dkab','Din Kültürü ve Ahlak Bilgisi','318'),('ingilizce','İngilizce','327')]
urls={l.split()[0]:l.split()[1] for l in open(R+'/pdf/urls.txt') if l.strip()}
for key,name,f in LG:
    sid='meb_pid_'+f
    if sid not in sources: sources[sid]=dict(id=sid,url=urls[f],sha256=sha(R+f'/pdf/{f}.pdf'),program_version='meb_2018',publisher='MEB TTKB',title=f'Öğretim Programı PID {f}',fetched_at=FETCHED)
    pid=f'lgs-2027-{key}'
    p=dict(id=pid,kind='lgs',grade=8,subjectKey=key,subject=name,label=f'LGS {name} (8. Sınıf)',programVersion='meb_2018',
        badge='LGS: 8. sınıf öğretim programı kazanımları (MEB)',scope='LGS 2027 kapsamı: 8. sınıf kazanımlarının tamamı',sourceIds=[sid,'meb_lgs_2026'],units=[],exams={})
    for o in L[key]:
        u=next((x for x in p['units'] if x['title']==o['unit']),None)
        if not u: u=dict(title=o['unit'],outcomes=[]); p['units'].append(u)
        u['outcomes'].append(dict(code=o['code'],text=o['text'],topic=o.get('topic'),grade=8,limitations=o['limitations'],quotas={},sourceId=sid))
    programs[pid]=p
excluded.append(dict(source='meb_pid_329',section='lgs',reason='Formül/şekil içeren açıklama satırları (PDF özel karakterleri) metne çıkarılamadı, alınmadı'))
# KPSS GY-GK: ÖSYM 2026 KPSS Lisans kılavuzu Tablo-1
K='osym_kpss_2026'
def kp(key,name,units,scope):
    pid=f'kpss-2026-{key}'
    programs[pid]=dict(id=pid,kind='kpss',grade=None,subjectKey=key,subject=name,label=f'KPSS {name}',programVersion='kpss_2026',
        badge='ÖSYM 2026 KPSS Kılavuzu · Tablo-1 test kapsamları',scope=scope,sourceIds=[K],
        units=[dict(title=t,outcomes=[dict(code=c,text=x,topic=None,limitations=[w if w and w.startswith('Bölüm') else f'Testteki yaklaşık ağırlığı: {w} (ÖSYM Tablo-1)'],quotas={},sourceId=K) for c,x,*rest in os_ for w in [rest[-1]]]) for t,os_ in units],exams={})
# GY alt bileşenleri: ÖSYM Tablo-1 kapsam cümlesindeki adlandırılmış bileşenler (ÖSYM ayrı alt konu listesi yayımlamaz; alt ağırlık belirtilmez)
_gy='Bölüm ağırlığı %50 (ÖSYM Tablo-1); bileşen ağırlığı ÖSYM tarafından belirtilmez. Kapsam: '
kp('genel-yetenek','Genel Yetenek',[('Sözel Bölüm',[(c,x,None,_gy+'“Sözel akıl yürütme (muhakeme) becerilerini, dil bilgisi ve yazım kurallarını ölçmeye yönelik sorulardan oluşacaktır.”') for c,x in [('GY.1.a','Sözel akıl yürütme (muhakeme)'),('GY.1.b','Dil bilgisi'),('GY.1.c','Yazım kuralları')]]),
    ('Sayısal Bölüm',[(c,x,None,_gy+'“Sayısal ve mantıksal akıl yürütme (muhakeme) becerilerini ölçmeye yönelik sorulardan oluşacaktır.”') for c,x in [('GY.2.a','Sayısal akıl yürütme (muhakeme)'),('GY.2.b','Mantıksal akıl yürütme (muhakeme)')]])],
    'ÖSYM yalnız test kapsamını tanımlar; alt konular ÖSYM Tablo-1 kapsam cümlesindeki adlandırılmış bileşenlerdir')
kp('genel-kultur','Genel Kültür',[
    ('Tarih',[('GK.1.a','Osmanlı Öncesi Türk Devletleri Tarihi (Siyasal, sosyal, ekonomik ve kültürel gelişmeler)','%5'),
              ('GK.1.b','Osmanlı Tarihi (XIII. yüzyıldan XX. yüzyıl başlarına kadar yaşanan siyasal, sosyal, ekonomik ve kültürel gelişmeler)','%15'),
              ('GK.1.c','Atatürk İlkeleri ve İnkılap Tarihi (XX. yüzyıl başından XX. yüzyılın ortalarına kadar, Osmanlı Devleti’nin yıkılışından İkinci Dünya Savaşı’nın sonuna kadar Türkiye tarihinde yaşanan siyasal, sosyal, ekonomik ve kültürel gelişmeler)','%20'),
              ('GK.1.ç','Çağdaş Türk ve Dünya Tarihi (XX. yüzyılın başlangıcından günümüze kadar Dünyada; İkinci Dünya Savaşı’ndan günümüze kadar Türkiye’de yaşanan siyasal, sosyal, ekonomik ve kültürel gelişmeler)','%5')]),
    ('Türkiye Coğrafyası',[('GK.2.a','Türkiye’nin fiziki özellikleri','%12'),('GK.2.b','Türkiye’nin beşerî özellikleri','%5'),('GK.2.c','Türkiye’nin ekonomik özellikleri','%13')]),
    ('Temel Yurttaşlık Bilgisi',[('GK.3.a','Hukuk başlangıcı','%5'),('GK.3.b','Anayasa, İnsan Hakları Hukuku','%5'),('GK.3.c','İdare','%5')]),
    ('Güncel Konular',[('GK.4','Türkiye ve Dünya ile İlgili Genel, Kültürel ve Sosyoekonomik Konular','%10')])],
    'ÖSYM 2026 KPSS Lisans kılavuzu Tablo-1 alt başlıkları')
