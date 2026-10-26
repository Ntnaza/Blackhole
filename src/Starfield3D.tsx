import { useRef, useMemo } from 'react'

import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ============================================================
// NASA-STYLE STARFIELD
// Mengikuti teknik NASA Eyes on the Solar System:
// - Semua bintang di satu celestial sphere radius besar
// - PointsMaterial dengan sizeAttenuation
// - Additive blending untuk efek glow alami
// - Texture sprite bulat untuk tampilan realistis
// ============================================================


// ============================================================
// STARFIELD CONFIG — NASA-style: satu shell besar
// ============================================================
const STAR_COUNT = 400    // Lebih sedikit seperti NASA
const RADIUS_MIN = 80
const RADIUS_MAX = 800

function generateStars() {
  // Stable constellation across reloads, quality modes and photo sessions.
  let seed = 7319
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const positions = new Float32Array(STAR_COUNT * 3)
  const colors = new Float32Array(STAR_COUNT * 3)
  const sizes = new Float32Array(STAR_COUNT)
  
  const color = new THREE.Color()
  
  for (let i = 0; i < STAR_COUNT; i++) {
    // Distribusi bola seragam
    const u = random()
    const v = random()
    const theta = u * 2.0 * Math.PI
    const phi = Math.acos(2.0 * v - 1.0)
    
    // Distribusi radius: power law — kebanyakan di jarak menengah-jauh
    // tapi sebagian kecil di dekat untuk parallax kuat
    const t = random()
    const r = RADIUS_MIN + Math.pow(t, 0.6) * (RADIUS_MAX - RADIUS_MIN)
    
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
    
    // Warna dibagi SAMA RATA (masing-masing 25%):
    // 1. Biru (Blue / Sapphire) — 25%
    // 2. Kuning / Emas (Golden Yellow) — 25%
    // 3. Oranye (Warm Amber / Orange) — 25%
    // 4. Merah / Ruby (Crimson / Red) — 25%
    const colorCategory = i % 4
    if (colorCategory === 0) {
      // Biru
      color.setHSL(0.58 + random() * 0.08, 0.85, 0.45 + random() * 0.12)
    } else if (colorCategory === 1) {
      // Kuning / Emas
      color.setHSL(0.12 + random() * 0.05, 0.90, 0.50 + random() * 0.12)
    } else if (colorCategory === 2) {
      // Oranye
      color.setHSL(0.06 + random() * 0.04, 0.95, 0.48 + random() * 0.12)
    } else {
      // Merah / Ruby
      color.setHSL(0.00 + random() * 0.04, 0.92, 0.48 + random() * 0.12)
    }
    
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
    
    // Variasi ukuran (mempertahankan warna masing-masing)
    const sizeRng = random()
    if (sizeRng > 0.97) {
      // Bintang besar (~3%)
      sizes[i] = 4.5 + random() * 2.5
    } else if (sizeRng > 0.90) {
      // Bintang agak besar (~7%)
      sizes[i] = 2.5 + random() * 2.0
    } else if (sizeRng > 0.65) {
      // Bintang sedang (~25%)
      sizes[i] = 1.2 + random() * 1.3
    } else {
      // Bintang kecil (~65%)
      sizes[i] = 0.4 + random() * 0.8
    }
  }
  
  return { positions, colors, sizes }
}

// ============================================================
// CUSTOM SHADER untuk ukuran per-bintang & twinkling
// ============================================================
const vertexShader = `
  attribute float aSize;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  
  void main() {
    vColor = color;
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = -mvPosition.z;
    
    // TANPA twinkling — menghilangkan efek semut/flicker saat bergerak
    
    // Ukuran perspektif
    float pointSize = aSize * uPixelRatio * (400.0 / max(dist, 1.0));
    pointSize = clamp(pointSize, 2.5 * uPixelRatio, 12.0 * uPixelRatio);  // Min 2.5px — anti kelap-kelip
    
    gl_PointSize = pointSize;
    gl_Position = projectionMatrix * mvPosition;
    
    // Fade halus berdasarkan jarak
    vAlpha = (1.0 - smoothstep(200.0, 3500.0, dist));
    
    // Anti kelap-kelip AGRESIF: bintang kecil sangat pudar
    // Semakin kecil bintang, semakin transparan — mencegah flicker subpixel
    float sizeFade = smoothstep(2.0, 4.5, pointSize / uPixelRatio);
    vAlpha *= sizeFade;
  }
`

const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  
  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    
    // Profil bintang: core kecil tajam + bayangan cahaya terlihat
    float intensity = exp(-dist * dist * 50.0);        // Core kecil & tajam
    float glow = exp(-dist * dist * 5.0) * 0.3;        // Bayangan cahaya (lebih terlihat)
    float star = intensity + glow;
    
    // Buang di luar lingkaran
    if (dist > 0.47) discard;
    
    // Smooth edge
    float edgeFade = (1.0 - smoothstep(0.3, 0.47, dist));
    star *= edgeFade;
    
    float alpha = star * vAlpha;
    if (alpha < 0.002) discard;
    
    // Multiplier tinggi agar warna biru tua terlihat setelah dipudarkan
    gl_FragColor = vec4(vColor * star * 3.0, alpha);
  }
`

// ============================================================
// KOMPONEN UTAMA
// ============================================================
export default function Starfield3D() {
  const materialRef = useRef<THREE.ShaderMaterial>(null!)

  
  const data = useMemo(() => generateStars(), [])
  
  const uniforms = useMemo(() => ({
    uPixelRatio: { value: 1.0 },
  }), [])
  
  // Quality changes must not change the apparent size or brightness of the stars.
  useFrame(({ gl }) => {
    if (materialRef.current?.uniforms?.uPixelRatio) {
      materialRef.current.uniforms.uPixelRatio.value = gl.getPixelRatio()
    }
  }, -1)
  
  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[data.positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[data.colors, 3]}
        />
        <bufferAttribute
          attach="attributes-aSize"
          args={[data.sizes, 1]}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        vertexColors
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}


