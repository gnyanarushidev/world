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
  isMobile: boolean
  onSelect: (url: string) => void
  textureReady: boolean
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
// Warm placeholder texture. Shown only while a real photograph is loading.
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
PLACEHOLDER_TEXTURE.needsUpdate = true

// ---------------------------------------------------------------------------
// Texture loading with a shared cache keyed by image URL.
// Each texture is loaded once and reused by every card that references it.
// ---------------------------------------------------------------------------
const textureLoader = new THREE.TextureLoader()
const textureCache = new Map<string, THREE.Texture>()

let pendingLoads = 0
let loadedCount = 0
let onTextureProgress: (() => void) | null = null

function configureTexture(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = 16
  texture.generateMipmaps = true
}

function startPreload(urls: string[], onProgress: () => void) {
  pendingLoads = urls.length
  loadedCount = 0
  onTextureProgress = onProgress
  urls.forEach((url) => {
    if (textureCache.has(url)) {
      loadedCount += 1
      onTextureProgress?.()
      return
    }
    textureLoader.load(
      url,
      (texture) => {
        configureTexture(texture)
        textureCache.set(url, texture)
        loadedCount += 1
        onTextureProgress?.()
      },
      undefined,
      (_error) => {
        console.warn('ImageOrbitGallery: texture failed to load', url)
        loadedCount += 1
        onTextureProgress?.()
      }
    )
  })
}

function getTexture(url: string): THREE.Texture | undefined {
  return textureCache.get(url)
}

// ---------------------------------------------------------------------------
// Spiral layout constants.
// ---------------------------------------------------------------------------
const NUM_ARMS = 3
const TURNS = 3.2
const INNER_RADIUS = 2.0
const OUTER_RADIUS = 7.5
const DESKTOP_IMAGE_LIMIT = 120
const MOBILE_IMAGE_LIMIT = 32
const BASE_THUMBNAIL_HEIGHT = 1.0   // height at INNER_RADIUS
const MAX_THUMBNAIL_HEIGHT = 1.6    // cap for outer cards
const THUMBNAIL_ASPECT = 0.72
const MAT_SCALE = 1.14
const DEFAULT_DISTANCE = 16
const MOBILE_DISTANCE = 11
const MIN_DISTANCE = 6
const MAX_DISTANCE = 50
const AUTO_ROTATION_SPEED = 0

// ---------------------------------------------------------------------------
// Distribute photos along an Archimedean spiral with multiple interleaved arms.
// r(theta) = INNER_RADIUS + b * theta, where b controls turn spacing.
// Images are spaced by equal angle increments within each arm.
// Card height scales with radius so cards never overlap at the tight
// inner turns while remaining readable at the outer edge.
// ---------------------------------------------------------------------------
function distributeAlongSpiral(urls: string[], isMobile: boolean): SpiralPlacement[] {
  const total = urls.length
  const placements: SpiralPlacement[] = []
  if (total === 0) return placements

  const maxTheta = TURNS * Math.PI * 2
  const imagesPerArm = Math.ceil(total / NUM_ARMS)
  const b = (OUTER_RADIUS - INNER_RADIUS) / maxTheta

  for (let arm = 0; arm < NUM_ARMS; arm++) {
    const armPhase = (arm * Math.PI * 2) / NUM_ARMS
    for (let i = 0; i < imagesPerArm; i++) {
      const imageIndex = arm * imagesPerArm + i
      if (imageIndex >= total) break

      const t = i / Math.max(imagesPerArm - 1, 1)
      const theta = armPhase + maxTheta * t

      // Archimedean spiral: r = a + b * theta
      const radius = INNER_RADIUS + b * theta

      const x = Math.cos(theta) * radius
      const y = Math.sin(theta) * radius

      // Card height scales with radius: smaller at center, larger at edge.
      // Clamped so cards never exceed available arc length at their radius.
      const sizeT = (radius - INNER_RADIUS) / (OUTER_RADIUS - INNER_RADIUS)
      const height = BASE_THUMBNAIL_HEIGHT + sizeT * (MAX_THUMBNAIL_HEIGHT - BASE_THUMBNAIL_HEIGHT)
      const width = height * THUMBNAIL_ASPECT

      placements.push({
        url: urls[imageIndex],
        x,
        y,
        angle: theta,
        radius,
        width,
        height,
      })
    }
  }

  return placements
}

