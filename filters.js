// 얼굴 필터 엔진. 영상은 WebGL로 부위별로 비틀고(눈, 광대, 턱 등), 눈알과 눈썹, 색종이는 2D로 위에 그린다.
// 변형은 얼굴 타원 안쪽에서만 적용되어 배경은 그대로다. 좌표는 모두 "거울 모양 정사각형(0~1)" 기준.

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const dimOf = (src) => ({
  w: src.videoWidth || src.naturalWidth || src.width,
  h: src.videoHeight || src.naturalHeight || src.height
});

// 얼굴 랜드마크(478점)에서 필터에 필요한 점만 뽑는다. handle()에서 기존 값에 합쳐 쓴다.
export function extraPoints(lm) {
  const o = {};
  const put = (k, i) => { if (lm[i]) { o[k + "x"] = lm[i].x; o[k + "y"] = lm[i].y; } };
  put("ir1", 468); put("ir2", 473);                 // 눈동자(홍채) 중심
  put("eo1", 33); put("ei1", 133); put("eo2", 263); put("ei2", 362);   // 눈 바깥/안쪽 끝
  put("br1", 105); put("br2", 334);                 // 눈썹 가운데
  put("z1", 116); put("z2", 345);                   // 광대뼈
  put("lp1", 61); put("lp2", 291);                  // 입꼬리
  return o;
}

const cl = (s) => Math.max(-2.5, Math.min(0.97, s));
const bp = (fw, pt, k, s, sy) => [pt[0], pt[1], fw * k, cl(s), cl(sy === undefined ? s : sy)];

