'use client';

import { Camera, Color, Geometry, Mesh, Program, Renderer, Transform, Triangle } from 'ogl';
import { useEffect, useRef } from 'react';

const BG_VERTEX = /* glsl */ `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const BG_FRAGMENT = /* glsl */ `
precision mediump float;
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uStrength;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = vUv;
  uv.x *= uResolution.x / uResolution.y;
  float t = uTime * 0.04;
  float n = fbm(uv * 1.3 + vec2(t, -t * 0.7));
  float m = fbm(uv * 2.0 - vec2(t * 0.6, t) + n * 1.6);
  vec3 tint = mix(uColorA, uColorB, smoothstep(0.2, 0.8, m));
  float vignette = smoothstep(1.35, 0.1, length(vUv - vec2(0.62, 0.42)) * 1.35);
  float k = (0.35 + 0.65 * n) * vignette * uStrength;
  vec3 base = vec3(0.027, 0.027, 0.038);
  gl_FragColor = vec4(mix(base, tint, k), 1.0);
}
`;

const WIRE_VERTEX = /* glsl */ `
attribute vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
varying float vDepth;
void main() {
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vDepth = clamp((-mvPos.z - 3.3) / 3.4, 0.0, 1.0);
  gl_Position = projectionMatrix * mvPos;
  gl_PointSize = mix(4.5, 2.0, vDepth);
}
`;

const WIRE_FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec3 uColor;
uniform float uAlpha;
varying float vDepth;
void main() {
  float fade = mix(1.0, 0.3, vDepth);
  gl_FragColor = vec4(uColor, uAlpha * fade);
}
`;

