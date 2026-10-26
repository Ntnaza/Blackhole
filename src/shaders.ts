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
  uniform float uGlow;
  uniform float uColorTheme;
  uniform sampler2D uStarTexture;
  uniform mat4 uProjMatrix;
  uniform mat4 uViewMat;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  #define STEPS 120
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

  // 2-octave FBM teroptimasi: 33% lebih hemat komputasi, visual tetap kaya
  float fbm(vec3 p) {
      return 0.65 * noise(p) + 0.35 * noise(p * 2.04);
  }

  // Bintang sekarang dirender sebagai partikel 3D oleh Starfield3D.tsx
  // Shader hanya menangani blackhole, accretion disk, dan photon sphere

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
      // GARGANTUA ACCRETION DISK — Geometri Fisik Kontinu
      // ==========================================
      // Inner radius dimulai tepat di luar photon sphere (1.65 RS),
      // memungkinkan plasma mengalir mulus tanpa rongga terputus di sekitar horizon
      float diskInner = RS * 1.65; 
      float diskOuter = RS * 14.0;
      float diskThickness = 0.14;
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
          
          // Horizon peristiwa: menyerap seluruh radiasi secara absolut
          if (r < RS * 1.05) { 
              trans = 0.0; 
              break; 
          }
          if (r > maxR) break; 

          float dt = 0.06 + 0.045 * r; 
          float dR = length(p.xz);
          float h = abs(p.y);

          // Dither sub-pixel untuk memecah banding akibat langkah ray-marching
          // yang sejajar pada bagian atas cakram. Amplitudonya kecil agar tidak
          // menambah grain yang terlihat dan tidak menambah jumlah langkah.
          float sampleJitter = hash(vec3(gl_FragCoord.xy, 17.31));
          // Jitter kecil menjaga anti-banding tanpa meninggalkan bintik/grain.
          dt *= mix(0.97, 1.03, sampleJitter);

          // Penebalan flaring realistis: cakram tipis di dalam, mengembang lembut ke luar
          float localThickness = diskThickness * (0.65 + 0.035 * dR);
          float maxH = localThickness * 2.8;

          // Adaptasi langkah presisi:
          // Menyesuaikan langkah dengan kecepatan penetrasi vertikal (|v.y|).
          // Pada sudut edge-on (|v.y| kecil), langkah horizontal lapang agar budget langkah (120)
          // tidak habis sebelum menembus seluruh cakram (mencegah sayap terpotong & voxel stepping).
          if (dR > diskInner - 0.5 && dR < diskOuter + 1.0 && h < maxH * 1.2) {
              float dtVertical = localThickness / max(abs(v.y) * 2.8, 0.25);
              float diskStep = clamp(dtVertical, 0.06, 0.18);
              dt = min(dt, diskStep);
          }

          // Pembengkokan lintasan cahaya oleh gravitasi relativistik
          vec3 a = -1.5 * RS * h2 * p / (r2 * r2 * r);
          a *= smoothstep(maxR, 15.0, r); 
          
          v = normalize(v + a * dt);
          
          // Analisis jarak terdekat segmen langkah ke photon sphere (r = 1.5 RS):
          // Menjamin cincin foton SELALU tertangkap dengan mulus tanpa diskontinuitas garis putus-putus
          float tClose = clamp(-dot(p, v), 0.0, dt);
          vec3 pClose = p + v * tClose;
          float rClose = length(pClose);
          if (rClose < 3.2) {
              float distPhoton = abs(rClose - 1.5 * RS);
              // Ring tipis seperti referensi: distribusi lebih tajam mencegah halo
              // putih melebar ke seluruh bagian dalam cakram.
              float glowLevel = clamp(uGlow / 0.6, 0.0, 1.0);
              float photonWidth = mix(42.0, 18.0, glowLevel);
              photonGlow += exp(-distPhoton * photonWidth) * dt * trans * (2.3 + glowLevel * 10.0);
          }

          p += v * dt;

          // Koordinat p terkini setelah melangkah
          r2 = dot(p, p);
          r = sqrt(r2);
          dR = length(p.xz);
          h = abs(p.y);

          if (r < RS * 1.05) {
              trans = 0.0;
              break;
          }

          // ==========================================
          // CAKRAM AKRESI: EMISI DAN ABSORPSI KONTINU
          // ==========================================
          if (dR > diskInner && dR < diskOuter && h < maxH) {
              
              // Outer falloff lebih panjang dan gelap, mengikuti referensi lama
              // yang menghilang lembut ke ruang sebelum mencapai tepi cakram.
              float radialFalloff = smoothstep(diskOuter, diskOuter - 6.5, dR) * smoothstep(diskInner, diskInner + 0.45, dR);
              
              // Profil Gaussian vertikal kontinu (C^1 smooth):
              // Menghilangkan pemotongan kaku garis horizontal flat pada lengkungan lensed
              float verticalFalloff = exp(-0.5 * (h * h) / (localThickness * localThickness));
              verticalFalloff *= smoothstep(maxH, maxH * 0.7, h);
              
              float baseDens = radialFalloff * verticalFalloff * 4.5; 
              
              if (baseDens > 0.005) {
                  // Rotasi diferensial Keplerian kontinu
                  float angle = atan(p.z, p.x);
                  float omega = 3.2 / (dR * sqrt(dR) + 0.2);
                  float spiral = angle + omega * 2.5 - uTime * 0.90;
                  
                  float cSp = cos(spiral);
                  float sSp = sin(spiral);
                  vec2 pRot = mat2(cSp, -sSp, sSp, cSp) * p.xz;
                  
                  // Hindari pola sin radial yang menghasilkan garis konsentris
                  // seperti contour map saat cakram terkena gravitational lensing.
                  // Noise halus menjaga tekstur plasma tanpa garis periodik.
                  float ringNoise = fbm(vec3(pRot * 0.22, 0.0));
                  float rings = mix(0.84, 1.04, ringNoise);
                  
                  // Turbulensi 3D kontinu
                  vec3 plasmaCoord = vec3(pRot * 0.45 + vec2(uTime * 0.07, -uTime * 0.035), p.y * 1.8);
                  float plasma = mix(0.65, 1.25, fbm(plasmaCoord)) * rings;
                  
                  float dens = baseDens * plasma;
                  
                  // Doppler beaming fisik terkalibrasi secara sinematik
                  vec3 vDisk = normalize(vec3(-p.z, 0.0, p.x));
                  // Beaming yang sedikit lebih kuat mengembalikan perbedaan
                  // sisi terang dan sisi bayangan seperti referensi lama.
                  float doppler = 1.0 + dot(v, vDisk) * 0.70; 
                  
                  float t_color = clamp((dR - diskInner) / (diskOuter - diskInner), 0.0, 1.0);
                  
                  // Spektrum warna Gargantua Interstellar:
                  // Inti putih-emas pijar memancar tembus gas luar yang hangat
                  vec3 colHotWhite;
                  vec3 colInnerGold;
                  vec3 colMidOrange;
                  vec3 colOuterAmber;
                  vec3 colEdgeDark;

                  // Palet terpisah hanya mengubah warna emisi; bentuk, bayangan,
                  // dan biaya ray-marching tetap sama untuk semua tema.
                  if (uColorTheme < 0.5) {
                      // Ember — default hangat seperti referensi utama
                      colHotWhite = vec3(9.0, 7.6, 5.8);
                      colInnerGold = vec3(3.8, 2.0, 0.48);
                      colMidOrange = vec3(1.45, 0.50, 0.07);
                      colOuterAmber = vec3(0.34, 0.07, 0.009);
                      colEdgeDark = vec3(0.035, 0.006, 0.001);
                  } else {
                      // Mono — putih, abu-abu, dan hitam dengan highlight netral
                      colHotWhite = vec3(10.0, 10.0, 10.0);
                      colInnerGold = vec3(4.2, 4.2, 4.2);
                      colMidOrange = vec3(1.55, 1.55, 1.55);
                      colOuterAmber = vec3(0.34, 0.34, 0.34);
                      colEdgeDark = vec3(0.035, 0.035, 0.035);
                  }
                  
                  // Gradasi overlap kontinu: setiap warna mulai memudar sebelum
                  // warna berikutnya mengambil alih, sehingga tidak muncul lapisan
                  // putih-oranye yang terputus secara tiba-tiba.
                  float hotToGold = smoothstep(0.006, 0.060, t_color);
                  float goldToOrange = smoothstep(0.12, 0.42, t_color);
                  float orangeToAmber = smoothstep(0.34, 0.76, t_color);
                  float amberToDark = smoothstep(0.68, 1.0, t_color);
                  vec3 emitColor = mix(colHotWhite, colInnerGold, hotToGold);
                  emitColor = mix(emitColor, colMidOrange, goldToOrange);
                  emitColor = mix(emitColor, colOuterAmber, orangeToAmber);
                  emitColor = mix(emitColor, colEdgeDark, amberToDark);
                  
                  vec3 emit = emitColor * dens * pow(doppler, 3.0);
                  
                  // Koefisien absorpsi seimbang:
                  // Memberi volume dan kedalaman nyata pada sudut miring tanpa membuat cakram depan
                  // menjadi balok cokelat legap yang memutus Einstein ring di belakangnya
                  // Absorpsi moderat memberi bayangan gelap tanpa membuat disk
                  // kembali terlihat seperti bidang cokelat yang terpotong.
                  float absorb = dens * dt * 4.8;
                  col += emit * dt * trans * 2.15;
                  trans *= exp(-absorb);
              }
          }

          if (trans < 0.01) break;
      }
      
      // Photon ring glow — putih berpijar hangat, halus dan tajam
      // Jangan tampilkan photon glow pada sinar yang sudah jatuh ke horizon;
      // area bayangan black hole harus tetap benar-benar gelap.
      col += vec3(1.0, 0.95, 0.88) * photonGlow * trans;
      
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
      col *= 1.30; 
      float a_aces = 2.51; float b_aces = 0.03; float c_aces = 2.43; float d_aces = 0.59; float e_aces = 0.14;
      col = clamp((col * (a_aces * col + b_aces)) / (col * (c_aces * col + d_aces) + e_aces), 0.0, 1.0);
      
      // Gamma correction
      col = pow(col, vec3(1.0 / 2.2));

      gl_FragColor = vec4(col, 1.0);
  }
`;
