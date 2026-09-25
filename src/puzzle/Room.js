import { makeBox } from '../physics/Collision.js';
import { Puzzle } from './Puzzle.js';
import { Trigger } from '../objects/Trigger.js';
import { PressurePlate } from '../objects/PressurePlate.js';
import { Switch } from '../objects/Switch.js';
import { TimedButton } from '../objects/TimedButton.js';
import { Door } from '../objects/Door.js';
import { MovingPlatform } from '../objects/MovingPlatform.js';
import { Laser } from '../objects/Laser.js';
import { EnergyNode } from '../objects/EnergyNode.js';
import { EchoFurnace } from '../objects/EchoFurnace.js';
import { Hunter } from '../hunter/Hunter.js';
import { wallX, wallZ } from '../rooms/helpers.js';
import { DOOR_WIDTH } from '../core/config.js';

const FACTORIES = {
  plate: PressurePlate,
  switch: Switch,
  button: TimedButton,
  door: Door,
  platform: MovingPlatform,
  laser: Laser,
  node: EnergyNode,
  furnace: EchoFurnace,
};

/**
 * A room built from a declarative config (see src/rooms/*.js). Owns geometry colliders,
 * puzzle objects, logic wiring, triggers and its own clock. Pure simulation.
 */
export class Room {
  constructor(cfg, index, origin) {
    this.cfg = cfg;
    this.index = index;
    this.origin = origin;
    this.kind = cfg.kind ?? 'puzzle';
    this.w = cfg.w;
    this.d = cfg.d;
    this.h = cfg.h ?? 5;
    this.maxEchoes = cfg.maxEchoes ?? 2;
    this.clock = 0;
    this.complete = false;
    this.center = { x: origin.x, z: origin.z };
    this.bounds = {
      minX: origin.x - this.w / 2,
      maxX: origin.x + this.w / 2,
      minZ: origin.z - this.d / 2,
      maxZ: origin.z + this.d / 2,
    };

    this.abilities = cfg.abilities ?? [];
    this.geometry = { floors: [], walls: [], blocks: [], pits: [], glass: [] };
    this.buildGeometry();
    this.staticBoxes = [...this.geometry.floors, ...this.geometry.walls, ...this.geometry.blocks, ...this.geometry.glass];

    this.objects = [];
    this.byId = {};
    this.platforms = [];
    this.doors = [];
    this.lasers = [];
    this.nodes = [];
    this.interactables = [];
    this.puzzle = new Puzzle(this);
    this.buildObjects();
    this.hunter = cfg.hunter ? new Hunter(cfg.hunter, this) : null;

    const ex = origin.x + (cfg.entranceX ?? 0);
    const southZ = this.bounds.maxZ;
    this.spawn = { x: ex, y: 0, z: southZ - 1.5, yaw: 0 };
    this.entryTrigger = new Trigger('entry', { x: ex - 1.5, y: -1, z: southZ - 3 }, { x: ex + 1.5, y: 4, z: southZ - 0.4 }, { room: this });
    if (this.kind === 'escape') {
      this.escapeTrigger = new Trigger(
        'escape',
        { x: origin.x - 2, y: -1, z: origin.z - 2.5 },
        { x: origin.x + 2, y: 4, z: origin.z + 1 },
        { room: this },
      );
    }
    this.dynScratch = [];
    this.reset();
  }

  toWorld(x, y = 0, z = 0) {
    return { x: this.origin.x + x, y, z: this.origin.z + z };
  }

  boxToWorld(b) {
    const h = this.h;
    const y1 = b[4] === null || b[4] === undefined ? h : b[4];
    return makeBox(this.origin.x + b[0], b[1], this.origin.z + b[2], this.origin.x + b[3], y1, this.origin.z + b[5]);
  }

