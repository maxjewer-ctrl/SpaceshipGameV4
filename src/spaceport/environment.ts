// Hand-built (non-Meshy) set dressing: terrain, sky, landing pad, buildings,
// fencing, and lighting for the western-industrial frontier spaceport.
import * as THREE from "three";

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  draw(ctx);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function groundTexture(): THREE.CanvasTexture {
  const t = canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = "#7a5232";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const v = Math.random();
      ctx.fillStyle = v < 0.5 ? "rgba(40,24,12,0.10)" : "rgba(200,150,90,0.10)";
      ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    // a couple of soft worn patches, subtle enough not to tile into streaks
    ctx.fillStyle = "rgba(30,18,10,0.10)";
    for (let i = 0; i < 5; i++) {
      const x = 80 + Math.random() * 350, y = 80 + Math.random() * 350;
      ctx.beginPath();
      ctx.ellipse(x, y, 40 + Math.random() * 30, 20 + Math.random() * 15, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

function padTexture(): THREE.CanvasTexture {
  return canvasTexture(1024, 1024, (ctx) => {
    ctx.fillStyle = "#3a342c";
    ctx.fillRect(0, 0, 1024, 1024);
    ctx.strokeStyle = "#d8a63c";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(512, 512, 460, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(512, 512, 360, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(512, 512);
    ctx.strokeStyle = "rgba(216,166,60,0.55)";
    ctx.lineWidth = 14;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -300);
      ctx.lineTo(0, -420);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * 1024, y = Math.random() * 1024;
      ctx.fillRect(x, y, 2, 2);
    }
  });
}

function skyTexture(): THREE.CanvasTexture {
  return canvasTexture(16, 512, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, "#2a1a2e");
    grad.addColorStop(0.35, "#7a4a3a");
    grad.addColorStop(0.62, "#d89058");
    grad.addColorStop(0.8, "#f0c080");
    grad.addColorStop(1, "#c8905a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 512);
  });
}

function plankTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#6b4a30";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "rgba(30,16,8,0.4)";
    ctx.lineWidth = 3;
    for (let x = 0; x < 256; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
    }
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = `rgba(20,10,5,${Math.random() * 0.15})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

function corrugatedTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#8a6448";
    ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 12) {
      ctx.fillStyle = x % 24 === 0 ? "rgba(255,220,180,0.12)" : "rgba(30,15,5,0.15)";
      ctx.fillRect(x, 0, 6, 256);
    }
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(200,90,40,${Math.random() * 0.12})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 2);
  return t;
}

export function buildGround(): THREE.Mesh {
  const geo = new THREE.CircleGeometry(70, 64);
  const mat = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildLandingPad(): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(14, 14.4, 0.3, 48);
  const mat = new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.75, metalness: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.15;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

export function buildSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(200, 24, 16);
  const mat = new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false });
  return new THREE.Mesh(geo, mat);
}

export function buildDistantMoon(): THREE.Group {
  const g = new THREE.Group();
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(14, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xc9a876, roughness: 1, emissive: 0x3a2410, emissiveIntensity: 0.4 })
  );
  moon.position.set(-90, 55, -140);
  g.add(moon);
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(6, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff0c8, fog: false })
  );
  sun.position.set(70, 40, -150);
  g.add(sun);
  return g;
}

function building(w: number, h: number, d: number, roofColor: number): THREE.Group {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ map: corrugatedTexture(), roughness: 0.9, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6),
    new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.7, metalness: 0.4 })
  );
  roof.position.y = h + 0.2;
  roof.castShadow = true;
  g.add(roof);

  return g;
}

export function buildHangar(): THREE.Group {
  const g = building(14, 7, 10, 0x3a3028);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x2a221a, roughness: 0.8 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(6, 5.5, 0.3), doorMat);
  door.position.set(0, 2.75, 5.05);
  g.add(door);
  return g;
}

export function buildControlTower(): THREE.Group {
  const g = new THREE.Group();
  const plankMat = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.85 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 9, 3.4), plankMat);
  base.position.y = 4.5;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 2.6, 4.4),
    new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.6, metalness: 0.3 })
  );
  cabin.position.y = 10.3;
  cabin.castShadow = true;
  g.add(cabin);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 1.1, 4.5),
    new THREE.MeshStandardMaterial({ color: 0x88c8e0, emissive: 0x224455, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.6, transparent: true, opacity: 0.85 })
  );
  glass.position.y = 10.1;
  g.add(glass);
  return g;
}

export function buildCantina(): THREE.Group {
  const g = building(9, 4.2, 7, 0x5a2f24);
  const plankMat = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.9 });
  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 2.6), plankMat);
  porchRoof.position.set(0, 3.2, 4.6);
  porchRoof.castShadow = true;
  g.add(porchRoof);
  for (const px of [-4.4, 4.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.2, 8), plankMat);
    post.position.set(px, 1.6, 5.7);
    post.castShadow = true;
    g.add(post);
  }
  return g;
}

export function buildFencePerimeter(radius: number, count: number): THREE.Group {
  const g = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.9 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x5a4432, roughness: 0.85 });
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    // leave a gap facing the hangar/cantina cluster
    if (a > Math.PI * 0.55 && a < Math.PI * 1.05) continue;
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6), postMat);
    post.position.set(x, 0.7, z);
    post.castShadow = true;
    g.add(post);
    const next = ((i + 1) / count) * Math.PI * 2;
    if (next > Math.PI * 0.55 && next < Math.PI * 1.05) continue;
    const nx = Math.cos(next) * radius, nz = Math.sin(next) * radius;
    const mid = new THREE.Vector3((x + nx) / 2, 1.0, (z + nz) / 2);
    const len = Math.hypot(nx - x, nz - z);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), railMat);
    rail.position.copy(mid);
    rail.rotation.y = Math.atan2(nz - z, nx - x);
    g.add(rail);
  }
  return g;
}

export function setupLighting(scene: THREE.Scene): THREE.DirectionalLight {
  const sun = new THREE.DirectionalLight(0xffcf94, 2.4);
  sun.position.set(40, 45, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0015;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0xd8a878, 0x40301c, 0.8);
  scene.add(hemi);

  const fill = new THREE.AmbientLight(0x402818, 0.35);
  scene.add(fill);

  scene.fog = new THREE.FogExp2(0x8a5a3a, 0.012);
  return sun;
}

export function buildBeaconGlow(x: number, z: number): THREE.PointLight {
  const light = new THREE.PointLight(0xffa030, 6, 12, 2);
  light.position.set(x, 3.3, z);
  return light;
}
