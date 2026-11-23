import { checkout, hit, sectors } from './core.mjs';

export const botLevels = {
  novice: { name: 'Novis', spread: 0.34, typical501: 92 },
  beginner: { name: 'Nybörjare', spread: 0.22, typical501: 59 },
  club: { name: 'Klubbspelare', spread: 0.14, typical501: 40 },
  advanced: { name: 'Avancerad', spread: 0.095, typical501: 29 },
  expert: { name: 'Expert', spread: 0.068, typical501: 22 },
  elite: { name: 'Elit', spread: 0.046, typical501: 17 },
};

function aimPoint(label) {
  if (label === 'Bullseye') return [0, 0];
  if (label === 'Bull') return [11 / 170, 0];

  const double = label.startsWith('D');
  const triple = label.startsWith('T');
  const number = Number(double || triple ? label.slice(1) : label);
  const angle = -Math.PI / 2 + sectors.indexOf(number) * Math.PI / 10;
  // Use the centers of the scoring rings. Singles use the wide outer bed.
  const radius = (double ? 166 : triple ? 103 : 135) / 170;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

export function botThrow(score, doubleOut, dartsLeft, level, random = Math.random) {
  const finish = checkout(score, doubleOut, dartsLeft) ?? checkout(score, doubleOut);
  const [x, y] = aimPoint(finish?.[0] ?? 'T20');
  const spread = botLevels[level]?.spread ?? botLevels.novice.spread;

  // Sample a circular Gaussian spread around the intended target.
  const radius = spread * Math.sqrt(-2 * Math.log(1 - random()));
  const angle = 2 * Math.PI * random();
  const bx = x + radius * Math.cos(angle);
  const by = y + radius * Math.sin(angle);
  return { ...hit(bx, by), bx, by };
}
