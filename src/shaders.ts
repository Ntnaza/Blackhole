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

  // ==========================================
  // ANTI-ALIASED PERFECT STARS
  // ==========================================
  float smoothStar(vec3 dir, float scale) {
      vec3 p = dir * scale;
      vec3 i = floor(p);
      vec3 f = fract(p);
      float d = length(f - vec3(0.5));
      float h = hash(i);
      
      float starVal = smoothstep(0.4, 0.1, d); 
      starVal *= smoothstep(0.996, 1.0, h); 
      return starVal;
  }

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
      // GARGANTUA ACCRETION DISK (Lebar, Elegan, Icy White)
      // ==========================================
      float diskInner = RS * 2.6; 
      float diskOuter = RS * 18.0; 
      float diskThickness = 0.15; 
      float maxR = 40.0; // Radius simulasi dikembalikan ke 40 untuk performa maksimal tanpa cacat cincin
      
      float r0 = length(p);
      if (r0 > maxR) {
          float b = dot(p, v);
          float c_sph = dot(p, p) - maxR * maxR;
          float det = b * b - c_sph;
          if (det > 0.0) {
              // Maju hingga sedikit masuk ke dalam bola (0.01) untuk mencegah bug presisi desimal (shattered circle fix)
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

          // Adaptive step (Cepat, efisien, dan presisi)
          float dt = 0.05 + 0.04 * r; 
          float dR = length(p.xz);

          vec3 a = -1.5 * RS * h2 * p / (r2 * r2 * r);
          
          // [FIX] Memudarkan gravitasi secara perlahan dari R=15 hingga R=40
          // Menghilangkan cincin batas tanpa perlu merender terlalu jauh
          a *= smoothstep(maxR, 15.0, r); 
          
          // Rendering Cakram Akresi - Evaluasi pra-langkah untuk Anti-Aliasing
          float h = abs(p.y);
          float pixelSize = length(uCameraPos) * 0.002;
          float effThickness = max(diskThickness + dt * 0.5, pixelSize); 
          
          // [FIX] Cegah undersampling: Paksa langkah menjadi lebih kecil SAAT berada di dalam cakram virtual
          // Ini menjamin sinar akan mengambil minimal 2.5 sampel di dalam ketebalan cakram, menghilangkan celah gelap (terpotong)
          if (dR > diskInner - 1.0 && dR < diskOuter + 2.0 && h < effThickness * 1.5) {
              dt = min(dt, effThickness * 0.4); 
          }
          
          v = normalize(v + a * dt);
          p += v * dt;

          float distToPhoton = abs(r - 1.5 * RS);
          photonGlow += exp(-distToPhoton * 40.0) * dt * trans * 3.0;
          
          if (dR > diskInner && dR < diskOuter && h < effThickness) {
              
              // [FIX] Inner edge lebih tajam mirip referensi asli
              float radialFalloff = smoothstep(diskOuter, diskOuter - 6.0, dR) * smoothstep(diskInner, diskInner + 0.2, dR);
              
              // [FIX] Uniform Sampling Integration
              // Saat dilihat dari jauh, meratakan profil vertikal menjadi seragam (1.0) untuk menghilangkan variansi sampling.
              // Ini menjamin halo/cincin lensed SELALU solid dan tidak terpotong-potong meskipun langkahnya sangat cepat.
              float verticalFalloff = exp(-pow(h / (effThickness * 0.5), 2.5));
              float isFar = smoothstep(0.1, 0.5, pixelSize); 
              verticalFalloff = mix(verticalFalloff, 1.0, isFar);
              
              // Menormalisasi kepadatan agar disk menebal secara virtual tetapi massanya tetap konstan
              float baseDens = radialFalloff * verticalFalloff * 8.0 * (diskThickness / effThickness); 
              
              if (baseDens > 0.01) {
                  // [FIX] Efek garis cincin (Banding) seperti Saturnus/Piringan Hitam sesuai referensi
                  float rings = abs(sin(dR * 4.0 + fbm(vec3(dR * 0.5, 0.0, 0.0)) * 2.0));
                  rings = mix(0.6, 1.0, smoothstep(0.2, 0.8, rings));
                  
                  float plasma = fbm(vec3(dR * 2.0, atan(p.z, p.x) * 3.0 - uTime * 0.5, p.y * 10.0));
                  plasma = mix(0.5, 1.2, plasma) * rings; 
                  
                  float dens = baseDens * plasma;
                  
                  vec3 vDisk = normalize(vec3(-p.z, 0.0, p.x));
                  float doppler = 1.0 + dot(v, vDisk) * 0.8; 
                  
                  float t_color = (dR - diskInner) / (diskOuter - diskInner);
                  // [FIX] Palet warna Monokrom (Hitam Putih) agar menyatu dengan konsep ruang hampa
                  vec3 coreColor = vec3(10.0, 10.0, 10.0);  
                  vec3 midColor  = vec3(2.0, 2.0, 2.0);     
                  vec3 edgeColor = vec3(0.2, 0.2, 0.2);   
                  
                  vec3 emitColor;
                  if (t_color < 0.2) emitColor = mix(coreColor, midColor, smoothstep(0.0, 0.2, t_color));
                  else emitColor = mix(midColor, edgeColor, smoothstep(0.2, 1.0, t_color));
                  
                  // Doppler effect diperkuat agar sisi kiri sangat terang dan sisi kanan meredup/merah
                  vec3 emit = emitColor * dens * pow(doppler, 3.5);
                  
                  float absorb = dens * dt * 15.0;
                  // [FIX] Rumus emisi kini linear terhadap densitas (emit * dt) bukan kuadratik (emit * absorb)
                  // Ini menjaga kecerahan cincin tetap absolut stabil walaupun ketebalan virtualnya membesar!
                  col += emit * dt * trans * 4.0;
                  trans *= exp(-absorb);
              }
          }
          if (trans < 0.01) break;
      }
      
      col += vec3(1.0, 1.0, 1.0) * photonGlow * trans;
      
      // ==========================================
      // MILKY WAY (PHYSICAL SPHERE FOR 3D ZOOM/SCALE)
      // ==========================================
      if (trans > 0.01) {
          // Bola fisik kosmik raksasa (Radius 800)
          // Memastikan background ikut mengecil/membesar saat kamera bergerak maju/mundur
          float bgRadius = 800.0;
          
          // [FIX] Proyeksikan dari posisi terakhir sinar (p), bukan kamera asli (ro)
          // Ini mencegah noise abu-abu dan distorsi matematika saat kamera zoom-out jauh
          float b = dot(p, v);
          float c_sph = dot(p, p) - bgRadius * bgRadius;
          float det = b * b - c_sph;
          
          vec3 bgDir = v; // Arah default
          if (det > 0.0) {
              float t_bg = -b + sqrt(det);
              if (t_bg > 0.0) {
                  vec3 p_bg = p + v * t_bg; // Posisi fisik pada permukaan bola
                  bgDir = normalize(p_bg); // Menyesuaikan proyeksi skala berdasarkan jarak kamera
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
          
          // 3. Taburan Bintang NASA-style (Warna-warni, Sangat Jarang, Parallax Skala)
          
          // Layer 1: Bintang Latar Belakang Jauh
          float s1 = smoothStar(bgDir, 400.0);
          vec3 c1 = mix(vec3(0.6, 0.8, 1.0), vec3(1.0, 0.8, 0.6), hash(bgDir * 10.0)); // Biru pucat ke Oranye
          vec3 stars = c1 * s1 * 2.5;
          
          // Layer 2: Bintang Menengah 
          float s2 = smoothStar(bgDir + vec3(10.0), 300.0);
          vec3 c2 = mix(vec3(1.0, 0.9, 0.8), vec3(0.5, 0.7, 1.0), hash(bgDir * 20.0)); // Kuning ke Biru Terang
          stars += c2 * s2 * 3.0;
          
          // Layer 3: Bintang Dekat 
          float s3 = smoothStar(bgDir + vec3(20.0), 150.0);
          vec3 c3 = mix(vec3(1.0, 1.0, 1.0), vec3(1.0, 0.5, 0.4), hash(bgDir * 30.0)); // Putih ke Merah
          stars += c3 * s3 * 4.0;
          
          vec3 bgCol = vec3(galaxyGlow); 
          bgCol += stars; 
          
          col += bgCol * trans;
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
