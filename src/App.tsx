import { lazy, Suspense, useEffect, useRef, useState, useCallback, Component } from 'react'
import type { ReactNode } from 'react'
import type { ColorTheme, SceneOptions, ViewName } from './sceneTypes'
import { AmbientAudio } from './audio'
import antentUrl from './assets/sound/antent.mp3'
import interstellarUrl from './assets/sound/Interstellar.mp3'
import snowfallUrl from './assets/sound/snowfall.mp3'
import './App.css'

const Scene = lazy(() => import('./Scene'))
const views: ViewName[] = ['Classic', 'Edge-on', 'Top View', 'Wide', 'Far View']
const viewLabels: Record<ViewName, string> = {
  Classic: 'Classic', 'Edge-on': 'Edge-on', 'Top View': 'Top View', Wide: 'Wide', 'Far View': 'Far View',
}
const colorThemes: ColorTheme[] = ['Ember', 'Mono']
const soundtracks = [
  { name: 'Interstellar', url: interstellarUrl },
  { name: 'Snowfall', url: snowfallUrl },
  { name: 'Antent', url: antentUrl },
] as const
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <div className="fallback"><h1>Ruang angkasa belum bisa dirender.</h1><p>Aktifkan akselerasi grafis dan gunakan browser dengan WebGL 2.</p><button onClick={() => window.location.reload()}>Coba lagi</button></div> : this.props.children
  }
}
export default function App() {
  const [tilt, setTilt] = useState(-0.15)
  const [quality, setQuality] = useState<SceneOptions['quality']>('Auto')
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [orbitSpeed, setOrbitSpeed] = useState(1)
  const [colorTheme, setColorTheme] = useState<ColorTheme>('Ember')
  const [glow, setGlow] = useState(0.18)

  const [orbit, setOrbit] = useState(false)
  const [panel, setPanel] = useState(false)
  const [info, setInfo] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [photo, setPhoto] = useState(false)
  const [hint, setHint] = useState(true)
  const [ready, setReady] = useState(false)
  const [visible, setVisible] = useState(!document.hidden)
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [view, setView] = useState({ name: 'Wide' as ViewName, revision: 0 })
  const [capture, setCapture] = useState(0)
  const [saving, setSaving] = useState(false)
  const [sound, setSound] = useState(false)
  const [soundtrack, setSoundtrack] = useState<string>(soundtracks[0].name)
  const [soundtrackPlaying, setSoundtrackPlaying] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [status, setStatus] = useState('')
  const [stats, setStats] = useState({ fps: 0, dpr: 1 })
  const audio = useRef<AmbientAudio | null>(null)
  const soundtrackAudio = useRef<HTMLAudioElement | null>(null)
  const photoReturn = useRef(false)
  const shell = useRef<HTMLDivElement>(null)
  const restore = useRef<HTMLButtonElement>(null)
  const settings = useRef<HTMLElement>(null)
  const settingsButton = useRef<HTMLButtonElement>(null)

  const handleReady = useCallback(() => setReady(true), [])
  const handleInteraction = useCallback(() => setHint(false), [])
  const handleStats = useCallback((s: { fps: number; dpr: number }) => setStats(s), [])
  const handleCapture = useCallback((message: string) => { setSaving(false); setStatus(message) }, [])
  useEffect(() => {
    if (!panel) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!settings.current?.contains(target) && !settingsButton.current?.contains(target)) setPanel(false)
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [panel])
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const motion = () => setReduced(media.matches)
    const visibility = () => setVisible(!document.hidden)
    const full = () => setFullscreen(Boolean(document.fullscreenElement))
    media.addEventListener('change', motion)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('fullscreenchange', full)
    return () => {
      media.removeEventListener('change', motion)
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('fullscreenchange', full)
      audio.current?.dispose(); audio.current = null
      soundtrackAudio.current?.pause(); soundtrackAudio.current = null
    }
  }, [])
  useEffect(() => { audio.current?.setAudible(sound && visible && !paused && !photo) }, [sound, visible, paused, photo])
  useEffect(() => {
    const player = soundtrackAudio.current
    if (!player) return
    const selected = soundtracks.find(track => track.name === soundtrack) ?? soundtracks[0]
    player.src = selected.url
    player.load()
    if (soundtrackPlaying && visible && !photo) void player.play().catch(() => setSoundtrackPlaying(false))
  }, [soundtrack])
  useEffect(() => {
    const player = soundtrackAudio.current
    if (!player) return
    if (soundtrackPlaying && visible && !photo) void player.play().catch(() => setSoundtrackPlaying(false))
    else player.pause()
  }, [soundtrackPlaying, visible, photo])
  useEffect(() => {
    if (!hint || !ready) return
    const timer = setTimeout(() => setHint(false), 6500)
    return () => clearTimeout(timer)
  }, [hint, ready])
  useEffect(() => {
    if (!status) return
    const timer = setTimeout(() => setStatus(''), 5000)
    return () => clearTimeout(timer)
  }, [status])
  useEffect(() => { if (hidden) restore.current?.focus() }, [hidden])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setHidden(false); setPanel(false); setInfo(false)
      if (photo) { setPhoto(false); setPaused(photoReturn.current) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [photo])
  function selectView(name: ViewName) {
    setOrbit(false)
    setTilt(name === 'Classic' || name === 'Wide' || name === 'Far View' ? -0.15 : 0)
    setView(current => ({ name, revision: current.revision + 1 }))
  }
  function togglePhoto() {
    if (!photo) {
      photoReturn.current = paused
      setPaused(true); setOrbit(false); setPanel(false); setInfo(false)
    } else setPaused(photoReturn.current)
    setPhoto(!photo)
  }
  async function toggleSound() {
    try {
      if (!audio.current) audio.current = new AmbientAudio()
      if (!sound) await audio.current.start()
      audio.current.setAudible(!sound && visible && !paused && !photo)
      setSound(!sound)
    } catch { setStatus('Audio tidak tersedia di browser ini.') }
  }
  function toggleSoundtrack() {
    setSoundtrackPlaying(current => !current)
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await shell.current?.requestFullscreen()
    } catch { setStatus('Fullscreen tidak tersedia. Gunakan mode layar penuh browser.') }
  }
  const options: SceneOptions = { tilt, quality, paused: paused || photo, speed, orbitSpeed, colorTheme, glow, orbit: orbit && !photo, reduced, visible, view, capture }
  return <div ref={shell} className={`observatory ${ready ? 'is-ready' : ''}`}>
    <SceneBoundary><Suspense fallback={<div className="loading" role="status">Membuka observatorium<span /></div>}>
      <Scene {...options} onReady={handleReady} onInteraction={handleInteraction} onStats={handleStats} onCapture={handleCapture} />
    </Suspense></SceneBoundary>
    {!hidden && <>
      <header className="masthead"><div className="wordmark"><span className="orbit-mark" aria-hidden="true" /><div>BLACKHOLE<small>AN INTERACTIVE OBSERVATORY</small></div></div><span className="scene-tag">{photo ? 'PHOTO MODE' : 'GARGANTUA · STUDY 01'}</span></header>
      <nav className="top-actions" aria-label="Tampilan"><button aria-expanded={info} aria-controls="info-panel" onClick={() => { setInfo(!info); setPanel(false) }}>Tentang</button><button aria-pressed={fullscreen} onClick={toggleFullscreen}>{fullscreen ? 'Keluar fullscreen' : 'Fullscreen'}</button><button onClick={() => setHidden(true)}>Hide UI</button><div className="color-actions" role="group" aria-label="Tema warna blackhole">{colorThemes.map(name => <button key={name} aria-pressed={colorTheme === name} onClick={() => setColorTheme(name)}>{name}</button>)}</div></nav>
      {info && <aside id="info-panel" className="floating-panel info-panel"><div className="panel-title"><span>CAHAYA & GRAVITASI</span><button aria-label="Tutup informasi" onClick={() => setInfo(false)}>×</button></div><h2>Di tepi kegelapan.</h2><p>Piringan akresi adalah materi panas yang mengitari black hole. Cahaya yang dibelokkan gravitasi membentuk lengkungan di atas dan di bawah bayangannya.</p><dl><dt>Photon ring</dt><dd>Cincin cahaya tipis di sekitar bayangan pusat.</dd><dt>Doppler beaming</dt><dd>Sisi materi yang mendekat tampak lebih terang.</dd><dt>Gravitational lensing</dt><dd>Lintasan cahaya berubah, mendistorsi bintang di belakangnya.</dd></dl><p className="fine-print">Interpretasi sinematik dengan pendekatan numerik, bukan simulator astrofisika presisi.</p></aside>}
      <div className="bottom-ui">
        {hint && !photo && <p className="gesture-hint">Drag untuk orbit <span>·</span> Scroll atau pinch untuk zoom</p>}
        {photo && <p className="gesture-hint">Waktu dibekukan. Atur sudut, lalu simpan gambar tanpa UI.</p>}
        {panel && <section ref={settings} id="settings-panel" className="floating-panel settings-panel" aria-label="Pengaturan scene">
          <div className="panel-title"><span>OBSERVATORY CONTROLS</span><button aria-label="Tutup pengaturan" onClick={() => setPanel(false)}>×</button></div>
          <div className="settings-heading">RENDERING</div>
          <div className="setting"><label htmlFor="quality">Kualitas</label><select id="quality" value={quality} onChange={e => setQuality(e.target.value as SceneOptions['quality'])}><option>Auto</option><option>High</option><option>Low</option></select></div>
          <div className="setting"><label htmlFor="glow">Ring glow <output>{Math.round(glow * 100)}%</output></label><input id="glow" type="range" min="0" max="0.6" step="0.02" value={glow} onChange={e => setGlow(Number(e.target.value))} /></div>
          <div className="settings-heading">MOVEMENT</div>
          <div className="setting"><label htmlFor="speed">Kecepatan animasi <output>{speed.toFixed(2)}×</output></label><input id="speed" aria-describedby="speed-help" disabled={photo} type="range" min="0.25" max="4" step="0.25" value={speed} onChange={e => { setSpeed(Number(e.target.value)); if (!photo) setPaused(false) }} /></div>
          <div className="setting"><label htmlFor="orbit-speed">Kecepatan orbit <output>{orbitSpeed.toFixed(1)}×</output></label><input id="orbit-speed" aria-describedby="orbit-speed-help" disabled={photo} type="range" min="0.5" max="5" step="0.1" value={orbitSpeed} onChange={e => setOrbitSpeed(Number(e.target.value))} /></div>
          <div className="settings-heading">AUDIO</div>
          <div className="setting"><label htmlFor="soundtrack">Soundscape</label><select id="soundtrack" value={soundtrack} onChange={e => setSoundtrack(e.target.value)}>{soundtracks.map(track => <option key={track.name}>{track.name}</option>)}</select></div>
          <div className="toggle-grid"><button aria-pressed={sound} onClick={toggleSound}>Ambient audio <span>{sound ? 'ON' : 'OFF'}</span></button><button aria-pressed={reduced} aria-describedby="motion-help" onClick={() => { setReduced(!reduced); if (!reduced) setOrbit(false) }}>Reduce motion <span>{reduced ? 'ON' : 'OFF'}</span></button></div>
          <p id="speed-help" className="control-help">Speed mengatur aliran plasma. Pause membekukan animasi; kamera tetap bisa digeser.</p><p id="orbit-speed-help" className="control-help">Orbit speed mengatur rotasi kamera dari normal sampai sedikit lebih cepat.</p><p id="motion-help" className="control-help">Reduce motion memperlambat plasma dan menghilangkan transisi kamera. Orbit tetap bisa dinyalakan manual.</p><p className="performance">{stats.fps ? `${stats.fps} FPS` : 'Mengukur performa…'} <span>·</span> {stats.dpr.toFixed(2)}× resolution <span>·</span> {quality}</p>
        </section>}
        <div className="control-dock"><div className="view-presets" role="group" aria-label="Preset kamera">{views.map(name => <button key={name} aria-pressed={view.name === name} onClick={() => selectView(name)}>{viewLabels[name]}</button>)}</div>
          <div className="dock-main"><div className="tilt-control"><label htmlFor="tilt">DISK TILT</label><input id="tilt" type="range" min="-1.5" max="1.5" step="0.01" value={tilt} onChange={e => setTilt(Number(e.target.value))} /><output htmlFor="tilt">{Math.round(tilt * 180 / Math.PI)}°</output></div><div className="dock-divider" /><button title="Kembali ke komposisi awal" onClick={() => selectView('Classic')}>Reset</button><button disabled={photo} aria-pressed={orbit} onClick={() => { setOrbit(!orbit); if (!orbit) setPaused(false) }}>Orbit</button><button disabled={photo} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? 'Play' : 'Pause'}</button><button aria-pressed={soundtrackPlaying} onClick={toggleSoundtrack}>{soundtrackPlaying ? 'Stop sound' : 'Play sound'}</button><button aria-pressed={photo} onClick={togglePhoto}>{photo ? 'Exit photo' : 'Photo'}</button><button ref={settingsButton} aria-expanded={panel} aria-controls="settings-panel" onClick={() => { setPanel(!panel); setInfo(false) }}>Settings</button></div></div>
        {photo && <button className="capture-button" disabled={saving} onClick={() => { setSaving(true); setCapture(value => value + 1) }}>{saving ? 'Menyimpan…' : 'Simpan PNG'} <span>↓</span></button>}
      </div><footer className="scene-footer"><span>SPACE TO EXPLORE.</span><span>REAL-TIME LIGHT STUDY</span></footer>
    </>}
    {hidden && <button ref={restore} className="restore-ui" onClick={() => setHidden(false)}>Show UI <kbd>Esc</kbd></button>}
    <audio ref={soundtrackAudio} preload="metadata" loop aria-hidden="true" />
    <div className="toast" role="status" aria-live="polite">{status}</div>
  </div>
}

