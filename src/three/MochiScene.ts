import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

const vert = /* glsl */ `
uniform float uTime; uniform float uJelly; uniform float uJellyT;
varying vec3 vObj; varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main(){
  vObj = normalize(position);
  vec3 p = position;
  // jelly ripple travelling around the body
  float ripple = sin(p.y*5.0 - uTime*2.2)*0.012 + sin(p.x*4.0 + uTime*1.7)*0.010;
  float hit = uJelly * sin(uJellyT*22.0 - p.y*6.0) * exp(-uJellyT*3.2);
  p += normal * (ripple + hit*0.06);
  vec4 wp = modelMatrix * vec4(p,1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

const frag = /* glsl */ `
precision highp float;
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; uniform vec3 uRim;
uniform float uFace; uniform vec2 uLook; uniform float uBlink; uniform float uHappy; uniform float uAlpha;
varying vec3 vObj; varying vec3 vN; varying vec3 vV; varying vec3 vW;
float ell(vec2 p, vec2 c, vec2 r){ vec2 d=(p-c)/r; return length(d); }
void main(){
  vec3 n = normalize(vN); vec3 v = normalize(vV);
  float y = vObj.y*0.5+0.5;
  vec3 col = mix(uBot, uMid, smoothstep(0.0,0.62,y));
  col = mix(col, uTop, smoothstep(0.55,1.0,y));
  // soft lambert + wrap
  vec3 L = normalize(vec3(-0.5,0.9,0.7));
  float diff = dot(n,L)*0.5+0.5;
  col *= 0.8 + 0.3*diff;
  // pink rim light from lower right
  float fres = pow(1.0 - max(dot(n,v),0.0), 2.4);
  float rimSide = smoothstep(-0.3,0.8, dot(n, normalize(vec3(0.7,-0.5,0.2))));
  col += uRim * fres * (0.45 + 1.1*rimSide);
  col = mix(col, uRim, smoothstep(0.35,1.0,rimSide)*0.22*(1.0-y));
  col += vec3(0.75,0.95,1.0) * fres * 0.18 * (1.0-rimSide);
  // glossy highlight
  vec3 H = normalize(L+v);
  float spec = pow(max(dot(n,H),0.0), 70.0);
  col += vec3(1.0)*spec*0.85;
  float spec2 = pow(max(dot(n,normalize(vec3(-0.35,0.55,1.0))),0.0), 180.0);
  col += vec3(1.0)*spec2*0.6;
  // fake subsurface
  col += uMid * 0.12 * (1.0-diff);
  if(uFace > 0.5 && vObj.z > 0.0){
    vec2 p = vObj.xy;
    vec2 look = uLook*0.045;
    float blink = mix(1.0, 0.08, uBlink);
    // blush
    float b1 = ell(p, vec2(-0.47,-0.2), vec2(0.13,0.075));
    float b2 = ell(p, vec2(0.47,-0.2), vec2(0.13,0.075));
    col = mix(col, vec3(1.0,0.5,0.76), (1.0-smoothstep(0.4,1.0,min(b1,b2)))*0.55);
    for(int i=0;i<2;i++){
      vec2 c = vec2(i==0?-0.29:0.29, 0.0) + look*0.6;
      if(uHappy > 0.5){
        // ^ ^ happy eyes
        vec2 q = p - c; float r = length(q - vec2(0.0,-0.05));
        float arc = abs(r-0.08); float m = (1.0-smoothstep(0.012,0.024,arc)) * step(-0.02, q.y);
        col = mix(col, vec3(0.106,0.055,0.17), m);
      } else {
        float e = ell(p, c, vec2(0.105, 0.13*blink));
        float eye = 1.0 - smoothstep(0.94,1.0,e);
        vec3 ec = vec3(0.106,0.055,0.17);
        // iris shimmer
        float lower = ell(p, c+vec2(0.0,-0.06*blink), vec2(0.07,0.035*blink));
        ec = mix(ec, vec3(0.26,0.62,0.95), (1.0-smoothstep(0.6,1.0,lower))*0.85);
        col = mix(col, ec, eye);
        float h1 = length(p - (c + look + vec2(0.03,0.045*blink)));
        col = mix(col, vec3(1.0), (1.0-smoothstep(0.03,0.038,h1))*eye);
        float h2 = length(p - (c + look*0.5 + vec2(-0.035,-0.01)));
        col = mix(col, vec3(1.0), (1.0-smoothstep(0.012,0.018,h2))*eye*0.9);
      }
    }
    // mouth: little w
    for(int i=0;i<2;i++){
      vec2 c = vec2(i==0?-0.034:0.034, -0.16) + look*0.3;
      float r = length(p-c); float arc = abs(r-0.034);
      float m = (1.0-smoothstep(0.006,0.012,arc)) * step(p.y, c.y+0.002);
      col = mix(col, vec3(0.106,0.055,0.17), m*0.95);
    }
  }
  gl_FragColor = vec4(col, uAlpha);
}`

type Opts = { reduced: boolean; onReady?: () => void; glb?: string }

export class MochiScene {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50)
  group = new THREE.Group()
  body: THREE.Mesh
  mat: THREE.ShaderMaterial
  orbs: { mesh: THREE.Mesh; base: THREE.Vector3; speed: number; phase: number; depth: number }[] = []
  shadow: THREE.Mesh
  clock = new THREE.Clock()
  mouse = new THREE.Vector2(); mouseT = new THREE.Vector2()
  // spring state
  sq = 0; sqV = 0; puffAmt = 0; puffT = 0; puffing = false; anticip = 0
  blinkT = 0; nextBlink = 2.5; happyT = 0
  raf = 0; visible = true; reduced: boolean; disposed = false
  host: HTMLElement
  ro: ResizeObserver
  // Brand Forge GLB rig
  glb: THREE.Object3D | null = null
  mixer: THREE.AnimationMixer | null = null
  puffClip: THREE.AnimationAction | null = null
  bodyMesh: THREE.Mesh | null = null
  eyes: { o: THREE.Object3D; base: THREE.Vector3; baseScale: THREE.Vector3; kind: string }[] = []
  proc = new THREE.Group()

  constructor(host: HTMLElement, opts: Opts) {
    this.host = host; this.reduced = opts.reduced
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    const mobile = matchMedia('(max-width: 768px)').matches
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 1.75))
    this.renderer.setClearColor(0x000000, 0)
    host.appendChild(this.renderer.domElement)
    Object.assign(this.renderer.domElement.style, { width: '100%', height: '100%', display: 'block' })
    this.camera.position.set(0, 0.15, 7.2)

    const uniforms = (top: string, mid: string, bot: string, face = 0) => ({
      uTime: { value: 0 }, uJelly: { value: 0 }, uJellyT: { value: 10 },
      uTop: { value: new THREE.Color(top) }, uMid: { value: new THREE.Color(mid) }, uBot: { value: new THREE.Color(bot) }, uRim: { value: new THREE.Color('#FF5FB8') },
      uFace: { value: face }, uLook: { value: new THREE.Vector2() }, uBlink: { value: 0 }, uHappy: { value: 0 }, uAlpha: { value: 1 },
    })
    this.mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: uniforms('#F2FDFF', '#9FE9FF', '#8C8CFF', 1) })
    this.body = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), this.mat)
    this.body.scale.set(1.22, 0.92, 1.0)
    const earMat = this.mat.clone(); earMat.uniforms = { ...uniforms('#E6FBFF', '#9BE6FF', '#8FA0FF', 0), uTime: this.mat.uniforms.uTime, uJelly: this.mat.uniforms.uJelly, uJellyT: this.mat.uniforms.uJellyT }
    const earGeo = new THREE.SphereGeometry(0.3, 48, 32)
    ;[-1, 1].forEach((s) => { const e = new THREE.Mesh(earGeo, earMat); e.position.set(0.74 * s, 0.72, -0.05); e.scale.set(1, 0.9, 0.8); this.proc.add(e) })
    this.proc.add(this.body)
    this.scene.add(this.group)

    // soft floor shadow
    const cv = document.createElement('canvas'); cv.width = cv.height = 128
    const g = cv.getContext('2d')!; const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grd.addColorStop(0, 'rgba(10,4,20,0.75)'); grd.addColorStop(1, 'rgba(10,4,20,0)'); g.fillStyle = grd; g.fillRect(0, 0, 128, 128)
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }))
    this.shadow.position.set(0, -1.32, 0); this.scene.add(this.shadow)

    // candy orbs with depth (parallax layers)
    const orbGeo = new THREE.SphereGeometry(1, 32, 24)
    const palettes = [['#FFE3F3', '#FF8CCB', '#E0409A'], ['#E6FBFF', '#7FDDFF', '#4A7BFF'], ['#F1EAFF', '#C7B4FF', '#7D5BFF'], ['#FFFFFF', '#FFE6F4', '#FF9FD2']]
    const N = mobile ? 9 : 14
    for (let i = 0; i < N; i++) {
      const p = palettes[i % palettes.length]
      const m = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: uniforms(p[0], p[1], p[2], 0), transparent: true })
      const mesh = new THREE.Mesh(orbGeo, m)
      const ang = (i / N) * Math.PI * 2
      const depth = -1.5 - Math.random() * 4
      const rad = 2.3 + Math.random() * 1.8 - depth * 0.35
      const base = new THREE.Vector3(Math.cos(ang) * rad * 1.3, Math.sin(ang) * rad * 0.62 + 0.2, depth)
      const s = 0.07 + Math.random() * 0.2
      mesh.scale.setScalar(s); mesh.position.copy(base)
      m.uniforms.uAlpha.value = depth < -4 ? 0.55 : 0.95
      this.scene.add(mesh)
      this.orbs.push({ mesh, base, speed: 0.3 + Math.random() * 0.5, phase: Math.random() * 10, depth })
    }

    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); this.resize()
    window.addEventListener('pointermove', this.onMove, { passive: true })
    document.addEventListener('visibilitychange', this.onVis)
    const io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.loop() }, { threshold: 0 })
    io.observe(host); (this as any)._io = io
    if (opts.glb) this.loadGlb(opts.glb, opts.onReady)
    else { this.group.add(this.proc); opts.onReady?.() }
    this.loop()
  }

  /** Load the Brand Forge mochi: PBR clearcoat body + env map, idle_breathe loop, puff clip, puff/squash morphs. */
  loadGlb(url: string, onReady?: () => void) {
    const r = this.renderer
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.92; r.outputColorSpace = THREE.SRGBColorSpace
    const pm = new THREE.PMREMGenerator(r)
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-2, 3, 4); this.scene.add(key)
    const rim = new THREE.PointLight(0xff5fb8, 26, 12); rim.position.set(2.6, -0.6, -1.4); this.scene.add(rim)
    const rim2 = new THREE.PointLight(0x5fd4ff, 14, 12); rim2.position.set(-2.8, 1.2, -1.2); this.scene.add(rim2)
    this.scene.add(new THREE.AmbientLight(0xb69cff, 0.35))
    new GLTFLoader().load(url, (g) => {
      if (this.disposed) return
      const root = g.scene
      const box = new THREE.Box3().setFromObject(root); const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3())
      const k = 2.75 / Math.max(size.x, 0.001)
      const holder = new THREE.Group(); root.position.sub(c); holder.add(root); holder.scale.setScalar(k); holder.position.y = 0.05
      root.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh && m.morphTargetDictionary && 'puff' in m.morphTargetDictionary) {
          this.bodyMesh = m
          const mat = m.material as THREE.MeshPhysicalMaterial
          // body gradient #CFF6FF → #5CCFFF → #5B4BFF (lives in the renders; recreated here in-shader)
          mat.onBeforeCompile = (sh) => {
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vGy;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGy = normalize(position).y;')
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGy;').replace('vec4 diffuseColor = vec4( diffuse, opacity );',
              'float gy = vGy*0.5+0.5; vec3 gc = mix(vec3(0.16,0.09,0.95), vec3(0.06,0.50,1.0), smoothstep(0.05,0.55,gy)); gc = mix(gc, vec3(0.55,0.88,1.0), smoothstep(0.6,1.0,gy)); vec4 diffuseColor = vec4( gc, opacity );')
          }
          if ('sheen' in mat) mat.sheen = Math.min(mat.sheen, 0.35)
          mat.needsUpdate = true
        }
        const fm = /^(EyeGlow|Eye|Shine2|Shine|Mouth|Blush)(_?\.?\d+)?$/.exec(o.name); if (fm && !(o as THREE.Mesh).morphTargetDictionary) this.eyes.push({ o, base: o.position.clone(), baseScale: o.scale.clone(), kind: fm[1] })
      })
      this.glb = holder
      this.group.add(holder)
      this.mixer = new THREE.AnimationMixer(root)
      const idle = THREE.AnimationClip.findByName(g.animations, 'idle_breathe'); if (idle && !this.reduced) this.mixer.clipAction(idle).play()
      const puff = THREE.AnimationClip.findByName(g.animations, 'puff'); if (puff) { this.puffClip = this.mixer.clipAction(puff); this.puffClip.setLoop(THREE.LoopOnce, 1); this.puffClip.clampWhenFinished = false }
      this.renderOnce(); onReady?.()
    }, undefined, () => { if (this.disposed) return; this.group.add(this.proc); onReady?.() })
  }
  onVis = () => { if (!document.hidden) this.loop() }
  onMove = (e: PointerEvent) => {
    const r = this.host.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -(((e.clientY - r.top) / r.height) * 2 - 1)
    this.mouseT.set(THREE.MathUtils.clamp(x, -1.6, 1.6), THREE.MathUtils.clamp(y, -1.6, 1.6))
    if (this.reduced) this.renderOnce()
  }
  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h
    this.camera.position.z = w / h < 0.8 ? 9.6 : w / h < 1.15 ? 8.6 : 7.2
    this.camera.updateProjectionMatrix(); this.renderOnce()
  }
  /** squishy poke */
  poke(strength = 1) { this.sqV -= 2.6 * strength; this.mat.uniforms.uJelly.value = strength; this.mat.uniforms.uJellyT.value = 0 }
  /** launch-zero: 180ms anticipation squash → 1.18× puff + happy eyes */
  puff() { this.anticip = 0.18; this.puffing = true; this.puffT = 0 }
  renderOnce() { this.renderer.render(this.scene, this.camera) }

  loop = () => {
    if (this.disposed || !this.visible || document.hidden) return
    cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(this.clock.getDelta(), 1 / 30)
    const t = this.clock.elapsedTime
    if (this.reduced) { this.mouse.copy(this.mouseT); this.apply(t, dt, true); this.renderOnce(); cancelAnimationFrame(this.raf); return }
    this.mouse.lerp(this.mouseT, 1 - Math.pow(0.0015, dt))
    // spring squash
    const k = 160, c = 9
    let target = Math.sin(t * 2.1) * 0.028
    if (this.anticip > 0) { this.anticip -= dt; target = 0.16; if (this.anticip <= 0) { this.sqV -= 6; this.puffAmt = 1; this.happyT = 1.8; this.poke(1.4); if (this.puffClip) { this.puffClip.reset().play() } } }
    this.sqV += (-(this.sq - target) * k - this.sqV * c) * dt
    this.sq += this.sqV * dt
    this.puffAmt += (0 - this.puffAmt) * (1 - Math.pow(0.25, dt))
    this.mixer?.update(dt)
    this.apply(t, dt, false)
    this.renderOnce()
  }
  apply(t: number, dt: number, still: boolean) {
    const u = this.mat.uniforms
    u.uTime.value = still ? 0 : t
    u.uJellyT.value += dt
    u.uLook.value.set(this.mouse.x, this.mouse.y)
    // blink
    if (!still) {
      this.nextBlink -= dt
      if (this.nextBlink < 0) { this.blinkT = 0.16; this.nextBlink = 2.2 + Math.random() * 3 }
      this.blinkT = Math.max(0, this.blinkT - dt)
      u.uBlink.value = this.blinkT > 0 ? Math.sin((this.blinkT / 0.16) * Math.PI) : 0
      this.happyT = Math.max(0, this.happyT - dt)
      u.uHappy.value = this.happyT > 0 ? 1 : 0
    }
    const s = this.sq
    const puff = 1 + this.puffAmt * (this.glb ? 0.08 : 0.18)
    if (this.bodyMesh?.morphTargetInfluences && this.bodyMesh.morphTargetDictionary) {
      const d = this.bodyMesh.morphTargetDictionary, inf = this.bodyMesh.morphTargetInfluences
      inf[d.puff] = this.puffAmt * 0.35
      inf[d.squash] = Math.max(0, Math.min(0.6, s * 2.2 + (still ? 0 : u.uJelly.value * Math.sin(u.uJellyT.value * 22) * Math.exp(-u.uJellyT.value * 3.2) * 0.25)))
    }
    if (this.eyes.length) {
      const lx = this.mouse.x * 0.045, ly = this.mouse.y * 0.035
      const blink = u.uBlink.value as number
      for (const e of this.eyes) {
        const f = e.kind === 'Shine' || e.kind === 'Shine2' ? 1.5 : e.kind === 'Mouth' || e.kind === 'Blush' ? 0.55 : 1
        const pz = this.puffAmt * 0.14
        e.o.position.set(e.base.x * (1 + this.puffAmt * 0.12) + lx * f, e.base.y + ly * f, e.base.z + pz)
        const by = e.kind === 'Eye' ? 1 - blink * 0.9 : 1
        if (e.kind === 'Mouth' || e.kind === 'Blush') { e.o.scale.copy(e.baseScale); continue }
        e.o.scale.set(e.baseScale.x, e.baseScale.y * by, e.baseScale.z)
        if (e.kind !== 'Eye') e.o.visible = blink < 0.5
      }
    }
    this.group.scale.set((1 + s * 0.55) * puff, (1 - s) * puff, (1 + s * 0.4) * puff)
    this.group.position.y = (still ? 0 : Math.sin(t * 1.05) * 0.08) - s * 0.9
    this.group.rotation.y = this.mouse.x * 0.32
    this.group.rotation.x = -this.mouse.y * 0.16
    this.group.rotation.z = -this.mouse.x * 0.05 + (still ? 0 : Math.sin(t * 0.8) * 0.02)
    ;(this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.8 - (this.group.position.y + s) * 0.6
    this.shadow.scale.set(1 + s * 0.6 - this.group.position.y * 0.2, 1, 1)
    this.orbs.forEach((o) => {
      const par = 0.12 * (1 + -o.depth * 0.15)
      o.mesh.position.set(o.base.x + Math.sin(t * o.speed + o.phase) * 0.15 - this.mouse.x * par, o.base.y + Math.cos(t * o.speed * 1.3 + o.phase) * 0.2 - this.mouse.y * par, o.base.z)
      ;(o.mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = t
    })
  }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf)
    window.removeEventListener('pointermove', this.onMove); document.removeEventListener('visibilitychange', this.onVis)
    this.ro.disconnect(); (this as any)._io?.disconnect()
    this.scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material)?.dispose?.() })
    this.renderer.dispose(); this.renderer.domElement.remove()
  }
}
