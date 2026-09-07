import { cameraRoll, screenToWorld, PLAYER_HIT_RADIUS } from './game.js';
import { VolumeEnvironment } from './volume-environment.js';
import { WEAPON_PRESENTATION, DEFAULT_THREAT_VARIANT } from './presentation.js';

const W = 1280, H = 720;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = (v, n) => ((v % n) + n) % n;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => reject(new Error(`이미지 요청 시간이 초과되었습니다: ${src}`)),12000);
    image.onload = () => { clearTimeout(timeout); resolve(image); };
    image.onerror = () => { clearTimeout(timeout); reject(new Error(`이미지를 불러올 수 없습니다: ${src}`)); };
    image.src = src;
  });
}

function glowTexture(color,scatter=false) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(scatter?.18:.08, color);
  gradient.addColorStop(scatter?.52:.28, color + (scatter?'c0':'80'));
  gradient.addColorStop(1, color + '00');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,128,128);
  return canvas;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.roll = -.12;
    this.trail = [];
    this.particles = [];
    this.flashes = [];
    this.labels = [];
    this.impactShake=0;
    this.exposure=0;
    this.presentation={threatVariant:DEFAULT_THREAT_VARIANT};
    this.glows = { cyan:glowTexture('#64fbea'), pink:glowTexture('#ff609d'), orange:glowTexture('#ffab54'), white:glowTexture('#dfedff') };
    for(const [mode,{color}] of Object.entries(WEAPON_PRESENTATION))this.glows[mode]=glowTexture(color);
    this.glows.mistCyan=glowTexture('#45ffc1',true);this.glows.mistPink=glowTexture('#ff66b2',true);
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.frozen = false;
    this.lastSceneTime = 0;
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
  }

  async load(onProgress = () => {}) {
    const names = ['player','enemies','enemies-v2','bosses-v2','leaf-surface-v3'];
    const playerRoot = 'assets/art/player/sv01';
    const response = await fetch(`${playerRoot}/manifest.json`);
    if (!response.ok) throw new Error(`SV-01 매니페스트를 불러올 수 없습니다: ${response.status}`);
    const playerManifest = await response.json();
    const sources = [...names.map(name => `assets/art/${name}.png`), ...playerManifest.frames.map(frame => `${playerRoot}/${frame.filename}`)];
    let loaded = 0;
    const images = await Promise.all(sources.map(async src => {
      const image = await loadImage(src);
      onProgress(++loaded,sources.length);
      return image;
    }));
    this.art = Object.fromEntries(names.map((name,i)=>[name,images[i]]));
    this.playerFrames = images.slice(names.length);
    this.environment = new VolumeEnvironment({leafSurface:this.art['leaf-surface-v3']});
  }

  resize() {
    const size = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.max(1, Math.round(size.width * ratio));
    this.canvas.height = Math.max(1, Math.round(size.height * ratio));
    this.scale = Math.min(this.canvas.width / W, this.canvas.height / H);
    this.offsetX = (this.canvas.width - W*this.scale)/2;
    this.offsetY = (this.canvas.height - H*this.scale)/2;
    this.frozen = false;
  }

  screenToWorld(clientX,clientY) {
    const r = this.canvas.getBoundingClientRect();
    const px = (clientX-r.left)*this.canvas.width/r.width;
    const py = (clientY-r.top)*this.canvas.height/r.height;
    const x = (px-this.offsetX)/this.scale - W/2;
    const y = (py-this.offsetY)/this.scale - H/2 + (this.cameraY||0);
    const c = Math.cos(-this.roll), s = Math.sin(-this.roll);
    return {x:x*c-y*s+W/2,y:x*s+y*c+H/2};
  }

  reset() { this.trail.length=0; this.particles.length=0; this.flashes.length=0; this.labels.length=0; this.impactShake=0;this.exposure=0;this.frozen=false; }

  handleEvents(events) {
    for (const e of events) {
      const mode=e.drone?'drone':e.weaponMode in WEAPON_PRESENTATION?e.weaponMode:'normal',palette=WEAPON_PRESENTATION[mode];
      if (e.type === 'shot' && !e.drone) this.flashes.push({x:e.x,y:e.y,life:.105,max:.105,size:e.powered?125:76,color:mode,rgb:palette.rgb,kind:'shot',powered:e.powered});
      if (e.type === 'enemyShot') this.flashes.push({x:e.x,y:e.y,life:.18,max:.18,size:e.boss?100:38,color:'pink',kind:'enemyShot'});
      if (e.type === 'hit') {
        this.burst(e.x,e.y,e.player?38:12,e.player?'cyan':mode,e.player?390:230,.32);
        if(!e.player)this.flashes.push({x:e.x,y:e.y,life:.11,max:.11,size:80,color:mode,rgb:palette.rgb,kind:'hit'});
        if (e.player) this.flashes.push({x:e.x,y:e.y,life:.4,max:.4,size:200,color:'pink',kind:'playerHit'});
      }
      if (e.type === 'explosion') {
        this.burst(e.x,e.y,e.boss?125:42,'orange',e.boss?640:470,e.boss?1.7:.9);
        this.flashes.push({x:e.x,y:e.y,life:e.boss?1.3:.68,max:e.boss?1.3:.68,size:e.boss?600:270,color:'orange',ring:true,kind:'explosion',boss:e.boss,seed:Math.random()*100});
        this.impactShake=Math.max(this.impactShake,e.boss?17:4.5);
        this.exposure=Math.max(this.exposure,e.boss?.24:.075);
        if (e.score) this.labels.push({x:e.x,y:e.y-30,text:`+${e.score}`,life:1.3,max:1.3});
      }
      if(e.type === 'pickup') {
        const color=e.pickupType==='power'?mode:e.pickupType==='drone'?'drone':'cyan';
        this.burst(e.x,e.y,28,color,180,.65);
        this.flashes.push({x:e.x,y:e.y,life:.6,max:.6,size:200,color,rgb:WEAPON_PRESENTATION[color]?.rgb,ring:true,kind:'pickup'});
      }
    }
    if (this.particles.length>850) this.particles.splice(0,this.particles.length-850);
  }

  burst(x,y,count,color,speed,lifetime) {
    for(let i=0;i<count;i++) {
      const a=Math.random()*TAU, v=speed*(.2+Math.random()*.8), life=lifetime*(.5+Math.random()*.5);
      this.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life,max:life,color,size:2+Math.random()*7});
    }
  }

  glow(ctx,x,y,size,color,alpha=1) {
    ctx.globalAlpha=alpha;
    ctx.drawImage(this.glows[color],x-size/2,y-size/2,size,size);
    ctx.globalAlpha=1;
  }

  draw(g,dt=0) {
    if(!this.art || (g.mode==='gameover' && this.frozen)) return;
    const c=this.ctx,t=g.sceneTime,a=g.altitude;
    this.roll=cameraRoll(g);
    this.cameraY=g.cameraY||0;
    this.cameraOffset={x:-Math.sin(this.roll)*this.cameraY,y:-Math.cos(this.roll)*this.cameraY};
    this.environment.update(g,dt);
    c.setTransform(1,0,0,1,0,0); c.fillStyle='#030b15'; c.fillRect(0,0,this.canvas.width,this.canvas.height);
    c.setTransform(this.scale,0,0,this.scale,this.offsetX,this.offsetY);
    c.save(); c.beginPath(); c.rect(0,0,W,H); c.clip();
    const sky=c.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,a>.55?'#082d54':'#142e49');sky.addColorStop(.5,'#164565');sky.addColorStop(1,'#527e91');
    c.fillStyle=sky;c.fillRect(0,0,W,H);
    c.save();
    const shake=this.reducedMotion?0:Math.max(g.shake,this.impactShake);
    c.translate(W/2+Math.sin(t*81)*shake*.5,H/2+Math.cos(t*93)*shake*.35);
    c.rotate(this.roll);c.translate(-W/2,-H/2);
    this.environment.drawBack(c,g,this);
    this.drawAtmosphere(c,t,a);
    if(g.mode==='playing'||g.mode==='entering'||g.mode==='gameover') {
      c.save();c.translate(this.cameraOffset.x,this.cameraOffset.y);
      this.updateEffects(g,dt);
      this.drawTrail(c,g);
      for(const p of g.pickups) this.drawPickup(c,p,t);
      for(const e of g.enemies) this.drawEnemy(c,e,t);
      this.drawBullets(c,g);
      this.drawPlayer(c,g,t);
      this.drawEffects(c);
      c.restore();
    }
    this.environment.drawFront(c,g,this);
    c.save();c.translate(this.cameraOffset.x,this.cameraOffset.y);
    this.drawThreats(c,g);
    this.drawCombatCues(c,g);
    c.restore();
    c.restore();
    this.drawLight(c,t,a,g.player.powerTime>0);
    if(!this.reducedMotion && this.exposure>.001){c.globalAlpha=this.exposure;c.fillStyle='#d4f6ff';c.fillRect(0,0,W,H);c.globalAlpha=1;}
    if(g.mode==='playing' && g.player.hp<=30) {
      const v=c.createRadialGradient(W/2,H/2,180,W/2,H/2,740);
      v.addColorStop(0,'#fa315100');v.addColorStop(1,`rgba(167,16,46,${.22+Math.sin(t*4)*.07})`);
      c.fillStyle=v;c.fillRect(0,0,W,H);
    }
    const vignette=c.createRadialGradient(W/2,H/2,220,W/2,H/2,800);
    vignette.addColorStop(0,'#020b1400');vignette.addColorStop(1,'#020b1460');c.fillStyle=vignette;c.fillRect(0,0,W,H);
    c.restore();
    if(g.mode==='gameover') this.frozen=true;
    this.lastSceneTime=t;
  }

  drawAtmosphere(c,t,a) {
    c.save();c.globalCompositeOperation='screen';
    for(let i=0;i<24;i++) {
      const x=mod(i*211.79-t*(6+i%4),1500)-100;
      const y=mod(i*i*19.31,710);
      c.globalAlpha=(.05+(Math.sin(t*.5+i)+1)*.035)*(a+.25);
      c.fillStyle='#dff5ff';c.fillRect(x,y,i%7===0?2:1,1);
    }
    c.globalAlpha=1;c.restore();
  }

  drawLight(c,t,a,power) {
    c.save();c.globalCompositeOperation='screen';
    const x=1040+Math.sin(t*.05)*80,y=-100+a*130;
    const sun=c.createRadialGradient(x,y,0,x,y,460);
    sun.addColorStop(0,'#dff4ff48');sun.addColorStop(.2,'#b5dcf512');sun.addColorStop(1,'#adcdfa00');
    c.fillStyle=sun;c.fillRect(0,0,W,H);
    for(let i=0;i<2;i++) {
      c.save();c.translate(x+i*90,20);c.rotate(.48+i*.05);c.scale(.3,2.1);
      const beam=c.createRadialGradient(0,100,0,0,100,330);
      beam.addColorStop(0,'#deefff13');beam.addColorStop(.4,'#bfdcf506');beam.addColorStop(1,'#b9dbff00');
      c.fillStyle=beam;c.fillRect(-330,-230,660,660);c.restore();
    }
    if(power) {c.globalAlpha=.04+Math.sin(t*2)*.015;c.fillStyle='#6affbc';c.fillRect(0,0,W,H);}
    c.restore();
  }

  updateEffects(g,dt) {
    if(dt<=0)return;
    this.impactShake*=Math.exp(-dt*13);this.exposure*=Math.exp(-dt*23);
    for(const p of this.trail){p.x-=dt*720*(g.speed/1.3);p.life-=dt;}
    this.trail=this.trail.filter(p=>p.life>0);
    if(g.mode!=='gameover') {
      const angle=g.player.angle*2.4;
      this.trail.push({x:g.player.x-Math.cos(angle)*24,y:g.player.y-Math.sin(angle)*24+3,life:.85});
    }
    for(const p of this.particles){p.x+=(p.vx-85)*dt;p.y+=p.vy*dt;p.vy+=dt*80;p.life-=dt;p.vx*=Math.exp(-dt*.8);}
    this.particles=this.particles.filter(p=>p.life>0);
    for(const f of this.flashes)f.life-=dt;
    this.flashes=this.flashes.filter(f=>f.life>0);
    for(const l of this.labels){l.life-=dt;l.y-=dt*23;l.x-=dt*40;}
    this.labels=this.labels.filter(l=>l.life>0);
  }

  drawTrail(c,g) {
    if(this.trail.length<2)return;
    const points=this.trail,first=points[0],last=points.at(-1),powered=g.player.powerTime>0;
    c.save();c.globalCompositeOperation='lighter';c.lineCap='round';c.lineJoin='round';
    const normals=points.map((p,i)=>{
      const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],len=Math.hypot(b.x-a.x,b.y-a.y)||1;
      return {x:-(b.y-a.y)/len,y:(b.x-a.x)/len};
    });
    for(const [width,color,alpha] of [[13,'#19e89c',.08],[5,'#40ffc0',.26],[2.3,'#6cffd9',.85],[.65,'#e5fff2',.95]]) {
      const gradient=c.createLinearGradient(first.x,first.y,last.x+1,last.y);
      gradient.addColorStop(0,color+'00');gradient.addColorStop(.42,color+'68');gradient.addColorStop(1,color);
      c.fillStyle=gradient;c.globalAlpha=alpha;c.beginPath();
      for(const side of [1,-1]) {
        for(let j=0;j<points.length;j++) {
          const i=side===1?j:points.length-1-j,p=points[i],n=normals[i];
          const thickness=width*Math.pow(p.life/.85,1.45)*(powered?1.35:1);
          const x=p.x+n.x*thickness*side,y=p.y+n.y*thickness*side;
          if(side===1&&j===0)c.moveTo(x,y);else c.lineTo(x,y);
        }
      }
      c.closePath();c.fill();
    }
    for(let i=0;i<2;i++) {
      c.strokeStyle=i?'#cbffec':'#45ffc2';c.lineWidth=.6;c.globalAlpha=.24;c.beginPath();
      for(let j=0;j<points.length;j++) {
        const p=points[j],n=normals[j],wave=Math.sin(j*.3+g.sceneTime*15+i*3)*2.3*p.life;
        const x=p.x+n.x*wave,y=p.y+n.y*wave;
        if(!j)c.moveTo(x,y);else c.lineTo(x,y);
      }
      c.stroke();
    }
    this.glow(c,last.x,last.y,powered?95:60,'cyan',.7);
    c.translate(last.x,last.y);c.rotate(g.player.angle*2.4);c.scale(2.6,.42);this.glow(c,-8,0,31,'cyan',.9);
    c.restore();
  }

  drawPlayer(c,g,t) {
    const p=g.player;if(g.mode==='gameover')return;
    const mode=p.powerTime>0?p.weaponMode:'normal',palette=WEAPON_PRESENTATION[mode];
    c.save();c.translate(p.x,p.y);c.rotate(p.angle*2.4);
    if(p.invincible>0)c.globalAlpha=.55+Math.sin(t*28)*.2;
    // Reuse the game's smoothed vertical tilt: descent 0, neutral 10, ascent 20.
    const bankFrame = Math.round(10 - clamp(p.angle / .48,-1,1) * 10);
    c.drawImage(this.playerFrames[bankFrame],-53,-53,106,106);
    c.globalAlpha=1;
    if(p.powerTime>0||p.invincible>0) {
      c.globalCompositeOperation='lighter';c.strokeStyle=p.powerTime>0?palette.color:'#c3eaff';
      c.lineWidth=1.2;c.globalAlpha=.28+Math.sin(t*5)*.1;
      c.beginPath();c.ellipse(4,0,45,32,0,-1.4,1.4);c.stroke();
      this.glow(c,32,0,p.powerTime>0?65:35,mode,.45);
      if(p.powerTime>0) {
        // Distinct moving nacelles make the three temporary loadouts visible.
        for(const side of [-1,1]) {
          const spread=p.weaponMode==='spread'?25:p.weaponMode==='lance'?13:22+Math.sin(t*6)*7;
          c.globalAlpha=.95;c.fillStyle=palette.core;c.beginPath();c.moveTo(15,side*spread);c.lineTo(-13,side*(spread+4));c.lineTo(-8,side*(spread-3));c.closePath();c.fill();
          this.glow(c,14,side*spread,26,mode,.8);
        }
      }
    }
    c.restore();
    if(p.droneTime>0) {
      for(const direction of [-1,1]){
        const x=p.x-15+Math.sin(t*3)*8,y=p.y+direction*47;
        c.save();c.translate(x,y);c.rotate(p.angle);c.drawImage(this.art.player,-19,-19,38,38);
        c.globalCompositeOperation='lighter';this.glow(c,-12,0,35,'drone',.55);c.restore();
      }
    }
  }

  drawEnemy(c,e,t) {
    let atlas=this.art.enemies,cw=atlas.width/2,ch=atlas.height/2;
    const configs={beetle:[0,0,87],claw:[1,0,108],worm:[0,1,170],boss:[1,1,340]};
    let [column,row,size]=configs[e.type]||configs.beetle;
    let sx=column*cw,sy=row*ch,sw=cw,sh=ch,dw=size,dh=size;
    const variants={wasp:[0,154,156,398,308,76],mantis:[1,117,154,388,361,96],ray:[2,101,141,403,364,118],dragonfly:[3,147,115,401,381,88],orb:[4,176,143,340,321,82],needle:[5,77,161,390,302,112]};
    if(variants[e.type]) {
      const [index,x1,y1,x2,y2,width]=variants[e.type];atlas=this.art['enemies-v2'];cw=atlas.width/3;ch=atlas.height/2;
      sx=(index%3)*cw+x1-14;sy=Math.floor(index/3)*ch+y1-14;sw=x2-x1+28;sh=y2-y1+28;dw=width;dh=dw*sh/sw;
    } else if(e.type==='boss'&&e.bossKind!=='warden') {
      const bosses={carrier:[0,16,101,700,557,300],leviathan:[1,11,213,712,478,360],hive:[2,36,16,709,683,266]};
      const cfg=bosses[e.bossKind]||bosses.carrier;const [index,x1,y1,x2,y2,width]=cfg;
      atlas=this.art['bosses-v2'];cw=atlas.width/3;sx=index*cw+Math.max(0,x1-8);sy=Math.max(0,y1-8);sw=Math.min(cw,x2-x1+16);sh=y2-y1+16;dw=width;dh=dw*sh/sw;
    }
    c.save();c.translate(e.x,e.y);c.rotate(e.angle||0);
    c.drawImage(atlas,sx,sy,sw,sh,-dw/2,-dh/2,dw,dh);
    if(e.flash>0){c.globalCompositeOperation='screen';this.glow(c,0,0,dw*.8,'white',.85);}
    if(e.type==='boss') {
      c.globalCompositeOperation='lighter';this.glow(c,-35,0,95+(e.telegraph||0)*130,'orange',.25+(e.telegraph||0)*.5);
    }
    c.restore();
    if(e.telegraph>0) {
      c.save();c.translate(e.x,e.y);c.globalCompositeOperation='screen';
      const strength=clamp(e.telegraph,0,1);
      this.glow(c,-e.radius*.7,0,50+strength*90,'pink',.25+strength*.65);
      c.strokeStyle='#ff729f';c.globalAlpha=.13+strength*.22;c.lineWidth=e.type==='boss'?2:1;c.setLineDash([8,16]);
      c.beginPath();c.moveTo(-e.radius,0);c.lineTo(Math.cos(e.attackAngle||Math.PI)*1600,Math.sin(e.attackAngle||Math.PI)*1600);c.stroke();
      c.setLineDash([]);c.globalAlpha=.55*strength;c.lineWidth=1;c.beginPath();c.arc(-e.radius*.7,0,26*(1-strength)+7,0,TAU);c.stroke();c.restore();
    }
  }

  drawBullets(c,g) {
    c.save();c.globalCompositeOperation='lighter';c.lineCap='round';
    for(const b of g.bullets) {
      const mode=b.weaponMode in WEAPON_PRESENTATION?b.weaponMode:'normal',palette=WEAPON_PRESENTATION[mode],lance=mode==='lance';
      const len=lance?175:b.powered?92:65,angle=Math.atan2(b.vy,b.vx),dx=Math.cos(angle)*len,dy=Math.sin(angle)*len;
      c.strokeStyle=palette.color;c.globalAlpha=.22;c.lineWidth=lance?11:b.powered?8:5;c.beginPath();c.moveTo(b.x-dx*1.6,b.y-dy*1.6);c.lineTo(b.x,b.y);c.stroke();
      c.globalAlpha=.95;c.lineWidth=lance?3.5:b.powered?2.8:1.7;c.strokeStyle=palette.core;c.beginPath();c.moveTo(b.x-dx,b.y-dy);c.lineTo(b.x,b.y);c.stroke();
      this.glow(c,b.x,b.y,b.powered?44:28,mode,.9);
    }
    for(const b of g.enemyBullets) {
      const size=Math.max(30,b.radius*7),angle=Math.atan2(b.vy,b.vx);
      let neighbors=0;
      if(this.presentation.threatVariant==='C')for(const other of g.enemyBullets){
        if(other!==b&&(other.x-b.x)**2+(other.y-b.y)**2<size*size)neighbors++;
      }
      // Only the outer halo is restrained in dense clusters; the core is unchanged.
      const alpha=(b.arming>0?.3:.7)/Math.sqrt(1+neighbors*.7);
      this.glow(c,b.x,b.y,size,'pink',alpha);
      c.save();c.translate(b.x,b.y);c.rotate(angle);c.scale(2.4,.24);
      this.glow(c,-3,0,size*.8,'pink',alpha*.7);c.restore();
    }
    c.restore();
  }

  drawCombatCues(c,g) {
    c.save();c.lineCap='round';
    for(const b of g.enemyBullets) {
      const angle=Math.atan2(b.vy,b.vx);
      c.globalCompositeOperation='source-over';c.globalAlpha=b.arming>0?.55:1;
      if(this.presentation.threatVariant!=='A') {
        // Smooth local backing, rather than a hard dark outline. Altitude estimates
        // cloud brightness without synchronously reading GPU pixels every frame.
        const brightness=1-Math.min(1,Math.abs(g.altitude-.47)/.5),r=b.radius*2.1;
        const backing=c.createRadialGradient(b.x,b.y,0,b.x,b.y,r);
        backing.addColorStop(0,`rgba(65,16,55,${.28+brightness*.32})`);
        backing.addColorStop(.45,`rgba(65,16,55,${.12+brightness*.18})`);
        backing.addColorStop(1,'rgba(65,16,55,0)');c.fillStyle=backing;c.fillRect(b.x-r,b.y-r,r*2,r*2);
      }
      c.lineWidth=1.5;c.strokeStyle='#ff73b2';c.beginPath();c.moveTo(b.x-Math.cos(angle)*13,b.y-Math.sin(angle)*13);c.lineTo(b.x,b.y);c.stroke();
      c.fillStyle='#ff6dab';c.beginPath();c.arc(b.x,b.y,b.radius*.72,0,TAU);c.fill();
      c.fillStyle='#fff4df';c.beginPath();c.arc(b.x,b.y,Math.max(1.3,b.radius*.32),0,TAU);c.fill();
      if(b.type==='mine') {
        c.strokeStyle=b.arming>0?'#ffc8ea':'#ff62a4';c.globalAlpha=b.arming>0?.4:.85;c.lineWidth=1.5;
        c.beginPath();c.arc(b.x,b.y,b.radius+6+Math.sin(g.sceneTime*8)*2,0,TAU);c.stroke();
      }
    }
    if(g.mode==='playing'){
      // Draw the contrast backing outside the damage core, never over its edge.
      // The former 2.6 arc's 1.5 stroke left only a 1.85 radius clear nucleus.
      c.globalAlpha=1;c.fillStyle='#173c46';
      c.beginPath();c.arc(g.player.x,g.player.y,PLAYER_HIT_RADIUS+1.5,0,TAU);c.fill();
      c.fillStyle='#c8fff0';
      c.beginPath();c.arc(g.player.x,g.player.y,PLAYER_HIT_RADIUS,0,TAU);c.fill();
    }
    for(const f of this.flashes)if(f.kind==='playerHit'){
      c.globalAlpha=f.life/f.max;c.strokeStyle='#651735';c.lineWidth=4;
      c.beginPath();c.arc(f.x,f.y,19+(1-f.life/f.max)*11,0,TAU);c.stroke();
      c.strokeStyle='#ffc6d3';c.lineWidth=1.5;c.stroke();
    }
    c.restore();
  }

  drawThreats(c,g) {
    c.save();c.globalCompositeOperation='screen';
    for(const e of g.enemies) {
      if(!(e.telegraph>0))continue;
      const strength=clamp(e.telegraph,0,1);
      if(e.attackName==='lane-wall') {
        const corners=[{x:0,y:e.safeLane-90},{x:W,y:e.safeLane-90},{x:W,y:e.safeLane+90},{x:0,y:e.safeLane+90}].map(point=>screenToWorld(g,point));
        c.fillStyle='#70ffe7';c.globalAlpha=.055*strength;c.beginPath();
        corners.forEach((point,index)=>index?c.lineTo(point.x,point.y):c.moveTo(point.x,point.y));c.closePath();c.fill();
        c.strokeStyle='#b7ffee';c.globalAlpha=.36*strength;c.lineWidth=1.2;c.setLineDash([12,14]);
        for(const y of [e.safeLane-90,e.safeLane+90]){
          const left=screenToWorld(g,{x:0,y}),right=screenToWorld(g,{x:W,y});
          c.beginPath();c.moveTo(left.x,left.y);c.lineTo(right.x,right.y);c.stroke();
        }
      } else {
        c.strokeStyle='#ff91bb';c.globalAlpha=.19*strength;c.lineWidth=1;c.setLineDash([5,15]);
        c.beginPath();c.moveTo(e.x-e.radius, e.y);c.lineTo(e.x+Math.cos(e.attackAngle||Math.PI)*1600,e.y+Math.sin(e.attackAngle||Math.PI)*1600);c.stroke();
      }
      c.setLineDash([]);
      this.glow(c,e.x-e.radius*.7,e.y,38,'pink',strength*.42);
    }
    c.restore();
  }

  drawPickup(c,p,t) {
    const color=p.type==='power'?'#bfffe6':p.type==='drone'?'#a9e8ff':'#9affdc';
    c.save();c.translate(p.x,p.y);c.globalCompositeOperation='lighter';
    this.glow(c,0,0,66,'cyan',.24+Math.sin(t*4+p.id)*.07);
    c.rotate(.26+Math.sin(t*1.5+p.id)*.12);c.strokeStyle=color;c.lineWidth=2;
    c.strokeRect(-11,-11,22,22);c.globalAlpha=.25;c.lineWidth=6;c.strokeRect(-11,-11,22,22);c.globalAlpha=1;c.lineWidth=2;
    c.beginPath();
    if(p.type==='health'){c.moveTo(-5,0);c.lineTo(5,0);c.moveTo(0,-5);c.lineTo(0,5);}
    else if(p.type==='power'){c.moveTo(2,-7);c.lineTo(-4,1);c.lineTo(2,1);c.lineTo(-2,7);}
    else {c.moveTo(-6,-3);c.lineTo(0,4);c.lineTo(6,-3);c.moveTo(-6,2);c.lineTo(0,7);c.lineTo(6,2);}
    c.stroke();c.restore();
  }

  drawEffects(c) {
    c.save();c.globalCompositeOperation='lighter';
    for(const p of this.particles) {
      const alpha=p.life/p.max;
      this.glow(c,p.x,p.y,p.size*5,p.color,alpha*.8);
      c.strokeStyle=WEAPON_PRESENTATION[p.color]?.core||(p.color==='orange'?'#ffd286':p.color==='cyan'?'#b2ffe5':'#e6f7ff');c.globalAlpha=alpha;c.lineWidth=p.size*.35;
      c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x-p.vx*.025,p.y-p.vy*.025);c.stroke();
    }
    for(const f of this.flashes) {
      const alpha=f.life/f.max;
      this.glow(c,f.x,f.y,f.size*(1+(1-alpha)*.6),f.color,Math.pow(alpha,.7));
      if(f.kind==='shot') {
        const palette=WEAPON_PRESENTATION[f.color]||WEAPON_PRESENTATION.normal;
        c.save();c.translate(f.x,f.y);c.scale(2.8,.22);this.glow(c,0,0,f.size*.9,f.color,alpha*.8);c.restore();
        c.strokeStyle=palette.core;c.globalAlpha=alpha*.85;c.lineWidth=f.powered?3:1.2;
        c.beginPath();c.moveTo(f.x-9,f.y);c.lineTo(f.x+55*alpha,f.y);c.stroke();
        if(f.powered) {
          for(const side of [-1,1]) {
            c.save();c.translate(f.x-24,f.y+side*7);c.scale(1,side);
            c.strokeStyle=palette.color;c.globalAlpha=alpha*.3;c.lineWidth=12;c.beginPath();c.ellipse(0,0,57,65,0,-1.6,-.08);c.stroke();
            c.strokeStyle=palette.core;c.globalAlpha=alpha*.95;c.lineWidth=2.4;c.stroke();c.restore();
          }
        }
      }
      if(f.kind==='explosion') {
        const age=1-alpha,hot=Math.pow(alpha,3);
        // A rapid white core, separate turbulent fire lobes and a horizontal
        // flare have independent decay, so impacts do not become soft blobs.
        for(let i=0;i<7;i++) {
          const angle=i*TAU/7+f.seed,r=f.size*.2*Math.sin(age*1.8)*(1+Math.sin(i*9.3)*.25);
          const x=f.x+Math.cos(angle)*r,y=f.y+Math.sin(angle)*r;
          this.glow(c,x,y,f.size*(.22+age*.15),'orange',alpha*.65);
          this.glow(c,x,y,f.size*.15,'white',hot*.9);
        }
        c.save();c.translate(f.x,f.y);c.scale(4.8,.11);this.glow(c,0,0,f.size*.8,'orange',hot*.65);c.restore();
        c.save();c.translate(f.x,f.y);c.scale(.14,2);this.glow(c,0,0,f.size*.6,'white',hot*.8);c.restore();
        c.globalAlpha=hot;c.fillStyle='#fffbea';c.beginPath();
        for(let i=0;i<24;i++) {
          const angle=i*TAU/24,r=f.size*(i%2?.025:.14)*hot;
          const x=f.x+Math.cos(angle)*r,y=f.y+Math.sin(angle)*r;
          if(!i)c.moveTo(x,y);else c.lineTo(x,y);
        }
        c.closePath();c.fill();
      }
      if(f.ring){c.strokeStyle=WEAPON_PRESENTATION[f.color]?.core||(f.color==='cyan'?'#91ffe6':'#ffdfad');c.globalAlpha=alpha*alpha*.7;c.lineWidth=3*alpha;c.beginPath();c.ellipse(f.x,f.y,(1-alpha)*f.size*.65,(1-alpha)*f.size*.49,-.12,0,TAU);c.stroke();}
    }
    c.restore();c.save();c.font='11px Consolas, monospace';c.textAlign='center';c.fillStyle='#fff2b8';
    for(const l of this.labels){c.globalAlpha=Math.min(1,l.life*2);c.fillText(l.text,l.x,l.y);}c.restore();
  }
}
