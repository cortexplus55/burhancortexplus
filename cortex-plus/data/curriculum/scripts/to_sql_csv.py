"""registry.json -> seed SQL göçü + inceleme CSV'leri. Veri üretmez, yalnız biçim dönüştürür."""
import json,csv,sys,os
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
reg=json.load(open(os.path.join(ROOT,'src/lib/curriculum/registry.json')))
S=reg['sources']
def q(v):
    if v is None: return 'NULL'
    if isinstance(v,bool): return 'true' if v else 'false'
    if isinstance(v,(int,float)): return str(v)
    if isinstance(v,(list,dict)): return "'"+json.dumps(v,ensure_ascii=False).replace("'","''")+"'::jsonb"
    return "'"+str(v).replace("'","''")+"'"
def arr(xs,t): return "ARRAY["+",".join(q(x) for x in xs)+"]::"+t+"[]" if xs else "'{}'::"+t+"[]"
def prov(sid):
    s=S[sid]; return [q(s['url']),q(s['program_version']),q(s['sha256']),q(s['fetched_at'])]
P='source_url, program_version, sha256, fetched_at'
out=["-- OTOMATİK ÜRETİLDİ: data/curriculum/scripts/to_sql_csv.py (registry.json "+reg['version']+"). Elle düzenlemeyin.","BEGIN;"]
def ins(table,cols,rows,conf):
    if not rows: return
    upd=", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c not in conf)
    for i in range(0,len(rows),200):
        out.append(f"INSERT INTO public.{table} ({', '.join(cols)}) VALUES\n"+",\n".join("("+", ".join(r)+")" for r in rows[i:i+200])+f"\nON CONFLICT ({', '.join(conf)}) DO UPDATE SET {upd};")
ins('curriculum_sources',['id','publisher','title','source_url','program_version','sha256','fetched_at','page_url'],
    [[q(s['id']),q(s['publisher']),q(s['title']),q(s['url']),q(s['program_version']),q(s['sha256']),q(s['fetched_at']),q(s.get('page'))] for s in S.values()],['id'])
pr=[];un=[];oc=[];sc=[];csvrows=[]
for p in reg['programs']:
    ps=p['sourceIds'][0]
    pr.append([q(p['id']),q(p['kind']),q(p['grade']),q(p['subjectKey']),q(p['subject']),q(p['label']),q(p['badge']),q(p['scope']),arr(p['sourceIds'],'text')]+prov(ps))
    n=0
    for ui,u in enumerate(p['units']):
        uid=f"{p['id']}#{ui+1}"
        un.append([q(uid),q(p['id']),q(u['title']),q(ui+1)]+prov(ps))
        for o in u['outcomes']:
            n+=1
            oc.append([q(f"{p['id']}#{n}"),q(p['id']),q(uid),q(o['code']),q(o['text']),q(o.get('topic')),q(o.get('limitations') or []),q(o.get('quotas') or {}),q(n),q(o['sourceId']),q(o.get('xlsxSourceId')),q(o.get('similarity'))]+prov(o['sourceId']))
            csvrows.append([p['id'],p['label'],p['badge'],u['title'],o['code'],o['text'],o.get('topic') or '',json.dumps(o.get('quotas') or {},ensure_ascii=False),S[o['sourceId']]['url'],S[o['xlsxSourceId']]['url'] if o.get('xlsxSourceId') else '',o.get('similarity') or '',S[o['sourceId']]['program_version'],S[o['sourceId']]['sha256'],S[o['sourceId']]['fetched_at']])
    xs=next((s for s in p['sourceIds'] if s.startswith('odsgm_ksdt_')),ps)
    for k,e in p['exams'].items():
        sc.append([q(p['id']),q(k),arr(e['scenarios'],'integer'),q(e['national'])]+prov(xs))
