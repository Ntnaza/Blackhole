import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// ============================================================
// COSMIC NEBULA 3D — JALARAN PETIR KABUT KOSMIK (Radial Dendritic Mist)
// Menghasilkan struktur petir kosmik yang memancar keluar dari titik pusat:
// - Memancar dari titik origin (0,0,0) ke segala arah (Radial Lightning Streamers)
// - Percabangan petir tajam yang terbungkus oleh jalaran kabut terionisasi
// - Ruang kosong antar cabang 100% transparan memperlihatkan bintang
// - Fading radial sempurna (1.0 - smoothstep(12.0, 33.0, r)) — ZERO batas bola!
// ============================================================

const volumetricVertexShader = `
  varying vec3 vLocalPosition;

  void main() {
    vLocalPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const volumetricFragmentShader = `
  precision highp float;
  uniform vec3 uLocalCameraPos;
  uniform float uTime;
  varying vec3 vLocalPosition;

  #define STEPS 36

  // Fast sine-free 3D hash & noise
  float hash3(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.zyx + 31.32);
      return fract((p.x + p.y) * p.z);
  }

  float noise3D(vec3 x) {
      vec3 i = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
          mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
              mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
              mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z
      );
  }

  // Interseksi sinar terhadap bola volume pembungkus
  vec2 intersectSphere(vec3 ro, vec3 rd, float rad) {
      float b = dot(ro, rd);
      float c = dot(ro, ro) - rad * rad;
      float d = b * b - c;
      if (d < 0.0) return vec2(-1.0);
      float s = sqrt(d);
      return vec2(-b - s, -b + s);
  }

  void main() {
      vec3 ro = uLocalCameraPos;
      vec3 rd = normalize(vLocalPosition - uLocalCameraPos);

      float volumeRadius = 40.0;
      vec2 hit = intersectSphere(ro, rd, volumeRadius);
      if (hit.y < 0.0) discard;

      // Jika kamera di dalam awan, mulai tepat di depan lensa kamera
      float tStart = max(hit.x, 0.2);
      float tEnd = hit.y;
      float rayLength = tEnd - tStart;
      if (rayLength <= 0.0) discard;

      float dt = rayLength / float(STEPS);
      
      // Dither halus untuk menghilangkan color banding
      float dither = (hash3(vec3(gl_FragCoord.xy, 1.0)) - 0.5) * 0.25;
      float t = tStart + dt * (0.5 + dither);

      vec3 col = vec3(0.0);
      float trans = 1.0;

      // Palet warna energi petir kosmik & jalaran kabut
      vec3 colCoreWhite   = vec3(22.0, 20.0, 24.0); // Pijaran sambaran petir putih murni
      vec3 colElectricPink= vec3(7.5, 2.2, 6.8);    // Pijaran listrik magenta neon
      vec3 colMistViolet  = vec3(1.6, 0.22, 2.2);   // Jalaran kabut di daerah tersengat petir
      vec3 colMistIndigo  = vec3(0.18, 0.05, 0.85); // Ujung kabut: deep cosmic indigo
      vec3 colWarmGold    = vec3(2.2, 1.3, 0.35);   // Aksen debu emas ionisasi

      for(int i = 0; i < STEPS; i++) {
          if (t > tEnd || trans < 0.012) break;
          vec3 p = ro + rd * t;

          float r = length(p);
          if (r < 35.0) {
              // 1. FADE OUT RADIAL HALUS — Menjamin gas habis di r=34 unit (ZERO batas bola!)
              float radialFade = 1.0 - smoothstep(12.0, 34.0, r);
              if (radialFade <= 0.002) { t += dt; continue; }

              vec3 dir = p / (r + 0.0001);

              // 2. STRUKTUR PETIR RADIAL (Memancar dari titik pusat keluar ke segala arah)
              // Menggunakan koordinat arah angular (dir) sehingga cabang petir merambat keluar
              vec3 rayCoord = dir * 3.8;
              
              // Tambahkan liukan listrik pada jalur petir saat merambat keluar (swirl / wiggle)
              vec3 wiggle = vec3(
                  sin(r * 0.18 + uTime * 0.03),
                  cos(r * 0.18 - uTime * 0.025),
                  sin(r * 0.18 * 0.7 + uTime * 0.03)
              ) * 0.55;
              
              vec3 pTrunk = rayCoord + wiggle;
              float nTrunk = abs(noise3D(pTrunk) - 0.5);

              vec3 pBranch = rayCoord * 2.2 + wiggle * 1.4 + vec3(1.7, 4.3, 0.8);
              float nBranch = abs(noise3D(pBranch) - 0.5);

              // Jarak ke jalur petir bercabang terdekat
              float lightningDist = min(nTrunk, nBranch * 1.3);

              // 3. RUANG KOSONG TRANSFARAN ANTAR CABANG PETIR
              // Di luar daerah sambaran (lightningDist > 0.17), ruang adalah hampa gelap
              if (lightningDist > 0.17) {
                  // Hanya render titik pusat origin (bintang/nexus)
                  if (r < 4.0) {
                      float nexus = exp(-r * 0.8) * 2.5;
                      col += colCoreWhite * nexus * dt * trans;
                      trans *= exp(-nexus * dt * 2.5);
                  }
                  t += dt;
                  continue;
              }

              // 4. JALARAN CAHAYA PETIR YANG BERUBAH MENJADI KABUT
              // a. Inti sambaran petir menyala sangat tajam di pusat urat
              float boltCore = exp(-lightningDist * 32.0) * radialFade;

              // b. Jalaran kabut di daerah yang tersengat petir (mist halo)
              float mistHalo = smoothstep(0.17, 0.015, lightningDist);

              // c. Tekstur sutra asap pada kabut
              float smokeTex = noise3D(p * 0.15 + wiggle * 1.5);
              mistHalo *= mix(0.70, 1.30, smokeTex);

              float gasDensity = mistHalo * radialFade;

              // 5. INTI PUSAT (Nexus awal tempat petir memancar)
              float nexusGlow = exp(-r * 0.40) * 2.2;

              // 6. SILUET URAT DEBU GELAP (Menambah kedalaman 3D)
              float darkVein = smoothstep(0.045, 0.0, abs(lightningDist - 0.04)) 
                             * smoothstep(4.0, 24.0, r) 
                             * smoothstep(-1.0, 2.5, p.z);

              // 7. KOMPOSISI WARNA
              vec3 emitColor;
              float distRatio = clamp(r / 30.0, 0.0, 1.0);
              if (distRatio < 0.28) {
                  emitColor = mix(colElectricPink, colMistViolet, distRatio / 0.28);
              } else {
                  emitColor = mix(colMistViolet, colMistIndigo, (distRatio - 0.28) / 0.72);
              }

              // Aksen emas stardust di ujung percabangan
              emitColor = mix(emitColor, colWarmGold, smoothstep(0.65, 0.95, smokeTex) * 0.35);

              // Emisi petir putih-pink menyala di dalam jalaran kabut
              vec3 boltEmit = mix(colElectricPink, colCoreWhite, smoothstep(0.15, 0.85, boltCore)) * boltCore * 5.0;
              
              // Emisi pusat nexus
              vec3 nexusEmit = colCoreWhite * nexusGlow * 1.5;

              vec3 totalEmit = (emitColor * gasDensity * 2.8 + boltEmit + nexusEmit) * (1.0 - darkVein * 0.92);
              float absorption = (gasDensity * 0.40 + darkVein * 8.5) * dt;

              col += totalEmit * dt * trans;
              trans *= exp(-absorption);
          }

          t += dt;
      }

      float alpha = clamp(1.0 - trans, 0.0, 1.0);
      if (alpha < 0.003) discard;

      // Tone mapping kontras tinggi
      col = col / (col + vec3(1.0));
      col = pow(col, vec3(1.1));

      // Feathering lembut batas alpha
      col *= smoothstep(0.0, 0.08, alpha);

      gl_FragColor = vec4(col, alpha);
  }
