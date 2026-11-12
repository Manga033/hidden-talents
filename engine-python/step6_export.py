import pandas as pd, numpy as np, json, warnings, datetime as dt; warnings.filterwarnings('ignore')
from scipy import stats
from sklearn.ensemble import GradientBoostingRegressor as GBR
from engine import *
ps=pd.read_pickle('/home/claude/out/player_season.pkl'); H=pd.read_pickle('/home/claude/out/pools_all.pkl')
rng=np.random.default_rng(42)
# ---------- potential model (3-year-ahead log market value), time-split backtest ----------
F=['lv0','age','comp_fair','team_elo']
T=H[H.has3&H.lv0.notna()].copy()
def fit(tr,feats,q):
    return GBR(loss='quantile',alpha=q,n_estimators=150,max_depth=3,learning_rate=0.05,subsample=0.8,random_state=0).fit(tr[feats],tr.lv3)
tr=T[T.season<=2019]; te=T[T.season.between(2020,2022)]
res={}
for name,feats in [('value+age',['lv0','age']),('value+age+fair',['lv0','age','comp_fair']),('value+age+fair+elo',F),('value+age+raw',['lv0','age','comp_raw'])]:
    m=fit(tr,feats,0.5); p=m.predict(te[feats]); res[name]=dict(mae=float(np.mean(np.abs(p-te.lv3))),r2=float(1-((p-te.lv3)**2).sum()/((te.lv3-te.lv3.mean())**2).sum()))
    lo=fit(tr,feats,0.1).predict(te[feats]); hi=fit(tr,feats,0.9).predict(te[feats]); res[name]['cov80']=float(((te.lv3>=lo)&(te.lv3<=hi)).mean())
print('BACKTEST train<=2019 n=%d, test 2020-22 n=%d'%(len(tr),len(te)))
for k,v in res.items(): print(' ',k,{a:round(b,3) for a,b in v.items()})
# ---------- score 2025/26 pool ----------
SEASON=2025
d,info=score_pool(ps,SEASON); N=len(d)
d['lv0']=np.log(d.value_end.clip(lower=25000)); d['lv0']=d.lv0.fillna(d.lv0.median())
mods={q:fit(T,F,q) for q in (0.1,0.5,0.9)}
for q,m in mods.items(): d[f'pot{q}']=m.predict(d[F])
d['pot0.1']=np.minimum(d['pot0.1'],d['pot0.5']); d['pot0.9']=np.maximum(d['pot0.9'],d['pot0.5'])
# ---------- active weights ----------
W={g:np.array([0 if m in NOSIGNAL else x for m,x in zip(METRICS,PRESETS['Balanced'][g])],float) for g in PRESETS['Balanced']}
W={g:w/w.sum() for g,w in W.items()}
ZF=d[['zf_'+m for m in METRICS]].values; Zu=d[['z_'+m for m in METRICS]].values
grp=d.grp.values; m90=d.m90.values
noise=np.zeros_like(ZF)
for j,m in enumerate(METRICS):
    for i in range(N):
        if m in K: noise[i,j]=np.sqrt(K[m][grp[i]]/(m90[i]+K[m][grp[i]]))
def comp_from(Z,w_by_g):
    c=np.zeros(N)
    for g in w_by_g:
        ix=np.where(grp==g)[0]; c[ix]=Z[ix]@w_by_g[g]
    return c
c0=comp_from(ZF,W); mu={g:c0[grp==g].mean() for g in W}; sd={g:c0[grp==g].std() for g in W}
def stdz(c):
    o=c.copy()
    for g in W: ix=grp==g; o[ix]=(c[ix]-mu[g])/sd[g]
    return o
# Monte-Carlo rank intervals
R=np.zeros((400,N))
for r in range(400):
    c=stdz(comp_from(ZF+rng.normal(size=ZF.shape)*noise,W)); R[r]=(-c).argsort().argsort()+1
rlo,rhi=np.percentile(R,10,axis=0),np.percentile(R,90,axis=0)
# weight robustness (random Dirichlet weights over the 4 active metrics)
act=[j for j,m in enumerate(METRICS) if m not in NOSIGNAL]
top10=np.zeros(N)
for r in range(2000):
    Wr={}
    for g in W:
        w=np.zeros(len(METRICS)); w[act]=rng.dirichlet(np.ones(len(act))); Wr[g]=w
    c=stdz(comp_from(ZF,Wr)); top10[np.argsort(-c)[:10]]+=1
