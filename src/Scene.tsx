import { useEffect, useMemo, useRef } from 'react'
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import Starfield3D from './Starfield3D'
import { vertexShader, fragmentShader } from './shaders'
import type { ColorTheme, SceneOptions, ViewName } from './sceneTypes'

interface Props extends SceneOptions {
  onReady: () => void
  onInteraction: () => void
  onStats: (stats: { fps: number; dpr: number }) => void
  onCapture: (message: string) => void
}
const positions: Record<ViewName, [number, number, number]> = {
  Classic: [0, 6, 20], 'Edge-on': [0, 0.8, 25],
  'Top View': [0, 30, 0.01], Wide: [0, 8, 110], 'Far View': [0, 28, 400],
}
const colorThemeIndex: Record<ColorTheme, number> = { Ember: 0, Mono: 1 }

function Universe(props: Props) {
  const { gl, camera, scene, size, setDpr, invalidate } = useThree()
  const controls = useRef<OrbitControlsImpl>(null)
  const material = useRef<THREE.ShaderMaterial>(null)
  const { onCapture } = props

  const starScene = useMemo(() => new THREE.Scene(), [])
  // Render world-space stars from the live camera, preserving their individual depths.
  const sky = useMemo(() => new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
  }), [])
  const framing = useRef(0)
  const ready = useRef(false)
  const lastCapture = useRef(0)
  const time = useRef(0)
  const lastView = useRef(-1)
  const lastCamera = useRef<THREE.Camera | null>(null)
  const destination = useRef(new THREE.Vector3(0, 6, 20))
  const destDir = useRef(new THREE.Vector3())
  const camDir = useRef(new THREE.Vector3())
  const moving = useRef(false)
  const perf = useRef({ elapsed: 0, frames: 0, cooldown: 2, fastWindows: 0 })
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uResolution: { value: new THREE.Vector2() },
    uCameraPos: { value: new THREE.Vector3() }, uTilt: { value: -0.15 },
    uProjMatrix: { value: new THREE.Matrix4() }, uViewMat: { value: new THREE.Matrix4() },
    uStarTexture: { value: sky.texture }, uGlow: { value: 0.18 }, uColorTheme: { value: 0 },
  }), [sky])

  useEffect(() => {
    return () => sky.dispose()
  }, [sky])

  useEffect(() => {
    const nativeDpr = window.devicePixelRatio || 1
    const max = Math.min(nativeDpr, Math.min(size.width, size.height) <= 700 ? 1 : 1.25)
    // Mulai 'Auto' pada 1.0 (sangat tajam & jernih tanpa pixelasi). Shader sudah 70% lebih ringan!
    const initialDpr = props.quality === 'Low' ? 0.75 : props.quality === 'High' ? max : Math.min(1.0, max)
    setDpr(initialDpr)
    perf.current = { elapsed: 0, frames: 0, cooldown: 1.5, fastWindows: 0 }
  }, [props.quality, size.width, size.height, setDpr])

  useEffect(() => { perf.current.elapsed = 0; perf.current.frames = 0; invalidate() }, [props.visible, invalidate])

  useEffect(() => {
    const canvas = gl.domElement
    const lost = (event: Event) => { event.preventDefault(); onCapture('Koneksi GPU terputus. Menunggu pemulihan…') }
    const restored = () => { invalidate(); onCapture('Rendering dipulihkan.') }
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', restored)
    return () => { canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored) }
  }, [gl, invalidate, onCapture])

  useFrame((_, delta) => {
    if (!props.visible) return
    const dt = Math.min(delta, 0.05)
    const fit = Math.min(3.5, Math.max(1, 1.4 / (size.width / size.height)))
    if (framing.current !== fit) {
      if (framing.current > 0) {
        camera.position.multiplyScalar(fit / framing.current).clampLength(4, 400)
        destination.current.multiplyScalar(fit / framing.current).clampLength(4, 400)
      }
      framing.current = fit
    }
    if (lastView.current !== props.view.revision || lastCamera.current !== camera) {
      const initialView = lastView.current === -1 || lastCamera.current !== camera
      lastCamera.current = camera
      lastView.current = props.view.revision
      destination.current.fromArray(positions[props.view.name]).multiplyScalar(fit).clampLength(4, 400)
      if (initialView) camera.position.copy(destination.current)
      moving.current = true
      // Flush residual pointer inertia before a scripted transition.
      if (controls.current) { controls.current.enableDamping = false; controls.current.update(); controls.current.enableDamping = true }
    }
    if (moving.current) {
      if (props.reduced) camera.position.copy(destination.current)
      else {
        // Interpolate direction on a sphere to avoid travelling through the black hole without memory allocations.
        const currentRadius = camera.position.length()
        const nextRadius = THREE.MathUtils.damp(currentRadius, destination.current.length(), 4, dt)
        destDir.current.copy(destination.current).normalize()
        camDir.current.copy(camera.position).normalize()
        // Cegah NaN singularitas jika kamera tepat berlawanan arah
        if (camDir.current.dot(destDir.current) < -0.999) {
          destDir.current.addScalar(0.005).normalize()
        }
        camera.position.normalize().lerp(destDir.current, 1 - Math.exp(-4 * dt)).normalize().multiplyScalar(nextRadius)
      }
      controls.current?.target.set(0, 0, 0)
      camera.lookAt(0, 0, 0)
      if (camera.position.distanceTo(destination.current) < 0.015) {
        camera.position.copy(destination.current); moving.current = false
      }
      controls.current?.update()
    }
    // Orbit hanya memutar medan bintang. Kamera dan blackhole tetap diam
    // sebagai titik fokus, sementara latar belakang bergerak mengelilinginya.
    if (props.orbit && !props.paused && !moving.current) {
      starScene.rotation.y += Math.min(delta, 0.25) * 0.025 * props.orbitSpeed
    }
    if (!props.paused) time.current += Math.min(delta, 0.25) * props.speed * (props.reduced ? 0.15 : 1.0)
    if (!material.current) return
    const active = material.current.uniforms
    active.uTime.value = time.current
    active.uTilt.value = props.reduced ? props.tilt : THREE.MathUtils.damp(active.uTilt.value, props.tilt, 10, dt)
    active.uGlow.value = THREE.MathUtils.damp(active.uGlow.value, props.glow, 8, dt)
    active.uColorTheme.value = colorThemeIndex[props.colorTheme]

    active.uResolution.value.set(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio())
    active.uCameraPos.value.copy(camera.position)
    camera.updateMatrixWorld()
    active.uProjMatrix.value.copy(camera.projectionMatrix)
    active.uViewMat.value.copy(camera.matrixWorldInverse)
    const width = Math.max(1, Math.floor(size.width * gl.getPixelRatio()))
    const height = Math.max(1, Math.floor(size.height * gl.getPixelRatio()))
    if (sky.width !== width || sky.height !== height) sky.setSize(width, height)
    const previousTarget = gl.getRenderTarget()
    gl.setRenderTarget(sky)
    gl.clear()
    gl.render(starScene, camera)
    gl.setRenderTarget(previousTarget)
    const sample = perf.current
    if (delta > 0 && delta < 0.5) {
      sample.frames++; sample.elapsed += delta; sample.cooldown -= delta
      if (sample.elapsed >= 1.2) {
        const fps = Math.round(sample.frames / sample.elapsed)
        const dpr = gl.getPixelRatio()
        props.onStats({ fps, dpr })
        if (props.quality === 'Auto' && sample.cooldown <= 0) {
          const nativeDpr = window.devicePixelRatio || 1
          const max = Math.min(nativeDpr, Math.min(size.width, size.height) <= 700 ? 1 : 1.15)
          if (fps < 40 && dpr > 0.75) {
            setDpr(Math.max(0.75, Number((dpr - 0.15).toFixed(2))))
            sample.cooldown = 2.0
            sample.fastWindows = 0
          } else if (fps >= 55 && dpr < max) {
            sample.fastWindows++
            if (sample.fastWindows >= 2) {
              setDpr(Math.min(max, Number((dpr + 0.1).toFixed(2))))
              sample.cooldown = 3.5
              sample.fastWindows = 0
            }
          } else {
            sample.fastWindows = 0
          }
        }
        sample.elapsed = 0; sample.frames = 0
      }
    }
  })
  // Own the final render so capture reads the current frame without preserveDrawingBuffer.
  useFrame(() => {
    if (!props.visible) return
    gl.render(scene, camera)
    if (!ready.current) { ready.current = true; props.onReady() }
    if (props.capture !== lastCapture.current) {
      lastCapture.current = props.capture
      try {
        gl.domElement.toBlob(blob => {
          if (!blob) { onCapture('Gambar gagal dibuat. Silakan coba lagi.'); return }
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url; link.download = `blackhole-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
          link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
          onCapture('PNG disimpan tanpa antarmuka.')
        }, 'image/png')
      } catch { onCapture('Browser tidak dapat menyimpan gambar ini.') }
    }
  }, 1)
  return <>
    {createPortal(<Starfield3D />, starScene)}
    <mesh scale={3000} frustumCulled={false}><sphereGeometry args={[1, 32, 24]} /><shaderMaterial ref={material} vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} side={THREE.BackSide} depthWrite={false} toneMapped={false} /></mesh>
    <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={0.085} rotateSpeed={0.85} zoomSpeed={1.2} minDistance={4} maxDistance={400} autoRotate={false} onStart={() => { moving.current = false; props.onInteraction() }} />
  </>
}
export default function Scene(props: Props) {
  return <Canvas className="universe" frameloop={props.visible ? 'always' : 'never'} dpr={[0.75, 1.25]} gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }} fallback={<div className="fallback">WebGL tidak tersedia. Aktifkan akselerasi grafis untuk menjelajah.</div>}>
    <color attach="background" args={['#000000']} />
    <PerspectiveCamera makeDefault position={[0, 6, 20]} fov={50} far={7000} />
    <Universe {...props} />
  </Canvas>
}






