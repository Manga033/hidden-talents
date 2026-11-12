import pandas as pd, numpy as np, pickle, gc
import os
U=os.environ.get('HT_INPUT','/mnt/user-data/uploads/').rstrip('/')+'/'; OUT=os.environ.get('HT_OUT','/home/claude/out').rstrip('/')+'/'
E=pickle.load(open(OUT+'elo.pkl','rb')); G=E['games']; slope,icpt,mu=E['slope'],E['icpt'],E['mu']
ap=pd.read_csv(U+'appearances.csv',usecols=['game_id','player_id','player_club_id','date','competition_id','goals','assists','minutes_played','yellow_cards','red_cards'])
ap['date']=pd.to_datetime(ap.date); ap['season']=np.where(ap.date.dt.month>=7,ap.date.dt.year,ap.date.dt.year-1)
lu=pd.read_csv(U+'game_lineups.csv',usecols=['game_id','player_id','type','position'],dtype={'game_id':'int64','player_id':'int64'})
lu=lu.drop_duplicates(['game_id','player_id'])
ev=pd.read_csv(U+'game_events.csv',usecols=['game_id','minute','type','club_id','player_id','player_in_id','player_assist_id'])
print('own-goal rows?')
gl=ev[ev.type=='Goals'][['game_id','minute','club_id','player_id','player_assist_id']].rename(columns={'minute':'gmin','club_id':'gclub','player_id':'scorer','player_assist_id':'assister'})
sb=ev[ev.type=='Substitutions']
inn=sb.dropna(subset=['player_in_id']).drop(columns=['player_id']).assign(player_in_id=lambda d:d.player_in_id.astype('int64')).rename(columns={'player_in_id':'player_id','minute':'in_min'})[['game_id','player_id','in_min']].drop_duplicates(['game_id','player_id'])
ap=ap.merge(lu,on=['game_id','player_id'],how='left').merge(inn,on=['game_id','player_id'],how='left')
ap['starter']=np.where(ap.type.notna(),ap.type.eq('starting_lineup'),ap.in_min.isna()&(ap.minutes_played>=45))
m=ap.minutes_played.fillna(0).astype(float)
ap['start']=np.where(ap.starter,0.0,np.where(ap.in_min.notna(),ap.in_min,np.clip(90-m,0,90)))
end=ap.start+m
ap['end_eff']=np.where(end>=88,999.0,end)
# game context
gg=G[['game_id','home_club_id','away_club_id','elo_h','elo_a','exp_gd_home','neutral']]
ap=ap.merge(gg,on='game_id',how='inner')
ishome=ap.player_club_id.eq(ap.home_club_id); isaway=ap.player_club_id.eq(ap.away_club_id)
ap=ap[ishome|isaway].copy(); ishome=ap.player_club_id.eq(ap.home_club_id)
ap['team_elo']=np.where(ishome,ap.elo_h,ap.elo_a); ap['opp_elo']=np.where(ishome,ap.elo_a,ap.elo_h)
ap['exp_gd']=np.where(ishome,ap.exp_gd_home,-ap.exp_gd_home)
ap['exp_gf']=mu+ap.exp_gd/2; ap['exp_ga']=mu-ap.exp_gd/2
print('rows',len(ap))
outs=[]
for s,part in ap.groupby('season'):
    p=part[['game_id','player_id','player_club_id','start','end_eff']].reset_index(drop=True)
    mg=p.merge(gl,on='game_id')
    on=(mg.gmin>mg.start)&(mg.gmin<=mg.end_eff)
    mg=mg[on]
    own=mg.gclub.eq(mg.player_club_id)
    gf=own.astype(int); ga=(~own).astype(int)
    inv=(own&((mg.scorer==mg.player_id)|(mg.assister==mg.player_id))).astype(int)
    agg=pd.DataFrame({'game_id':mg.game_id.values,'player_id':mg.player_id.values,'gf_on':gf.values,'ga_on':ga.values,'inv_on':inv.values}).groupby(['game_id','player_id'],as_index=False).sum()
    outs.append(agg)
agg=pd.concat(outs); del outs; gc.collect()
ap=ap.merge(agg,on=['game_id','player_id'],how='left')
for c in ['gf_on','ga_on','inv_on']: ap[c]=ap[c].fillna(0)
# flag games with events (else on-pitch goals unknown)
has_ev=set(gl.game_id.unique())|set(sb.game_id.unique())
ap['has_ev']=ap.game_id.isin(has_ev)
f=m.loc[ap.index]/90.0
ap['res_off']=ap.gf_on-ap.exp_gf*f.values      # goals for above expectation while on pitch
ap['res_def']=-(ap.ga_on-ap.exp_ga*f.values)    # goals against below expectation while on pitch (positive = good)
ap['res_tot']=ap.res_off+ap.res_def
ap['big']=ap.opp_elo>=ap.team_elo
ap['pos_played']=ap.position
keep=['game_id','player_id','player_club_id','date','season','competition_id','goals','assists','minutes_played','yellow_cards','red_cards','starter','start','end_eff','pos_played','team_elo','opp_elo','gf_on','ga_on','inv_on','res_off','res_def','res_tot','big','has_ev','exp_gd']
ap[keep].to_pickle(OUT+'player_games.pkl')
print(ap[keep].describe().T[['count','mean','std']].round(3).to_string())
print('share rows with events',ap.has_ev.mean())
# check: sum of res_tot per team-game ~ zero-ish? sanity: mean res_tot per 90 by minutes
x=ap[ap.minutes_played>0]; print('mean res_tot per 90:',(x.res_tot.sum()/x.minutes_played.sum()*90))
