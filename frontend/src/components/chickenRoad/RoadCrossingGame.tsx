import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Difficulty, GameStatus } from '../../services/chickenRoad';
import { soundManager } from '../../services/soundManager';

/** How a hop into a lane ended, as the road plays it out. */
export type StepOutcome = 'safe' | 'hit' | 'won' | 'error';

export interface RoadCrossingHandle {
  /** The chicken is standing still in a round in play, ready for its next hop. */
  canStep(): boolean;
  /**
   * Hops the chicken into `lane` and plays out the server's verdict on it: a
   * barrier drops and holds the traffic back (safe), a car runs it over (hit),
   * it goes on over the finish line (won), or it hops back where it came from
   * because no verdict is coming (error). Resolves with that outcome once it
   * has been shown.
   */
  step(lane: number, verdict: Promise<StepOutcome>): Promise<StepOutcome>;
}

interface RoadCrossingGameProps {
  gameState: GameStatus;
  multipliers: number[];
  // Lanes the server has the chicken across: where it stands between hops.
  currentLane: number;
  difficulty: Difficulty;
  ref?: React.Ref<RoadCrossingHandle>;
}

// World geometry. The road runs left to right; its lanes are vertical and the
// traffic in every lane drives down the screen.
const WORLD_HEIGHT = 450;
const ROAD_TOP = 45;
const ROAD_BOTTOM = WORLD_HEIGHT - 45;
const START_ZONE_WIDTH = 130;
const LANE_WIDTH = 130;
const FINISH_ZONE_WIDTH = 170;
// The chicken crosses along this line, standing on the manhole in the middle of each lane.
const CROSSING_Y = WORLD_HEIGHT / 2;
const CHICKEN_TOP = CROSSING_Y - 24; // comb
const CHICKEN_BOTTOM = CROSSING_Y + 20; // feet
// A safe lane's barrier stands just above the chicken, and the traffic stops behind it.
const BARRIER_Y = CROSSING_Y - 44;
const STOP_LINE = BARRIER_Y - 10; // front bumper of a car stopped at the barrier

// Traffic, in world units and 60 fps frames.
const CAR_GAP = 12; // bumper to bumper in a queue
const CAR_ACCEL = 0.3;
const CAR_BRAKE = 0.9;
const RUSH_SPEED = 17; // the car sent at a chicken the server ruled hit
const RUSH_ACCEL = 1.3;
const FRAME_MS = 1000 / 60;

// Cruising speed climbs from the first lane to the last; a new car turns up
// in each lane every gapMs.
const TRAFFIC: Record<Difficulty, { speed: [number, number]; gapMs: [number, number] }> = {
  MEDIUM: { speed: [5.4, 7.6], gapMs: [800, 2200] },
  HARD: { speed: [6.8, 9.4], gapMs: [600, 1700] },
};

const HOP_MS = 380;
const HOP_HEIGHT = 30;
// Share of a hop after which the chicken is inside the next lane's traffic.
const HOP_ENTRY = 0.55;
const BARRIER_DROP_MS = 280;

interface VehicleLook {
  type: 'taxi' | 'sport' | 'sedan' | 'suv' | 'truck' | 'van' | 'bus';
  width: number;
  length: number;
  color: string;
  roof: string;
}

const VEHICLE_LOOKS: VehicleLook[] = [
  { type: 'taxi', width: 36, length: 74, color: '#FBBF24', roof: '#F59E0B' },
  { type: 'sport', width: 34, length: 70, color: '#EF4444', roof: '#DC2626' },
  { type: 'sedan', width: 35, length: 76, color: '#3B82F6', roof: '#2563EB' },
  { type: 'suv', width: 38, length: 80, color: '#8B5CF6', roof: '#7C3AED' },
  { type: 'truck', width: 42, length: 98, color: '#10B981', roof: '#059669' },
  { type: 'van', width: 38, length: 84, color: '#F8FAFC', roof: '#CBD5E1' },
  { type: 'bus', width: 40, length: 104, color: '#F97316', roof: '#EA580C' },
];

interface Vehicle {
  y: number; // centre
  vel: number;
  look: VehicleLook;
  // Sent at the chicken after the server ruled it hit.
  rushing: boolean;
  // Too close to stop when the chicken started its hop into this lane: it
  // drives on through, and the hop waits until it is by.
  passThrough: boolean;
}

interface Lane {
  index: number; // 1-based
  speed: number;
  // Leader (furthest down the road) first.
  cars: Vehicle[];
  spawnInMs: number;
  // A hop into this lane is under way: cars that can still stop wait short of the chicken's path.
  held: boolean;
  // When the barrier of a lane crossed safely came down; null while it has none.
  barrierAt: number | null;
  // The chicken was run over here.
  hit: boolean;
}

type ChickenMode = 'alive' | 'dead' | 'won';

interface Chicken {
  // The spot it stands on: 0 is the start pavement, totalLanes + 1 the finish.
  lane: number;
  x: number;
  lift: number; // height above the road during a hop
  landedAt: number;
  mode: ChickenMode;
  modeAt: number;
}

interface PendingStep {
  lane: number;
  phase: 'clearing' | 'hop' | 'wait' | 'hit' | 'finish' | 'back' | 'settle';
  verdict: StepOutcome | null;
  hopStart: number;
  hopFrom: number;
  hopTo: number;
  // The hop to the finish pad has started.
  finishing: boolean;
  killer: Vehicle | null;
  deadline: number;
  settleAt: number;
  outcome: StepOutcome;
  resolve: (outcome: StepOutcome) => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  vRot: number;
  life: number;
  maxLife: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
}

