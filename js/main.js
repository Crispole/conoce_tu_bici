import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PARTS } from './data/parts.js';
import { KB } from './data/kb.js';
import { DIAG } from './data/diag.js';
import { norm, searchParts } from './search.js';

const modelsWith = id => Object.values(MODELS).filter(m=>m.parts.includes(id));



/* ------------------------------------------------------------------ */
/*  ESCENA 3D                                                          */
/* ------------------------------------------------------------------ */
const canvas = document.getElementById('view');
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
let HQ = true;
try{ const sv = localStorage.getItem('bici3d-hq'); HQ = sv!==null ? sv==='1' : !(matchMedia('(pointer:coarse)').matches && Math.min(screen.width,screen.height)<600); }catch(e){}
renderer.setPixelRatio(HQ ? Math.min(devicePixelRatio,2) : 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2efe8);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(),0.04).texture;
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
camera.position.set(1.35,1.15,2.75);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0,0.52,0);
controls.enableDamping = true;
controls.minDistance = 0.6; controls.maxDistance = 5;
controls.maxPolarAngle = Math.PI*0.52;

scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc6b4, 0.5));
const sun = new THREE.DirectionalLight(0xfff6ea, 1.9);
sun.position.set(1.5, 3, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(HQ?3072:1024,HQ?3072:1024);
Object.assign(sun.shadow.camera,{left:-1.5,right:1.5,top:1.5,bottom:-1.5});
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.01;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.6); fill.position.set(-2,1.5,-2); scene.add(fill);

const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.ShadowMaterial({opacity:.16}));
ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
const ring = new THREE.Mesh(new THREE.RingGeometry(1.15,1.155,128), new THREE.MeshBasicMaterial({color:0xcfc8b8}));
ring.rotation.x = -Math.PI/2; ring.position.y = 0.001; scene.add(ring);

const blobTex = (()=>{ const c=document.createElement('canvas'); c.width=c.height=128; const x=c.getContext('2d'); const g=x.createRadialGradient(64,64,4,64,64,64); g.addColorStop(0,'rgba(0,0,0,0.32)'); g.addColorStop(0.6,'rgba(0,0,0,0.12)'); g.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle=g; x.fillRect(0,0,128,128); return new THREE.CanvasTexture(c); })();
const blob = new THREE.Mesh(new THREE.PlaneGeometry(1,1), new THREE.MeshBasicMaterial({map:blobTex, transparent:true, depthWrite:false}));
blob.rotation.x = -Math.PI/2; blob.position.y = 0.0015; scene.add(blob);
const root = new THREE.Group(); root.position.y = 0.002; scene.add(root);

const partMats = {}; const partGroups = {};
function mat(part, color, o={}){
  const r = o.r ?? .5, me = o.m ?? .1;
  const paint = (part==='cuadro' || part==='horquilla') && me < 0.6 && r < 0.6;
  const m = new THREE.MeshPhysicalMaterial({color, roughness: paint ? 0.38 : r, metalness: me,
    clearcoat: paint ? 1 : (me>0.7 ? 0.15 : 0), clearcoatRoughness: paint ? 0.08 : 0.3});
  (partMats[part] ||= []).push(m); return m;
}
function tag(mesh, part){ mesh.userData.part = part; mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }
const V = (a)=> new THREE.Vector3(...a);
const Y1 = new THREE.Vector3(0,1,0);
function orient(mesh,A,B){ mesh.position.copy(A).add(B).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(Y1, B.clone().sub(A).normalize()); }
function tube(a,b,r,m,part,parent,seg){
  const A=V(a), B=V(b), len=A.distanceTo(B);
  const frame = (part==='cuadro' || part==='horquilla') && r>=0.009;
  seg = seg ?? (HQ?24:12);
  let geo;
  if(frame){
    const fl = Math.min(0.04, len*0.2), pts=[new THREE.Vector2(0,-len/2)], N = HQ?18:8;
    for(let i=0;i<=N;i++){
      const y = -len/2 + len*i/N, d = Math.min(y+len/2, len/2-y);
      const t = d<fl ? 1-d/fl : 0;
      pts.push(new THREE.Vector2(r*(1+0.12*t*t*(3-2*t)), y));
    }
    pts.push(new THREE.Vector2(0,len/2));
    geo = new THREE.LatheGeometry(pts, HQ?32:14);
  } else geo = new THREE.CylinderGeometry(r,r,len,seg);
  const mesh = new THREE.Mesh(geo, m);
  orient(mesh,A,B); parent.add(tag(mesh,part));
  return mesh;
}
// puntera: placa con forma de gota y el hueco del eje
function dropout(c, dir, m, part, parent){
  const s = stadiumShape(0,0,dir[0]*0.032,dir[1]*0.032,0.0135,0.0095);
  const h = new THREE.Path(); h.absarc(0,0,0.0052,0,Math.PI*2,true); s.holes.push(h);
  const mesh = new THREE.Mesh(extrude(s,0.0065,0.0016,HQ?20:10), m); mesh.position.set(...c); parent.add(tag(mesh,part)); return mesh;
}
function disc(center,r,h,m,part,parent,seg=48){
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,seg), m);
  mesh.rotation.x = Math.PI/2; mesh.position.copy(V(center));
  parent.add(tag(mesh,part)); return mesh;
}
// cajas con bordes redondeados
function box(center,size,m,part,parent,rotZ=0){
  const rad = Math.min(...size)*0.42;
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(size[0],size[1],size[2],3,rad), m);
  mesh.position.copy(V(center)); mesh.rotation.z = rotZ;
  parent.add(tag(mesh,part)); return mesh;
}
function cable(points,r,m,part,parent){
  const curve = new THREE.CatmullRomCurve3(points.map(V));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve,80,r,8,false), m);
  parent.add(tag(mesh,part)); return mesh;
}
// puño con estrías y tope
function grip(a,b,r,m,part,parent){
  const A=V(a), B=V(b), len=A.distanceTo(B), pts=[];
  pts.push(new THREE.Vector2(0.004,-len/2), new THREE.Vector2(r*1.12,-len/2), new THREE.Vector2(r*1.15,-len/2+0.004), new THREE.Vector2(r*0.95,-len/2+0.007));
  const N=22;
  for(let i=0;i<=N;i++){ const y=-len/2+0.009+(len-0.016)*i/N; pts.push(new THREE.Vector2(r*(i%2?0.93:1.0), y)); }
  pts.push(new THREE.Vector2(r*0.98,len/2-0.003), new THREE.Vector2(r*0.7,len/2), new THREE.Vector2(0.004,len/2));
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts,28), m);
  orient(mesh,A,B); parent.add(tag(mesh,part)); return mesh;
}
// hoja de maneta: aplanada, más fina en la punta y con bolita al final
const _leverGeo = new THREE.CylinderGeometry(0.0042,0.0062,1,16);
function lever(a,b,m,part,parent){
  const A=V(a), B=V(b), len=A.distanceTo(B);
  const mesh = new THREE.Mesh(_leverGeo, m); orient(mesh,A,B); mesh.scale.set(1.6,len,0.62);
  parent.add(tag(mesh,part));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0055,14,10), m); tip.position.copy(B); tip.scale.set(1.3,1,0.75); parent.add(tag(tip,part));
  return mesh;
}
// sillín: silueta extruida con bordes redondeados, curvada como uno real
function saddle(g, x0, x1, yTop, wR, wN, th, m, part='sillin'){
  const len = (x1-x0)*0.92, xc=(x0+x1)/2, xr=-len/2, xn=len/2;
  const s = new THREE.Shape();
  s.moveTo(xn,0);
  s.bezierCurveTo(xn,-wN, xn-len*0.3,-wN, xn-len*0.5,-wR*0.72);
  s.bezierCurveTo(xn-len*0.7,-wR*1.02, xr+0.012,-wR*1.02, xr,-wR*0.55);
  s.quadraticCurveTo(xr-0.014,0, xr,wR*0.55);
  s.bezierCurveTo(xr+0.012,wR*1.02, xn-len*0.7,wR*1.02, xn-len*0.5,wR*0.72);
  s.bezierCurveTo(xn-len*0.3,wN, xn,wN, xn,0);
  const bev = Math.min(wN*0.7, th*0.45);
  const geo = new THREE.ExtrudeGeometry(s,{depth:th*0.35, bevelEnabled:true, bevelThickness:th*0.32, bevelSize:bev, bevelSegments:5, curveSegments:28});
  geo.rotateX(Math.PI/2);  // ancho -> z, grosor -> -y
  const p = geo.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), z=p.getZ(i), t=(x-xr)/len;
    p.setY(i, p.getY(i) + 0.012*Math.pow(1-t,2) - 0.006*Math.sin(t*Math.PI)*(1-t) - 0.22*z*z/Math.max(wR,0.03));
  }
  geo.computeVertexNormals();
  const top = new THREE.Mesh(geo, m); top.position.set(xc, yTop-0.004, 0); g.add(tag(top,part));
  const rail = mat(part,0xb9bec4,{r:.25,m:.9});
  for(const sz of [1,-1]) curveTube([[xc-len*0.36,yTop-th*0.55,wR*0.45*sz],[xc-len*0.1,yTop-th*0.95,0.019*sz],[xc+len*0.2,yTop-th*0.95,0.016*sz],[xc+len*0.36,yTop-th*0.5,0.01*sz]],0.0028,rail,part,g,24);
  return top;
}
// texturas generadas en la página (sin descargar nada)
function canvasTex(size, draw, rx=1, ry=1){
  const c = document.createElement('canvas'); c.width=c.height=size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry); t.anisotropy = 4; return t;
}
const TEX = {};
function carbonTex(){
  if(TEX.carbon) return TEX.carbon;
  TEX.carbon = canvasTex(64,(x,s)=>{ x.fillStyle='#16171a'; x.fillRect(0,0,s,s);
    for(let i=0;i<8;i++) for(let j=0;j<8;j++){ const g=x.createLinearGradient(i*8,j*8,i*8+8,j*8+8);
      const a=(i+j)%2===0; g.addColorStop(0,a?'#2c2e33':'#1d1f23'); g.addColorStop(1,a?'#1a1b1e':'#2a2c30'); x.fillStyle=g; x.fillRect(i*8,j*8,8,8); } });
  TEX.carbon.colorSpace = THREE.SRGBColorSpace; return TEX.carbon;
}
function treadBump(){
  return TEX.tread ||= canvasTex(32,(x,s)=>{ x.fillStyle='#808080'; x.fillRect(0,0,s,s); x.strokeStyle='#4a4a4a'; x.lineWidth=2;
    for(let i=-s;i<s*2;i+=6){ x.beginPath(); x.moveTo(i,0); x.lineTo(i+s/2,s/2); x.lineTo(i,s); x.stroke(); } });
}
function group(part,parent=root,pos=[0,0,0]){
  const g = new THREE.Group(); g.position.copy(V(pos)); parent.add(g);
  (partGroups[part] ||= []).push(g); return g;
}

/* ================================================================== */
/*  MODELOS DE BICICLETA                                               */
/*  (x = hacia adelante, y = arriba, z = lado derecho)                 */
/* ================================================================== */
const PITCH_R = 0.0127/(2*Math.PI);     // radio por diente (paso de cadena 1/2")
const toothR = n => n*PITCH_R;
const LINK = 0.0127, MAXLINKS = 260;
const opts = { rueditas: true };

let M, RA, FA, BB, RINGS, COGS, ringZ, cogZ, gear, L_OFF, PULLEY_R;
let wheelF, wheelR, crank, pedalGroups = [], trainers = [];
let rdCage=null, rdBody=null, rdHanger=null, fdCage=null, fdArm=null, fdClamp=null, FD_Y=0;
let chainMesh, chainCurve, chainLen, nLinks = 0, tr = {};
let HOME_POS = new THREE.Vector3(1.35,1.15,2.75), HOME_TARGET = new THREE.Vector3(0,0.52,0);
const stX = y => BB[0] + (y-BB[1])*M.stSlope;   // x del tubo del sillín a la altura y

function teeth(n, r, z, m, part, parent){
  const tooth = new THREE.BoxGeometry(0.006,0.009,0.003);
  for(let i=0;i<n;i++){ const a=i/n*Math.PI*2; const t=new THREE.Mesh(tooth,m); t.position.set(Math.cos(a)*r,Math.sin(a)*r,z); t.rotation.z=a+Math.PI/2; parent.add(tag(t,part)); }
}
function setTube(mesh,A,B){
  const len=A.distanceTo(B); mesh.position.copy(A).add(B).multiplyScalar(.5);
  mesh.scale.set(1,len,1); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),B.clone().sub(A).normalize());
}
function curveTube(points,r,m,part,parent,seg=40){
  const c = new THREE.CatmullRomCurve3(points.map(V));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(c,HQ?seg:Math.ceil(seg/2),r,HQ?16:8,false), m); parent.add(tag(mesh,part));
  const sg = new THREE.SphereGeometry(r, HQ?18:8, HQ?12:6);
  for(const P of [points[0],points[points.length-1]]){ const sp=new THREE.Mesh(sg,m); sp.position.copy(V(P)); parent.add(tag(sp,part)); }
  return mesh;
}
function ellipsoid(pos,scale,m,part,parent){
  const s = new THREE.Mesh(new THREE.SphereGeometry(1,32,16), m); s.scale.set(...scale); s.position.set(...pos);
  parent.add(tag(s,part)); return s;
}

/* ---------- piezas comunes ---------- */
let adjusterMeshes = [];
// Tensores de cable: tuerca estriada por donde sale el cable de la maneta o el mando
function adjusters(list){
  const g = group('tensores');
  const silver = mat('tensores',0xc9ced3,{r:.25,m:.9}), black = mat('tensores',0x1a1a1a,{r:.55,m:.2}), nut = mat('tensores',0x2b2d30,{r:.45,m:.4});
  for(const [a,b,kind] of list){
    const A=V(a), dir=V(b).sub(A).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
    const knurl = new THREE.Mesh(new THREE.CylinderGeometry(0.0078,0.0078,0.02,10,1), kind==='freno'?silver:black);
    knurl.material.flatShading = true;
    knurl.position.copy(A).addScaledVector(dir,0.016); knurl.quaternion.copy(q); g.add(tag(knurl,'tensores'));
    adjusterMeshes.push(knurl);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0098,0.0098,0.004,8), nut);
    ring.position.copy(A).addScaledVector(dir,0.004); ring.quaternion.copy(q); g.add(tag(ring,'tensores'));
    const ferr = new THREE.Mesh(new THREE.CylinderGeometry(0.0045,0.0045,0.01,10), silver);
    ferr.position.copy(A).addScaledVector(dir,0.031); ferr.quaternion.copy(q); g.add(tag(ferr,'tensores'));
  }
}
/* ---------- piñones y platos con dientes reales ---------- */
const _gearCache = new Map();
function sectorHole(ri, ro, a0, a1){
  const h = new THREE.Path();
  h.absarc(0,0,ro,a1,a0,true);
  h.absarc(0,0,ri,a0,a1,false);
  return h;
}
function sprocketGeo(n, {thick=0.0022, inner=null, cut=0, cutIn=null}={}){
  const key = [n,thick,inner,cut,cutIn,HQ].join('|');
  if(_gearCache.has(key)) return _gearCache.get(key);
  const r = toothR(n), root = r-0.0036, tip = r+0.0034, per = HQ ? 10 : 5;
  const s = new THREE.Shape();
  for(let i=0;i<n*per;i++){
    const t=i/(n*per), a=t*Math.PI*2, ph=(t*n)%1;
    const f = Math.pow(Math.max(0, Math.cos((ph-0.5)*Math.PI*1.15)), 0.8);
    const rr = root + (tip-root)*f;
    i===0 ? s.moveTo(Math.cos(a)*rr, Math.sin(a)*rr) : s.lineTo(Math.cos(a)*rr, Math.sin(a)*rr);
  }
  s.closePath();
  const ri = inner ?? Math.max(0.006, Math.min(0.017, root-0.006));
  const c = new THREE.Path(); c.absarc(0,0,ri,0,Math.PI*2,true); s.holes.push(c);
  if(cut){
    const a = cutIn ?? ri+0.006, b = root-0.007;
    if(b-a > 0.008) for(let k=0;k<cut;k++){ const a0=k/cut*Math.PI*2+0.12, a1=(k+1)/cut*Math.PI*2-0.12; s.holes.push(sectorHole(a,b,a0,a1)); }
  }
  const geo = new THREE.ExtrudeGeometry(s,{depth:thick, bevelEnabled:true, bevelThickness:0.0005, bevelSize:0.0005, bevelSegments:1, curveSegments:10});
  geo.translate(0,0,-thick/2);
  _gearCache.set(key, geo); return geo;
}
function stadiumShape(x0,y0,x1,y1,r0,r1){
  const a=Math.atan2(y1-y0,x1-x0), s=new THREE.Shape();
  s.absarc(x1,y1,r1,a-Math.PI/2,a+Math.PI/2,false);
  s.absarc(x0,y0,r0,a+Math.PI/2,a+Math.PI*1.5,false);
  s.closePath(); return s;
}
function extrude(shape, depth, bevel=0.0006, curve=16){
  const g = new THREE.ExtrudeGeometry(shape,{depth, bevelEnabled:bevel>0, bevelThickness:bevel, bevelSize:bevel, bevelSegments:2, curveSegments:curve});
  g.translate(0,0,-depth/2); return g;
}

