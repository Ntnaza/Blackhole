export const vertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  precision highp float;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec3 uCameraPos;
  uniform float uTilt;
  uniform sampler2D uStarTexture;
  uniform mat4 uProjMatrix;
  uniform mat4 uViewMat;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  #define STEPS 180
  #define RS 1.0

  // ==========================================
  // SINE-FREE HASH & NOISE
  // ==========================================
  float hash(vec3 p3) {
      p3  = fract(p3 * 0.1031);
      p3 += dot(p3, p3.zyx + 31.32);
      return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec3 x) {
      vec3 i = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix( hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)),f.x),
                     mix( hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)),f.x),f.y),
                 mix(mix( hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)),f.x),
                     mix( hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)),f.x),f.y),f.z);
  }

  float fbm(vec3 p) {
      float f = 0.0;
      float w = 0.5;
      for(int i = 0; i < 4; i++) {
          f += w * noise(p);
          p *= 2.0;
          w *= 0.5;
      }
      return f;
  }

  // Bintang sekarang dirender sebagai partikel 3D oleh Starfield3D.tsx
  // Shader hanya menangani blackhole, accretion disk, dan galaxy glow

  void main() {
      vec3 ro = uCameraPos;
      vec3 rd = normalize(vWorldPosition - uCameraPos);
      
      float c = cos(uTilt);
      float s = sin(uTilt);
      mat2 rotZ = mat2(c, -s, s, c);
      
      ro.xy = rotZ * ro.xy;
      rd.xy = rotZ * rd.xy;
      
      vec3 p = ro;
      vec3 v = rd;
      
      vec3 L = cross(ro, rd);
      float h2 = dot(L, L);

      vec3 col = vec3(0.0);
      float trans = 1.0;
      float photonGlow = 0.0;

      // ==========================================
      // GARGANTUA ACCRETION DISK — Interstellar Texture, Monokrom
      // ==========================================
      float diskInner = RS * 2.5; 
      float diskOuter = RS * 14.0;  // Disk lebih ramping
      float diskThickness = 0.1;   // Lebih tipis lagi
      float maxR = 40.0;
      
      float r0 = length(p);
      if (r0 > maxR) {
          float b = dot(p, v);
          float c_sph = dot(p, p) - maxR * maxR;
          float det = b * b - c_sph;
          if (det > 0.0) {
              float t = -b - sqrt(det) + 0.01; 
              if (t > 0.0) p += v * t;
          }
      }

      for(int i = 0; i < STEPS; i++) {
          float r2 = dot(p, p);
          float r = sqrt(r2);
          
          if (r < RS * 0.98) { 
              trans = 0.0; 
              break; 
          }
          if (r > maxR) break; 

          float dt = 0.05 + 0.04 * r; 
          float dR = length(p.xz);

          vec3 a = -1.5 * RS * h2 * p / (r2 * r2 * r);
          a *= smoothstep(maxR, 15.0, r); 
          
          float h = abs(p.y);
          float pixelSize = length(uCameraPos) * 0.002;
          float effThickness = max(diskThickness + dt * 0.5, pixelSize); 
          
          if (dR > diskInner - 1.0 && dR < diskOuter + 2.0 && h < effThickness * 1.5) {
              dt = min(dt, effThickness * 0.4); 
          }
          
          v = normalize(v + a * dt);
          p += v * dt;

          // ==========================================
          // PHOTON RING — Cincin tipis terang di photon sphere (r = 1.5 RS)
          // Sangat tajam dan intens seperti referensi
          // ==========================================
          float distToPhoton = abs(r - 1.5 * RS);
          photonGlow += exp(-distToPhoton * 60.0) * dt * trans * 5.0;
          
          // Inner glow — cahaya redup di dekat event horizon
          float innerGlow = exp(-abs(r - RS * 1.2) * 15.0) * dt * trans * 1.5;
          photonGlow += innerGlow;
          
          if (dR > diskInner && dR < diskOuter && h < effThickness) {
              
              float radialFalloff = smoothstep(diskOuter, diskOuter - 4.0, dR) * smoothstep(diskInner, diskInner + 0.1, dR);
              
              float verticalFalloff = exp(-pow(h / (effThickness * 0.45), 3.0));
              float isFar = smoothstep(0.1, 0.5, pixelSize); 
              verticalFalloff = mix(verticalFalloff, 1.0, isFar);
              
              float baseDens = radialFalloff * verticalFalloff * 9.0 * (diskThickness / effThickness); 
              
              if (baseDens > 0.01) {
                  // ==========================================
                  // RING BANDING DETAIL — Banyak garis konsentris halus
                  // Seperti referensi: garis-garis tipis berlapis
                  // ==========================================
                  float rings1 = abs(sin(dR * 5.0 + fbm(vec3(dR * 0.5, 0.0, 0.0)) * 2.5));
                  float rings2 = abs(sin(dR * 12.0 + 1.7));
                  float rings3 = abs(sin(dR * 22.0 + 3.1));
                  float rings = mix(0.3, 1.0, smoothstep(0.1, 0.65, rings1));   // Celah gelap lebih dalam
                  rings *= mix(0.7, 1.0, smoothstep(0.25, 0.65, rings2));
                  rings *= mix(0.85, 1.0, smoothstep(0.35, 0.65, rings3));
                  
                  // ==========================================
                  // PLASMA TURBULENCE — Organik, mengalir, detail
                  // 5 oktaf FBM untuk texture yang sangat kaya
                  // ==========================================
                  float angle = atan(p.z, p.x);
                  float plasmaBase = fbm(vec3(dR * 2.5, angle * 3.0 - uTime * 0.5, p.y * 12.0));
                  float plasmaFine = fbm(vec3(dR * 6.0, angle * 6.0 - uTime * 0.3, p.y * 20.0));
                  float plasma = mix(0.4, 1.3, plasmaBase) * mix(0.7, 1.0, plasmaFine) * rings;
                  
                  // Streamer — garis cahaya tipis yang mengalir radial
                  float streamer = fbm(vec3(angle * 8.0 + uTime * 0.2, dR * 0.8, 0.0));
                  plasma *= mix(0.85, 1.15, streamer);
                  
                  float dens = baseDens * plasma;
                  
                  vec3 vDisk = normalize(vec3(-p.z, 0.0, p.x));
                  float doppler = 1.0 + dot(v, vDisk) * 0.8; 
                  
                  float t_color = (dR - diskInner) / (diskOuter - diskInner);
                  
                  // PALET WARNA MONOKROM — Hitam Putih dengan kontras tinggi
                  vec3 coreColor = vec3(16.0);   // Core: SANGAT putih intens
                  vec3 midColor  = vec3(3.5);    // Mid: abu-abu terang
                  vec3 edgeColor = vec3(0.08);   // Edge: hampir hitam
                  
                  vec3 emitColor;
                  if (t_color < 0.15) emitColor = mix(coreColor, midColor, smoothstep(0.0, 0.15, t_color));
                  else emitColor = mix(midColor, edgeColor, smoothstep(0.15, 1.0, t_color));
                  
                  vec3 emit = emitColor * dens * pow(doppler, 3.5);
                  
                  float absorb = dens * dt * 22.0;
                  col += emit * dt * trans * 5.0;
                  trans *= exp(-absorb);
              }
          }
          if (trans < 0.01) break;
      }
      
      // Photon ring glow — putih bersih, intens
      col += vec3(1.0, 1.0, 1.0) * photonGlow * trans;
      
      // ==========================================
      // MILKY WAY + 3D PARALLAX STARFIELD
      // ==========================================
      if (trans > 0.01) {
          float bgRadius = 800.0;
          
          // Proyeksikan dari posisi terakhir sinar (p)
          float b = dot(p, v);
          float c_sph = dot(p, p) - bgRadius * bgRadius;
          float det = b * b - c_sph;
          
          vec3 bgDir = v;
          if (det > 0.0) {
              float t_bg = -b + sqrt(det);
              if (t_bg > 0.0) {
                  vec3 p_bg = p + v * t_bg;
                  bgDir = normalize(p_bg);
              }
          }
          
          vec3 nEq = normalize(vec3(0.6, 0.7, -0.3)); 
          float distToEq = abs(dot(bgDir, nEq));
          
          // 1. Awan Galaksi Dasar
          float cloudFbm = 0.0;
          float w_cloud = 0.5;
          vec3 p_cloud = bgDir * 5.0; 
          for(int j=0; j<5; j++) { 
              cloudFbm += w_cloud * noise(p_cloud);
              p_cloud *= 2.0;
              w_cloud *= 0.5;
          }
          
          float bandMask = smoothstep(0.2, 0.0, distToEq + (cloudFbm - 0.5) * 0.25);
          float galaxyGlow = pow(cloudFbm, 1.5) * bandMask * 0.15; 
          
          // 2. Fraktal Jalur Debu Gelap (Dark Rift)
          float turb = 0.0;
          float w_turb = 0.5;
          vec3 p_turb = bgDir * 10.0; 
          for(int j=0; j<5; j++) {
              turb += w_turb * abs(noise(p_turb) * 2.0 - 1.0);
              p_turb *= 2.0;
              w_turb *= 0.5;
          }
          
          float riftMask = smoothstep(0.1, 0.35, turb + distToEq * 0.4);
          galaxyGlow *= riftMask;
          
          // Galaxy glow netral
          vec3 bgCol = vec3(galaxyGlow);
          col += bgCol * trans;
          
          // ==========================================
          // GRAVITATIONAL LENSING PADA BINTANG
          // Sinar yang dibengkokkan gravitasi menunjuk ke arah berbeda
          // dari arah aslinya — ini mendistorsi posisi bintang
          // secara otomatis menciptakan efek lensing
          // ==========================================
          
          // v = arah sinar setelah dibengkokkan gravitasi (dalam tilted space)
          // Undo tilt rotation untuk kembali ke world space
          mat2 invRotZ = mat2(c, s, -s, c);
          vec2 unrotated = invRotZ * v.xy;
          vec3 vWorld = vec3(unrotated, v.z);
          
          // Proyeksikan arah terbengkok ke screen UV
          // viewMatrix & projectionMatrix dikirim sebagai uniform
          vec3 vView = mat3(uViewMat) * vWorld;
          
          // Hanya sampel jika arah di depan kamera (z negatif di view space)
          if (vView.z < 0.0) {
              vec4 clipPos = uProjMatrix * vec4(vView * 1000.0, 1.0);
              vec2 starUV = clipPos.xy / clipPos.w * 0.5 + 0.5;
              
              // Sampel bintang dari FBO dengan UV terdistorsi
              if (starUV.x > 0.001 && starUV.x < 0.999 && starUV.y > 0.001 && starUV.y < 0.999) {
                  vec3 starColor = texture2D(uStarTexture, starUV).rgb;
                  col += starColor * trans;
              }
          }
      }

      // ACES Tone Mapping
      col *= 1.4; 
      float a_aces = 2.51; float b_aces = 0.03; float c_aces = 2.43; float d_aces = 0.59; float e_aces = 0.14;
      col = clamp((col * (a_aces * col + b_aces)) / (col * (c_aces * col + d_aces) + e_aces), 0.0, 1.0);
      
      // Gamma correction
      col = pow(col, vec3(1.0 / 2.2));

      gl_FragColor = vec4(col, 1.0);
  }
`;
