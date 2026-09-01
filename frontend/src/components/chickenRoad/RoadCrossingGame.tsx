import React, { useRef, useEffect, useCallback } from 'react';
import type { Difficulty, GameStatus } from '../../services/chickenRoad';

interface RoadCrossingGameProps {
  gameState: GameStatus;
  multipliers: number[];
  currentLane: number;
  difficulty: Difficulty;
  onLaneCross: (laneIndex: number) => void;
  onCollision: (laneIndex: number) => void;
  onFinish: () => void;
  onSteer?: (direction: 'left' | 'right' | null) => void;
  externalSteer?: 'left' | 'right' | null;
}

// World Geometry for Horizontal Road Crossing
const WORLD_HEIGHT = 450;
const START_ZONE_WIDTH = 130;
const LANE_WIDTH = 130;
const FINISH_ZONE_WIDTH = 150;

interface Vehicle {
  id: number;
  lane: number;
  x: number;
  y: number;
  width: number; // horizontal width
  height: number; // vertical length
  speed: number;
  direction: 1 | -1; // 1 = moving DOWN, -1 = moving UP
  type: 'taxi' | 'truck' | 'sportscar' | 'suv' | 'van' | 'sedan' | 'bus';
  color: string;
  roofColor: string;
  wheelColor: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  rotation: number;
  vRot: number;
  life: number;
  maxLife: number;
}

interface Pothole {
  x: number;
  y: number;
  radius: number;
  lane: number;
}

// Web Audio sound synth for zero-latency rich game audio
class SoundManager {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => null);
    }
  }

  playStep() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch {
      // Audio might be blocked
    }
  }

  playLaneCross() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      freqs.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.04);
        gain.gain.setValueAtTime(0.08, now + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.18);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + i * 0.04);
        osc.stop(now + i * 0.04 + 0.18);
      });
    } catch {
      // Audio might be blocked
    }
  }

  playCollision() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch {
      // Audio might be blocked
    }
  }

  playWin() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const melody = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      melody.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(0.12, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.3);
      });
    } catch {
      // Audio might be blocked
    }
  }
}

const sounds = new SoundManager();

