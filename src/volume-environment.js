import { Terrain3D } from './terrain3d.js';

const W=1280,H=720,PAD=180,GW=W+2*PAD,GH=H+2*PAD;
// Shape controls require setCloudTuning(..., {rebake:true}); optical controls are live.
export const CLOUD_TUNING=Object.freeze({
  coverage:.52, peakHeight:226, edgeErosion:.065,
  centralNearOptical:.65, nearExtinction:.045, farExtinction:.34,
});
const norm=v=>{const d=Math.hypot(...v);return v.map(x=>x/d);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
function inverse(matrix) {
  const a=Array.from({length:4},(_,r)=>Array.from({length:8},(_,c)=>c<4?matrix[c*4+r]:Number(c-4===r)));
  for(let c=0;c<4;c++){let pivot=c;for(let r=c+1;r<4;r++)if(Math.abs(a[r][c])>Math.abs(a[pivot][c]))pivot=r;[a[c],a[pivot]]=[a[pivot],a[c]];const d=a[c][c];for(let j=0;j<8;j++)a[c][j]/=d;for(let r=0;r<4;r++){if(r===c)continue;const f=a[r][c];for(let j=0;j<8;j++)a[r][j]-=a[c][j]*f;}}
  return new Float32Array(Array.from({length:16},(_,i)=>a[i%4][4+Math.floor(i/4)]));
}
function cameraMatrix(position,forward) {
  const right=norm(cross(forward,[0,1,0])),up=cross(right,forward),back=forward.map(x=>-x);
  const view=new Float32Array([right[0],up[0],back[0],0,right[1],up[1],back[1],0,right[2],up[2],back[2],0,-dot(right,position),-dot(up,position),-dot(back,position),1]);
  const f=1/(Math.tan(25*Math.PI/180)*GH/H),aspect=GW/GH,near=.4,far=900;
  const projection=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);
  return {vp:multiply(projection,view),right,up,f};
}

const vertex=`#version 300 es
precision highp float;
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0,1);}`;

