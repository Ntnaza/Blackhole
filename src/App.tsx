import React, { useRef, useMemo, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { vertexShader, fragmentShader } from './shaders'

const BlackholeMass = ({ tilt }: { tilt: number }) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null!)
  const { size, gl, camera } = useThree()

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(size.width, size.height) },
    uCameraPos: { value: new THREE.Vector3() },
    uTilt: { value: tilt }
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
      // Kirim posisi kamera asli ke shader
      materialRef.current.uniforms.uCameraPos.value.copy(camera.position)
    }
  })

  return (
    <mesh scale={[1500, 1500, 1500]}>
      {/* 
        Bola raksasa yang membungkus semesta. 
        Shader merender simulasi di permukaan dalamnya. 
      */}
      <sphereGeometry args={[1, 64, 64]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide} // Render bagian dalam bola
        transparent={false}
      />
    </mesh>
  )
}

export default function App() {
  const [tilt, setTilt] = useState(-0.15); // Kemiringan default yang sinematik

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', position: 'relative' }}>
      <Canvas 
        dpr={[1, 1.5]}
        gl={{ 
          antialias: false, 
          powerPreference: "high-performance"
        }}
      >
        <PerspectiveCamera makeDefault position={[0, 6, 20]} fov={50} far={3000} />
        
        <BlackholeMass tilt={tilt} />
        
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
