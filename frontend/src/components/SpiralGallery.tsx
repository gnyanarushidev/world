import { useCallback, useRef, useState, useMemo, useEffect, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

import type { SpiralGalleryConfig } from './spiralGalleryConfig'
import { DEFAULT_CONFIG } from './spiralGalleryConfig'
import { QuoteCarousel } from './QuoteCarousel'

const SPIRAL_QUOTES = [
  'Some people are worth a thousand photographs.',
  'In every picture, I find another reason to smile.',
]

// ---------------------------------------------------------------------------
// Warm placeholder texture (canvas drawn once at module level). A failed or
// still-loading photograph never leaves a blank card.
// ---------------------------------------------------------------------------
const placeholderCanvas = document.createElement('canvas')
placeholderCanvas.width = 64
placeholderCanvas.height = 64
const placeholderCtx = placeholderCanvas.getContext('2d')!
placeholderCtx.fillStyle = '#e8dcc8'
placeholderCtx.fillRect(0, 0, 64, 64)
placeholderCtx.strokeStyle = '#c7b299'
placeholderCtx.lineWidth = 2
placeholderCtx.strokeRect(1, 1, 62, 62)
const PLACEHOLDER_TEXTURE = new THREE.Texture(placeholderCanvas)
PLACEHOLDER_TEXTURE.needsUpdate = true

// ---------------------------------------------------------------------------
// Floating particle positions are computed once at module load (not during
// React render) so the component stays pure. They drift around the spiral.
// ---------------------------------------------------------------------------
const PARTICLE_COUNT = 110
const PARTICLE_POSITIONS = (() => {
  const radius = DEFAULT_CONFIG.radius + 1.6
  const height = DEFAULT_CONFIG.imageCount * DEFAULT_CONFIG.verticalSpacing + 4
  const positions = new Float32Array(PARTICLE_COUNT * 3)
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * radius
    positions[i * 3] = Math.cos(a) * r
    positions[i * 3 + 1] = Math.random() * height
    positions[i * 3 + 2] = Math.sin(a) * r
  }
  return positions
})()

// ---------------------------------------------------------------------------
// Small warm floating particles suspended around the spiral
// ---------------------------------------------------------------------------
function FloatingParticles() {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(PARTICLE_POSITIONS, 3))

  return (
    <points>
      <primitive object={geometry} attach="geometry" />
      <pointsMaterial
        size={0.035}
        transparent
        opacity={0.45}
        depthWrite={false}
        color="#d8c7b3"
      />
    </points>
  )
}

// ---------------------------------------------------------------------------
// One rectangular photo card placed on the helical path.
// Each card has a different height and angular position; cards face inward
// toward the spiral axis with a slight backward lean for perspective.
// ---------------------------------------------------------------------------
interface PhotoCardProps {
  image: string
  index: number
  total: number
  config: SpiralGalleryConfig
  radiusScale: number
  cardScale: number
  selected: boolean
  onSelect: (index: number) => void
  scrollOffset: MutableRefObject<number>
  scrollVelocity: MutableRefObject<number>
}

