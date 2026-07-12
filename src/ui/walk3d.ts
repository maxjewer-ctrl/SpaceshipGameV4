// Three.js is deliberately a view over walk.ts. It never owns positions,
// collision, proximity, or interaction; those remain in the deterministic 2D sim.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { S } from "../state";
import { MODS } from "../content";
import { cargoUsed } from "../derive";
import { wearTier } from "../systems/wear";
import type { WalkActor, WalkDoor, WalkScene } from "./walk";
import bulkheadWallUrl from "../assets/ship/bulkhead-wall.png";
import engineCoreUrl from "../assets/ship/engine-core.png";
import cargoWallUrl from "../assets/ship/cargo-wall.png";
import medbayWallUrl from "../assets/ship/medbay-wall.png";

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
let composer: EffectComposer | null = null;
let bloomPass: UnrealBloomPass | null = null;
let crtPass: ShaderPass | null = null;
let signature = "";

// One-pass CRT finish: subtle chromatic aberration, curved-tube scanlines,
// radial vignette, and animated film grain. Runs after UnrealBloom in the
// composer chain, before OutputPass tone-maps to sRGB. Kept gentle — this is
// atmosphere, not a filter you fight to read gameplay through.
const CRT_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    vignette: { value: 0.75 },
    grain: { value: 0.028 },
    aberration: { value: 0.0016 },
    scanline: { value: 0.04 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 resolution; uniform float time;
    uniform float vignette; uniform float grain; uniform float aberration; uniform float scanline;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    void main(){
      vec2 center = vUv - 0.5;
      float dist = length(center);
      vec2 shift = center * dist * aberration;
      float r = texture2D(tDiffuse, vUv + shift).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - shift).b;
      vec3 col = vec3(r, g, b);
      float sl = sin(vUv.y * resolution.y * 1.4) * 0.5 + 0.5;
      col *= 1.0 - scanline * (1.0 - sl);
      float vig = smoothstep(0.85, 0.15, dist);
      col *= mix(1.0, vig, vignette);
      float n = hash(vUv * resolution + time);
      col += (n - 0.5) * grain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};
let resizeObserver: ResizeObserver | null = null;
let clickHandler: ((e: PointerEvent) => void) | null = null;
let click: ((x: number, y: number) => void) | null = null;
const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// Right-stick camera orbit (fed by ui/walk.ts's gamepad poll). Base chase
// offset is (3.8, 4.7, 5.4) — camYaw/camPitch are added on top of that so a
// controller with no input reproduces the original fixed chase view exactly.
const CAM_BASE_DIST = Math.hypot(3.8, 5.4);
const CAM_BASE_ANGLE = Math.atan2(5.4, 3.8);
const CAM_BASE_HEIGHT = 4.7;
const CAM_PITCH_MIN = -3, CAM_PITCH_MAX = 3;
let camYaw = 0;
let camPitch = 0;

export function nudgeCamera(rx: number, ry: number, dt: number) {
  camYaw -= rx * 2.2 * dt;
  camPitch = Math.max(CAM_PITCH_MIN, Math.min(CAM_PITCH_MAX, camPitch - ry * 3 * dt));
}

// Convert screen-relative movement into deck/world axes. This keeps controls
// intuitive after orbiting the chase camera: up is always away from the camera
// (toward the top of the screen), and left/right remain screen-left/right.
export function cameraRelativeMovement(screenX: number, screenY: number) {
  const a = CAM_BASE_ANGLE + camYaw;
  return {
    x: -Math.sin(a) * screenX + Math.cos(a) * screenY,
    y:  Math.cos(a) * screenX + Math.sin(a) * screenY,
  };
}

const wx = (x: number) => (x - (current?.width || 0) / 2) * SCALE;
const wz = (y: number) => (y - (current?.height || 0) / 2) * SCALE;

// Civilian wardrobe + skin tones for actors without an explicit roster colour.
const WARDROBE = ["#3a4a63", "#4f3a55", "#54402e", "#2f5240", "#5a3333", "#39505c", "#4a4436", "#333a52"];
const SKIN3D = ["#c9977a", "#a8714f", "#8a5a3c", "#e0b490", "#6d4a33", "#b98a68"];

