import pandas as pd, numpy as np, pickle
import os
U=os.environ.get('HT_INPUT','/mnt/user-data/uploads/').rstrip('/')+'/'; OUT=os.environ.get('HT_OUT','/home/claude/out').rstrip('/')+'/'
E=pickle.load(open(OUT+'elo.pkl','rb')); club_league=E['club_league']; R=E['R']
pg=pd.read_pickle(OUT+'player_games.pkl')
pg=pg[pg.minutes_played>0].copy()
pg['yc']=pg.yellow_cards; pg['rc']=pg.red_cards
if 'event_minutes' not in pg: pg['event_minutes']=np.where(pg.has_ev,pg.minutes_played,0)
pg['mbig']=np.where(pg.big,pg.event_minutes,0); pg['rbig']=np.where(pg.big,pg.res_tot,0)
pg['min_x_team']=pg.minutes_played*pg.team_elo; pg['min_x_opp']=pg.minutes_played*pg.opp_elo
# main club per player-season
mc=pg.groupby(['player_id','season','player_club_id']).minutes_played.sum().reset_index().sort_values('minutes_played',ascending=False)
main=mc.drop_duplicates(['player_id','season']).rename(columns={'player_club_id':'club_id'})[['player_id','season','club_id']]
ncl=mc.groupby(['player_id','season']).size().rename('n_clubs').reset_index()
ps=pg.groupby(['player_id','season']).agg(minutes=('minutes_played','sum'),apps=('game_id','nunique'),starts=('starter','sum'),
    event_minutes=('event_minutes','sum'),
    goals=('goals','sum'),assists=('assists','sum'),yellow=('yc','sum'),red=('rc','sum'),
    res_off=('res_off','sum'),res_def=('res_def','sum'),res_tot=('res_tot','sum'),rbig=('rbig','sum'),mbig=('mbig','sum'),
    mxt=('min_x_team','sum'),mxo=('min_x_opp','sum'),first=('date','min'),last=('date','max')).reset_index()
ps['team_elo']=ps.mxt/ps.minutes; ps['opp_elo']=ps.mxo/ps.minutes; ps=ps.drop(columns=['mxt','mxo'])
ps=ps.merge(main,on=['player_id','season']).merge(ncl,on=['player_id','season'])
# team games available (games with appearance data) for main club
tg=pg.groupby(['player_club_id','season']).game_id.nunique().rename('team_games').reset_index().rename(columns={'player_club_id':'club_id'})
ps=ps.merge(tg,on=['club_id','season'],how='left')
ps['league']=ps.club_id.map(club_league)
# positions played
pp=pg.dropna(subset=['pos_played']).groupby(['player_id','season','pos_played']).size().rename('n').reset_index()
tot=pp.groupby(['player_id','season']).n.sum().rename('tot').reset_index()
pp=pp.merge(tot,on=['player_id','season']); pp['sh']=pp.n/pp.tot
top=pp.sort_values('sh',ascending=False).drop_duplicates(['player_id','season'])[['player_id','season','pos_played','sh']].rename(columns={'pos_played':'pos_main','sh':'pos_main_share'})
nposn=pp[pp.sh>=0.15].groupby(['player_id','season']).size().rename('n_pos').reset_index()
ps=ps.merge(top,on=['player_id','season'],how='left').merge(nposn,on=['player_id','season'],how='left')
# player info
pl=pd.read_csv(U+'players.csv',usecols=['player_id','name','date_of_birth','position','sub_position','height_in_cm','foot','country_of_citizenship','country_of_birth','current_club_id','current_club_name','contract_expiration_date','market_value_in_eur','highest_market_value_in_eur','last_season'])
pl['dob']=pd.to_datetime(pl.date_of_birth,errors='coerce'); pl=pl.drop(columns=['date_of_birth'])
ps=ps.merge(pl,on='player_id',how='left')
ps['age']=((pd.to_datetime((ps.season+1).astype(str)+'-01-01')-ps.dob).dt.days/365.25)
ps['bm']=ps.dob.dt.month; ps['bq']=((ps.bm-1)//3+1)
ps.loc[ps.height_in_cm<150,'height_in_cm']=np.nan; ps.loc[ps.height_in_cm>210,'height_in_cm']=np.nan
# valuations
pv=pd.read_csv(U+'player_valuations.csv',usecols=['player_id','date','market_value_in_eur'])
pv['date']=pd.to_datetime(pv.date); pv=pv.sort_values('date')
def val_at(df,datecol,name):
    left=df[['player_id']].copy(); left['key']=pd.to_datetime(datecol); left['i']=np.arange(len(df))
    left=left.dropna(subset=['key']).sort_values('key')
    out=pd.merge_asof(left,pv.rename(columns={'date':'key'}),on='key',by='player_id',direction='backward',tolerance=pd.Timedelta(days=450))
    s=pd.Series(np.nan,index=np.arange(len(df))); s.loc[out.i.values]=out.market_value_in_eur.values
    df[name]=s.values
ps=ps.reset_index(drop=True)
val_at(ps,pd.to_datetime((ps.season+1).astype(str)+'-06-30'),'value_end')
val_at(ps,pd.to_datetime((ps.season).astype(str)+'-07-01'),'value_start')
val_at(ps,pd.to_datetime((ps.season+3).astype(str)+'-06-30'),'value_plus3')
val_at(ps,pd.to_datetime((ps.season+2).astype(str)+'-06-30'),'value_plus2')
ps.to_pickle(OUT+'player_season.pkl')
print(ps.shape); print(ps.groupby('season').size().tail(8).to_string())
print(ps[['value_end','value_start','value_plus3']].notna().mean().round(3).to_string())
print(ps[ps.season==2025][['minutes','age','goals','res_tot','team_elo','value_end']].describe().round(2).to_string())
