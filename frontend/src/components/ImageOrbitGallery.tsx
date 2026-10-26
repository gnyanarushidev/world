import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

interface SpiralPlacement {
  url: string
  x: number
  y: number
  angle: number
  radius: number
  width: number
  height: number
}

interface OrbitImageProps {
  placement: SpiralPlacement
  texture: THREE.Texture
  onSelect: (url: string) => void
}

interface OrbitContextValue {
  groupRef: React.MutableRefObject<THREE.Group | null>
  rotationRef: React.MutableRefObject<number>
  manualRotationRef: React.MutableRefObject<number>
  distanceRef: React.MutableRefObject<number>
  targetDistanceRef: React.MutableRefObject<number>
  setTargetDistance: (delta: number) => void
}

const OrbitContext = createContext<OrbitContextValue | null>(null)

// ---------------------------------------------------------------------------
// Warm placeholder texture (canvas drawn once at module level). Shown only for
// photographs that fail to load; never for successfully loaded photos.
// ---------------------------------------------------------------------------
const placeholderCanvas = document.createElement('canvas')
placeholderCanvas.width = 64
placeholderCanvas.height = 64
const placeholderCtx = placeholderCanvas.getContext('2d')!
placeholderCtx.fillStyle = '#f5f1ea'
placeholderCtx.fillRect(0, 0, 64, 64)
placeholderCtx.strokeStyle = '#c7b299'
placeholderCtx.lineWidth = 1.5
placeholderCtx.strokeRect(0.5, 0.5, 63, 63)
const PLACEHOLDER_TEXTURE = new THREE.Texture(placeholderCanvas)
PLACEHOLDER_TEXTURE.colorSpace = THREE.SRGBColorSpace
PLACEHOLDER_TEXTURE.needsUpdate = true

// ---------------------------------------------------------------------------
// Texture cache. Textures are loaded exactly once (module level, keyed by URL),
// configured once before they are ever shown, and shared by every card that
// uses the same photograph. Nothing is disposed while a visible card still
// references it.
// ---------------------------------------------------------------------------
interface TextureEntry {
  texture: THREE.Texture
  ok: boolean
  aspect: number // naturalWidth / naturalHeight of the source photograph
}

const textureCache = new Map<string, TextureEntry>()
const loadPromiseCache = new Map<string, Promise<void>>()

function loadImageTexture(url: string): Promise<void> {
  const cached = textureCache.get(url)
  if (cached) return Promise.resolve()

  const inFlight = loadPromiseCache.get(url)
  if (inFlight) return inFlight

  const promise = new Promise<void>((resolve) => {
    const loader = new THREE.TextureLoader()
    loader.load(
      url,
      (texture) => {
        try {
          // Photographic color textures are sRGB-encoded.
          texture.colorSpace = THREE.SRGBColorSpace
          // Minify with mipmaps, magnify linearly; keep pixels sharp.
          texture.minFilter = THREE.LinearMipmapLinearFilter
          texture.magFilter = THREE.LinearFilter
          texture.generateMipmaps = true
          // Anisotropy is clamped by the renderer to what the GPU supports.
          texture.anisotropy = 16
          texture.needsUpdate = true

          const image = texture.image
          const width =
            image && typeof (image as HTMLImageElement).naturalWidth === 'number'
              ? (image as HTMLImageElement).naturalWidth
              : 0
          const height =
            image && typeof (image as HTMLImageElement).naturalHeight === 'number'
              ? (image as HTMLImageElement).naturalHeight
              : 0
          const aspect = width > 0 && height > 0 ? width / height : 1

          textureCache.set(url, { texture, ok: true, aspect })
        } catch (error) {
          console.error(`Failed to configure gallery texture: ${url}`, error)
          textureCache.set(url, { texture: PLACEHOLDER_TEXTURE, ok: false, aspect: 1 })
        }
        resolve()
      },
      undefined,
      (error) => {
        console.error(`Failed to load gallery photo: ${url}`, error)
        textureCache.set(url, { texture: PLACEHOLDER_TEXTURE, ok: false, aspect: 1 })
        resolve()
      }
    )
  })

  loadPromiseCache.set(url, promise)
  return promise
}

function textureAspect(url: string): number {
  const entry = textureCache.get(url)
  return entry ? entry.aspect : 1
}