export const RoadCrossingGame: React.FC<RoadCrossingGameProps> = ({
  gameState,
  multipliers,
  currentLane,
  difficulty,
  onLaneCross,
  onCollision,
  onFinish,
  externalSteer,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalLanes = multipliers.length || 10;
  const roadWidth = totalLanes * LANE_WIDTH;
  const worldWidth = START_ZONE_WIDTH + roadWidth + FINISH_ZONE_WIDTH;
  const fixedY = WORLD_HEIGHT / 2;

  // Game internal state references
  const stateRef = useRef({
    gameState,
    difficulty,
    currentLane,
    totalLanes,
    worldWidth,
    worldHeight: WORLD_HEIGHT,
    // Chicken hero state (horizontal X-axis movement on fixed Y line)
    chicken: {
      x: 65, // starts on left sidewalk
      y: fixedY,
      vx: 0,
      width: 44,
      height: 44,
      facing: 1, // 1: facing right, -1: facing left
      stepAnim: 0,
      isHit: false,
      isWon: false,
    },
    // Camera
    cameraX: 0,
    // Steer input
    keys: {
      left: false,
      right: false,
      up: false,
    },
    touchSteer: null as 'left' | 'right' | null,
    // Lanes and vehicles
    vehicles: [] as Vehicle[],
    potholes: [] as Pothole[],
    particles: [] as Particle[],
    screenShake: 0,
    highestLaneCrossed: 0,
    lastFrameTime: performance.now(),
  });

  // Keep stateRef in sync with props
  useEffect(() => {
    stateRef.current.gameState = gameState;
    stateRef.current.difficulty = difficulty;
    stateRef.current.totalLanes = totalLanes;
    stateRef.current.worldWidth = worldWidth;
  }, [gameState, difficulty, totalLanes, worldWidth]);

  // Snap chicken X to the correct lane position whenever currentLane changes
  useEffect(() => {
    const s = stateRef.current;
    if (currentLane === 0) {
      // Start zone — place chicken in the middle of the start pad
      s.chicken.x = 65;
    } else {
      // Centre of the crossed lane (one lane ahead = right edge of that lane)
      s.chicken.x = START_ZONE_WIDTH + currentLane * LANE_WIDTH - LANE_WIDTH / 2;
    }
    s.chicken.y = fixedY;
    s.currentLane = currentLane;
    // Keep multiplier ring "crossed" state in sync
    if (currentLane > s.highestLaneCrossed) {
      s.highestLaneCrossed = currentLane;
    }
  }, [currentLane, fixedY]);

  useEffect(() => {
    if (gameState === 'READY') {
      // Reset chicken position to left starting zone
      const s = stateRef.current;
      s.chicken.x = 65;
      s.chicken.y = fixedY;
      s.chicken.vx = 0;
      s.chicken.facing = 1;
      s.chicken.stepAnim = 0;
      s.chicken.isHit = false;
      s.chicken.isWon = false;
      s.highestLaneCrossed = 0;
      s.cameraX = 0;
      s.particles = [];
      s.potholes = [];
      s.screenShake = 0;
    } else if (gameState === 'LOST') {
      stateRef.current.chicken.isHit = true;
    } else if (gameState === 'WON') {
      stateRef.current.chicken.isWon = true;
    }
  }, [gameState, fixedY]);

  // Update external steer from touch buttons
  useEffect(() => {
    stateRef.current.touchSteer = externalSteer || null;
  }, [externalSteer]);

  // Generate Vertical Traffic (Vehicles Travelling UP / DOWN across vertical lanes)
  const generateTraffic = useCallback(() => {
    const vehicles: Vehicle[] = [];
    let idCounter = 1;

    const vehicleTemplates: {
      type: Vehicle['type'];
      width: number;
      height: number;
      color: string;
      roofColor: string;
      wheelColor: string;
    }[] = [
      { type: 'taxi', width: 36, height: 74, color: '#FBBF24', roofColor: '#F59E0B', wheelColor: '#1E293B' },
      { type: 'sportscar', width: 34, height: 72, color: '#EF4444', roofColor: '#DC2626', wheelColor: '#0F172A' },
      { type: 'sedan', width: 35, height: 76, color: '#3B82F6', roofColor: '#2563EB', wheelColor: '#1E293B' },
      { type: 'suv', width: 38, height: 80, color: '#8B5CF6', roofColor: '#7C3AED', wheelColor: '#0F172A' },
      { type: 'truck', width: 42, height: 96, color: '#10B981', roofColor: '#059669', wheelColor: '#0F172A' },
      { type: 'van', width: 38, height: 84, color: '#F8FAFC', roofColor: '#E2E8F0', wheelColor: '#1E293B' },
      { type: 'bus', width: 40, height: 104, color: '#F97316', roofColor: '#EA580C', wheelColor: '#0F172A' },
    ];

    // Speed scales up with difficulty; both tiers raised so wide, easy gaps
    // no longer dominate (was 1.35 / 1.75 — too forgiving to require real timing)
    const speedMultipliers: Record<Difficulty, number> = {
      MEDIUM: 1.55,
      HARD:   2.10,
    };

    // Traffic density (vehicles per lane) now scales with difficulty too —
    // previously fixed at 2 regardless of difficulty, which left huge safe
    // gaps to walk through and made every difficulty equally (too) easy.
    const vehicleCountByDifficulty: Record<Difficulty, number> = {
      MEDIUM: 3,
      HARD:   4,
    };

    const speedFactor = speedMultipliers[difficulty] || 1.0;
    const numVehicles = vehicleCountByDifficulty[difficulty] || 3;
    // Minimum required clearance (beyond vehicle body length) between two
    // vehicles sharing a lane, used to bound spawn jitter so vehicles are
    // never placed within overlapping distance of one another.
    const VEHICLE_SAFE_GAP = 40;

    for (let lane = 1; lane <= totalLanes; lane++) {
      // Alternating vertical direction: odd lanes move DOWN, even lanes move UP
      const direction: 1 | -1 = lane % 2 === 1 ? 1 : -1;
      const laneCenterX = START_ZONE_WIDTH + (lane - 0.5) * LANE_WIDTH;

      // Progressive difficulty: speed climbs steadily from the first lane to
      // the last (was `lane % 3`, which cycled rather than escalated), so
      // later lanes near the finish are genuinely harder than early ones.
      const laneProgress = totalLanes > 1 ? (lane - 1) / (totalLanes - 1) : 0;
      const baseSpeed = (2.3 + laneProgress * 1.8 + Math.random() * 0.4) * speedFactor;

      // Vehicles per vertical lane, spaced out to guarantee crossing gaps
      const laneSpacing = (WORLD_HEIGHT + 240) / numVehicles;

      for (let i = 0; i < numVehicles; i++) {
        const template = vehicleTemplates[(lane + i * 2) % vehicleTemplates.length];
        const idealY =
          direction === 1
            ? -100 + i * laneSpacing
            : WORLD_HEIGHT + 100 - i * laneSpacing;

        // Bound the random jitter so it can never shrink the gap to a
        // neighboring vehicle below VEHICLE_SAFE_GAP — validated spacing
        // instead of a pure visual workaround.
        const maxJitter = Math.max(0, Math.min(15, (laneSpacing - template.height - VEHICLE_SAFE_GAP) / 2));
        const jitter = maxJitter > 0 ? (Math.random() * 2 - 1) * maxJitter : 0;
        const startY = idealY + jitter;

        vehicles.push({
          id: idCounter++,
          lane,
          x: laneCenterX,
          y: startY,
          width: template.width,
          height: template.height,
          // All vehicles in the same lane now share identical speed — a
          // per-vehicle offset here (previously `+ i * 0.15`) caused faster
          // cars to drift into and overtake slower ones in the same lane
          // over time, which was the root cause of visible car overlap.
          speed: baseSpeed,
          direction,
          type: template.type,
          color: template.color,
          roofColor: template.roofColor,
          wheelColor: template.wheelColor,
        });
      }
    }

    stateRef.current.vehicles = vehicles;
  }, [difficulty, totalLanes]);

  useEffect(() => {
    generateTraffic();
  }, [generateTraffic]);

  // ── Secure random helper (Web Crypto API – no predictable pattern) ──
  const secureRandom = useCallback((): number => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 0x100000000; // [0, 1)
  }, []);

  // Generate static pothole obstacles per round using crypto randomness
  const generatePotholes = useCallback(() => {
    const holes: Pothole[] = [];
    const roadTop = 45;
    const roadBottom = WORLD_HEIGHT - 45;

    // Per-lane probability and max slot count by difficulty
    // (raised slightly alongside traffic density so easy "no obstacle" lanes
    // are less common — part of the overall difficulty pass)
    const chancePerSlot: Record<Difficulty, number> = {
      MEDIUM: 0.65,
      HARD:   0.88,
    };
    const slotsPerLane: Record<Difficulty, number> = {
      MEDIUM: 5,
      HARD:   7,
    };

    const chance = chancePerSlot[stateRef.current.difficulty];
    const slots  = slotsPerLane[stateRef.current.difficulty];

    for (let lane = 1; lane <= stateRef.current.totalLanes; lane++) {
      const laneLeftX = START_ZONE_WIDTH + (lane - 1) * LANE_WIDTH;

      for (let slot = 0; slot < slots; slot++) {
        if (secureRandom() < chance) {
          // X: random within lane, 12 px margin from lane edges
          const x = laneLeftX + 12 + secureRandom() * (LANE_WIDTH - 24);
          // Y: fully random within road surface (unpredictable hit / no-hit)
          const y = roadTop + 12 + secureRandom() * (roadBottom - roadTop - 24);
          // Radius 9–17 px — larger potholes are more dangerous
          const radius = 9 + secureRandom() * 8;
          holes.push({ x, y, radius, lane });
        }
      }
    }

    stateRef.current.potholes = holes;
  }, [secureRandom]);

  // Regenerate potholes fresh every time a new game starts
  useEffect(() => {
    if (gameState === 'ACTIVE') {
      generatePotholes();
    }
  }, [gameState, generatePotholes]);

  // Keyboard and touch listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'KeyA', 'a', 'A'].includes(e.code)) {
        stateRef.current.keys.left = true;
      }
      if (['ArrowRight', 'KeyD', 'd', 'D'].includes(e.code)) {
        stateRef.current.keys.right = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'KeyA', 'a', 'A'].includes(e.code)) {
        stateRef.current.keys.left = false;
      }
      if (['ArrowRight', 'KeyD', 'd', 'D'].includes(e.code)) {
        stateRef.current.keys.right = false;
      }
    };

    // Canvas touch drag / swipe support horizontally
    let touchStartX: number | null = null;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartX === null || e.touches.length === 0) return;
      const currentX = e.touches[0].clientX;
      const diffX = currentX - touchStartX;
      if (diffX < -12) {
        stateRef.current.touchSteer = 'left';
      } else if (diffX > 12) {
        stateRef.current.touchSteer = 'right';
      } else {
        stateRef.current.touchSteer = null;
      }
    };

    const handleTouchEnd = () => {
      touchStartX = null;
      if (!externalSteer) {
        stateRef.current.touchSteer = null;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const canvasEl = containerRef.current;
    if (canvasEl) {
      canvasEl.addEventListener('touchstart', handleTouchStart, { passive: true });
      canvasEl.addEventListener('touchmove', handleTouchMove, { passive: true });
      canvasEl.addEventListener('touchend', handleTouchEnd, { passive: true });
      canvasEl.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (canvasEl) {
        canvasEl.removeEventListener('touchstart', handleTouchStart);
        canvasEl.removeEventListener('touchmove', handleTouchMove);
        canvasEl.removeEventListener('touchend', handleTouchEnd);
        canvasEl.removeEventListener('touchcancel', handleTouchEnd);
      }
    };
  }, [externalSteer]);

  // Main Canvas Render Loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions with high-DPI scaling
    const updateCanvasSize = () => {
      if (!containerRef.current || !canvas) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    window.addEventListener('orientationchange', updateCanvasSize);

    // Observe the container itself (not just window resize) — Android
    // WebViews can change the container's actual box size (safe-area insets
    // settling after mount, system bar show/hide, split-screen) without
    // firing a window 'resize' event, which previously left the canvas's
    // raster buffer stale relative to its true on-screen size and caused
    // the bottom of the game to appear clipped.
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => updateCanvasSize());
      resizeObserver.observe(containerRef.current);
    }

    // Re-measure shortly after mount in case Android's system bars / safe
    // area haven't settled to their final size on the very first layout pass
    const settleTimer = window.setTimeout(updateCanvasSize, 300);

    // Particle spawn helper
    const spawnFeathers = (x: number, y: number) => {
      const colors = ['#FFFFFF', '#FEF08A', '#FDE047', '#F97316', '#EF4444'];
      for (let i = 0; i < 32; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 6;
        stateRef.current.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 5 + Math.random() * 6,
          alpha: 1.0,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.3,
          life: 0,
          maxLife: 45 + Math.random() * 25,
        });
      }
    };

    const spawnStarBurst = (x: number, y: number) => {
      const colors = ['#FBBF24', '#FCD34D', '#10B981', '#34D399', '#FFFFFF'];
      for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 4;
        stateRef.current.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 4 + Math.random() * 4,
          alpha: 1.0,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.2,
          life: 0,
          maxLife: 30 + Math.random() * 15,
        });
      }
    };

    const renderLoop = (time: number) => {
      const s = stateRef.current;
      const dt = Math.min(32, time - s.lastFrameTime) / 16.666;
      s.lastFrameTime = time;

      const dpr = window.devicePixelRatio || 1;
      const rect = containerRef.current?.getBoundingClientRect() || { width: 844, height: 270 };
      const viewScale = rect.height > 0 ? rect.height / WORLD_HEIGHT : 1;
      // Guard: skip frame if canvas has no size yet
      if (rect.width <= 0 || rect.height <= 0) {
        animId = requestAnimationFrame(renderLoop);
        return;
      }
      const viewWidthInWorld = rect.width / viewScale;

      // ──────────────────────────────────────────
      // 1. UPDATE GAME PHYSICS & MOVEMENT
      // ──────────────────────────────────────────

      // Update vertical traffic
      s.vehicles.forEach((v) => {
        v.y += v.speed * v.direction * dt;
      });

      // Wrap-around respawn, validated against same-lane neighbors so a
      // vehicle never reappears overlapping (or too close to) another car
      // already near the spawn point — delays respawn by holding the
      // vehicle just past the edge until a safe gap opens, instead of
      // blindly resetting its position.
      s.vehicles.forEach((v) => {
        const goingDown = v.direction === 1;
        const pastEdge = goingDown ? v.y > WORLD_HEIGHT + 120 : v.y < -120;
        if (!pastEdge) return;

        const resetY = goingDown ? -120 : WORLD_HEIGHT + 120;
        let nearestGap = Infinity;
        for (const other of s.vehicles) {
          if (other === v || other.lane !== v.lane || other.direction !== v.direction) continue;
          const gap = Math.abs(other.y - resetY);
          if (gap < nearestGap) nearestGap = gap;
        }

        const minGap = Math.max(v.height, 40) + 40;
        if (nearestGap >= minGap) {
          v.y = resetY;
        }
        // else: hold position just past the edge (invisible, off-screen)
        // and re-check next frame once the lane clears
      });

      // Update chicken if ACTIVE (Horizontal movement only)
      if (s.gameState === 'ACTIVE' && !s.chicken.isHit && !s.chicken.isWon) {
        let steerDir = 0;
        if (s.keys.left || s.touchSteer === 'left') steerDir -= 1;
        if (s.keys.right || s.touchSteer === 'right') steerDir += 1;

        const maxSpeed = 4.8;
        if (steerDir !== 0) {
          s.chicken.vx += steerDir * 1.0 * dt;
          s.chicken.vx = Math.max(-maxSpeed, Math.min(maxSpeed, s.chicken.vx));
          s.chicken.facing = steerDir;
          s.chicken.stepAnim += 0.28 * dt;
        } else {
          s.chicken.vx *= 0.82;
          if (Math.abs(s.chicken.vx) < 0.1) s.chicken.vx = 0;
        }

        s.chicken.x += s.chicken.vx * dt;

        // Keep chicken on fixed horizontal path Y
        s.chicken.y = fixedY;

        // Clamp inside world boundaries
        s.chicken.x = Math.max(35, Math.min(s.worldWidth - 40, s.chicken.x));

        // Lane crossing detection as chicken advances to the right
        const distFromStart = s.chicken.x - START_ZONE_WIDTH;
        if (distFromStart > 0) {
          const currentCrossedLane = Math.floor(distFromStart / LANE_WIDTH) + 1;
          if (currentCrossedLane > s.highestLaneCrossed && currentCrossedLane <= s.totalLanes) {
            s.highestLaneCrossed = currentCrossedLane;
            sounds.playLaneCross();
            spawnStarBurst(s.chicken.x, s.chicken.y);
            onLaneCross(currentCrossedLane);
          }
        }

        // Check if chicken reached the RIGHT Finish Safe Zone
        const finishStartX = START_ZONE_WIDTH + s.totalLanes * LANE_WIDTH;
        if (s.chicken.x >= finishStartX + 30) {
          s.chicken.isWon = true;
          sounds.playWin();
          spawnStarBurst(s.chicken.x, s.chicken.y);
          onFinish();
        }

        // ──────────────────────────────────────────
        // 2. FORGIVING COLLISION DETECTION
        // ──────────────────────────────────────────
        const chickenBox = {
          left: s.chicken.x - 12,
          right: s.chicken.x + 12,
          top: s.chicken.y - 12,
          bottom: s.chicken.y + 12,
        };

        for (const v of s.vehicles) {
          const vBox = {
            left: v.x - v.width / 2 + 6,
            right: v.x + v.width / 2 - 6,
            top: v.y - v.height / 2 + 10,
            bottom: v.y + v.height / 2 - 10,
          };

          // AABB Box intersection
          if (
            chickenBox.left < vBox.right &&
            chickenBox.right > vBox.left &&
            chickenBox.top < vBox.bottom &&
            chickenBox.bottom > vBox.top
          ) {
            s.chicken.isHit = true;
            s.screenShake = 16;
            spawnFeathers(s.chicken.x, s.chicken.y);
            sounds.playCollision();
            onCollision(v.lane);
            break;
          }
        }

        // ── Pothole collision (static circular obstacles) ──
        if (!s.chicken.isHit) {
          for (const ph of s.potholes) {
            const dx = s.chicken.x - ph.x;
            const dy = s.chicken.y - ph.y;
            // chicken radius ~10, add pothole radius for combined hit zone
            if (dx * dx + dy * dy < (ph.radius + 10) * (ph.radius + 10)) {
              s.chicken.isHit = true;
              s.screenShake = 14;
              spawnFeathers(s.chicken.x, s.chicken.y);
              sounds.playCollision();
              onCollision(ph.lane);
              break;
            }
          }
        }
      }

      // Smooth horizontal camera follow (chicken positioned ~30% from the left)
      if (s.gameState === 'READY') {
        s.cameraX = 0;
      } else {
        const targetCamX = s.chicken.x - viewWidthInWorld * 0.32;
        const maxCamX = Math.max(0, s.worldWidth - viewWidthInWorld);
        const clampedCamX = Math.max(0, Math.min(maxCamX, targetCamX));
        s.cameraX += (clampedCamX - s.cameraX) * 0.12 * dt;
      }

      // Update screen shake
      if (s.screenShake > 0) {
        s.screenShake *= 0.88;
        if (s.screenShake < 0.2) s.screenShake = 0;
      }

      // Update particles
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.12 * dt; // gravity
        p.rotation += p.vRot * dt;
        p.life += dt;
        p.alpha = Math.max(0, 1 - p.life / p.maxLife);
        if (p.life >= p.maxLife) {
          s.particles.splice(i, 1);
        }
      }

      // ──────────────────────────────────────────
      // 3. DRAWING & RENDERING (Horizontal Road Arcade)
      // ──────────────────────────────────────────
      ctx.save();
      ctx.scale(dpr * viewScale, dpr * viewScale);

      // Screen shake offset
      const shakeX = s.screenShake ? (Math.random() - 0.5) * s.screenShake : 0;
      const shakeY = s.screenShake ? (Math.random() - 0.5) * s.screenShake : 0;
      ctx.translate(-s.cameraX + shakeX, shakeY);

      // 1. Top and Bottom Roadside Grass Shoulders (#1E641D base)
      ctx.fillStyle = '#1E641D';
      ctx.fillRect(0, 0, s.worldWidth, WORLD_HEIGHT);

      // Subtle grass lawn stripes on top and bottom
      ctx.fillStyle = '#287A25';
      for (let x = 0; x < s.worldWidth; x += 50) {
        if ((x / 50) % 2 === 0) {
          ctx.fillRect(x, 0, 50, 45);
          ctx.fillRect(x, WORLD_HEIGHT - 45, 50, 45);
        }
      }

      // 2. Road Surface Asphalt (#686868 textured)
      const roadTop = 45;
      const roadBottom = WORLD_HEIGHT - 45;
      const roadHeight = roadBottom - roadTop;

      ctx.fillStyle = '#666666';
      ctx.fillRect(START_ZONE_WIDTH, roadTop, s.totalLanes * LANE_WIDTH, roadHeight);

      // Subtle asphalt grain texture bands (#505050)
      ctx.fillStyle = 'rgba(30, 30, 30, 0.12)';
      for (let x = START_ZONE_WIDTH; x < START_ZONE_WIDTH + s.totalLanes * LANE_WIDTH; x += 28) {
        if ((x / 28) % 2 === 0) {
          ctx.fillRect(x, roadTop, 14, roadHeight);
        }
      }

      // 3. Concrete Curbs & Road Edge Borders (#D0D0D0 curb accents)
      // Top Road Curb
      ctx.fillStyle = '#D0D0D0';
      ctx.fillRect(START_ZONE_WIDTH, roadTop - 8, s.totalLanes * LANE_WIDTH, 8);
      ctx.fillStyle = '#777777';
      ctx.fillRect(START_ZONE_WIDTH, roadTop - 2, s.totalLanes * LANE_WIDTH, 2);

      // Bottom Road Curb
      ctx.fillStyle = '#D0D0D0';
      ctx.fillRect(START_ZONE_WIDTH, roadBottom, s.totalLanes * LANE_WIDTH, 8);
      ctx.fillStyle = '#777777';
      ctx.fillRect(START_ZONE_WIDTH, roadBottom, s.totalLanes * LANE_WIDTH, 2);

      // Curb Joint Notches
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 1.5;
      for (let x = START_ZONE_WIDTH; x < START_ZONE_WIDTH + s.totalLanes * LANE_WIDTH; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, roadTop - 8);
        ctx.lineTo(x, roadTop);
        ctx.moveTo(x, roadBottom);
        ctx.lineTo(x, roadBottom + 8);
        ctx.stroke();
      }

      // 4. Left Start Zone (Sidewalk & Starting Pad)
      ctx.fillStyle = '#555555';
      ctx.fillRect(0, roadTop, START_ZONE_WIDTH, roadHeight);

      // Starting Sidewalk Yellow Hazard Border (#FBBF24)
      ctx.strokeStyle = '#FBBF24';
      ctx.lineWidth = 3.5;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(START_ZONE_WIDTH, roadTop);
      ctx.lineTo(START_ZONE_WIDTH, roadBottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Start sidewalk tile markings
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      for (let y = roadTop; y < roadBottom; y += 35) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(START_ZONE_WIDTH, y);
        ctx.stroke();
      }

      // Start Zone Sign
      ctx.save();
      ctx.font = '900 13px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.textAlign = 'center';
      ctx.fillText('START', START_ZONE_WIDTH / 2, fixedY - 35);
      ctx.restore();

      // 5. Right Finish Zone (Checkered Flag Strip & Banner)
      const finishStartX = START_ZONE_WIDTH + s.totalLanes * LANE_WIDTH;
      ctx.fillStyle = '#1B4D21';
      ctx.fillRect(finishStartX, roadTop, FINISH_ZONE_WIDTH, roadHeight);

      // Checkered Finish Strip
      const checkerSize = 15;
      const numCheckerCols = 3;
      for (let col = 0; col < numCheckerCols; col++) {
        for (let row = 0; row < roadHeight / checkerSize; row++) {
          ctx.fillStyle = (col + row) % 2 === 0 ? '#FFFFFF' : '#1E293B';
          ctx.fillRect(
            finishStartX + col * checkerSize,
            roadTop + row * checkerSize,
            checkerSize,
            checkerSize
          );
        }
      }

      // Finish Banner
      ctx.save();
      ctx.font = '900 15px Inter, sans-serif';
      ctx.fillStyle = '#FCD34D';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 8;
      ctx.fillText('🏁 FINISH 🏆', finishStartX + FINISH_ZONE_WIDTH / 2 + 15, fixedY - 4);
      ctx.restore();



      // 6. Vertical Traffic Lanes & Horizontal Multiplier Checkpoints
      for (let lane = 1; lane <= s.totalLanes; lane++) {
        const laneLeftX = START_ZONE_WIDTH + (lane - 1) * LANE_WIDTH;
        const laneCenterX = laneLeftX + LANE_WIDTH / 2;

        // Vertical lane divider dashed white markings (#E8E8E8)
        if (lane < s.totalLanes) {
          ctx.strokeStyle = '#E8E8E8';
          ctx.lineWidth = 3;
          ctx.setLineDash([20, 16]);
          ctx.beginPath();
          ctx.moveTo(laneLeftX + LANE_WIDTH, roadTop + 10);
          ctx.lineTo(laneLeftX + LANE_WIDTH, roadBottom - 10);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Direction Arrow in lane (pointing UP or DOWN)
        const dir = lane % 2 === 1 ? '▼' : '▲';
        ctx.font = '14px Inter, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.textAlign = 'center';
        ctx.fillText(dir, laneCenterX, roadTop + 25);
        ctx.fillText(dir, laneCenterX, roadBottom - 20);

        // Pothole / Manhole Multiplier Checkpoint embedded in asphalt
        const mult = multipliers[lane - 1] || 1.0 + lane * 0.05;
        const isCrossed = s.highestLaneCrossed >= lane;
        const markerX = laneCenterX;
        const markerY = fixedY;

        ctx.save();
        // Drop shadow on asphalt
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.arc(markerX, markerY + 2, 28, 0, Math.PI * 2);
        ctx.fill();

        // Outer Metallic Ring with Bevel
        ctx.beginPath();
        ctx.arc(markerX, markerY, 26, 0, Math.PI * 2);
        if (isCrossed) {
          ctx.fillStyle = '#1A3822';
          ctx.shadowColor = '#34D399';
          ctx.shadowBlur = 16;
        } else {
          ctx.fillStyle = '#3A3A3A';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
          ctx.shadowBlur = 5;
        }
        ctx.fill();
        ctx.strokeStyle = isCrossed ? '#34D399' : '#555555';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Inner Metal Plate
        ctx.beginPath();
        ctx.arc(markerX, markerY, 20, 0, Math.PI * 2);
        ctx.fillStyle = isCrossed ? '#102A18' : '#282828';
        ctx.fill();
        ctx.strokeStyle = isCrossed ? 'rgba(52, 211, 153, 0.6)' : '#444444';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 6 Perimeter Hex Bolt Accents
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
          const bx = markerX + Math.cos(a) * 23;
          const by = markerY + Math.sin(a) * 23;
          ctx.fillStyle = isCrossed ? '#34D399' : '#777777';
          ctx.beginPath();
          ctx.arc(bx, by, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Multiplier Text
        ctx.font = '900 13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isCrossed ? '#6EE7B7' : '#E6E6E6';
        ctx.shadowBlur = 0;
        ctx.fillText(`${mult.toFixed(2)}x`, markerX, markerY);
        ctx.restore();
      }

      // 7. Decorative Trees along Top & Bottom Lawns
      for (let x = 60; x < s.worldWidth; x += 150) {
        // Top Tree
        ctx.beginPath();
        ctx.arc(x, 22, 18, 0, Math.PI * 2);
        ctx.fillStyle = '#166534';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, 19, 13, 0, Math.PI * 2);
        ctx.fillStyle = '#22C55E';
        ctx.fill();

        // Bottom Tree
        ctx.beginPath();
        ctx.arc(x, WORLD_HEIGHT - 22, 18, 0, Math.PI * 2);
        ctx.fillStyle = '#166534';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, WORLD_HEIGHT - 25, 13, 0, Math.PI * 2);
        ctx.fillStyle = '#22C55E';
        ctx.fill();
      }

      // ──────────────────────────────────────────
      // 4. DRAW VERTICAL VEHICLES (Moving UP/DOWN)
      // ──────────────────────────────────────────
      s.vehicles.forEach((v) => {
        ctx.save();
        ctx.translate(v.x, v.y);

        const lightDir = v.direction; // 1 = DOWN, -1 = UP

        // Headlight Light Cones projected vertically onto asphalt
        const lightGrad = ctx.createRadialGradient(
          0,
          lightDir * (v.height / 2 + 5),
          2,
          0,
          lightDir * (v.height / 2 + 75),
          65
        );
        lightGrad.addColorStop(0, 'rgba(254, 240, 138, 0.38)');
        lightGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
        ctx.fillStyle = lightGrad;
        ctx.beginPath();
        ctx.moveTo(-v.width * 0.4, lightDir * (v.height / 2));
        ctx.lineTo(-v.width * 1.2, lightDir * (v.height / 2 + 75));
        ctx.lineTo(v.width * 1.2, lightDir * (v.height / 2 + 75));
        ctx.lineTo(v.width * 0.4, lightDir * (v.height / 2));
        ctx.closePath();
        ctx.fill();

        // Vehicle Drop Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.roundRect(-v.width / 2 + 3, -v.height / 2 + 4, v.width, v.height, 8);
        ctx.fill();

        // Wheels on left & right sides
        const wheelW = 6;
        const wheelH = 14;
        ctx.fillStyle = v.wheelColor;
        // Left wheels
        ctx.fillRect(-v.width / 2 - 2, -v.height / 2 + 10, wheelW, wheelH);
        ctx.fillRect(-v.width / 2 - 2, v.height / 2 - 24, wheelW, wheelH);
        // Right wheels
        ctx.fillRect(v.width / 2 - 4, -v.height / 2 + 10, wheelW, wheelH);
        ctx.fillRect(v.width / 2 - 4, v.height / 2 - 24, wheelW, wheelH);

        // Vehicle Chassis Body
        ctx.fillStyle = v.color;
        ctx.beginPath();
        ctx.roundRect(-v.width / 2, -v.height / 2, v.width, v.height, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Windshield Glass (oriented toward front)
        const windshieldY = lightDir === 1 ? v.height * 0.08 : -v.height * 0.32;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.beginPath();
        ctx.roundRect(-v.width * 0.35, windshieldY, v.width * 0.7, v.height * 0.35, 4);
        ctx.fill();

        // Roof Top
        ctx.fillStyle = v.roofColor;
        ctx.beginPath();
        ctx.roundRect(-v.width * 0.25, windshieldY + (lightDir === 1 ? 4 : 4), v.width * 0.5, v.height * 0.22, 3);
        ctx.fill();

        // Taxi Sign on roof if taxi
        if (v.type === 'taxi') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(-8, -4, 16, 8);
          ctx.fillStyle = '#000000';
          ctx.font = '700 6px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('TAXI', 0, 0);
        }

        // Headlights (Front edge in travel direction)
        ctx.fillStyle = '#FEF08A';
        const frontY = lightDir === 1 ? v.height / 2 - 3 : -v.height / 2;
        ctx.fillRect(-v.width / 2 + 4, frontY, 6, 3);
        ctx.fillRect(v.width / 2 - 10, frontY, 6, 3);

        // Tail Lights (Rear edge)
        ctx.fillStyle = '#EF4444';
        const rearY = lightDir === 1 ? -v.height / 2 : v.height / 2 - 3;
        ctx.fillRect(-v.width / 2 + 4, rearY, 6, 3);
        ctx.fillRect(v.width / 2 - 10, rearY, 6, 3);

        ctx.restore();
      });

      // ──────────────────────────────────────────
      // 5. DRAW CHICKEN HERO (Facing RIGHT on fixed horizontal crossing line)
      // ──────────────────────────────────────────
      const ch = s.chicken;
      ctx.save();
      ctx.translate(ch.x, ch.y);

      // Soft oval drop shadow under feet
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.beginPath();
      ctx.ellipse(0, 18, 18, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      if (ch.isHit) {
        // Hit / Crash state
        ctx.font = '36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💥', 0, -2);
      } else {
        // Walking bob and foot waddle
        const bob = Math.sin(ch.stepAnim * Math.PI * 2) * 3;
        const footWiggle = Math.cos(ch.stepAnim * Math.PI * 2) * 5;
        const leanAngle = ch.vx * 0.04;

        ctx.rotate(leanAngle);

        // Feet (Orange)
        ctx.fillStyle = '#EA580C';
        ctx.beginPath();
        ctx.ellipse(-8 + footWiggle, 16, 5, 3, 0, 0, Math.PI * 2);
        ctx.ellipse(8 - footWiggle, 16, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Fluffy Tail Feathers on left side (behind chicken moving right)
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath();
        ctx.ellipse(-14, 2 + bob, 8, 12, 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Main Body (Fluffy White-Cream Gradient)
        const bodyGrad = ctx.createRadialGradient(2, -3 + bob, 4, 0, 0 + bob, 20);
        bodyGrad.addColorStop(0, '#FFFFFF');
        bodyGrad.addColorStop(0.7, '#FEF9C3');
        bodyGrad.addColorStop(1, '#FDE047');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, bob, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#CA8A04';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Wings (Flapping on side)
        const wingFlap = Math.abs(Math.sin(ch.stepAnim * Math.PI * 2)) * 4;
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath();
        ctx.ellipse(-2, 3 + bob, 10, 6 + wingFlap, -0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Red Comb / Crest on head
        ctx.fillStyle = '#EF4444';
        // Center peak
        ctx.beginPath();
        ctx.arc(2, -18 + bob, 5.5, 0, Math.PI * 2);
        ctx.fill();
        // Left peak
        ctx.beginPath();
        ctx.arc(-3, -16 + bob, 4.5, 0, Math.PI * 2);
        ctx.fill();
        // Right peak
        ctx.beginPath();
        ctx.arc(7, -16 + bob, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Glossy Cartoon Eye (facing right)
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.arc(8, -4 + bob, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Eye specular highlight
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(9, -5 + bob, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Cheeks (Blush)
        ctx.fillStyle = 'rgba(244, 63, 94, 0.4)';
        ctx.beginPath();
        ctx.arc(6, 2 + bob, 3, 0, Math.PI * 2);
        ctx.fill();

        // Orange Beak (pointing right towards road crossing)
        ctx.fillStyle = '#F97316';
        ctx.beginPath();
        ctx.moveTo(14, -2 + bob);
        ctx.lineTo(22, 2 + bob);
        ctx.lineTo(14, 6 + bob);
        ctx.closePath();
        ctx.fill();

        // Red Wattle under beak
        ctx.fillStyle = '#DC2626';
        ctx.beginPath();
        ctx.arc(14, 8 + bob, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // ──────────────────────────────────────────
      // 6. DRAW PARTICLES
      // ──────────────────────────────────────────
      s.particles.forEach((p) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });

      ctx.restore();

      // Request next frame
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', updateCanvasSize);
      window.removeEventListener('orientationchange', updateCanvasSize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.clearTimeout(settleTimer);
    };
  }, [onLaneCross, onCollision, onFinish, multipliers, fixedY]);

  return (
    <div ref={containerRef} className="chicken-road-canvas-container">
      <canvas ref={canvasRef} className="chicken-road-canvas" />
    </div>
  );
};