/* ---------- rueda: neumático con perfil, llanta, buje, rayos y niples ---------- */
function tireProfile(W, a0, a1, steps=40){
  const rc=W.tireR-W.tireT, h=W.tireT, w=W.tireT*1.08, pts=[];
  for(let i=0;i<=steps;i++){
    const th = a0 + (a1-a0)*i/steps, c=Math.cos(th);
    pts.push(new THREE.Vector2(rc + h*Math.sign(c)*Math.pow(Math.abs(c),0.75), w*Math.sin(th)));
  }
  return pts;
}
function lathe(pts, m, part, g, seg=160){
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, HQ ? seg : Math.ceil(seg*0.45)), m); mesh.rotation.x = Math.PI/2; g.add(tag(mesh,part)); return mesh;
}
const _knobGeo = new RoundedBoxGeometry(0.012,0.007,0.011,2,0.0025);
const _spokeGeo = new THREE.CylinderGeometry(0.00125,0.00125,1,5);
const _nippleGeo = new THREE.CylinderGeometry(0.0022,0.0022,0.012,8);
function buildWheel(part,pos,W){
  const g = group(part,root,pos);
  const tire = mat(part,W.tireColor ?? 0x1c1c1c,{r:.86});
  const rim = mat(part,W.rimColor ?? 0xc4c8cd,{r:W.deep?.3:.28,m:W.deep?.35:.9});
  if(W.deep){ rim.map = carbonTex().clone(); rim.map.colorSpace = THREE.SRGBColorSpace; rim.map.needsUpdate = true; rim.map.repeat.set(220,2); rim.metalness = 0.05; rim.roughness = 0.4; rim.clearcoat = 1; rim.clearcoatRoughness = 0.08; rim.color.set(0xffffff); }
  const sp = mat(part,W.spokeColor ?? 0xd9dce0,{r:.25,m:.92}); const hub = mat(part,W.hubColor ?? 0x2f3338,{r:.3,m:.7});
  // neumático: banda de rodado + flancos (pueden ser de otro color)
  const tread = mat(part,W.tireColor ?? 0x1c1c1c,{r:.82});
  if(!W.knobs){ tread.bumpMap = treadBump(); tread.bumpScale = 0.6; tread.bumpMap.repeat.set(140,2); }
  lathe(tireProfile(W,-Math.PI*0.42,Math.PI*0.42,30), tread, part, g);
  const side = W.sidewall ? mat(part,W.sidewall,{r:.75}) : tire;
  lathe(tireProfile(W,Math.PI*0.4,Math.PI*0.86,22), side, part, g);
  lathe(tireProfile(W,-Math.PI*0.86,-Math.PI*0.4,22), side, part, g);
  if(W.knobs){
    const n=W.knobs, rc=W.tireR-W.tireT, phi=0.95;
    const km = new THREE.InstancedMesh(_knobGeo, tread, n*3); const M4=new THREE.Matrix4(), q=new THREE.Quaternion(), S=new THREE.Vector3(1,1,1);
    let k=0;
    for(let i=0;i<n;i++){
      const a=i/n*Math.PI*2; const nrm=new THREE.Vector3(Math.cos(a),Math.sin(a),0);
      q.setFromUnitVectors(Y1,nrm); M4.compose(nrm.clone().multiplyScalar(W.tireR+0.001),q,S); km.setMatrixAt(k++,M4);
      if(HQ) for(const sz of [1,-1]){
        const b=a+Math.PI/n, cs=Math.cos(phi);
        const nn=new THREE.Vector3(Math.cos(b)*cs,Math.sin(b)*cs,Math.sin(phi)*sz).normalize();
        const pp=new THREE.Vector3(Math.cos(b)*(rc+W.tireT*0.62),Math.sin(b)*(rc+W.tireT*0.62),W.tireT*0.82*sz);
        q.setFromUnitVectors(Y1,nn); M4.compose(pp,q,S); km.setMatrixAt(k++,M4);
      }
    }
    km.instanceMatrix.needsUpdate = true; g.add(tag(km,part));
  }
  // llanta
  let spokeEnd;
  const r = W.rimR;
  if(W.deep){
    const d=W.deep, h=0.0128;
    const prof=[[r-d,0],[r-d+0.004,-h*0.7],[r-0.01,-h],[r+0.002,-h],[r+0.002,-h*0.8],[r-0.003,-h*0.72],[r-0.003,h*0.72],[r+0.002,h*0.8],[r+0.002,h],[r-0.01,h],[r-d+0.004,h*0.7],[r-d,0]].map(([a,b])=>new THREE.Vector2(a,b));
    lathe(prof, rim, part, g, 160);
    const dec = mat(part,0xf2f2f2,{r:.4});
    for(const s of [1,-1]){ const t=new THREE.Mesh(new THREE.TorusGeometry(r-0.024,0.0016,6,120),dec); t.position.z=0.0094*s; g.add(tag(t,part)); }
    spokeEnd = r-d+0.002;
  } else {
    const hw = Math.max(0.0095, W.tireT*0.62), d = Math.max(0.016, W.rimT*1.6);
    const prof=[[r-d,-hw*0.55],[r-d*0.4,-hw],[r+0.002,-hw],[r+0.003,-hw*0.78],[r-0.004,-hw*0.72],[r-0.004,hw*0.72],[r+0.003,hw*0.78],[r+0.002,hw],[r-d*0.4,hw],[r-d,hw*0.55],[r-d,-hw*0.55]].map(([a,b])=>new THREE.Vector2(a,b));
    lathe(prof, rim, part, g, 160);
    spokeEnd = r-d+0.001;
  }
  // buje torneado con pestañas
  const hw = (W.hubW ?? 0.1)*0.35, L = (W.hubW ?? 0.1)+0.012, fr = 0.027;
  const hp=[[0.0055,-L/2],[0.012,-L/2],[0.012,-hw-0.004],[fr,-hw-0.0025],[fr+0.001,-hw],[fr,-hw+0.0025],[0.017,-hw+0.006],[0.0145,-hw*0.3],[0.0145,hw*0.3],[0.017,hw-0.006],[fr,hw-0.0025],[fr+0.001,hw],[fr,hw+0.0025],[0.012,hw+0.004],[0.012,L/2],[0.0055,L/2]].map(([a,b])=>new THREE.Vector2(a,b));
  lathe(hp, hub, part, g, 40);
  disc([0,0,0],0.0055,L+0.012,mat(part,0x9aa1a8,{r:.3,m:.9}),part,g,16);
  // rayos y niples (instanciados)
  const n=W.spokes, cross=W.cross ?? 0.25;
  const spokes = new THREE.InstancedMesh(_spokeGeo, sp, n), nip = new THREE.InstancedMesh(_nippleGeo, sp, n);
  const M4=new THREE.Matrix4(), q=new THREE.Quaternion();
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2, s=i%2?1:-1, a2=a+(i%2?cross:-cross);
    const A=new THREE.Vector3(Math.cos(a2)*(fr-0.003),Math.sin(a2)*(fr-0.003),hw*s), B=new THREE.Vector3(Math.cos(a)*spokeEnd,Math.sin(a)*spokeEnd,0);
    const dir=B.clone().sub(A), len=dir.length(); q.setFromUnitVectors(Y1,dir.normalize());
    M4.compose(A.clone().add(B).multiplyScalar(.5),q,new THREE.Vector3(1,len,1)); spokes.setMatrixAt(i,M4);
    M4.compose(B.clone().addScaledVector(dir,-0.004),q,new THREE.Vector3(1,1,1)); nip.setMatrixAt(i,M4);
  }
  spokes.instanceMatrix.needsUpdate = nip.instanceMatrix.needsUpdate = true;
  g.add(tag(spokes,part)); g.add(tag(nip,part));
  // válvula
  const va = Math.PI*0.5+Math.PI/n, vr = spokeEnd+0.004;
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.0028,0.0028,0.026,10), mat(part,0x8a9097,{r:.3,m:.9}));
  valve.position.set(Math.cos(va)*(vr-0.006),Math.sin(va)*(vr-0.006),0); valve.rotation.z=va-Math.PI/2; g.add(tag(valve,part));
  return g;
}

/* ---------- cassette ---------- */
function buildCassette(){
  const cs = group('cassette',wheelR);
  const m = mat('cassette',0xb4bac0,{r:.22,m:.95});
  const dark = mat('cassette',0x3a3f45,{r:.35,m:.8});
  COGS.forEach((n,i)=>{
    const mesh = new THREE.Mesh(sprocketGeo(n,{cut: n>=24 ? 5 : 0}), i%2 ? m : m); mesh.position.z = cogZ(i); cs.add(tag(mesh,'cassette'));
  });
  const zs = COGS.map((_,i)=>cogZ(i));
  disc([0,0,(Math.min(...zs)+Math.max(...zs))/2],Math.min(0.018,toothR(Math.min(...COGS))-0.006),Math.abs(zs[zs.length-1]-zs[0])+0.012,dark,'cassette',cs,24);
  disc([0,0,Math.max(...zs)+0.004],Math.min(0.016,toothR(Math.min(...COGS))-0.006),0.004,m,'cassette',cs,24);
}

/* ---------- bielas, platos y pedales ---------- */
function armGeo(L, r0, r1, depth){
  const s=new THREE.Shape();
  s.moveTo(r0,0); s.absarc(0,0,r0,0,Math.PI,false);
  s.bezierCurveTo(-r0,-L*0.3,-r1*1.05,-L*0.7,-r1,-L);
  s.absarc(0,-L,r1,Math.PI,Math.PI*2,false);
  s.bezierCurveTo(r1*1.05,-L*0.7,r0,-L*0.3,r0,0);
  return extrude(s, depth, 0.003, 20);
}
function buildCrank(){
  const D = M.drive;
  crank = group('bielas',root,BB);
  const m = mat('bielas',D.armColor ?? 0x2d3135,{r:.3,m:.65}); const ch = mat('bielas',D.ringColor ?? 0xb6bcc2,{r:.22,m:.92});
  RINGS.forEach((n,i)=>{
    const big = toothR(n) > 0.06;
    const mesh = new THREE.Mesh(sprocketGeo(n,{thick:0.0034, inner:0.02, cut: big ? 5 : 0, cutIn: 0.058}), ch);
    mesh.position.z = ringZ(i); crank.add(tag(mesh,'bielas'));
  });
  const az = D.armZ ?? 0.09, L = D.crank, zOut = ringZ(RINGS.length-1)+0.004;
  // araña de 5 brazos
  const spR = Math.max(0.03, Math.min(toothR(RINGS[RINGS.length>2?1:0]), toothR(Math.max(...RINGS)))-0.008);
  for(let i=0;i<5;i++){ const a=i/5*Math.PI*2+0.3;
    const arm = new THREE.Mesh(extrude(stadiumShape(0,0,Math.cos(a)*spR,Math.sin(a)*spR,0.011,0.0065),0.005,0.0012), m);
    arm.position.z = zOut+0.002; crank.add(tag(arm,'bielas'));
    disc([Math.cos(a)*spR,Math.sin(a)*spR,zOut+0.005],0.0035,0.004,mat('bielas',0x9aa1a8,{r:.3,m:.9}),'bielas',crank,12);
  }
  disc([0,0,0],0.012,az*2.2,m,'bielas',crank,24);
  const right = new THREE.Mesh(armGeo(L,0.016,0.011,0.013), m); right.position.z = az+0.004; crank.add(tag(right,'bielas'));
  const left = new THREE.Mesh(armGeo(L,0.016,0.011,0.013), m); left.rotation.z = Math.PI; left.position.z = -az-0.004; crank.add(tag(left,'bielas'));
  disc([0,0,az+0.012],0.011,0.005,mat('bielas',0x9aa1a8,{r:.3,m:.9}),'bielas',crank,24);
  disc([0,0,-az-0.012],0.011,0.005,mat('bielas',0x9aa1a8,{r:.3,m:.9}),'bielas',crank,24);
  for(const [y,z] of [[-L,1],[L,-1]]){
    const pg = group('pedales',crank,[0,y,(az+0.01)*z]);
    buildPedal(pg, z);
    pedalGroups.push(pg);
  }
}
function buildPedal(pg, z){
  const pm = mat('pedales',0x26292c,{r:.5,m:.4}); const pa = mat('pedales',0xa3aab1,{r:.25,m:.9});
  disc([0,0,0.026*z],0.0055,0.052,pa,'pedales',pg,14);
  if(M.pedals==='clip'){
    const red = mat('pedales',0xc1121f,{r:.35,m:.2});
    const s = new THREE.Shape(); s.moveTo(-0.038,0); s.bezierCurveTo(-0.038,-0.03,0.0,-0.03,0.03,-0.012); s.quadraticCurveTo(0.044,0,0.03,0.012); s.bezierCurveTo(0,0.03,-0.038,0.03,-0.038,0);
    const geo = extrude(s,0.01,0.003); geo.rotateX(Math.PI/2);
    const body = new THREE.Mesh(geo, pm); body.position.set(0,0,0.058*z); pg.add(tag(body,'pedales'));
    const plate = new THREE.Mesh(geo, red); plate.scale.set(0.7,0.35,0.7); plate.position.set(0.004,0.008,0.058*z); pg.add(tag(plate,'pedales'));
  } else if(M.pedals==='kids'){
    const ref = mat('pedales',0xff8c1a,{r:.3,m:.1});
    box([0,0,0.052*z],[0.07,0.02,0.058],pm,'pedales',pg);
    for(const sx of [1,-1]) box([0.036*sx,0,0.052*z],[0.005,0.012,0.04],ref,'pedales',pg);
  } else {
    const w=0.05, d=0.045, s=new THREE.Shape();
    s.moveTo(-w,-d+0.008); s.quadraticCurveTo(-w,-d,-w+0.008,-d); s.quadraticCurveTo(0,-d+0.007,w-0.008,-d); s.quadraticCurveTo(w,-d,w,-d+0.008);
    s.lineTo(w,d-0.008); s.quadraticCurveTo(w,d,w-0.008,d); s.quadraticCurveTo(0,d-0.007,-w+0.008,d); s.quadraticCurveTo(-w,d,-w,d-0.008); s.closePath();
    const hole = new THREE.Path(); hole.absellipse(0,0,w*0.62,d*0.55,0,Math.PI*2,true); s.holes.push(hole);
    const geo = extrude(s,0.012,0.0025); geo.rotateX(Math.PI/2);
    const body = new THREE.Mesh(geo, pm); body.position.set(0,0,0.075*z); pg.add(tag(body,'pedales'));
    const pin = mat('pedales',0xc9ced3,{r:.25,m:.9});
    for(const px of [-w+0.007,w-0.007]) for(const pz of [-d+0.01,0,d-0.01]) for(const py of [1,-1]) disc([px,0.0085*py,0.075*z+pz],0.0016,0.005,pin,'pedales',pg,8).rotation.set(0,0,0);
  }
}

/* ---------- desviadores ---------- */
function buildRD(){
  L_OFF = new THREE.Vector2(...M.drive.L);
  rdHanger = new THREE.Vector3(RA[0]-0.005, RA[1]-0.025, 0.08);
  rdCage = new THREE.Group();
  const g = group('desviador'); const m = mat('desviador',0x2f3439,{r:.3,m:.75}); const a = mat('desviador',0xb9bec4,{r:.22,m:.92}); const p = mat('desviador',0x141414,{r:.55});
  box([RA[0]-0.005,RA[1]-0.02,0.072],[0.024,0.042,0.014],m,'desviador',g,0.3);
  // cuerpo de paralelogramo (se estira según el piñón)
  rdBody = new THREE.Group(); g.add(rdBody);
  const link = new RoundedBoxGeometry(0.017,1,0.0045,2,0.0018);
  for(const [dz,mm] of [[0.007,a],[-0.007,m]]){ const l=new THREE.Mesh(link,mm); l.position.z=dz; rdBody.add(tag(l,'desviador')); }
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,1,12), m); rdBody.add(tag(core,'desviador'));
  g.add(rdCage);
  // jaula: placas con forma de cápsula alrededor de las roldanas
  const plateGeo = extrude(stadiumShape(0,0,L_OFF.x,L_OFF.y,PULLEY_R+0.0055,PULLEY_R+0.0065),0.0026,0.0008);
  for(const [dz,mm] of [[0.011,a],[-0.011,m]]){ const pl=new THREE.Mesh(plateGeo,mm); pl.position.z=dz; rdCage.add(tag(pl,'desviador')); }
  disc([0,0.02,0.012],0.011,0.016,m,'desviador',rdCage,24);
  const f = PULLEY_R/toothR(11);
  const pulGeo = sprocketGeo(11,{thick:0.006, inner:0.004}).clone(); pulGeo.scale(f,f,1);
  for(const [x,y] of [[0,0],[L_OFF.x,L_OFF.y]]){
    const pu = new THREE.Mesh(pulGeo,p); pu.position.set(x,y,0); rdCage.add(tag(pu,'desviador'));
    disc([x,y,0],0.0045,0.024,a,'desviador',rdCage,12);
  }
}
function buildFD(){
  FD_Y = BB[1] + toothR(Math.max(...RINGS)) + 0.014;
  const cy = FD_Y + 0.05;
  fdClamp = new THREE.Vector3(stX(cy), cy, 0);
  fdCage = new THREE.Group();
  const g = group('desviador_del'); const m = mat('desviador_del',0x2f3439,{r:.3,m:.75}); const a = mat('desviador_del',0xb9bec4,{r:.22,m:.92});
  const c = new THREE.Mesh(new THREE.TorusGeometry(0.026,0.006,10,28), m); c.rotation.x=Math.PI/2; c.position.copy(fdClamp); g.add(tag(c,'desviador_del'));
  fdArm = new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,1,14), m); g.add(tag(fdArm,'desviador_del'));
  g.add(fdCage);
  // placas curvas que siguen el contorno del plato grande
  const cx = BB[0]-(stX(FD_Y)+0.012), cyy = BB[1]-FD_Y, Ri = toothR(Math.max(...RINGS))+0.006, Ro = Ri+0.026;
  const phc = Math.atan2(-cyy,-cx), hh = 0.055/Ri;
  const s = new THREE.Shape(); s.absarc(cx,cyy,Ro,phc+hh,phc-hh,true); s.absarc(cx,cyy,Ri,phc-hh*0.95,phc+hh*0.95,false); s.closePath();
  const geo = extrude(s,0.0026,0.0008,24);
  for(const [dz,mm] of [[0.009,a],[-0.009,m]]){ const pl=new THREE.Mesh(geo,mm); pl.position.z=dz; fdCage.add(tag(pl,'desviador_del')); }
  box([Math.cos(phc-hh)*Ri+cx,Math.sin(phc-hh)*Ri+cyy+0.012,0],[0.014,0.012,0.021],m,'desviador_del',fdCage);
}

/* ---------- frenos de disco ---------- */
let rotorGroups = [];
function rotorGeo(R){
  const key='rotor'+R; if(_gearCache.has(key)) return _gearCache.get(key);
  const s = new THREE.Shape(); s.absarc(0,0,R,0,Math.PI*2,false);
  const inner = new THREE.Path(); inner.absarc(0,0,R-0.017,0,Math.PI*2,true); s.holes.push(inner);
  for(let i=0;i<26;i++){ const a=i/26*Math.PI*2, rr=R-0.0085+(i%2?0.0025:-0.0025); const h=new THREE.Path(); h.absarc(Math.cos(a)*rr,Math.sin(a)*rr,0.0021,0,Math.PI*2,true); s.holes.push(h); }
  const geo = extrude(s,0.0018,0,48); _gearCache.set(key,geo); return geo;
}
function discBrakes(rotor, z){
  const g = group('frenos'); const d = mat('frenos',0xd6dade,{r:.18,m:.95}); const c = mat('frenos',0x1c1c1c,{r:.4,m:.45}); const k = mat('frenos',0x3a3f45,{r:.3,m:.8});
  rotorGroups = [];
  for(const [A,which] of [[RA,'r'],[FA,'f']]){
    const rg = group('frenos',root,[A[0],A[1],z]); rotorGroups.push([rg,which]);
    const tr = new THREE.Mesh(rotorGeo(rotor), d); rg.add(tag(tr,'frenos'));
    for(let i=0;i<6;i++){ const a=i/6*Math.PI*2;
      const arm = new THREE.Mesh(extrude(stadiumShape(Math.cos(a)*0.02,Math.sin(a)*0.02,Math.cos(a+0.42)*(rotor-0.014),Math.sin(a+0.42)*(rotor-0.014),0.006,0.0045),0.0022,0.0004), k);
      rg.add(tag(arm,'frenos')); }
    const hubc = new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.026,0.004,6), k); hubc.rotation.x=Math.PI/2; rg.add(tag(hubc,'frenos'));
  }
  const ox=rotor*0.69, oy=rotor*0.56;
  for(const [x,y,rz] of [[RA[0]+ox,RA[1]+oy,-0.8],[FA[0]-ox,FA[1]+oy,0.8]]){
    // pinza a caballito sobre el disco, en el lado interior de la horquilla / vaina
    box([x,y,z],[0.058,0.032,0.026],c,'frenos',g,rz);
    // soporte que la une a la pata de la horquilla / vaina (más hacia afuera)
    box([x,y,z*1.28],[0.05,0.026,Math.abs(z)*0.5],k,'frenos',g,rz);
    for(const s of [1,-1]) disc([x+Math.cos(rz)*0.016*s,y+Math.sin(rz)*0.016*s,z*1.5],0.0045,0.004,k,'frenos',g,12);
  }
  return g;
}