// 필터 정의. warp는 셰이더에 줄 값, overlay는 변형 뒤에 2D로 덧그리는 것.
//  L: 강도(0~1, 필터가 바뀔 때 서서히 커짐)  e: 표정(j 입 벌림, sm 미소, bl 깜빡임)  t: 초
export const FILTERS = [
  {
    id: "frog", name: "Frog Eyes",
    // 눈이 가늘게 보이지 않도록 가로보다 세로로 훨씬 크게 키워서 동그랗게 튀어나온 눈으로 만든다.
    warp: (c, L, e) => {
      const sx = 0.55 * L * (1 - 0.3 * e.bl), sy = 0.97 * L * (1 - 0.3 * e.bl), out = 0.1 * c.fw;
      return { p: [bp(c.fw, [c.eL[0] - out, c.eL[1] - 0.03 * c.fw], 0.4, sx, sy), bp(c.fw, [c.eR[0] + out, c.eR[1] - 0.03 * c.fw], 0.4, sx, sy)], mk: [c.F[0], c.F[1] - 0.1 * c.fw, c.fw * 1.1, c.fw * 1.4] };
    }
  },
  {
    id: "cheek", name: "Cheekbone Pop",
    // 광대 두 곳만 작게 크게 부풀린다. 반경이 크면 가운데 이목구비가 눌리므로 작게 잡는다.
    warp: (c, L, e) => {
      const sx = (0.82 + 0.15 * e.sm) * L, sy = 0.7 * L, out = 0.07 * c.fw;
      return { p: [bp(c.fw, [c.zL[0] - out, c.zL[1] + 0.03 * c.fw], 0.36, sx, sy), bp(c.fw, [c.zR[0] + out, c.zR[1] + 0.03 * c.fw], 0.36, sx, sy)], mk: [c.F[0], c.F[1], c.fw * 1.4, c.fw * 1.4] };
    }
  },
  {
    id: "jaw", name: "Long Jaw",
    warp: (c, L, e) => ({
      jw: [c.M[0], c.M[1] - 0.04 * c.fw, 2.8 * (0.55 + 0.45 * e.j) * L, c.fw * 1.1],
      mk: [c.F[0], c.F[1] + 0.9 * c.fw, c.fw * 1.5, c.fw * 2.4]
    })
  },
  {
    id: "dizzy", name: "Dizzy Eyes",
    // 눈을 크게 부풀리고 그 안에서 눈알이 핑핑 도는 것처럼 눈 주변을 빙글빙글 비튼다.
    warp: (c, L, e, t) => {
      const ang = 3.4 * Math.sin(t * 7.5) * L;
      return {
        p: [bp(c.fw, c.eL, 0.34, 0.8 * L), bp(c.fw, c.eR, 0.34, 0.8 * L)],
        tw: [c.eL[0], c.eL[1], c.fw * 0.3, ang], tw2: [c.eR[0], c.eR[1], c.fw * 0.3, -ang],
        mk: [c.F[0], c.F[1] - 0.05 * c.fw, c.fw * 1.05, c.fw * 1.3]
      };
    }
  },
  {
    id: "jelly", name: "Jelly Face",
    warp: (c, L, e, t) => ({
      p: [bp(c.fw, c.F, 0.8, 0.3 * Math.sin(t * 5.5) * L), bp(c.fw, c.zL, 0.35, 0.3 * Math.sin(t * 7 + 1) * L), bp(c.fw, c.zR, 0.35, 0.3 * Math.sin(t * 7 + 2.4) * L)],
      jl: [0.014 * L, 38, 7],
      mk: [c.F[0], c.F[1], c.fw * 1.1, c.fw * 1.4]
    })
  },
  {
    id: "mouth", name: "Mega Mouth",
    warp: (c, L, e) => ({
      p: [bp(c.fw, c.M, 0.66, (0.8 + 0.17 * e.j) * L), bp(c.fw, c.eL, 0.24, -1.4 * L), bp(c.fw, c.eR, 0.24, -1.4 * L)],
      mk: [c.F[0], c.F[1] + 0.2 * c.fw, c.fw * 1.1, c.fw * 1.6]
    })
  },
  {
    id: "confetti", name: "Confetti Burp",
    warp: (c, L, e) => ({ p: [bp(c.fw, c.M, 0.42, (0.5 + 0.4 * e.j) * L)] }),
    overlay: null   // 입자는 엔진이 따로 관리한다 (아래 createFilters)
  },
  {
    id: "swirl", name: "Swirl Face",
    warp: (c, L, e, t) => ({ tw: [c.N[0], c.N[1], c.fw * 1.0, 1.5 * Math.sin(t * 1.6) * L], mk: [c.F[0], c.F[1], c.fw * 1.2, c.fw * 1.5] })
  }
];

