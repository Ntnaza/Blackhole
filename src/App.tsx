import React, { useRef, useMemo, useState } from 'react'
import { Canvas, useFrame, useThree, createPortal } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { vertexShader, fragmentShader } from './shaders'
import Starfield3D from './Starfield3D'
import CosmicNebula from './CosmicNebula'

// ============================================================
// BLACKHOLE MESH — Shader raymarching + gravitational lensing pada bintang
// ============================================================
const BlackholeMass = ({ tilt, starTexture }: { tilt: number, starTexture: THREE.Texture }) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null!)
  const { size, gl, camera } = useThree()

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(size.width, size.height) },
    uCameraPos: { value: new THREE.Vector3() },
    uTilt: { value: tilt },
    uStarTexture: { value: starTexture },
    uProjMatrix: { value: new THREE.Matrix4() },
    uViewMat: { value: new THREE.Matrix4() },
  }), [size])

  // Memaksa update uniform saat slider digeser
  React.useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTilt.value = tilt;
    }
  }, [tilt]);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime * 0.5
      materialRef.current.uniforms.uResolution.value.set(
        size.width * gl.getPixelRatio(),
        size.height * gl.getPixelRatio()
      )
      materialRef.current.uniforms.uCameraPos.value.copy(camera.position)
      // Update star FBO texture + matrices untuk lensing
      materialRef.current.uniforms.uStarTexture.value = starTexture
      materialRef.current.uniforms.uProjMatrix.value.copy(camera.projectionMatrix)
      materialRef.current.uniforms.uViewMat.value.copy(camera.matrixWorldInverse)
    }
  })

  return (
    <mesh scale={[3000, 3000, 3000]}>
      {/* 
        Bola raksasa yang membungkus semesta. 
        Shader merender blackhole + accretion disk + bintang terlensing.
      */}
      <sphereGeometry args={[1, 128, 128]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        transparent={false}
      />
    </mesh>
  )
}

// ============================================================
// LENSED SCENE — Render bintang ke FBO, lalu blackhole sampel FBO
// dengan UV terdistorsi oleh gravitasi
// ============================================================
function LensedScene({ tilt }: { tilt: number }) {
  const { gl, camera, size } = useThree()
  
  // Scene terpisah untuk bintang
  const starScene = useMemo(() => new THREE.Scene(), [])
  
  // FBO (Framebuffer Object) untuk merender bintang
  const fbo = useMemo(() => new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  }), [])
  
  useFrame(() => {
    // Sesuaikan ukuran FBO dengan layar native
    const w = Math.max(1, Math.floor(size.width))
    const h = Math.max(1, Math.floor(size.height))
    if (fbo.width !== w || fbo.height !== h) {
      fbo.setSize(w, h)
    }
    
    // Render bintang ke FBO (framebuffer terpisah)
    gl.setRenderTarget(fbo)
    gl.setClearColor(0x000000, 1)
    gl.clear()
    gl.render(starScene, camera)
    gl.setRenderTarget(null)
    gl.setClearColor(0x000000, 1)
  }, -1) // Priority -1: dijalankan SEBELUM useFrame lain
  
  return (
    <>
      {/* Bintang dirender ke FBO melalui portal */}
      {createPortal(<Starfield3D />, starScene)}
      
      {/* Blackhole dengan texture bintang untuk gravitational lensing */}
      <BlackholeMass tilt={tilt} starTexture={fbo.texture} />

      {/* Awan Kosmik Volumetrik 3D Nyata di Koordinat Angkasa */}
      <CosmicNebula position={[150, 25, -200]} />
    </>
  )
}

// ============================================================
// CAMERA FOCUS CONTROLLER — Transisi halus ala NASA Eyes
// ============================================================
const NEBULA_CENTER = new THREE.Vector3(150, 25, -200)

function CameraFocusController({ 
  focusTarget, 
  controlsRef 
}: { 
  focusTarget: 'blackhole' | 'nebula'
  controlsRef: React.RefObject<any> 
}) {
  const { camera } = useThree()
  
  const desiredTarget = useMemo(() => new THREE.Vector3(), [])
  const desiredCamPos = useMemo(() => new THREE.Vector3(), [])
  const isTransitioning = useRef(false)

  React.useEffect(() => {
    isTransitioning.current = true
    const timer = setTimeout(() => {
      isTransitioning.current = false
    }, 2200) // Durasi transisi halus 2.2 detik
    return () => clearTimeout(timer)
  }, [focusTarget])

  useFrame((_, delta) => {
    if (!controlsRef.current) return

    if (focusTarget === 'blackhole') {
      desiredTarget.set(0, 0, 0)
      desiredCamPos.set(0, 8, 28)
    } else {
      // Fokus Nebula 3D: arahkan target langsung ke jantung pilar gas
      desiredTarget.copy(NEBULA_CENTER)
      // Kamera berjarak 75 unit memperlihatkan seluruh jaringan sulur petir kabut
      desiredCamPos.set(NEBULA_CENTER.x, NEBULA_CENTER.y + 6, NEBULA_CENTER.z + 75)
    }

    if (isTransitioning.current) {
      const t = Math.min(delta * 2.2, 1.0)
      controlsRef.current.target.lerp(desiredTarget, t)
      camera.position.lerp(desiredCamPos, t)
      controlsRef.current.update()
    }
  })

  return null
}