/* ---------- los tres modelos ---------- */
const MODELS = {
/* ------------------------- MONTAÑA ------------------------- */
mtb:{
  nombre:'Montaña', titulo:'Bicicleta de montaña',
  desc:'Ruedas grandes con tacos, suspensión delantera y 3 platos × 7 piñones = 21 marchas. Hecha para caminos de tierra y cerros.',
  RA:[-0.52,0.365,0], FA:[0.56,0.365,0], BB:[0,0.32,0], stSlope:-0.245,
  wheel:{tireR:0.363,tireT:0.028,rimR:0.305,rimT:0.013,knobs:64,spokes:24},
  drive:{rings:[22,32,42],cogs:[28,24,22,20,18,16,14],rz0:0.05,rdz:0.0105,cz0:0.04,cdz:0.005,start:{r:1,c:3},rd:true,fd:true,L:[0.03,-0.085],pulley:0.017,crank:0.17},
  pedals:'flat', brakes:'disc',
  cam:{pos:[1.35,1.15,2.75],target:[0,0.52,0]}, scale:1,
  parts:['cuadro','horquilla','manubrio','manetas','tensores','sillin','rueda_del','rueda_tras','frenos','bielas','desviador_del','pedales','cadena','cassette','desviador'],
  over:{},
  build(){
    { const g = group('cuadro'); const m = mat('cuadro',0x1f6f78,{r:.35,m:.3});
      tube([-0.12,0.81,0],[0.408,0.951,0],0.021,m,'cuadro',g);
      tube(BB,[0.436,0.831,0],0.027,m,'cuadro',g);
      tube(BB,[-0.135,0.87,0],0.02,m,'cuadro',g);
      tube([0.398,0.996,0],[0.444,0.806,0],0.03,m,'cuadro',g);
      for(const s of [1,-1]){
        tube([0,0.32,0.03*s],[RA[0],RA[1],0.062*s],0.012,m,'cuadro',g);
        tube([-0.118,0.79,0.018*s],[RA[0],RA[1],0.062*s],0.011,m,'cuadro',g);
        dropout([RA[0],RA[1],0.062*s],[0.62,0.78],m,'cuadro',g);
      }
      disc(BB,0.032,0.085,m,'cuadro',g,32); }
    { const g = group('horquilla'); const m = mat('horquilla',0x1f6f78,{r:.35,m:.3}); const st = mat('horquilla',0xc9ced3,{r:.2,m:.9});
      box([0.446,0.791,0],[0.05,0.03,0.13],m,'horquilla',g,-0.24);
      for(const s of [1,-1]){
        curveTube([[0.448,0.786,0.052*s],[0.50,0.58,0.055*s],[FA[0],FA[1],0.055*s]],0.014,m,'horquilla',g,24);
        tube([0.449,0.78,0.052*s],[0.472,0.68,0.053*s],0.0165,st,'horquilla',g,16);
        dropout([FA[0],FA[1],0.055*s],[-0.33,0.94],m,'horquilla',g);
      } }
    { const g = group('manubrio',root,[-0.032,0.131,0]); const m = mat('manubrio',0x2a2f33,{r:.4,m:.4}); const gr = mat('manubrio',0x161616,{r:.9});
      tube([0.428,0.86,0],[0.422,0.93,0],0.017,m,'manubrio',g);
      tube([0.42,0.915,0],[0.505,0.935,0],0.016,m,'manubrio',g);
      tube([0.505,0.935,-0.31],[0.505,0.935,0.31],0.012,m,'manubrio',g);
      for(const s of [1,-1]) grip([0.505,0.935,0.24*s],[0.505,0.935,0.315*s],0.018,gr,'manubrio',g); }
    { const g = group('manetas',root,[-0.032,0.131,0]); const m = mat('manetas',0x3a3f44,{r:.35,m:.5}); const s2 = mat('manetas',0x111111,{r:.6});
      for(const s of [1,-1]){
        disc([0.505,0.935,0.205*s],0.017,0.018,s2,'manetas',g,20);
        lever([0.515,0.935,0.205*s],[0.6,0.915,0.24*s],m,'manetas',g);
        box([0.49,0.905,0.175*s],[0.04,0.03,0.03],s2,'manetas',g);
      } }
    { const g = group('sillin'); const m = mat('sillin',0x232323,{r:.7}); const t = mat('sillin',0xb9bec4,{r:.25,m:.8});
      tube([-0.13,0.85,0],[-0.155,0.985,0],0.014,t,'sillin',g);
      saddle(g,-0.3,0.0,1.024,0.068,0.022,0.03,m); }
    const cm = c=>mat(c,0x55595d,{r:.6});
    cable([[0.458,1.031,0.18],[0.44,0.9,0.06],[0.25,0.585,0.035],[0.02,0.28,0.04],[-0.3,0.33,0.06],[-0.52,0.35,0.085]],0.0035,cm('desviador'),'desviador',group('desviador'));
    cable([[0.458,1.031,-0.18],[0.44,0.9,-0.06],[0.25,0.585,-0.035],[0.03,0.28,-0.01],[-0.02,0.33,0.02],[-0.035,0.44,0.03]],0.0035,cm('desviador_del'),'desviador_del',group('desviador_del'));
    adjusters([
      [[0.458,1.031,0.18],[0.44,0.9,0.06],'cambio'], [[0.458,1.031,-0.18],[0.44,0.9,-0.06],'cambio'],
      [[0.468,1.061,0.2],[0.42,0.97,0.04],'freno'],  [[0.468,1.061,-0.2],[0.53,0.94,-0.13],'freno']]);
    const fb = discBrakes(0.08,-0.04);
    cable([[0.468,1.061,-0.2],[0.53,0.94,-0.13],[0.52,0.68,-0.07],[0.5,0.43,-0.055]],0.0035,cm('frenos'),'frenos',fb);
    cable([[0.468,1.061,0.2],[0.42,0.97,0.04],[0.2,0.897,0.025],[-0.08,0.836,0.02],[-0.25,0.62,-0.05],[-0.45,0.43,-0.06]],0.0035,cm('frenos'),'frenos',fb);
  }
},
/* ------------------------- INFANTIL ------------------------- */
ninos:{
  nombre:'Infantil', titulo:'Bicicleta infantil (aro 16)',
  desc:'Bici de aro 16 para niños de unos 4 a 6 años: cuadro bajo, una sola marcha, frenos V-brake, protector de cadena y rueditas de apoyo opcionales.',
  RA:[-0.33,0.2,0], FA:[0.37,0.2,0], BB:[0,0.19,0], stSlope:-0.323,
  wheel:{tireR:0.2,tireT:0.026,rimR:0.172,rimT:0.01,knobs:40,spokes:20,hubW:0.08,cross:0.3},
  drive:{rings:[28],cogs:[16],rz0:0.055,rdz:0,cz0:0.055,cdz:0,start:{r:0,c:0},rd:false,fd:false,crank:0.1,armZ:0.072,armColor:0x9aa1a8},
  pedals:'kids', brakes:'rim',
  cam:{pos:[0.9,0.72,1.8],target:[0.02,0.33,0]}, scale:0.6,
  parts:['cuadro','horquilla','manubrio','manetas','tensores','sillin','rueda_del','rueda_tras','frenos','bielas','pedales','cadena','protector','cassette','rueditas'],
  over:{
    cuadro:{nombre:'Cuadro infantil', que:'Cuadro bajo y liviano, con el tubo superior muy inclinado para que el niño suba y baje fácil y pueda apoyar los pies en el suelo. Esta es una bici de aro 16 (ruedas de unos 40 cm), para niños de unos 4 a 6 años.'},
    horquilla:{que:'Horquilla rígida de acero que sostiene la rueda delantera. En las bicis infantiles no lleva suspensión, para que sea liviana y simple.',
      prob:[['La dirección tiene juego','Aprieta la tuerca superior de la dirección hasta que no se mueva al frenar, pero sin que quede dura.'],['El manubrio no queda alineado con la rueda','Suelta el perno de la potencia, alinea y vuelve a apretar firme.'],['La horquilla se dobló tras una caída','Cámbiala: una horquilla doblada hace que la bici tire hacia un lado.']]},
    tensores:{nombre:'Tensores de freno', que:'Son las tuercas estriadas por donde sale el cable de cada maneta de freno. Esta bici no tiene cambios, así que solo hay tensores de freno.',
      prob:[['La maneta llega casi al manubrio','Suelta la contratuerca, gira el tensor hacia afuera (sentido antihorario) hasta que la maneta frene firme a mitad de recorrido y vuelve a apretar la contratuerca.'],['La zapata roza la llanta todo el tiempo','El cable quedó demasiado tenso: gira el tensor hacia adentro (sentido horario) un poco.'],['El tensor ya está casi todo afuera','No lo saques más, porque se puede soltar. Mételo de nuevo y tensa el cable desde el tornillo del freno.']]},
    manubrio:{nombre:'Manubrio con timbre', que:'Manubrio alto y curvado hacia arriba para que el niño vaya sentado derecho y vea bien el camino. Lleva un timbre para avisar.'},
    manetas:{nombre:'Manetas de freno', que:'Manetas pequeñas pensadas para manos de niño. Muchas tienen un tornillo para acercarlas al manubrio y que los dedos lleguen bien.',
      como:'Al apretar la maneta, un cable tira de los brazos del freno y las zapatas aprietan la llanta. La izquierda suele frenar la rueda delantera y la derecha la trasera.',
      prob:[['El niño no alcanza la maneta','Gira el tornillo de alcance (junto a la maneta) para acercarla al manubrio y vuelve a revisar que frene.'],['La maneta llega hasta el manubrio','Tensa el cable con el tensor de la maneta o ajusta el cable en el freno.'],['Maneta suelta','Aprieta el tornillo de su abrazadera con llave Allen.']]},
    sillin:{nombre:'Sillín infantil', que:'Sillín ancho y acolchado. La tija tiene una marca de inserción mínima que no se debe sobrepasar.',
      como:'Para aprender, el sillín va bajo: el niño sentado debe tocar el suelo con la punta de los pies. Cuando ya pedalea seguro, se sube un poco para que pedalee más cómodo.',
      prob:[['¿A qué altura lo pongo?','Al aprender: sentado, el niño apoya las puntas de ambos pies en el suelo. Después, súbelo de a 1–2 cm.'],['Se baja solo','Aprieta la abrazadera del tubo del sillín.'],['Gira hacia el lado','Alinéalo con el cuadro y aprieta la abrazadera.']]},
    rueda_del:{que:'Rueda de aro 16: neumático, cámara, llanta, rayos y buje. Es más chica que la de un adulto para que la bici quede a la medida del niño.'},
    rueda_tras:{que:'Rueda de aro 16 con un solo piñón. En ella se atornillan las rueditas de apoyo.',
      como:'Es la rueda motriz: la cadena hace girar el piñón y este la rueda. Las tuercas de su eje también sujetan las rueditas, así que hay que apretarlas bien.',
      prob:[['Pinchazo','Suelta las tuercas del eje (y las rueditas), saca la rueda y repara la cámara con un parche.'],['La cadena queda floja','Suelta las tuercas del eje, tira la rueda hacia atrás hasta que la cadena tenga 1 cm de juego, centra la rueda y aprieta.'],['La rueda está chueca en el cuadro','Suelta el eje, céntrala entre las vainas y aprieta ambas tuercas parejo.']]},
    frenos:{nombre:'Frenos V-brake', que:'Dos brazos con zapatas de goma que aprietan los costados de la llanta. Algunas bicis infantiles también traen freno contrapedal (se frena pedaleando hacia atrás).',
      como:'Al apretar la maneta, el cable junta los dos brazos y las zapatas rozan la llanta. Ese roce convierte el movimiento en calor y la rueda se detiene.',
      prob:[['Frena poco','Revisa que las zapatas toquen la llanta completas y no estén gastadas (tienen ranuras: si ya no se ven, cámbialas). Limpia la llanta.'],['Una zapata roza siempre','Gira el tornillo de tensión del resorte de un brazo para centrar el freno.'],['Las zapatas tocan el neumático','Suelta la zapata, bájala para que toque solo la llanta y aprieta. Puede reventar el neumático.']]},
    bielas:{nombre:'Bielas y plato', que:'Bielas cortas (unos 10 cm, a la medida de las piernas del niño) y un solo plato de 28 dientes.',
      como:'Las bielas son palancas que convierten el empuje de las piernas en giro. Como hay un solo plato, no hay que cambiar de marcha: solo pedalear.'},
    pedales:{nombre:'Pedales infantiles', que:'Pedales de plástico con reflectantes naranjos para que la bici se vea de noche.'},
    cassette:{nombre:'Piñón trasero', que:'Una sola rueda dentada de 16 dientes en la rueda trasera. La bici tiene una sola marcha: es más simple, liviana y casi no necesita ajustes.',
      como:'Cada vuelta de pedal hace girar la rueda 28 ÷ 16 = 1,75 veces. Es una marcha suave, fácil para piernas pequeñas.',
      prob:[['La cadena se sale seguido','Está floja. Tira la rueda trasera hacia atrás hasta que la cadena tenga 1 cm de juego.'],['Ruido al pedalear','Lubrica la cadena y revisa que el protector no la roce.'],['Dientes gastados','Si se ven con forma de gancho, cambia piñón y cadena juntos.']]},
  },
  build(){
    const red = 0xe63946;
    { const g = group('cuadro'); const m = mat('cuadro',red,{r:.3,m:.2});
      tube([-0.093,0.478,0],[0.224,0.515,0],0.018,m,'cuadro',g);
      tube(BB,[0.244,0.46,0],0.022,m,'cuadro',g);
      tube(BB,[-0.1,0.5,0],0.018,m,'cuadro',g);
      tube([0.212,0.547,0],[0.25,0.444,0],0.022,m,'cuadro',g);
      for(const s of [1,-1]){
        tube([0,BB[1],0.025*s],[RA[0],RA[1],0.045*s],0.01,m,'cuadro',g);
        tube([-0.08,0.437,0.012*s],[RA[0],RA[1],0.045*s],0.009,m,'cuadro',g);
        dropout([RA[0],RA[1],0.045*s],[0.62,0.78],m,'cuadro',g);
      }
      disc(BB,0.026,0.07,m,'cuadro',g,28); }
    { const g = group('horquilla'); const m = mat('horquilla',red,{r:.3,m:.2});
      box([0.253,0.434,0],[0.04,0.025,0.1],m,'horquilla',g,-0.35);
      for(const s of [1,-1]){
        curveTube([[0.255,0.43,0.042*s],[0.31,0.315,0.043*s],[FA[0],FA[1],0.043*s]],0.011,m,'horquilla',g,20);
        dropout([FA[0],FA[1],0.043*s],[-0.33,0.94],m,'horquilla',g);
      } }
    { const g = group('manubrio'); const m = mat('manubrio',0xc9ced3,{r:.25,m:.85}); const gr = mat('manubrio',0xf4c430,{r:.8}); const bell = mat('manubrio',0x2a9d8f,{r:.25,m:.6});
      tube([0.212,0.547,0],[0.19,0.61,0],0.014,m,'manubrio',g);
      tube([0.188,0.6,0],[0.226,0.614,0],0.014,m,'manubrio',g);
      curveTube([[0.222,0.666,-0.225],[0.223,0.664,-0.13],[0.226,0.628,-0.065],[0.227,0.615,0],[0.226,0.628,0.065],[0.223,0.664,0.13],[0.222,0.666,0.225]],0.01,m,'manubrio',g,48);
      for(const s of [1,-1]){ grip([0.222,0.666,0.16*s],[0.222,0.666,0.226*s],0.016,gr,'manubrio',g); disc([0.222,0.666,0.23*s],0.02,0.008,gr,'manubrio',g,16); }
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.022,20,10,0,Math.PI*2,0,Math.PI/2), bell); b.position.set(0.225,0.672,-0.1); g.add(tag(b,'manubrio')); }
    { const g = group('manetas'); const m = mat('manetas',0x2b2d30,{r:.5,m:.3});
      for(const s of [1,-1]){ disc([0.222,0.666,0.145*s],0.014,0.016,m,'manetas',g,16); lever([0.23,0.666,0.145*s],[0.285,0.655,0.18*s],m,'manetas',g); } }
    { const g = group('sillin'); const m = mat('sillin',0x1d3557,{r:.6}); const t = mat('sillin',0xb9bec4,{r:.25,m:.8});
      tube([-0.1,0.5,0],[-0.132,0.6,0],0.012,t,'sillin',g);
      saddle(g,-0.235,-0.03,0.642,0.066,0.028,0.034,m); }
    // Frenos V-brake (sobre la llanta)
    adjusters([[[0.235,0.666,-0.15],[0.28,0.62,-0.08],'freno'],[[0.235,0.666,0.15],[0.2,0.58,0.05],'freno']]);
    vbrakes({fDir:[-0.447,0.895], rDir:[0.726,0.688], leverL:[0.235,0.666,-0.15], leverR:[0.235,0.666,0.15],
      routeF:[[0.28,0.62,-0.08],[0.3,0.5,-0.03]], routeR:[[0.2,0.58,0.05],[0.1,0.51,0.025],[-0.05,0.49,0.02],[-0.15,0.39,0.0]]});
    // Protector de cadena
    chainGuard(0.082, RA[0]+0.06, 0xf1f1f1);
    // Rueditas de apoyo
    if(opts.rueditas){
      const metal = mat('rueditas',0xc9ced3,{r:.25,m:.85}); const tire = mat('rueditas',0xf5f5f5,{r:.7}); const hub = mat('rueditas',0xf4c430,{r:.4,m:.1});
      for(const s of [1,-1]){
        const cx = RA[0]-0.06, cy = 0.08, cz = 0.2*s;
        const g = group('rueditas',root,[cx,cy,cz]);
        tube([RA[0]-cx,RA[1]-cy,0.055*s-cz],[0,0,0],0.007,metal,'rueditas',g,10);
        tube([RA[0]-cx+0.05,RA[1]-cy-0.02,0.04*s-cz],[0.005,0.035,-0.01*s],0.006,metal,'rueditas',g,10);
        box([0,0.008,-0.01*s],[0.03,0.05,0.006],metal,'rueditas',g);
        const w = new THREE.Group(); g.add(w); trainers.push(w);
        const T = new THREE.Mesh(new THREE.TorusGeometry(0.062,0.013,12,40), tire); w.add(tag(T,'rueditas'));
        disc([0,0,0],0.05,0.014,hub,'rueditas',w,24);
        for(let i=0;i<5;i++){ const a=i/5*Math.PI*2; box([Math.cos(a)*0.03,Math.sin(a)*0.03,0],[0.018,0.008,0.018],hub,'rueditas',w,a); }
        disc([0,0,0],0.008,0.035,metal,'rueditas',w,10);
      }
    }
  }
},
/* ------------------------- RUTA PRO ------------------------- */
ruta:{
  nombre:'Ruta pro', titulo:'Bicicleta de ruta profesional',
  desc:'Como las del Tour de Francia: cuadro aerodinámico de carbono, ruedas de perfil alto, manubrio curvo y 2 platos × 11 piñones = 22 marchas. Pesa unos 7 kg.',
  RA:[-0.405,0.34,0], FA:[0.585,0.34,0], BB:[0,0.27,0], stSlope:-0.296,
  wheel:{tireR:0.336,tireT:0.013,rimR:0.311,deep:0.05,spokes:20,cross:0.12,hubR:0.018,hubW:0.09,rimColor:0x1b1c1f,spokeColor:0x2a2c30,sidewall:0xb58a55},
  drive:{rings:[39,53],cogs:[28,25,23,21,19,17,15,14,13,12,11],rz0:0.044,rdz:0.0085,cz0:0.034,cdz:0.0038,start:{r:1,c:5},rd:true,fd:true,L:[0.022,-0.066],pulley:0.014,crank:0.172,armColor:0x16171a,ringColor:0x2a2c30},
  pedals:'clip', brakes:'disc',
  cam:{pos:[1.35,1.1,2.75],target:[0.06,0.5,0]}, scale:1,
  parts:['cuadro','horquilla','manubrio','manetas','sillin','rueda_del','rueda_tras','frenos','bielas','desviador_del','pedales','cadena','cassette','desviador'],
  over:{
    cuadro:{nombre:'Cuadro de carbono aero', que:'Cuadro de fibra de carbono que pesa menos de 1 kg. Sus tubos tienen forma aerodinámica y los cables van por dentro para cortar mejor el viento.',
      como:'Su geometría es agresiva: el ciclista va inclinado y bajo, porque sobre unos 25 km/h el aire es la mayor resistencia. Los tirantes van bajos para hacer el triángulo trasero más pequeño, rígido y cómodo.',
      prob:[['Golpe o caída fuerte','El carbono puede dañarse por dentro sin que se note. Revisa grietas o zonas blandas y, ante la duda, que lo revisen en un taller.'],['Apretar tornillos en carbono','Usa una llave de torque con el valor marcado en cada pieza (por ejemplo 5 Nm) y pasta de fricción. Si aprietas de más, el carbono se quiebra.'],['Crujidos','Suelen venir del eje pedalier, la tija o el manubrio. Limpia, aplica pasta de fricción y aprieta al torque correcto.']]},
    horquilla:{nombre:'Horquilla de carbono', que:'Horquilla rígida de carbono, sin suspensión, muy liviana y aerodinámica.',
      prob:[['La dirección tiene juego','Suelta los tornillos de la potencia, aprieta un poco el de la tapa superior y vuelve a apretar la potencia al torque indicado.'],['Golpe en la horquilla','Como el cuadro, el carbono puede dañarse por dentro: revísala en taller antes de volver a bajar rápido.'],['Ruido al frenar adelante','Revisa que el eje pasante esté bien apretado.']]},
    manubrio:{nombre:'Manubrio curvo (de ruta)', que:'Manubrio con curvas hacia abajo, llamado "drop". Va forrado con cinta para agarrarlo mejor.',
      como:'Permite tres posiciones de manos: arriba (para subir tranquilo), sobre las manetas (la más usada) y abajo en la curva (la más aerodinámica, para bajadas y sprints).',
      prob:[['La cinta se soltó','Desenróllala hasta la zona suelta y vuelve a enrollarla tensa, de abajo hacia arriba, traslapando la mitad de su ancho.'],['Manubrio torcido','Suelta los tornillos laterales de la potencia, alinea con la rueda y aprieta al torque indicado.'],['Las manetas quedaron muy abajo','Suelta la abrazadera bajo la cinta, súbelas y aprieta.']]},
    manetas:{nombre:'Manetas integradas', que:'Cada maneta frena y también cambia de marcha. La derecha mueve el desviador trasero (piñones) y la izquierda el delantero (platos).',
      como:'Para frenar se aprieta la maneta hacia el manubrio. Para cambiar se empuja hacia el lado. En la mayoría de las bicis profesionales los cambios son electrónicos: un botón manda la orden y un motor mueve el desviador. Por eso no llevan tensores de cable: no hay cable de cambio que ajustar, y los frenos hidráulicos se ajustan solos a medida que se gastan las pastillas.',
      prob:[['Los cambios electrónicos no responden','Carga la batería (suele durar cientos de kilómetros) y revisa que las manetas tengan pila.'],['Los frenos se sienten esponjosos','Hay aire en el sistema hidráulico: se purga en un taller.'],['La goma de la maneta está suelta','Ponla de nuevo desde abajo, estirándola sobre el cuerpo de la maneta.']]},
    sillin:{nombre:'Sillín de competición', que:'Sillín estrecho y liviano, a veces con un corte al centro para aliviar presión. La tija es de carbono y aerodinámica.',
      como:'Es angosto para que las piernas pasen sin rozar al pedalear rápido. Su altura y posición se ajustan al milímetro.',
      prob:[['Duele al andar','Revisa que esté horizontal y a la altura correcta; prueba moverlo 2–3 mm adelante o atrás.'],['La tija se baja','Usa pasta de fricción y aprieta al torque indicado (no más, es carbono).'],['Marca para la altura','Pon una cinta en la tija para volver a la misma altura si la sacas.']]},
    rueda_del:{nombre:'Rueda de perfil alto', que:'Rueda de carbono con llanta alta (5 cm) que corta mejor el viento, y un neumático delgado de 25 a 28 mm. Suele ser tubeless: sin cámara y con líquido sellante.',
      como:'Pesa poco, así que acelera rápido, y su forma reduce la resistencia del aire. El neumático va inflado a unos 70–90 psi.',
      prob:[['Pinchazo tubeless','El sellante suele tapar los agujeros chicos. Si no, mete una mecha (tarugo) por el agujero e infla.'],['Pierde aire de a poco','Agrega sellante nuevo: se seca cada 2 a 4 meses.'],['Ruido al frenar en bajada','Revisa que el disco no esté torcido y que el eje pasante esté apretado.']]},
    rueda_tras:{nombre:'Rueda trasera de perfil alto', que:'Igual que la delantera, de carbono y perfil alto. Su buje lleva el cassette de 11 piñones y la rueda libre.'},
    frenos:{nombre:'Frenos de disco hidráulicos', que:'Discos pequeños (140–160 mm) y pinzas que funcionan con líquido. Hoy casi todo el pelotón profesional los usa.',
      como:'Al apretar la maneta, el líquido empuja las pastillas contra el disco. Frenan fuerte y parejo aunque llueva, algo clave al bajar puertos de montaña a más de 80 km/h.'},
    bielas:{nombre:'Bielas y 2 platos', que:'Bielas de carbono con dos platos: 53 y 39 dientes. Muchas incluyen un medidor de potencia que mide la fuerza de las piernas en watts.',
      como:'El plato de 53 es para ir muy rápido en plano o en un sprint. El de 39 es para subir los puertos de montaña.'},
    pedales:{nombre:'Pedales automáticos', que:'Pedales sin plataforma donde el zapato se engancha con una pieza llamada cala.',
      como:'Al ir enganchado, el ciclista empuja hacia abajo y también tira hacia arriba, sin que el pie se resbale. Para soltarse se gira el talón hacia afuera.',
      prob:[['Cuesta desengancharse','Baja la tensión del resorte con el tornillo del pedal (llave Allen).'],['El pie queda suelto o se zafa solo','La cala está gastada: cámbiala.'],['Dolor de rodilla','La cala puede estar mal orientada. Ajústala para que el pie quede en su posición natural.']]},
    cassette:{nombre:'Cassette (11 piñones)', que:'Once piñones de 11 a 28 dientes, muy parecidos entre sí, para encontrar siempre el ritmo de pedaleo justo.',
      como:'Con 2 platos × 11 piñones hay 22 marchas. Con 53 × 11, cada pedalada mueve la bici casi 10 metros.'},
  },
  build(){
    const red = 0xb3121d;
    { const g = group('cuadro'); const m = mat('cuadro',red,{r:.22,m:.25});
      tube([-0.143,0.755,0],[0.392,0.815,0],0.019,m,'cuadro',g);
      const dt = tube(BB,[0.425,0.72,0],0.025,m,'cuadro',g); dt.scale.x = 1.35;
      const st = tube(BB,[-0.148,0.77,0],0.02,m,'cuadro',g); st.scale.x = 1.3;
      const ht = tube([0.385,0.842,0],[0.431,0.691,0],0.026,m,'cuadro',g); ht.scale.x=1.25;
      for(const s of [1,-1]){
        tube([0,BB[1],0.03*s],[RA[0],RA[1],0.06*s],0.011,m,'cuadro',g);
        tube([-0.115,0.66,0.016*s],[RA[0],RA[1],0.06*s],0.009,m,'cuadro',g);
        dropout([RA[0],RA[1],0.06*s],[0.62,0.78],m,'cuadro',g);
      }
      disc(BB,0.03,0.085,m,'cuadro',g,32); }
    { const g = group('horquilla'); const m = mat('horquilla',red,{r:.22,m:.25});
      box([0.434,0.681,0],[0.045,0.03,0.11],m,'horquilla',g,-0.3);
      for(const s of [1,-1]){
        curveTube([[0.436,0.676,0.047*s],[0.499,0.469,0.05*s],[FA[0],FA[1],0.05*s]],0.012,m,'horquilla',g,24);
      }
      disc([FA[0],FA[1],0],0.006,0.13,mat('horquilla',0x222222,{r:.4,m:.6}),'horquilla',g,10); }
    { const g = group('manubrio'); const m = mat('manubrio',0x16171a,{r:.35,m:.4}); const tape = mat('manubrio',0x111111,{r:.95});
      tube([0.385,0.842,0],[0.381,0.862,0],0.017,m,'manubrio',g);
      tube([0.378,0.853,0],[0.49,0.843,0],0.016,m,'manubrio',g);
      for(const s of [1,-1]){
        curveTube([[0.49,0.843,0],[0.49,0.843,0.1*s],[0.49,0.843,0.19*s],[0.515,0.848,0.212*s],[0.565,0.843,0.215*s],[0.592,0.8,0.215*s],[0.587,0.74,0.215*s],[0.555,0.705,0.215*s],[0.505,0.7,0.215*s]],0.012,tape,'manubrio',g,60);
      } }
    { const g = group('manetas'); const m = mat('manetas',0x1a1b1e,{r:.55,m:.2}); const bl = mat('manetas',0x2b2d31,{r:.3,m:.6});
      for(const s of [1,-1]){
        box([0.572,0.86,0.215*s],[0.065,0.03,0.026],m,'manetas',g,-0.25);
        ellipsoid([0.602,0.875,0.215*s],[0.012,0.018,0.012],m,'manetas',g);
        curveTube([[0.6,0.853,0.215*s],[0.613,0.8,0.217*s],[0.6,0.745,0.218*s]],0.006,bl,'manetas',g,20);
      } }
    { const g = group('sillin'); const m = mat('sillin',0x141414,{r:.6}); const t = mat('sillin',0x1b1c1f,{r:.3,m:.3});
      const p = tube([-0.148,0.77,0],[-0.213,0.99,0],0.014,t,'sillin',g); p.scale.x=1.4;
      saddle(g,-0.35,-0.06,1.02,0.07,0.019,0.022,m); }
    const fb = discBrakes(0.07,-0.037);
    const cm = c=>mat(c,0x1c1c1c,{r:.6});
    // cables: van por dentro del cuadro; solo se ven al entrar y al salir
    cable([[0.565,0.862,-0.205],[0.5,0.876,-0.12],[0.43,0.852,-0.035],[0.405,0.815,-0.012]],0.0032,cm('frenos'),'frenos',fb);
    cable([[0.565,0.862,0.205],[0.5,0.876,0.12],[0.43,0.852,0.035],[0.405,0.815,0.012]],0.0032,cm('desviador'),'desviador',group('desviador'));
    cable([[RA[0]+0.08,RA[1]-0.012,0.052],[RA[0]+0.03,RA[1]-0.025,0.075],[RA[0]-0.004,RA[1]-0.03,0.082]],0.0032,cm('desviador'),'desviador',group('desviador'));
  }
}
};
/* ================= piezas extra para los modelos nuevos ================= */
const dirTo = (A,B)=>{ const dx=B[0]-A[0], dy=B[1]-A[1], l=Math.hypot(dx,dy); return [dx/l,dy/l]; };
let fold = null;   // estado del plegado (solo bici plegable)