interface RoadState {
  gameState: GameStatus;
  multipliers: number[];
  totalLanes: number;
  difficulty: Difficulty;
  lanes: Lane[];
  chicken: Chicken;
  step: PendingStep | null;
  particles: Particle[];
  floaters: Floater[];
  cameraX: number;
  shake: number;
}

const laneCenterX = (lane: number) => START_ZONE_WIDTH + (lane - 0.5) * LANE_WIDTH;
const finishStartX = (totalLanes: number) => START_ZONE_WIDTH + totalLanes * LANE_WIDTH;
const worldWidthFor = (totalLanes: number) => finishStartX(totalLanes) + FINISH_ZONE_WIDTH;

// Where the chicken stands on spot `lane` (0 = start pavement, totalLanes + 1 = finish).
function spotX(lane: number, totalLanes: number): number {
  if (lane <= 0) return START_ZONE_WIDTH / 2;
  if (lane > totalLanes) return finishStartX(totalLanes) + FINISH_ZONE_WIDTH * 0.52;
  return laneCenterX(lane);
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const front = (v: Vehicle) => v.y + v.look.length / 2;
const rear = (v: Vehicle) => v.y - v.look.length / 2;
const stoppingDistance = (vel: number) => (vel * vel) / (2 * CAR_BRAKE);
const easeInOut = (p: number) => (1 - Math.cos(Math.PI * p)) / 2;

function easeOutBounce(p: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
  if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
  return n * (p -= 2.625 / d) * p + 0.984375;
}

function newVehicle(y: number, vel: number): Vehicle {
  const look = VEHICLE_LOOKS[Math.floor(Math.random() * VEHICLE_LOOKS.length)];
  return { y, vel, look, rushing: false, passThrough: false };
}

// Fills every lane with traffic already on the move, so the road never starts empty.
function buildLanes(totalLanes: number, difficulty: Difficulty): Lane[] {
  const cfg = TRAFFIC[difficulty] ?? TRAFFIC.MEDIUM;
  const lanes: Lane[] = [];
  for (let index = 1; index <= totalLanes; index++) {
    const progress = totalLanes > 1 ? (index - 1) / (totalLanes - 1) : 0;
    const speed = cfg.speed[0] + (cfg.speed[1] - cfg.speed[0]) * progress + rand(-0.4, 0.4);
    const cars: Vehicle[] = [];
    let y = WORLD_HEIGHT + rand(0, 160);
    while (y > -60) {
      const car = newVehicle(y, speed);
      cars.push(car);
      y -= car.look.length + CAR_GAP + (speed * rand(cfg.gapMs[0], cfg.gapMs[1])) / FRAME_MS;
    }
    lanes.push({ index, speed, cars, spawnInMs: rand(0, cfg.gapMs[1]), held: false, barrierAt: null, hit: false });
  }
  return lanes;
}

function createRoadState(gameState: GameStatus, multipliers: number[], difficulty: Difficulty): RoadState {
  const totalLanes = multipliers.length || 10;
  return {
    gameState,
    multipliers,
    totalLanes,
    difficulty,
    lanes: buildLanes(totalLanes, difficulty),
    chicken: { lane: 0, x: spotX(0, totalLanes), lift: 0, landedAt: 0, mode: 'alive', modeAt: 0 },
    step: null,
    particles: [],
    floaters: [],
    cameraX: 0,
    shake: 0,
  };
}

// Moves one lane's traffic a frame on. Cars keep their distance to the car
// ahead; in a held or barred lane they stop at the stop line, unless they
// were already too close to stop; a rushing car drives at the chicken.
function updateLane(lane: Lane, dt: number, dtMs: number, gapMs: [number, number]) {
  const blocked = lane.held || lane.barrierAt !== null;
  let limitAhead = Infinity;
  for (const car of lane.cars) {
    let limit = limitAhead;
    if (blocked && !car.rushing && !car.passThrough && front(car) <= STOP_LINE + 0.5) {
      limit = Math.min(limit, STOP_LINE);
    }
    const target = car.rushing ? RUSH_SPEED : lane.speed;
    car.vel = car.vel < target
      ? Math.min(target, car.vel + (car.rushing ? RUSH_ACCEL : CAR_ACCEL) * dt)
      : Math.max(target, car.vel - CAR_BRAKE * dt);
    let move = car.vel * dt;
    if (limit !== Infinity) {
      const room = Math.max(0, limit - front(car));
      car.vel = Math.min(car.vel, Math.sqrt(2 * CAR_BRAKE * room));
      move = Math.min(move, room);
    }
    car.y += move;
    limitAhead = rear(car) - CAR_GAP;
  }

  while (lane.cars.length > 0 && rear(lane.cars[0]) > WORLD_HEIGHT + 20) lane.cars.shift();

  lane.spawnInMs -= dtMs;
  if (lane.spawnInMs <= 0) {
    const last = lane.cars[lane.cars.length - 1];
    const car = newVehicle(0, lane.speed);
    car.y = -car.look.length / 2 - 10;
    // A queue backed up to the top of the road holds new cars back.
    if (!last || rear(last) - CAR_GAP > front(car)) {
      lane.cars.push(car);
      lane.spawnInMs = rand(gapMs[0], gapMs[1]);
    } else {
      lane.spawnInMs = 300;
    }
  }
}

// Web Audio synth: zero latency, and silent when the player has muted the app.
class RoadSounds {
  private ctx: AudioContext | null = null;

  private context(): AudioContext | null {
    if (soundManager.isMuted()) return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => null);
    } catch {
      return null;
    }
    return this.ctx;
  }

  private tone(freq: number, endFreq: number, type: OscillatorType, volume: number, delay: number, duration: number) {
    const ctx = this.context();
    if (!ctx) return;
    try {
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    } catch {
      // Audio may be blocked until the first user gesture.
    }
  }

  private noise(volume: number, duration: number) {
    const ctx = this.context();
    if (!ctx) return;
    try {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buffer;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    } catch {
      // Audio may be blocked until the first user gesture.
    }
  }

  hop() {
    this.tone(420, 900, 'square', 0.035, 0, 0.09);
  }

  land() {
    this.tone(200, 90, 'sine', 0.09, 0, 0.08);
  }

  safe() {
    this.tone(150, 100, 'square', 0.05, 0, 0.07); // barrier clack
    [659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, f, 'triangle', 0.07, 0.05 + i * 0.05, 0.16));
  }

  honk() {
    this.tone(392, 392, 'square', 0.05, 0, 0.16);
    this.tone(494, 494, 'square', 0.04, 0, 0.16);
  }

  crash() {
    this.noise(0.25, 0.35);
    this.tone(160, 40, 'sawtooth', 0.22, 0, 0.4);
  }

  win() {
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => this.tone(f, f, 'sine', 0.12, i * 0.08, 0.3));
  }
}