function mat(color: THREE.ColorRepresentation, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .25, emissive: color, emissiveIntensity: emissive });
}
function panelTexture(url: string, repeatX = 2.2, repeatY = 1.5): THREE.Texture {
  const t=new THREE.TextureLoader().load(url);
  t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeatX,repeatY);return t;
}
function deckTexture(dark: boolean): THREE.CanvasTexture {
  const c=document.createElement("canvas");c.width=256;c.height=256;const x=c.getContext("2d")!;
  x.fillStyle=dark?"#131923":"#26354a";x.fillRect(0,0,256,256);x.strokeStyle=dark?"#303b4c":"#57708c";x.lineWidth=3;
  for(let i=0;i<=256;i+=32){x.beginPath();x.moveTo(i,0);x.lineTo(i,256);x.stroke();x.beginPath();x.moveTo(0,i);x.lineTo(256,i);x.stroke();}
  x.strokeStyle=dark?"#222b38":"#3d526a";for(let i=0;i<256;i+=64)x.strokeRect(i+5,i%128+5,54,22);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(8,5);return t;
}
function box(w: number, h: number, d: number, material: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}
function sprite(text: string, color = "#d7e6ff", scale = 1): THREE.Sprite {
  const c = document.createElement("canvas"); c.width = 512; c.height = 96;
  const x = c.getContext("2d")!; x.font = "600 30px Consolas, monospace"; x.textAlign = "center";
  x.fillStyle = "rgba(5,8,15,.82)"; x.fillRect(0, 12, 512, 62); x.fillStyle = color; x.fillText(text, 256, 54);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  // toneMapped:false — labels are HUD, not scene; ACES would crush them to grey
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.set(3.8 * scale, .72 * scale, 1); return s;
}
function disposeObject(o: THREE.Object3D) {
  o.traverse((n: any) => { n.geometry?.dispose?.(); const ms = Array.isArray(n.material) ? n.material : [n.material]; ms.forEach((m: any) => { m?.map?.dispose?.(); m?.dispose?.(); }); });
}
// Low-poly spacer: legs, torso, arms, head with a visor band, and an emissive
// chest stripe in the trim colour. Shared by the captain (appearance colours)
// and every actor (their roster colour), so crowds read as people, not pills.
function addPerson(color: string, skin = "#bd8668", trim = "#9fb6d4"): THREE.Group {
  const g = new THREE.Group();
  // slight self-glow so dark suits don't vanish into dark deck plating
  const suitM = mat(color, .14), skinM = mat(skin, .08);
  const legG = new THREE.CapsuleGeometry(.09, .3, 3, 6);
  const l1 = new THREE.Mesh(legG, suitM); l1.position.set(-.12, .34, 0); g.add(l1);
  const l2 = new THREE.Mesh(legG, suitM); l2.position.set(.12, .34, 0); g.add(l2);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.23, .42, 4, 10), suitM);
  torso.position.y = .92; torso.scale.set(1, .95, .72); g.add(torso);
  const armG = new THREE.CapsuleGeometry(.065, .34, 3, 6);
  const a1 = new THREE.Mesh(armG, suitM); a1.position.set(-.3, .92, 0); a1.rotation.z = .14; g.add(a1);
  const a2 = new THREE.Mesh(armG, suitM); a2.position.set(.3, .92, 0); a2.rotation.z = -.14; g.add(a2);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(.26, .045, .03), mat(trim, .85));
  stripe.position.set(0, 1.06, .155); g.add(stripe);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(.34, .05, .2), mat("#141821", .05));
  belt.position.y = .64; g.add(belt);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 10), skinM); head.position.y = 1.4; g.add(head);
  const band = new THREE.Mesh(new THREE.BoxGeometry(.2, .055, .05), mat("#0c1018", .25));
  band.position.set(0, 1.43, .12); g.add(band);
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
  const roomTextures: Record<string, THREE.Texture> = {
    general: panelTexture(bulkheadWallUrl),
    engine: panelTexture(engineCoreUrl, 1, 1),
    cargo: panelTexture(cargoWallUrl, 1.5, 1.15),
    medbay: panelTexture(medbayWallUrl, 1.5, 1.15),
  };
  const deck=deckTexture(dark);
  if(current.id==="ship"){const hullMat=mat("#111b29");hullMat.emissiveIntensity=.08;const hull=box(current.width*SCALE,.08,current.height*SCALE,hullMat);hull.position.set(0,-.18,0);world.add(hull);}
  for (const f of current.floors) { const fm=mat(dark?"#252e3e":"#466080",dark?.05:.16);fm.map=deck;const m=box(f.w*SCALE,.12,f.h*SCALE,fm); m.position.set(wx(f.x+f.w/2),-.08,wz(f.y+f.h/2)); world.add(m); }
  for (const r of current.rooms) {
    const c=r.color|| (dark?"#465064":"#5a83b7"), cx=wx(r.x+r.w/2), cz=wz(r.y+r.h/2), w=r.w*SCALE,d=r.h*SCALE;
    const wallKind = r.kind === "engine" || r.moduleType === "reactor" ? "engine"
      : r.kind === "cargo" || r.moduleType === "cargohold" ? "cargo"
      : r.kind === "medbay" || r.moduleType === "medbay" ? "medbay" : "general";
    const wallMat=mat(dark?"#343d4d":"#7089a4",dark?.04:.12);wallMat.map=roomTextures[wallKind];wallMat.transparent=true;wallMat.opacity=dark?.58:.76;wallMat.depthWrite=false;
    [[w,.18,cx,cz-d/2],[w,.18,cx,cz+d/2],[.18,d,cx-w/2,cz],[.18,d,cx+w/2,cz]].forEach(([a,b,x,z])=>{const q=box(a as number,1.85,b as number,wallMat);q.position.set(x as number,.88,z as number);world.add(q);});
    // Tall illuminated corner pylons make room boundaries readable even when
    // the follow camera is looking across several bays.
    for(const [px,pz] of [[cx-w/2,cz-d/2],[cx+w/2,cz-d/2],[cx-w/2,cz+d/2],[cx+w/2,cz+d/2]]){const p=box(.16,2.45,.16,mat(c,.32));p.position.set(px,1.18,pz);world.add(p);}
    const trim=box(Math.max(.5,w-.3),.04,.05,mat(c,.45)); trim.position.set(cx,.04,cz-d/2+.12); world.add(trim);
    const label=sprite(`${r.icon||""} ${r.label}`.trim(),c,.62); label.position.set(cx,2.72,cz); world.add(label);
    if(r.kind==="cockpit"){
      const glass=box(Math.max(1,w*.7),1.15,.04,mat("#071323",.15));glass.position.set(cx,.78,cz-d/2+.1);world.add(glass);
      const stars=new THREE.BufferGeometry(),pts:number[]=[];for(let i=0;i<45;i++)pts.push(cx-w*.3+((i*37)%97)/97*w*.6,.35+((i*53)%83)/83,.01+cz-d/2);
      stars.setAttribute("position",new THREE.Float32BufferAttribute(pts,3));const field=new THREE.Points(stars,new THREE.PointsMaterial({color:0xd8e8ff,size:.025}));field.userData.starfield=true;world.add(field);
    }
    if(r.moduleType){const g=new THREE.Group(),m=S.modules[r.moduleIndex!]; addMachinery(g,r.moduleType,c,!m?.dmg&&(m?.on!==false),!!m?.dmg,m?wearTier(m)!=="sound":false);g.position.set(cx,0,cz);world.add(g);}
    const light=new THREE.PointLight(c,dark ? .35 : .9,6.5);light.position.set(cx,2.6,cz);world.add(light);
  }
  for (const d of current.doors) { const g=box(Math.max(.4,d.w*SCALE),.04,Math.max(.28,d.h*SCALE),mat(d.locked?"#8a3030":"#3d91df",d.locked?.15:.8));g.position.set(wx(d.x+d.w/2),.04,wz(d.y+d.h/2));world.add(g);const l=sprite(d.label,d.locked?"#d77":"#9fd7ff",.55);l.position.set(g.position.x,.75,g.position.z);world.add(l); }
  for (const a of current.actors) {
    // No explicit roster colour → deal one from the wardrobe by key hash, so a
    // station concourse is a crowd of strangers instead of identical clones.
    let hv=0; for(let i=0;i<a.key.length;i++) hv=(hv*31+a.key.charCodeAt(i))|0; hv>>>=0;
    const suitC=a.color||WARDROBE[hv%WARDROBE.length], skinC=SKIN3D[(hv>>4)%SKIN3D.length];
    const g=addPerson(suitC,skinC,a.color?"#e8d9b0":"#8fa8c9");
    const l=sprite(a.label,a.color||"#c9d2e4",.55);l.position.y=1.9;g.add(l);world.add(g);actorMeshes.set(a.key,g);
  }
}