// Frenos V-brake / U-brake genéricos (sobre la llanta)
function vbrakes({front=true, rear=true, fDir, rDir, leverL, leverR, routeF=[], routeR=[]}){
  const g = group('frenos'); const arm = mat('frenos',0x9aa1a8,{r:.3,m:.8}); const pad = mat('frenos',0x111111,{r:.9}); const cm = mat('frenos',0x55595d,{r:.6});
  const rr = M.wheel.rimR, az = Math.max(0.04, M.wheel.tireT+0.014), tops = {}, cables = [];
  const one = (A,dir,key)=>{
    const p=[A[0]+dir[0]*rr, A[1]+dir[1]*rr], rot=Math.atan2(dir[1],dir[0])-Math.PI/2;
    const at = d=>[p[0]+dir[0]*d, p[1]+dir[1]*d];
    const hw = Math.max(0.0095, M.wheel.tireT*0.62);
    for(const s of [1,-1]){
      // brazo largo: pivota abajo (en la pata de la horquilla / vaina) y sube pasando la llanta
      const a = at(0.0125); box([a[0],a[1],az*s],[0.014,0.115,0.008],arm,'frenos',g,rot);
      // base de giro con tornillo
      const pv = at(-0.045); tube([pv[0],pv[1],az*s],[pv[0],pv[1],(az+0.012)*s],0.0085,cm,'frenos',g,12);
      // portazapata + zapata de goma contra la pared de la llanta
      const ps = at(-0.004);
      box([ps[0],ps[1],(hw+0.012+az)/2*s],[0.01,0.012,az-hw-0.012],arm,'frenos',g,rot);
      box([ps[0],ps[1],(hw+0.006)*s],[0.034,0.014,0.012],pad,'frenos',g,rot);
    }
    const top=at(0.062);
    tube([top[0],top[1],-az],[top[0],top[1],az],0.003,cm,'frenos',g,8);
    // tubito guía (el "noodle") donde entra el cable
    const nd = at(0.082); tube([top[0],top[1],0],[nd[0],nd[1],0],0.0045,arm,'frenos',g,8);
    tops[key]=[nd[0],nd[1],0];
  };
  if(front) one(FA,fDir,'f'); if(rear) one(RA,rDir,'r');
  if(front && leverL) cables.push(cable([leverL,...routeF,tops.f],0.0032,cm,'frenos',g));
  if(rear && leverR) cables.push(cable([leverR,...routeR,tops.r],0.0032,cm,'frenos',g));
  return {g,cables};
}
// Protector de cadena genérico
function chainGuard(zc, rearX, color=0x2b2d30){
  const g = group('protector'); const m = mat('protector',color,{r:.42,m:color===0x2b2d30?0.25:0.05});
  const rr = toothR(RINGS[0]), R = rr+0.019;
  const half = new THREE.Shape(); half.absarc(0,0,R,-0.4,Math.PI+0.25,false); half.lineTo(Math.cos(-0.4)*R*0.35,Math.sin(-0.4)*R*0.35); half.closePath();
  const hm = new THREE.Mesh(extrude(half,0.003,0.0022,HQ?40:16), m); hm.position.set(BB[0],BB[1],zc); g.add(tag(hm,'protector'));
  const x1 = BB[0]-0.01, x2 = rearX, y1 = BB[1]+rr+0.006, y2 = RA[1]+toothR(COGS[Math.floor(COGS.length/2)])+0.012;
  const band = new THREE.Mesh(extrude(stadiumShape(x1,y1,x2,y2,0.022,0.017),0.003,0.0022,HQ?20:10), m); band.position.z = zc; g.add(tag(band,'protector'));
  const len = Math.hypot(x2-x1,y2-y1), ang = Math.atan2(y2-y1,x2-x1);
  box([(x1+x2)/2,(y1+y2)/2+0.02,zc-0.012],[len,0.004,0.026],m,'protector',g,ang);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(R,0.0028,8,48,Math.PI*0.75), m); arc.position.set(BB[0],BB[1],zc-0.012); arc.rotation.z = Math.PI*0.2; arc.scale.z = 4; g.add(tag(arc,'protector'));
  for(const [x,y] of [[BB[0]+0.03,BB[1]-0.012],[BB[0]-0.11,BB[1]+0.045]]) tube([x,y,0.03],[x,y,zc],0.004,mat('protector',0x9aa1a8,{r:.3,m:.9}),'protector',g,8);
}
// Guardabarros: tiras curvas alrededor de cada rueda (ángulos en grados, 0 = adelante, 90 = arriba)
function fenders(r, w, specs, color){
  const g = group('guardabarros'); const m = new THREE.MeshStandardMaterial({color,roughness:.35,metalness:.45,side:THREE.DoubleSide}); (partMats.guardabarros ||= []).push(m);
  const st = mat('guardabarros',0xb9bec4,{r:.3,m:.8});
  for(const [A,a0,a1] of specs){
    const p0=a0*Math.PI/180, p1=a1*Math.PI/180;
    const f = new THREE.Mesh(new THREE.CylinderGeometry(r,r,w,64,1,true,p0+Math.PI/2,p1-p0), m);
    f.rotation.x = Math.PI/2; f.position.set(A[0],A[1],0); g.add(tag(f,'guardabarros'));
    const ex=A[0]+Math.cos(p1)*r, ey=A[1]+Math.sin(p1)*r;
    for(const s of [1,-1]) tube([ex,ey,(w/2)*s],[A[0],A[1],(w/2+0.02)*s],0.0025,st,'guardabarros',g,6);
  }
}
// Luces delantera y trasera (el vidrio usa un material que siempre brilla)
function lights(fp, rp, mountF){
  const g = group('luces'); const body = mat('luces',0x1f2023,{r:.4,m:.3});
  const lf = new THREE.MeshBasicMaterial({color:0xfff2b3}), lr = new THREE.MeshBasicMaterial({color:0xff3b30});
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.02,0.05,20), body); b.rotation.z=Math.PI/2; b.position.set(...fp); g.add(tag(b,'luces'));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.004,20), lf); lens.rotation.z=Math.PI/2; lens.position.set(fp[0]+0.026,fp[1],fp[2]); g.add(tag(lens,'luces'));
  if(mountF) tube(mountF,[fp[0]-0.02,fp[1],fp[2]],0.004,body,'luces',g,8);
  box(rp,[0.014,0.035,0.045],body,'luces',g);
  const rl = new THREE.Mesh(new THREE.BoxGeometry(0.004,0.028,0.038), lr); rl.position.set(rp[0]-0.008,rp[1],rp[2]); g.add(tag(rl,'luces'));
}

/* ================= modelos nuevos ================= */
const VBRAKE_TXT = {nombre:'Frenos V-brake', que:'Dos brazos con zapatas de goma que aprietan los costados de la llanta. Son simples, baratos y fáciles de ajustar en casa.',
  como:'Al apretar la maneta, el cable junta los dos brazos y las zapatas rozan la llanta. Ese roce convierte el movimiento en calor y la rueda se detiene. Con lluvia frenan menos, así que conviene frenar antes.',
  prob:[['Frena poco','Revisa que las zapatas no estén gastadas (tienen ranuras: si ya no se ven, cámbialas) y limpia la llanta con alcohol.'],['Una zapata roza siempre','Gira el tornillo de tensión del resorte de un brazo para centrar el freno.'],['Las zapatas tocan el neumático','Suelta la zapata, bájala para que toque solo la llanta y aprieta. Si roza el neumático puede reventarlo.']]};