const sounds = new RoadSounds();

function spawnBurst(s: RoadState, x: number, y: number, colors: string[], count: number, force: number, life: number) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = force * (0.4 + Math.random() * 0.8);
    s.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - force * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 5,
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.3,
      life: 0,
      maxLife: life * (0.7 + Math.random() * 0.6),
    });
  }
}

const FEATHERS = ['#FFFFFF', '#FEF9C3', '#FDE047', '#F97316', '#EF4444'];
const SPARKLES = ['#FBBF24', '#FDE68A', '#34D399', '#FFFFFF'];
const CONFETTI = ['#F43F5E', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA', '#FFFFFF'];

function canStepNow(s: RoadState): boolean {
  return s.gameState === 'ACTIVE' && !s.step && s.chicken.mode === 'alive' && s.chicken.lane < s.totalLanes;
}

// How long a hop into this lane has to wait for the cars too close to stop
// to drive by, so none of them ever touches the chicken.
function clearanceDelayMs(lane: Lane): number {
  let clearMs = 0;
  for (const car of lane.cars) {
    if (!car.passThrough || rear(car) >= CHICKEN_BOTTOM + 6) continue;
    const frames = (CHICKEN_BOTTOM + 6 - rear(car)) / Math.max(car.vel, 1);
    clearMs = Math.max(clearMs, frames * FRAME_MS);
  }
  return Math.min(1500, Math.max(0, clearMs - HOP_MS * HOP_ENTRY));
}

// Sends the nearest car coming down the lane at the chicken standing in it
// (a fresh one from the top of the road when none is close).
function sendKiller(lane: Lane): Vehicle {
  lane.held = false;
  lane.barrierAt = null;
  lane.hit = true;
  let killer: Vehicle | null = null;
  for (const car of lane.cars) {
    if (front(car) < CHICKEN_TOP && (!killer || car.y > killer.y)) killer = car;
  }
  if (!killer || front(killer) < CHICKEN_TOP - 320) {
    killer = newVehicle(0, lane.speed);
    killer.y = ROAD_TOP - 20 - killer.look.length / 2;
    const at = lane.cars.findIndex((car) => car.y < killer!.y);
    lane.cars.splice(at === -1 ? lane.cars.length : at, 0, killer);
  }
  killer.rushing = true;
  killer.passThrough = true;
  sounds.honk();
  return killer;
}

// The round starts over: the chicken back on the start pavement, the road open.
function resetRoad(s: RoadState) {
  if (s.step) {
    s.step.resolve('error');
    s.step = null;
  }
  s.chicken = { lane: 0, x: spotX(0, s.totalLanes), lift: 0, landedAt: 0, mode: 'alive', modeAt: 0 };
  for (const lane of s.lanes) {
    lane.held = false;
    lane.barrierAt = null;
    lane.hit = false;
    for (const car of lane.cars) {
      car.rushing = false;
      car.passThrough = false;
    }
  }
  s.floaters = [];
  s.shake = 0;
}

// Puts the chicken on the lane the server has it on (a round picked up again),
// with a barrier across every lane it has crossed.
function placeChicken(s: RoadState, laneIndex: number) {
  const lane = Math.max(0, Math.min(s.totalLanes, laneIndex));
  s.chicken.lane = lane;
  s.chicken.x = spotX(lane, s.totalLanes);
  s.chicken.lift = 0;
  for (const l of s.lanes) {
    l.held = false;
    l.hit = false;
    l.barrierAt = l.index <= lane ? -Infinity : null;
  }
  const standing = s.lanes[lane - 1];
  if (standing) {
    standing.cars = standing.cars.filter((car) => front(car) <= STOP_LINE || rear(car) > CHICKEN_BOTTOM + 10);
  }
}

// Advances the hop in progress, if any, one frame and plays out its verdict.
function updateStep(s: RoadState, now: number) {
  const step = s.step;
  if (!step) return;
  const chicken = s.chicken;
  const lane = s.lanes[step.lane - 1];

  const hopProgress = () => Math.min(1, Math.max(0, (now - step.hopStart) / HOP_MS));
  const moveAlongHop = () => {
    const p = hopProgress();
    chicken.x = step.hopFrom + (step.hopTo - step.hopFrom) * easeInOut(p);
    chicken.lift = Math.sin(Math.PI * p) * HOP_HEIGHT;
    return p >= 1;
  };
  const finish = (outcome: StepOutcome, afterMs: number) => {
    step.outcome = outcome;
    step.settleAt = now + afterMs;
    step.phase = 'settle';
  };

  switch (step.phase) {
    case 'clearing':
      if (step.verdict === 'error') {
        lane.held = false;
        s.step = null;
        step.resolve('error');
        return;
      }
      if (now >= step.hopStart) {
        step.phase = 'hop';
        step.hopStart = now;
        sounds.hop();
      }
      return;

    case 'hop':
      if (!moveAlongHop()) return;
      chicken.lane = step.lane;
      chicken.lift = 0;
      chicken.landedAt = now;
      sounds.land();
      step.phase = 'wait';
      return;

    case 'wait': {
      if (step.verdict === null) return;
      if (step.verdict === 'hit') {
        step.killer = sendKiller(lane);
        step.deadline = now + 1500;
        step.phase = 'hit';
        return;
      }
      if (step.verdict === 'error') {
        // The lane stays held until the chicken is out of it.
        step.phase = 'back';
        step.hopFrom = chicken.x;
        step.hopTo = spotX(step.lane - 1, s.totalLanes);
        step.hopStart = now;
        sounds.hop();
        return;
      }
      // Safe: the barrier comes down and the traffic stops behind it.
      lane.barrierAt = now;
      const mult = s.multipliers[step.lane - 1];
      if (mult) s.floaters.push({ x: chicken.x, y: BARRIER_Y - 26, text: `${mult.toFixed(2)}x`, color: '#FDE68A', born: now });
      spawnBurst(s, chicken.x, CROSSING_Y, SPARKLES, 14, 3, 32);
      sounds.safe();
      if (step.verdict === 'won') {
        step.phase = 'finish';
        step.hopFrom = chicken.x;
        step.hopTo = spotX(s.totalLanes + 1, s.totalLanes);
        step.hopStart = now + BARRIER_DROP_MS + 120;
        return;
      }
      finish('safe', 60);
      return;
    }

    case 'hit': {
      const killer = step.killer;
      const impact = !killer || front(killer) >= CHICKEN_TOP + 8 || !lane.cars.includes(killer);
      if (!impact && now < step.deadline) return;
      chicken.mode = 'dead';
      chicken.modeAt = now;
      chicken.lift = 0;
      s.shake = 16;
      spawnBurst(s, chicken.x, CROSSING_Y, FEATHERS, 34, 6, 60);
      sounds.crash();
      finish('hit', 750);
      return;
    }

    case 'finish':
      if (now < step.hopStart) return;
      if (!step.finishing) {
        step.finishing = true;
        sounds.hop();
      }
      if (!moveAlongHop()) return;
      chicken.lane = s.totalLanes + 1;
      chicken.lift = 0;
      chicken.mode = 'won';
      chicken.modeAt = now;
      spawnBurst(s, chicken.x, CROSSING_Y - 20, CONFETTI, 60, 6, 80);
      sounds.win();
      finish('won', 600);
      return;

    case 'back':
      if (!moveAlongHop()) return;
      lane.held = false;
      chicken.lane = step.lane - 1;
      chicken.lift = 0;
      chicken.landedAt = now;
      finish('error', 0);
      return;

    case 'settle':
      if (now < step.settleAt) return;
      s.step = null;
      step.resolve(step.outcome);
      return;
  }
}

// ─── Drawing ───────────────────────────────────────────────────────────────

function drawBackdrop(ctx: CanvasRenderingContext2D, s: RoadState, viewLeft: number, viewWidth: number) {
  const worldWidth = worldWidthFor(s.totalLanes);
  const left = Math.min(0, viewLeft) - 20;
  const right = Math.max(worldWidth, viewLeft + viewWidth) + 20;

  ctx.fillStyle = '#1E641D';
  ctx.fillRect(left, 0, right - left, WORLD_HEIGHT);

  // Lawn stripes and trees along both verges.
  ctx.fillStyle = '#287A25';
  const firstStripe = Math.floor(left / 100) * 100;
  for (let x = firstStripe; x < right; x += 100) {
    ctx.fillRect(x, 0, 50, ROAD_TOP);
    ctx.fillRect(x, ROAD_BOTTOM, 50, WORLD_HEIGHT - ROAD_BOTTOM);
  }
  for (let x = 60; x < worldWidth; x += 150) {
    for (const y of [22, WORLD_HEIGHT - 22]) {
      ctx.fillStyle = '#166534';
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#22C55E';
      ctx.beginPath();
      ctx.arc(x, y - 3, 13, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Start pavement.
  const roadHeight = ROAD_BOTTOM - ROAD_TOP;
  ctx.fillStyle = '#595959';
  ctx.fillRect(0, ROAD_TOP, START_ZONE_WIDTH, roadHeight);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = ROAD_TOP + 35; y < ROAD_BOTTOM; y += 35) {
    ctx.moveTo(0, y);
    ctx.lineTo(START_ZONE_WIDTH, y);
  }
  ctx.moveTo(START_ZONE_WIDTH / 2, ROAD_TOP);
  ctx.lineTo(START_ZONE_WIDTH / 2, ROAD_BOTTOM);
  ctx.stroke();
  ctx.font = '900 13px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('START', START_ZONE_WIDTH / 2, CROSSING_Y - 52);

  // Asphalt.
  const roadLeft = START_ZONE_WIDTH;
  const roadWidth = s.totalLanes * LANE_WIDTH;
  ctx.fillStyle = '#5E5E5E';
  ctx.fillRect(roadLeft, ROAD_TOP, roadWidth, roadHeight);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
  for (let lane = 1; lane <= s.totalLanes; lane += 2) {
    ctx.fillRect(roadLeft + (lane - 1) * LANE_WIDTH, ROAD_TOP, LANE_WIDTH, roadHeight);
  }

  // Kerbs.
  ctx.fillStyle = '#D0D0D0';
  ctx.fillRect(roadLeft, ROAD_TOP - 8, roadWidth, 8);
  ctx.fillRect(roadLeft, ROAD_BOTTOM, roadWidth, 8);
  ctx.fillStyle = '#8A8A8A';
  ctx.fillRect(roadLeft, ROAD_TOP - 2, roadWidth, 2);
  ctx.fillRect(roadLeft, ROAD_BOTTOM, roadWidth, 2);

  // Hazard line between the pavement and the road.
  ctx.strokeStyle = '#FBBF24';
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(roadLeft, ROAD_TOP);
  ctx.lineTo(roadLeft, ROAD_BOTTOM);
  ctx.stroke();

  // Dashed lane dividers.
  ctx.strokeStyle = 'rgba(240, 240, 240, 0.85)';
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 18]);
  ctx.beginPath();
  for (let lane = 1; lane < s.totalLanes; lane++) {
    const x = roadLeft + lane * LANE_WIDTH;
    ctx.moveTo(x, ROAD_TOP + 8);
    ctx.lineTo(x, ROAD_BOTTOM - 8);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Traffic direction arrows.
  ctx.font = '14px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  for (let lane = 1; lane <= s.totalLanes; lane++) {
    ctx.fillText('▼', laneCenterX(lane), ROAD_TOP + 22);
    ctx.fillText('▼', laneCenterX(lane), ROAD_BOTTOM - 20);
  }

  // Finish: chequered line, then a golden pad for the chicken to land on.
  const finishX = finishStartX(s.totalLanes);
  ctx.fillStyle = '#1B4D21';
  ctx.fillRect(finishX, ROAD_TOP, FINISH_ZONE_WIDTH, roadHeight);
  const square = 15;
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row * square < roadHeight; row++) {
      ctx.fillStyle = (col + row) % 2 === 0 ? '#FFFFFF' : '#1E293B';
      ctx.fillRect(finishX + col * square, ROAD_TOP + row * square, square, Math.min(square, roadHeight - row * square));
    }
  }
  const padX = spotX(s.totalLanes + 1, s.totalLanes);
  const pad = ctx.createRadialGradient(padX, CROSSING_Y, 4, padX, CROSSING_Y, 38);
  pad.addColorStop(0, '#FDE68A');
  pad.addColorStop(0.7, '#F59E0B');
  pad.addColorStop(1, '#B45309');
  ctx.fillStyle = pad;
  ctx.beginPath();
  ctx.arc(padX, CROSSING_Y, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#FEF3C7';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = '900 14px Inter, sans-serif';
  ctx.fillStyle = '#FCD34D';
  ctx.fillText('FINISH', padX, CROSSING_Y - 58);
  const top = s.multipliers[s.totalLanes - 1];
  if (top && s.chicken.lane <= s.totalLanes) {
    ctx.font = '900 13px Inter, sans-serif';
    ctx.fillStyle = '#78350F';
    ctx.fillText(`${top.toFixed(2)}x`, padX, CROSSING_Y + 1);
  }
}

