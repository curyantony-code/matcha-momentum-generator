export type Screen =
  | { name: 'home' }
  | { name: 'new'; scriptId?: string }
  | { name: 'script' }
  | { name: 'carousels'; id?: string }
  | { name: 'stories'; id?: string }
  | { name: 'teleprompter'; scriptId: string }
  | { name: 'working'; slug: string }
  | { name: 'reel'; slug: string; fresh?: boolean }
  | { name: 'made'; slug: string }
  | { name: 'clips'; slug: string }
  | { name: 'repurpose'; slug: string }
  | { name: 'publish'; slug: string }
  | { name: 'library' }
  | { name: 'style' }
  | { name: 'brands' }
  | { name: 'studio' }
  | { name: 'settings' }
  | { name: 'performing' }
  | { name: 'engine' }
  | { name: 'study' }
  | { name: 'studied'; id: string }
  | { name: 'health' }
  | { name: 'connect'; back?: Exclude<Screen, { name: 'connect' }> }

export type Go = (s: Screen) => void