`

// ============================================================
// KOMPONEN UTAMA COSMIC NEBULA 3D
// ============================================================
export interface CosmicNebulaProps {
  position?: [number, number, number]
}

export default function CosmicNebula({
  position = [150, 25, -200], // Koordinat di kedalaman angkasa
}: CosmicNebulaProps) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const materialRef = useRef<THREE.ShaderMaterial>(null!)
  const { camera } = useThree()

  // Uniforms untuk raymarching volumetrik lokal
  const uniforms = useMemo(() => ({
    uLocalCameraPos: { value: new THREE.Vector3() },
    uTime: { value: 0 },
  }), [])

  useFrame((state) => {
    const time = state.clock.elapsedTime
    if (meshRef.current && materialRef.current) {
      // Rotasi sangat lambat pada skala kosmik
      meshRef.current.rotation.y = time * 0.004
      meshRef.current.rotation.z = Math.sin(time * 0.002) * 0.015
      meshRef.current.updateMatrixWorld()

      const localCam = camera.position.clone()
      meshRef.current.worldToLocal(localCam)
      materialRef.current.uniforms.uLocalCameraPos.value.copy(localCam)
      materialRef.current.uniforms.uTime.value = time * 0.8
    }
  })

  return (
    <group position={position} rotation={[0.15, -0.20, 0.12]}>
      {/* 
        Mesh Pembungkus Volumetrik (Radius 40)
        side={THREE.BackSide} menjamin rendering efisien tanpa double-pass
        dan memungkinkan kamera masuk bebas ke dalam jalaran kabut petir 3D!
      */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[40, 48, 48]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={volumetricVertexShader}
          fragmentShader={volumetricFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  )
}
