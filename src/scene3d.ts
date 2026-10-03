import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { GradientEquirectTexture, WebGLPathTracer } from 'three-gpu-pathtracer';
import { store } from './state';
import type { Project, Wall } from './types';
import { box, buildItem, applyBoxUV } from './models';
import { FIXED, setMaxAnisotropy, slotMaterial } from './materials';
import { countertopRuns, floorPolygon, projectOnWall, wallDir, wallLength } from './geom';

const M = 0.01; // cm -> m

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
  private controls: OrbitControls;
  private walk: PointerLockControls;
  private composer: EffectComposer;
  private gtao: GTAOPass;
  private content = new THREE.Group();
  private sun = new THREE.DirectionalLight('#fff4e5', 3.2);
  private hemi = new THREE.HemisphereLight('#f4f7ff', '#8a7f72', 0.0);
  private selectionBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#ff7a1a'));
  private sky: GradientEquirectTexture;
  private pathTracer: WebGLPathTracer | null = null;
  private ptActive = false;
  private ptSceneDirty = false;
  private dirty = true;
  private keys = new Set<string>();
  private lastTime = performance.now();
  private resizeObserver: ResizeObserver;
  private firstBuild = true;
  onSamples?: (n: number) => void;
  onWalkChange?: (active: boolean) => void;

  constructor(private container: HTMLElement) {
    RectAreaLightUniformsLib.init();
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.AgXToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    this.renderer = r;
    setMaxAnisotropy(r.capabilities.getMaxAnisotropy());

    // Himmel als Umgebung (wird auch vom Pathtracer genutzt)
    this.sky = new GradientEquirectTexture(256);
    this.sky.topColor.set('#bcd3ee');
    this.sky.bottomColor.set('#e9e4da');
    this.sky.exponent = 0.6;
    this.sky.update();
    this.scene.background = this.sky;
    this.scene.environment = this.sky;
    this.scene.environmentIntensity = 1.0;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.scene.add(this.content);
    this.selectionBox.visible = false;
    this.scene.add(this.selectionBox);

    // Außengelände
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshPhysicalMaterial({ color: '#a7a296', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.camera.position.set(2.3, 3.2, 6.5);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(2.3, 1, 2);
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener('change', () => this.cameraChanged());

    this.walk = new PointerLockControls(this.camera, r.domElement);
    this.walk.addEventListener('lock', () => this.onWalkChange?.(true));
    this.walk.addEventListener('unlock', () => {
      this.controls.enabled = true;
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this.controls.target.copy(this.camera.position).addScaledVector(dir, 1.5);
      this.onWalkChange?.(false);
    });
    this.walk.addEventListener('change', () => this.cameraChanged());

    // Nachbearbeitung: Ambient Occlusion für Kontaktschatten
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
    this.gtao.blendIntensity = 0.9;
    this.gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
    this.composer.addPass(this.gtao);
    this.composer.addPass(new OutputPass());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.bindInput();
    this.build();
    store.subscribe(() => this.build());
    // nachgeladene Bilder: neu aufbauen (Seitenverhältnis ist erst jetzt bekannt)
    let reloadTimer = 0;
    document.addEventListener('kp-texture-loaded', () => {
      clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => this.build(), 50);
    });
    r.setAnimationLoop(() => this.frame());
  }

  // -------------------------------------------------------------------------

  private bindInput() {
    const el = this.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      if (!down || this.walk.isLocked) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 4) return;
      this.pick(e);
    });
    el.addEventListener('dblclick', (e) => {
      // Doppelklick: Kameraziel auf getroffenen Punkt setzen
      const hit = this.raycast(e);
      if (hit) {
        this.controls.target.copy(hit.point);
        this.cameraChanged();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (this.walk.isLocked) this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  private raycast(e: MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    return rc.intersectObject(this.content, true)[0];
  }

  /** Showroom: keine Auswahl, keine Auswahlrahmen */
  private showroomMode = false;
  setShowroom(on: boolean) {
    this.showroomMode = on;
    if (!on) this.setAutoRotate(false);
    this.updateSelection();
  }

  /** Automatischer Rundgang (Kamera kreist langsam um den Raum) */
  setAutoRotate(on: boolean) {
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = 0.5;
    if (on && this.walk.isLocked) this.walk.unlock();
    this.dirty = true;
  }

  get autoRotate() {
    return this.controls.autoRotate;
  }

  private pick(e: MouseEvent) {
    if (this.showroomMode) return;
    const hit = this.raycast(e);
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.itemId && !o.userData.wallId) o = o.parent;
    if (o?.userData.itemId) store.select({ kind: 'item', id: o.userData.itemId });
    else if (o?.userData.wallId) store.select({ kind: 'wall', id: o.userData.wallId });
    else store.select(null);
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
    this.gtao.setSize(w, h);
    this.cameraChanged();
  }

  private cameraChanged() {
    this.dirty = true;
    if (this.pathTracer && this.ptActive) this.pathTracer.updateCamera();
  }

  // -------------------------------------------------------------------------
  // Szene aus dem Projekt aufbauen

  build() {
    const p = store.project;
    this.content.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
    this.content.clear();

    const ceilingH = Math.max(2.5, ...p.walls.map((w) => w.height * M));

    for (const w of p.walls) this.content.add(this.buildWall(p, w));
    this.buildFloor(p, ceilingH);

    const runs = countertopRuns(p);
    for (const it of p.items) {
      const limit = this.backsplashLimit(p, it.wallId, it);
      const g = buildItem(it, { project: p, ceilingHeight: ceilingH, backsplashLimit: limit, run: runs.get(it.id) });
      g.position.set(it.x * M, it.elevation * M, it.y * M);
      g.rotation.y = -it.rotation;
      this.content.add(g);
    }

    this.updateSun(p);
    this.updateSelection();
    if (this.firstBuild && p.walls.length) {
      this.firstBuild = false;
      this.setView('perspective');
    }
    this.dirty = true;
    if (this.ptActive) this.ptSceneDirty = true;
  }

  private backsplashLimit(p: Project, wallId: string | undefined, it: { x: number; y: number; width: number }) {
    if (!wallId) return undefined;
    const w = p.walls.find((x) => x.id === wallId);
    if (!w) return undefined;
    const t = projectOnWall(w, it).t;
    let limit = Infinity;
    for (const o of p.openings) {
      if (o.wallId !== w.id || o.type !== 'window') continue;
      if (Math.abs(o.offset - t) < (o.width + it.width) / 2) limit = Math.min(limit, o.sill * M);
    }
    return limit === Infinity ? undefined : limit;
  }

  private buildWall(p: Project, w: Wall) {
    const g = new THREE.Group();
    g.userData.wallId = w.id;
    const L = wallLength(w) * M;
    const t = w.thickness * M;
    const H = w.height * M;
    const d = wallDir(w);
    const connected = (pt: { x: number; y: number }) =>
      p.walls.some((o) => o.id !== w.id && (Math.hypot(o.a.x - pt.x, o.a.y - pt.y) < 1 || Math.hypot(o.b.x - pt.x, o.b.y - pt.y) < 1));
    const extA = connected(w.a) ? t / 2 : 0;
    const extB = connected(w.b) ? t / 2 : 0;
    const mat = slotMaterial(p, 'wall', undefined, undefined, p.uv?.wall, { u0: -extA, u1: L + extB, v0: 0, v1: H });

    const ops = p.openings.filter((o) => o.wallId === w.id).sort((a, b) => a.offset - b.offset);
    const piece = (x0: number, x1: number, y0: number, y1: number) => {
      if (x1 - x0 < 0.001 || y1 - y0 < 0.001) return;
      const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, 0);
      const m = box(x1 - x0, y1 - y0, t, mat, 0, c);
      m.position.copy(c);
      g.add(m);
    };
    let x = -extA;
    for (const o of ops) {
      const o0 = Math.max(0, (o.offset - o.width / 2) * M);
      const o1 = Math.min(L, (o.offset + o.width / 2) * M);
      piece(x, o0, 0, H);
      piece(o0, o1, 0, o.sill * M);
      piece(o0, o1, (o.sill + o.height) * M, H);
      this.buildOpening(g, o.type, o0, o1, o.sill * M, (o.sill + o.height) * M, t);
      x = o1;
    }
    piece(x, L + extB, 0, H);

    g.position.set(w.a.x * M, 0, w.a.y * M);
    g.rotation.y = -Math.atan2(d.y, d.x);
    return g;
  }

  private buildOpening(g: THREE.Group, type: 'door' | 'window', x0: number, x1: number, y0: number, y1: number, t: number) {
    const fw = 0.06;
    const w = x1 - x0;
    const h = y1 - y0;
    const cx = (x0 + x1) / 2;
    const add = (m: THREE.Mesh, x: number, y: number, z: number) => {
      m.position.set(x, y, z);
      g.add(m);
    };
    if (type === 'window') {
      const fd = 0.07;
      const fm = FIXED.frameDark;
      add(box(w, fw, fd, fm), cx, y0 + fw / 2, 0);
      add(box(w, fw, fd, fm), cx, y1 - fw / 2, 0);
      add(box(fw, h, fd, fm), x0 + fw / 2, (y0 + y1) / 2, 0);
      add(box(fw, h, fd, fm), x1 - fw / 2, (y0 + y1) / 2, 0);
      if (w > 1.1) add(box(fw * 0.8, h - fw * 2, fd, fm), cx, (y0 + y1) / 2, 0);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w - fw * 2, h - fw * 2, 0.008), FIXED.glass);
      applyBoxUV(glass.geometry);
      add(glass, cx, (y0 + y1) / 2, 0);
      // Fensterbänke innen und außen
      if (y0 > 0.05) {
        for (const s of [-1, 1]) {
          const sill = box(w + 0.04, 0.025, t / 2 + 0.03, FIXED.frame, 0.002);
          add(sill, cx, y0 - 0.0125, s * (t / 4 + 0.015));
        }
      }
    } else {
      const zt = 0.02;
      const fm = FIXED.frame;
      add(box(zt, h, t + 0.02, fm), x0 + zt / 2, h / 2 + y0, 0);
      add(box(zt, h, t + 0.02, fm), x1 - zt / 2, h / 2 + y0, 0);
      add(box(w, zt, t + 0.02, fm), cx, y1 - zt / 2, 0);
      const leaf = box(w - zt * 2 - 0.004, h - zt - 0.01, 0.04, fm, 0.002);
      add(leaf, cx, y0 + (h - zt) / 2 + 0.005, 0);
      for (const s of [-1, 1]) {
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.13, 16), FIXED.chrome);
        handle.rotation.z = Math.PI / 2;
        handle.castShadow = true;
        add(handle, x1 - zt - 0.1, y0 + 1.05, s * 0.06);
      }
    }
  }

  private buildFloor(p: Project, ceilingH: number) {
    const poly = floorPolygon(p);
    if (poly.length < 3) return;
    const shapeFloor = new THREE.Shape(poly.map((v) => new THREE.Vector2(v.x * M, -v.y * M)));
    const xs = poly.map((v) => v.x * M);
    const ys = poly.map((v) => v.y * M);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    // ShapeGeometry-UVs = Formkoordinaten (x, −y) in Metern
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shapeFloor), slotMaterial(p, 'floor', undefined, undefined, p.uv?.floor, { u0: bx0, u1: bx1, v0: -by1, v1: -by0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.userData.floor = true;
    this.content.add(floor);

    if (p.settings.ceiling) {
      const shapeCeil = new THREE.Shape(poly.map((v) => new THREE.Vector2(v.x * M, v.y * M)));
      const ceil = new THREE.Mesh(new THREE.ShapeGeometry(shapeCeil), slotMaterial(p, 'ceiling', undefined, undefined, p.uv?.ceiling, { u0: bx0, u1: bx1, v0: by0, v1: by1 }));
      ceil.rotation.x = Math.PI / 2;
      ceil.position.y = ceilingH;
      ceil.castShadow = true;
      ceil.receiveShadow = true;
      this.content.add(ceil);

      // Deckenleuchten (Flächenlicht) im Raster
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const v of poly) {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
      }
      const nx = Math.max(1, Math.round((maxX - minX) / 200));
      const ny = Math.max(1, Math.round((maxY - minY) / 200));
      const lamps = p.settings.lampIntensity ?? 1;
      const panelMat = new THREE.MeshPhysicalMaterial({ color: '#fff', emissive: new THREE.Color('#fff3e2'), emissiveIntensity: 3 * lamps });
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++) {
          const x = (minX + ((i + 0.5) / nx) * (maxX - minX)) * M;
          const z = (minY + ((j + 0.5) / ny) * (maxY - minY)) * M;
          const light = new THREE.RectAreaLight('#fff1dc', 6 * lamps, 0.5, 0.5);
          light.position.set(x, ceilingH - 0.02, z);
          light.lookAt(x, 0, z);
          this.content.add(light);
          const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), panelMat);
          panel.rotation.x = Math.PI / 2;
          panel.position.set(x, ceilingH - 0.005, z);
          this.content.add(panel);
        }
    }
    this.hemi.intensity = p.settings.ceiling ? 0.35 : 0;
  }

  private updateSun(p: Project) {
    const poly = floorPolygon(p);
    const c = new THREE.Vector3();
    let r = 4;
    if (poly.length) {
      const xs = poly.map((v) => v.x * M);
      const zs = poly.map((v) => v.y * M);
      c.set((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
      r = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 0.75 + 1;
    }
    const time = p.settings.timeOfDay;
    const az = ((time - 12) / 12) * Math.PI;
    const elev = Math.max(0.12, Math.sin((Math.PI * (time - 5)) / 15) * 1.05);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev) * 0.6 + 0.4).normalize();
    this.sun.position.copy(c).addScaledVector(dir, 20);
    this.sun.target.position.copy(c);
    const warm = 1 - Math.min(1, elev / 0.6);
    this.sun.color.setRGB(1, 0.93 - warm * 0.2, 0.84 - warm * 0.35);
    this.sun.intensity = (1.2 + Math.min(1, elev / 0.6) * 2.4) * (p.settings.sunIntensity ?? 1);
    this.sun.visible = (p.settings.sunIntensity ?? 1) > 0.001;
    // Himmel / Umgebungslicht
    this.scene.environmentIntensity = p.settings.skyIntensity ?? 1;
    // weiche Schatten: größerer Filterradius, mehr Samples
    const soft = p.settings.softness ?? 0.6;
    this.sun.shadow.radius = 1 + soft * 14;
    this.sun.shadow.blurSamples = 8 + Math.round(soft * 24);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -r;
    cam.right = cam.top = r;
    cam.near = 1;
    cam.far = 45;
    cam.updateProjectionMatrix();
  }

  updateSelection() {
    const s = store.selection;
    this.selectionBox.visible = false;
    if (!s || this.ptActive || this.showroomMode) return;
    const key = s.kind === 'item' ? 'itemId' : s.kind === 'wall' ? 'wallId' : null;
    if (!key) return;
    const obj = this.content.children.find((c) => c.userData[key] === s.id);
    if (!obj) return;
    this.selectionBox.box.setFromObject(obj);
    this.selectionBox.visible = true;
    this.dirty = true;
  }

  // -------------------------------------------------------------------------

  setView(kind: 'perspective' | 'top' | 'front' | 'corner') {
    const poly = floorPolygon(store.project);
    if (!poly.length) return;
    const xs = poly.map((v) => v.x * M);
    const zs = poly.map((v) => v.y * M);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const c = new THREE.Vector3((minX + maxX) / 2, 0.9, (minZ + maxZ) / 2);
    const size = Math.max(maxX - minX, maxZ - minZ);
    if (this.walk.isLocked) this.walk.unlock();
    this.controls.target.copy(c);
    if (kind === 'top') this.camera.position.set(c.x, size * 1.6 + 2, c.z + 0.01);
    if (kind === 'front') this.camera.position.set(c.x, 1.6, maxZ - 0.3);
    if (kind === 'perspective') this.camera.position.set(c.x + size * 0.25, 2.6 + size * 0.55, maxZ + size * 0.55);
    if (kind === 'corner') this.camera.position.set(maxX - 0.4, 1.7, maxZ - 0.4);
    this.camera.fov = kind === 'front' || kind === 'corner' ? 70 : 55;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.cameraChanged();
  }

  startWalk() {
    this.controls.enabled = false;
    this.camera.position.y = 1.65;
    this.walk.lock();
  }

  setExposure(v: number) {
    this.renderer.toneMappingExposure = v;
    this.dirty = true;
    if (this.pathTracer && this.ptActive) this.pathTracer.reset();
  }

  async setPathTracing(on: boolean) {
    this.ptActive = on;
    this.updateSelection();
    if (!on) {
      this.dirty = true;
      return;
    }
    if (!this.pathTracer) {
      const pt = new WebGLPathTracer(this.renderer);
      pt.tiles.set(2, 2);
      pt.bounces = 7;
      pt.transmissiveBounces = 6;
      pt.filterGlossyFactor = 0.4;
      pt.minSamples = 1;
      pt.renderDelay = 0;
      pt.fadeDuration = 300;
      pt.dynamicLowRes = true;
      pt.lowResScale = 0.2;
      pt.textureSize.set(2048, 2048);
      this.pathTracer = pt;
    }
    this.ptSceneDirty = true;
  }

  /** Name der vom Browser genutzten Grafikkarte (sofern der Browser ihn verrät) */
  gpuInfo(): { name: string; integrated: boolean } {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const dedicated = /nvidia|geforce|rtx|quadro|radeon rx|radeon pro|amd radeon(?!\(tm\) graphics)|arc a\d/i.test(name);
    const integrated = !dedicated && /intel|uhd|iris|vega|radeon\(tm\) graphics|swiftshader|llvmpipe|microsoft basic/i.test(name);
    return { name, integrated };
  }

  get pathTracing() {
    return this.ptActive;
  }

  screenshot(): string {
    if (!this.ptActive) {
      this.selectionBox.visible = false;
      this.composer.render();
    }
    const url = this.renderer.domElement.toDataURL('image/png');
    this.updateSelection();
    return url;
  }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.walk.isLocked) {
      const speed = (this.keys.has('ShiftLeft') ? 3 : 1.4) * dt;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) this.walk.moveForward(speed);
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) this.walk.moveForward(-speed);
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.walk.moveRight(-speed);
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.walk.moveRight(speed);
      if (this.keys.size) this.cameraChanged();
    } else if (this.controls.update(dt)) {
      this.dirty = true;
      if (this.controls.autoRotate) this.cameraChanged();
    }

    if (this.ptActive && this.pathTracer) {
      if (this.ptSceneDirty) {
        this.ptSceneDirty = false;
        this.selectionBox.visible = false;
        try {
          this.pathTracer.setScene(this.scene, this.camera);
        } catch (err) {
          console.error('Pathtracer-Szenenaufbau fehlgeschlagen', err);
        }
      }
      this.pathTracer.renderSample();
      this.onSamples?.(Math.floor(this.pathTracer.samples));
      return;
    }

    if (this.dirty) {
      this.dirty = false;
      this.composer.render();
    }
  }
}
