import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ============================================================
// NOISE GENERATOR CEPAT (FBM) UNTUK TEKSTUR PLANET
// ============================================================
function createNoise2D() {
  const perm = new Uint8Array(512)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1))
    const tmp = p[i]; p[i] = p[r]; p[r] = tmp
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]

  function grad(hash: number, x: number, y: number) {
    const h = hash & 7
    const u = h < 4 ? x : y
    const v = h < 4 ? y : x
    return ((h & 1) ? -u : u) + ((h & 2) ? -2.0 * v : 2.0 * v)
  }

  return function noise(x: number, y: number): number {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    const xf = x - Math.floor(x)
    const yf = y - Math.floor(y)
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
    
    const a = perm[X] + Y
    const aa = perm[a]
    const ab = perm[a + 1]
    const b = perm[X + 1] + Y
    const ba = perm[b]
    const bb = perm[b + 1]
    
    const x1 = THREE.MathUtils.lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u)
    const x2 = THREE.MathUtils.lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u)
    return THREE.MathUtils.lerp(x1, x2, v)
  }
}

// ============================================================
// GENERATE TEKSTUR PERMUKAAN PLANET (SAMUDRA & BENUA)
// ============================================================
function createPlanetTexture(): { map: THREE.Texture, bumpMap: THREE.Texture, roughnessMap: THREE.Texture } {
  const width = 1024
  const height = 512
  
  // Canvas warna
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.createImageData(width, height)
  const data = imgData.data

  // Canvas bump & roughness
  const bumpCanvas = document.createElement('canvas')
  bumpCanvas.width = width
  bumpCanvas.height = height
  const bumpCtx = bumpCanvas.getContext('2d')!
  const bumpImgData = bumpCtx.createImageData(width, height)
  const bumpData = bumpImgData.data

  const roughCanvas = document.createElement('canvas')
  roughCanvas.width = width
  roughCanvas.height = height
  const roughCtx = roughCanvas.getContext('2d')!
  const roughImgData = roughCtx.createImageData(width, height)
  const roughData = roughImgData.data

  const noise = createNoise2D()
  const noise2 = createNoise2D()

  for (let y = 0; y < height; y++) {
    const lat = (y / height) * Math.PI - Math.PI / 2
    const cosLat = Math.cos(lat)
    const isPolar = Math.abs(lat) > (Math.PI / 2 - 0.28) // Kutub es

    for (let x = 0; x < width; x++) {
      const lon = (x / width) * Math.PI * 2
      
      // Proyeksi bola ke 3D noise coordinates
      const nx = cosLat * Math.cos(lon) * 2.8
      const ny = Math.sin(lat) * 2.8
      const nz = cosLat * Math.sin(lon) * 2.8

      // FBM multi-oktaf untuk benua yang detail
      let h = 0
      let amp = 0.55
      let freq = 1.0
      for (let o = 0; o < 5; o++) {
        h += amp * noise(nx * freq + 10.5, ny * freq + nz * freq)
        freq *= 2.05
        amp *= 0.5
      }

      // Detail pulau-pulau kecil
      const micro = noise2(nx * 8.0, ny * 8.0) * 0.12
      h += micro

      const idx = (y * width + x) * 4

      let r = 0, g = 0, b = 0
      let bump = 0
      let roughness = 120

      if (isPolar) {
        // Es Kutub / Polar Caps
        r = 230; g = 240; b = 252
        bump = 180
        roughness = 160
      } else if (h < -0.05) {
        // Samudra Dalam (Abyss)
        r = 4; g = 24; b = 64
        bump = 0
        roughness = 40 // Sangat mengkilap (pantulan air)
      } else if (h < 0.08) {
        // Samudra Terbuka (Open Ocean)
        r = 10; g = 50; b = 110
        bump = 5
        roughness = 45
      } else if (h < 0.16) {
        // Pesisir Dangkal / Terumbu Karang (Turquoise Reef)
        r = 24; g = 135; b = 158
        bump = 25
        roughness = 70
      } else if (h < 0.22) {
        // Garis Pantai Berpasir (Sand Shores)
        r = 185; g = 168; b = 125
        bump = 60
        roughness = 220
      } else if (h < 0.38) {
        // Dataran Hijau / Lembah Subur (Green Plains)
        r = 48; g = 95; b = 48
        bump = 120
        roughness = 230
      } else if (h < 0.52) {
        // Perbukitan & Hutan Dataran Tinggi (Plateau / Woodlands)
        r = 95; g = 85; b = 58
        bump = 180
        roughness = 240
      } else {
        // Pegunungan Berbatu & Puncak Salju (Alpine Mountains)
        if (h > 0.65) {
          r = 235; g = 240; b = 245 // Salju puncak
          bump = 255
        } else {
          r = 130; g = 120; b = 115 // Batuan gunung
          bump = 220
        }
        roughness = 250
      }

      data[idx] = r
      data[idx + 1] = g
      data[idx + 2] = b
      data[idx + 3] = 255

      bumpData[idx] = bump
      bumpData[idx + 1] = bump
      bumpData[idx + 2] = bump
      bumpData[idx + 3] = 255

      roughData[idx] = roughness
      roughData[idx + 1] = roughness
      roughData[idx + 2] = roughness
      roughData[idx + 3] = 255
    }
  }

  ctx.putImageData(imgData, 0, 0)
  bumpCtx.putImageData(bumpImgData, 0, 0)
  roughCtx.putImageData(roughImgData, 0, 0)

  const map = new THREE.CanvasTexture(canvas)
  map.wrapS = THREE.RepeatWrapping
  map.wrapT = THREE.ClampToEdgeWrapping

  const bumpMap = new THREE.CanvasTexture(bumpCanvas)
  bumpMap.wrapS = THREE.RepeatWrapping
  bumpMap.wrapT = THREE.ClampToEdgeWrapping

  const roughnessMap = new THREE.CanvasTexture(roughCanvas)
  roughnessMap.wrapS = THREE.RepeatWrapping
  roughnessMap.wrapT = THREE.ClampToEdgeWrapping

  return { map, bumpMap, roughnessMap }
}