  buildGeometry() {
    const { cfg, w, d } = this;
    const hw = w / 2;
    const hd = d / 2;
    const floors = cfg.floors ?? [[-hw, -hd, hw, hd]];
    for (const [x0, z0, x1, z1] of floors) this.geometry.floors.push(this.boxToWorld([x0, -0.5, z0, x1, 0, z1]));
    for (const p of cfg.pits ?? []) this.geometry.pits.push(this.boxToWorld([p[0], -6, p[1], p[2], -5.8, p[3]]));

    const entranceGap = [[cfg.entranceX ?? 0, DOOR_WIDTH]];
    const exitGap = this.kind === 'escape' ? [] : [[cfg.exitX ?? 0, DOOR_WIDTH]];
    const outer = [
      ...wallX(hd, -hw - 0.2, hw + 0.2, entranceGap),
      ...wallX(-hd, -hw - 0.2, hw + 0.2, exitGap),
      ...wallZ(-hw, -hd, hd),
      ...wallZ(hw, -hd, hd),
    ];
    for (const b of [...outer, ...(cfg.walls ?? [])]) {
      const box = this.boxToWorld(b);
      box.lintel = b[6] === 'lintel';
      this.geometry.walls.push(box);
    }
    for (const b of cfg.blocks ?? []) this.geometry.blocks.push(this.boxToWorld(b));
    for (const b of cfg.glass ?? []) {
      const box = this.boxToWorld(b);
      box.glass = true;
      this.geometry.glass.push(box);
    }
  }

  buildObjects() {
    const { cfg } = this;
    const list = [...(cfg.objects ?? [])];
    if (this.index === 0) list.push({ type: 'door', id: 'entrance', pos: [cfg.entranceX ?? 0, 0, this.d / 2], sealed: true, role: 'entrance' });
    if (this.kind !== 'escape') {
      list.push({
        type: 'door',
        id: 'exit',
        pos: [cfg.exitX ?? 0, 0, -this.d / 2],
        opensWhen: 'room.complete',
        role: 'exit',
        openTime: 0.9,
        closeTime: 0.7,
        openDelay: cfg.exitDelay ?? 0,
      });
    }
    for (const oc of list) {
      const Factory = FACTORIES[oc.type];
      if (!Factory) throw new Error(`Room ${cfg.id}: unknown object type '${oc.type}'`);
      if (this.byId[oc.id]) throw new Error(`Room ${cfg.id}: duplicate id '${oc.id}'`);
      const obj = new Factory(oc, this);
      this.objects.push(obj);
      this.byId[oc.id] = obj;
      if (obj.isPlatform) {
        obj.index = this.platforms.length;
        this.platforms.push(obj);
      }
      if (obj instanceof Door) this.doors.push(obj);
      if (obj instanceof Laser) this.lasers.push(obj);
      if (obj instanceof EnergyNode) this.nodes.push(obj);
      if (obj.interactable) this.interactables.push(obj);
    }
    this.exitDoor = this.byId.exit ?? null;
    for (const obj of this.objects) {
      const expr = obj.cfg.opensWhen ?? obj.cfg.activeWhen ?? obj.cfg.enabledWhen;
      if (expr !== undefined) this.puzzle.bind(obj, expr);
    }
  }

  nearXZ(x, z, range) {
    const b = this.bounds;
    return x >= b.minX - range && x <= b.maxX + range && z >= b.minZ - range && z <= b.maxZ + range;
  }

  contains(p) {
    const b = this.bounds;
    return p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
  }

  dynamicBoxes() {
    const out = this.dynScratch;
    out.length = 0;
    for (const obj of this.objects) {
      const c = obj.colliders();
      for (let i = 0; i < c.length; i++) out.push(c[i]);
    }
    return out;
  }

  updatePlatforms() {
    for (const p of this.platforms) p.setTick(this.clock);
  }

  sense(ctx) {
    for (const obj of this.objects) obj.sense(ctx);
  }

  evaluate() {
    this.puzzle.evaluate();
  }

  actuate(ctx) {
    for (const obj of this.objects) obj.actuate(ctx);
  }

  /** Restore the initial puzzle state. The exit lock (set after leaving) is preserved. */
  reset() {
    this.clock = 0;
    this.complete = false;
    for (const obj of this.objects) obj.reset();
    this.hunter?.reset();
    this.puzzle.reset();
    this.updatePlatforms();
    const ctx = { activators: [], bus: null };
    this.sense(ctx);
    this.evaluate();
    for (const obj of this.objects) if (!(obj instanceof Door)) obj.actuate(ctx);
  }
}
