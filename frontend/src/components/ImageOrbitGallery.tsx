import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { QuoteCarousel } from './QuoteCarousel'

const ORBIT_QUOTES = [
  'Every frame is a world for me , thank-you for having you in my life.',
  'You are my favourite one.',
]

interface SpiralPlacement {
  key: string
  url: string
  x: number
  y: number
  z: number
  height: number
}

// ---------------------------------------------------------------------------
// Texture cache. Photos are requested as small server-resized thumbnails, a few
// at a time, and each card appears the moment its own texture arrives. Textures
// are shared by every card that uses the same photograph.
// ---------------------------------------------------------------------------
interface TextureEntry {
  texture: THREE.Texture | null // null when the photo could not be loaded
  aspect: number // width / height of the photograph
}

const THUMBNAIL_WIDTH = 512
const MAX_PARALLEL_LOADS = 6

const textureCache = new Map<string, TextureEntry>()
const requested = new Set<string>()
const listeners = new Set<() => void>()
const waiting: Array<() => void> = []
let activeLoads = 0

function thumbnailUrl(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}w=${THUMBNAIL_WIDTH}`
}

function notify() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function pumpQueue() {
  while (activeLoads < MAX_PARALLEL_LOADS && waiting.length > 0) {
    activeLoads++
    waiting.shift()!()
  }
}

// Queue a thumbnail; requests start in the order they were queued.
function queueTexture(url: string) {
  if (requested.has(url)) return
  requested.add(url)

  waiting.push(() => {
    const finish = () => {
      activeLoads--
      notify()
      pumpQueue()
    }
    const loader = new THREE.TextureLoader()
    const onLoaded = (texture: THREE.Texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.minFilter = THREE.LinearMipmapLinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.generateMipmaps = true
      texture.anisotropy = 16
      const image = texture.image as { width?: number; height?: number } | undefined
      const aspect = image?.width && image?.height ? image.width / image.height : 1
      textureCache.set(url, { texture, aspect })
      finish()
    }
    const onFailed = (error: unknown) => {
      console.error(`Failed to load gallery photo: ${url}`, error)
      // A card with no photo is hidden, never drawn as an empty tile.
      textureCache.set(url, { texture: null, aspect: 1 })
      finish()
    }
    loader.load(url, onLoaded, undefined, (error) => {
      // If the resized copy is unavailable, fall back to the original photo.
      const original = url.replace(/[?&]w=\d+$/, '')
      if (original === url) return onFailed(error)
      loader.load(original, onLoaded, undefined, onFailed)
    })
  })
  pumpQueue()
}

// ---------------------------------------------------------------------------
// Layout – one long Archimedean spiral lying in the XY plane, seen at a tilt
// so the near side swells towards the camera (the SOOT "world" look). Photos
// are strewn along the spiral at equal arc-length spacing; when there are fewer
// photographs than slots they simply repeat.
// ---------------------------------------------------------------------------
const TURNS = 5
const CORE_RADIUS = 1
const OUTER_RADIUS = 9
const DESKTOP_CARD_COUNT = 520
const MOBILE_CARD_COUNT = 260
const BASE_CARD_HEIGHT = 0.46
const DESKTOP_DISTANCE = 27
const MOBILE_DISTANCE = 34
const MIN_DISTANCE = 1.6
const MAX_DISTANCE = 60
const SPIN_SPEED = 0.06 // rad/s of the spiral turning in its own plane
// Sit the spiral a little low in the frame to leave room for the quotation.
const VIEW_OFFSET_Y = 1.4
const TILT_X = 0.32
const TILT_Y = -0.3

// Small deterministic hash so the scatter is stable between renders.
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function buildPlacements(urls: string[], count: number): SpiralPlacement[] {
  if (urls.length === 0) return []

  const thetaMax = TURNS * Math.PI * 2
  const growth = (OUTER_RADIUS - CORE_RADIUS) / thetaMax

  // Cumulative arc length table so cards are evenly spaced along the curve.
  const steps = 2000
  const lengths = new Float32Array(steps + 1)
  for (let i = 1; i <= steps; i++) {
    const theta = ((i - 0.5) / steps) * thetaMax
    const radius = CORE_RADIUS + growth * theta
    lengths[i] = lengths[i - 1] + Math.hypot(radius, growth) * (thetaMax / steps)
  }
  const total = lengths[steps]

  // Walk the photo list with a stride coprime to its length, so similar
  // neighbouring files (e.g. the flat-colour ones) are spread around the spiral.
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  let stride = Math.max(1, Math.round(urls.length * 0.618))
  while (gcd(stride, urls.length) !== 1) stride++

  const placements: SpiralPlacement[] = []
  let cursor = 0
  for (let i = 0; i < count; i++) {
    const target = ((i + 0.5) / count) * total
    while (cursor < steps && lengths[cursor + 1] < target) cursor++
    const theta = (cursor / steps) * thetaMax

    const radius = CORE_RADIUS + growth * theta + (rand(i + 1) - 0.5) * 0.7
    const url = urls[(i * stride) % urls.length]
    const height = BASE_CARD_HEIGHT * (0.8 + rand(i + 7) * 0.55)

    placements.push({
      key: `${i}-${url}`,
      url,
      x: Math.cos(theta) * radius,
      y: Math.sin(theta) * radius,
      z: (rand(i + 13) - 0.5) * 0.9, // a little depth to fly between when zoomed in
      height,
    })
  }
  return placements
}

// ---------------------------------------------------------------------------
// One photo: a flat, unlit plane (true colours) that lifts towards the camera
// and grows when hovered.
// ---------------------------------------------------------------------------
interface OrbitImageProps {
  placement: SpiralPlacement
  spinRef: React.MutableRefObject<number>
  onSelect: (url: string) => void
}

function OrbitImage({ placement, spinRef, onSelect }: OrbitImageProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const materialRef = useRef<THREE.MeshBasicMaterial>(null)
  const hoveredRef = useRef(false)
  const appearRef = useRef(0)
  const hoverScaleRef = useRef(1)
  const thumb = thumbnailUrl(placement.url)
  const entry = useSyncExternalStore(subscribe, () => textureCache.get(thumb))

  useFrame((_state, delta) => {
    const mesh = meshRef.current
    const material = materialRef.current
    if (!mesh || !material) return

    // Fade and grow in once the photo has arrived.
    appearRef.current = THREE.MathUtils.damp(appearRef.current, 1, 6, delta)
    const appear = appearRef.current
    material.opacity = Math.min(appear * 1.2, 1)
    const settled = appear > 0.995
    if (material.transparent === settled) {
      material.transparent = !settled
      material.needsUpdate = true
    }

    // Counter the spiral's spin so every photo stays upright as it travels round.
    mesh.rotation.z = -spinRef.current
    const hovered = hoveredRef.current
    hoverScaleRef.current = THREE.MathUtils.damp(hoverScaleRef.current, hovered ? 2.4 : 1, 9, delta)
    mesh.scale.setScalar((0.6 + 0.4 * appear) * hoverScaleRef.current)
    mesh.position.z = THREE.MathUtils.damp(mesh.position.z, hovered ? 1.5 : 0, 9, delta)
  })

  if (!entry?.texture) return null

  const aspect = THREE.MathUtils.clamp(entry.aspect, 0.6, 1.8)
  return (
    <group position={[placement.x, placement.y, placement.z]}>
      <mesh
        ref={meshRef}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation()
          onSelect(placement.url)
        }}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          hoveredRef.current = true
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          hoveredRef.current = false
          document.body.style.cursor = ''
        }}
      >
        <planeGeometry args={[placement.height * aspect, placement.height]} />
        <meshBasicMaterial ref={materialRef} map={entry.texture} side={THREE.DoubleSide} toneMapped={false} transparent opacity={0} />
      </mesh>
    </group>
  )
}

const OrbitImageMemo = memo(OrbitImage)

// ---------------------------------------------------------------------------
// The rig: tilts the spiral, spins it in its own plane, eases the camera.
// All interaction state lives in refs owned by the gallery component.
// ---------------------------------------------------------------------------
interface OrbitRigProps {
  children: React.ReactNode
  spinRef: React.MutableRefObject<number>
  spinImpulseRef: React.MutableRefObject<number>
  targetDistanceRef: React.MutableRefObject<number>
  restDistance: number
  prefersReducedMotion: boolean
}

function OrbitRig({ children, spinRef, spinImpulseRef, targetDistanceRef, restDistance, prefersReducedMotion }: OrbitRigProps) {
  const { camera } = useThree()
  const tiltRef = useRef<THREE.Group>(null)
  const spinGroupRef = useRef<THREE.Group>(null)
  const distanceRef = useRef<number | null>(null)
  const smoothPointer = useRef(new THREE.Vector2())

  useFrame((state, delta) => {
    const tilt = tiltRef.current
    const spinGroup = spinGroupRef.current
    if (!tilt || !spinGroup) return

    distanceRef.current = THREE.MathUtils.damp(
      distanceRef.current ?? targetDistanceRef.current,
      targetDistanceRef.current,
      10,
      delta
    )
    // Zoomed out the view is fixed. The closer the camera flies in, the more the
    // pointer lets you look around, like walking through a 3D gallery.
    const closeness = THREE.MathUtils.clamp((restDistance - distanceRef.current) / (restDistance - MIN_DISTANCE), 0, 1)
    const reach = prefersReducedMotion ? 0 : closeness * 7
    smoothPointer.current.lerp(
      new THREE.Vector2(state.pointer.x * reach, state.pointer.y * reach),
      1 - Math.pow(0.9, delta * 60)
    )
    const offsetY = VIEW_OFFSET_Y * (1 - closeness)
    camera.position.set(smoothPointer.current.x, smoothPointer.current.y + offsetY, distanceRef.current)
    camera.lookAt(smoothPointer.current.x, smoothPointer.current.y + offsetY, 0)

    spinRef.current += (prefersReducedMotion ? 0 : SPIN_SPEED) * delta
    spinRef.current += spinImpulseRef.current * delta
    spinImpulseRef.current = THREE.MathUtils.damp(spinImpulseRef.current, 0, 4, delta)
    spinGroup.rotation.z = spinRef.current

    // Fixed tilt: the spiral only turns in its own plane, it never wobbles.
    tilt.rotation.set(TILT_X, TILT_Y, 0)
  })

  return (
    <group ref={tiltRef}>
      <group ref={spinGroupRef}>{children}</group>
    </group>
  )
}

function toAbsoluteUrl(url: string): string {
  const apiBaseUrl = import.meta.env.PUBLIC_API_URL?.replace(/\/$/, '') ?? ''
  return url.startsWith('http') ? url : `${apiBaseUrl}${url}`
}

// ---------------------------------------------------------------------------
// Public component – sits in its own section in normal document flow.
// Loads real photographs from the backend manifest
//   GET /api/image-orbit-gallery/photos
//   GET /api/image-orbit-gallery/photo/:fileName
// The gallery is revealed only after its textures have finished loading.
// ---------------------------------------------------------------------------
export function ImageOrbitGallery({ images = [] }: { images?: string[] } = {}) {
  const [remoteImages, setRemoteImages] = useState<string[]>([])
  const [manifestReady, setManifestReady] = useState(false)
  const [apiError, setApiError] = useState(false)
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [windowWidth, setWindowWidth] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth : 1024)
  )
  const [refresh, setRefresh] = useState(0)
  const [placements, setPlacements] = useState<SpiralPlacement[]>([])

  const isMobile = windowWidth < 768
  const cameraDistance = isMobile ? MOBILE_DISTANCE : DESKTOP_DISTANCE
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const stageRef = useRef<HTMLDivElement>(null)
  const spinRef = useRef(0)
  const spinImpulseRef = useRef(0)
  const targetDistanceRef = useRef(cameraDistance)
  const draggedRef = useRef(false)

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Fetch the manifest, then preload every texture before revealing the gallery.
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      let urls: string[]

      if (images.length > 0) {
        urls = [...images]
      } else if (remoteImages.length > 0) {
        urls = [...remoteImages]
      } else {
        const controller = new AbortController()
        const apiBaseUrl = import.meta.env.PUBLIC_API_URL?.replace(/\/$/, '') ?? ''

        try {
          const response = await fetch(`${apiBaseUrl}/api/image-orbit-gallery/photos`, {
            signal: controller.signal,
          })
          if (!response.ok) throw new Error(`Photo API returned ${response.status}`)
          const data = (await response.json()) as { photos?: Array<{ url: string }> }
          const parsed = data.photos?.map((photo) => toAbsoluteUrl(photo.url)).filter(Boolean) ?? []
          if (!cancelled && parsed.length > 0) setRemoteImages(parsed)
          urls = parsed
        } catch (error) {
          if (!cancelled) {
            if (error instanceof DOMException && error.name === 'AbortError') return
            console.error('Unable to load image orbit gallery photos:', error)
            setApiError(true)
            setManifestReady(true)
          }
          return
        } finally {
          if (!cancelled) controller.abort()
        }
      }

      if (cancelled) return

      const nextPlacements = buildPlacements(urls, windowWidth < 768 ? MOBILE_CARD_COUNT : DESKTOP_CARD_COUNT)
      setPlacements(nextPlacements)
      setManifestReady(true)
      // Load in spiral order so the spiral fills in from the centre outwards.
      nextPlacements.forEach((placement) => queueTexture(thumbnailUrl(placement.url)))
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [images.length, remoteImages.length, refresh, windowWidth])

  // Close the preview with the Escape key.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedUrl(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const zoomBy = useCallback((factor: number) => {
    targetDistanceRef.current = THREE.MathUtils.clamp(targetDistanceRef.current * factor, MIN_DISTANCE, MAX_DISTANCE)
  }, [])
  const resetView = useCallback(() => {
    spinImpulseRef.current = 0
    targetDistanceRef.current = cameraDistance
  }, [cameraDistance])

  // Drag to spin; pinch / ctrl+wheel to zoom. Plain wheel still scrolls the page.
  useEffect(() => {
    const element = stageRef.current
    if (!element) return

    let active = false
    let lastX = 0
    let startX = 0

    const onPointerDown = (event: PointerEvent) => {
      active = true
      draggedRef.current = false
      lastX = startX = event.clientX
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!active) return
      spinImpulseRef.current += (event.clientX - lastX) * 0.004
      lastX = event.clientX
      if (Math.abs(event.clientX - startX) > 5) draggedRef.current = true
    }
    const onPointerUp = () => {
      active = false
    }
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      // Pinch deltas are tiny, so scale the distance proportionally instead
      // of adding a fixed step: zoom feels the same near and far.
      zoomBy(Math.exp(event.deltaY * 0.012))
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('wheel', onWheel)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [zoomBy])

  const handleSelect = useCallback((url: string) => {
    if (!draggedRef.current) setSelectedUrl(url)
  }, [])

  const retry = useCallback(() => {
    setApiError(false)
    setManifestReady(false)
    setRemoteImages([])
    setPlacements([])
    setRefresh((current) => current + 1)
  }, [])

  return (
    <section className="image-orbit-section" aria-label="Image orbit gallery">
      <QuoteCarousel quotes={ORBIT_QUOTES} className="quote-orbit" intervalMs={8000} />
      {apiError && (
        <div className="image-orbit-fallback" role="status" aria-label="Image orbit gallery unavailable">
          <div>
            <p>Image orbit gallery could not be loaded.</p>
            <button type="button" className="image-orbit-btn image-orbit-retry" onClick={retry} style={{ marginTop: 10 }}>
              Retry
            </button>
          </div>
        </div>
      )}
      <div className="image-orbit-stage" ref={stageRef}>
        {manifestReady && !apiError && (
          <Canvas
            dpr={[1, 2]}
            camera={{ position: [0, 0, cameraDistance], fov: 50, near: 0.1, far: 200 }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
          >
            <OrbitRig
              spinRef={spinRef}
              spinImpulseRef={spinImpulseRef}
              targetDistanceRef={targetDistanceRef}
              restDistance={cameraDistance}
              prefersReducedMotion={prefersReducedMotion}
            >
              {placements.map((placement) => (
                <OrbitImageMemo
                  key={placement.key}
                  placement={placement}
                  spinRef={spinRef}
                  onSelect={handleSelect}
                />
              ))}
            </OrbitRig>
          </Canvas>
        )}

        {!manifestReady && !apiError && (
          <div className="image-orbit-loading" role="status" aria-label="Loading image orbit gallery">
            <p>Loading images…</p>
          </div>
        )}

        <div className="image-orbit-controls" aria-label="Image orbit controls">
          <button type="button" className="image-orbit-btn" onClick={() => { spinImpulseRef.current -= 1.2 }} aria-label="Spin left" title="Spin left">←</button>
          <button type="button" className="image-orbit-btn" onClick={() => { spinImpulseRef.current += 1.2 }} aria-label="Spin right" title="Spin right">→</button>
          <button type="button" className="image-orbit-btn" onClick={() => zoomBy(0.7)} aria-label="Zoom in" title="Zoom in">+</button>
          <button type="button" className="image-orbit-btn" onClick={() => zoomBy(1 / 0.7)} aria-label="Zoom out" title="Zoom out">−</button>
          <button type="button" className="image-orbit-btn" onClick={resetView} aria-label="Reset view" title="Reset view">↺</button>
        </div>
      </div>

      {selectedUrl && (
        <div
          className="image-orbit-preview"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setSelectedUrl(null)}
        >
          <button
            type="button"
            className="image-orbit-close"
            onClick={(event) => {
              event.stopPropagation()
              setSelectedUrl(null)
            }}
            aria-label="Close preview"
          >
            ✕
          </button>
          <img
            src={selectedUrl}
            alt="Selected photo"
            loading="eager"
            onClick={(event) => event.stopPropagation()}
            onError={(event) => {
              const target = event.target as HTMLImageElement
              target.style.display = 'none'
            }}
            style={{
              width: 'min(90vw, 720px)',
              height: 'min(85vh, 720px)',
              aspectRatio: 'auto',
              objectFit: 'contain',
              display: 'block',
              boxShadow: '0 20px 80px rgba(0, 0, 0, 0.45)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '3px',
            }}
          />
        </div>
      )}
    </section>
  )
}