d['robust10']=top10/2000
d['rlo']=rlo; d['rhi']=rhi
width=(rhi-rlo)/N; d['conf_val']=(1-width).clip(0,1)
# confidence on an absolute scale: share of the pool covered by the 80% rank range
t1,t2=1/3,2/3; d['conf']=np.where(width<=t1,'High',np.where(width<=t2,'Medium','Low')); print('rank-interval width (share of pool): median %.2f, p10 %.2f, p90 %.2f'%(np.median(width),*np.percentile(width,[10,90])))
# ---------- scores ----------
sc=lambda z:np.clip(np.round(50+15*z),1,99).astype(int)
d['rawScore']=sc(d.comp_raw); d['fairScore']=sc(d.comp_fair)
pz=(d['pot0.5']-d['pot0.5'].mean())/d['pot0.5'].std()
d['potential']=np.clip(np.round(50+15*pz),1,99).astype(int)
d['potLo']=np.clip(np.round(50+15*(d['pot0.1']-d['pot0.5'].mean())/d['pot0.5'].std()),1,99).astype(int)
d['potHi']=np.clip(np.round(50+15*(d['pot0.9']-d['pot0.5'].mean())/d['pot0.5'].std()),1,99).astype(int)
stars=lambda s:float(np.clip(round(s/20*2)/2,0.5,5))
# ---------- flags ----------
d['pf']=d.fairRank/N; d['pr']=d.rawRank/N
d['hidden']=(d.pf<=0.12)&(d.rankChange>=0.10*N)
d['early']=(d.pr<=0.15)&(d.fairRank-d.rawRank>=0.15*N)
upside=d.potHi-d.fairScore
d['scout']=(upside>=np.percentile(upside,85))&(d.conf=='Low')
exp=pd.to_datetime(d.contract_expiration_date,errors='coerce')
d['release']=(exp<=pd.Timestamp('2027-06-30'))&(exp>=pd.Timestamp('2026-07-01'))
# ---------- similarity: 100 - mean absolute percentile gap on the active fair metrics, same position group ----------
# (cosine similarity ignored magnitude, so a star and a fringe player with the same profile shape scored 100)
P=d.groupby('grp')[['zf_'+METRICS[j] for j in act]].rank(pct=True).values; sim={}
for g in W:
    ix=np.where(grp==g)[0]; X=P[ix]
    for a,i in enumerate(ix):
        gap=np.abs(X-X[a]).mean(axis=1); gap[a]=np.inf; o=np.argsort(gap,kind='stable')[:3]
        sim[i]=[(ix[b],int(round(100*(1-gap[b])))) for b in o]
# ---------- development plan ----------
pct=d.groupby('grp')[['zf_'+m for m in METRICS]].rank(pct=True)
def plan(i):
    g=grp[i]; out=[]
    for j in act:
        m=METRICS[j]; p=pct.iloc[i]['zf_'+m]; q75=0.75
        gap=max(0,q75-p)*W[g][j]
        out.append((gap,m,p))
    out.sort(reverse=True); res=[]
    for gap,m,p in out[:3]:
        if gap<=0: continue
        res.append(dict(metric=LABELS[m],now=int(round(1+19*p)),target=int(round(1+19*0.75))))
    return res
# ---------- bias audit ----------
bq=d.bq.astype(int).values
def audit_for(rank,n=20):
    top=np.argsort(rank)[:n]; return top
raw_top=audit_for(d.rawRank.values); fair_top=audit_for(d.fairRank.values)
cnt=lambda ix:{f'Q{q}':int((bq[ix]==q).sum()) for q in (1,2,3,4)}
pool=cnt(np.arange(N))
def or_fisher(top):
    a=(bq[top]==1).sum(); b=len(top)-a-(bq[top]==4).sum()+0; # Q1 vs Q4 only
    t1=(bq[top]==1).sum(); t4=(bq[top]==4).sum(); p1=(bq==1).sum()-t1; p4=(bq==4).sum()-t4
    t=[[t1,p1],[t4,p4]]; orr,pv=stats.fisher_exact(t); return float(orr) if np.isfinite(orr) else None,float(pv),t