function PhotoCard({
  image,
  index,
  total,
  config,
  radiusScale,
  cardScale,
  selected,
  onSelect,
  scrollOffset,
  scrollVelocity,
}: PhotoCardProps) {
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())
  // Sharp at oblique angles: max anisotropic filtering on every photo.
  const texture = useTexture(`${image}${image.includes('?') ? '&' : '?'}w=1024`, (loaded) => {
    ;[loaded].flat().forEach((item) => {
      item.anisotropy = maxAnisotropy
    })
  }) ?? PLACEHOLDER_TEXTURE
  const groupRef = useRef<THREE.Group>(null)
  const frontMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const backMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const squeezeRef = useRef(0)
  const [hovered, setHovered] = useState(false)

  const { radius, imagesPerTurn, verticalSpacing, baseCardHeight, heightVariance } = config

  const angle = index * (Math.PI * 2 / imagesPerTurn)
  const totalHeight = Math.max(total * verticalSpacing * cardScale, 1)
  const baseY = index * verticalSpacing * cardScale - totalHeight / 2
  const baseX = Math.sin(angle) * radius * radiusScale
  const baseZ = Math.cos(angle) * radius * radiusScale

  // Keep each photo's real aspect ratio so nothing is stretched or cropped.
  const image_ = texture.image as { width?: number; height?: number } | undefined
  const aspect = image_?.width && image_?.height
    ? THREE.MathUtils.clamp(image_.width / image_.height, 0.6, 1.5)
    : 0.75
  const cardHeight = (baseCardHeight + Math.sin(index * 1.9) * heightVariance) * cardScale
  const cardWidth = cardHeight * aspect
  const frame = 0.09 * cardScale

  const baseRotationY = angle + Math.PI

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return

    const elapsed = state.clock.elapsedTime
    const floatY = Math.sin(elapsed * 0.7 + index) * 0.03
    const scrolledY = THREE.MathUtils.euclideanModulo(
      baseY + scrollOffset.current + totalHeight / 2,
      totalHeight
    ) - totalHeight / 2

    const targetScale = selected ? 1.4 : hovered ? 1.12 : 1
    group.scale.setScalar(THREE.MathUtils.damp(group.scale.x, targetScale, 7, delta))

    // Scroll velocity temporarily squeezes the spiral toward its center.
    const squeezeTarget = Math.min(Math.abs(scrollVelocity.current) * 3, 1) * config.squeezeIntensity
    squeezeRef.current = THREE.MathUtils.damp(squeezeRef.current, squeezeTarget, 5, delta)
    const squeezeFalloff = Math.exp(
      -(scrolledY * scrolledY) / (config.squeezeWidth * config.squeezeWidth)
    )
    const squeezedRadius = radius * radiusScale * (1 - squeezeRef.current * squeezeFalloff)
    const breathing = Math.sin(elapsed * 0.55 + angle * 1.7) * config.breathingAmount
    const animatedRadius = squeezedRadius + breathing
    const motionFlex = THREE.MathUtils.clamp(scrollVelocity.current * 0.018, -0.08, 0.08)

    group.position.set(
      Math.sin(angle) * animatedRadius,
      scrolledY + floatY,
      Math.cos(angle) * animatedRadius
    )
    group.rotation.set(0, baseRotationY + motionFlex, 0)

    // Photos are drawn unlit so their colours are true; hover/selection only
    // brightens them slightly.
    const tint = selected ? 1 : hovered ? 0.96 : 0.9
    frontMaterialRef.current?.color.setScalar(THREE.MathUtils.damp(frontMaterialRef.current.color.r, tint, 7, delta))
    backMaterialRef.current?.color.setScalar(THREE.MathUtils.damp(backMaterialRef.current.color.r, tint, 7, delta))
  })

  const handleClick = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    onSelect(index)
  }

  return (
    <group
      ref={groupRef}
      position={[baseX, baseY, baseZ]}
      rotation={[0, baseRotationY, 0]}
      onClick={handleClick}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Cream photo-print frame */}
      <mesh>
        <boxGeometry args={[cardWidth + frame * 2, cardHeight + frame * 2, 0.05]} />
        <meshBasicMaterial color={selected ? '#fff1c7' : '#fffdf8'} fog={false} toneMapped={false} />
      </mesh>
      {/* Photo on the front face */}
      <mesh position={[0, 0, 0.0265]}>
        <planeGeometry args={[cardWidth, cardHeight]} />
        <meshBasicMaterial ref={frontMaterialRef} map={texture} fog={false} toneMapped={false} />
      </mesh>
      {/* Photo on the back face so it stays readable from either side */}
      <mesh position={[0, 0, -0.0265]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[cardWidth, cardHeight]} />
        <meshBasicMaterial ref={backMaterialRef} map={texture} fog={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// The 3D stage: warm fog, lights, particles, and the rotating spiral group.
// The camera stays level with the spiral so the gallery is viewed straight on
// rather than from below.
// ---------------------------------------------------------------------------
interface SpiralStageProps {
  images: string[]
  selectedIndex: number | null
  onSelect: (index: number) => void
  manualRotation: MutableRefObject<number>
  config: SpiralGalleryConfig
  scrollTarget: MutableRefObject<number>
  scrollOffset: MutableRefObject<number>
  scrollVelocity: MutableRefObject<number>
  tiltRef: React.MutableRefObject<number>
}

function SpiralStage({ images, selectedIndex, onSelect, manualRotation, config, scrollTarget, scrollOffset, scrollVelocity, tiltRef }: SpiralStageProps) {
  const groupRef = useRef<THREE.Group>(null)
  const rotationSpeed = useRef(0)
  const lastScrollDirection = useRef(1)
  const smoothPointer = useRef(new THREE.Vector2())
  const { camera } = useThree()
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Responsive scaling for smaller screens.
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  )
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const isMobile = windowWidth < 768
  const radiusScale = isMobile ? 0.7 : 1
  const cardScale = isMobile ? 0.82 : 1
  const cameraDistance = isMobile ? 9 : config.cameraDistance

  // Frame-rate-independent slow rotation of the whole installation around Y.
  useFrame((_state, delta) => {
    if (!groupRef.current || !camera) return

    // Smooth, inertial vertical photo movement inspired by the reference.
    const previousOffset = scrollOffset.current
    scrollOffset.current = THREE.MathUtils.damp(
      scrollOffset.current,
      scrollTarget.current,
      5.5,
      delta
    )
    scrollVelocity.current = (scrollOffset.current - previousOffset) / Math.max(delta, 0.001)

    // Match the reference's momentum-based rotation: idle rotation continues
    // in the last scroll direction while scrolling adds rotational force.
    if (Math.abs(scrollVelocity.current) > 0.0001) {
      lastScrollDirection.current = scrollVelocity.current > 0 ? 1 : -1
    }
    const targetRotationSpeed =
      config.rotationSpeed * lastScrollDirection.current +
      scrollVelocity.current * config.scrollRotationForce
    const clampedRotationSpeed = THREE.MathUtils.clamp(
      targetRotationSpeed,
      -config.maxRotationSpeed,
      config.maxRotationSpeed
    )
    rotationSpeed.current = THREE.MathUtils.lerp(
      rotationSpeed.current,
      clampedRotationSpeed,
      1 - Math.pow(1 - config.rotationSmoothing, delta * 60)
    )

    // Tilt the whole spiral up/down based on scroll (around the local X axis).
    groupRef.current.rotation.x = THREE.MathUtils.damp(
      groupRef.current.rotation.x,
      tiltRef.current,
      6,
      delta
    )

    if (!prefersReducedMotion || manualRotation.current !== 0) {
      groupRef.current.rotation.y += (rotationSpeed.current + manualRotation.current) * delta
    }
    manualRotation.current = THREE.MathUtils.damp(manualRotation.current, 0, 6, delta)

    // Keep the camera level while retaining the reference's subtle pointer
    // parallax around the centered view.
    const pointerTarget = new THREE.Vector2(
      _state.pointer.x * config.pointerParallax,
      -_state.pointer.y * config.pointerParallax * 0.55
    )
    smoothPointer.current.lerp(pointerTarget, 1 - Math.pow(0.955, delta * 60))
    camera.position.set(
      smoothPointer.current.x,
      config.cameraElevation + smoothPointer.current.y,
      cameraDistance
    )
    camera.lookAt(0, config.cameraLookAtY, 0)
  })

  return (
    <>
      <group ref={groupRef}>
        <FloatingParticles />
        {images.map((image, index) => (
          <PhotoCard
            key={image}
            image={image}
            index={index}
            total={images.length}
            config={config}
            radiusScale={radiusScale}
            cardScale={cardScale}
            selected={index === selectedIndex}
            onSelect={onSelect}
            scrollOffset={scrollOffset}
            scrollVelocity={scrollVelocity}
          />
        ))}
      </group>
    </>
  )
}

