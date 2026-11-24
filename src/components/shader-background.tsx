'use client';

import { Color, Mesh, Program, Renderer, Triangle } from 'ogl';
import { useEffect, useRef } from 'react';

const VERTEX = /* glsl */ `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
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
  float t = uTime * 0.035;
  float n = fbm(uv * 1.3 + vec2(t, -t * 0.7));
  float m = fbm(uv * 2.0 - vec2(t * 0.6, t) + n * 1.6);
  vec3 tint = mix(uColorA, uColorB, smoothstep(0.25, 0.75, m));
  float vignette = smoothstep(1.3, 0.15, length(vUv - 0.5) * 1.5);
  float k = (0.3 + 0.7 * n) * vignette * uStrength;
  vec3 base = vec3(0.027, 0.027, 0.035);
  gl_FragColor = vec4(mix(base, tint, k), 1.0);
}
`;

interface Props {
  colorA: string;
  colorB: string;
  paused: boolean;
  /** 0.12 to 0.16 keeps numbers legible over the glow. */
  strength?: number;
}

interface Engine {
  setColors: (a: string, b: string) => void;
  setPaused: (paused: boolean) => void;
  destroy: () => void;
}

export function ShaderBackground({ colorA, colorB, paused, strength = 0.14 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const initial = useRef({ colorA, colorB, paused, strength });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new Renderer({
      dpr: Math.min(window.devicePixelRatio, 1.5),
      alpha: false,
      antialias: false,
      powerPreference: 'low-power',
    });
    const gl = renderer.gl;
    host.appendChild(gl.canvas);
    gl.canvas.style.cssText = 'width:100%;height:100%;display:block';

    const program = new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [1, 1] },
        uColorA: { value: new Color(initial.current.colorA) },
        uColorB: { value: new Color(initial.current.colorB) },
        uStrength: { value: initial.current.strength },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let userPaused = initial.current.paused;
    let tabHidden = document.hidden;
    let raf = 0;
    let elapsed = 0;
    let last = 0;

    const draw = () => {
      program.uniforms.uTime!.value = elapsed;
      renderer.render({ scene: mesh });
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
      renderer.setSize(Math.max(clientWidth, 1), Math.max(clientHeight, 1));
      program.uniforms.uResolution!.value = [gl.canvas.width, gl.canvas.height];
      draw();
    };

    const onVisibility = () => {
      tabHidden = document.hidden;
      sync();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener('change', sync);
    resize();
    sync();

    engineRef.current = {
      setColors: (a, b) => {
        program.uniforms.uColorA!.value = new Color(a);
        program.uniforms.uColorB!.value = new Color(b);
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

  return <div ref={hostRef} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-base" />;
}
