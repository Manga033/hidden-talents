import pandas as pd, numpy as np
from scipy import stats
GROUPS={'Goalkeeper':'GK','Defender':'DEF','Midfield':'MID','Attack':'FWD'}
POSMAP={'Goalkeeper':'GK','Centre-Back':'CB','Left-Back':'LB','Right-Back':'RB','Defensive Midfield':'DM','Central Midfield':'CM','Attacking Midfield':'AM','Left Midfield':'LW','Right Midfield':'RW','Left Winger':'LW','Right Winger':'RW','Centre-Forward':'ST','Second Striker':'ST'}
METRICS=['ga90','off90','def90','big90','disc90']
LABELS={'ga90':'Goals + assists per 90','off90':'Team attacking impact per 90','def90':'Team defensive impact per 90','big90':'Impact vs stronger opponents per 90','disc90':'Discipline (fewer cards)'}
PRESETS={
 'Balanced':{'FWD':[.35,.25,.05,.25,.10],'MID':[.20,.25,.20,.25,.10],'DEF':[.10,.10,.40,.30,.10],'GK':[0,0,.60,.30,.10]},
 'Attacking':{'FWD':[.45,.30,.00,.20,.05],'MID':[.30,.35,.05,.25,.05],'DEF':[.15,.20,.30,.30,.05],'GK':[0,0,.60,.30,.10]},
 'Defensive':{'FWD':[.25,.15,.20,.30,.10],'MID':[.10,.15,.40,.25,.10],'DEF':[.05,.05,.55,.25,.10],'GK':[0,0,.60,.30,.10]}}
def prep(ps,season,max_age=21.0,min_minutes=450):
    d=ps[(ps.season==season)&(ps.age<max_age)&(ps.minutes>=min_minutes)&ps.dob.notna()&ps.team_games.notna()].copy()
    d['grp']=d.position.map(GROUPS); d=d[d.grp.notna()].copy()
    d['m90']=d.minutes/90; d['ga']=d.goals+d.assists
    return d.reset_index(drop=True)
# variance components estimated from 2015-2025 player-seasons (step4b_shrink.py): shrinkage k (in 90s) and true-talent variance tau2
K={'ga90':{'DEF':12.4,'FWD':10.8,'MID':5.1,'GK':36.3},'off90':{'DEF':65.6,'FWD':110.4,'MID':57.2,'GK':542.7},
   'def90':{'DEF':353.2,'FWD':798.8,'MID':202.3,'GK':130.7},'disc90':{'DEF':129.3,'FWD':300.0,'MID':64.6,'GK':53.9}}
TAU2={'ga90':{'DEF':.0060,'FWD':.0350,'MID':.0281,'GK':.0001},'off90':{'DEF':.0224,'FWD':.0149,'MID':.0249,'GK':.0035},
      'def90':{'DEF':.0051,'FWD':.0022,'MID':.0085,'GK':.0131},'disc90':{'DEF':.0021,'FWD':.0005,'MID':.0046,'GK':.0011}}
NOSIGNAL=['big90']   # big-game impact: estimated true variance is 0 -> shown as context, weight 0 in composite
def metrics(d):
    d=d.copy()
    for g,idx in d.groupby('grp').groups.items():
        sub=d.loc[idx]; mu=sub.ga.sum()/sub.m90.sum(); mc=(sub.yellow+2*sub.red).sum()/sub.m90.sum()
        d.loc[idx,'ga90']=(sub.ga+K['ga90'][g]*mu)/(sub.m90+K['ga90'][g])
        d.loc[idx,'disc90']=-((sub.yellow+2*sub.red)+K['disc90'][g]*mc)/(sub.m90+K['disc90'][g])
        d.loc[idx,'off90']=sub.res_off/(sub.m90+K['off90'][g]); d.loc[idx,'def90']=sub.res_def/(sub.m90+K['def90'][g])
    d['big90']=d.rbig/(d.mbig/90+40)
    return d
def zscores(d):
    """z in units of the estimated true-talent sd, so noisy metrics are not inflated back to full weight."""
    d=d.copy()
    for m in METRICS:
        z=pd.Series(0.0,index=d.index)
        for g,idx in d.groupby('grp').groups.items():
            x=d.loc[idx,m]
            if m in TAU2: z.loc[idx]=(x-x.mean())/np.sqrt(TAU2[m][g])
            else: z.loc[idx]=(x-x.mean())/(x.std(ddof=0) or 1)
        d['z_'+m]=z.fillna(0)
    return d
def adjust(d,alpha=0.05):
    """Fairness correction: pooled OLS of each z-metric on decimal age and team strength; keep only significant terms."""
    d=d.copy(); info={}
    age_c=d.age-d.age.mean(); elo_c=(d.team_elo-d.team_elo.mean())/100
    X=np.column_stack([np.ones(len(d)),age_c,elo_c])
    for m in METRICS:
        y=d['z_'+m].values
        if np.std(y)<1e-9: d['zf_'+m]=y; info[m]=dict(b_age=0,b_elo=0,p_age=1,p_elo=1); continue
        beta,res,rk,sv=np.linalg.lstsq(X,y,rcond=None)
        resid=y-X@beta; s2=resid@resid/(len(y)-3); cov=s2*np.linalg.inv(X.T@X); se=np.sqrt(np.diag(cov))
        t=beta/se; p=2*(1-stats.t.cdf(np.abs(t),len(y)-3))
        ba=beta[1] if p[1]<alpha else 0.0; be=beta[2] if p[2]<alpha else 0.0
        d['zf_'+m]=y-ba*age_c.values-be*elo_c.values
        info[m]=dict(b_age=float(beta[1]),b_elo=float(beta[2]),p_age=float(p[1]),p_elo=float(p[2]),kept_age=bool(p[1]<alpha),kept_elo=bool(p[2]<alpha))
    return d,info
def composite(d,prefix,preset='Balanced'):
    W=PRESETS[preset]; out=np.zeros(len(d))
    for g,idx in d.groupby('grp').groups.items():
        w=np.array([0 if m in NOSIGNAL else x for m,x in zip(METRICS,W[g])],float); w=w/w.sum(); Z=d.loc[idx,[prefix+m for m in METRICS]].values
        c=Z@w; c=(c-c.mean())/(c.std() if c.std()>1e-9 else 1)
        out[d.index.get_indexer(idx)]=c
    return out
def raw_score(d):
    out=np.zeros(len(d))
    for g,idx in d.groupby('grp').groups.items():
        sub=d.loc[idx]
        a=sub.ga; a=(a-a.mean())/(a.std(ddof=0) if a.std(ddof=0)>1e-9 else 1)
        v=np.log(sub.value_end.fillna(sub.value_end.median())); v=(v-v.mean())/(v.std(ddof=0) or 1)
        c=0.5*a+0.5*v; c=(c-c.mean())/(c.std(ddof=0) or 1)
        out[d.index.get_indexer(idx)]=c
    return out
def score_pool(ps,season,preset='Balanced',max_age=21.0,min_minutes=450):
    d=prep(ps,season,max_age,min_minutes)
    if len(d)<30: return None,None
    d=metrics(d); d=zscores(d); d,info=adjust(d)
    d['comp_unadj']=composite(d,'z_',preset); d['comp_fair']=composite(d,'zf_',preset); d['comp_raw']=raw_score(d)
    d['rawRank']=d.comp_raw.rank(ascending=False,method='first').astype(int)
    d['fairRank']=d.comp_fair.rank(ascending=False,method='first').astype(int)
    d['rankChange']=d.rawRank-d.fairRank
    return d,info
