// Three.js is deliberately a view over walk.ts. It never owns positions,
// collision, proximity, or interaction; those remain in the deterministic 2D sim.
import * as THREE from "three";
import { S } from "../state";
import { MODS } from "../content";
import { cargoUsed } from "../derive";
import { wearTier } from "../systems/wear";
import type { WalkActor, WalkDoor, WalkScene } from "./walk";

const SCALE = 0.02;
let renderer: THREE.WebGLRenderer | null = null;
let root: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let current: WalkScene | null = null;
let host: HTMLElement | null = null;
let fallbackCanvas: HTMLCanvasElement | null = null;
let world = new THREE.Group();
let avatar = new THREE.Group();
let actorMeshes = new Map<string, THREE.Group>();
let flashlight: THREE.SpotLight | null = null;
let signature = "";
let resizeObserver: ResizeObserver | null = null;
let clickHandler: ((e: PointerEvent) => void) | null = null;
let click: ((x: number, y: number) => void) | null = null;
const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const wx = (x: number) => (x - (current?.width || 0) / 2) * SCALE;
const wz = (y: number) => (y - (current?.height || 0) / 2) * SCALE;

function mat(color: THREE.ColorRepresentation, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .25, emissive: color, emissiveIntensity: emissive });
}
function box(w: number, h: number, d: number, material: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}
function sprite(text: string, color = "#d7e6ff", scale = 1): THREE.Sprite {
  const c = document.createElement("canvas"); c.width = 512; c.height = 96;
  const x = c.getContext("2d")!; x.font = "600 30px Consolas, monospace"; x.textAlign = "center";
  x.fillStyle = "rgba(5,8,15,.82)"; x.fillRect(0, 12, 512, 62); x.fillStyle = color; x.fillText(text, 256, 54);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(3.8 * scale, .72 * scale, 1); return s;
}
function disposeObject(o: THREE.Object3D) {
  o.traverse((n: any) => { n.geometry?.dispose?.(); const ms = Array.isArray(n.material) ? n.material : [n.material]; ms.forEach((m: any) => { m?.map?.dispose?.(); m?.dispose?.(); }); });
}
function addPerson(color: string, skin = "#bd8668"): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.22, .62, 4, 8), mat(color)); body.position.y = .72; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 8), mat(skin)); head.position.y = 1.38; g.add(head);
  return g;
}
function addMachinery(g: THREE.Group, type: string, color: string, online: boolean, damaged: boolean, worn: boolean) {
  const base = mat(worn ? "#735f52" : damaged ? "#8c2727" : color, online ? .18 : 0);
  const add = (m: THREE.Object3D, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); g.add(m); };
  if (type === "weapons" || type === "armory") { add(new THREE.Mesh(new THREE.CylinderGeometry(.5,.65,.5,10), base),0,.3); add(box(.18,.18,1.5,base),0,.72,-.5); }
  else if (type === "shields") { add(new THREE.Mesh(new THREE.TorusGeometry(.65,.12,8,20),base),0,.85); }
  else if (type === "hydro") { for(let i=-1;i<=1;i++) add(box(1.5,.12,.35,mat(online?"#42c96b":"#465448",online?.25:0)),0,.3+i*.38,i*.4); }
  else if (type === "cargohold") { const n=Math.max(2,Math.min(8,Math.ceil(cargoUsed()/8))); for(let i=0;i<n;i++) add(box(.5,.45,.5,base),(i%3-.9)*.55,.25+Math.floor(i/3)*.45,(i%2)*.55); }
  else if (type === "reactor" || type === "engine") { add(new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,1.5,14),base),0,.85); }
  else if (type === "medbay") { add(box(1.5,.35,.7,base),0,.3); add(box(.12,.52,.12,mat("#71d98a",online?.5:0)),0,.9); add(box(.52,.12,.12,mat("#71d98a",online?.5:0)),0,.9); }
  else if (type === "quarters") { add(box(1.55,.25,.65,base),0,.3); add(box(1.55,.25,.65,base),0,.85); }
  else if (type === "fuel") { add(new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,1.25,10),base),-.45,.65); add(new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,1.25,10),base),.45,.65); }
  else { add(box(1.5,.65,.75,base),0,.4); }
  if (damaged) for(let i=0;i<5;i++){ const spark=new THREE.Mesh(new THREE.SphereGeometry(.025,4,3),mat("#ff6b3d",1)); spark.position.set((i-2)*.13,1+i*.08,0); spark.userData.spark=i; g.add(spark); }
}