Object.assign(MODELS, {
/* ------------------------- URBANA ------------------------- */
urbana:{
  nombre:'Urbana', titulo:'Bicicleta urbana (de paseo)',
  desc:'Cuadro bajo para subir fácil, postura erguida, parrilla, guardabarros, luces, pata y 7 marchas. Pensada para ir al trabajo o hacer trámites con ropa normal.',
  RA:[-0.5,0.35,0], FA:[0.6,0.35,0], BB:[0,0.29,0], stSlope:-0.36,
  wheel:{tireR:0.35,tireT:0.02,rimR:0.318,rimT:0.011,knobs:0,spokes:32,hubW:0.1,sidewall:0xcdb894,hubColor:0xb9bec4},
  drive:{rings:[38],cogs:[28,24,21,18,16,14,12],rz0:0.05,rdz:0,cz0:0.035,cdz:0.0045,start:{r:0,c:3},rd:true,fd:false,L:[0.028,-0.08],pulley:0.016,crank:0.17},
  pedals:'flat', brakes:'rim',
  cam:{pos:[1.45,1.15,2.9],target:[0.0,0.52,0]}, scale:1,
  parts:['cuadro','horquilla','manubrio','manetas','tensores','sillin','rueda_del','rueda_tras','frenos','bielas','pedales','cadena','protector','cassette','desviador','parrilla','guardabarros','luces','pata'],
  over:{
    cuadro:{nombre:'Cuadro bajo (de paseo)', que:'Cuadro sin tubo superior alto: se pasa la pierna por delante, cómodo con falda, ropa de oficina o con carga en la parrilla. Los tubos curvos refuerzan la parte baja.',
      como:'Como no tiene el triángulo clásico, sus tubos son más gruesos para no flectarse. La postura es erguida: se ve mejor el tráfico y no carga las muñecas.'},
    horquilla:{que:'Horquilla rígida que sostiene la rueda delantera. En las bicis urbanas lleva soportes para el guardabarros y la luz.',
      prob:[['La dirección tiene juego','Suelta los tornillos de la potencia, aprieta un poco la tapa superior hasta que no se mueva al frenar y vuelve a apretar.'],['El manubrio no queda alineado con la rueda','Suelta la potencia, alinea y vuelve a apretar firme.'],['Ruido en la horquilla al pasar baches','Revisa los tornillos del guardabarros y del soporte de la luz.']]},
    manubrio:{nombre:'Manubrio de paseo', que:'Manubrio curvado hacia atrás: las manos quedan cerca del cuerpo y la espalda derecha, más cómodo para mirar el tráfico. Lleva timbre.'},
    manetas:{nombre:'Manetas y mando de cambios', que:'Dos manetas de freno y, a la derecha, el mando de los 7 cambios.'},
    sillin:{nombre:'Sillín con resortes', que:'Sillín ancho con resortes que amortiguan los baches. Está hecho para ir sentado derecho, no inclinado.'},
    rueda_del:{que:'Rueda 700c (de unos 70 cm) con neumático liso y algo ancho: rueda fácil en el pavimento y amortigua los baches de la calle.'},
    rueda_tras:{que:'Rueda 700c con 7 piñones. Sobre ella van la parrilla y el guardabarros.'},
    frenos:VBRAKE_TXT,
    bielas:{nombre:'Bielas y plato', que:'Un solo plato de 38 dientes, cubierto por un protector. Los 7 cambios se hacen solo atrás, así que hay una sola palanca de cambios.'},
    cassette:{nombre:'Piñones (7)', que:'Siete piñones de 28 a 12 dientes. El grande sirve para subir con carga en la parrilla; el chico, para ir rápido en plano.', como:'Con un plato de 38: 38 ÷ 28 ≈ 1,4 vueltas de rueda por pedalada en la marcha más suave y 38 ÷ 12 ≈ 3,2 en la más dura.'},
    protector:{que:'Cubierta que tapa el plato y la parte de arriba de la cadena, para no manchar ni enganchar el pantalón.'},
  },
  build(){
    const green = 0x6f9a7a, silver = 0xc9ced3, brown = 0x7b4a2a;
    { const g = group('cuadro'); const m = mat('cuadro',green,{r:.3,m:.25});
      curveTube([[0.40,0.74,0],[0.27,0.52,0],[0.12,0.36,0],[0.02,0.30,0]],0.025,m,'cuadro',g,40);
      curveTube([[0.385,0.80,0],[0.25,0.62,0],[0.05,0.52,0],[-0.075,0.5,0]],0.018,m,'cuadro',g,40);
      tube(BB,[-0.198,0.84,0],0.02,m,'cuadro',g);
      tube([0.345,0.875,0],[0.406,0.716,0],0.028,m,'cuadro',g);
      for(const s of [1,-1]){
        tube([0,BB[1],0.03*s],[RA[0],RA[1],0.065*s],0.012,m,'cuadro',g);
        tube([-0.169,0.76,0.016*s],[RA[0],RA[1],0.065*s],0.011,m,'cuadro',g);
        dropout([RA[0],RA[1],0.065*s],[0.62,0.78],m,'cuadro',g);
      }
      disc(BB,0.03,0.08,m,'cuadro',g,28); }
    { const g = group('horquilla'); const m = mat('horquilla',green,{r:.3,m:.25});
      box([0.41,0.706,0],[0.045,0.03,0.12],m,'horquilla',g,-0.366);
      for(const s of [1,-1]){
        curveTube([[0.412,0.70,0.05*s],[0.495,0.48,0.052*s],[FA[0],FA[1],0.052*s]],0.013,m,'horquilla',g,24);
        dropout([FA[0],FA[1],0.052*s],[-0.33,0.94],m,'horquilla',g);
      } }
    { const g = group('manubrio'); const m = mat('manubrio',silver,{r:.25,m:.85}); const gr = mat('manubrio',brown,{r:.7}); const bell = mat('manubrio',0xd4a017,{r:.25,m:.7});
      tube([0.345,0.875,0],[0.318,0.95,0],0.015,m,'manubrio',g);
      tube([0.318,0.94,0],[0.36,0.975,0],0.015,m,'manubrio',g);
      curveTube([[0.215,1.0,-0.29],[0.27,0.995,-0.2],[0.34,0.982,-0.09],[0.36,0.978,0],[0.34,0.982,0.09],[0.27,0.995,0.2],[0.215,1.0,0.29]],0.011,m,'manubrio',g,60);
      for(const s of [1,-1]) grip([0.258,0.997,0.215*s],[0.212,1.0,0.292*s],0.017,gr,'manubrio',g);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.02,20,10,0,Math.PI*2,0,Math.PI/2), bell); b.position.set(0.33,0.99,-0.11); g.add(tag(b,'manubrio')); }
    const LL=[0.27,0.993,-0.2], LR=[0.27,0.993,0.2], SH=[0.252,0.978,0.175];
    { const g = group('manetas'); const m = mat('manetas',0x2b2d30,{r:.5,m:.3});
      for(const s of [1,-1]){ disc([0.265,0.995,0.2*s],0.012,0.014,m,'manetas',g,16); lever([0.272,0.99,0.2*s],[0.33,0.972,0.245*s],m,'manetas',g); }
      box([0.255,0.982,0.18],[0.03,0.022,0.026],m,'manetas',g); }
    adjusters([[LL,[0.3,0.93,-0.12],'freno'],[LR,[0.29,0.93,0.12],'freno'],[SH,[0.29,0.9,0.1],'cambio']]);
    { const g = group('sillin'); const m = mat('sillin',brown,{r:.6}); const t = mat('sillin',silver,{r:.25,m:.8}); const sp = mat('sillin',0x222222,{r:.4,m:.6});
      tube([-0.198,0.84,0],[-0.222,0.905,0],0.014,t,'sillin',g);
      saddle(g,-0.365,-0.09,0.962,0.1,0.038,0.042,m);
      for(const s of [1,-1]) tube([-0.31,0.895,0.045*s],[-0.31,0.92,0.045*s],0.009,sp,'sillin',g,10);
      tube([-0.222,0.9,0],[-0.31,0.895,0],0.005,t,'sillin',g,8); }
    vbrakes({fDir:dirTo(FA,[0.41,0.706]), rDir:dirTo(RA,[-0.169,0.76]), leverL:LL, leverR:LR,
      routeF:[[0.3,0.93,-0.12],[0.43,0.86,-0.04]], routeR:[[0.29,0.93,0.12],[0.3,0.72,0.035],[0.1,0.53,0.03],[-0.1,0.52,0.02],[-0.2,0.61,0.01]]});
    cable([SH,[0.29,0.9,0.1],[0.28,0.62,0.04],[0.12,0.37,0.04],[0.0,0.25,0.05],[-0.3,0.31,0.065],[RA[0]-0.005,RA[1]-0.02,0.085]],0.0032,mat('desviador',0x55595d,{r:.6}),'desviador',group('desviador'));
    chainGuard(0.075, RA[0]+0.1);
    fenders(0.378,0.05,[[RA,70,205],[FA,25,195]],0xece3cf);
    { const g = group('parrilla'); const m = mat('parrilla',0x222326,{r:.4,m:.5});
      for(const s of [1,-1]){
        tube([-0.2,0.79,0.065*s],[-0.75,0.79,0.065*s],0.006,m,'parrilla',g,8);
        tube([-0.73,0.79,0.065*s],[RA[0]-0.01,RA[1]+0.02,0.075*s],0.006,m,'parrilla',g,8);
        tube([-0.6,0.79,0.065*s],[RA[0]+0.005,RA[1]+0.02,0.075*s],0.006,m,'parrilla',g,8);
        tube([-0.2,0.79,0.065*s],[-0.172,0.75,0.02*s],0.005,m,'parrilla',g,8);
      }
      for(const x of [-0.2,-0.32,-0.44,-0.56,-0.68,-0.75]) tube([x,0.79,-0.065],[x,0.79,0.065],0.005,m,'parrilla',g,8); }
    lights([0.47,0.74,0],[-0.765,0.775,0],[0.41,0.72,0]);
    { const g = group('pata'); const m = mat('pata',0x3a3d42,{r:.35,m:.6});
      tube([-0.09,BB[1]+0.005,-0.045],[-0.2,0.01,-0.15],0.009,m,'pata',g,10);
      box([-0.2,0.008,-0.15],[0.04,0.012,0.03],m,'pata',g); }
  }
},
/* ------------------------- ELÉCTRICA ------------------------- */
electrica:{
  nombre:'Eléctrica', titulo:'Bicicleta eléctrica de montaña (e-MTB)',
  desc:'Bici de montaña con motor en el eje pedalier y batería en el tubo inferior. El motor ayuda solo mientras pedaleas. Tiene 1 plato × 11 piñones = 11 marchas.',
  RA:[-0.52,0.365,0], FA:[0.56,0.365,0], BB:[0,0.32,0], stSlope:-0.245,
  wheel:{tireR:0.363,tireT:0.03,rimR:0.305,rimT:0.014,knobs:64,spokes:28},
  drive:{rings:[34],cogs:[42,37,32,28,24,21,19,17,15,13,11],rz0:0.064,rdz:0,cz0:0.034,cdz:0.0045,start:{r:0,c:5},rd:true,fd:false,L:[0.035,-0.1],pulley:0.017,crank:0.165},
  pedals:'flat', brakes:'disc',
  cam:{pos:[1.35,1.15,2.75],target:[0,0.52,0]}, scale:1,
  parts:['cuadro','horquilla','manubrio','manetas','tensores','pantalla','sillin','rueda_del','rueda_tras','frenos','motor','bateria','bielas','pedales','cadena','cassette','desviador'],
  over:{
    cuadro:{nombre:'Cuadro e-MTB', que:'Cuadro reforzado que integra el motor (abajo, en el eje pedalier) y la batería (dentro o sobre el tubo inferior). Pesa más que uno normal: la bici completa suele pesar 20 a 25 kg.'},
    manetas:{nombre:'Manetas y control de asistencia', que:'A la derecha están el freno y el mando de cambios. A la izquierda, el freno y el control para subir o bajar el nivel de ayuda del motor.'},
    bielas:{nombre:'Bielas y plato', que:'Un solo plato de 34 dientes montado directamente sobre el motor central.', como:'Tus piernas mueven las bielas y el motor suma su fuerza en el mismo eje. Por eso la cadena recibe más fuerza que en una bici normal y se gasta más rápido.'},
    cassette:{nombre:'Cassette (11 piñones)', que:'Once piñones de 11 a 42 dientes. Con un solo plato adelante, el piñón grande permite subir cerros muy empinados.', como:'Con 1 plato × 11 piñones hay 11 marchas. Al cambiar, conviene aflojar un poco la pedalada para que la cadena no sufra con la fuerza del motor.'},
    cadena:{que:'Cadena reforzada, preparada para la fuerza extra del motor.', prob:[['Se gasta muy rápido','Es normal en una e-bike: mide su desgaste cada 500–1000 km y cámbiala a tiempo para no gastar los piñones.'],['Salta al cambiar en subida','Afloja un poco la pedalada justo al cambiar; el motor aplica mucha fuerza.'],['Suena o está seca','Límpiala y lubrícala; con el motor se ensucia y se seca antes.']]},
  },
  build(){
    MODELS.mtb.build.call(this);
    // sin desviador delantero: quitar su cable
    (partGroups.desviador_del||[]).forEach(g=>g.parent.remove(g)); delete partGroups.desviador_del; delete partMats.desviador_del;
    partMats.cuadro.forEach(m=>m.color.set(0x3b4a5c)); partMats.horquilla[0].color.set(0x3b4a5c);
    { const g = group('motor'); const m = mat('motor',0x1e2126,{r:.5,m:.4}); const c = mat('motor',0x6b7280,{r:.3,m:.8});
      box([-0.025,0.295,0],[0.17,0.13,0.1],m,'motor',g,-0.25);
      disc([0,0.32,0],0.05,0.104,c,'motor',g,32); }
    { const g = group('bateria'); const m = mat('bateria',0x1f2937,{r:.45,m:.3}); const a = mat('bateria',0x22d3ee,{r:.3,m:.1});
      const ang = Math.atan2(0.511,0.436);
      box([0.205,0.62,0],[0.42,0.078,0.074],m,'bateria',g,ang);
      { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.038,24,16), m); cap.scale.set(1,0.98,0.97); cap.position.set(0.205+Math.cos(ang)*0.19,0.62+Math.sin(ang)*0.19,0); g.add(tag(cap,'bateria')); }
      box([0.205-0.04*Math.sin(ang),0.62+0.04*Math.cos(ang),0],[0.36,0.006,0.072],a,'bateria',g,ang);
      box([0.09,0.5,0.037],[0.025,0.02,0.006],mat('bateria',0x9aa1a8,{r:.3,m:.8}),'bateria',g,ang); }
    { const g = group('pantalla'); const m = mat('pantalla',0x16171a,{r:.4,m:.3});
      box([0.47,1.08,-0.065],[0.04,0.014,0.055],m,'pantalla',g,0.5);
      const scr = new THREE.Mesh(new THREE.BoxGeometry(0.032,0.002,0.044), new THREE.MeshBasicMaterial({color:0x7dd3fc}));
      scr.position.set(0.47-0.004,1.088,-0.065); scr.rotation.z=0.5; g.add(tag(scr,'pantalla')); }
  }
},
/* ------------------------- PLEGABLE ------------------------- */
plegable:{
  nombre:'Plegable', titulo:'Bicicleta plegable',
  desc:'Ruedas de 20", un tubo principal con bisagra y un poste de manubrio que también se dobla. Plegada ocupa la mitad y se lleva en el metro o el auto. Tiene 7 marchas.',
  RA:[-0.48,0.25,0], FA:[0.55,0.25,0], BB:[0,0.27,0], stSlope:-0.28,
  wheel:{tireR:0.25,tireT:0.022,rimR:0.215,rimT:0.011,knobs:0,spokes:20,hubW:0.08},
  drive:{rings:[52],cogs:[28,24,21,18,16,14,12],rz0:0.05,rdz:0,cz0:0.035,cdz:0.0045,start:{r:0,c:3},rd:true,fd:false,L:[0.025,-0.07],pulley:0.015,crank:0.17},
  pedals:'flat', brakes:'rim',
  cam:{pos:[1.3,1.05,2.6],target:[0.03,0.5,0]}, scale:0.9,
  parts:['cuadro','bisagra','horquilla','manubrio','manetas','tensores','sillin','rueda_del','rueda_tras','frenos','bielas','pedales','cadena','cassette','desviador'],
  over:{
    cuadro:{nombre:'Cuadro plegable', que:'Un tubo principal grueso con una bisagra al medio. Se dobla en dos para guardar la bici en un departamento, llevarla en el metro o en el maletero.',
      como:'El tubo es grueso porque no hay un triángulo que lo refuerce. Al plegar, la parte delantera gira hacia el lado izquierdo y queda junto a la rueda trasera, lejos de la cadena.'},
    manubrio:{nombre:'Poste y manubrio', que:'El manubrio va sobre un poste largo que se dobla hacia abajo con su propia bisagra.',
      prob:[['El poste tiene juego al frenar','Aprieta la tuerca de ajuste de la bisagra del poste (bajo la palanca) hasta que cierre firme.'],['La palanca cuesta mucho cerrar','Suelta un poco esa tuerca: debe cerrar con firmeza, pero sin golpearla.'],['El manubrio gira solo','Aprieta la abrazadera de la potencia.']]},
    sillin:{que:'La tija es muy larga para que la misma bici sirva a personas de distinta estatura. Al plegar, se desliza hacia abajo por dentro del tubo del sillín.'},
    rueda_del:{que:'Rueda de 20 pulgadas: pequeña, para que la bici plegada ocupe poco. Acelera rápido, pero se sienten más los baches.'},
    rueda_tras:{que:'Rueda de 20 pulgadas con 7 piñones.'},
    frenos:VBRAKE_TXT,
    bielas:{nombre:'Bielas y plato grande', que:'Un plato de 52 dientes: como las ruedas son chicas, hace falta un plato grande para avanzar lo mismo por pedalada que una bici normal.'},
    cassette:{nombre:'Piñones (7)', que:'Siete piñones de 28 a 12 dientes.', como:'Con plato 52 y rueda de 20", la marcha más dura avanza unos 6,8 m por pedalada, parecido a una bici de ruedas grandes.'},
  },
  build(){
    const blue = 0x2563eb, silver = 0xc9ced3;
    const fold = this._fold = {hide:[]};
    { const g = group('cuadro'); const m = mat('cuadro',blue,{r:.3,m:.25});
      tube([-0.045,0.42,0],[0.18,0.508,0],0.03,m,'cuadro',g);
      tube(BB,[-0.12,0.7,0],0.022,m,'cuadro',g);
      for(const s of [1,-1]){
        tube([0,BB[1],0.028*s],[RA[0],RA[1],0.055*s],0.012,m,'cuadro',g);
        tube([-0.084,0.57,0.014*s],[RA[0],RA[1],0.055*s],0.011,m,'cuadro',g);
        dropout([RA[0],RA[1],0.055*s],[0.62,0.78],m,'cuadro',g);
      }
      disc(BB,0.03,0.075,m,'cuadro',g,28); }
    { const g = group('cuadro'); const m = partMats.cuadro[0]; fold.front = g;
      tube([0.18,0.51,0],[0.405,0.6,0],0.03,m,'cuadro',g);
      tube([0.376,0.657,0],[0.407,0.562,0],0.028,m,'cuadro',g); }
    { const g = group('bisagra'); const m = mat('bisagra',0x1f2023,{r:.4,m:.5}); const lv = mat('bisagra',0xd1d5db,{r:.3,m:.8});
      // mitad fija (pegada al tubo trasero) y mitad móvil (pegada al tubo delantero), unidas por un pasador vertical
      box([0.159,0.502,0],[0.045,0.07,0.07],m,'bisagra',g,0.38);
      box([0.17,0.495,-0.045],[0.05,0.02,0.036],m,'bisagra',g);
      tube([0.18,0.47,-0.05],[0.18,0.56,-0.05],0.008,lv,'bisagra',g,12);
      box([0.18,0.51,0.04],[0.09,0.014,0.016],lv,'bisagra',g,0.38);
      const g3 = group('bisagra'); fold.hingeFront = g3;
      box([0.201,0.517,0],[0.045,0.07,0.07],m,'bisagra',g3,0.38);
      box([0.19,0.525,-0.045],[0.05,0.02,0.036],m,'bisagra',g3);
      const g2 = group('bisagra'); fold.postHinge = g2;
      box([0.367,0.685,0],[0.05,0.03,0.055],m,'bisagra',g2,-0.31);
      box([0.367,0.685,0.04],[0.07,0.01,0.014],lv,'bisagra',g2,-0.31); }
    { const g = group('horquilla'); const m = mat('horquilla',0x1f2023,{r:.35,m:.4});
      box([0.41,0.552,0],[0.04,0.025,0.1],m,'horquilla',g,-0.314);
      for(const s of [1,-1]){
        curveTube([[0.412,0.546,0.045*s],[0.46,0.4,0.046*s],[FA[0],FA[1],0.046*s]],0.011,m,'horquilla',g,20);
        dropout([FA[0],FA[1],0.046*s],[-0.33,0.94],m,'horquilla',g);
      } }
    { const g = group('manubrio'); const m = mat('manubrio',silver,{r:.25,m:.85}); const gr = mat('manubrio',0x161616,{r:.85}); const pm = mat('manubrio',0x1f2023,{r:.35,m:.4});
      tube([0.367,0.69,0],[0.33,1.0,0],0.02,pm,'manubrio',g);
      tube([0.33,1.012,-0.28],[0.33,1.012,0.28],0.011,m,'manubrio',g);
      for(const s of [1,-1]) grip([0.33,1.012,0.2*s],[0.33,1.012,0.285*s],0.017,gr,'manubrio',g); }
    const LL=[0.336,1.012,-0.18], LR=[0.336,1.012,0.18], SH=[0.326,0.99,0.155];
    { const g = group('manetas'); const m = mat('manetas',0x2b2d30,{r:.5,m:.3});
      for(const s of [1,-1]){ disc([0.33,1.012,0.18*s],0.012,0.014,m,'manetas',g,16); lever([0.338,1.008,0.18*s],[0.395,0.995,0.215*s],m,'manetas',g); }
      box([0.326,0.993,0.158],[0.028,0.02,0.024],m,'manetas',g); }
    adjusters([[LL,[0.38,0.9,-0.08],'freno'],[LR,[0.36,0.85,0.06],'freno'],[SH,[0.37,0.85,0.06],'cambio']]);
    { const g = group('sillin'); const m = mat('sillin',0x161616,{r:.65}); const t = mat('sillin',silver,{r:.25,m:.8});
      // la tija continúa por dentro del tubo del sillín (queda oculta) para poder deslizarse hacia abajo al plegar
      tube([-0.0662,0.5074,0],[-0.204,1.0,0],0.016,t,'sillin',g);
      saddle(g,-0.33,-0.07,1.042,0.075,0.026,0.032,m); }
    const fb = vbrakes({rear:false, fDir:dirTo(FA,[0.41,0.552]), leverL:LL, routeF:[[0.38,0.9,-0.08],[0.43,0.68,-0.02]]});
    const rb = vbrakes({front:false, rDir:dirTo(RA,[-0.084,0.57]), leverR:LR, routeR:[[0.36,0.85,0.06],[0.3,0.6,0.03],[0.1,0.49,0.03],[-0.1,0.47,0.02],[-0.2,0.47,0]]});
    fold.frontBrake = fb.g; fold.hide.push(...fb.cables, ...rb.cables);
    fold.hide.push(cable([SH,[0.37,0.85,0.06],[0.3,0.58,0.04],[0.05,0.44,0.04],[-0.03,0.3,0.05],[-0.3,0.27,0.06],[RA[0]-0.005,RA[1]-0.02,0.085]],0.0032,mat('desviador',0x55595d,{r:.6}),'desviador',group('desviador')));
  },
  after(){
    const F = this._fold;
    const pivot = new THREE.Group(); pivot.position.set(0.18,0.51,-0.05); root.add(pivot);
    const post = new THREE.Group(); post.position.set(0.367,0.69,0); root.add(post);
    ['manubrio','manetas','tensores'].forEach(id=>(partGroups[id]||[]).forEach(g=>post.attach(g)));
    pivot.attach(post);
    [F.front, F.hingeFront, F.frontBrake, F.postHinge, ...(partGroups.horquilla||[]), wheelF].forEach(g=>pivot.attach(g));
    const seat = new THREE.Group(); root.add(seat); (partGroups.sillin||[]).forEach(g=>seat.attach(g));
    fold = {pivot, post, seat, hide:F.hide, t:0, goal: opts.plegada ? 1 : 0};
  }
},
/* ------------------------- BMX ------------------------- */
bmx:{
  nombre:'BMX', titulo:'Bicicleta BMX',
  desc:'Cuadro pequeño y muy resistente, ruedas de 20", una sola marcha (25/9), freno trasero en U y pegs para trucos. Hecha para saltos, pistas y skatepark.',
  RA:[-0.36,0.255,0], FA:[0.62,0.255,0], BB:[0,0.29,0], stSlope:-0.344,
  wheel:{tireR:0.255,tireT:0.03,rimR:0.214,rimT:0.012,knobs:48,spokes:28,hubW:0.09,hubR:0.013,rimColor:0x1a1a1a,spokeColor:0xc0c4c8},
  drive:{rings:[25],cogs:[9],rz0:0.052,rdz:0,cz0:0.052,cdz:0,start:{r:0,c:0},rd:false,fd:false,crank:0.175,armZ:0.085,armColor:0x1a1a1a},
  pedals:'flat', brakes:'rim',
  cam:{pos:[1.2,0.95,2.3],target:[0.12,0.42,0]}, scale:0.8,
  parts:['cuadro','horquilla','manubrio','manetas','tensores','sillin','rueda_del','rueda_tras','frenos','bielas','pedales','cadena','cassette','pegs'],
  over:{
    cuadro:{nombre:'Cuadro BMX', que:'Cuadro pequeño y muy resistente, normalmente de acero cromo-molibdeno, para saltos, trucos y pistas. En BMX se anda casi siempre de pie.',
      como:'Es corto y bajo para que la bici sea fácil de girar, levantar y saltar. Sus tubos son gruesos para aguantar caídas desde rampas.',
      prob:[['Grieta cerca de las soldaduras','Revisa sobre todo junto al tubo de dirección y al eje pedalier después de caídas fuertes. Si hay grieta, no la uses.'],['La rueda trasera se corre al pedalear fuerte','Aprieta bien las tuercas del eje trasero (llave de 14 mm) y deja la cadena con 1 cm de juego.'],['Crujidos','Revisa el eje pedalier y las bielas.']]},
    horquilla:{nombre:'Horquilla BMX', que:'Horquilla rígida y gruesa que aguanta caídas desde rampas. Lleva pegs en su eje.',
      prob:[['La dirección tiene juego','Suelta los tornillos de la potencia, aprieta un poco la tapa superior y vuelve a apretar la potencia.'],['La horquilla se dobló','Cámbiala: una horquilla doblada es peligrosa en saltos.'],['La rueda se mueve en la horquilla','Aprieta bien las tuercas del eje.']]},
    manubrio:{nombre:'Manubrio alto con travesaño', que:'Manubrio en U con un travesaño que lo refuerza. Muchas BMX tienen un rotor que permite girar el manubrio 360° sin que se enrede el cable del freno.'},
    manetas:{nombre:'Maneta de freno', que:'Una sola maneta, para el freno trasero.'},
    frenos:{nombre:'Freno en U (trasero)', que:'Un solo freno atrás, de tipo U-brake, que aprieta la llanta. Muchas BMX de trucos andan sin frenos.',
      como:'Al apretar la maneta, el cable cierra los dos brazos en U y las zapatas aprietan la llanta trasera.',
      prob:[['Frena poco','Revisa que las zapatas no estén gastadas y que toquen la llanta completas. Tensa el cable con el tensor.'],['Una zapata roza','Centra el freno con los tornillos de los resortes.'],['El cable se enreda al girar el manubrio','Si tiene rotor, ajústalo para que gire libre; si no, deja el cable un poco más largo.']]},
    bielas:{nombre:'Bielas y plato', que:'Bielas de 3 piezas, muy resistentes, y un plato pequeño de 25 dientes.'},
    cassette:{nombre:'Piñón de 9 dientes', que:'Un piñón muy chico (9 dientes) con plato de 25: da una marcha que acelera fuerte y deja más espacio bajo la bici para pasar obstáculos.',
      como:'25 ÷ 9 ≈ 2,8 vueltas de rueda por pedalada. Es una sola marcha: nada que ajustar.',
      prob:[['La cadena se sale','Está floja: tira la rueda trasera hacia atrás hasta que tenga 1 cm de juego y aprieta las tuercas del eje.'],['Pedaleas y la rueda patina','Los trinquetes del buje están gastados: revisa en taller.'],['Ruido seco al pedalear','Lubrica la cadena y revisa el eje pedalier.']]},
    sillin:{nombre:'Sillín BMX', que:'Sillín bajo y pequeño. Si estuviera alto estorbaría, porque en BMX se anda de pie.'},
    rueda_del:{que:'Rueda de 20 pulgadas con neumático ancho y muchos rayos, para aguantar aterrizajes.'},
    rueda_tras:{que:'Rueda de 20 pulgadas con un solo piñón y pegs en el eje.'},
  },
  build(){
    const orange = 0xf77f00, black = 0x1a1a1a, chrome = 0xc9ced3;
    { const g = group('cuadro'); const m = mat('cuadro',orange,{r:.3,m:.25});
      tube([-0.11,0.6,0],[0.485,0.65,0],0.02,m,'cuadro',g);
      tube(BB,[0.505,0.585,0],0.024,m,'cuadro',g);
      tube(BB,[-0.11,0.61,0],0.02,m,'cuadro',g);
      tube([0.479,0.672,0],[0.511,0.556,0],0.026,m,'cuadro',g);
      for(const s of [1,-1]){
        tube([0,BB[1],0.03*s],[RA[0],RA[1],0.055*s],0.012,m,'cuadro',g);
        tube([-0.1,0.58,0.016*s],[RA[0],RA[1],0.055*s],0.011,m,'cuadro',g);
        dropout([RA[0],RA[1],0.055*s],[0.62,0.78],m,'cuadro',g);
      }
      disc(BB,0.032,0.085,m,'cuadro',g,28); }
    { const g = group('horquilla'); const m = mat('horquilla',black,{r:.35,m:.4});
      box([0.513,0.547,0],[0.05,0.03,0.11],m,'horquilla',g,-0.27);
      for(const s of [1,-1]){
        curveTube([[0.515,0.54,0.048*s],[0.555,0.39,0.05*s],[FA[0],FA[1],0.05*s]],0.014,m,'horquilla',g,20);
        dropout([FA[0],FA[1],0.05*s],[-0.33,0.94],m,'horquilla',g);
      } }
    { const g = group('manubrio'); const m = mat('manubrio',chrome,{r:.2,m:.9}); const gr = mat('manubrio',black,{r:.85}); const st = mat('manubrio',black,{r:.4,m:.4});
      tube([0.479,0.672,0],[0.472,0.705,0],0.017,st,'manubrio',g);
      box([0.495,0.705,0],[0.06,0.03,0.07],st,'manubrio',g);
      for(const s of [1,-1]){
        curveTube([[0.51,0.705,0],[0.51,0.705,0.09*s],[0.505,0.72,0.12*s],[0.48,0.9,0.13*s],[0.47,0.922,0.16*s],[0.455,0.927,0.36*s]],0.011,m,'manubrio',g,40);
        grip([0.462,0.926,0.25*s],[0.455,0.927,0.365*s],0.017,gr,'manubrio',g);
      }
      tube([0.488,0.83,-0.128],[0.488,0.83,0.128],0.009,m,'manubrio',g,12); }
    const LR=[0.468,0.926,0.235];
    { const g = group('manetas'); const m = mat('manetas',0x2b2d30,{r:.5,m:.3});
      disc([0.462,0.926,0.235],0.013,0.015,m,'manetas',g,16); lever([0.47,0.922,0.235],[0.53,0.905,0.28],m,'manetas',g); }
    adjusters([[LR,[0.5,0.8,0.12],'freno']]);
    { const g = group('sillin'); const m = mat('sillin',black,{r:.65}); const t = mat('sillin',chrome,{r:.25,m:.8});
      tube([-0.11,0.61,0],[-0.122,0.645,0],0.014,t,'sillin',g);
      saddle(g,-0.235,0.0,0.692,0.06,0.024,0.03,m); }
    vbrakes({front:false, rDir:dirTo(RA,[-0.1,0.58]), leverR:LR, routeR:[[0.5,0.8,0.12],[0.45,0.66,0.03],[0.25,0.63,0.03],[-0.05,0.6,0.02]]});
    { const g = group('pegs'); const m = mat('pegs',0xb9bec4,{r:.35,m:.85});
      for(const A of [RA,FA]) for(const s of [1,-1]) disc([A[0],A[1],0.14*s],0.019,0.1,m,'pegs',g,16); }
  }
},
});


