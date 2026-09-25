import { describe, it, expect } from 'vitest';
import { ROOM_CONFIGS } from '../src/rooms/index.js';

describe('room guide text', () => {
  const puzzles = ROOM_CONFIGS.filter((cfg) => (cfg.kind ?? 'puzzle') === 'puzzle');
  const escape = ROOM_CONFIGS.find((cfg) => cfg.kind === 'escape');

  it('gives every puzzle room an objective, a rule and 3 to 6 steps', () => {
    expect(puzzles).toHaveLength(8);
    for (const cfg of puzzles) {
      expect(cfg.objective.trim().length, cfg.name).toBeGreaterThan(0);
      expect(cfg.hint.trim().length, cfg.name).toBeGreaterThan(0);
      expect(cfg.steps.length, cfg.name).toBeGreaterThanOrEqual(3);
      expect(cfg.steps.length, cfg.name).toBeLessThanOrEqual(6);
      for (const step of cfg.steps) expect(step.trim().length, cfg.name).toBeGreaterThan(0);
    }
  });

  it('does not give the escape room steps', () => {
    expect(escape.steps).toBeUndefined();
  });
});
