"""Static asset QA and honestly labelled concept-fit sheets, not game execution."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,hashlib,math,shutil
ROOT=Path(__file__).resolve().parents[1]
REF=ROOT.parents[1]/'skywind-reference-8f9277c'
REP=ROOT.parent/'interceptor-representative'
REG=['beetle','dragonfly','wasp','mantis','orb','claw','ray','worm','needle']
BOSS=['warden','carrier','lancer','bastion','apex']
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
f=ImageFont.truetype(FONT,15);sm=ImageFont.truetype(FONT,12)
def text(draw,xy,value,color=(211,226,240),font=sm):draw.text(xy,value,fill=color,font=font)
def paste_center(canvas,image,center,w):
    im=image.resize((w,w),Image.Resampling.LANCZOS);canvas.alpha_composite(im,(round(center[0]-w/2),round(center[1]-w/2)))
def load(role,state='neutral'):return Image.open(ROOT/'renders'/f'{role}-{state}.png').convert('RGBA')
def manifest(role):return json.loads((ROOT/(role+'-manifest.json')).read_text())

# The approved representative remains byte-identical; this is only an adapter copy.
shutil.copy2(REP/'renders/int01-neutral.png',ROOT/'renders/beetle-neutral.png')
shutil.copy2(REP/'int01-wedge.blend',ROOT/'sources/beetle.blend')
shutil.copy2(REP/'generator.py',ROOT/'representative_generator.py')
m=json.loads((REP/'manifest.json').read_text());m['approvalStatus']='representative-parent-and-independent-approved';m['source']='sources/beetle.blend';m['generator']='representative_generator.py';m['states']['neutral']['file']='renders/beetle-neutral.png';m['states']['neutral']['coreExposed']=False;m['states']['neutral']['neutralBonusDamage']=False
m['states']['neutral']['weakpointActivation']='Neutral core is a visual attachment marker only; no bonus damage.'
(ROOT/'beetle-manifest.json').write_text(json.dumps(m,indent=2))

allm=[];checks=[];failures=[]
for role in REG+BOSS:
    m=manifest(role);allm.append(m)
    m['displayWidthStatus']='fixed_by_locallead' if role=='beetle' else 'provisional_for_locallead_final_adaptation'
    m['displayWidthSource']='Locallead explicit 87-unit contract' if role=='beetle' else 'Art concept-fit proposal only; final runtime width is locallead responsibility'
    m['approvalStatus']='representative-parent-and-independent-approved' if role=='beetle' else 'parent-art-direction-approved; full-family-independent-and-runtime-QA-pending'
    (ROOT/(role+'-manifest.json')).write_text(json.dumps(m,indent=2))
    for key,path in [('blend',ROOT/m['source']),('generator',ROOT/m['generator'])]:
        if hashlib.sha256(path.read_bytes()).hexdigest()!=m['sha256'][key]:failures.append({'role':role,'failure':key+' source hash mismatch'})
    for state,st in m['states'].items():
        path=ROOT/st['file'];im=Image.open(path).convert('RGBA');bb=im.getbbox();h=hashlib.sha256(path.read_bytes()).hexdigest()
        expected=st.get('sha256') or m.get('sha256',{}).get('png')
        anchors=st['muzzlesPixels']+st['nozzlesPixels']+[st['corePixels']]
        row={'role':role,'state':state,'rgba':im.mode=='RGBA','size':list(im.size),'alphaBoundsPixels':bb,'transparentBorder':bool(bb and bb[0]>0 and bb[1]>0 and bb[2]<im.width and bb[3]<im.height),'sha256Matches':h==expected,'anchorsWithinCanvas':all(0<=p[0]<im.width and 0<=p[1]<im.height for p in anchors),'coreVisibleFromCamera':st.get('coreVisibleFromCamera'),'coreCameraRayFirstMesh':st.get('coreCameraRayFirstMesh'),'visibleSizeAtDisplayWidth':[round((bb[2]-bb[0])*m['displayWidth']/im.width,3),round((bb[3]-bb[1])*m['displayWidth']/im.width,3)]}
        if not all(row[k] for k in ['rgba','transparentBorder','sha256Matches','anchorsWithinCanvas']):failures.append(row)
        if role in BOSS and st.get('coreVisibleFromCamera')!=(state=='open'):failures.append({'role':role,'state':state,'failure':'core visibility does not match shutter state','actual':st.get('coreCameraRayFirstMesh')})
        checks.append(row)
index={'version':1,'production':'Actual Blender geometry / Cycles RGBA','approvalStatus':'Parent art direction approved for runtime integration; full-family independent/runtime QA pending','roles':REG+BOSS,'regularRoles':REG,'bossRoles':BOSS,'stateCount':len(checks),'decodedRGBABytes':sum(m['width']*m['height']*4*len(m['states']) for m in allm),'displayWidthPolicy':'Only beetle 87 is fixed. All other display widths are provisional and may be changed in metadata without rerendering.','coordinateContract':{'imagePixelOrigin':'top-left','pivot':'fixed center','facing':'left','geometryForward':'-X','worldUp':'+Z'},'neutralCorePolicy':'Visible cyan markers in neutral never imply active bonus damage. Runtime combat state owns activation.','runtimeAcceptance':'Pending locallead game integration and actual runtime QA.','assets':allm}
(ROOT/'family-manifest.json').write_text(json.dumps(index,indent=2))
(ROOT/'validation.json').write_text(json.dumps({'staticChecks':checks,'failures':failures,'allStaticChecksPassed':not failures,'limitations':['These checks are asset validation, not actual runtime acceptance','Only neutral/open endpoint renders are exported; editable source has frame 1 to 21 mechanisms','Runtime owns authoritative hull and weakpoint collision semantics']},indent=2))

# Neutral silhouettes at readable inspection size, with no composite claimed as execution.
sheet=Image.new('RGBA',(960,1000),(13,21,32,255));d=ImageDraw.Draw(sheet)
text(d,(18,12),'SKYWIND / NINE REGULAR ROLES / ACTUAL 3D',font=f)
text(d,(18,36),'Inspection thumbnails; native game-scale comparison is in regular-game-scale.png')
for i,role in enumerate(REG):
    x=(i%3)*320;y=58+(i//3)*312;paste_center(sheet,load(role),(x+160,y+142),310)
    text(d,(x+18,y+273),role+' / canvas '+str(manifest(role)['displayWidth']),font=f)
text(d,(18,978),'Concept assets only. Original SV-01/player/pilot files are unchanged.')
sheet.convert('RGB').save(ROOT/'review/regular-family.png')

# A compact two-state boss sheet; clearly declares thumbnails rather than game size.
sheet=Image.new('RGBA',(1280,620),(13,21,32,255));d=ImageDraw.Draw(sheet)
text(d,(18,12),'SKYWIND / FIVE BOSS MECHANISMS / ACTUAL 3D',font=f)
text(d,(18,37),'Uniform review thumbnails, not native game scale. Top: neutral closed. Bottom: physical open/deployed.')
for i,role in enumerate(BOSS):
    paste_center(sheet,load(role),(128+i*256,196),246)
    paste_center(sheet,load(role,'open'),(128+i*256,464),246)
    text(d,(i*256+15,302),role+' / closed',font=f);text(d,(i*256+15,570),'open / core uncovered',font=sm)
text(d,(18,602),'Core anchors come from actual model empties. No full-body glow or thrust flame is baked.')
sheet.convert('RGB').save(ROOT/'review/boss-mechanisms.png')

# All regular units at exact displayWidth. Background crops are historical references.
sheet=Image.new('RGBA',(1280,490),(13,21,32,255));d=ImageDraw.Draw(sheet)
text(d,(18,12),'REGULAR ROLES / 1 PIXEL = 1 GAME UNIT',font=f)
text(d,(18,38),'Historical day/night background concept-fit composites, not game execution screenshots')
pl=Image.open(REF/'sv01_bank_10_neutral_0.png').convert('RGBA')
for row,(fn,label) in enumerate([('11-final-controlled-day.jpg','DAY'),('10-final-controlled-night.jpg','NIGHT')]):
    bg=Image.open(REF/fn).convert('RGBA').crop((0,285,1280,480));dd=ImageDraw.Draw(bg)
    text(dd,(12,8),label,font=f);x=6
    paste_center(bg,pl,(x+53,96),106);text(dd,(x+17,160),'SV-01 106');x+=125
    for role in REG:
        w=manifest(role)['displayWidth'];paste_center(bg,load(role),(x+w/2,96),w);text(dd,(x+2,160),role+' '+str(w));x+=w+11
    sheet.alpha_composite(bg,(0,68+row*205))
text(ImageDraw.Draw(sheet),(18,478),'Source canvases and pivots are fixed; no per-frame crop or recenter.')
sheet.convert('RGB').save(ROOT/'review/regular-game-scale.png')

# Bosses at their proposed actual runtime sizes, on day and night backgrounds.
for fn,label in [('11-final-controlled-day.jpg','day'),('10-final-controlled-night.jpg','night')]:
    sheet=Image.open(REF/fn).convert('RGBA').crop((0,120,1280,840));d=ImageDraw.Draw(sheet)
    # Keep historical HUD/player pixels intact; use their open central background areas.
    positions=[(470,238),(805,238),(1130,238),(560,541),(963,541)]
    for role,center in zip(BOSS,positions):
        m=manifest(role);paste_center(sheet,load(role,'open'),center,m['displayWidth']);text(d,(center[0]-70,center[1]+145),role+' '+str(m['displayWidth']),font=f)
    text(d,(20,670),'BOSS GAME-SCALE CONCEPT FIT / '+label.upper()+' / historical screenshot composite, not game execution',font=f)
    sheet.convert('RGB').save(ROOT/'review'/f'boss-game-scale-{label}.png')

print(json.dumps({'roles':len(allm),'states':len(checks),'staticFailures':failures,'decodedMiB':round(index['decodedRGBABytes']/1024**2,3)},indent=2))