for(const [id,m] of Object.entries(MODELS)) m.id = id;

/* ---------- cadena ---------- */
function linkGeo(outer){
  const h=LINK/2, r=0.0043, w=0.0029, s=new THREE.Shape();
  s.moveTo(-h,-r); s.quadraticCurveTo(0,-w,h,-r); s.absarc(h,0,r,-Math.PI/2,Math.PI/2,false); s.quadraticCurveTo(0,w,-h,r); s.absarc(-h,0,r,Math.PI/2,Math.PI*1.5,false);
  const zo = outer ? 0.0053 : 0.0039, parts=[];
  for(const sz of [1,-1]){ const g=new THREE.ExtrudeGeometry(s,{depth:0.0009,bevelEnabled:false,curveSegments:10}); g.translate(0,0,sz*zo-0.00045); parts.push(g); }
  for(const x of [-h,h]){
    const c = (outer ? new THREE.CylinderGeometry(0.0019,0.0019,0.0125,10) : new THREE.CylinderGeometry(0.0034,0.0034,zo*2,14)).toNonIndexed();
    c.rotateX(Math.PI/2); c.translate(x,0,0); parts.push(c);
  }
  return mergeGeometries(parts.map(g=>g.index?g.toNonIndexed():g));
}
const _linkGeos = [];
function makeChainMesh(){
  const g = group('cadena');
  const plate = mat('cadena',0x9aa0a7,{r:.28,m:.92}), inner = mat('cadena',0x6d737a,{r:.32,m:.9});
  if(!_linkGeos.length) _linkGeos.push(linkGeo(true), linkGeo(false));
  chainMesh = [new THREE.InstancedMesh(_linkGeos[0], plate, MAXLINKS/2), new THREE.InstancedMesh(_linkGeos[1], inner, MAXLINKS/2)];
  chainMesh.forEach(cm=>{ cm.userData.part='cadena'; cm.castShadow=true; cm.frustumCulled=false; g.add(cm); });
}
function pulleyPos(cr){ const ux=RA[0]+0.012, uy=RA[1]-cr-0.03; return [ux,uy,ux+L_OFF.x,uy+L_OFF.y]; }
function buildChain(){
  const {rr,rz,cr,cz} = tr; const P=[]; const add=(x,y,z)=>P.push(new THREE.Vector3(x,y,z));
  const [BX,BY]=BB, [RX,RY]=RA;
  for(let a=-90;a<=90;a+=22.5){ const t=a*Math.PI/180; add(BX+Math.cos(t)*rr, BY+Math.sin(t)*rr, rz); }
  add((BX+RX)/2, (BY+rr+RY+cr)/2, (rz+cz)/2);
  if(M.drive.rd){
    for(let a=90;a<=225;a+=27){ const t=a*Math.PI/180; add(RX+Math.cos(t)*cr, RY+Math.sin(t)*cr, cz); }
    const [ux,uy,lx,ly] = pulleyPos(cr), pr=PULLEY_R;
    add(ux-pr, uy, cz); add(ux-pr*0.4, uy-pr*0.95, cz);
    add(lx-pr, ly, cz); add(lx, ly-pr, cz); add(lx+pr*0.75, ly-pr*0.7, cz);
    add((lx+BX)/2, (ly-pr+BY-rr)/2, (cz+rz)/2);
    rdCage.position.set(ux,uy,cz);
    setTube(rdBody, rdHanger, new THREE.Vector3(ux-0.004, uy+0.02, cz+0.004));
  } else {
    for(let a=90;a<=270;a+=30){ const t=a*Math.PI/180; add(RX+Math.cos(t)*cr, RY+Math.sin(t)*cr, cz); }
    add((BX+RX)/2, (BY-rr+RY-cr)/2, (rz+cz)/2);
  }
  if(M.drive.fd){
    const sx = stX(FD_Y);
    fdCage.position.set(sx+0.012, FD_Y, rz);
    setTube(fdArm, fdClamp, new THREE.Vector3(sx-0.006, FD_Y+0.012, rz));
  }
  chainCurve = new THREE.CatmullRomCurve3(P, true, 'centripetal');
  chainLen = chainCurve.getLength();
  nLinks = Math.min(MAXLINKS, Math.round(chainLen/LINK));
  chainMesh[0].count = Math.ceil(nLinks/2); chainMesh[1].count = Math.floor(nLinks/2);
}
const _m=new THREE.Matrix4(), _q=new THREE.Quaternion(), _s=new THREE.Vector3(1,1,1), X1=new THREE.Vector3(1,0,0);
let chainOffset = 0;
function updateChain(){
  for(let i=0;i<nLinks;i++){
    let u = (i/nLinks + chainOffset) % 1; if(u<0) u+=1;
    const p = chainCurve.getPointAt(u), t = chainCurve.getTangentAt(u);
    _q.setFromUnitVectors(X1,t);
    _m.compose(p,_q,_s); chainMesh[i%2].setMatrixAt(i>>1,_m);
  }
  chainMesh[0].instanceMatrix.needsUpdate = chainMesh[1].instanceMatrix.needsUpdate = true;
}
const gearGoal = ()=>({ rr:toothR(RINGS[gear.r]), rz:ringZ(gear.r), cr:toothR(COGS[gear.c]), cz:cogZ(gear.c) });

/* ---------- vista separada ---------- */
const EXPLODE = {
  horquilla:[0.22,-0.03,0], manubrio:[0.2,0.28,0], manetas:[0.32,0.38,0], sillin:[-0.12,0.32,0],
  rueda_del:[0.5,0,0], rueda_tras:[-0.5,0,0], cassette:[0,0,0.16], bielas:[0.05,-0.12,0.28],
  pedales:[0,0,0.1], cadena:[0,-0.04,0.42], desviador:[-0.3,-0.12,0.32], desviador_del:[0.02,0.2,0.34], frenos:[0,0,-0.34],
  protector:[0,0.08,0.3], rueditas:[-0.25,0,0.3], tensores:[0.32,0.38,0],
  parrilla:[-0.25,0.22,0], guardabarros:[0,0.16,-0.36], luces:[0.22,0.15,0.25], pata:[0,-0.08,-0.3], pegs:[0,-0.1,0], bisagra:[0,0.18,-0.32], motor:[0,-0.15,-0.36], bateria:[0.1,0.2,-0.36], pantalla:[0.12,0.25,-0.28]
};
let explodeItems = [];
let explodeT = 0, explodeGoal = 0;

/* ---------- construir / cambiar de modelo ---------- */
function clearBike(){
  root.traverse(o=>{ if(o.geometry) o.geometry.dispose(); });
  Object.values(partMats).flat().forEach(m=>m.dispose());
  while(root.children.length) root.remove(root.children[0]);
  for(const k in partMats) delete partMats[k];
  for(const k in partGroups) delete partGroups[k];
  pedalGroups = []; trainers = []; adjusterMeshes = []; rotorGroups = []; rdCage = rdBody = fdCage = fdArm = null; fold = null;
}
function buildBike(id,{keepCam=false}={}){
  clearBike();
  M = MODELS[id]; RA=M.RA; FA=M.FA; BB=M.BB;
  const D = M.drive; RINGS=D.rings; COGS=D.cogs; PULLEY_R=D.pulley ?? 0.017;
  ringZ = i => D.rz0 + i*D.rdz; cogZ = i => D.cz0 + i*D.cdz;
  if(!gear || gear.model!==id) gear = {...D.start, model:id};
  M.build();
  wheelF = buildWheel('rueda_del',FA,M.wheel);
  wheelR = buildWheel('rueda_tras',RA,M.wheel);
  rotorGroups.forEach(([g,w])=>(w==='r'?wheelR:wheelF).attach(g));
  buildCassette(); buildCrank();
  if(D.rd) buildRD(); if(D.fd) buildFD();
  makeChainMesh();
  tr = gearGoal(); buildChain(); updateChain();
  if(M.after) M.after();
  explodeItems = [];
  for(const [pid,gs] of Object.entries(partGroups)){
    gs.forEach(g=>{
      const delta = V(EXPLODE[pid] || [0,0,0]).multiplyScalar(M.scale);
      if(pid==='pedales' || pid==='rueditas') delta.z = Math.abs(delta.z)*Math.sign(g.position.z||1);
      explodeItems.push({g, base:g.position.clone(), delta});
    });
  }
  HOME_POS = V(M.cam.pos); HOME_TARGET = V(M.cam.target);
  blob.scale.set((FA[0]-RA[0])+M.wheel.tireR*2.2, 0.32, 1); blob.position.x = (FA[0]+RA[0])/2;
  if(!keepCam){ camera.position.copy(HOME_POS); controls.target.copy(HOME_TARGET); focusGoal = null; }
  controls.minDistance = id==='ninos' ? 0.4 : 0.6;
}

/* ---------- selección ---------- */
const P = id => ({...PARTS[id], ...((M && M.over[id]) || {})});
const modelParts = () => M.parts.filter(id => id!=='rueditas' || opts.rueditas);
const ACCENT = new THREE.Color(0xe4572e);
let hovered = null, selected = null, hlMap = null;
function paint(){
  for(const [id,ms] of Object.entries(partMats)){
    let c = ACCENT, k = id===selected ? 0.55 : id===hovered ? 0.28 : 0;
    if(hlMap && hlMap[id]){ c = hlMap[id].c; k = Math.max(k, hlMap[id].k); }
    ms.forEach(m=>{ m.emissive.copy(c); m.emissiveIntensity = k; });
  }
}
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
function pick(e){
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
  ray.setFromCamera(ndc,camera);
  const hits = ray.intersectObjects(root.children,true);
  for(const h of hits){ if(h.object.userData.part) return h.object.userData.part; }
  return null;
}
const tip = document.getElementById('tip');
let downAt = null;
canvas.addEventListener('pointerdown',e=>{ downAt=[e.clientX,e.clientY]; });
canvas.addEventListener('pointerup',e=>{
  if(!downAt) return; const moved = Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1]); downAt=null;
  if(moved<6){ const p = pick(e); if(game?.active){ if(game.mode==='busca') gameClick(p); return; } if(p) selectPart(p,{focus:true}); }
});
canvas.addEventListener('pointermove',e=>{
  if(e.pointerType!=='mouse') return;
  const p = pick(e);
  if(p!==hovered){ hovered=p; paint(); canvas.style.cursor = p?'pointer':'grab'; }
  if(p && !game?.active){ const r=stage.getBoundingClientRect(); tip.textContent=P(p).nombre; tip.style.left=(e.clientX-r.left)+'px'; tip.style.top=(e.clientY-r.top)+'px'; tip.style.opacity=1; }
  else tip.style.opacity=0;
});
canvas.addEventListener('pointerleave',()=>{ hovered=null; paint(); tip.style.opacity=0; });

let focusGoal = null;
function focusPart(id){
  const b = new THREE.Box3(); (partGroups[id]||[]).forEach(g=>b.expandByObject(g));
  if(b.isEmpty()) return; focusGoal = b.getCenter(new THREE.Vector3());
}

/* ---------- animación ---------- */
let pedaling = false, speed = 0; const clock = new THREE.Clock();
function resize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w,h,false); camera.aspect = w/h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage); resize();
function loop(){
  const dt = Math.min(clock.getDelta(),0.05);
  if(!M){ requestAnimationFrame(loop); return; }
  speed += ((pedaling?1:0)-speed)*Math.min(1,dt*3);
  if(speed>0.001){
    const w = 3.2*speed;                     // rad/s de las bielas
    crank.rotation.z -= w*dt;
    pedalGroups.forEach(p=>p.rotation.z = -crank.rotation.z);
    const ratio = tr.rr/tr.cr;
    wheelR.rotation.z -= w*ratio*dt;
    wheelF.rotation.z -= w*ratio*dt;
    trainers.forEach(t=>t.rotation.z -= w*ratio*dt*(M.wheel.tireR/0.075));
    chainOffset -= (w*tr.rr*dt)/chainLen;
  }
  // cambio de marcha animado
  const goal = gearGoal();
  let moving=false;
  for(const k in goal){ const d=goal[k]-tr[k]; if(Math.abs(d)>1e-5){ tr[k]+=d*Math.min(1,dt*6); moving=true; } else tr[k]=goal[k]; }
  if(moving) buildChain();
  if(moving || speed>0.001) updateChain();
  if(selected==='tensores') adjusterMeshes.forEach(a=>a.rotateY(dt*2.5));
  if(fold){
    fold.t += (fold.goal-fold.t)*Math.min(1,dt*2.5);
    const f = fold.t*fold.t*(3-2*fold.t);
    fold.pivot.rotation.y = 2.95*f; fold.post.rotation.x = -2.35*f; fold.seat.position.set(0.0591*f,-0.2119*f,0);   // desliza 22 cm a lo largo del tubo del sillín
    fold.hide.forEach(m=>m.visible = f<0.03);
  }
  explodeT += (explodeGoal-explodeT)*Math.min(1,dt*4);
  const e = explodeT*explodeT*(3-2*explodeT);
  explodeItems.forEach(it=>it.g.position.copy(it.base).addScaledVector(it.delta,e));
  if(focusGoal){ controls.target.lerp(focusGoal, Math.min(1,dt*4)); if(controls.target.distanceTo(focusGoal)<0.002) focusGoal=null; }
  controls.update();
  renderer.render(scene,camera);
  requestAnimationFrame(loop);
}
loop();

const bPedal = document.getElementById('bPedal'), bExplode = document.getElementById('bExplode');
bPedal.onclick = ()=>{ pedaling=!pedaling; bPedal.classList.toggle('on',pedaling); bPedal.textContent = pedaling?'❚❚ Detener':'▶ Pedalear'; };
bExplode.onclick = ()=>{ explodeGoal = explodeGoal?0:1; bExplode.classList.toggle('on',!!explodeGoal); };
document.getElementById('bReset').onclick = ()=>{ focusGoal = HOME_TARGET.clone(); camera.position.copy(HOME_POS); };
const bQ = document.getElementById('bQ');
function updQ(){ bQ.textContent = HQ ? 'Calidad alta' : 'Calidad normal'; bQ.classList.toggle('on', HQ); }
bQ.onclick = ()=>{
  HQ = !HQ; try{ localStorage.setItem('bici3d-hq', HQ?'1':'0'); }catch(e){}
  renderer.setPixelRatio(HQ ? Math.min(devicePixelRatio,2) : 1); resize();
  const n = HQ?3072:1024; sun.shadow.mapSize.set(n,n); if(sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; }
  const sel = selected; setModel(M.id,{keepCam:true}); if(sel && modelParts().includes(sel)) selectPart(sel,{tab:false});
  updQ();
};
updQ();