// ---------------------------------------------------------------------------
// Public component – sits in its own section in normal document flow.
// ---------------------------------------------------------------------------
interface SpiralGalleryProps {
  images?: string[]
}

export function SpiralGallery({ images = [] }: SpiralGalleryProps) {
  const config = DEFAULT_CONFIG
  const fallbackImages = useMemo(() => images, [images])

  const [remoteImages, setRemoteImages] = useState<string[] | null>(null)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [apiError, setApiError] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const manualRotation = useRef(0)
  const scrollTarget = useRef(0)
  const scrollOffset = useRef(0)
  const scrollVelocity = useRef(0)
  const tiltRef = useRef(0)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (images.length > 0) {
      setIsInitialLoading(false)
      return
    }

    const controller = new AbortController()
    const apiBaseUrl = import.meta.env.PUBLIC_API_URL?.replace(/\/$/, '') ?? ''

    fetch(`${apiBaseUrl}/api/spiral-gallery/photos`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Photo API returned ${response.status}`)
        return response.json() as Promise<{ photos?: Array<{ url: string }> }>
      })
      .then((data) => {
        const urls = data.photos
          ?.map((photo) => photo.url.startsWith('http') ? photo.url : `${apiBaseUrl}${photo.url}`)
          .filter(Boolean) ?? []
        if (urls.length > 0) setRemoteImages(urls)
        setIsInitialLoading(false)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Unable to load spiral gallery photos:', error)
        setApiError(true)
        setIsInitialLoading(false)
      })

    return () => controller.abort()
  }, [images.length])

  // The wheel spins the spiral only while the pointer is over the spiral itself
  // (the central band, about as wide as the spiral is tall). Beside it the page
  // scrolls on normally, so the visitor can move up and down through the
  // components. Native listener because React's onWheel is passive.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent) => {
      const rect = stage.getBoundingClientRect()
      const spiralRadius = Math.min(rect.height * 0.5, rect.width * 0.5)
      const overSpiral = Math.abs(event.clientX - (rect.left + rect.width / 2)) <= spiralRadius
      if (!overSpiral) return
      event.preventDefault()
      scrollTarget.current += event.deltaY * 0.01
      tiltRef.current = THREE.MathUtils.clamp(tiltRef.current + event.deltaY * 0.0006, -0.35, 0.35)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const closePreview = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedIndex(null)
    }

    window.addEventListener('keydown', closePreview)
    return () => window.removeEventListener('keydown', closePreview)
  }, [])

  const galleryImages = remoteImages ?? fallbackImages

  const selectedImage = selectedIndex != null ? galleryImages[selectedIndex] : null

  const retry = useCallback(() => {
    setApiError(false)
    setIsInitialLoading(true)
    setRemoteImages(null)
  }, [])

  return (
    <section className="spiral-gallery-section">
      {apiError && (
        <div
          className="spiral-gallery-fallback"
          role="status"
          aria-label="Spiral gallery unavailable"
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
            <p>Spiral gallery could not be loaded.</p>
            <button
              type="button"
              className="spiral-gallery-btn spiral-gallery-retry"
              onClick={retry}
              style={{ marginTop: 10 }}
            >
              Retry
            </button>
          </div>
        </div>
      )}
      <div className="spiral-gallery-content">
        <header className="spiral-gallery-heading">
          <h2>Your Memories With Me</h2>

        </header>
        <QuoteCarousel quotes={SPIRAL_QUOTES} className="quote-spiral" />
        <div
          className="spiral-gallery-stage"
          ref={stageRef}
        >
          <Canvas
            dpr={[1, 2]}
            camera={{ position: [0, 0, config.cameraDistance], fov: 75, near: 0.1, far: 1000 }}
            gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          >
            <SpiralStage
              images={galleryImages}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              manualRotation={manualRotation}
              config={config}
              scrollTarget={scrollTarget}
              scrollOffset={scrollOffset}
              scrollVelocity={scrollVelocity}
              tiltRef={tiltRef}
            />
          </Canvas>

          {isInitialLoading && galleryImages.length === 0 && (
            <div className="spiral-gallery-loading" role="status" aria-label="Loading spiral gallery">
              <p>Loading images…</p>
            </div>
          )}

          <div className="spiral-rotation-controls" aria-label="Rotate spiral">
            <button
              type="button"
              onClick={() => {
                manualRotation.current -= 2.4
              }}
              aria-label="Rotate spiral left"
              title="Rotate left"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => {
                manualRotation.current += 2.4
              }}
              aria-label="Rotate spiral right"
              title="Rotate right"
            >
              →
            </button>
          </div>

          <p className="spiral-gallery-hint">
            Scroll over the spiral to spin it · scroll beside it to continue
          </p>

          {selectedIndex != null && selectedImage && (
            <div
              className="spiral-preview-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Photo preview"
              onClick={() => setSelectedIndex(null)}
              style={{
                position: 'fixed',
                inset: 0,
                width: '100%',
                maxWidth: 'none',
                height: '100%',
                transform: 'none',
                display: 'grid',
                placeItems: 'center',
                padding: 'clamp(24px, 6vw, 72px)',
                background: 'rgba(24, 18, 14, 0.72)',
                border: 0,
                borderRadius: 0,
                boxShadow: 'none',
                zIndex: 20,
                pointerEvents: 'auto',
              }}
            >
              <button
                className="spiral-reset-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedIndex(null)
                }}
                aria-label="Reset selection"
              >
                ✕
              </button>
              <img
                src={selectedImage}
                alt="Photo preview"
                loading="eager"
                onClick={(e) => e.stopPropagation()}
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                }}
                style={{
                  width: 'min(82vw, 560px)',
                  height: 'min(82vh, 720px)',
                  aspectRatio: 'auto',
                  objectFit: 'contain',
                  border: 0,
                  boxShadow: '0 18px 70px rgba(0, 0, 0, 0.35)',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