ins('curriculum_programs',['id','kind','grade','subject_key','subject','label','badge','scope','source_ids']+P.split(', '),pr,['id'])
ins('curriculum_units',['id','program_id','title','sort_order']+P.split(', '),un,['id'])
ins('curriculum_outcomes',['id','program_id','unit_id','code','text','topic','limitations','quotas','sort_order','source_id','quota_source_id','text_similarity']+P.split(', '),oc,['id'])
ins('curriculum_exam_scenarios',['program_id','exam_key','scenarios','national']+P.split(', '),sc,['program_id','exam_key'])
ins('curriculum_exam_structures',['id','exam','section','subject','question_count','weight','minutes','sort_order','source_id']+P.split(', '),
    [[q(f"{s['exam']}#{s['order']}"),q(s['exam']),q(s['section']),q(s['subject']),q(s['count']),q(s['weight']),q(s['minutes']),q(s['order']),q(s['sourceId'])]+prov(s['sourceId']) for s in reg['examStructures']],['id'])
ins('curriculum_calendar_events',['id','kind','label','starts_on','ends_on','exam','source_id']+P.split(', '),
    [[q(c['id']),q(c['kind']),q(c['label']),q(c['starts']),q(c['ends']),q(c['exam']),q(c['sourceId'])]+prov(c['sourceId']) for c in reg['calendar']],['id'])
ins('curriculum_exclusions',['id','source_id','section','code','reason'],
    [[q(f"x{i+1}"),q(x['source']),q(x['section']),q(x.get('code')),q(x['reason'])] for i,x in enumerate(reg['excluded'])],['id'])
out.append("COMMIT;")
open(os.path.join(ROOT,'supabase/migrations/20261101100100_curriculum_seed.sql'),'w').write("\n".join(out)+"\n")
os.makedirs(os.path.join(ROOT,'data/curriculum/review'),exist_ok=True)
with open(os.path.join(ROOT,'data/curriculum/review/outcomes.csv'),'w',newline='') as f:
    w=csv.writer(f); w.writerow(['program_id','program','badge','unit','code','text','topic','quotas','source_url','quota_source_url','text_similarity','program_version','sha256','fetched_at']); w.writerows(csvrows)
with open(os.path.join(ROOT,'data/curriculum/review/exam_structures.csv'),'w',newline='') as f:
    w=csv.writer(f); w.writerow(['exam','section','subject','question_count','weight','minutes','source_url','sha256'])
    for s in reg['examStructures']: w.writerow([s['exam'],s['section'],s['subject'],s['count'],s['weight'] or '',s['minutes'] or '',S[s['sourceId']]['url'],S[s['sourceId']]['sha256']])
with open(os.path.join(ROOT,'data/curriculum/review/calendar.csv'),'w',newline='') as f:
    w=csv.writer(f); w.writerow(['kind','label','starts','ends','exam','source_url','sha256'])
    for c in reg['calendar']: w.writerow([c['kind'],c['label'],c['starts'],c['ends'],c['exam'] or '',S[c['sourceId']]['url'],S[c['sourceId']]['sha256']])
with open(os.path.join(ROOT,'data/curriculum/review/excluded.csv'),'w',newline='') as f:
    w=csv.writer(f); w.writerow(['source','section','code','reason']); w.writerows([[x['source'],x['section'],x.get('code') or '',x['reason']] for x in reg['excluded']])
print(len(oc),len(sc))


# İstemciye giden küçük takvim dosyası (sihirbazın tek tık resmî tarihleri, tatil tablosu).
def write_calendar_json():
    import json as _j, os as _o
    root = _o.path.dirname(_o.path.dirname(_o.path.dirname(_o.path.dirname(_o.path.abspath(__file__)))))
    reg = _j.load(open(_o.path.join(root, "src/lib/curriculum/registry.json")))
    used = sorted({c["sourceId"] for c in reg["calendar"]})
    out = {
        "version": reg["version"],
        "events": reg["calendar"],
        "sources": {k: {f: reg["sources"][k][f] for f in ("url", "sha256", "title", "publisher", "fetched_at")} for k in used},
    }
    _j.dump(out, open(_o.path.join(root, "src/lib/curriculum/calendar.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    write_calendar_json()
