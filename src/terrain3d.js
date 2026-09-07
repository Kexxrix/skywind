// WebGL2 instancing: https://registry.khronos.org/webgl/specs/latest/2.0/
// World axes: X = flight direction, Y = up, Z = forest depth.
// The owner supplies a column-major viewProjection matrix and the framebuffer.

const TAU = Math.PI * 2;

const VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aSurface;
layout(location=3) in vec4 aInstance;
layout(location=4) in vec4 aVariation;
layout(location=5) in vec2 aLeafUV;
uniform mat4 uViewProjection;
uniform vec3 uCamera;
uniform float uTime;
uniform float uWrap;
uniform bool uGround;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vLocal;
out vec2 vSurface;
out float vSeed;
out vec2 vLeafUV;

float terrain(vec2 p) {
  return 1.55*sin(p.x*.018+sin(p.y*.009)*1.9)
       + 2.2*sin(p.y*.017+p.x*.004)
       + .58*sin(p.x*.076+p.y*.061)
       + .32*sin(p.x*.149-p.y*.119);
}

void main() {
  vLeafUV=aLeafUV;
  vec3 world;
  vec3 normal;
  if (uGround) {
    world = aPosition + vec3(floor(uCamera.x/8.0)*8.0,0.0,0.0);
    world.y = terrain(world.xz)-.08;
    float h = terrain(world.xz);
    normal = normalize(vec3(h-terrain(world.xz+vec2(.35,0.0)),.35,h-terrain(world.xz+vec2(0.0,.35))));
    vSeed = 0.0;
  } else {
    float rootX = aInstance.x + floor((uCamera.x-aInstance.x+uWrap*.5)/uWrap)*uWrap;
    vec3 root = vec3(rootX,terrain(vec2(rootX,aInstance.y)),aInstance.y);
    float height = aInstance.z;
    vec4 center = uViewProjection*vec4(root+vec3(0.0,height*.55,0.0),1.0);
    // Coarse instance culling keeps leaves outside the frustum inexpensive.
    if (center.w < -12.0 || abs(center.x)>center.w*1.22+24.0 || abs(center.y)>center.w*1.3+24.0) {
      gl_Position=vec4(2.0,2.0,2.0,1.0);
      vWorld=root; vNormal=vec3(0,1,0); vLocal=vec3(0); vSurface=aSurface; vSeed=aInstance.w;
      return;
    }
    float angle = aVariation.x;
    mat2 rotation = mat2(cos(angle),sin(angle),-sin(angle),cos(angle));
    vec3 scale = vec3(height*aVariation.y,height,height*aVariation.z);
    vec3 local = aPosition*scale;
    local.x += aVariation.w*aPosition.y*aPosition.y*height*.12;
    float wind = sin(uTime*1.25+rootX*.14+aInstance.w*7.0)+sin(uTime*.73+root.z*.17);
    local.x += wind*.065*aPosition.y*aPosition.y*(aSurface.x>1.5?1.0:.25);
    local.z += cos(uTime*.84+rootX*.075)*.045*aPosition.y*aPosition.y;
    local.xz = rotation*local.xz;
    world = root+local;
    normal = aNormal/scale;
    normal.xz = rotation*normal.xz;
    normal = normalize(normal);
    vSeed = aInstance.w;
  }
  vWorld=world;
  vNormal=normal;
  vLocal=aPosition;
  vSurface=aSurface;
  gl_Position=uViewProjection*vec4(world,1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vLocal;
in vec2 vSurface;
in float vSeed;
in vec2 vLeafUV;
uniform vec3 uCamera;
uniform vec3 uLight;
uniform float uAltitude;
uniform sampler2D uLeafSurface;
uniform bool uHasLeafSurface;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}

void main() {
  float material=vSurface.x;
  vec3 normal=normalize(vNormal);
  if(!gl_FrontFacing) normal=-normal;
  vec3 leafColor=vec3(.414,.548,.027);
  if(material>2.5&&uHasLeafSurface) {
    // Geometry stores length first; the photograph's midrib runs vertically.
    // Source images retain their top-first row order, including ImageBitmap.
    leafColor=texture(uLeafSurface,vec2(vLeafUV.y,1.0-vLeafUV.x)).rgb;
    float relief=dot(leafColor,vec3(.25,.65,.1));
    vec3 dx=dFdx(vWorld),dy=dFdy(vWorld);
    vec3 rx=cross(dy,normal),ry=cross(normal,dx);
    float determinant=dot(dx,rx);
    if(abs(determinant)>1e-10) {
      vec3 gradient=sign(determinant)*(dFdx(relief)*rx+dFdy(relief)*ry);
      normal=normalize(abs(determinant)*normal-gradient*.035);
    }
  }
  vec3 sun=normalize(uLight);
  float diffuse=max(dot(normal,sun),0.0);
  float up=normal.y*.5+.5;
  vec3 color;
  float roughness=.025;
  if(material<.5) {
    float patches=noise(vWorld.xz*.15)*.7+noise(vWorld.xz*.72)*.3;
    color=mix(vec3(.035,.073,.039),vec3(.13,.18,.058),patches);
    color=mix(color,vec3(.12,.13,.088),smoothstep(.42,.85,1.0-up)*.42);
    color*=.67+noise(vWorld.xz*2.4)*.33;
  } else if(material<1.5) {
    float ridges=sin(vLocal.y*160.0+sin(vLocal.x*80.0)*1.4)*.055;
    color=mix(vec3(.075,.071,.038),vec3(.21,.17,.087),vSeed);
    color*=.87+ridges+vSurface.y*.16;
  } else {
    float variety=fract(vSeed*3.73+vSurface.y*.29);
    vec3 sunLeaf=mix(vec3(.075,.27,.065),vec3(.43,.58,.105),variety*.85);
    vec3 shadedLeaf=mix(vec3(.015,.064,.043),vec3(.039,.13,.069),variety);
    color=mix(shadedLeaf,sunLeaf,smoothstep(.02,.94,diffuse)*.9+up*.1);
    color=mix(color,vec3(.075,.29,.145),step(.8,vSeed)*.15);
    float leafDetail=noise(vWorld.xz*4.5+vWorld.y*.53);
    color*=.82+leafDetail*.23+vSurface.y*.08;
    float canopyAO=mix(.65,1.0,smoothstep(.35,1.0,vLocal.y));
    color*=canopyAO;
    // Leaf backs transmit light; thin leaflets retain a sunlit rim.
    float transmission=pow(max(dot(-normal,sun),0.0),2.0)*.32;
    color*=.74+diffuse*.24+up*.12+transmission;
    roughness=material>3.5?.35:material>2.5?.22:.025;
    if(material>2.5) {
      if(uHasLeafSurface) {
        vec3 albedo=vec3(leafColor.r*.84,leafColor.g*.89,.045+leafColor.b*.9);
        albedo*=.83+variety*.31;
        vec3 photographed=albedo*(.18+diffuse*.67+up*.14)*canopyAO;
        color=mix(color,photographed,.76);
        float tissue=1.0-smoothstep(.45,.71,leafColor.g);
        color+=vec3(.19,.32,.025)*transmission*(.4+tissue*.6)*canopyAO;
        // Veins and the cuticle break up the broad wax highlight.
        roughness=(material>3.5?.13:.095)*(.62+tissue*.48);
      } else {
        float across=abs(vLeafUV.y-.5);
        float rib=exp(-across*95.0);
        float veinPhase=vLeafUV.x*17.0-across*8.0;
        float veins=1.0-smoothstep(.035,.08,abs(fract(veinPhase)-.5));
        float ribFalloff=1.0-smoothstep(.02,.12,across);
        color*=.91+rib*.22+veins*.07;
        color+=vec3(.15,.20,.055)*rib*.26;
        color+=vec3(.045,.065,.01)*smoothstep(.35,.96,vLeafUV.x)*diffuse;
        normal=normalize(normal+vec3(sin(veinPhase*6.283)*.045,ribFalloff*.025,cos(veinPhase*6.283)*.025));
      }
    }
  }
  if(material<1.5) color*=.38+diffuse*.75+up*.17;
  vec3 view=normalize(uCamera-vWorld);
  vec3 halfVector=normalize(sun+view);
  color+=vec3(.86,.94,.65)*pow(max(dot(normal,halfVector),0.0),material>2.5?11.0:22.0)*roughness;
  if(material>2.5)color+=vec3(.22,.35,.27)*pow(1.0-abs(dot(normal,view)),4.0)*.14;
  float distance=length(uCamera-vWorld);
  float fog=1.0-exp(-distance*(.0030+uAltitude*.0007));
  vec3 haze=vec3(.20,.36,.49);
  color=pow(max(color,vec3(0.0)),vec3(.86));
  color=mix(color,haze,clamp(fog,0.0,.9));
  outColor=vec4(color,1.0);
}`;

function seeded(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

function subtract(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function normalize(a) {
  const length = Math.hypot(...a) || 1;
  return a.map(value => value / length);
}
function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function add(a, b, scale = 1) { return [a[0]+b[0]*scale, a[1]+b[1]*scale, a[2]+b[2]*scale]; }

class Mesh {
  constructor() { this.vertices = []; }
  vertex(position, normal, material, shade,uv=[0,0]) { this.vertices.push(...position,...normal,material,shade,...uv); }
  triangle(a,b,c,material=2,shade=.5,normals=null,uvs=null) {
    const normal=normalize(cross(subtract(b,a),subtract(c,a)));
    this.vertex(a,normals?.[0]||normal,material,shade,uvs?.[0]);
    this.vertex(b,normals?.[1]||normal,material,shade,uvs?.[1]);
    this.vertex(c,normals?.[2]||normal,material,shade,uvs?.[2]);
  }
  quad(a,b,c,d,material=2,shade=.5) {
    this.triangle(a,b,c,material,shade);this.triangle(a,c,d,material,shade);
  }
  data() { return new Float32Array(this.vertices); }
}

function cylinder(mesh,start,end,radiusStart,radiusEnd,sides=6,shade=.5) {
  const axis=normalize(subtract(end,start));
  const u=normalize(cross(axis,Math.abs(axis[1])>.9?[1,0,0]:[0,1,0]));
  const v=cross(axis,u);
  for(let i=0;i<sides;i+=1) {
    const a=i*TAU/sides,b=(i+1)*TAU/sides;
    const radial=angle=>add(u.map(value=>value*Math.cos(angle)),v,Math.sin(angle));
    const r0=radial(a),r1=radial(b);
    mesh.quad(add(start,r0,radiusStart),add(start,r1,radiusStart),add(end,r1,radiusEnd),add(end,r0,radiusEnd),1,shade);
  }
}

function crown(mesh,center,radii,sides,rings,seed) {
  const random=seeded(seed),phase=random()*TAU;
  const shade=.36+random()*.22;
  const point=(ring,side)=>{
    const theta=ring*Math.PI/rings,phi=side*TAU/sides;
    const lobes=1+Math.sin(phi*3+phase)*.22+Math.cos(phi*5-theta*4+phase)*.13;
    const radial=Math.sin(theta)*lobes;
    const vertical=Math.cos(theta),dome=vertical>0?vertical*.55:vertical*.23;
    const p=[center[0]+Math.cos(phi)*radial*radii[0],center[1]+dome*radii[1],center[2]+Math.sin(phi)*radial*radii[2]];
    const n=normalize([(p[0]-center[0])/radii[0],(p[1]-center[1])/radii[1],(p[2]-center[2])/radii[2]]);
    return {p,n};
  };
  for(let ring=0;ring<rings;ring+=1)for(let side=0;side<sides;side+=1) {
    const a=point(ring,side),b=point(ring+1,side),c=point(ring+1,side+1),d=point(ring,side+1);
    if(ring>0)mesh.triangle(a.p,d.p,b.p,2,shade,[a.n,d.n,b.n]);
    if(ring<rings-1)mesh.triangle(b.p,d.p,c.p,2,shade,[b.n,d.n,c.n]);
  }
}

function leaf(mesh,base,tip,width,shade=.5,segments=3,material=3) {
  const direction=subtract(tip,base),side=normalize(cross(direction,[0,1,0]));
  const point=(t,across)=>{
    const center=add(base,direction,t);
    center[1]+=Math.sin(t*Math.PI)*width*.55-t*t*width*.3;
    const spread=Math.pow(Math.sin(t*Math.PI),.8)*width*across;
    const p=add(center,side,spread);
    p[1]-=Math.abs(across)*Math.sin(t*Math.PI)*width*.22;
    return p;
  };
  const normalAt=(t,across)=>{
    const longitudinal=subtract(point(Math.min(.999,t+.012),across),point(Math.max(.001,t-.012),across));
    const lateral=subtract(point(Math.max(.012,Math.min(.988,t)),.5),point(Math.max(.012,Math.min(.988,t)),-.5));
    const normal=normalize(cross(longitudinal,lateral));
    return normal[1]<0?normal.map(value=>-value):normal;
  };
  for(let i=0;i<segments;i+=1) {
    const t0=i/segments,t1=(i+1)/segments;
    for(const sideSign of [-1,1]) {
      const a=point(t0,0),b=point(t0,sideSign),c=point(t1,sideSign),d=point(t1,0);
      const uvA=[t0,.5],uvB=[t0,.5+sideSign*.5],uvC=[t1,.5+sideSign*.5],uvD=[t1,.5];
      const nA=normalAt(t0,0),nB=normalAt(t0,sideSign),nC=normalAt(t1,sideSign),nD=normalAt(t1,0);
      // Both halves share a continuous crown normal rather than one flat
      // normal per triangle; leaves bend through the sunlight smoothly.
      if(sideSign===-1) {
        if(i>0)mesh.triangle(a,c,b,material,shade,[nA,nC,nB],[uvA,uvC,uvB]);
        if(i<segments-1)mesh.triangle(a,d,c,material,shade,[nA,nD,nC],[uvA,uvD,uvC]);
      } else {
        if(i>0)mesh.triangle(a,b,c,material,shade,[nA,nB,nC],[uvA,uvB,uvC]);
        if(i<segments-1)mesh.triangle(a,c,d,material,shade,[nA,nC,nD],[uvA,uvC,uvD]);
      }
    }
  }
}

function broadleafMesh(detail,variant) {
  const mesh=new Mesh(),random=seeded(911+variant*313);
  const trunkTop=.55+variant*.045;
  cylinder(mesh,[0,0,0],[.025,trunkTop,0],.043,.018,detail===0?5:7,.37);
  if(detail===2) {
    for(let i=0;i<4;i+=1) {
      const angle=i*TAU/4+.2;
      mesh.triangle([Math.cos(angle)*.16,0,Math.sin(angle)*.16],[.025,.3,0],[0,0,0],1,.3);
    }
  }
  const clusters=detail===0?3:detail===1?6:10;
  for(let i=0;i<clusters;i+=1) {
    const angle=i*2.39996+variant;
    const outer=i===0?0:.14+random()*.24;
    const center=[Math.cos(angle)*outer,.7+(i===0?.25:random()*.28)-variant*.025,Math.sin(angle)*outer];
    const rx=(detail===0?.2:detail===1?.12:.095)+random()*(detail===0?.11:.07);
    const ry=(detail===0?.12:.075)+random()*.07;
    if(detail>0&&i>0)cylinder(mesh,[.025,trunkTop,0],center,.011,.004,4,.5);
    // Distant crowns retain volume; close trees expose individual branching
    // sprays and small inner clumps instead of large enclosing ball shells.
    if(detail===0)crown(mesh,center,[rx,ry,rx*(.7+random()*.35)],7,3,100+i*71+variant*13);
    if(detail>0)for(let j=0;j<(detail===1?7:10);j+=1) {
      const leafAngle=j*TAU/(detail===1?7:10)+angle+random()*.25;
      const base=[center[0]+Math.cos(leafAngle)*rx*.22,center[1]+ry*(random()*.55-.2),center[2]+Math.sin(leafAngle)*rx*.22];
      const length=.12+random()*(detail===1?.14:.2);
      const tip=[base[0]+Math.cos(leafAngle)*length,base[1]-.035-random()*.095,base[2]+Math.sin(leafAngle)*length];
      leaf(mesh,base,tip,(.021+random()*.026)*(variant===1?1.2:1),.4+random()*.5,detail===1?2:4,4);
    }
  }
  return mesh.data();
}

function palmMesh(variant) {
  const mesh=new Mesh(),random=seeded(319+variant*71);
  const lean=variant===0?.16:-.12;
  const trunk=t=>[lean*t*t,t,Math.sin(t*2+variant)*.04*t];
  for(let segment=0;segment<8;segment+=1) {
    const t=segment/8;
    cylinder(mesh,trunk(t),trunk(t+1/8),.034-t*.017,.034-(t+1/8)*.017,7,.25+segment%2*.22);
  }
  const top=trunk(1),fronds=variant===0?8:10;
  for(let frond=0;frond<fronds;frond+=1) {
    const angle=frond*TAU/fronds+random()*.22;
    const length=.57+random()*.31;
    const forward=[Math.cos(angle),0,Math.sin(angle)],side=[-Math.sin(angle),0,Math.cos(angle)];
    const spine=t=>[top[0]+forward[0]*length*t,top[1]+Math.sin(t*Math.PI)*.16-t*t*(.22+variant*.04),top[2]+forward[2]*length*t];
    for(let segment=0;segment<6;segment+=1)cylinder(mesh,spine(segment/6),spine((segment+1)/6),.005*(1-segment/7),.004*(1-segment/7),3,.65);
    for(let segment=1;segment<=11;segment+=1) {
      const t=segment/12,base=spine(t);
      const reach=Math.sin(t*Math.PI)*(.15+random()*.055)+.025;
      for(const sign of [-1,1]) {
        const tip=add(add(base,side,reach*sign),forward,.09+reach*.3);
        tip[1]-=.035+t*.045;
        leaf(mesh,base,tip,.006+Math.sin(t*Math.PI)*.006,.4+random()*.55,3);
      }
    }
    leaf(mesh,spine(.86),spine(1.08),.024,.75);
  }
  return mesh.data();
}

function terrainMesh() {
  const mesh=new Mesh();
  for(let z=64;z>-616;z-=10)for(let x=-520;x<520;x+=8) {
    mesh.quad([x,0,z],[x+8,0,z],[x+8,0,z-10],[x,0,z-10],0,.5);
  }
  return mesh.data();
}

function instances(columns,rows,width,firstZ,spacingZ,seed,heightRange,variants) {
  const random=seeded(seed),groups=Array.from({length:variants},()=>[]);
  for(let row=0;row<rows;row+=1)for(let column=0;column<columns;column+=1) {
    const x=(column+(random()-.5)*.86)/columns*width-width/2;
    const z=firstZ-row*spacingZ+(random()-.5)*spacingZ*.82;
    const height=heightRange[0]+random()*(heightRange[1]-heightRange[0]);
    const shade=random(),rotation=random()*TAU,scaleX=.8+random()*.45,scaleZ=.72+random()*.5,lean=random()*2-1;
    groups[(row+column)%variants].push(x,z,height,shade,rotation,scaleX,scaleZ,lean);
  }
  return groups.map(group=>new Float32Array(group));
}

function compile(gl,type,source) {
  const shader=gl.createShader(type);
  gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
    const reason=gl.getShaderInfoLog(shader);gl.deleteShader(shader);
    throw new Error(`Terrain3D shader compilation failed: ${reason}`);
  }
  return shader;
}

/** Opaque instanced forest pass. Does not clear, bind a framebuffer or set viewport. */
export class Terrain3D {
  constructor(gl,{leafSurface}={}) {
    if(!gl?.createVertexArray||!gl?.drawArraysInstanced)throw new Error('Terrain3D requires WebGL2.');
    this.gl=gl;
    this.meshes=[];
    this.stats={trees:0,triangles:0,drawCalls:0};
    const vertex=compile(gl,gl.VERTEX_SHADER,VERTEX_SHADER),fragment=compile(gl,gl.FRAGMENT_SHADER,FRAGMENT_SHADER);
    this.program=gl.createProgram();gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);
    gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(`Terrain3D program link failed: ${gl.getProgramInfoLog(this.program)}`);
    this.uniforms=Object.fromEntries(['ViewProjection','Camera','Time','Wrap','Ground','Light','Altitude','LeafSurface','HasLeafSurface'].map(name=>[name,gl.getUniformLocation(this.program,`u${name}`)]));
    this.hasLeafSurface=Boolean(leafSurface);
    this.leafTexture=this.createLeafTexture(leafSurface);
    this.ground=this.createMesh(terrainMesh(),new Float32Array([0,0,1,0,0,1,1,0]),1040,true);
    const levels=[
      {detail:0,columns:120,rows:48,width:960,firstZ:-210,spacing:7.5,seed:710,height:[7,14]},
      {detail:1,columns:88,rows:22,width:704,firstZ:-55,spacing:7.5,seed:213,height:[7,14]},
      {detail:2,columns:60,rows:13,width:480,firstZ:34,spacing:8,seed:921,height:[6,13.5]},
    ];
    for(const level of levels) {
      const groups=instances(level.columns,level.rows,level.width,level.firstZ,level.spacing,level.seed,level.height,3);
      groups.forEach((group,variant)=>this.createMesh(broadleafMesh(level.detail,variant),group,level.width));
    }
    const palms=instances(12,8,480,36,13,1721,[8.5,16],2);
    palms.forEach((group,variant)=>this.createMesh(palmMesh(variant),group,480));
    // Opaque near foliage populates depth first, reducing distant overdraw.
    this.meshes.sort((a,b)=>Number(a.ground)-Number(b.ground)||a.wrap-b.wrap);
    this.stats.drawCalls=this.meshes.length;
    gl.bindVertexArray(null);
  }

  /** Accepts a decoded, unflipped TexImageSource; image loading stays with the owner. */
  createLeafTexture(source) {
    const gl=this.gl,texture=gl.createTexture();
    const previousBinding=gl.getParameter(gl.TEXTURE_BINDING_2D);
    const previousFlip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    const previousPremultiply=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
    gl.bindTexture(gl.TEXTURE_2D,texture);
    try {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      if(source)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,source);
      else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([106,140,7,255]));
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
      if(anisotropy)gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      return texture;
    } catch(error) {
      gl.deleteTexture(texture);
      throw error;
    } finally {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,previousFlip);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,previousPremultiply);
      gl.bindTexture(gl.TEXTURE_2D,previousBinding);
    }
  }

  createMesh(vertices,instanceData,wrap,ground=false) {
    const gl=this.gl,vao=gl.createVertexArray(),vertexBuffer=gl.createBuffer(),instanceBuffer=gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
    for(const [location,size,offset] of [[0,3,0],[1,3,12],[2,2,24],[5,2,32]]) {
      gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,40,offset);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,instanceData,gl.STATIC_DRAW);
    for(const [location,offset] of [[3,0],[4,16]]) {
      gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,4,gl.FLOAT,false,32,offset);gl.vertexAttribDivisor(location,1);
    }
    const mesh={vao,vertexBuffer,instanceBuffer,vertices:vertices.length/10,instances:instanceData.length/8,wrap,ground};
    this.meshes.push(mesh);
    if(!ground)this.stats.trees+=mesh.instances;
    this.stats.triangles+=mesh.vertices/3*mesh.instances;
    return mesh;
  }

  /** light is a world-space direction toward the sun, not a point position. */
  draw({viewProjection,camera,time=0,altitude=0,light=[-.45,.85,.25]}) {
    if(!viewProjection||viewProjection.length!==16||!camera||camera.length!==3)throw new Error('Terrain3D.draw requires viewProjection[16] and camera[3].');
    const gl=this.gl,u=this.uniforms;
    gl.useProgram(this.program);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);
    gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(u.ViewProjection,false,viewProjection);
    gl.uniform3fv(u.Camera,camera);gl.uniform3fv(u.Light,light);
    gl.uniform1f(u.Time,time);gl.uniform1f(u.Altitude,Math.max(0,Math.min(1,altitude)));
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.leafTexture);
    gl.uniform1i(u.LeafSurface,0);gl.uniform1i(u.HasLeafSurface,this.hasLeafSurface?1:0);
    for(const mesh of this.meshes) {
      gl.bindVertexArray(mesh.vao);gl.uniform1f(u.Wrap,mesh.wrap);gl.uniform1i(u.Ground,mesh.ground?1:0);
      gl.drawArraysInstanced(gl.TRIANGLES,0,mesh.vertices,mesh.instances);
    }
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl=this.gl;
    for(const mesh of this.meshes){gl.deleteVertexArray(mesh.vao);gl.deleteBuffer(mesh.vertexBuffer);gl.deleteBuffer(mesh.instanceBuffer);}
    gl.deleteTexture(this.leafTexture);gl.deleteProgram(this.program);this.meshes.length=0;
  }
}

export default Terrain3D;
