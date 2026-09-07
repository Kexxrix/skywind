const W=1280,H=720,PAD=260;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mod=(v,n)=>((v%n)+n)%n;
const smooth=(a,b,v)=>{const x=clamp((v-a)/(b-a),0,1);return x*x*(3-2*x);};
const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
function surface(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}

// Complementary premultiplied edge weights make the wrapped seam continuous.
// This is a runtime texture cache; generated source files remain untouched.
function periodicTexture(image) {
  const edge=.16,stride=Math.round(image.width*(1-edge));
  const feather=surface(image.width,image.height),c=feather.getContext('2d');
  c.drawImage(image,0,0);c.globalCompositeOperation='destination-in';
  const mask=c.createLinearGradient(0,0,image.width,0);
  mask.addColorStop(0,'#fff0');mask.addColorStop(edge,'#fff');mask.addColorStop(1-edge,'#fff');mask.addColorStop(1,'#fff0');
  c.fillStyle=mask;c.fillRect(0,0,image.width,image.height);
  const result=surface(stride,image.height),r=result.getContext('2d');r.globalCompositeOperation='lighter';
  r.drawImage(feather,-stride,0);r.drawImage(feather,0,0);
  return result;
}

function cloudTile(atlas,index) {
  const size=atlas.width/2,tile=surface(512,512),c=tile.getContext('2d');
  c.drawImage(atlas,(index%2)*size,Math.floor(index/2)*size,size,size,0,0,512,512);
  c.globalCompositeOperation='destination-in';
  for(const vertical of [false,true]) {
    const mask=c.createLinearGradient(0,0,vertical?0:512,vertical?512:0);
    mask.addColorStop(0,'#fff0');mask.addColorStop(.08,'#fff');mask.addColorStop(.92,'#fff');mask.addColorStop(1,'#fff0');
    c.fillStyle=mask;c.fillRect(0,0,512,512);
  }
  return tile;
}

export class Environment {
  constructor(art) {
    this.forest=periodicTexture(art['canopy-v2']);
    this.foliage=periodicTexture(art['foliage-v2']);
    this.oldForest=periodicTexture(art.forest);
    this.palms=periodicTexture(art['palms-blender-v2']);
    this.clouds=Array.from({length:4},(_,i)=>cloudTile(art['clouds-v2'],i));
    this.banks=new Map();
    this.distance=0;this.occlusion=0;this.front=[];
    // A half-resolution light mask retains full-resolution cloud silhouettes.
    this.mask=surface((W+PAD*2)/2,(H+PAD*2)/2);
    this.light=surface(this.mask.width,this.mask.height);
  }

  update(g,dt){this.distance+=dt*(g.speed||1.3)/1.3;}

  ribbon(c,image,speed,width,y,height,alpha=1) {
    c.globalAlpha=alpha;
    const start=-mod(this.distance*speed,width)-PAD;
    for(let x=start;x<W+PAD;x+=width)c.drawImage(image,x,y,width+.5,height);
    c.globalAlpha=1;
  }

  bank(c,{speed,spacing,width,y,alpha=1,seed=0,scale=1,near=false}) {
    let bank=this.banks.get(seed);
    if(!bank) {
      const period=spacing*4,height=Math.ceil(width*1.2*.84*scale+150),ratio=.6;
      const texture=surface(Math.ceil(period*ratio),Math.ceil(height*ratio)),ctx=texture.getContext('2d');
      ctx.scale(ratio,ratio);
      for(let id=-2;id<6;id++) {
        const n=mod(id,4),random=hash(n+seed),variant=Math.floor(hash(n+seed+8)*4);
        const w=width*(.8+random*.4),h=w*(variant===0?.68:.84)*scale;
        const x=id*spacing+hash(n+seed+15)*spacing*.18,yy=hash(n+seed+2)*150;
        ctx.drawImage(this.clouds[variant],x,yy,w,h);
      }
      const sample=surface(512,Math.ceil(height/period*512)),s=sample.getContext('2d');s.drawImage(texture,0,0,sample.width,sample.height);
      bank={texture,period,height,alpha:s.getImageData(0,0,sample.width,sample.height).data,sampleW:sample.width,sampleH:sample.height};
      this.banks.set(seed,bank);
    }
    const start=-mod(this.distance*speed,bank.period);
    c.globalAlpha=alpha;
    for(let x=start;x<W+PAD;x+=bank.period) {
      c.drawImage(bank.texture,x,y-75,bank.period+.7,bank.height);
      if(near)this.front.push({x,y:y-75,w:bank.period,h:bank.height,bank,alpha});
    }
    if(start>-PAD) {
      c.drawImage(bank.texture,start-bank.period,y-75,bank.period+.7,bank.height);
      if(near)this.front.push({x:start-bank.period,y:y-75,w:bank.period,h:bank.height,bank,alpha});
    }
    c.globalAlpha=1;
  }

