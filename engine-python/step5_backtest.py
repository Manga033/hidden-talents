import os
OUT=os.environ.get('HT_OUT','/home/claude/out').rstrip('/')+'/'
import pandas as pd, numpy as np, warnings; warnings.filterwarnings('ignore')
from scipy import stats
from engine import score_pool
ps=pd.read_pickle(OUT+'player_season.pkl')
rows=[]; pools=[]
for s in range(2015,2024):
    d,_=score_pool(ps,s)
    if d is None: continue
    d['season']=s; pools.append(d)
P=pd.concat(pools,ignore_index=True)
P['lv0']=np.log(P.value_end.clip(lower=25000)); P['lv3']=np.log(P.value_plus3.clip(lower=25000))
P['has3']=P.value_plus3.notna()
P.to_pickle(OUT+'pools_all.pkl')
print('pool rows',len(P),'with 3y value',P.has3.sum(), 'seasons',P.season.min(),P.season.max())
def resid(y,X):
    X=np.column_stack([np.ones(len(X)),X]); b=np.linalg.lstsq(X,y,rcond=None)[0]; return y-X@b
T=P[P.has3&P.lv0.notna()].copy()
print('testable',len(T), T.season.value_counts().sort_index().to_dict())
# target: growth in log value, net of value level & age (what market value alone does NOT tell you)
T['growth']=T.lv3-T.lv0
T['g_res']=resid(T.growth.values,np.column_stack([T.lv0,T.age,T.age**2]))
for c in ['comp_raw','comp_fair','comp_unadj']:
    r,p=stats.spearmanr(T[c],T.g_res); print(f'{c}: spearman with growth net of value&age  {r:+.3f} (p={p:.1e})')
r,p=stats.spearmanr(T.lv0,T.growth); print(f'log value now vs growth: {r:+.3f}')
# top-decile hit rates by season (value at least doubles in 3y)
T['dbl']=(T.lv3-T.lv0)>np.log(2)
print('base rate doubles:',round(T.dbl.mean(),3))
for c in ['comp_raw','comp_fair']:
    out=[]
    for s,g in T.groupby('season'):
        k=max(5,int(len(g)*0.10)); top=g.nlargest(k,c); out.append((top.dbl.mean(),g.dbl.mean()))
    o=np.array(out); print(c,'top10% double-rate',o[:,0].mean().round(3),'vs pool',o[:,1].mean().round(3))
# the Hidden Talent definition: fair top 15% but raw outside top 40%
T['pf']=T.groupby('season').comp_fair.rank(pct=True); T['pr']=T.groupby('season').comp_raw.rank(pct=True)
ht=T[(T.pf>=0.85)&(T.pr<0.60)]; rest=T[~T.index.isin(ht.index)]
print('hidden talents n',len(ht),'value change mean log',round(ht.growth.mean(),3),'double-rate',round(ht.dbl.mean(),3),'| others',round(rest.growth.mean(),3),round(rest.dbl.mean(),3))
ht_g=ht.groupby('season').growth.mean(); print('hidden talents growth > others by season:', (ht.groupby('season').growth.mean()>rest.groupby('season').growth.mean()).sum(),'of',ht.season.nunique())
# bootstrap CI for fair spearman on g_res
rng=np.random.default_rng(0); bs=[]
for _ in range(500):
    i=rng.integers(0,len(T),len(T)); bs.append(stats.spearmanr(T.comp_fair.values[i],T.g_res.values[i])[0])
print('fair vs g_res bootstrap 95% CI',np.percentile(bs,[2.5,97.5]).round(3))
