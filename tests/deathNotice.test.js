import { describe, it, expect } from 'vitest';
import { playerDeathNotice } from '../src/core/playerDeathNotice.js';

describe('player death notice', () => {
  it('announces a Hunter catch as hunter contact and the strike cue', () => {
    expect(playerDeathNotice('hunter')).toEqual({
      banner: 'HUNTER CONTACT',
      sound: 'hunterStrike',
    });
  });

  it('keeps laser contact on the death sting', () => {
    expect(playerDeathNotice('laser')).toEqual({
      banner: 'LASER CONTACT',
      sound: 'death',
    });
  });

  it('keeps every other reason as a fall on the death sting', () => {
    expect(playerDeathNotice('fall')).toEqual({
      banner: 'FELL INTO THE VOID',
      sound: 'death',
    });
    expect(playerDeathNotice(undefined)).toEqual({
      banner: 'FELL INTO THE VOID',
      sound: 'death',
    });
  });
});
