import subprocess, json, re
W = '/tmp/v0503/work/'
TOTAL = 79.0
# (clip file, src start, src end or None, abs start, [cue splits])
CLIPS = [
 ('vo1.mp3', 0, None, 6.3),
 ('vo2.mp3', 0, 1.92, 11.2),
 ('vo2.mp3', 1.92, 4.17, 14.3),
 ('vo2.mp3', 4.17, 5.07, 17.4),
 ('vo2.mp3', 5.07, 6.25, 21.3),
 ('vo2.mp3', 6.25, 7.06, 27.3),
 ('vo2.mp3', 7.06, None, 28.8),
 ('vo3.mp3', 0, None, 35.3),
 ('vo4.mp3', 0, None, 51.5),
 ('vo5.mp3', 0, None, 62.3),
 ('vo6.mp3', 0, None, 70.4),
]
def dur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', W + f]).decode())
# cue texts: (clip index range, text, src_from, src_to) -- sentence level, times relative to the clip file
CUES = [
 (0, 0, None, "AI assistants already shop for people. Now they can buy from your store."),
 (1, 0, None, "This is APIbase Integrator."),
 (2, 0, None, "Connect your shop in three quick steps —"),
 (3, 0, None, "your store,"),
 (4, 0, None, "the agreements,"),
 (5, 0, None, "and your wallet."),
 (6, 0, None, "No payment. No gas."),
 (7, 0, 1.73, "You get your own page on APIbase."),
 (7, 1.96, 3.14, "Paste one link on your site —"),
 (7, 3.33, None, "Shopify, WooCommerce, Wix, Tilda, or plain HTML."),
 (8, 0, 2.44, "Now a shopper tells their AI agent what to buy."),
 (8, 2.96, None, "The agent finds your product, gets a quote, and pays in USDC."),
 (9, 0, 3.04, "The money settles straight to your wallet, on Base or Tempo."),
 (9, 3.44, None, "Zero percent fee during the pilot."),
 (10, 0, 1.99, "Let AI agents buy from your store."),
 (10, 2.96, None, "Connect at apibase.pro slash integrator."),
]
# vo6 sentence split from the silence detector

def ts(x):
    h=int(x//3600);m=int(x%3600//60);sec=x%60
    return '%02d:%02d:%06.3f'%(h,m,sec)
def build():
    pieces=[]
    for i,(f,a,b,at) in enumerate(CLIPS):
        end=b if b is not None else dur(f)
        pieces.append((f,a,end,at))
    vtt=['WEBVTT','']
    for (ci,cf,ct,text) in CUES:
        f,a,end,at=pieces[ci]
        c0=at+cf; c1=at+((ct if ct is not None else (end-a)))
        vtt.append('%s --> %s'%(ts(c0),ts(c1+0.15))); vtt.append(text); vtt.append('')
    open('/tmp/v0503/work/captions.vtt','w').write('\n'.join(vtt))
    # voice stem
    inputs=[];fl=[]
    for i,(f,a,end,at) in enumerate(pieces):
        inputs+=['-i',W+f]
        fl.append('[%d:a]atrim=start=%.3f:end=%.3f,asetpts=PTS-STARTPTS,aresample=48000,pan=stereo|c0=c0|c1=c0,adelay=%d|%d[v%d]'%(i,a,end,int(at*1000),int(at*1000),i))
    fl.append(''.join('[v%d]'%i for i in range(len(pieces)))+'amix=inputs=%d:normalize=0:duration=longest,apad=whole_dur=%.2f,atrim=0:%.2f[vm]'%(len(pieces),TOTAL,TOTAL))
    subprocess.check_call(['ffmpeg','-y','-v','error']+inputs+['-filter_complex',';'.join(fl),'-map','[vm]','-ar','48000',W+'voice_raw.wav'])
    # voice -16 LUFS, TP <= -1.5
    o=subprocess.run(['ffmpeg','-hide_banner','-i',W+'voice_raw.wav','-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True).stderr
    m=json.loads(o[o.rindex('{'):o.rindex('}')+1])
    ln='loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true'%(m['input_i'],m['input_tp'],m['input_lra'],m['input_thresh'],m['target_offset'])
    subprocess.check_call(['ffmpeg','-y','-v','error','-i',W+'voice_raw.wav','-af',ln,'-ar','48000',W+'voice.wav'])
    # duck envelope from windows
    wins=[(at-0.25,at+(end-a)+0.45) for (f,a,end,at) in pieces]
    # merge windows closer than 0.8 s
    wins.sort(); mg=[list(wins[0])]
    for w in wins[1:]:
        if w[0]-mg[-1][1]<0.8: mg[-1][1]=max(mg[-1][1],w[1])
        else: mg.append(list(w))
    terms=['clip(min((t-%.3f)/0.25,(%.3f-t)/0.45),0,1)'%(a,b) for a,b in mg]
    env=terms[0]
    for t in terms[1:]: env='max(%s,%s)'%(env,t)
    g=10**(-8/20)
    expr="1-(1-%.4f)*%s"%(g,env)
    open('/tmp/v0503/work/duck_expr.txt','w').write(expr)
    mf=("[0:a]atrim=0:%.2f,asetpts=PTS-STARTPTS,aresample=48000,loudnorm=I=-18:TP=-3:LRA=11,"
        "volume='%s':eval=frame,afade=t=in:st=0:d=1.5,afade=t=out:st=%.2f:d=2.5[m];"
        "[1:a][m]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.84:level=disabled[o]")%(TOTAL,expr.replace(',','\\,'),TOTAL-2.5)
    subprocess.check_call(['ffmpeg','-y','-v','error','-i',W+'music.mp3','-i',W+'voice.wav','-filter_complex',mf,'-map','[o]','-ar','48000','-ac','2',W+'mix.wav'])
    print('windows',[(round(a,2),round(b,2)) for a,b in mg])
build()