// The manhole cover in the middle of each lane, with the multiplier it pays.
function drawManholes(ctx: CanvasRenderingContext2D, s: RoadState, now: number) {
  const active = s.gameState === 'ACTIVE' && s.chicken.mode === 'alive';
  const nextLane = active ? (s.step ? s.step.lane : s.chicken.lane + 1) : -1;
  const pulse = 0.5 + 0.5 * Math.sin(now / 220);

  for (const lane of s.lanes) {
    const x = laneCenterX(lane.index);
    const y = CROSSING_Y;
    const crossed = lane.barrierAt !== null;
    const isNext = lane.index === nextLane;
    const mult = s.multipliers[lane.index - 1] ?? 1 + lane.index * 0.05;

    if (crossed || isNext) {
      ctx.fillStyle = crossed ? 'rgba(250, 204, 21, 0.22)' : `rgba(255, 255, 255, ${0.1 + pulse * 0.15})`;
      ctx.beginPath();
      ctx.arc(x, y, 33 + (isNext ? pulse * 3 : 0), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(x, y + 3, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, 27, 0, Math.PI * 2);
    ctx.fillStyle = lane.hit ? '#450A0A' : crossed ? '#14532D' : '#353535';
    ctx.fill();
    ctx.lineWidth = isNext ? 3 : 2.5;
    ctx.strokeStyle = lane.hit ? '#EF4444' : crossed ? '#FACC15' : isNext ? `rgba(255, 255, 255, ${0.6 + pulse * 0.4})` : '#5A5A5A';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, 21, 0, Math.PI * 2);
    ctx.fillStyle = lane.hit ? '#2A0505' : crossed ? '#0F3D21' : '#262626';
    ctx.fill();

    ctx.fillStyle = crossed ? '#FACC15' : '#7A7A7A';
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 24, y + Math.sin(a) * 24, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = '900 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = lane.hit ? '#FCA5A5' : crossed ? '#FDE68A' : '#EDEDED';
    ctx.fillText(`${mult.toFixed(2)}x`, x, y + 1);
  }
}

// Striped road block across a lane crossed safely; it drops in with a bounce.
function drawBarriers(ctx: CanvasRenderingContext2D, s: RoadState, now: number) {
  for (const lane of s.lanes) {
    if (lane.barrierAt === null) continue;
    const p = Math.min(1, Math.max(0, (now - lane.barrierAt) / BARRIER_DROP_MS));
    const x = laneCenterX(lane.index);
    const y = BARRIER_Y - (1 - easeOutBounce(p)) * 70;
    const w = 72;
    const h = 13;

    ctx.save();
    ctx.globalAlpha = Math.min(1, p * 3);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(x - w / 2 + 3, y - h / 2 + 4, w, h);
    ctx.fillStyle = '#374151';
    ctx.fillRect(x - w / 2 + 3, y + h / 2 - 1, 5, 9);
    ctx.fillRect(x + w / 2 - 8, y + h / 2 - 1, 5, 9);

    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 3);
    ctx.fillStyle = '#FACC15';
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = '#111827';
    for (let sx = x - w / 2 - h; sx < x + w / 2; sx += 16) {
      ctx.beginPath();
      ctx.moveTo(sx, y + h / 2);
      ctx.lineTo(sx + 8, y + h / 2);
      ctx.lineTo(sx + 8 + h, y - h / 2);
      ctx.lineTo(sx + h, y - h / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Warning lamps.
    const blink = Math.floor(now / 400) % 2 === 0;
    ctx.fillStyle = blink ? '#F87171' : '#7F1D1D';
    ctx.beginPath();
    ctx.arc(x - w / 2 + 6, y - h / 2 - 3, 3, 0, Math.PI * 2);
    ctx.arc(x + w / 2 - 6, y - h / 2 - 3, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawVehicle(ctx: CanvasRenderingContext2D, v: Vehicle, x: number) {
  const { width: w, length: l, color, roof, type } = v.look;
  ctx.save();
  ctx.translate(x, v.y);

  // Headlight beams on the asphalt ahead, fading out.
  const beam = ctx.createLinearGradient(0, l / 2, 0, l / 2 + 50);
  beam.addColorStop(0, 'rgba(254, 240, 138, 0.2)');
  beam.addColorStop(1, 'rgba(254, 240, 138, 0)');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(-w * 0.4, l / 2);
  ctx.lineTo(-w * 0.9, l / 2 + 50);
  ctx.lineTo(w * 0.9, l / 2 + 50);
  ctx.lineTo(w * 0.4, l / 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 3, -l / 2 + 4, w, l, 8);
  ctx.fill();

  ctx.fillStyle = '#111827';
  ctx.fillRect(-w / 2 - 2, -l / 2 + 10, 6, 14);
  ctx.fillRect(-w / 2 - 2, l / 2 - 24, 6, 14);
  ctx.fillRect(w / 2 - 4, -l / 2 + 10, 6, 14);
  ctx.fillRect(w / 2 - 4, l / 2 - 24, 6, 14);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -l / 2, w, l, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Windscreen at the front (bottom), rear window behind the roof.
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.beginPath();
  ctx.roundRect(-w * 0.35, l * 0.1, w * 0.7, l * 0.22, 4);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-w * 0.32, -l * 0.34, w * 0.64, l * 0.12, 3);
  ctx.fill();
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.roundRect(-w * 0.3, -l * 0.2, w * 0.6, l * 0.28, 3);
  ctx.fill();

  if (type === 'taxi') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-9, -l * 0.08 - 4, 18, 8);
    ctx.fillStyle = '#000000';
    ctx.font = '700 6px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TAXI', 0, -l * 0.08);
  }

  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(-w / 2 + 4, l / 2 - 3, 7, 3);
  ctx.fillRect(w / 2 - 11, l / 2 - 3, 7, 3);
  ctx.fillStyle = '#EF4444';
  ctx.fillRect(-w / 2 + 4, -l / 2, 7, 3);
  ctx.fillRect(w / 2 - 11, -l / 2, 7, 3);

  ctx.restore();
}

function drawTraffic(ctx: CanvasRenderingContext2D, s: RoadState) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(START_ZONE_WIDTH, ROAD_TOP, s.totalLanes * LANE_WIDTH, ROAD_BOTTOM - ROAD_TOP);
  ctx.clip();
  for (const lane of s.lanes) {
    const x = laneCenterX(lane.index);
    for (const car of lane.cars) {
      if (front(car) < ROAD_TOP - 10 || rear(car) > ROAD_BOTTOM + 10) continue;
      drawVehicle(ctx, car, x);
    }
  }
  ctx.restore();
}