def four_fifths(top):
    rates=[(bq[top]==q).sum()/max(1,(bq==q).sum()) for q in (1,2,3,4)]
    return float(min(rates)/max(rates)) if max(rates)>0 else 0.0
orr,por,_=or_fisher(raw_top); orf,pof,_=or_fisher(fair_top)
sp=float(stats.spearmanr(d.comp_raw,d.comp_fair)[0])
# pooled multi-season audit (top 10% each season) for the report
allrows=[]
for s in range(2015,2026):
    ds,_=score_pool(ps,s)
    if ds is None: continue
    k=int(len(ds)*0.10); b=ds.bq.astype(int).values
    for lab,col in (('raw','rawRank'),('fair','fairRank')):
        top=np.argsort(ds[col].values)[:k]; allrows.append((s,lab,(b[top]==1).sum(),(b[top]==4).sum(),(b==1).sum()-(b[top]==1).sum(),(b==4).sum()-(b[top]==4).sum()))
A=pd.DataFrame(allrows,columns=['s','lab','t1','t4','p1','p4'])
pooled={}
for lab,g in A.groupby('lab'):
    tab=[[g.t1.sum(),g.p1.sum()],[g.t4.sum(),g.p4.sum()]]; o,p=stats.fisher_exact(tab); pooled[lab]=dict(table=[[int(x) for x in r] for r in tab],OR=float(o),p=float(p))
print('POOLED 2015-2025 top-10% Q1vsQ4:',json.dumps(pooled))
# ---------- data quality ----------
h=ps.height_in_cm
dq=[dict(label='Players in pool (U21, ≥450 min, 2025/26)',value=str(N),status='ok'),
    dict(label='Data scope',value='Professional adult football, not academy youth',status='warn'),
    dict(label='Maturity / biological age',value='Not in dataset; field is a placeholder',status='warn'),
    dict(label='Heights outside 150-205 cm set to null',value=str(int(((d.height_in_cm<150)|(d.height_in_cm>205)).sum())),status='warn'),
    dict(label='Foot missing',value=str(int(d.foot.isna().sum())),status='warn' if d.foot.isna().sum() else 'ok'),
    dict(label='Dataset licence / cut-off',value='CC0, updates stopped July 2026',status='ok'),
    dict(label='Appearances coverage',value='~14 domestic leagues + European cups only',status='warn')]
# ---------- players ----------
POSG={'GK':'Goalkeeper','DEF':'Defender','MID':'Midfielder','FWD':'Forward'}
DEFPOS={'GK':'GK','DEF':'CB','MID':'CM','FWD':'ST'}
def pos_of(r):
    return POSMAP.get(r.sub_position,DEFPOS[r.grp])
players=[]
for i,r in d.iterrows():
    pro=[];con=[]
    for m in ['ga90','off90','def90','disc90']:
        z=r['zf_'+m]  # fair z is already shrunk; no second reliability factor
        if z>=1: pro.append(f"Strong {LABELS[m].lower()}")
        if z<=-1: con.append(f"Weak {LABELS[m].lower()}")
    note=(f"Team strength (Elo {r.team_elo:.0f}) adjusts goal/assist and team-impact metrics; rank moves {r.rawRank}→{r.fairRank}." if abs(r.rankChange)>=10 else "Fair and raw rank are close; context correction changed little.")
    hcm=None if (pd.isna(r.height_in_cm) or r.height_in_cm<150 or r.height_in_cm>205) else int(r.height_in_cm)
    rw=r.release
    players.append(dict(id=f"P{int(r.player_id)}",name=r['name'],position=pos_of(r),positionGroup=POSG[r.grp],
      birthDate=str(pd.to_datetime(r.dob).date()),birthQuarter=f"Q{int(r.bq)}",age=round(float(r.age),1),
      foot=(str(r.foot).capitalize() if pd.notna(r.foot) else "Unknown"),heightCm=hcm,country=(r.country_of_citizenship if pd.notna(r.country_of_citizenship) else None),team=r.current_club_name,minutes=int(r.minutes),maturity="On-time",
      rawRank=int(r.rawRank),fairRank=int(r.fairRank),rawScore=int(r.rawScore),fairScore=int(r.fairScore),
      currentAbility=int(r.fairScore),potential=int(max(r.potential,0)),potentialLow=int(r.potLo),potentialHigh=int(r.potHi),
      caStars=stars(r.fairScore),potStarsLow=stars(r.potLo),potStarsHigh=stars(r.potHi),
      confidence=dict(level=r.conf,value=round(float(r.conf_val),2),rankLow=int(r.rlo),rankHigh=int(r.rhi)),
      robustnessTop10=round(float(r.robust10),2),rankChange=int(r.rankChange),
      hiddenTalent=bool(r.hidden),earlyPeaker=bool(r.early),scoutLive=bool(r.scout),
      listedRole=pos_of(r),roleFit=[],bestRole=pos_of(r),outOfPosition=None,attributes=[],
      metrics=[dict(key=m,label=LABELS[m],raw=round(float(r['z_'+m]),2),fair=round(float(r['zf_'+m]),2)) for m in METRICS],
      pros=pro[:3],cons=con[:3],fairnessNote=note,developmentPlan=plan(i),
      seasonStats=dict(apps=int(r.apps),minutes=int(r.minutes),goals=int(r.goals),assists=int(r.assists)),
      plannedRelease=bool(rw),
      releaseWarning=(f"Contract ends {pd.to_datetime(r.contract_expiration_date).date()} and fair rank is #{int(r.fairRank)} of {N}. Review before letting go." if rw and r.pf<=0.25 else None),
      tags=[t for t,c in (("Hidden Talent",r.hidden),("Early Peaker?",r.early),("Scout Live",r.scout)) if c],traits=[],
      similarPlayers=[dict(id=f"P{int(d.player_id.iloc[b])}",name=d.name.iloc[b],similarity=s) for b,s in sim[i]]))
