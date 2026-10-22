// 얼굴 필터 엔진. 영상은 WebGL로 부위별로 비틀고(눈, 광대, 턱 등), 색종이와 하트와 눈물은 2D 입자로 위에 뿌린다.
// 변형은 얼굴 타원 안쪽에서만 적용되어 배경은 그대로다. 좌표는 모두 "거울 모양 정사각형(0~1)" 기준.

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
  put("nt", 4);                                     // 코끝
  put("ear1", 234); put("ear2", 454);               // 얼굴 양옆(귀 높이)
  return o;
}

const cl = (s) => Math.max(-2.5, Math.min(0.97, s));
// 부풀리는 점. s는 가로, sy는 세로 세기(없으면 같음). 양수는 확대, 음수는 축소.
const bp = (fw, pt, k, s, sy) => [pt[0], pt[1], fw * k, cl(s), cl(sy === undefined ? s : sy)];

// 필터 정의. 순서는 index.html의 VOICES(필터별 목소리)와 같다.
//  warp(c, L, e, t): 셰이더에 줄 변형 값   particles: 위에 뿌릴 입자 종류
//  L: 강도(0~1, 필터가 바뀔 때 서서히 커짐)  e: 표정(j 입 벌림, sm 미소, bl 깜빡임)  t: 초
export const FILTERS = [
  {
    id: "frog", name: "Frog Eyes",
    // 눈이 가늘게 보이지 않도록 가로보다 세로로 훨씬 크게 키워서 동그랗게 튀어나온 눈으로 만든다. 입은 콩알만 하게 줄인다.
    warp: (c, L, e) => {
      const sx = 0.6 * L * (1 - 0.3 * e.bl), sy = 0.97 * L * (1 - 0.3 * e.bl), out = 0.17 * c.fw;
      return { p: [bp(c.fw, [c.eL[0] - out, c.eL[1] - 0.04 * c.fw], 0.4, sx, sy), bp(c.fw, [c.eR[0] + out, c.eR[1] - 0.04 * c.fw], 0.4, sx, sy), bp(c.fw, c.M, 0.3, -1.6 * L)], mk: [c.F[0], c.F[1] - 0.05 * c.fw, c.fw * 1.3, c.fw * 1.5] };
    }
  },
  {
    id: "cheek", name: "Cheekbone Pop",
    // 광대 두 곳만 크게 부풀린다. 반경이 크면 가운데 이목구비가 눌리므로 작게 잡는다.
    warp: (c, L, e) => {
      const sx = 0.97 * L, sy = 0.8 * L, out = 0.09 * c.fw;
      return { p: [bp(c.fw, [c.zL[0] - out, c.zL[1] + 0.03 * c.fw], 0.42, sx, sy), bp(c.fw, [c.zR[0] + out, c.zR[1] + 0.03 * c.fw], 0.42, sx, sy)], mk: [c.F[0], c.F[1], c.fw * 1.5, c.fw * 1.4] };
    }
  },
  {
    id: "jaw", name: "Long Jaw",
    warp: (c, L, e) => ({
      jw: [c.M[0], c.M[1] - 0.04 * c.fw, 4.0 * (0.6 + 0.4 * e.j) * L, c.fw * 1.1],
      mk: [c.F[0], c.F[1] + 1.1 * c.fw, c.fw * 1.5, c.fw * 2.8]
    })
  },
  {
    id: "mouth", name: "Mega Mouth",
    // 입만 얼굴의 절반 가까이 커지고 코는 콩알만 해진다.
    warp: (c, L, e) => ({
      p: [bp(c.fw, c.M, 0.85, (0.88 + 0.09 * e.j) * L), bp(c.fw, c.N, 0.25, -1.8 * L)],
      mk: [c.F[0], c.F[1] + 0.25 * c.fw, c.fw * 1.3, c.fw * 1.7]
    })
  },
  {
    id: "longnose", name: "Long Nose",
    // 코만 아래로 쭉 자란다. 웃을수록 더 길어진다.
    warp: (c, L, e) => ({
      p: [bp(c.fw, [c.N[0], c.N[1] - 0.06 * c.fw], 0.55, 0.3 * L, (0.88 + 0.09 * e.sm) * L)],
      mk: [c.F[0], c.F[1] + 0.15 * c.fw, c.fw * 1.1, c.fw * 1.7]
    })
  },
  {
    id: "tallhead", name: "Tall Head",
    // 이마 위로 머리가 쭉 늘어난다.
    warp: (c, L, e) => ({
      ju: [c.F[0], c.F[1] - 0.25 * c.fw, 2.6 * (0.7 + 0.3 * e.j) * L, c.fw * 1.1],
      mk: [c.F[0], c.F[1] - 1.0 * c.fw, c.fw * 1.5, c.fw * 2.6]
    })
  },
  {
    id: "duck", name: "Duck Lips",
    // 입은 가로로 오므려 쭉 내민 오리 입이 되고 입 위아래만 부푼다.
    warp: (c, L, e) => ({
      p: [bp(c.fw, c.M, 0.5, -1.5 * L, (0.85 + 0.1 * e.j) * L)],
      mk: [c.F[0], c.F[1] + 0.25 * c.fw, c.fw * 1.2, c.fw * 1.5]
    })
  },
  {
    id: "confetti", name: "Confetti Burp", particles: "confetti",
    warp: (c, L, e) => ({ p: [bp(c.fw, c.M, 0.55, (0.6 + 0.35 * e.j) * L)] })
  },
  {
    id: "bighead", name: "Big Head",
    // 머리 전체가 어깨보다 훨씬 크게 부풀고 말할 때마다 끄덕끄덕 흔들린다.
    warp: (c, L, e, t) => {
      const nod = 0.05 * c.fw * Math.sin(t * 6.5);
      return { p: [bp(c.fw, [c.F[0], c.F[1] - 0.1 * c.fw + nod], 1.25, (0.78 + 0.08 * Math.sin(t * 6.5)) * L)], mk: [c.F[0], c.F[1] - 0.1 * c.fw, c.fw * 1.7, c.fw * 2.0] };
    }
  },
  {
    id: "twin", name: "Twin Face",
    // 얼굴 한쪽 절반을 거울처럼 다른 쪽에 붙인다.
    warp: (c, L) => ({ mr: [c.F[0], L > 0.05 ? 1 : 0], mk: [c.F[0], c.F[1], c.fw * 4, c.fw * 4] })   // 가운데 선 기준 화면 전체를 대칭으로
  },
  {
    id: "tears", name: "Tear Fountain", particles: "tears",
    warp: (c, L, e) => ({ p: [bp(c.fw, c.eL, 0.36, (0.6 + 0.3 * e.bl) * L), bp(c.fw, c.eR, 0.36, (0.6 + 0.3 * e.bl) * L)] })
  },
  {
    id: "hearts", name: "Heart Burst", particles: "hearts",
    warp: (c, L, e) => {
      const s = (0.7 + 0.25 * e.sm) * L;
      return { p: [bp(c.fw, c.zL, 0.4, s, s * 0.8), bp(c.fw, c.zR, 0.4, s, s * 0.8)] };
    }
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
        varying vec2 vUv; uniform sampler2D tex; uniform vec2 crop, off, sc, sp, mr; uniform float sr, uT;
        uniform vec4 pp[6]; uniform float pa[6]; uniform vec4 mk; uniform vec4 tw; uniform vec3 jl; uniform vec4 jw; uniform vec4 ju;
        void main(){
          vec2 uv = vUv;
          if (mr.y > 0.0 && uv.x > mr.x) uv.x = 2.0 * mr.x - uv.x;
          float wt = 1.0 - smoothstep(0.7 * sr, sr, length(vec2(uv.x - sp.x, (uv.y - sp.y) * 0.8)));
          uv = sp + (uv - sp) / mix(vec2(1.0), sc, wt);
          if (jw.z > 0.0) {
            float dy = uv.y - jw.y;
            float wx = 1.0 - smoothstep(0.6 * jw.w, jw.w, abs(uv.x - jw.x));
            float k = 1.0 + jw.z * wx * smoothstep(0.0, 0.06, dy);
            if (dy > 0.0) uv.y = jw.y + dy / k;
          }
          if (ju.z > 0.0) {
            float dy = ju.y - uv.y;
            float wx = 1.0 - smoothstep(0.6 * ju.w, ju.w, abs(uv.x - ju.x));
            float k = 1.0 + ju.z * wx * smoothstep(0.0, 0.06, dy);
            if (dy > 0.0) uv.y = ju.y - dy / k;
          }
          for (int i = 0; i < 6; i++) {
            vec2 c = pp[i].xy; float r = max(pp[i].z, 0.0001); float s = pp[i].w; float sy = pa[i];
            vec2 d = uv - c; float t = length(d) / r;
            if (t < 1.0) {
              float fx = s > 0.0 ? 1.0 - s * (1.0 - t * t) : 1.0 - s * pow(1.0 - t, 2.0);
              float fy = sy > 0.0 ? 1.0 - sy * (1.0 - t * t) : 1.0 - sy * pow(1.0 - t, 2.0);
              uv = c + d * vec2(fx, fy);
            }
          }
          if (tw.z > 0.0) {
            vec2 d = uv - tw.xy; float r = length(d);
            if (r < tw.z) { float a = tw.w * pow(1.0 - r / tw.z, 2.0); float cs = cos(a), sn = sin(a); uv = tw.xy + vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y); }
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
      for (const n of ["crop", "off", "sc", "sp", "sr", "uT", "mk", "tw", "jl", "jw", "ju", "mr"]) GU[n] = gl.getUniformLocation(prog, n);
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
    const N = P(v.nx, v.ny);
    const [aL, aR] = srt(pt("ear1", lc), pt("ear2", rc));
    const ewRaw = has("eo1") ? Math.hypot((v.eo1x - v.ei1x) * vw, (v.eo1y - v.ei1y) * vh) / side : v.fw * vw / side * 0.22;
    return { F, le, re, lc, rc, M, N: pt("nt", N), H: P(v.chx, v.chy), T: P(v.fhx, v.fhy), fw: v.fw * vw / side, eL, eR, zL, zR, aL, aR, ew: ewRaw / 2 };
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
    const pp = new Float32Array(24), pa = new Float32Array(6);
    (w.p || []).forEach((q, i) => { if (i < 6) { pp.set(q.slice(0, 4), i * 4); pa[i] = q.length > 4 ? q[4] : q[3]; } });
    const tw = w.tw || [0, 0, 0, 0], jl = w.jl || [0, 1, 0], jw = w.jw || [0, 0, 0, 1], ju = w.ju || [0, 0, 0, 1], mr = w.mr || [0, 0];
    gl.uniform2f(GU.sc, sc[0], sc[1]); gl.uniform2f(GU.sp, sp[0], sp[1]); gl.uniform1f(GU.sr, w.sr || 1.0);
    gl.uniform1f(GU.uT, t || 0);
    gl.uniform4fv(GU.pp, pp);
    gl.uniform1fv(GU.pa, pa);
    gl.uniform4f(GU.tw, tw[0], tw[1], tw[2], tw[3]);
    gl.uniform3f(GU.jl, jl[0], jl[1], jl[2]);
    gl.uniform4f(GU.jw, jw[0], jw[1], jw[2], jw[3]);
    gl.uniform4f(GU.ju, ju[0], ju[1], ju[2], ju[3]);
    gl.uniform2f(GU.mr, mr[0], mr[1]);
    if (c) {
      const m = w.mk || [c.F[0], c.F[1], c.fw * 0.95, c.fw * 1.25];
      gl.uniform4f(GU.mk, m[0], m[1], m[2], m[3]);
    } else gl.uniform4f(GU.mk, 0.5, 0.5, 1, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---------- 입자: 색종이(입), 눈물(눈), 하트(볼) ----------
  let parts = [], lastT = 0;
  const COLORS = ["#ff4d6d", "#ffd93d", "#4dd0e1", "#7cff6b", "#b388ff", "#ff9f43"];
  const HEARTS = ["#ff5c8a", "#ff85a1", "#ff3d71", "#ffb3c6"];
  const R = Math.random;
  function spawn(kind, c, L, e) {
    const x = (p) => p[0] * CW, y = (p) => p[1] * CW;
    if (kind === "confetti" && e.j > 0.2) {
      const n = Math.round(4 * e.j * L);
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + (R() - 0.5) * 1.8, sp = 220 + R() * 380;
        parts.push({ k: "rect", x: x(c.M), y: y(c.M), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 520, r: R() * 6.28, vr: (R() - 0.5) * 14, col: COLORS[(R() * COLORS.length) | 0], life: 0, max: 1.1, s: 6 + R() * 7 });
      }
    } else if (kind === "tears" && (e.bl > 0.3 || e.sm > 0.45)) {
      for (const [eye, dir] of [[c.eL, -1], [c.eR, 1]]) {
        for (let i = 0; i < 2; i++) {
          parts.push({ k: "drop", x: x(eye), y: y(eye) + c.fw * CW * 0.09, vx: dir * (50 + R() * 150), vy: -(200 + R() * 280), g: 900, r: 0, vr: 0, col: "#7cc8ff", life: 0, max: 1.3, s: 7 + R() * 6 });
        }
      }
    } else if (kind === "hearts" && e.sm > 0.3 && R() < 0.6 + 0.4 * e.sm) {
      for (const [z, dir] of [[c.zL, -1], [c.zR, 1]]) {
        parts.push({ k: "heart", x: x(z) + dir * c.fw * CW * 0.05, y: y(z), vx: dir * (30 + R() * 90), vy: -(110 + R() * 150), g: -20, r: (R() - 0.5) * 0.6, vr: (R() - 0.5) * 1.2, col: HEARTS[(R() * HEARTS.length) | 0], life: 0, max: 1.5, s: 18 + R() * 16 });
      }
    }
  }
  function heartPath(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.35);
    ctx.bezierCurveTo(-s, -s * 0.3, -s * 0.5, -s * 0.95, 0, -s * 0.4);
    ctx.bezierCurveTo(s * 0.5, -s * 0.95, s, -s * 0.3, 0, s * 0.35);
    ctx.closePath();
  }
  function stepParts(ctx, t) {
    const dt = Math.min(0.05, Math.max(0, t - lastT)); lastT = t;
    parts = parts.filter((p) => p.life < p.max);
    for (const p of parts) {
      p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.min(1, (p.max - p.life) * 3);
      ctx.fillStyle = p.col;
      if (p.k === "rect") ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      else if (p.k === "drop") { ctx.beginPath(); ctx.ellipse(0, 0, p.s * 0.55, p.s, 0, 0, 6.283); ctx.fill(); ctx.globalAlpha *= 0.8; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-p.s * 0.2, -p.s * 0.3, p.s * 0.2, 0, 6.283); ctx.fill(); }
      else if (p.k === "heart") { heartPath(ctx, p.s); ctx.fill(); }
      ctx.restore();
    }
  }

  // 덧그리기 단계: 변형 뒤에 입자를 얹는다. 필터가 바뀌어도 남은 입자는 끝까지 떨어진다.
  function overlay(ctx, c, filterId, lvl, e, t) {
    const F = FILTERS[filterId];
    if (c && F && F.particles) spawn(F.particles, c, lvl, e);
    stepParts(ctx, t);
  }

  return { ok: !!GU, canvas: glc, FILTERS, toComp, render, overlay };
}