function program(gl,fragment) {
  const p=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]) {
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(`3D 배경 셰이더: ${gl.getShaderInfoLog(shader)}`);
    gl.attachShader(p,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  return {p,uniforms:new Map()};
}
function uniform(gl,p,name){if(!p.uniforms.has(name))p.uniforms.set(name,gl.getUniformLocation(p.p,name));return p.uniforms.get(name);}

const noiseFragment=`#version 300 es
precision highp float;
in vec2 uv;out vec4 color;uniform float slice;
vec3 hash3(vec3 p){p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));return fract(sin(p)*43758.5453);}
float value(vec3 p,float period){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float n=0.;for(int z=0;z<2;z++)for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec3 o=vec3(x,y,z);vec3 w=mix(1.-f,f,o);n+=hash3(mod(i+o,period)).x*w.x*w.y*w.z;}return n;}
float worley(vec3 p,float period){vec3 i=floor(p),f=fract(p);float d=2.;for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec3 o=vec3(x,y,z);vec3 delta=o+hash3(mod(i+o,period))-f;d=min(d,dot(delta,delta));}return 1.-clamp(sqrt(d),0.,1.);}
void main(){vec3 p=vec3(uv,slice);float v=value(p*4.,4.)*.57+value(p*8.,8.)*.28+value(p*16.,16.)*.15;float w=worley(p*8.,8.);color=vec4(v,w,worley(p*16.,16.),value(p*32.,32.));}`;

const common=`
precision highp float;
precision highp sampler3D;
in vec2 uv;
uniform sampler2D terrainColor,terrainDepth,cloudColor;
uniform sampler3D volumeNoise,cloudVolume;
uniform mat4 inverseVP,viewProjection;
uniform vec3 camera,forward,sun;
uniform float time,segment,altitude,frameTravel;
uniform float cloudCoverage,peakHeight,edgeErosion,centralNearOptical,nearExtinction,farExtinction;
uniform vec3 lightPos[5],lightColor[5];
uniform float lightRange[5];
const float cloudPeriod=1024.;
const float cloudFloor=48.,cloudCeiling=238.;
vec3 ray(){vec4 p=inverseVP*vec4(uv*2.-1.,1,1);return normalize(p.xyz/p.w-camera);}
float groundDistance(){float d=texture(terrainDepth,uv).r;if(d>.99999)return 900.;vec4 p=inverseVP*vec4(uv*2.-1.,d*2.-1.,1);return length(p.xyz/p.w-camera);}
vec3 sky(vec3 rd){float horizon=pow(1.-max(rd.y,0.),5.);vec3 c=mix(vec3(.025,.11,.23),vec3(.21,.37,.50),horizon);float light=pow(max(dot(rd,sun),0.),24.);return c+vec3(.33,.38,.40)*light;}
vec3 bankHash(vec2 cell){
  vec3 p=fract(vec3(cell.x,cell.y,cell.x)*vec3(.1031,.1030,.0973));
  p+=dot(p,p.yxz+33.33);
  return fract((p.xxy+p.yzz)*p.zyx);
}
float ellipsoid(vec3 p,vec3 r){return (length(p/r)-1.)*min(r.x,min(r.y,r.z));}
float joinBanks(float a,float b,float width){float h=max(width-abs(a-b),0.)/width;return min(a,b)-h*h*width*.25;}
float density(vec3 p){
  if(p.y<cloudFloor||p.y>cloudCeiling)return 0.;
  // Rounded solids define the main silhouette. There is no shared top plane:
  // a small number of unequal ellipsoids form each bank, with occasional crowns.
  // Neighbour cells and wrapped seeds make the 1024-unit world tile seamless.
  const float cellSize=256.;
  // A medium-scale world-space displacement breaks the visible primitive faces;
  // the bank seeds, positions and crown heights remain the large-scale scaffold.
  vec3 billowNoise=texture(volumeNoise,p/cloudPeriod*vec3(3.,3.,3.)+vec3(.29,.43,.17)).rgb;
  vec3 shapePoint=p+(billowNoise.gbr-.43)*vec3(22.,18.,28.);
  vec2 cell=floor(shapePoint.xz/cellSize);
  float shapeDistance=240.;
  for(int z=-1;z<=1;z++)for(int x=-1;x<=1;x++){
    vec2 id=cell+vec2(float(x),float(z));
    vec3 seed=bankHash(mod(id,4.));
    bool mainBank=seed.z<=clamp(cloudCoverage+.16,.1,.95);
    vec3 variety=bankHash(mod(id,4.)+vec2(11.,29.));
    vec2 center=(id+.5+(seed.xy-.5)*.28)*cellSize;
    vec2 delta=shapePoint.xz-center;
    if(dot(delta,delta)>210.*210.)continue;
    vec2 axis=normalize(seed.xy-.5+vec2(.002,.003));
    vec2 local=vec2(dot(delta,axis),dot(delta,vec2(-axis.y,axis.x)));
    float base=75.+seed.x*17.;
    vec3 q=vec3(local.x,shapePoint.y-base,local.y);
    // Sparse lower satellite banks add a smaller depth tier among the tall banks.
    if(!mainBank){
      float small=ellipsoid(q-vec3(0.,-3.,0.),vec3(47.+variety.y*13.,18.,37.+variety.z*9.));
      small=joinBanks(small,ellipsoid(q-vec3(-19.,9.,-3.),vec3(27.,25.,25.)),6.);
      small=joinBanks(small,ellipsoid(q-vec3(22.,7.,5.),vec3(26.,23.,23.)),6.);
      small+=8.;
      // Low satellite banks can pass close to the camera too. Their three base
      // ellipsoids are an interior scaffold, not the final smooth visible face.
      for(int l=0;l<10;l++){
        vec3 bud=bankHash(mod(id,4.)+vec2(float(l)*19.+67.,float(l)*13.+53.));
        float angle=(float(l)+bud.z*.55)*.628319;
        vec3 offset=vec3(cos(angle)*(27.+bud.x*12.),4.+bud.y*23.,sin(angle)*(21.+bud.z*10.));
        small=joinBanks(small,ellipsoid(q-offset,vec3(14.+bud.y*7.,13.+bud.z*8.,14.+bud.x*7.)),3.8);
      }
      shapeDistance=min(shapeDistance,small);continue;
    }
    // Loose lower shoulders connect some banks into a broken middle/far layer;
    // they are world geometry, not a screen-space strip or a density reduction.
    if(variety.y>.26){
      float shoulder=ellipsoid(q-vec3(-15.,-10.,9.),vec3(133.+seed.y*33.,15.+variety.z*4.,80.+seed.x*24.));
      shoulder=joinBanks(shoulder,ellipsoid(q-vec3(90.,-4.,-10.),vec3(50.,21.,48.)),6.);
      shapeDistance=min(shapeDistance,shoulder);
    }
    q.xz*=vec2(1.15,1.12);
    float tall=pow(variety.x,1.7);
    float crownRadius=30.+tall*23.;
    float crownCenter=min(30.+tall*52.,peakHeight-base-crownRadius-5.);
    float bank=ellipsoid(q,vec3(78.+seed.y*28.,23.+variety.y*7.,54.+variety.z*24.));
    bank=joinBanks(bank,ellipsoid(q-vec3(-35.,18.,-8.),vec3(49.+variety.z*12.,37.+seed.y*8.,44.+seed.x*9.)),12.);
    bank=joinBanks(bank,ellipsoid(q-vec3(33.,24.,13.),vec3(44.+seed.x*12.,41.+variety.z*8.,43.+seed.y*10.)),12.);
    bank=joinBanks(bank,ellipsoid(q-vec3(-15.+variety.y*28.,crownCenter,-5.+seed.x*13.),vec3(49.+variety.z*18.,crownRadius,46.+seed.y*17.)),11.);
    // Keep the large bodies as an interior scaffold, so medium billows define
    // the visible surface instead of exposing the smooth primitive faces.
    bank+=10.;
    // Attached billows give the solid a scalloped silhouette without punching
    // high-frequency holes. Their positions/scales differ for every bank.
    for(int l=0;l<10;l++){
      vec3 bud=bankHash(mod(id,4.)+vec2(float(l)*13.+41.,float(l)*7.+17.));
      float angle=(float(l)+bud.x*.55)*.628319;
      vec3 offset=vec3(cos(angle)*(57.+bud.y*27.),14.+bud.z*48.,sin(angle)*(44.+bud.x*22.));
      vec3 radius=vec3(19.+bud.z*13.,19.+bud.y*13.,20.+bud.x*13.);
      bank=joinBanks(bank,ellipsoid(q-offset,radius),4.5);
    }
    for(int l=0;l<7;l++){
      vec3 bud=bankHash(mod(id,4.)+vec2(float(l)*17.+93.,float(l)*11.+37.));
      float angle=(float(l)+bud.x*.65)*.897598;
      vec3 offset=vec3(-15.+variety.y*28.+cos(angle)*43.,crownCenter+crownRadius*.24+(bud.z-.5)*12.,-5.+seed.x*13.+sin(angle)*36.);
      bank=joinBanks(bank,ellipsoid(q-offset,vec3(22.+bud.x*10.,21.+bud.y*11.,22.+bud.z*10.)),4.5);
    }
    // A minority of banks include a detached high wisp, leaving open high sky.
    if(variety.z>.82){float wisp=ellipsoid(vec3(local.x-100.,p.y-208.,local.y+46.),vec3(44.,6.,24.));bank=min(bank,wisp);}
    shapeDistance=min(shapeDistance,bank);
  }
  if(shapeDistance>24.)return 0.;
  // Texture detail perturbs the surface, never drills holes through the solid.
  vec3 q=p/cloudPeriod;
  vec4 edge=texture(volumeNoise,q*vec3(3.,3.,3.)+vec3(.17,.31,.23));
  float erosion=(edge.g-.42)*edgeErosion*260.;
  float finer=(texture(volumeNoise,q*7.).b-.45)*edgeErosion*24.;
  // This 26-unit cell scale is visible as overlapping billows in the middle
  // distance, not fine surface grain. Bound the displacement to keep solid cores.
  vec4 middle=texture(volumeNoise,q*5.+vec3(.41,.23,.17));
  float roundedRelief=clamp((middle.g*.78+middle.r*.22-.40)*38.,-8.,10.);
  float signedBody=-shapeDistance+roundedRelief-erosion-finer;
  // Surface displacement can extend a bank below the cached slab. Fade its
  // authored, uneven underside before that boundary instead of slicing it flat.
  float lowerVariation=texture(volumeNoise,vec3(q.x*2.,.39,q.z*2.)).g;
  float lowerEdge=cloudFloor+3.+lowerVariation*10.;
  float underside=smoothstep(lowerEdge,lowerEdge+8.,p.y);
  return smoothstep(-2.8,7.5,signedBody)*.90*underside;
}
`;

const bakeFragment=`#version 300 es
${common}
uniform float slice;
out vec4 color;
void main(){
  vec3 p=vec3(uv.x*cloudPeriod,cloudFloor+uv.y*(cloudCeiling-cloudFloor),slice*cloudPeriod);
  float d=density(p),optical=0.;
  for(int s=0;s<12;s++){
    float len=1.+float(s)*4.,spread=float(s)*.22;
    vec3 softOffset=vec3(cos(float(s)*2.399),.25*sin(float(s)*1.73),sin(float(s)*2.399))*spread;
    optical+=density(p+sun*len+softOffset)*4.;
  }
  float sunlight=.08+.92*exp(-optical*.16),h=clamp((p.y-56.)/128.,0.,1.);
  vec3 ambient=mix(vec3(.17,.24,.34),vec3(.34,.43,.55),h);
  vec3 illumination=ambient+vec3(.64,.62,.56)*sunlight*(.68+.16*(1.-exp(-d*2.4)));
  color=vec4(illumination,d);
}`;

const cloudFragment=`#version 300 es
${common}
out vec4 color;
void main(){
  vec3 rd=ray();float plane=43./max(.12,dot(rd,forward));float ground=groundDistance();
  float begin=segment<.5?plane:0.;float end=min(ground,segment<.5?840.:plane);
  // Clip the march to the world-space cloud slab before spending texture samples.
  if(abs(rd.y)>.0001){float a=(cloudFloor-camera.y)/rd.y,b=(cloudCeiling-camera.y)/rd.y;begin=max(begin,min(a,b));end=min(end,max(a,b));}
  if(end<=begin){color=vec4(0);return;}
  // Empty-space traversal and boundary integration share the original 128 slots.
  // Reserve enough coarse steps to reach the far endpoint before spending slots
  // on 1.2-unit refinement; fine work can never truncate the remaining volume.
  float coarseStep=max(.45,(end-begin)/96.);
  float stepSize=coarseStep;bool refining=false;int emptySteps=0;float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
  float trans=1.;vec3 sum=vec3(0);float t=begin+stepSize*(.35+.30*jitter);
  for(int i=0;i<128;i++) {
    if(t>=end||trans<.008)break;
    vec3 p=camera+rd*t;
    // Cross the periodic volume obliquely so one X lap visits a new Z region.
    vec4 volume=texture(cloudVolume,vec3(p.x/cloudPeriod,(p.y-cloudFloor)/(cloudCeiling-cloudFloor),(p.z+p.x*.137)/cloudPeriod));float d=smoothstep(.015,.65,volume.a)*.88;
    float spare=float(128-i)-ceil((end-t)/coarseStep);
    if(!refining&&d>.003&&spare>12.){t=max(begin,t-coarseStep);refining=true;emptySteps=0;continue;}
    if(spare<=2.)refining=false;
    stepSize=refining?min(coarseStep,1.2):coarseStep;
    if(refining&&d<.001){emptySteps++;if(float(emptySteps)*stepSize>coarseStep){refining=false;stepSize=coarseStep;}}else emptySteps=0;
    stepSize=min(stepSize,end-t);
    if(d>.003){
      float powder=1.-exp(-d*2.4);
      vec3 illumination=volume.rgb;
      vec3 scattered=vec3(0);
      for(int j=0;j<5;j++){
        if(dot(lightColor[j],lightColor[j])<.0001)continue;
        float dist=length(lightPos[j]-p),radius=lightRange[j];
        float support=max(0.,1.-dist/max(radius,.001));
        float spatial=support*support/(1.+dist*dist*.035);
        scattered+=lightColor[j]*spatial;
      }
      // Limit additive cloud scattering, preserving the baked volume shading.
      // The actual projectile, hit and explosion flares are composed elsewhere.
      float addedPeak=max(scattered.r,max(scattered.g,scattered.b));
      scattered*=min(1.,.72/max(.001,addedPeak));
      illumination+=scattered*(.55+.45*powder);
      // Keep the strongest channel at the same ceiling without clipping each
      // channel to white when colored weapon lights overlap inside a cloud.
      illumination=max(illumination,vec3(0));
      illumination/=max(1.,max(illumination.r,max(illumination.g,illumination.b)));
      // Optical tuning affects the near pass only. Distant shapes stay opaque.
      float central=smoothstep(.14,.31,altitude)*(1.-smoothstep(.59,.77,altitude));
      float edgeFlight=mix(.28,1.,smoothstep(.04,.24,altitude))*(1.-smoothstep(.76,.98,altitude)*.56);
      float nearWeight=mix(1.,centralNearOptical,central)*edgeFlight;
      float extinction=segment<.5?farExtinction:nearExtinction*nearWeight;
      float absorb=1.-exp(-d*stepSize*extinction);
      sum+=trans*absorb*illumination;trans*=1.-absorb;
    }
    t+=stepSize;
  }
  // Do not erase mid/far banks at low altitude: world-space geometry and the
  // near-pass optical profile provide the low corridor continuously.
  color=vec4(sum,1.-trans);
}`;

const composeFragment=`#version 300 es
${common}
out vec4 color;
void main(){
  vec3 rd=ray();vec4 terrain=texture(terrainColor,uv),cloud=texture(cloudColor,uv);
  float ground=groundDistance(),plane=43./max(.12,dot(rd,forward));
  if(frameTravel>0.&&terrain.a>.99){
    vec4 prior=viewProjection*vec4(camera+rd*ground+vec3(frameTravel,0,0),1);
    vec2 sweep=(prior.xy/prior.w*.5+.5-uv)*.34;
    sweep*=min(1.,.015/max(length(sweep),.00001));
    vec4 left=texture(terrainColor,uv-sweep*.5),right=texture(terrainColor,uv+sweep*.5);
    if(left.a>.99&&right.a>.99)terrain.rgb=terrain.rgb*.5+(left.rgb+right.rgb)*.25;
  }
  if(segment<.5){vec3 background=terrain.rgb+sky(rd)*(1.-terrain.a);color=vec4(cloud.rgb+background*(1.-cloud.a),1.);}
  // Terrain already belongs to drawBack. Reapplying near trees here covered
  // the combat plane at low altitude; foreground cloud occlusion stays intact.
  else color=cloud;
}`;

export class VolumeEnvironment {
  constructor({leafSurface,cloudTuning={}}={}) {
    this.tuning={...CLOUD_TUNING,...cloudTuning};
    this.canvas=document.createElement('canvas');this.canvas.width=GW;this.canvas.height=GH;
    this.gl=this.canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    if(!this.gl)throw new Error('3D 배경을 실행하려면 WebGL 2와 브라우저 하드웨어 가속이 필요합니다.');
    const gl=this.gl;this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
    this.cloudProgram=program(gl,cloudFragment);this.composeProgram=program(gl,composeFragment);
    this.sun=norm([.48,.82,.30]);this.noise=this.createNoise();this.volume=this.createCloudVolume();
    this.scene=this.target(GW,GH,true);this.sceneMS=this.multisampleTarget();this.cloud=this.target(Math.round(GW*.5),Math.round(GH*.5),false);
    this.terrain=new Terrain3D(gl,{leafSurface});this.distance=0;this.camera=[0,12,48];this.forward=norm([.55,-.25,-1]);
    this.lights=new Float32Array(15);this.colors=new Float32Array(15);this.lightRanges=new Float32Array(5);
  }

  target(width,height,depth) {
    const gl=this.gl,fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
    for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    let depthTexture=null;
    if(depth){depthTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,depthTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,width,height,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depthTexture,0);}
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('3D 배경 프레임 버퍼를 생성할 수 없습니다.');
    return {fbo,texture,depthTexture,width,height};
  }

  multisampleTarget() {
    const gl=this.gl,fbo=gl.createFramebuffer(),samples=Math.min(4,gl.getParameter(gl.MAX_SAMPLES));
    gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
    for(const [attachment,format] of [[gl.COLOR_ATTACHMENT0,gl.RGBA8],[gl.DEPTH_ATTACHMENT,gl.DEPTH_COMPONENT24]]) {
      const buffer=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,buffer);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,samples,format,GW,GH);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,attachment,gl.RENDERBUFFER,buffer);
    }
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('3D 숲의 안티앨리어싱 버퍼를 생성할 수 없습니다.');
    return {fbo,samples};
  }

  createNoise() {
    const gl=this.gl,p=program(gl,noiseFragment),size=128,texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,texture);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,size,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,axis,gl.REPEAT);
    for(const type of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_3D,type,gl.LINEAR);
    const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,size,size);gl.useProgram(p.p);
    for(let layer=0;layer<size;layer++){gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,texture,0,layer);gl.uniform1f(uniform(gl,p,'slice'),(layer+.5)/size);gl.drawArrays(gl.TRIANGLES,0,3);}
    gl.deleteFramebuffer(fbo);gl.deleteProgram(p.p);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return texture;
  }

  createCloudVolume() {
    // Store stable sunlight and density in 3D, so flight only marches one texture.
    const gl=this.gl,p=program(gl,bakeFragment),width=512,height=64,depth=512,texture=gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,texture);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,width,height,depth,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,axis,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    for(const type of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_3D,type,gl.LINEAR);
    const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,width,height);gl.useProgram(p.p);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,this.noise);gl.uniform1i(uniform(gl,p,'volumeNoise'),0);gl.uniform3fv(uniform(gl,p,'sun'),[this.sun[0],this.sun[1],this.sun[2]+this.sun[0]*.137]);
    this.bindCloudTuning(p);
    for(let layer=0;layer<depth;layer++){gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,texture,0,layer);gl.uniform1f(uniform(gl,p,'slice'),(layer+.5)/depth);gl.drawArrays(gl.TRIANGLES,0,3);}
    gl.deleteFramebuffer(fbo);gl.deleteProgram(p.p);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return texture;
  }

  bindCloudTuning(p) {
    const gl=this.gl;
    for(const [name,value] of [['cloudCoverage',this.tuning.coverage],['peakHeight',this.tuning.peakHeight],['edgeErosion',this.tuning.edgeErosion],['centralNearOptical',this.tuning.centralNearOptical],['nearExtinction',this.tuning.nearExtinction],['farExtinction',this.tuning.farExtinction]])gl.uniform1f(uniform(gl,p,name),value);
  }

  setCloudTuning(values,{rebake=false}={}) {
    const shapeKeys=['coverage','peakHeight','edgeErosion'];
    const shapeChanged=shapeKeys.some(key=>values[key]!==undefined&&values[key]!==this.tuning[key]);
    if(shapeChanged&&!rebake)throw new Error('Cloud shape changes need {rebake:true}.');
    for(const [key,value] of Object.entries(values)){
      if(!(key in CLOUD_TUNING)||!Number.isFinite(value))throw new Error(`Invalid cloud setting: ${key}`);
    }
    this.tuning={...this.tuning,...values};
    if(shapeChanged){const prior=this.volume;this.volume=this.createCloudVolume();this.gl.deleteTexture(prior);}
  }

  update(g,dt){this.travel=dt*(g.speed||1.3)/1.3*76;this.distance+=dt*(g.speed||1.3)/1.3;}

  lightWorld(x,y) {
    const nx=(x+PAD)/GW*2-1,ny=1-(y+PAD)/GH*2;
    const {right,up,f}=this.basis,ray=norm(this.forward.map((v,i)=>v+right[i]*nx*(GW/GH)/f+up[i]*ny/f));
    const depth=43/dot(ray,this.forward);return ray.map((v,i)=>this.camera[i]+v*depth);
  }

  setLights(g,renderer) {
    this.lights.fill(0);this.colors.fill(0);this.lightRanges.fill(0);
    const active=renderer?.flashes.filter(f=>f.life>0).sort((a,b)=>(b.kind==='explosion'?2:1)*b.life/b.max-(a.kind==='explosion'?2:1)*a.life/a.max).slice(0,4)||[];
    const offset=renderer?.cameraOffset||{x:0,y:0};
    const point=this.lightWorld(g.player.x-20+offset.x,g.player.y+offset.y);
    this.lights.set(point);this.colors.set(g.mode==='title'?[0,0,0]:[.0088,.121,.0616]);this.lightRanges[0]=6.5;
    // Radius / gain affect cloud transmission only, not the existing 2D flares.
    const profiles={shot:[9,.60],enemyShot:[10,.34],hit:[8,.44],playerHit:[10,.40],pickup:[11,.28],explosion:[24,.65]};
    active.forEach((f,i)=>{
      const kind=f.kind||(f.ring?'pickup':f.color==='pink'?'enemyShot':'hit');
      const [radius,gain]=profiles[kind]||profiles.hit;
      this.lights.set(this.lightWorld(f.x+offset.x,f.y+offset.y),(i+1)*3);
      this.lightRanges[i+1]=f.boss&&kind==='explosion'?32:radius;
      const rgb=f.rgb?f.rgb.map(v=>v*(kind==='shot'?2.2:4.2)/(Math.max(...f.rgb)>1?255:1)):f.color==='orange'?[5.8,2.4,.55]:f.color==='pink'?[4.2,.22,2.0]:[.35,5.5,2.9];
      const a=Math.pow(f.life/f.max,.7)*(f.powered?1.65:1)*gain;
      this.colors.set(rgb.map(v=>v*a),(i+1)*3);
    });
  }

  bind(p,segment) {
    const gl=this.gl;gl.useProgram(p.p);gl.bindVertexArray(this.vao);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.depthMask(false);
    const bindings=[['terrainColor',this.scene.texture,gl.TEXTURE_2D],['terrainDepth',this.scene.depthTexture,gl.TEXTURE_2D],['volumeNoise',this.noise,gl.TEXTURE_3D],['cloudColor',this.cloud.texture,gl.TEXTURE_2D],['cloudVolume',this.volume,gl.TEXTURE_3D]];
    bindings.forEach(([name,texture,target],i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(target,texture);gl.uniform1i(uniform(gl,p,name),i);});
    gl.uniformMatrix4fv(uniform(gl,p,'inverseVP'),false,this.inverseVP);gl.uniform3fv(uniform(gl,p,'camera'),this.camera);gl.uniform3fv(uniform(gl,p,'forward'),this.forward);gl.uniform3fv(uniform(gl,p,'sun'),this.sun);gl.uniform1f(uniform(gl,p,'segment'),segment);gl.uniform1f(uniform(gl,p,'time'),this.distance);gl.uniform1f(uniform(gl,p,'altitude'),this.altitude);gl.uniform3fv(uniform(gl,p,'lightPos[0]'),this.lights);gl.uniform3fv(uniform(gl,p,'lightColor[0]'),this.colors);gl.uniform1fv(uniform(gl,p,'lightRange[0]'),this.lightRanges);
    gl.uniformMatrix4fv(uniform(gl,p,'viewProjection'),false,this.basis.vp);gl.uniform1f(uniform(gl,p,'frameTravel'),this.travel||0);this.bindCloudTuning(p);
  }

  drawSegment(segment) {
    const gl=this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.cloud.fbo);gl.viewport(0,0,this.cloud.width,this.cloud.height);this.bind(this.cloudProgram,segment);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,GW,GH);this.bind(this.composeProgram,segment);gl.drawArrays(gl.TRIANGLES,0,3);
  }

  drawBack(c,g,renderer) {
    const gl=this.gl;this.altitude=g.altitude;this.camera=[this.distance*76,28+g.altitude*190,48];
    if(renderer?.reducedMotion)this.travel=0;
    const climb=Math.max(0,Math.min(1,(g.altitude-.48)/.45));
    const groundPitch=.08*Math.max(0,1-g.altitude/.18);
    this.forward=norm([.55,-.25-groundPitch+.45*climb*climb*(3-2*climb),-1]);this.basis=cameraMatrix(this.camera,this.forward);this.inverseVP=inverse(this.basis.vp);this.setLights(g,renderer);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.sceneMS.fbo);gl.viewport(0,0,GW,GH);gl.depthMask(true);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    this.terrain.draw({viewProjection:this.basis.vp,camera:this.camera,time:g.sceneTime,altitude:g.altitude,light:this.sun});
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.sceneMS.fbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this.scene.fbo);gl.blitFramebuffer(0,0,GW,GH,0,0,GW,GH,gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT,gl.NEAREST);
    this.drawSegment(0);c.drawImage(this.canvas,-PAD,-PAD,GW,GH);
  }

  drawFront(c,g,renderer) {
    this.setLights(g,renderer);this.drawSegment(1);c.drawImage(this.canvas,-PAD,-PAD,GW,GH);
  }
}