// ---------------------------------------------------------------------------
// Spiral layout constants – five concentric rings, front-facing composition.
// ---------------------------------------------------------------------------
const NUM_RINGS = 5
const INNER_RADIUS = 2.2
const OUTER_RADIUS = 8.2
const DESKTOP_IMAGE_LIMIT = 60
const MOBILE_IMAGE_LIMIT = 24
const BASE_THUMBNAIL_HEIGHT = 1.1
const SLOT_FILL = 0.72 // fraction of each image's angular slot used by the card
const DEFAULT_DISTANCE = 18
const MOBILE_DISTANCE = 12
const MIN_DISTANCE = 7
const MAX_DISTANCE = 60
const AUTO_ROTATION_SPEED = 0

// ---------------------------------------------------------------------------
// Distribute photos across five concentric rings. Images are assigned to rings
// proportional to ring circumference and spaced by equal angle increments
// within each ring. Card sizes keep the photograph's natural aspect ratio and
// are clamped to the available arc length so neighbouring cards never overlap.
// ---------------------------------------------------------------------------
function distributeAlongRings(urls: string[], isMobile: boolean): SpiralPlacement[] {
  const total = urls.length
  const placements: SpiralPlacement[] = []
  if (total === 0) return placements

  const scale = isMobile ? MOBILE_DISTANCE / DEFAULT_DISTANCE : 1
  const innerRadius = INNER_RADIUS * scale
  const outerRadius = OUTER_RADIUS * scale

  const radii: number[] = []
  for (let i = 0; i < NUM_RINGS; i++) {
    radii.push(innerRadius + (i / (NUM_RINGS - 1)) * (outerRadius - innerRadius))
  }

  const weightSum = radii.reduce((sum, radius) => sum + radius, 0)

  // Image count per ring, proportional to circumference (radius).
  const rawCounts = radii.map((radius) => (total * radius) / weightSum)
  const counts = rawCounts.map(Math.floor)
  let assigned = counts.reduce((sum, count) => sum + count, 0)
  const remainders = rawCounts.map((raw, index) => raw - counts[index])
  const byRemainder = [...Array(NUM_RINGS).keys()].sort((a, b) => remainders[b] - remainders[a])
  let remainderIndex = 0
  while (assigned < total) {
    counts[byRemainder[remainderIndex % NUM_RINGS]] += 1
    assigned += 1
    remainderIndex += 1
  }

  // Make sure every ring receives at least one image when there are enough.
  if (total >= NUM_RINGS) {
    for (let ring = 0; ring < NUM_RINGS; ring++) {
      if (counts[ring] === 0) {
        const donor = counts.indexOf(Math.max(...counts))
        if (counts[donor] > 1) {
          counts[donor] -= 1
          counts[ring] = 1
        }
      }
    }
  }

  let offset = 0
  for (let ring = 0; ring < NUM_RINGS; ring++) {
    const count = counts[ring]
    if (count === 0) continue

    const radius = radii[ring]
    const ringScale = 1 + 0.15 * (ring / (NUM_RINGS - 1))
    // Slight stagger between rings so cards never line up radially.
    const phase = (ring * Math.PI) / NUM_RINGS
    const slotWidth = (2 * Math.PI * radius) / count

    for (let j = 0; j < count; j++) {
      const imageIndex = offset + j
      const url = urls[imageIndex]
      const aspect = textureAspect(url)

      const angle = (j / count) * 2 * Math.PI + phase
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius

      const maxWidth = slotWidth * SLOT_FILL
      const targetHeight = BASE_THUMBNAIL_HEIGHT * scale * ringScale
      const height = Math.min(targetHeight, maxWidth / aspect)
      const width = height * aspect

      placements.push({
        url,
        x,
        y,
        angle,
        radius,
        width,
        height,
      })
    }

    offset += count
  }

  return placements
}