function rebuild() {
  if (!root || !current) return;
  root.remove(world); disposeObject(world); world = new THREE.Group(); root.add(world); actorMeshes.clear();
  const dark = !!current.dark;
  for (const f of current.floors) { const m=box(f.w*SCALE,.12,f.h*SCALE,mat(dark?"#151923":"#222b3b")); m.position.set(wx(f.x+f.w/2),-.08,wz(f.y+f.h/2)); world.add(m); }
  for (const r of current.rooms) {
    const c=r.color|| (dark?"#465064":"#5a83b7"), cx=wx(r.x+r.w/2), cz=wz(r.y+r.h/2), w=r.w*SCALE,d=r.h*SCALE;
    const wallMat=mat(dark?"#242a35":"#39485d");
    [[w,.18,cx,cz-d/2],[w,.18,cx,cz+d/2],[.18,d,cx-w/2,cz],[.18,d,cx+w/2,cz]].forEach(([a,b,x,z])=>{const q=box(a as number,1.1,b as number,wallMat);q.position.set(x as number,.5,z as number);world.add(q);});
    const trim=box(Math.max(.5,w-.3),.04,.05,mat(c,.8)); trim.position.set(cx,.04,cz-d/2+.12); world.add(trim);
    const label=sprite(`${r.icon||""} ${r.label}`.trim(),c,.75); label.position.set(cx,1.75,cz); world.add(label);
    if(r.kind==="cockpit"){
      const glass=box(Math.max(1,w*.7),1.15,.04,mat("#071323",.15));glass.position.set(cx,.78,cz-d/2+.1);world.add(glass);
      const stars=new THREE.BufferGeometry(),pts:number[]=[];for(let i=0;i<45;i++)pts.push(cx-w*.3+((i*37)%97)/97*w*.6,.35+((i*53)%83)/83,.01+cz-d/2);
      stars.setAttribute("position",new THREE.Float32BufferAttribute(pts,3));const field=new THREE.Points(stars,new THREE.PointsMaterial({color:0xd8e8ff,size:.025}));field.userData.starfield=true;world.add(field);
    }
    if(r.moduleType){const g=new THREE.Group(),m=S.modules[r.moduleIndex!]; addMachinery(g,r.moduleType,c,!m?.dmg&&(m?.on!==false),!!m?.dmg,m?wearTier(m)!=="sound":false);g.position.set(cx,0,cz);world.add(g);}
    const light=new THREE.PointLight(c,dark ? .25 : .55,5);light.position.set(cx,1.8,cz);world.add(light);
  }
  for (const d of current.doors) { const g=box(Math.max(.4,d.w*SCALE),.04,Math.max(.28,d.h*SCALE),mat(d.locked?"#8a3030":"#3d91df",d.locked?.15:.8));g.position.set(wx(d.x+d.w/2),.04,wz(d.y+d.h/2));world.add(g);const l=sprite(d.label,d.locked?"#d77":"#9fd7ff",.55);l.position.set(g.position.x,.75,g.position.z);world.add(l); }
  for (const a of current.actors) { const g=addPerson(a.color||"#d9a55b"); const l=sprite(a.label,a.color||"#d9a55b",.55);l.position.y=1.9;g.add(l);world.add(g);actorMeshes.set(a.key,g); }
}

