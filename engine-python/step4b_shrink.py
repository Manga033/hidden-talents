import os
OUT=os.environ.get('HT_OUT','/home/claude/out').rstrip('/')+'/'
import pandas as pd, numpy as np
from engine import GROUPS
ps=pd.read_pickle(OUT+'player_season.pkl')
d=ps[(ps.season>=2015)&(ps.minutes>=300)&ps.position.isin(GROUPS)].copy()
d['grp']=d.position.map(GROUPS); d['m90']=d.minutes/90; d['ga']=d.goals+d.assists
d['event_m90']=d.event_minutes/90 if 'event_minutes' in d else d.m90
d['cards']=d.yellow+2*d.red
d['mbig90']=d.mbig/90
out={}
def vc(rate,m90,w):
    r=rate-np.average(rate,weights=m90); y=r**2; X=np.column_stack([np.ones(len(r)),1/m90])
    W=1/(1+1/m90)**2
    b=np.linalg.lstsq(X*np.sqrt(W)[:,None],y*np.sqrt(W),rcond=None)[0]
    return max(b[0],1e-6),max(b[1],1e-6)
for name,num,den in [('off90','res_off','event_m90'),('def90','res_def','event_m90'),('tot90','res_tot','event_m90'),('big90','rbig','mbig90'),('ga90','ga','m90'),('disc90','cards','m90')]:
    ks=[]
    for g,s in d.groupby('grp'):
        s=s[s[den]>0.5]
        tau2,s2=vc(s[num]/s[den],s[den].values,None); ks.append((g,round(tau2,4),round(s2,3),round(s2/tau2,1)))
    out[name]=ks; print(name,ks)