function drawChicken(ctx: CanvasRenderingContext2D, s: RoadState, now: number) {
  const ch = s.chicken;
  const x = ch.x;

  if (ch.mode === 'dead') {
    // Flattened on the road where the car ran it over.
    ctx.save();
    ctx.translate(x, CROSSING_Y + 6);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 30, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FEF9C3';
    ctx.beginPath();
    ctx.ellipse(0, 0, 27, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#CA8A04';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.ellipse(-4, -8, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F97316';
    ctx.beginPath();
    ctx.moveTo(24, -2);
    ctx.lineTo(33, 1);
    ctx.lineTo(24, 4);
    ctx.fill();
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, -4);
    ctx.lineTo(16, 2);
    ctx.moveTo(16, -4);
    ctx.lineTo(10, 2);
    ctx.stroke();
    ctx.restore();
    if (now - ch.modeAt < 600) {
      ctx.font = '38px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💥', x, CROSSING_Y - 8);
    }
    return;
  }

  // Hopping in place on the finish pad, or breathing while it waits.
  const celebrating = ch.mode === 'won';
  const lift = celebrating ? Math.abs(Math.sin((now - ch.modeAt) / 170)) * 16 : ch.lift;
  const sinceLanding = now - ch.landedAt;
  const squash = !celebrating && ch.lift === 0 && sinceLanding < 160 ? 1 - sinceLanding / 160 : 0;
  const breathe = ch.lift === 0 && !celebrating ? Math.sin(now / 320) * 0.025 : 0;
  const airborne = lift > 2;

  // Shadow on the road, smaller while it is in the air.
  const k = 1 - Math.min(1, lift / HOP_HEIGHT) * 0.4;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(x, CROSSING_Y + 18, 18 * k, 8 * k, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, CROSSING_Y - lift);
  ctx.scale(1 + squash * 0.14, 1 - squash * 0.16 + breathe);

  // Feet, tucked up in the air.
  ctx.fillStyle = '#EA580C';
  ctx.beginPath();
  if (airborne) {
    ctx.ellipse(-6, 14, 5, 3, -0.4, 0, Math.PI * 2);
    ctx.ellipse(6, 14, 5, 3, 0.4, 0, Math.PI * 2);
  } else {
    ctx.ellipse(-8, 17, 5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(8, 17, 5, 3, 0, 0, Math.PI * 2);
  }
  ctx.fill();

  ctx.fillStyle = '#FEF08A';
  ctx.beginPath();
  ctx.ellipse(-14, 2, 8, 12, 0.4, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createRadialGradient(2, -3, 4, 0, 0, 20);
  body.addColorStop(0, '#FFFFFF');
  body.addColorStop(0.7, '#FEF9C3');
  body.addColorStop(1, '#FDE047');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#CA8A04';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Wings, spread in the air.
  ctx.fillStyle = '#FEF08A';
  ctx.beginPath();
  if (airborne || celebrating) {
    ctx.ellipse(-4, -2, 11, 6, -0.7, 0, Math.PI * 2);
  } else {
    ctx.ellipse(-2, 3, 10, 6, -0.1, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#EF4444';
  ctx.beginPath();
  ctx.arc(2, -18, 5.5, 0, Math.PI * 2);
  ctx.arc(-3, -16, 4.5, 0, Math.PI * 2);
  ctx.arc(7, -16, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.arc(8, -4, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(9, -5, 1.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(244, 63, 94, 0.4)';
  ctx.beginPath();
  ctx.arc(6, 2, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#F97316';
  ctx.beginPath();
  ctx.moveTo(14, -2);
  ctx.lineTo(22, 2);
  ctx.lineTo(14, 6);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#DC2626';
  ctx.beginPath();
  ctx.arc(14, 8, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawEffects(ctx: CanvasRenderingContext2D, s: RoadState, now: number) {
  for (const p of s.particles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  }

  // The multiplier just won, rising off the barrier on a dark pill.
  ctx.font = '900 15px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of s.floaters) {
    const age = (now - f.born) / 900;
    const y = f.y - age * 34;
    const w = ctx.measureText(f.text).width + 16;
    ctx.globalAlpha = Math.max(0, 1 - age * age);
    ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
    ctx.beginPath();
    ctx.roundRect(f.x - w / 2, y - 11, w, 22, 11);
    ctx.fill();
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, y + 1);
  }
  ctx.globalAlpha = 1;
}

const RoadCrossingGameComponent = ({ gameState, multipliers, currentLane, difficulty, ref }: RoadCrossingGameProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ width: 0, height: 0 });
  // The road's mutable world, shared by the render loop and the handlers below.
  const [s] = useState(() => createRoadState(gameState, multipliers, difficulty));

  const totalLanes = multipliers.length || 10;

  useImperativeHandle(ref, () => ({
    canStep: () => canStepNow(s),
    step: (lane, verdict) => {
      if (!canStepNow(s) || lane !== s.chicken.lane + 1) return Promise.resolve<StepOutcome>('error');
      return new Promise<StepOutcome>((resolve) => {
        const target = s.lanes[lane - 1];
        // Cars that can still stop wait short of the chicken's path; those
        // that can't drive on, and the hop waits for them to pass.
        for (const car of target.cars) {
          car.passThrough = front(car) > STOP_LINE - stoppingDistance(car.vel) - 2;
        }
        target.held = true;
        const now = performance.now();
        const pending: PendingStep = {
          lane,
          phase: 'clearing',
          verdict: null,
          hopStart: now + clearanceDelayMs(target),
          hopFrom: s.chicken.x,
          hopTo: spotX(lane, s.totalLanes),
          finishing: false,
          killer: null,
          deadline: 0,
          settleAt: 0,
          outcome: 'error',
          resolve,
        };
        s.step = pending;
        verdict.then(
          (v) => {
            if (s.step === pending) pending.verdict = v;
          },
          () => {
            if (s.step === pending) pending.verdict = 'error';
          },
        );
      });
    },
  }), [s]);

  // A new payout table or difficulty means a new road.
  useEffect(() => {
    s.multipliers = multipliers;
    if (s.totalLanes !== totalLanes || s.difficulty !== difficulty) {
      if (s.step) {
        s.step.resolve('error');
        s.step = null;
      }
      s.totalLanes = totalLanes;
      s.difficulty = difficulty;
      s.lanes = buildLanes(totalLanes, difficulty);
      s.chicken.x = spotX(Math.min(s.chicken.lane, totalLanes + 1), totalLanes);
    }
  }, [s, multipliers, totalLanes, difficulty]);

  useEffect(() => {
    s.gameState = gameState;
    const now = performance.now();
    if (gameState === 'READY') {
      resetRoad(s);
    } else if (gameState === 'WON' && s.chicken.mode === 'alive') {
      // Cashed out: a little victory dance where it stands.
      s.chicken.mode = 'won';
      s.chicken.modeAt = now;
      spawnBurst(s, s.chicken.x, CROSSING_Y - 20, CONFETTI, 50, 6, 80);
      sounds.win();
    } else if (gameState === 'LOST' && s.chicken.mode === 'alive' && !s.step && s.chicken.lane >= 1) {
      // Lost without a hop in play (settled elsewhere): the car still comes.
      const lane = s.lanes[s.chicken.lane - 1];
      const killer = sendKiller(lane);
      s.step = {
        lane: lane.index,
        phase: 'hit',
        verdict: 'hit',
        hopStart: now,
        hopFrom: s.chicken.x,
        hopTo: s.chicken.x,
        finishing: false,
        killer,
        deadline: now + 1500,
        settleAt: 0,
        outcome: 'hit',
        resolve: () => {},
      };
    }
  }, [s, gameState]);

  // Between hops the chicken stands where the server has it (a round picked up again).
  useEffect(() => {
    if (gameState !== 'ACTIVE' || s.step || s.chicken.mode !== 'alive') return;
    if (s.chicken.lane !== currentLane) placeChicken(s, currentLane);
  }, [s, gameState, currentLane]);

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Size the canvas buffer to the container, which Android WebViews can
    // resize (safe-area insets settling, system bars) without a window resize.
    const measure = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      viewRef.current = { width: rect.width, height: rect.height };
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(container);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    const settleTimer = window.setTimeout(measure, 300);

    let animId = 0;
    let lastTime = performance.now();

    const frame = (time: number) => {
      animId = requestAnimationFrame(frame);
      const view = viewRef.current;
      if (view.width <= 0 || view.height <= 0) return;

      const dtMs = Math.min(40, Math.max(0, time - lastTime));
      lastTime = time;
      const dt = dtMs / FRAME_MS;
      const now = performance.now();

      // 1. Simulation.
      updateStep(s, now);
      const gapMs = (TRAFFIC[s.difficulty] ?? TRAFFIC.MEDIUM).gapMs;
      for (const lane of s.lanes) updateLane(lane, dt, dtMs, gapMs);

      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.15 * dt;
        p.vx *= 0.98;
        p.rotation += p.vRot * dt;
        p.life += dt;
        if (p.life >= p.maxLife) s.particles.splice(i, 1);
      }
      s.floaters = s.floaters.filter((f) => now - f.born < 900);
      if (s.chicken.mode === 'won' && now - s.chicken.modeAt < 2400 && Math.random() < 0.08) {
        spawnBurst(s, s.chicken.x + rand(-60, 60), ROAD_TOP + 20, CONFETTI, 6, 3, 70);
      }
      if (s.shake > 0) {
        s.shake *= Math.pow(0.88, dt);
        if (s.shake < 0.2) s.shake = 0;
      }

      // 2. Camera: keeps the chicken about a third of the way across the screen.
      const scale = view.height / WORLD_HEIGHT;
      const viewWidth = view.width / scale;
      const maxCam = Math.max(0, worldWidthFor(s.totalLanes) - viewWidth);
      const targetCam = s.gameState === 'READY' ? 0 : Math.max(0, Math.min(maxCam, s.chicken.x - viewWidth * 0.34));
      s.cameraX += (targetCam - s.cameraX) * Math.min(1, 0.12 * dt);

      // 3. Drawing.
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#1E641D';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const shakeX = s.shake ? (Math.random() - 0.5) * s.shake : 0;
      const shakeY = s.shake ? (Math.random() - 0.5) * s.shake : 0;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, (-s.cameraX + shakeX) * dpr * scale, shakeY * dpr * scale);

      drawBackdrop(ctx, s, s.cameraX, viewWidth);
      drawManholes(ctx, s, now);
      if (s.chicken.mode === 'dead') drawChicken(ctx, s, now);
      drawTraffic(ctx, s);
      drawBarriers(ctx, s, now);
      if (s.chicken.mode !== 'dead') drawChicken(ctx, s, now);
      drawEffects(ctx, s, now);
    };
    animId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animId);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.clearTimeout(settleTimer);
    };
  }, [s]);

  // A step still playing out when the road goes away never gets to finish.
  useEffect(() => () => {
    if (s.step) {
      s.step.resolve('error');
      s.step = null;
    }
  }, [s]);

  return (
    <div ref={containerRef} className="chicken-road-canvas-container">
      <canvas ref={canvasRef} className="chicken-road-canvas" />
    </div>
  );
};

export const RoadCrossingGame = React.memo(RoadCrossingGameComponent);
export default RoadCrossingGame;
