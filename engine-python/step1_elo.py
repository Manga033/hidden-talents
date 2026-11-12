import pandas as pd, numpy as np, pickle
U='/mnt/user-data/uploads/'
g=pd.read_csv(U+'08e83fa8-games.csv',usecols=['game_id','competition_id','season','date','home_club_id','away_club_id','home_club_goals','away_club_goals','competition_type'])
g=g.dropna(subset=['home_club_goals','away_club_goals','home_club_id','away_club_id']).copy()
g['date']=pd.to_datetime(g.date); g=g.sort_values(['date','game_id']).reset_index(drop=True)
g['neutral']=g.competition_type.eq('national_team_competition')|g.competition_id.isin(['GBCS','SCI','SUC','DFL','FRCH','NLSC','POSU','RUSS','BESC','USC'])
dl=g[g.competition_type=='domestic_league']
club_league={}
for r in dl[['home_club_id','away_club_id','competition_id']].itertuples(index=False):
    club_league[r[0]]=r[2]; club_league[r[1]]=r[2]
K,HFA=20,65
def run(init):
    R=dict(init); pre=np.zeros((len(g),2)); last_season=None
    H=g.home_club_id.values; A=g.away_club_id.values; hg=g.home_club_goals.values; ag=g.away_club_goals.values
    dates=g.date.values; neu=g.neutral.values
    yrs=(g.date.dt.year+(g.date.dt.month>=7)*0).values
    seas=np.where(g.date.dt.month>=7,g.date.dt.year,g.date.dt.year-1)
    for i in range(len(g)):
        if last_season is not None and seas[i]!=last_season:
            lm={}
            for c,r in R.items():
                lm.setdefault(club_league.get(c),[]).append(r)
            lm={k:np.mean(v) for k,v in lm.items()}
            for c in R: R[c]=0.85*R[c]+0.15*lm.get(club_league.get(c),1500)
        last_season=seas[i]
        h,a=H[i],A[i]
        kh=h in club_league; ka=a in club_league
        rh=R.get(h,init.get(h,1500 if kh else 1400)); ra=R.get(a,init.get(a,1500 if ka else 1400))
        pre[i]=(rh,ra)
        if not (kh and ka) and not neu[i]:
            continue
        dr=rh-ra+(0 if neu[i] else HFA)
        e=1/(1+10**(-dr/400))
        gd=hg[i]-ag[i]; s=1.0 if gd>0 else (0.5 if gd==0 else 0.0)
        n=abs(gd); mult=1 if n<=1 else (1.5 if n==2 else (11+n)/8)
        d=K*mult*(s-e)
        R[h]=rh+d; R[a]=ra-d
    return R,pre
R1,_=run({})
lm={}
for c,r in R1.items(): lm.setdefault(club_league.get(c),[]).append(r)
lm={k:np.mean(v) for k,v in lm.items() if k is not None}
init={c:lm.get(club_league.get(c),1500) for c in R1}
R2,pre=run(init)
g['elo_h']=pre[:,0]; g['elo_a']=pre[:,1]
g['dr']=g.elo_h-g.elo_a+np.where(g.neutral,0,HFA)
gd=(g.home_club_goals-g.home_club_goals*0-g.away_club_goals)
X=g.dr.values/100; slope,icpt=np.polyfit(X,gd.values,1)
mu=float((g.home_club_goals.mean()+g.away_club_goals.mean())/2)
print('goal-diff per 100 Elo: slope=%.3f intercept=%.3f mean goals/team=%.2f'%(slope,icpt,mu))
# predictive check: correlation
print('corr(dr,gd)=%.3f'%np.corrcoef(X,gd)[0,1])
g['exp_gd_home']=slope*X+icpt
pickle.dump(dict(games=g,R=R2,club_league=club_league,slope=slope,icpt=icpt,mu=mu,HFA=HFA),open('/home/claude/out/elo.pkl','wb'))
cl=pd.read_csv(U+'0263486e-clubs.csv',usecols=['club_id','name','domestic_competition_id','last_season'])
cl['elo']=cl.club_id.map(R2)
print(cl[cl.last_season==2025].sort_values('elo',ascending=False).head(15)[['name','domestic_competition_id','elo']].to_string())
lg=cl[cl.last_season==2025].groupby('domestic_competition_id').elo.mean().sort_values(ascending=False)
print(lg.round(0).to_string())
