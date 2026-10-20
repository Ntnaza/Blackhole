import React, { useRef, useMemo, useState } from 'react'
import { Canvas, useFrame, useThree, createPortal } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { vertexShader, fragmentShader } from './shaders'
import Starfield3D from './Starfield3D'

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
    const w = Math.floor(size.width * gl.getPixelRatio())
    const h = Math.floor(size.height * gl.getPixelRatio())
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
    </>
  )
}

// ============================================================
// APP UTAMA
// ============================================================
export default function App() {
  const [tilt, setTilt] = useState(-0.15); // Kemiringan default yang sinematik persis referensi Interstellar

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#000', overflow: 'hidden' }}>
      <Canvas 
        dpr={[1, 1.5]}
        gl={{ 
          antialias: false, 
          powerPreference: "high-performance",
          alpha: false,
        }}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: '#000' }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(0x000000, 1)
          scene.background = new THREE.Color(0x000000)
        }}
      >
        <PerspectiveCamera makeDefault position={[0, 6, 20]} fov={50} far={7000} />
        
        {/* Scene dengan gravitational lensing */}
        <LensedScene tilt={tilt} />
        
        <OrbitControls 
          enableDamping 
          dampingFactor={0.05} 
          minDistance={3} 
          maxDistance={400} 
        />
      </Canvas>

      {/* Cinematic UI Overlay untuk Kemiringan (Tilt POV) */}
      <div style={{
        position: 'absolute',
        bottom: '40px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(10, 10, 12, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        padding: '12px 24px',
        borderRadius: '20px',
        backdropFilter: 'blur(12px)',
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