const POINT_FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec3 uColor;
uniform float uAlpha;
varying float vDepth;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float dist = length(c);
  if (dist > 0.5) discard;
  float soft = smoothstep(0.5, 0.08, dist);
  float fade = mix(1.0, 0.3, vDepth);
  gl_FragColor = vec4(uColor, uAlpha * soft * fade);
}
`;

/** Generates wireframe edges and unique vertices for a geodesic sphere. */
function createGeodesicData(radius: number): { lines: Float32Array; points: Float32Array } {
  const t = (1 + Math.sqrt(5)) / 2;
  const rawVerts: Array<[number, number, number]> = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const norm = (v: [number, number, number]): [number, number, number] => {
    const len = Math.hypot(v[0], v[1], v[2]);
    return [(v[0] / len) * radius, (v[1] / len) * radius, (v[2] / len) * radius];
  };
  const verts = rawVerts.map(norm);
  const faces: Array<[number, number, number]> = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  const edges = new Set<string>();
  const uniqueVerts = new Map<string, [number, number, number]>();
  const coords: number[] = [];
  const mid = (a: [number, number, number], b: [number, number, number]): [number, number, number] =>
    norm([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);

  const keyOf = (v: [number, number, number]) => `${v[0].toFixed(3)},${v[1].toFixed(3)},${v[2].toFixed(3)}`;

  for (const [ia, ib, ic] of faces) {
    const a = verts[ia]!;
    const b = verts[ib]!;
    const c = verts[ic]!;
    const ab = mid(a, b);
    const bc = mid(b, c);
    const ca = mid(c, a);
    const subFaces: Array<[[number, number, number], [number, number, number], [number, number, number]]> = [
      [a, ab, ca],
      [b, bc, ab],
      [c, ca, bc],
      [ab, bc, ca],
    ];
    for (const [p1, p2, p3] of subFaces) {
      for (const v of [p1, p2, p3]) uniqueVerts.set(keyOf(v), v);
      const pairs: Array<[[number, number, number], [number, number, number]]> = [
        [p1, p2],
        [p2, p3],
        [p3, p1],
      ];
      for (const [u, v] of pairs) {
        const ku = keyOf(u);
        const kv = keyOf(v);
        if (!edges.has(`${ku}|${kv}`) && !edges.has(`${kv}|${ku}`)) {
          edges.add(`${ku}|${kv}`);
          coords.push(u[0], u[1], u[2], v[0], v[1], v[2]);
        }
      }
    }
  }

  const pointCoords: number[] = [];
  for (const v of uniqueVerts.values()) pointCoords.push(v[0], v[1], v[2]);
  return { lines: new Float32Array(coords), points: new Float32Array(pointCoords) };
}

interface Props {
  colorA: string;
  colorB: string;
  paused: boolean;
  strength?: number;
}

interface Engine {
  setColors: (a: string, b: string) => void;
  setPaused: (paused: boolean) => void;
  destroy: () => void;
}

export function ShaderBackground({ colorA, colorB, paused, strength = 0.24 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const initial = useRef({ colorA, colorB, paused, strength });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new Renderer({
      dpr: Math.min(window.devicePixelRatio, 1.5),
      alpha: false,
      antialias: true,
      powerPreference: 'low-power',
    });
    const gl = renderer.gl;
    host.appendChild(gl.canvas);
    gl.canvas.style.cssText = 'width:100%;height:100%;display:block';

    const bgProgram = new Program(gl, {
      vertex: BG_VERTEX,
      fragment: BG_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [1, 1] },
        uColorA: { value: new Color(initial.current.colorA) },
        uColorB: { value: new Color(initial.current.colorB) },
        uStrength: { value: initial.current.strength },
      },
    });
    const bgMesh = new Mesh(gl, { geometry: new Triangle(gl), program: bgProgram });

    const camera = new Camera(gl, { fov: 36 });
    camera.position.set(0, 0, 5.2);

    const scene = new Transform();
    const outerData = createGeodesicData(1.85);
    const outerProgram = new Program(gl, {
      vertex: WIRE_VERTEX,
      fragment: WIRE_FRAGMENT,
      transparent: true,
      depthTest: false,
      uniforms: {
        uColor: { value: new Color(initial.current.colorB) },
        uAlpha: { value: 0.42 },
      },
    });
    const outerMesh = new Mesh(gl, {
      mode: gl.LINES,
      geometry: new Geometry(gl, { position: { size: 3, data: outerData.lines } }),
      program: outerProgram,
    });
    outerMesh.position.set(1.05, 0.35, 0);
    outerMesh.setParent(scene);

    const pointsProgram = new Program(gl, {
      vertex: WIRE_VERTEX,
      fragment: POINT_FRAGMENT,
      transparent: true,
      depthTest: false,
      uniforms: {
        uColor: { value: new Color(initial.current.colorB) },
        uAlpha: { value: 0.78 },
      },
    });
    const pointsMesh = new Mesh(gl, {
      mode: gl.POINTS,
      geometry: new Geometry(gl, { position: { size: 3, data: outerData.points } }),
      program: pointsProgram,
    });
    pointsMesh.position.set(1.05, 0.35, 0);
    pointsMesh.setParent(scene);

    const innerData = createGeodesicData(1.05);
    const innerProgram = new Program(gl, {
      vertex: WIRE_VERTEX,
      fragment: WIRE_FRAGMENT,
      transparent: true,
      depthTest: false,
      uniforms: {
        uColor: { value: new Color(initial.current.colorA) },
        uAlpha: { value: 0.5 },
      },
    });
    const innerMesh = new Mesh(gl, {
      mode: gl.LINES,
      geometry: new Geometry(gl, { position: { size: 3, data: innerData.lines } }),
      program: innerProgram,
    });
    innerMesh.position.set(1.05, 0.35, 0);
    innerMesh.setParent(scene);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let userPaused = initial.current.paused;
    let tabHidden = document.hidden;
    let raf = 0;
    let elapsed = 0;
    let last = 0;
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;

    const draw = () => {
      bgProgram.uniforms.uTime!.value = elapsed;
      curX += (targetX - curX) * 0.05;
      curY += (targetY - curY) * 0.05;

      const rotY = elapsed * 0.11 + curX * 0.25;
      const rotX = elapsed * 0.06 + curY * 0.2;
      outerMesh.rotation.y = rotY;
      outerMesh.rotation.x = rotX;
      pointsMesh.rotation.y = rotY;
      pointsMesh.rotation.x = rotX;

      innerMesh.rotation.y = -elapsed * 0.16 - curX * 0.18;
      innerMesh.rotation.z = elapsed * 0.09;

      renderer.autoClear = true;
      renderer.render({ scene: bgMesh });
      renderer.autoClear = false;
      renderer.render({ scene, camera });
    };

    const shouldRun = () => !userPaused && !tabHidden && !reducedMotion.matches;

    const frame = (now: number) => {
      elapsed += (now - last) / 1000;
      last = now;
      draw();
      raf = requestAnimationFrame(frame);
    };

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (shouldRun()) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else {
        draw();
      }
    };

    const resize = () => {
      const { clientWidth, clientHeight } = host;
      const w = Math.max(clientWidth, 1);
      const h = Math.max(clientHeight, 1);
      renderer.setSize(w, h);
      camera.perspective({ aspect: w / h });
      bgProgram.uniforms.uResolution!.value = [gl.canvas.width, gl.canvas.height];
      draw();
    };

    const onPointerMove = (e: PointerEvent) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    const onVisibility = () => {
      tabHidden = document.hidden;
      sync();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    reducedMotion.addEventListener('change', sync);
    resize();
    sync();

    engineRef.current = {
      setColors: (a, b) => {
        bgProgram.uniforms.uColorA!.value = new Color(a);
        bgProgram.uniforms.uColorB!.value = new Color(b);
        innerProgram.uniforms.uColor!.value = new Color(a);
        outerProgram.uniforms.uColor!.value = new Color(b);
        pointsProgram.uniforms.uColor!.value = new Color(b);
        if (!raf) draw();
      },
      setPaused: (value) => {
        userPaused = value;
        sync();
      },
      destroy: () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pointermove', onPointerMove);
        reducedMotion.removeEventListener('change', sync);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        gl.canvas.remove();
      },
    };

    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setColors(colorA, colorB);
  }, [colorA, colorB]);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);

  return <div ref={hostRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-canvas" />;
}