  drawBack(c,g) {
    const a=g.altitude,ground=1-smooth(.42,.85,a);
    const forestY=-200+a*850;
    this.ribbon(c,this.oldForest,110,1450,-240+a*780,730,ground*.42);
    this.ribbon(c,this.forest,350,1770,forestY,1080,ground);
    this.ribbon(c,this.foliage,670,1440,315+a*850,650,ground*.87);
    // Cloud decks slide from overhead to below the corridor through an ascent.
    const cloudY=-1100+a*1400;
    this.bank(c,{speed:135,spacing:390,width:750,y:cloudY-110,alpha:.45,seed:13,scale:.7});
    this.bank(c,{speed:215,spacing:590,width:1020,y:cloudY,alpha:.73,seed:31,scale:.86});
    this.bank(c,{speed:320,spacing:670,width:1160,y:cloudY+160,alpha:.92,seed:79});
    // A distant lower cloud ocean closes gaps without repeating a single peak.
    if(a>.45)this.bank(c,{speed:170,spacing:390,width:800,y:530+(1-a)*320,alpha:smooth(.45,.75,a),seed:171,scale:.6});
    c.save();c.globalCompositeOperation='screen';c.lineWidth=.65;c.strokeStyle='#c5ecff';
    for(let i=0;i<30;i++) {
      const depth=hash(i+81),x=mod(i*171-this.distance*(750+depth*950),1900)-350,y=hash(i+14)*1100-190;
      c.globalAlpha=.025+depth*.035;c.beginPath();c.moveTo(x,y);c.lineTo(x+70+depth*210,y);c.stroke();
    }
    c.restore();
  }

  drawFront(c,g,renderer) {
    const a=g.altitude,p=g.player,ground=1-smooth(.3,.7,a);
    if(ground>.005) {
      this.ribbon(c,this.palms,1080,1850,455+a*740,710,ground*.82);
      this.ribbon(c,this.foliage,1380,2300,445+a*850,970,ground);
    }
    this.front.length=0;
    // At the deck crossing the dense, genuinely opaque cloud cores pass IN FRONT
    // of all craft. At high altitude only their tops enter the lower corridor.
    const immersion=Math.exp(-Math.pow((a-.48)/.24,2));
    const wave=Math.sin(g.sceneTime*.73)*55;
    this.bank(c,{speed:510,spacing:900,width:1170,y:-980+a*1820+wave,alpha:.25+immersion*.57,seed:213,near:true});
    this.bank(c,{speed:760,spacing:1510,width:1360,y:-870+a*1830-wave,alpha:.17+immersion*.66,seed:497,near:true});
    this.occlusion=0;
    for(const q of this.front) {
      const b=q.bank,x=Math.floor((p.x-q.x)/q.w*b.sampleW),y=Math.floor((p.y-q.y)/q.h*b.sampleH);
      if(x>=0&&x<b.sampleW&&y>=0&&y<b.sampleH) this.occlusion=1-(1-this.occlusion)*(1-b.alpha[(y*b.sampleW+x)*4+3]/255*q.alpha);
    }
    if(g.mode==='title')return;
    const mask=this.mask.getContext('2d'),light=this.light.getContext('2d');
    mask.setTransform(1,0,0,1,0,0);mask.clearRect(0,0,this.mask.width,this.mask.height);
    mask.setTransform(.5,0,0,.5,PAD*.5,PAD*.5);
    for(const q of this.front){mask.globalAlpha=q.alpha;mask.drawImage(q.bank.texture,q.x,q.y,q.w,q.h);}
    mask.globalAlpha=1;
    light.setTransform(1,0,0,1,0,0);light.globalCompositeOperation='source-over';light.clearRect(0,0,this.light.width,this.light.height);
    light.setTransform(.5,0,0,.5,PAD*.5,PAD*.5);light.globalCompositeOperation='lighter';
    for(const f of renderer.flashes) {
      const color=f.color==='cyan'?'mistCyan':f.color==='pink'?'mistPink':f.color;
      const size=f.kind==='shot'?(f.powered?660:390):f.size*2.5;
      renderer.glow(light,f.x,f.y,size,color,Math.pow(f.life/f.max,.6)*.95);
    }
    if(g.mode!=='gameover')renderer.glow(light,p.x-24,p.y,100,'cyan',.16);
    for(let i=0;i<g.bullets.length;i+=3){const b=g.bullets[i];renderer.glow(light,b.x,b.y,b.powered?210:100,'mistCyan',b.powered?.5:.25);}
    for(const b of g.enemyBullets)renderer.glow(light,b.x,b.y,100,'mistPink',.36);
    for(const e of g.enemies)if(e.telegraph>0)renderer.glow(light,e.x-e.radius*.7,e.y,180,'pink',e.telegraph*.65);
    light.setTransform(1,0,0,1,0,0);light.globalCompositeOperation='destination-in';light.drawImage(this.mask,0,0);
    c.save();c.globalCompositeOperation='screen';c.drawImage(this.light,-PAD,-PAD,W+PAD*2,H+PAD*2);c.restore();
  }
}