/* ------------------------------------------------------------------ */
/*  PANEL                                                              */
/* ------------------------------------------------------------------ */
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const tabs = document.querySelectorAll('.tabs button');
function showTab(name){
  const prev = document.querySelector('.tabs button.on')?.dataset.tab;
  if(prev==='juego' && name!=='juego' && game) renderJuegoIntro();
  if(name!=='arreglar' && name!=='juego' && hlMap){ hlMap=null; paint(); document.querySelectorAll('#diag .chip.on').forEach(c=>c.classList.remove('on')); }
  tabs.forEach(b=>b.classList.toggle('on',b.dataset.tab===name));
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('on',p.id==='pane-'+name));
}
tabs.forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

const paneP = document.getElementById('pane-partes');
paneP.innerHTML = `<div class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5f676b" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="partSearch" type="search" placeholder="Busca una pieza por cualquier nombre: piñonera, tee, tija…" autocomplete="off"></div><div id="searchOut"></div><div id="partBody"></div>`;
const partBody = document.getElementById('partBody');
function partChips(){
  return `<div class="chips">${modelParts().map(id=>`<button class="chip ${id===selected?'on':''}" data-part="${id}">${P(id).nombre}</button>`).join('')}</div>`;
}
function renderParts(){
  let body;
  if(!selected){
    body = `<div class="card model-card"><b>${M.titulo}</b><p>${M.desc}</p></div><div class="empty"><svg width="64" height="40" viewBox="0 0 64 40" fill="none" stroke="#c9c1b0" stroke-width="2.5"><circle cx="13" cy="26" r="11"/><circle cx="51" cy="26" r="11"/><path d="M13 26 24 9h22l5 17M24 9l9 17 13-17M33 26H13"/></svg>Toca una pieza en el modelo 3D<br>o elígela de la lista.</div>`;
  } else {
    const p = P(selected);
    body = `<h2>${p.nombre}</h2>
      <p class="lead">${p.que}</p>
      <h3>Cómo funciona</h3><p style="margin:0">${p.como}</p>
      <h3>Problemas comunes y cómo arreglarlos</h3>
      <div class="card">${p.prob.map(([a,b])=>`<div class="prob"><b>${a}</b><p>${b}</p></div>`).join('')}</div>
      <div class="row" style="margin-top:16px"><button class="btn ghost" id="askAbout">Preguntar otro problema de esta pieza →</button></div>`;
  }
  partBody.innerHTML = `${body}<h3>Todas las piezas de esta bici</h3>${partChips()}`;
  partBody.querySelectorAll('[data-part]').forEach(b=>b.onclick=()=>selectPart(b.dataset.part,{focus:true}));
  const ask = document.getElementById('askAbout');
  if(ask) ask.onclick = ()=>{ showTab('arreglar'); const ta=document.getElementById('q'); ta.value=`Mi ${P(selected).nombre.toLowerCase()} `; ta.focus(); };
}
function selectPart(id,{focus=false,tab=true}={}){
  selected = id; hlMap = null; paint(); renderParts();
  if(tab) showTab('partes');
  if(focus) focusPart(id);
  paneP.scrollTop = 0;
}

/* ---- Cómo funciona ---- */
function flowFor(){
  const n=RINGS.length, c=COGS.length;
  const st=[
    ['pedales','Empujas los pedales','Tus piernas aplican fuerza hacia abajo sobre los pedales.'],
    ['bielas','Las bielas giran','Funcionan como palancas y convierten ese empuje en giro del plato.'],
    ['cadena','El plato tira de la cadena','Los dientes del plato arrastran la cadena por la parte de arriba.'],
    ['cassette', c>1?'La cadena gira un piñón':'La cadena gira el piñón','El piñón está unido a la rueda trasera.'],
    ['rueda_tras','La rueda trasera empuja','Gira y empuja el suelo hacia atrás: la bici avanza.'],
  ];
  if(M.drive.fd) st.push(['desviador_del','El desviador delantero elige el plato',`Mueve la cadena entre los ${n} platos.`]);
  if(M.drive.rd) st.push(['desviador','El desviador trasero elige el piñón',`Mueve la cadena entre los ${c} piñones para que pedalear cueste más o menos.`]);
  st.push(['horquilla','Diriges con el manubrio','El manubrio hace girar la horquilla y la rueda delantera.']);
  st.push(['frenos','Los frenos detienen', M.brakes==='disc'?'Las pastillas aprietan el disco y el roce frena la rueda.':'Las zapatas aprietan la llanta y el roce frena la rueda.']);
  if(modelParts().includes('motor')) st.splice(2,0,['motor','El motor suma fuerza','Un sensor mide cuánta fuerza haces y el motor agrega ayuda en proporción. Si dejas de pedalear, deja de ayudar.']);
  if(modelParts().includes('rueditas')) st.push(['rueditas','Las rueditas sostienen','Evitan que la bici se caiga hacia el lado mientras el niño aprende.']);
  return st;
}
const paneF = document.getElementById('pane-funciona');
function renderFunciona(){
  const n=RINGS.length, c=COGS.length, single = n*c===1;
  const head = single ? 'Una sola marcha' : `Prueba las marchas: ${n} platos × ${c} piñones = ${n*c} cambios`;
  const expl = single
    ? (M.id==='bmx' ? 'Las BMX tienen una sola marcha: un plato de 25 y un piñón de 9. Es liviana, casi no necesita ajustes y acelera fuerte para saltar.'
       : 'Las bicis infantiles tienen una sola marcha: no hay cambios que ajustar y la bici pesa menos. El plato de 28 y el piñón de 16 dan una marcha suave, fácil para piernas pequeñas.')
    : n===1 ? `Esta bici tiene un solo plato adelante (transmisión “1x”): todos los cambios se hacen atrás, con una sola palanca a la derecha. Es más simple y casi no se le cae la cadena. Piñones grandes = marcha <b>suave</b>; piñones chicos = marcha <b>dura y rápida</b>.`
    : M.id==='ruta'
      ? 'El plato grande y los piñones chicos hacen la marcha más <b>dura y rápida</b>; el plato chico y los piñones grandes, más <b>suave</b> para los puertos de montaña. Para cambiar, se empuja la maneta hacia el lado: la derecha mueve los piñones y la izquierda los platos.'
      : 'El plato grande y los piñones chicos hacen la marcha más <b>dura y rápida</b>. El plato chico y los piñones grandes la hacen más <b>suave</b>, para subir cerros. La palanca derecha mueve el desviador trasero (piñones) y la izquierda el delantero (platos).';
  paneF.innerHTML = `<h2>De tus piernas a la rueda</h2>
    <p class="lead">Una bicicleta transforma la fuerza de tus piernas en movimiento. Pulsa cada paso para ver la pieza en el modelo.</p>
    <h3>El recorrido de la fuerza</h3>
    <ol class="steps flow">${flowFor().map(([id,t,d])=>`<li data-part="${id}"><b>${t}</b><br><span style="color:#3b4346">${d}</span></li>`).join('')}</ol>
    <h3>${head}</h3>
    <div class="card">
      <div class="gearbox"></div>
      <div style="margin-top:12px">Cada vuelta de pedal = <b class="g-ratio"></b> vueltas de rueda ≈ <b class="g-dist"></b> m recorridos.</div>
      <div class="src g-txt"></div>
      <p style="margin:10px 0 0;font-size:14px;color:#3b4346">${expl}</p>
      <div class="row"><button class="btn" id="tryPedal">▶ Ver en movimiento</button></div>
    </div>
    <h3>¿Por qué no te caes?</h3>
    <p style="margin:0">Al avanzar, la bici se mantiene derecha porque vas corrigiendo con el manubrio sin darte cuenta: si te inclinas hacia un lado, la rueda delantera gira hacia ese lado y vuelve a ponerse bajo tu peso. La inclinación de la horquilla ayuda a que esto pase casi solo.${M.id==='ninos'?' Las rueditas sirven al principio, pero para aprender el equilibrio conviene irlas subiendo de a poco hasta sacarlas.':''}</p>`;
  paneF.querySelectorAll('[data-part]').forEach(li=>li.onclick=()=>{ selected=li.dataset.part; paint(); renderParts(); focusPart(li.dataset.part); });
  document.getElementById('tryPedal').onclick = ()=>{ if(!pedaling) bPedal.click(); };
}
function gearBoxHTML(){
  if(RINGS.length*COGS.length===1) return `<div class="gl single">Plato <b>${RINGS[0]}</b> · Piñón <b>${COGS[0]}</b> · sin cambios</div>`;
  return `<div class="gl"><span>Plato</span><div class="gb">${RINGS.map((n,i)=>`<button data-r="${i}" title="Plato ${i+1}: ${n} dientes">${n}</button>`).join('')}</div></div>
    <div class="gl"><span>Piñón</span><div class="gb">${COGS.map((n,i)=>`<button data-c="${i}" title="Piñón ${i+1}: ${n} dientes">${n}</button>`).join('')}</div></div>`;
}
function renderGearUI(){
  document.querySelector('.hud-t').textContent = RINGS.length*COGS.length===1 ? 'Transmisión' : 'Cambios';
  document.querySelectorAll('.gearbox').forEach(el=>{
    el.innerHTML = gearBoxHTML();
    el.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>shift('r',+b.dataset.r));
    el.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>shift('c',+b.dataset.c));
  });
  updGear();
}
function shift(kind,i){ gear[kind]=i; updGear(); }
function updGear(){
  const rn=RINGS[gear.r], cn=COGS[gear.c], r=rn/cn, n=RINGS.length, c=COGS.length;
  const dev = r*2*Math.PI*M.wheel.tireR;
  document.querySelectorAll('.gearbox [data-r]').forEach(b=>b.classList.toggle('on',+b.dataset.r===gear.r));
  document.querySelectorAll('.gearbox [data-c]').forEach(b=>b.classList.toggle('on',+b.dataset.c===gear.c));
  const fmt = (x,d)=>x.toFixed(d).replace('.',',');
  document.querySelectorAll('.g-ratio').forEach(e=>e.textContent=fmt(r,2));
  document.querySelectorAll('.g-dist').forEach(e=>e.textContent=fmt(dev,1));
  document.querySelectorAll('.g-sum').forEach(e=>e.textContent = n*c===1 ? `${rn}/${cn} = ${fmt(r,2)} vueltas de rueda por pedalada` : `Marcha ${gear.r+1}-${gear.c+1} · ${rn}/${cn} = ${fmt(r,2)} vueltas por pedalada`);
  const cross = n>1 && ((gear.r===0 && gear.c>=c-2) || (gear.r===n-1 && gear.c<=1));
  const txt = n*c===1 ? (M.id==='bmx' ? 'Marcha única: acelera fuerte y no hay nada que ajustar.' : 'Marcha única: simple y liviana, ideal para aprender.')
    : cross ? '⚠ Cadena cruzada: la cadena queda muy diagonal. Evita esta combinación, desgasta la cadena y hace ruido.'
    : dev<3 ? 'Marcha suave: ideal para subidas.' : dev<5.5 ? 'Marcha media: para andar en plano.' : 'Marcha dura: para ir rápido o en bajadas.';
  document.querySelectorAll('.g-txt').forEach(e=>{ e.textContent=txt; e.style.color = cross?'#c2410c':''; });
}

/* ---- Arreglar ---- */
const paneA = document.getElementById('pane-arreglar');
paneA.innerHTML = `<h2>¿Qué le pasa a tu bici?</h2>
  <p class="lead">Elige lo que notas y te marco en el modelo las piezas que suelen causarlo, de la más probable a la menos.</p>
  <div id="diag"></div>
  <div id="diagAns"></div>
  <h3>O descríbelo con tus palabras</h3>
  <textarea id="q" placeholder="Ej: cuando cambio de marcha la cadena salta y hace ruido"></textarea>
  <div class="row"><button class="btn" id="go">Cómo lo arreglo</button><span class="src" id="mode"></span></div>
  <h3>Problemas frecuentes</h3>
  <div class="chips" id="quick"></div>
  <div id="ans"></div>
  <details class="guides" id="guidesBox"><summary id="guidesSum">Ver todas las guías</summary><div id="guideList"></div></details>`;
const qEl = document.getElementById('q'), goEl = document.getElementById('go'), ansEl = document.getElementById('ans'), modeEl = document.getElementById('mode');
const diagEl = document.getElementById('diag'), diagAns = document.getElementById('diagAns');
const QUICK = {
  mtb:["Pinché una rueda","Se salió la cadena","Los frenos frenan poco","El freno roza","Los cambios saltan","La cadena suena","Ajustar la suspensión","Cruje al pedalear","Usar los tensores"],
  ruta:["Pinchazo tubeless","Los cambios saltan","No sube al plato grande","El freno roza","Cuesta desenganchar el pedal","Cambios electrónicos","Cambiar la cinta","Crujido en el cuadro"],
  urbana:["Pinché una rueda","Inflar a la presión correcta","Los frenos frenan poco","Zapatas gastadas","El guardabarros roza","Revisar las luces","Ajustar la pata","Cargar la parrilla"],
  electrica:["La e-bike no enciende","Dura poco la batería","Cadena gastada","Lavar sin dañar el motor","Los cambios saltan","Cambiar pastillas","Ajustar la suspensión"],
  plegable:["Cómo se pliega","Juego en la bisagra","Pinché una rueda","Los cambios saltan","Zapatas gastadas","Inflar a la presión correcta"],
  bmx:["Poner los pegs","Se salió la cadena","El freno frena poco","La dirección tiene juego","Rayo roto","Pedaleo y no avanza"],
  ninos:["Pinché una rueda","Se salió la cadena","Los frenos frenan poco","Ajustar las rueditas","Freno contrapedal","Tensar el freno con el tensor","El sillín está muy alto","El timbre no suena"],
};
function renderQuick(){
  const q = document.getElementById('quick');
  q.innerHTML = (QUICK[M.id]||QUICK.mtb).map(t=>`<button class="chip">${t}</button>`).join('');
  q.querySelectorAll('.chip').forEach(c=>c.onclick=()=>{ qEl.value=c.textContent; solve(); });
  qEl.placeholder = M.id==='ninos' ? 'Ej: la bici de mi hijo se va hacia un lado con las rueditas' : 'Ej: cuando cambio de marcha la cadena salta y hace ruido';
}
goEl.onclick = solve;
qEl.addEventListener('keydown',e=>{ if(e.key==='Enter' && (e.metaKey||e.ctrlKey)) solve(); });

const kbFor = () => KB.filter(e => modelParts().includes(e.parte) && (!e.models || e.models.includes(M.id)));
function localAnswer(q){
  const n = norm(q); let best=null, score=0;
  for(const e of kbFor()){ const s = e.k.reduce((a,k)=>a+(n.includes(norm(k))?k.length:0),0); if(s>score){score=s;best=e;} }
  if(best && /trasera|atras/.test(n) && best.parte==='rueda_del') best = {...best, parte:'rueda_tras'};
  return best;
}
let sample = null;
(async()=>{ try{ if(window.claude?.use) sample = await window.claude.use('sample'); }catch(e){ sample=null; }
  modeEl.textContent = sample ? 'Respuestas de Claude, a la medida de tu pregunta' : ''; })();

function answerHTML(a, src){
  const part = a.parte && modelParts().includes(a.parte) ? a.parte : null;
  return {part, html:`<div class="card" style="margin-top:18px">
    <h2 style="font-size:20px">${esc(a.titulo||'Cómo arreglarlo')}</h2>
    ${a.diagnostico?`<p style="margin:4px 0 0">${esc(a.diagnostico)}</p>`:''}
    ${part?`<div class="row"><button class="chip on" data-see="${part}">Ver ${esc(P(part).nombre)} en 3D</button></div>`:''}
    ${a.herramientas?.length?`<h3>Necesitas</h3><div class="tools">${a.herramientas.map(h=>`<span>${esc(h)}</span>`).join('')}</div>`:''}
    <h3>Paso a paso</h3>
    <ol class="steps">${(a.pasos||[]).map(p=>`<li>${esc(p)}</li>`).join('')}</ol>
    ${a.taller?`<div class="warn"><b>Cuándo ir al taller:</b> ${esc(a.taller)}</div>`:''}
    <div class="src" style="margin-top:12px">${src}</div></div>`};
}
function showPartIn3D(part){ hlMap=null; selected=part; paint(); renderParts(); focusPart(part); }
function renderAnswer(a, src, target=ansEl){
  const {part, html} = answerHTML(a, src);
  if(target===ansEl) diagAns.innerHTML=''; else ansEl.innerHTML='';
  target.innerHTML = html;
  target.querySelectorAll('[data-see]').forEach(b=>b.onclick=()=>showPartIn3D(b.dataset.see));
  if(part) showPartIn3D(part);
}
function renderPartAnswer(id, target=ansEl){
  const p = P(id);
  target.innerHTML = `<div class="card" style="margin-top:18px"><h2 style="font-size:20px">${esc(p.nombre)}: problemas comunes</h2>
    <p style="margin:4px 0 0">${esc(p.que)}</p>
    <div class="row"><button class="chip on" data-see="${id}">Ver ${esc(p.nombre)} en 3D</button></div>
    <div style="margin-top:8px">${p.prob.map(([a,b])=>`<div class="prob"><b>${esc(a)}</b><p>${esc(b)}</p></div>`).join('')}</div>
    <div class="src" style="margin-top:12px">Guía rápida incluida en esta página.</div></div>`;
  target.querySelectorAll('[data-see]').forEach(b=>b.onclick=()=>showPartIn3D(b.dataset.see));
  showPartIn3D(id);
}
function renderLocal(q, note=''){
  diagAns.innerHTML='';
  const a = localAnswer(q);
  if(a){ renderAnswer(a, (note?note+' ':'')+'Guía rápida incluida en esta página.'); return; }
  const hit = searchParts(q).find(h=>modelParts().includes(h.id));
  if(hit){ renderPartAnswer(hit.id); return; }
  ansEl.innerHTML = `<div class="card" style="margin-top:18px">No encontré una guía para ese problema. Prueba con otras palabras (por ejemplo “freno”, “cadena”, “cambios”, “pinchazo”), elige un síntoma arriba o revisa la lista de todas las guías.${note?`<div class="src">${esc(note)}</div>`:''}</div>`;
}
let busy=false;
async function solve(){
  const q = qEl.value.trim(); if(!q||busy) return;
  if(!sample){ renderLocal(q); return; }
  busy=true; goEl.disabled=true; diagAns.innerHTML='';
  ansEl.innerHTML = `<div class="loading"><div class="spin"></div>Revisando el problema…</div>`;
  const prompt = `Eres un mecánico de bicicletas con mucha experiencia que enseña a principiantes en Chile. Responde en español claro y cercano (usa "tú").
Tipo de bicicleta que está viendo: ${M.titulo}. ${M.desc}
Problema descrito por la persona: """${q}"""

Piezas del modelo 3D (usa el id en "parte"): ${modelParts().map(id=>`${id}=${P(id).nombre}`).join(', ')}.

Responde SOLO con un objeto JSON válido, sin texto adicional, con esta forma:
{"parte": "<id de la pieza más relacionada o null>",
 "titulo": "<título corto de la reparación>",
 "diagnostico": "<1-2 frases: causa más probable y otras posibles>",
 "herramientas": ["<herramienta>", ...],
 "pasos": ["<paso concreto y accionable>", ... (entre 3 y 8 pasos)],
 "taller": "<cuándo conviene ir a un taller, o cadena vacía>"}
Si el problema afecta la seguridad (frenos, dirección, grietas en el cuadro, batería), dilo en "taller". Si la pregunta no es sobre bicicletas, usa parte null y explica amablemente en "diagnostico" que solo ayudas con bicicletas, con pasos vacíos.`;
  try{
    const out = await sample.json(prompt,{modelTier:'default'});
    if(!out || !Array.isArray(out.pasos)) throw new Error('formato');
    if(!out.pasos.length && !out.parte){ ansEl.innerHTML = `<div class="card" style="margin-top:18px">${esc(out.diagnostico||'Solo puedo ayudarte con bicicletas.')}</div>`; }
    else renderAnswer(out,'Respuesta generada por Claude. Revisa siempre los frenos antes de salir.');
  }catch(err){
    if(err?.code==='not_granted'){ sample=null; modeEl.textContent=''; renderLocal(q); }
    else if(err?.code==='rate_limited') renderLocal(q,'Claude está ocupado en este momento; te muestro la guía rápida.');
    else renderLocal(q,'No pude consultar a Claude; te muestro la guía rápida.');
  }finally{ busy=false; goEl.disabled=false; }
}

