export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const CYCLE_SECONDS = 15;
export const CYCLE_TICKS = CYCLE_SECONDS * TICK_RATE;
/** Record one echo frame every N simulation ticks (60 Hz / 2 = 30 Hz). */
export const RECORD_EVERY = 2;

export const PLAYER = {
  radius: 0.35,
  height: 1.8,
  eye: 1.6,
  walkSpeed: 4.2,
  sprintSpeed: 7.0,
  jumpVelocity: 6.4,
  gravity: 18,
  stepHeight: 0.35,
  groundAccel: 40,
  airAccel: 8,
  strideLength: 2.1,
};

export const ECHO_RADIUS = 0.3;
export const ECHO_SPAWN_TICKS = 24;
export const ECHO_COLLAPSE_TICKS = 30;
export const PARADOX_TICKS = 3;

export const INTERACT_RANGE = 2.2;
export const INTERACT_ANGLE = 0.6;
export const ECHO_INTERACT_SLACK = 0.4;

export const KILL_Y = -3;
export const DEATH_DELAY_TICKS = 36;

export const DOOR_BLOCK_THRESHOLD = 0.85;
export const CORRIDOR_LENGTH = 4;
export const DOOR_WIDTH = 2.4;
export const WALL_THICKNESS = 0.4;

export const COLORS = {
  blue: 0x2a6cff,
  green: 0x27ff8a,
  red: 0xff2a3a,
  white: 0xeef6ff,
  purple: 0xa55bff,
  cyan: 0x5fe3ff,
};
