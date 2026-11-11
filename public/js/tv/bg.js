// Fundo animado em WebGL: blobs líquidos nas cores do jogo atual, com transição suave.

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision mediump float;
uniform vec2 res;
uniform float t;
uniform vec3 c1;
uniform vec3 c2;
uniform vec3 base;
uniform float energy;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.02; a *= 0.5; } return v; }

void main(){
  vec2 uv = gl_FragCoord.xy / res.xy;
  vec2 p = (gl_FragCoord.xy - 0.5*res.xy) / res.y;
  float tt = t * (0.05 + 0.05*energy);
  vec2 q = vec2(fbm(p*1.4 + tt), fbm(p*1.4 - tt + 3.1));
  float f = fbm(p*1.8 + q*1.6 + vec2(tt*0.7, -tt*0.4));
  vec3 col = base;
  col = mix(col, c1, smoothstep(0.42, 0.85, f) * 0.85);
  col = mix(col, c2, smoothstep(0.55, 0.95, fbm(p*2.3 - q + tt)) * 0.6);
  // raios de luz girando, estilo palco de auditório
  float ang = atan(p.y + 0.9, p.x);
  float rays = smoothstep(0.55, 1.0, sin(ang*14.0 + t*0.25)) * 0.07 * (0.6 + energy);
  col += rays;
  // pontilhado de meio-tom
  vec2 g = fract(gl_FragCoord.xy / 9.0) - 0.5;
  float dotm = smoothstep(0.22, 0.18, length(g)) * 0.05;
  col += dotm * (0.3 + f);
  // vinheta
  float vig = smoothstep(1.25, 0.25, length(p*vec2(0.85,1.0)));
  col *= mix(0.55, 1.05, vig);
  gl_FragColor = vec4(col, 1.0);
}`;

function hexToRgb(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function startBackground(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
  const state = { c1: hexToRgb('#ff3d7f'), c2: hexToRgb('#2ec4ff'), base: hexToRgb('#1b1033'), energy: 0.4 };
  const target = { ...state };
  const api = {
    setTheme(c1, c2, base = '#1b1033', energy = 0.4) {
      target.c1 = hexToRgb(c1);
      target.c2 = hexToRgb(c2);
      target.base = hexToRgb(base);
      target.energy = energy;
    },
  };
  if (!gl) {
    canvas.style.background = 'radial-gradient(circle at 30% 30%, #ff3d7f55, transparent 60%), radial-gradient(circle at 70% 70%, #2ec4ff55, transparent 60%), #1b1033';
    return api;
  }
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);
  const u = { res: U('res'), t: U('t'), c1: U('c1'), c2: U('c2'), base: U('base'), energy: U('energy') };

  const scale = 0.5; // renderiza em meia resolução: é um fundo borrado, ninguém nota e a GPU agradece
  const resize = () => {
    canvas.width = Math.max(2, Math.floor(innerWidth * scale));
    canvas.height = Math.max(2, Math.floor(innerHeight * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  addEventListener('resize', resize);
  resize();
  const t0 = performance.now();
  const mix = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
  const loop = () => {
    const k = 0.03;
    state.c1 = mix(state.c1, target.c1, k);
    state.c2 = mix(state.c2, target.c2, k);
    state.base = mix(state.base, target.base, k);
    state.energy += (target.energy - state.energy) * k;
    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.t, (performance.now() - t0) / 1000);
    gl.uniform3fv(u.c1, state.c1);
    gl.uniform3fv(u.c2, state.c2);
    gl.uniform3fv(u.base, state.base);
    gl.uniform1f(u.energy, state.energy);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(loop);
  };
  loop();
  return api;
}