/* ---- Diagnóstico por síntoma ---- */
const RANK_K = [0.62,0.4,0.26,0.16,0.1];
const diagCauses = item => item.causas.filter(c=>modelParts().includes(c[0]));
function renderDiag(){
  diagEl.innerHTML = DIAG.map(cat=>{
    const items = cat.items.filter(it=>diagCauses(it).length);
    if(!items.length) return '';
    return `<div class="dcat"><div class="dcat-t">${cat.cat}</div><div class="chips">${items.map(it=>`<button class="chip" data-sym="${it.id}">${it.t}</button>`).join('')}</div></div>`;
  }).join('');
  diagEl.querySelectorAll('[data-sym]').forEach(b=>b.onclick=()=>showDiag(b.dataset.sym));
}
function showDiag(id){
  const item = DIAG.flatMap(c=>c.items).find(i=>i.id===id); if(!item) return;
  diagEl.querySelectorAll('[data-sym]').forEach(b=>b.classList.toggle('on',b.dataset.sym===id));
  const causes = diagCauses(item);
  hlMap = {}; let r=0;
  causes.forEach(([pid])=>{ if(!hlMap[pid]) hlMap[pid] = {c:ACCENT, k:RANK_K[Math.min(r++,4)]}; });
  selected = null; paint(); focusPart(causes[0][0]);
  ansEl.innerHTML = '';
  diagAns.innerHTML = `<div class="card" style="margin-top:14px">
    <h2 style="font-size:19px">${esc(item.t)}</h2>
    <p class="src" style="margin:2px 0 10px">Causas probables, de la más común a la menos. En el modelo, la más probable se ve más intensa.</p>
    <ol class="causes">${causes.map(([pid,c,fix,g],i)=>`<li>
      <div class="c-head"><span class="rank">${i+1}</span><b>${esc(c)}</b></div>
      <p>${esc(fix)}</p>
      <div class="row" style="margin-top:4px"><button class="chip" data-focus="${pid}">${esc(P(pid).nombre)}</button>${g && localAnswer(g)?`<button class="chip ghost" data-guide="${esc(g)}">Paso a paso →</button>`:''}</div></li>`).join('')}</ol>
    <div id="diagGuide"></div></div>`;
  diagAns.querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>focusPart(b.dataset.focus));
  diagAns.querySelectorAll('[data-guide]').forEach(b=>b.onclick=()=>{
    const a = localAnswer(b.dataset.guide); if(!a) return;
    const box = document.getElementById('diagGuide');
    const {html} = answerHTML(a,'Guía rápida incluida en esta página.');
    box.innerHTML = html; box.querySelectorAll('[data-see]').forEach(x=>x.onclick=()=>showPartIn3D(x.dataset.see));
    box.scrollIntoView({behavior:'smooth',block:'start'});
  });
}
function renderGuides(){
  const list = kbFor();
  document.getElementById('guidesSum').textContent = `Ver todas las guías para esta bici (${list.length})`;
  const by = {};
  list.forEach((e,i)=>{ (by[e.parte] ||= []).push(e); });
  const order = modelParts().filter(id=>by[id]);
  document.getElementById('guideList').innerHTML = order.map(id=>`<div class="gsec"><div class="dcat-t">${esc(P(id).nombre)}</div>${by[id].map(e=>`<button class="glink" data-k="${KB.indexOf(e)}">${esc(e.titulo)}</button>`).join('')}</div>`).join('');
  document.querySelectorAll('#guideList [data-k]').forEach(b=>b.onclick=()=>{ renderAnswer(KB[+b.dataset.k],'Guía rápida incluida en esta página.'); ansEl.scrollIntoView({behavior:'smooth',block:'start'}); });
}

/* ---- Buscar pieza por cualquier nombre ---- */
const searchIn = document.getElementById('partSearch'), searchOut = document.getElementById('searchOut');
function renderSearch(){
  const q = searchIn.value;
  if(!q.trim()){ searchOut.innerHTML=''; return; }
  const hits = searchParts(q).slice(0,6);
  if(!hits.length){ searchOut.innerHTML = `<div class="src">No encontré esa pieza. Prueba con otro nombre.</div>`; return; }
  searchOut.innerHTML = hits.map(h=>{
    const here = modelParts().includes(h.id) || (h.id==='rueditas' && M.id==='ninos');
    const also = here ? '' : modelsWith(h.id);
    const alias = norm(h.term)!==norm(P(h.id).nombre) && norm(h.term)!==norm(PARTS[h.id].nombre) ? `<span class="alias">“${esc(h.term)}” también se llama así</span>` : '';
    return `<div class="sres"><div><b>${esc((here?P(h.id):PARTS[h.id]).nombre)}</b>${alias}</div>${here
      ? `<button class="chip on" data-go="${h.id}">Ver</button>`
      : `<div class="src">No está en este modelo. Está en: ${also.map(m=>`<button class="chip" data-model-go="${m.id}" data-part-go="${h.id}">${m.nombre}</button>`).join(' ')}</div>`}</div>`;
  }).join('');
  searchOut.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>selectPart(b.dataset.go,{focus:true}));
  searchOut.querySelectorAll('[data-model-go]').forEach(b=>b.onclick=()=>{
    const pid=b.dataset.partGo, mid=b.dataset.modelGo;
    if(pid==='rueditas'){ opts.rueditas=true; trainChk.checked=true; }
    setModel(mid); selectPart(pid,{focus:true}); renderSearch(); });
}
searchIn.addEventListener('input', renderSearch);

/* ---- Talla ---- */
const paneT = document.getElementById('pane-talla');
paneT.innerHTML = `<h2>¿Qué talla necesitas?</h2>
  <p class="lead">Una bici de tu talla es más cómoda, más segura y cuida las rodillas. Estos valores son una guía: siempre conviene probarla.</p>
  <div class="seg seg-in" id="tWho"><button data-who="adulto" class="on">Adulto</button><button data-who="nino">Niño o niña</button></div>
  <div id="tForm"></div>
  <div id="tOut"></div>`;
let tWho = 'adulto';
const TYPES = [['mtb','Montaña'],['ruta','Ruta'],['urbana','Urbana'],['electrica','Eléctrica'],['plegable','Plegable'],['bmx','BMX']];
function renderTallaForm(){
  document.querySelectorAll('#tWho button').forEach(b=>b.classList.toggle('on',b.dataset.who===tWho));
  const f = document.getElementById('tForm');
  if(tWho==='adulto'){
    f.innerHTML = `<div class="frm">
      <label>Estatura (cm)<input type="number" id="tH" min="120" max="220" value="170" inputmode="numeric"></label>
      <label>Entrepierna (cm) <span class="opt">opcional</span><input type="number" id="tI" min="50" max="110" placeholder="Ej: 80" inputmode="numeric"></label>
      <label class="full">Tipo de bici<select id="tType">${TYPES.map(([id,n])=>`<option value="${id}" ${id===(TYPES.some(t=>t[0]===M.id)?M.id:'mtb')?'selected':''}>${n}</option>`).join('')}</select></label></div>
      <details class="howto"><summary>¿Cómo medir la entrepierna?</summary><p>Descalzo y de espaldas a una pared, pon un libro entre las piernas y súbelo firme, como si fuera un sillín. Mide desde el suelo hasta el borde de arriba del libro.</p></details>`;
  } else {
    f.innerHTML = `<div class="frm"><label>Estatura (cm)<input type="number" id="tH" min="70" max="170" value="115" inputmode="numeric"></label>
      <label>Edad (años) <span class="opt">opcional</span><input type="number" id="tA" min="1" max="15" placeholder="Ej: 5" inputmode="numeric"></label></div>`;
  }
  f.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',calcTalla));
  calcTalla();
}
document.querySelectorAll('#tWho button').forEach(b=>b.onclick=()=>{ tWho=b.dataset.who; renderTallaForm(); });
const fmt1 = x => x.toFixed(0);
function calcTalla(){
  const out = document.getElementById('tOut'), h = +document.getElementById('tH').value;
  if(!h){ out.innerHTML=''; return; }
  if(tWho==='nino'){
    const age = +(document.getElementById('tA')?.value||0);
    const T = [[95,'12"','85 a 100 cm','2 a 4 años'],[105,'14"','95 a 110 cm','3 a 5 años'],[118,'16"','105 a 120 cm','4 a 6 años'],[133,'20"','115 a 135 cm','6 a 9 años'],[148,'24"','130 a 150 cm','9 a 12 años'],[999,'26" o talla XS de adulto','más de 145 cm','desde 11 años']];
    if(h<85){ out.innerHTML = `<div class="card tres"><div class="big">Bici de equilibrio</div><p>Con menos de 85 cm, lo mejor es una bici de equilibrio (sin pedales): aprende a equilibrarse empujándose con los pies, y después pasa directo a pedalear, a menudo sin rueditas.</p></div>`; return; }
    const r = T.find(t=>h<t[0]);
    out.innerHTML = `<div class="card tres">
      <div class="lbl">Aro recomendado</div><div class="big">${r[1]}</div>
      <p class="src">Suele servir para estaturas de ${r[2]} (${r[3]}).${age && (age<2||age>14)?' La edad es solo referencia: manda la estatura.':''}</p>
      <h3>Al probarla</h3>
      <ul class="tips"><li>Sentado en el sillín, debe tocar el suelo con la punta de ambos pies.</li><li>Debe alcanzar las manetas de freno y apretarlas con fuerza.</li><li>No compres una bici “para que le dure”: una bici grande es difícil de controlar y frenar.</li></ul>
      ${r[1]==='16"'?`<div class="row"><button class="btn ghost" data-model-see="ninos">Ver la bici infantil de 16" en 3D</button></div>`:''}</div>`;
  } else {
    const typ = document.getElementById('tType').value, inRaw = +document.getElementById('tI').value;
    const inseam = inRaw || h*0.45, est = !inRaw;
    const saddle = inseam*0.883;
    let size='', extra='', notes=[];
    const L = h<155?['XS','13–14"']:h<165?['S','15–16"']:h<175?['M','17–18"']:h<185?['L','19–20"']:h<195?['XL','21–22"']:['XXL','23"'];
    if(typ==='mtb'||typ==='electrica'){
      size = `${L[0]} <small>(${L[1]})</small>`;
      extra = `Rueda recomendada: <b>${h<160?'27,5"':'29"'}</b>${h<160?' (más fácil de manejar en estaturas bajas)':''}.`;
      if(typ==='electrica') notes.push('Las e-bikes pesan 20–25 kg: pruébala también levantándola y empujándola a pie.');
    } else if(typ==='ruta'){
      const cm = inRaw ? Math.round(inseam*0.665) : (h<160?49:h<167?51:h<175?53:h<183?55:h<190?57:59);
      const lt = cm<50?'XS':cm<52?'S':cm<55?'M':cm<57?'L':'XL';
      size = `${lt} <small>(${cm} cm)</small>`;
      extra = 'En ruta, el largo del cuadro también importa: debes llegar a las manetas con los codos un poco flectados.';
    } else if(typ==='urbana'){
      size = `${L[0]}`;
      extra = 'Con cuadro bajo, la talla es menos crítica: lo importante es la altura del sillín y alcanzar cómodo el manubrio.';
    } else if(typ==='plegable'){
      size = 'Talla única';
      extra = 'Las plegables se ajustan con la tija y el poste del manubrio. La mayoría sirve para estaturas de unos 150 a 190 cm: revisa el largo de la tija.';
    } else if(typ==='bmx'){
      const tt = h<140?'18–19"':h<165?'19,5–20,25"':h<180?'20,5–20,75"':'21" o más';
      size = `Tubo superior ${tt}`;
      extra = 'En BMX la talla se mide por el largo del tubo superior. El sillín va bajo: se anda de pie.';
    }
    out.innerHTML = `<div class="card tres">
      <div class="lbl">Talla de cuadro</div><div class="big">${size}</div>
      <p style="margin:6px 0 0">${extra}</p>
      ${typ!=='bmx'?`<div class="lbl" style="margin-top:14px">Altura del sillín</div><div class="big">${fmt1(saddle)} cm</div>
      <p class="src">Desde el centro del eje pedalier hasta la parte de arriba del sillín, siguiendo el tubo.${est?` Calculada con una entrepierna estimada de ${fmt1(inseam)} cm: mídela para un valor más exacto.`:''}</p>
      <h3>Comprueba en la bici</h3>
      <ul class="tips"><li>Con el talón sobre el pedal en su punto más bajo, la pierna debe quedar recta.</li><li>Al pedalear con la planta, la rodilla queda apenas flectada.</li><li>De pie sobre el suelo, debe quedar algo de espacio entre tú y el tubo superior.</li></ul>`:''}
      ${notes.map(n=>`<div class="warn">${n}</div>`).join('')}
      <div class="row"><button class="btn ghost" data-model-see="${typ}">Ver esta bici en 3D</button></div></div>`;
  }
  out.querySelectorAll('[data-model-see]').forEach(b=>b.onclick=()=>{ setModel(b.dataset.modelSee); showTab('partes'); });
}

/* ---- Juego ---- */
const paneJ = document.getElementById('pane-juego');
const GREEN = new THREE.Color(0x16a34a), RED = new THREE.Color(0xdc2626);
let game = null, gMode = 'cual';
const bestKey = m => `bici3d-best-${m}`;
const getBest = m => { try{ return +localStorage.getItem(bestKey(m))||0; }catch(e){ return 0; } };
const setBest = (m,v) => { try{ localStorage.setItem(bestKey(m),v); }catch(e){} };
function renderJuegoIntro(){
  game = null; hlMap = null; paint();
  const best = getBest(gMode);
  paneJ.innerHTML = `<h2>Juego: ¿conoces la bici?</h2>
    <p class="lead">10 preguntas sobre las piezas de la bici que estás viendo. Cambia de modelo para jugar con otra.</p>
    <div class="seg seg-in" id="gModes"><button data-gm="cual" class="${gMode==='cual'?'on':''}">¿Qué pieza es?</button><button data-gm="busca" class="${gMode==='busca'?'on':''}">Encuentra la pieza</button></div>
    <p class="src" style="margin-top:8px">${gMode==='cual'?'Te marco una pieza en naranja y eliges su nombre.':'Te digo un nombre y tú la tocas en el modelo 3D.'}</p>
    <div class="row" style="margin-top:14px"><button class="btn" id="gStart">Empezar</button>${best?`<span class="src">Tu mejor puntaje: ${best}/10</span>`:''}</div>`;
  paneJ.querySelectorAll('[data-gm]').forEach(b=>b.onclick=()=>{ gMode=b.dataset.gm; renderJuegoIntro(); });
  document.getElementById('gStart').onclick = startGame;
}
function shuffle(a){ a=[...a]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function startGame(){
  const parts = modelParts().filter(id=> gMode==='cual' || id!=='tensores');
  let list = shuffle(parts); while(list.length<10) list = list.concat(shuffle(parts));
  game = {mode:gMode, list:list.slice(0,10), i:0, score:0, locked:false, active:true};
  selected = null; renderParts();
  nextQ();
}
function nextQ(){
  if(!game) return;
  if(game.i>=game.list.length) return endGame();
  game.locked = false;
  const cur = game.list[game.i]; game.cur = cur;
  const head = `<div class="gbar"><span>Pregunta ${game.i+1}/10</span><span>Puntaje ${game.score}</span></div><div class="gprog"><i style="width:${game.i*10}%"></i></div>`;
  if(game.mode==='cual'){
    hlMap = {[cur]:{c:ACCENT,k:0.75}}; paint(); focusPart(cur);
    const others = shuffle(modelParts().filter(p=>p!==cur)).slice(0,3);
    const opts4 = shuffle([cur,...others]);
    paneJ.innerHTML = `${head}<h2 style="margin-top:14px">¿Cómo se llama la pieza marcada en naranja?</h2>
      <div class="gopts">${opts4.map(id=>`<button class="gopt" data-a="${id}">${esc(P(id).nombre)}</button>`).join('')}</div><div id="gFb"></div>
      <div class="row"><button class="btn ghost" id="gQuit">Terminar</button></div>`;
    paneJ.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>answerCual(b));
  } else {
    hlMap = null; paint();
    paneJ.innerHTML = `${head}<h2 style="margin-top:14px">Toca en el modelo:</h2><div class="gtarget">${esc(P(cur).nombre)}</div>
      <p class="src">Puedes girar y acercar la bici antes de tocar.</p><div id="gFb"></div>
      <div class="row"><button class="btn ghost" id="gSkip">Saltar</button><button class="btn ghost" id="gQuit">Terminar</button></div>`;
    document.getElementById('gSkip').onclick = ()=>{ if(game.locked) return; game.locked=true; feedback(false, `Era esta: ${P(cur).nombre}.`); hlMap={[cur]:{c:GREEN,k:0.7}}; paint(); focusPart(cur); setTimeout(()=>{ game&&(game.i++, nextQ()); },1400); };
  }
  document.getElementById('gQuit').onclick = renderJuegoIntro;
}
function feedback(ok, txt){
  const fb = document.getElementById('gFb'); if(!fb) return;
  fb.innerHTML = `<div class="gfb ${ok?'ok':'no'}">${ok?'¡Correcto!':'No es esa.'} ${esc(txt)}</div>`;
}
function answerCual(btn){
  if(!game || game.locked) return; game.locked = true;
  const ok = btn.dataset.a===game.cur;
  paneJ.querySelectorAll('[data-a]').forEach(b=>{ if(b.dataset.a===game.cur) b.classList.add('ok'); else if(b===btn) b.classList.add('no'); b.disabled=true; });
  if(ok) game.score++;
  hlMap = {[game.cur]:{c:ok?GREEN:RED,k:0.7}}; paint();
  feedback(ok, ok? P(game.cur).que.split('.')[0]+'.' : `Es: ${P(game.cur).nombre}.`);
  setTimeout(()=>{ if(game){ game.i++; nextQ(); } }, ok?1300:1900);
}
function gameClick(p){
  if(!game || game.locked || game.mode!=='busca' || !p) return;
  game.locked = true;
  const ok = p===game.cur;
  if(ok){ game.score++; hlMap={[p]:{c:GREEN,k:0.7}}; feedback(true, P(p).nombre+'.'); }
  else { hlMap={...(p?{[p]:{c:RED,k:0.6}}:{}), [game.cur]:{c:GREEN,k:0.7}}; feedback(false, `${p?`Tocaste: ${P(p).nombre}. `:''}La correcta está marcada en verde.`); focusPart(game.cur); }
  paint();
  setTimeout(()=>{ if(game){ game.i++; nextQ(); } }, ok?1100:2000);
}
function endGame(){
  const s = game.score, best = Math.max(getBest(game.mode), s); setBest(game.mode,best);
  game = null; hlMap = null; paint();
  const msg = s===10?'¡Perfecto! Conoces la bici de memoria.':s>=7?'¡Muy bien! Ya sabes casi todas las piezas.':s>=4?'Vas bien. Revisa la pestaña Partes y vuelve a intentarlo.':'Recién empiezas: mira las piezas en la pestaña Partes y vuelve a jugar.';
  paneJ.innerHTML = `<h2>Resultado</h2><div class="card tres"><div class="big">${s}/10</div><p>${msg}</p><p class="src">Mejor puntaje en este modo: ${best}/10</p></div>
    <div class="row"><button class="btn" id="gAgain">Jugar de nuevo</button><button class="btn ghost" id="gBack">Cambiar modo</button></div>`;
  document.getElementById('gAgain').onclick = startGame;
  document.getElementById('gBack').onclick = renderJuegoIntro;
}

/* ---- Cambiar de modelo ---- */
const seg = document.getElementById('modelSeg'), trainT = document.getElementById('trainT'), trainChk = document.getElementById('trainChk');
const foldT = document.getElementById('foldT'), foldChk = document.getElementById('foldChk');
function setModel(id,{keepCam=false}={}){
  if(game) renderJuegoIntro();
  buildBike(id,{keepCam});
  selected = null; hovered = null; hlMap = null; paint();
  seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.model===id));
  trainT.classList.toggle('show', id==='ninos');
  foldT.classList.toggle('show', id==='plegable');
  renderParts(); renderFunciona(); renderGearUI(); renderQuick(); renderDiag(); renderGuides();
  if(document.querySelector('#pane-juego.on')) renderJuegoIntro();
  ansEl.innerHTML = ''; diagAns.innerHTML = '';
  if(searchIn.value) renderSearch();
}
seg.querySelectorAll('button').forEach(b=>b.onclick=()=>{ if(b.dataset.model!==M.id) setModel(b.dataset.model); });
trainChk.onchange = ()=>{ opts.rueditas = trainChk.checked; setModel('ninos',{keepCam:true}); };
foldChk.onchange = ()=>{ opts.plegada = foldChk.checked; if(fold) fold.goal = opts.plegada?1:0; };
setModel('mtb');
renderTallaForm();
renderJuegoIntro();