// ---------------------------------------------------------------------------
// One photo thumbnail: a textured plane facing the camera, upright.
// The card's own rotation is near-zero; the position angle is used ONLY
// for placement, never for card orientation.
// ---------------------------------------------------------------------------
function OrbitImage({ placement, isMobile, onSelect, textureReady }: OrbitImageProps) {
  const texture = getTexture(placement.url)
  const groupRef = useRef<THREE.Group>(null)

  const scale = isMobile ? 0.78 : 1
  const width = placement.width * scale
  const height = placement.height * scale

  // Stable, near-zero rotation so each photograph stays upright and readable.
  const cardTilt = Math.sin(placement.angle * 2.1) * 0.015

  useFrame(() => {
    const group = groupRef.current
    if (!group) return

    group.position.set(placement.x, placement.y, 0)
    group.rotation.set(0, 0, cardTilt)
    group.scale.setScalar(1)
  })

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    onSelect(placement.url)
  }

  const matWidth = width * MAT_SCALE
  const matHeight = height * MAT_SCALE

  const activeTexture = textureReady && texture ? texture : PLACEHOLDER_TEXTURE

  return (
    <group ref={groupRef}>
      {/* Warm white border / mat behind each thumbnail. */}
      <mesh renderOrder={0}>
        <planeGeometry args={[matWidth, matHeight]} />
        <meshStandardMaterial color="#f2ece1" side={THREE.DoubleSide} />
      </mesh>
      <mesh
        renderOrder={1}
        onClick={handleClick}
      >
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={activeTexture}
          color="#ffffff"
          side={THREE.DoubleSide}
          roughness={0.3}
          metalness={0}
          emissive={0xffffff}
          emissiveIntensity={0.06}
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
    const pointerTarget = new THREE.Vector2(
      state.pointer.x * parallax,
      -state.pointer.y * parallax * 0.5
    )
    smoothPointer.current.lerp(pointerTarget, 1 - Math.pow(0.94, delta * 60))

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
// Loads images from local assets: backend/src/assets/chinnu/
// ---------------------------------------------------------------------------
export function ImageOrbitGallery({ images = [] }: { images?: string[] } = {}) {
  const [remoteImages, setRemoteImages] = useState<string[]>([])
  const [texturesReady, setTexturesReady] = useState(false)
  const [apiError, setApiError] = useState(false)
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [windowWidth, setWindowWidth] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth : 1024)
  )

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Fetch images from backend API: /api/image-orbit-gallery/photos
  useEffect(() => {
    if (images.length > 0) {
      setRemoteImages(images)
      setTexturesReady(true)
      return
    }

    const controller = new AbortController()
    const apiBaseUrl = import.meta.env.PUBLIC_API_URL?.replace(/\/$/, '') ?? ''

    fetch(`${apiBaseUrl}/api/image-orbit-gallery/photos`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Photo API returned ${response.status}`)
        return response.json() as Promise<{ photos?: Array<{ url: string }> }>
      })
      .then((data) => {
        const urls = data.photos
          ?.map((photo) => toAbsoluteUrl(photo.url))
          .filter(Boolean) ?? []
        if (urls.length > 0) {
          setRemoteImages(urls)
          startPreload(urls, () => {
            if (loadedCount >= pendingLoads) {
              setTexturesReady(true)
            }
          })
        } else {
          setTexturesReady(true)
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Unable to load image orbit gallery photos:', error)
        setApiError(true)
        setTexturesReady(true)
      })

    return () => controller.abort()
  }, [images.length])

  // Close the preview with the Escape key.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedUrl(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const isMobile = windowWidth < 768
  const imageLimit = isMobile ? MOBILE_IMAGE_LIMIT : DESKTOP_IMAGE_LIMIT
  const cameraDistance = isMobile ? MOBILE_DISTANCE : DEFAULT_DISTANCE
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const source = remoteImages.length > 0 ? remoteImages : images
  const galleryImages = useMemo(() => source.slice(0, imageLimit), [source, imageLimit])

  // Recompute spiral layout when image count or mobile state changes.
  const placements = useMemo(() => distributeAlongSpiral(galleryImages, isMobile), [
    galleryImages,
    isMobile,
  ])

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
              {placements.length === 0 && (
                <mesh>
                  <planeGeometry args={[40, 40]} />
                  <meshStandardMaterial color="#f4f1ea" transparent opacity={0.3} side={THREE.DoubleSide} />
                </mesh>
              )}
              {placements.map((placement, index) => (
                <OrbitImageMemo
                  key={placement.url}
                  placement={placement}
                  isMobile={isMobile}
                  onSelect={setSelectedUrl}
                  textureReady={texturesReady}
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