// ============================================================
// GENERATE TEKSTUR LAPISAN AWAN PROSEDURAL
// ============================================================
function createCloudTexture(): THREE.Texture {
  const width = 1024
  const height = 512
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.createImageData(width, height)
  const data = imgData.data

  const noise = createNoise2D()

  for (let y = 0; y < height; y++) {
    const lat = (y / height) * Math.PI - Math.PI / 2
    const cosLat = Math.cos(lat)

    for (let x = 0; x < width; x++) {
      const lon = (x / width) * Math.PI * 2
      const nx = cosLat * Math.cos(lon) * 3.5
      const ny = Math.sin(lat) * 3.5
      const nz = cosLat * Math.sin(lon) * 3.5

      // Pusaran awan dan untaian badai
      let val = 0
      let amp = 0.6
      let freq = 1.0
      for (let o = 0; o < 4; o++) {
        val += amp * noise(nx * freq + 5.2, ny * freq * 1.5 + nz * freq)
        freq *= 2.1
        amp *= 0.5
      }

      // Ambang batas kerapatan awan (hanya muncul di area tertentu)
      const cloudDensity = THREE.MathUtils.smoothstep(val, 0.08, 0.55)
      const alpha = Math.floor(cloudDensity * 220)

      const idx = (y * width + x) * 4
      data[idx] = 255     // R
      data[idx + 1] = 255 // G
      data[idx + 2] = 255 // B
      data[idx + 3] = alpha
    }
  }

  ctx.putImageData(imgData, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

// ============================================================
// SHADER PENDARAN ATMOSFER (ATMOSPHERIC SCATTERING / FRESNEL)
// ============================================================
const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const atmosphereFragmentShader = `
  uniform vec3 uSunPosition;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 lightDir = normalize(uSunPosition - vWorldPosition);
    
    // Efek Fresnel: tepi planet menyala lebih terang, tengah transparan
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);
    
    // Pencahayaan: sisi yang menghadap black hole menyala, sisi malam gelap
    float lightIntensity = dot(vNormal, lightDir);
    float dayNightRim = smoothstep(-0.3, 0.4, lightIntensity);
    
    // Warna atmosfer biru-cyan luar angkasa yang cerah
    vec3 atmosphereColor = vec3(0.28, 0.68, 1.0);
    
    float alpha = fresnel * (dayNightRim * 0.85 + 0.15);
    gl_FragColor = vec4(atmosphereColor * 1.5, alpha);
  }
`

// ============================================================
// KOMPONEN UTAMA PLANET
// ============================================================
export interface OceanPlanetProps {
  orbitRadius?: number
  orbitSpeed?: number
  size?: number
  axialTilt?: number
}

export default function OceanPlanet({
  orbitRadius = 34.0,
  orbitSpeed = 0.08,
  size = 2.0,
  axialTilt = 0.38, // ~22 derajat
}: OceanPlanetProps) {
  const planetRef = useRef<THREE.Group>(null!)
  const cloudsRef = useRef<THREE.Mesh>(null!)
  const atmosphereRef = useRef<THREE.ShaderMaterial>(null!)

  // Buat tekstur secara prosedural sekali saja (memoized)
  const { map, bumpMap, roughnessMap } = useMemo(() => createPlanetTexture(), [])
  const cloudMap = useMemo(() => createCloudTexture(), [])

  // Uniform untuk shader atmosfer
  const atmosphereUniforms = useMemo(() => ({
    uSunPosition: { value: new THREE.Vector3(0, 0, 0) }, // Black hole di [0, 0, 0]
  }), [])

  useFrame((state) => {
    const time = state.clock.elapsedTime

    if (planetRef.current) {
      // 1. Orbit mengelilingi Black Hole di titik [0, 0, 0]
      const angle = time * orbitSpeed
      const x = Math.cos(angle) * orbitRadius
      const z = Math.sin(angle) * orbitRadius
      // Sedikit kemiringan bidang orbit (inclination 5 derajat)
      const y = Math.sin(angle) * (orbitRadius * 0.08)
      planetRef.current.position.set(x, y, z)

      // 2. Rotasi planet pada sumbunya sendiri
      planetRef.current.rotation.y = time * 0.15
    }

    // 3. Rotasi lapisan awan sedikit lebih cepat (pergerakan cuaca atmosfer mandiri)
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y = time * 0.18
      cloudsRef.current.rotation.x = Math.sin(time * 0.05) * 0.02
    }
  })

  return (
    <group ref={planetRef}>
      {/* Kemiringan sumbu rotasi aksial planet (Axial Tilt) */}
      <group rotation={[axialTilt, 0, 0.1]}>
        
        {/* 1. PERMUKAAN UTAMA PLANET (Samudra & Benua) */}
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[size, 64, 64]} />
          <meshStandardMaterial
            map={map}
            bumpMap={bumpMap}
            bumpScale={0.06}
            roughnessMap={roughnessMap}
            roughness={0.7}
            metalness={0.05}
          />
        </mesh>

        {/* 2. LAPISAN AWAN PROSEDURAL (Clouds Layer) */}
        <mesh ref={cloudsRef}>
          <sphereGeometry args={[size * 1.015, 64, 64]} />
          <meshStandardMaterial
            map={cloudMap}
            transparent
            opacity={0.88}
            depthWrite={false}
            blending={THREE.NormalBlending}
          />
        </mesh>

        {/* 3. PENDARAN ATMOSFER (Atmospheric Halo / Rim Glow) */}
        <mesh scale={[1.08, 1.08, 1.08]}>
          <sphereGeometry args={[size, 64, 64]} />
          <shaderMaterial
            ref={atmosphereRef}
            vertexShader={atmosphereVertexShader}
            fragmentShader={atmosphereFragmentShader}
            uniforms={atmosphereUniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.FrontSide}
          />
        </mesh>

      </group>
    </group>
  )
}
