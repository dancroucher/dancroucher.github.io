// 2D canvas coords ↔ 3D world coords
// 2D canvas: 4000×2400, origin top-left
// 3D world: centered, y=up, tapes sit on y=0 plane

const CANVAS_W = 4000;
const CANVAS_H = 2400;
const SCALE = 50; // 50 2D pixels = 1 3D unit

const MAP_SCALE = SCALE; // 1:1 mapping

export function to3D(x2d: number, y2d: number): [x: number, z: number] {
  return [
    (x2d - CANVAS_W / 2) / MAP_SCALE,
    (y2d - CANVAS_H / 2) / MAP_SCALE,
  ];
}

export function to2D(x3d: number, z3d: number): [x: number, y: number] {
  return [
    x3d * MAP_SCALE + CANVAS_W / 2,
    z3d * MAP_SCALE + CANVAS_H / 2,
  ];
}

// Tape dimensions in 3D units (~1.5x original 2D size)
export const TAPE_W = (234 / SCALE) * 1.5;   // ~7.02
export const TAPE_H = (143 / SCALE) * 1.5;   // ~4.29
export const TAPE_D = 0.48 * 1.5;            // ~0.72

// Tile matches wood texture aspect (884×579 → 1.527:1)
// Pick tile height so ~9 tapes fit in 3×3 active area
export const TILE_H = 10;
export const TILE_W = TILE_H * (884 / 579); // ~15.27
export const TILE_SIZE = TILE_W; // for legacy imports

// 3×3 active tiles + 1 tile border = 5×5
export const ACTIVE_TILES = 3;
export const ACTIVE_W = TILE_W * ACTIVE_TILES; // ~45.8
export const ACTIVE_H = TILE_H * ACTIVE_TILES; // 30

export const TABLE_W = TILE_W * 5; // ~76.4
export const TABLE_H = TILE_H * 5; // 50

export const VISUAL_W = TABLE_W;
export const VISUAL_H = TABLE_H;

// Camera pan limit
export const CAM_BOUND_X = ACTIVE_W / 2;
export const CAM_BOUND_Z = ACTIVE_H / 2;
// Drag bounds — active area + half a tile of overflow
export const DRAG_BOUND_X = ACTIVE_W / 2 + TILE_W / 2 - TAPE_W / 2;
export const DRAG_BOUND_Z = ACTIVE_H / 2 + TILE_H / 2 - TAPE_H / 2;

// Drag constants
export const DRAG_HEIGHT = 5;

// Shared mutable drag state — written by pointer handlers, read by TapeBody in useFrame
export interface DragState {
  tapeId: string | null;
  targetX: number;
  targetZ: number;
  // Optional snap-to yaw — set by hover detection (e.g. recorder footprint) so
  // the dragged tape rotates to match the target's orientation.
  targetYaw?: number | null;
  // Optional snap-to pitch around the tape's body X axis — tips the tape's
  // leading edge down to match the open recorder lid angle.
  targetPitch?: number | null;
  // Optional override for the drag hover height. When null/undefined the tape
  // rides at DRAG_HEIGHT; set to a higher value (e.g. over the open recorder
  // lid) to lift the tape so its tipped leading edge clears obstacles.
  targetY?: number | null;
}

// Post-drop snap target — when a tape is dropped into the recorder, TapeBody
// tweens its body to this pose then pins it there ("loaded").
export interface SnapState {
  tapeId: string | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
}