players.sort(key=lambda p:p['fairRank'])
audit=dict(birthQuarterPool=pool,rawTop20=cnt(raw_top),fairTop20=cnt(fair_top),oddsRatioRaw=round(orr,2) if orr else None,oddsRatioFair=round(orf,2) if orf else None,
  fisherPRaw=round(por,3),fisherPFair=round(pof,3),fourFifthsRaw=round(four_fifths(raw_top),2),fourFifthsFair=round(four_fifths(fair_top),2),
  spearmanRawFair=round(sp,3),hiddenTalentCount=int(d.hidden.sum()),earlyPeakerCount=int(d.early.sum()),dataQuality=dq,
  baseRate=f"Share of U21 pro pool born in Q1: {pool['Q1']/N:.0%}; pooled 2015-2025 top-10% Q1:Q4 odds raw {pooled['raw']['OR']:.2f} vs fair {pooled['fair']['OR']:.2f}")
meta=dict(dataset="Transfermarkt (CC0, to July 2026), U21 professionals, 2025/26",generated=str(dt.date.today()),ageGroup="U21",
  features=dict(relativeAge=True,maturity=False,teamStrength=True,coachRatings=False))
json.dump(dict(meta=meta,audit=audit,players=players),open('/home/claude/out/data.json','w'),ensure_ascii=False,indent=1)
cols=['player_id','name','age','bq','grp','sub_position','current_club_name','team_elo','minutes','goals','assists','value_end','rawRank','fairRank','rankChange','rawScore','fairScore','potential','potLo','potHi','conf','rlo','rhi','robust10','hidden','early','scout','release']
d[cols].sort_values('fairRank').to_csv('/home/claude/out/hidden_talent_2025_26.csv',index=False)
print('N',N,'hidden',int(d.hidden.sum()),'early',int(d.early.sum()),'scout',int(d.scout.sum()),'release',int(d.release.sum()),'conf',d.conf.value_counts().to_dict())
print('audit',{k:audit[k] for k in ['birthQuarterPool','rawTop20','fairTop20','oddsRatioRaw','oddsRatioFair','fisherPRaw','fisherPFair','fourFifthsRaw','fourFifthsFair','spearmanRawFair']})
print('pool Q1 share',round(pool['Q1']/N,3))

print(d[d.hidden].sort_values('fairRank')[['name','age','grp','current_club_name','team_elo','minutes','value_end','rawRank','fairRank','rlo','rhi','conf']].head(12).to_string())
print(d[d.early].sort_values('rawRank')[['name','age','grp','current_club_name','team_elo','value_end','rawRank','fairRank']].head(6).to_string())
print(d[d.scout].sort_values('potHi',ascending=False)[['name','age','fairScore','potential','potLo','potHi','conf']].head(6).to_string())
