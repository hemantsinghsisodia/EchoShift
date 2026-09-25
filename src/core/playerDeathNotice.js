/** Banner and sting for a player death. Echo strikes stay on hunter:strike. */
export function playerDeathNotice(reason) {
  if (reason === 'hunter') return { banner: 'HUNTER CONTACT', sound: 'hunterStrike' };
  if (reason === 'laser') return { banner: 'LASER CONTACT', sound: 'death' };
  return { banner: 'FELL INTO THE VOID', sound: 'death' };
}