export function createFilters(CW, log = () => {}) {
  const glc = document.createElement("canvas");
  glc.width = CW; glc.height = CW;
  const gl = glc.getContext("webgl", { preserveDrawingBuffer: true });
  let GU = null;
  if (gl) {
    try {
      const mk = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
      const prog = gl.createProgram();
      gl.attachShader(prog, mk(gl.VERTEX_SHADER, "attribute vec2 a; varying vec2 vUv; void main(){ vUv = vec2(a.x*0.5+0.5, 0.5-a.y*0.5); gl_Position = vec4(a,0.0,1.0); }"));
      gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, `precision mediump float;
        varying vec2 vUv; uniform sampler2D tex; uniform vec2 crop, off, sc, sp; uniform float sr, uT;
        uniform vec4 pp[6]; uniform float pa[6]; uniform vec4 mk; uniform vec4 tw; uniform vec4 tw2; uniform vec3 jl; uniform vec4 jw;
        void main(){
          float wt = 1.0 - smoothstep(0.7 * sr, sr, length(vec2(vUv.x - sp.x, (vUv.y - sp.y) * 0.8)));
          vec2 uv = sp + (vUv - sp) / mix(vec2(1.0), sc, wt);
          for (int i = 0; i < 6; i++) {
            vec2 c = pp[i].xy; float r = max(pp[i].z, 0.0001); float s = pp[i].w;
            float sy = pa[i];
            vec2 d = uv - c; float t = length(d) / r;
            if (t < 1.0) {
              float fx = s > 0.0 ? 1.0 - s * (1.0 - t * t) : 1.0 - s * pow(1.0 - t, 2.0);
              float fy = sy > 0.0 ? 1.0 - sy * (1.0 - t * t) : 1.0 - sy * pow(1.0 - t, 2.0);
              uv = c + d * vec2(fx, fy);
            }
          }
          if (jw.z > 0.0) {
            float dy = uv.y - jw.y;
            float wx = 1.0 - smoothstep(0.6 * jw.w, jw.w, abs(uv.x - jw.x));
            float k = 1.0 + jw.z * wx * smoothstep(0.0, 0.06, dy);
            if (dy > 0.0) uv.y = jw.y + dy / k;
          }
          if (tw.z > 0.0) {
            vec2 d = uv - tw.xy; float r = length(d);
            if (r < tw.z) { float a = tw.w * pow(1.0 - r / tw.z, 2.0); float cs = cos(a), sn = sin(a); uv = tw.xy + vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y); }
          }
          if (tw2.z > 0.0) {
            vec2 d = uv - tw2.xy; float r = length(d);
            if (r < tw2.z) { float a = tw2.w * pow(1.0 - r / tw2.z, 2.0); float cs = cos(a), sn = sin(a); uv = tw2.xy + vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y); }
          }
          uv += jl.x * vec2(sin(uv.y * jl.y + uT * jl.z), cos(uv.x * jl.y * 0.8 + uT * jl.z * 1.3));
          float m = 1.0 - smoothstep(0.75, 1.05, length(vec2((vUv.x - mk.x) / mk.z, (vUv.y - mk.y) / mk.w)));
          uv = mix(vUv, uv, m);
          vec2 tu = vec2(1.0 - uv.x, uv.y) * crop + off;
          gl_FragColor = texture2D(tex, tu);
        }`));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "a");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      GU = {};
      for (const n of ["crop", "off", "sc", "sp", "sr", "uT", "mk", "tw", "jl", "jw", "tw2"]) GU[n] = gl.getUniformLocation(prog, n);
      GU.pp = gl.getUniformLocation(prog, "pp[0]");
      GU.pa = gl.getUniformLocation(prog, "pa[0]");
      log("WebGL 필터 준비됨");
    } catch (e) { GU = null; log("WebGL 필터 실패, 변형 없이 진행: " + (e.message || e)); }
  } else log("WebGL을 쓸 수 없어 변형 필터가 꺼집니다.");

  // 얼굴 점(0~1, 영상 기준)을 필터 공간으로 옮긴다. src는 video나 img.
  function toComp(v, src) {
    const { w: vw, h: vh } = dimOf(src), side = Math.min(vw, vh);
    const P = (lx, ly) => [1 - ((lx * vw - (vw - side) / 2) / side), (ly * vh - (vh - side) / 2) / side];
    const srt = (a, b) => (a[0] < b[0] ? [a, b] : [b, a]);
    const has = (k) => v[k + "x"] !== undefined;
    const pt = (k, fb) => (has(k) ? P(v[k + "x"], v[k + "y"]) : fb);
    const [le, re] = srt(P(v.e1x, v.e1y), P(v.e2x, v.e2y));
    const [lc, rc] = srt(P(v.c1x, v.c1y), P(v.c2x, v.c2y));
    const M = P(v.mx, v.my);
    const F = [((le[0] + re[0]) / 2 + M[0]) / 2, ((le[1] + re[1]) / 2 + M[1]) / 2];
    const [eL, eR] = srt(pt("ir1", le), pt("ir2", re));
    const [zL, zR] = srt(pt("z1", lc), pt("z2", rc));
    const ewRaw = has("eo1") ? Math.hypot((v.eo1x - v.ei1x) * vw, (v.eo1y - v.ei1y) * vh) / side : v.fw * vw / side * 0.22;
    return { F, le, re, lc, rc, M, N: P(v.nx, v.ny), H: P(v.chx, v.chy), T: P(v.fhx, v.fhy), fw: v.fw * vw / side, eL, eR, zL, zR, ew: ewRaw / 2 };
  }

  // 변형 단계: 영상을 필터 공간 캔버스(glc)에 그린다. 필터가 없으면 거울 모양 정사각형 영상만.
  function render(src, c, filterId, lvl, e, t) {
    const { w: vw, h: vh } = dimOf(src), side = Math.min(vw, vh);
    gl.viewport(0, 0, CW, CW);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.uniform2f(GU.crop, side / vw, side / vh);
    gl.uniform2f(GU.off, (vw - side) / 2 / vw, (vh - side) / 2 / vh);
    let w = {};
    const F = FILTERS[filterId];
    if (c && F) w = F.warp(c, lvl, e, t) || {};
    const sc = w.sc || [1, 1], sp = w.sp || [0.5, 0.5];
    const pp = new Float32Array(24);
    const pa = new Float32Array(6);
    (w.p || []).forEach((q, i) => { if (i < 6) { pp.set(q.slice(0, 4), i * 4); pa[i] = q.length > 4 ? q[4] : q[3]; } });
    const tw = w.tw || [0, 0, 0, 0], jl = w.jl || [0, 1, 0];
    gl.uniform2f(GU.sc, sc[0], sc[1]); gl.uniform2f(GU.sp, sp[0], sp[1]); gl.uniform1f(GU.sr, w.sr || 1.0);
    gl.uniform1f(GU.uT, t || 0);
    gl.uniform4fv(GU.pp, pp);
    gl.uniform1fv(GU.pa, pa);
    gl.uniform4f(GU.tw, tw[0], tw[1], tw[2], tw[3]);
    const tw2 = w.tw2 || [0, 0, 0, 0];
    gl.uniform4f(GU.tw2, tw2[0], tw2[1], tw2[2], tw2[3]);
    gl.uniform3f(GU.jl, jl[0], jl[1], jl[2]);
    const jw = w.jw || [0, 0, 0, 1];
    gl.uniform4f(GU.jw, jw[0], jw[1], jw[2], jw[3]);
    if (c) {
      const m = w.mk || [c.F[0], c.F[1], c.fw * 0.95, c.fw * 1.25];
      gl.uniform4f(GU.mk, m[0], m[1], m[2], m[3]);
    } else gl.uniform4f(GU.mk, 0.5, 0.5, 1, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // 색종이 입자(입을 벌리면 입에서 터져 나옴)
  let parts = [], lastT = 0;
  const COLORS = ["#ff4d6d", "#ffd93d", "#4dd0e1", "#7cff6b", "#b388ff", "#ff9f43"];
  function confetti(ctx, CW, c, L, e, t) {
    const dt = Math.min(0.05, Math.max(0, t - lastT)); lastT = t;
    if (e.j > 0.2) {
      const n = Math.round(4 * e.j * L);
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + (Math.random() - 0.5) * 1.8, sp = 220 + Math.random() * 380;
        parts.push({ x: c.M[0] * CW, y: c.M[1] * CW, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14, col: COLORS[(Math.random() * COLORS.length) | 0], life: 0, s: 6 + Math.random() * 7 });
      }
    }
    parts = parts.filter((p) => p.life < 1.1);
    for (const p of parts) {
      p.life += dt; p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.min(1, (1.1 - p.life) * 3);
      ctx.fillStyle = p.col; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
  }

  // 덧그리기 단계: 변형 뒤에 눈알, 눈썹, 색종이 등을 얹는다.
  function overlay(ctx, c, filterId, lvl, e, t) {
    const F = FILTERS[filterId];
    if (!F || !c) { if (!c) parts = []; return; }
    if (F.id === "confetti") confetti(ctx, CW, c, lvl, e, t);
    else if (F.overlay) F.overlay(ctx, CW, c, lvl, e, t);
  }

  return { ok: !!GU, canvas: glc, FILTERS, toComp, render, overlay };
}