// ============================================================
// APP UTAMA
// ============================================================
export default function App() {
  const [tilt, setTilt] = useState(-0.20); // Kemiringan default yang sinematik persis referensi Interstellar
  const [focusTarget, setFocusTarget] = useState<'blackhole' | 'nebula'>('blackhole');
  const controlsRef = useRef<any>(null)

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#000', overflow: 'hidden' }}>
      
      {/* Top HUD: Target Focus Selector (Gaya NASA Eyes) */}
      <div style={{
        position: 'absolute',
        top: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(8, 10, 16, 0.78)',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        padding: '6px 8px',
        borderRadius: '30px',
        backdropFilter: 'blur(16px)',
        color: '#eee',
        fontFamily: '"Inter", "Helvetica Neue", sans-serif',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
        zIndex: 20
      }}>
        <button
          onClick={() => setFocusTarget('blackhole')}
          style={{
            background: focusTarget === 'blackhole' ? 'rgba(255, 255, 255, 0.16)' : 'transparent',
            border: focusTarget === 'blackhole' ? '1px solid rgba(255, 255, 255, 0.35)' : '1px solid transparent',
            color: focusTarget === 'blackhole' ? '#fff' : 'rgba(255, 255, 255, 0.5)',
            padding: '8px 18px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '1px',
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span style={{ 
            width: '7px', 
            height: '7px', 
            borderRadius: '50%', 
            background: focusTarget === 'blackhole' ? '#fff' : 'rgba(255, 255, 255, 0.3)',
            boxShadow: focusTarget === 'blackhole' ? '0 0 8px rgba(255,255,255,0.8)' : 'none'
          }} />
          BLACK HOLE
        </button>

        <button
          onClick={() => setFocusTarget('nebula')}
          style={{
            background: focusTarget === 'nebula' ? 'rgba(255, 255, 255, 0.16)' : 'transparent',
            border: focusTarget === 'nebula' ? '1px solid rgba(255, 255, 255, 0.35)' : '1px solid transparent',
            color: focusTarget === 'nebula' ? '#fff' : 'rgba(255, 255, 255, 0.5)',
            padding: '8px 18px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '1px',
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span style={{ 
            width: '7px', 
            height: '7px', 
            borderRadius: '50%', 
            background: focusTarget === 'nebula' ? '#4db2ff' : 'rgba(255, 255, 255, 0.3)',
            boxShadow: focusTarget === 'nebula' ? '0 0 8px rgba(77, 178, 255, 0.9)' : 'none'
          }} />
          COSMIC NEBULA
        </button>
      </div>

      <Canvas 
        dpr={1}
        gl={{ 
          antialias: false, 
          powerPreference: "high-performance",
          alpha: false,
          stencil: false,
          depth: true,
        }}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: '#000' }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(0x000000, 1)
          scene.background = new THREE.Color(0x000000)
        }}
      >
        <PerspectiveCamera makeDefault position={[0, 8, 28]} fov={50} far={7000} />
        
        {/* Scene dengan gravitational lensing */}
        <LensedScene tilt={tilt} />

        {/* Kontroler Fokus Kamera Mulus */}
        <CameraFocusController 
          focusTarget={focusTarget} 
          controlsRef={controlsRef} 
        />
        
        <OrbitControls 
          ref={controlsRef}
          enableDamping 
          dampingFactor={0.05} 
          minDistance={1} 
          maxDistance={500} 
        />
      </Canvas>

      {/* Cinematic UI Overlay untuk Kemiringan (Tilt POV) */}
      <div style={{
        position: 'absolute',
        bottom: '36px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(8, 10, 16, 0.78)',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        padding: '10px 22px',
        borderRadius: '24px',
        backdropFilter: 'blur(14px)',
        color: '#eee',
        fontFamily: '"Inter", "Helvetica Neue", sans-serif',
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        zIndex: 10
      }}>
        <label style={{ fontSize: '11px', letterSpacing: '1.5px', fontWeight: 600, opacity: 0.8 }}>
          TILT POV
        </label>
        <input 
          type="range" 
          min="-1.5" 
          max="1.5" 
          step="0.01" 
          value={tilt} 
          onChange={(e) => setTilt(parseFloat(e.target.value))} 
          style={{ 
            width: '160px', 
            accentColor: '#fff',
            cursor: 'pointer' 
          }}
        />
      </div>
    </div>
  )
}