export function mount(container: HTMLElement | null, s: WalkScene, onFloorClick: (x:number,y:number)=>void) {
  teardown(); host=container; current=s; click=onFloorClick; fallbackCanvas=container?.querySelector("canvas")||null;
  if(!container) return;
  try {
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.domElement.className="walk3d-canvas"; container.insertBefore(renderer.domElement,container.firstChild); if(fallbackCanvas) fallbackCanvas.style.display="none";
    root=new THREE.Scene(); root.background=new THREE.Color(s.dark?0x05070b:0x0c1420); root.fog=new THREE.Fog(root.background,18,44); root.add(new THREE.HemisphereLight(s.dark?0x7384a0:0xbcdcff,0x1a2130,s.dark ? .6 : 1.7));root.add(new THREE.AmbientLight(s.dark?0x647087:0x91b8df,s.dark?.35:.9));root.add(avatar);
    if(s.dark){flashlight=new THREE.SpotLight(0xc8dcff,3.2,7,Math.PI/5,.55,1.2);flashlight.target=new THREE.Object3D();root.add(flashlight,flashlight.target);}else flashlight=null;
    camera=new THREE.PerspectiveCamera(58,1,.1,100);
    // Post-processing chain: bloom makes every emissive (drive core, LEDs,
    // module glows, the cockpit starfield) actually radiate, then the CRT pass
    // adds the tube finish. Guarded separately from the WebGL fallback above —
    // if only post-fx fails we keep plain 3D rather than dropping to 2D.
    try {
      renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.75;
      composer=new EffectComposer(renderer); composer.setPixelRatio(Math.min(devicePixelRatio,2));
      composer.addPass(new RenderPass(root,camera));
      bloomPass=new UnrealBloomPass(new THREE.Vector2(1,1), s.dark?0.75:0.5, 0.55, 0.32);
      composer.addPass(bloomPass);
      crtPass=new ShaderPass(CRT_SHADER); composer.addPass(crtPass);
      composer.addPass(new OutputPass());
    } catch { composer=null; bloomPass=null; crtPass=null; renderer.toneMapping=THREE.NoToneMapping; }
    signature=""; setScene(s); resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);resize();
    clickHandler=(e)=>{if(!renderer||!camera||!current||!click)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1));ray.setFromCamera(pointer,camera);const p=new THREE.Vector3();if(ray.ray.intersectPlane(ground,p))click(p.x/SCALE+current.width/2,p.z/SCALE+current.height/2);};renderer.domElement.addEventListener("pointerdown",clickHandler);
  } catch { teardown(); if(fallbackCanvas) fallbackCanvas.style.display="block"; }
}
function resize(){if(!renderer||!camera||!host)return;const r=host.getBoundingClientRect();const w=Math.max(1,r.width),h=Math.max(1,r.height);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();composer?.setSize(w,h);const pr=Math.min(devicePixelRatio,2);crtPass?.uniforms.resolution.value.set(w*pr,h*pr);}
export function setScene(s: WalkScene){current=s;const sig=s.id+"|"+s.rooms.map(r=>`${r.id}:${r.moduleType}:${r.moduleIndex}`).join()+"|"+s.doors.map(d=>d.label+d.locked).join()+"|"+s.actors.map(a=>a.key).join()+"|"+S.modules.map(m=>`${m.t}${m.on}${m.dmg}${wearTier(m)}`).join();if(sig!==signature){signature=sig;rebuild();}}
export function render(v:{pos:{x:number;y:number};facing:string;moving:boolean;phase:number;nearDoor:WalkDoor|null;nearActor:WalkActor|null;time:number}){
  if(!renderer||!root||!camera||!current)return; const x=wx(v.pos.x),z=wz(v.pos.y);avatar.position.set(x,v.moving?Math.abs(Math.sin(v.phase))*.06:0,z);
  const suit=S.appearance?.suit||"#4779bd",skin=S.appearance?.skin||"#bd8668",trim=S.appearance?.trim||"#e8b04b"; if(!avatar.children.length){const p=addPerson(suit,skin,trim);avatar.add(p);}
  const ang=v.facing==="right"?Math.PI/2:v.facing==="left"?-Math.PI/2:v.facing==="up"?Math.PI:0;avatar.rotation.y=ang;
  const room=current.rooms.find(r=>v.pos.x>=r.x&&v.pos.x<=r.x+r.w&&v.pos.y>=r.y&&v.pos.y<=r.y+r.h);const shake=room?.kind==="engine"?Math.sin(v.time*.045)*.025:0;
  // Stable chase angle: avatar rotation no longer whips the camera 180° when
  // the player taps up/down. Screen-up is always deck-forward, unless the
  // right stick has orbited the camera off its default heading (nudgeCamera).
  const camAngle=CAM_BASE_ANGLE+camYaw;
  const target=new THREE.Vector3(x+Math.cos(camAngle)*CAM_BASE_DIST+shake,CAM_BASE_HEIGHT+camPitch,z+Math.sin(camAngle)*CAM_BASE_DIST);camera.position.lerp(target,.09);camera.lookAt(x,.65,z);
  if(flashlight){flashlight.position.set(x,1.25,z);flashlight.target.position.set(x+Math.sin(ang)*4,.45,z+Math.cos(ang)*4);}
  for(const a of current.actors){const g=actorMeshes.get(a.key);if(!g)continue;g.position.set(wx(a.x+a.w/2),Math.sin(v.time/700+a.x)*.025,wz(a.y+a.h/2));if(a.bubble&&!g.getObjectByName("bubble")){const b=sprite(a.bubble,"#fff",.65);b.name="bubble";b.position.y=2.55;g.add(b);}else if(!a.bubble){const b=g.getObjectByName("bubble");if(b){g.remove(b);disposeObject(b);}}}
  world.traverse((o:any)=>{if(o.userData.spark!==undefined){o.visible=Math.sin(v.time*.025+o.userData.spark)>0;o.position.y=1+(o.userData.spark*.12+v.time*.0004)%1;}if(o.userData.starfield&&S.travel)o.rotation.y=v.time*.00002;});
  if(composer){if(crtPass)crtPass.uniforms.time.value=v.time*.001;composer.render();}else renderer.render(root,camera);
}
export function teardown(){resizeObserver?.disconnect();resizeObserver=null;if(renderer&&clickHandler)renderer.domElement.removeEventListener("pointerdown",clickHandler);clickHandler=null;if(root)disposeObject(root);composer?.dispose();bloomPass?.dispose();composer=null;bloomPass=null;crtPass=null;renderer?.dispose();renderer?.domElement.remove();if(fallbackCanvas)fallbackCanvas.style.display="block";renderer=null;root=null;camera=null;flashlight=null;current=null;host=null;fallbackCanvas=null;signature="";world=new THREE.Group();avatar=new THREE.Group();actorMeshes.clear();camYaw=0;camPitch=0;}