// ---------------------------------------------------------------------------
// One photo thumbnail: a textured plane facing the camera, upright.
// The card's local transform is stable; the group rotation (if any) is
// applied by the parent gallery group, never per card.
// ---------------------------------------------------------------------------
function OrbitImage({ placement, texture, onSelect }: OrbitImageProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { width, height } = placement

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    onSelect(placement.url)
  }

  return (
    <group ref={groupRef} position={[placement.x, placement.y, 0]}>
      <mesh
        renderOrder={1}
        onClick={handleClick}
      >
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          map={texture}
          color="#ffffff"
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

const OrbitImageMemo = memo(OrbitImage)

// ---------------------------------------------------------------------------
// The 3D rig: lights, camera damping, and the spiral group.
// ---------------------------------------------------------------------------
interface OrbitRigProps {
  children: React.ReactNode
  cameraDistance: number
  prefersReducedMotion: boolean
  isMobile: boolean
}

function OrbitRig({ children, cameraDistance, prefersReducedMotion, isMobile }: OrbitRigProps) {
  const { camera } = useThree()
  const groupRef = useRef<THREE.Group>(null)
  const rotationRef = useRef(0)
  const manualRotationRef = useRef(0)
  const distanceRef = useRef(cameraDistance)
  const targetDistanceRef = useRef(cameraDistance)
  const smoothPointer = useRef(new THREE.Vector2())
  const pointerTarget = useRef(new THREE.Vector2())

  const setTargetDistance = useCallback((delta: number) => {
    targetDistanceRef.current = THREE.MathUtils.clamp(
      targetDistanceRef.current + delta,
      MIN_DISTANCE,
      MAX_DISTANCE
    )
  }, [])

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group || !camera) return

    distanceRef.current = THREE.MathUtils.damp(
      distanceRef.current,
      targetDistanceRef.current,
      5,
      delta
    )

    rotationRef.current += AUTO_ROTATION_SPEED * delta
    rotationRef.current += manualRotationRef.current * delta
    manualRotationRef.current = THREE.MathUtils.damp(manualRotationRef.current, 0, 6, delta)
    group.rotation.z = rotationRef.current

    const parallax = prefersReducedMotion ? 0 : 0.12
    pointerTarget.current.set(
      state.pointer.x * parallax,
      -state.pointer.y * parallax * 0.5
    )
    smoothPointer.current.lerp(pointerTarget.current, 1 - Math.pow(0.94, delta * 60))

    const elevation = isMobile ? 0.3 : 0
    camera.position.set(
      smoothPointer.current.x,
      elevation + smoothPointer.current.y,
      distanceRef.current
    )
    camera.lookAt(0, 0, 0)
  })

  const value = useMemo<OrbitContextValue>(
    () => ({
      groupRef,
      rotationRef,
      manualRotationRef,
      distanceRef,
      targetDistanceRef,
      setTargetDistance,
    }),
    []
  )

  return (
    <OrbitContext.Provider value={value}>
      <ambientLight intensity={1.4} color="#ffffff" />
      <pointLight position={[5, 5, 8]} intensity={2.5} color="#fff8ee" decay={1.5} distance={60} />
      <pointLight position={[-5, -5, 8]} intensity={1.6} color="#dce8ff" decay={1.5} distance={60} />
      <group ref={groupRef}>{children}</group>
    </OrbitContext.Provider>
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
// Images are stored in backend/src/assets/chinnu/
// The gallery is revealed only after its initial textures have finished loading.
// ---------------------------------------------------------------------------
export function ImageOrbitGallery({ images = [] }: { images?: string[] } = {}) {
  const [remoteImages, setRemoteImages] = useState<string[]>([])
  const [texturesReady, setTexturesReady] = useState(false)
  const [apiError, setApiError] = useState(false)
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [windowWidth, setWindowWidth] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth : 1024)
  )
  const [refresh, setRefresh] = useState(0)
  const [cardTextures, setCardTextures] = useState<Map<string, THREE.Texture>>(new Map())
  const [placements, setPlacements] = useState<SpiralPlacement[]>([])

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
          const response = await fetch(
            `${apiBaseUrl}/api/image-orbit-gallery/photos`,
            { signal: controller.signal }
          )
          if (!response.ok) throw new Error(`Photo API returned ${response.status}`)
          const data = (await response.json()) as {
            photos?: Array<{ url: string }>
          }
          const parsed = data.photos
            ?.map((photo) => toAbsoluteUrl(photo.url))
            .filter(Boolean) ?? []
          if (!cancelled && parsed.length > 0) {
            setRemoteImages(parsed)
          }
          urls = parsed
        } catch (error) {
          if (!cancelled) {
            if (error instanceof DOMException && error.name === 'AbortError') {
              return
            }
            console.error('Unable to load image orbit gallery photos:', error)
            setApiError(true)
            setTexturesReady(true)
          }
          return
        } finally {
          if (!cancelled) controller.abort()
        }
      }

      // Load and configure every texture before any card becomes visible.
      await Promise.all(urls.map((url) => loadImageTexture(url)))

      if (cancelled) return

      const nextTextures = new Map<string, THREE.Texture>()
      for (const url of urls) {
        const entry = textureCache.get(url)
        nextTextures.set(url, entry ? entry.texture : PLACEHOLDER_TEXTURE)
      }
      setCardTextures(nextTextures)

      const isMobile = windowWidth < 768
      const limit = isMobile ? MOBILE_IMAGE_LIMIT : DESKTOP_IMAGE_LIMIT
      setPlacements(distributeAlongRings(urls.slice(0, limit), isMobile))
      setTexturesReady(true)
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

  const isMobile = windowWidth < 768
  const cameraDistance = isMobile ? MOBILE_DISTANCE : DEFAULT_DISTANCE
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const ctx = useContext(OrbitContext)
  const stageRef = useRef<HTMLDivElement>(null)

  const resetView = useCallback(() => {
    if (ctx) {
      ctx.rotationRef.current = 0
      ctx.manualRotationRef.current = 0
      ctx.targetDistanceRef.current = cameraDistance
    }
  }, [ctx, cameraDistance])
  const zoomIn = useCallback(() => {
    if (ctx) ctx.setTargetDistance(-2.5)
  }, [ctx])
  const zoomOut = useCallback(() => {
    if (ctx) ctx.setTargetDistance(2.5)
  }, [ctx])

  const onStageWheelEvent = useCallback(
    (event: React.WheelEvent) => {
      event.preventDefault()
      if (ctx) ctx.setTargetDistance(event.deltaY * 0.05)
    },
    [ctx]
  )

  // Drag to rotate the spiral composition smoothly.
  useEffect(() => {
    const element = stageRef.current
    if (!element || !ctx) return

    let active = false
    let lastX = 0

    const onPointerDown = () => {
      active = true
      element.style.touchAction = 'none'
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!active) return
      const deltaX = event.clientX - lastX
      lastX = event.clientX
      ctx.manualRotationRef.current += deltaX * 0.003
    }
    const onPointerUp = () => {
      active = false
      element.style.touchAction = ''
    }

    element.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      element.style.touchAction = ''
    }
  }, [ctx])

  const retry = useCallback(() => {
    setApiError(false)
    setTexturesReady(false)
    setRemoteImages([])
    setPlacements([])
    setCardTextures(new Map())
    setRefresh((current) => current + 1)
  }, [])

  return (
    <section className="image-orbit-section" aria-label="Image orbit gallery">
      {apiError && (
        <div
          className="image-orbit-fallback"
          role="status"
          aria-label="Image orbit gallery unavailable"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 2 }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#6b5444',
              textAlign: 'center',
              padding: '0 20px',
            }}
          >
            <p>Image orbit gallery could not be loaded.</p>
            <button
              type="button"
              className="image-orbit-btn image-orbit-retry"
              onClick={retry}
              style={{ marginTop: 10 }}
            >
              Retry
            </button>
          </div>
        </div>
      )}
      <div className="image-orbit-stage" ref={stageRef}>
        {texturesReady && (
          <Canvas
            camera={{ position: [0, 0, cameraDistance], fov: 55, near: 0.1, far: 100 }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            onCreated={(state) => {
              console.log('R3F onCreated:', {
                gl: !!state.gl,
                camera: !!state.camera,
                scene: !!state.scene,
              })
            }}
          >
            <color attach="background" args={['#f4f1ea']} />
            <OrbitRig
              cameraDistance={cameraDistance}
              prefersReducedMotion={prefersReducedMotion}
              isMobile={isMobile}
            >
              {placements.map((placement) => (
                <OrbitImageMemo
                  key={placement.url}
                  placement={placement}
                  texture={cardTextures.get(placement.url) ?? PLACEHOLDER_TEXTURE}
                  onSelect={setSelectedUrl}
                />
              ))}
            </OrbitRig>
          </Canvas>
        )}

        {!texturesReady && !apiError && (
          <div className="image-orbit-loading" role="status" aria-label="Loading image orbit gallery">
            <p>Loading images…</p>
          </div>
        )}

        <div className="image-orbit-controls" aria-label="Image orbit controls" onWheel={onStageWheelEvent}>
          <button
            type="button"
            className="image-orbit-btn"
            onClick={() => {
              if (ctx) ctx.manualRotationRef.current -= 1.0
            }}
            aria-label="Rotate spiral left"
            title="Rotate left"
          >
            ←
          </button>
          <button
            type="button"
            className="image-orbit-btn"
            onClick={() => {
              if (ctx) ctx.manualRotationRef.current += 1.0
            }}
            aria-label="Rotate spiral right"
            title="Rotate right"
          >
            →
          </button>
          <button
            type="button"
            className="image-orbit-btn"
            onClick={zoomIn}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="image-orbit-btn"
            onClick={resetView}
            aria-label="Reset view"
            title="Reset view"
          >
            ↺
          </button>
          <button
            type="button"
            className="image-orbit-btn"
            onClick={zoomOut}
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>
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
