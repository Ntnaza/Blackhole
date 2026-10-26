export type ViewName = 'Classic' | 'Edge-on' | 'Top View' | 'Wide' | 'Far View'
export type ColorTheme = 'Ember' | 'Mono'
export interface SceneOptions {
  tilt: number
  quality: 'Auto' | 'High' | 'Low'
  paused: boolean
  speed: number
  orbitSpeed: number
  colorTheme: ColorTheme
  glow: number

  orbit: boolean
  reduced: boolean
  visible: boolean
  view: { name: ViewName; revision: number }
  capture: number
}