export function mount(container: HTMLElement | null, s: WalkScene, onFloorClick: (x:number,y:number)=>void) {
  teardown(); host=container; current=s; click=onFloorClick; fallbackCanvas=container?.querySelector("canvas")||null;
  if(!container) return;
  try {
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.domElement.className="walk3d-canvas"; container.insertBefore(renderer.domElement,container.firstChild); if(fallbackCanvas) fallbackCanvas.style.display="none";
    root=new THREE.Scene(); root.background=new THREE.Color(s.dark?0x05070b:0x070b14); root.fog=new THREE.Fog(root.background,8,22); root.add(new THREE.HemisphereLight(s.dark?0x7384a0:0xa9c9ff,0x090b10,s.dark ? .35 : .75));root.add(avatar);
    if(s.dark){flashlight=new THREE.SpotLight(0xc8dcff,3.2,7,Math.PI/5,.55,1.2);flashlight.target=new THREE.Object3D();root.add(flashlight,flashlight.target);}else flashlight=null;
    camera=new THREE.PerspectiveCamera(58,1,.1,100); signature=""; setScene(s); resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);resize();
    clickHandler=(e)=>{if(!renderer||!camera||!current||!click)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1));ray.setFromCamera(pointer,camera);const p=new THREE.Vector3();if(ray.ray.intersectPlane(ground,p))click(p.x/SCALE+current.width/2,p.z/SCALE+current.height/2);};renderer.domElement.addEventListener("pointerdown",clickHandler);
  } catch { teardown(); if(fallbackCanvas) fallbackCanvas.style.display="block"; }
}
function resize(){if(!renderer||!camera||!host)return;const r=host.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix();}
export function setScene(s: WalkScene){current=s;const sig=s.id+"|"+s.rooms.map(r=>`${r.id}:${r.moduleType}:${r.moduleIndex}`).join()+"|"+s.doors.map(d=>d.label+d.locked).join()+"|"+s.actors.map(a=>a.key).join()+"|"+S.modules.map(m=>`${m.t}${m.on}${m.dmg}${wearTier(m)}`).join();if(sig!==signature){signature=sig;rebuild();}}
export function render(v:{pos:{x:number;y:number};facing:string;moving:boolean;phase:number;nearDoor:WalkDoor|null;nearActor:WalkActor|null;time:number}){
  if(!renderer||!root||!camera||!current)return; const x=wx(v.pos.x),z=wz(v.pos.y);avatar.position.set(x,v.moving?Math.abs(Math.sin(v.phase))*.06:0,z);
  const suit=S.appearance?.suit||"#4779bd",skin=S.appearance?.skin||"#bd8668"; if(!avatar.children.length){const p=addPerson(suit,skin);avatar.add(p);}
  const ang=v.facing==="right"?Math.PI/2:v.facing==="left"?-Math.PI/2:v.facing==="up"?Math.PI:0;avatar.rotation.y=ang;
  const room=current.rooms.find(r=>v.pos.x>=r.x&&v.pos.x<=r.x+r.w&&v.pos.y>=r.y&&v.pos.y<=r.y+r.h);const shake=room?.kind==="engine"?Math.sin(v.time*.045)*.025:0;
  const back=new THREE.Vector3(Math.sin(ang)*-3.4+shake,3.3,Math.cos(ang)*-3.4);const target=new THREE.Vector3(x,0,z).add(back);camera.position.lerp(target,.09);camera.lookAt(x,.75,z);
  if(flashlight){flashlight.position.set(x,1.25,z);flashlight.target.position.set(x+Math.sin(ang)*4,.45,z+Math.cos(ang)*4);}
  for(const a of current.actors){const g=actorMeshes.get(a.key);if(!g)continue;g.position.set(wx(a.x+a.w/2),Math.sin(v.time/700+a.x)*.025,wz(a.y+a.h/2));if(a.bubble&&!g.getObjectByName("bubble")){const b=sprite(a.bubble,"#fff",.65);b.name="bubble";b.position.y=2.55;g.add(b);}else if(!a.bubble){const b=g.getObjectByName("bubble");if(b){g.remove(b);disposeObject(b);}}}
  world.traverse((o:any)=>{if(o.userData.spark!==undefined){o.visible=Math.sin(v.time*.025+o.userData.spark)>0;o.position.y=1+(o.userData.spark*.12+v.time*.0004)%1;}if(o.userData.starfield&&S.travel)o.rotation.y=v.time*.00002;});renderer.render(root,camera);
}
export function teardown(){resizeObserver?.disconnect();resizeObserver=null;if(renderer&&clickHandler)renderer.domElement.removeEventListener("pointerdown",clickHandler);clickHandler=null;if(root)disposeObject(root);renderer?.dispose();renderer?.domElement.remove();if(fallbackCanvas)fallbackCanvas.style.display="block";renderer=null;root=null;camera=null;flashlight=null;current=null;host=null;fallbackCanvas=null;signature="";world=new THREE.Group();avatar=new THREE.Group();actorMeshes.clear();}
