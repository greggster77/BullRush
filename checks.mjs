import assert from 'node:assert/strict';
import {hit,homography,project,visitResult,checkout} from './dist/core.mjs';
assert.equal(hit(0,-.6).label,'T20');assert.equal(hit(.98,0).label,'D6');assert.equal(hit(0,0).value,50);assert.equal(hit(0,.07).value,25);assert.equal(hit(0,1.1).value,0);
const h=homography([{x:200,y:40},{x:380,y:200},{x:200,y:360},{x:20,y:200}]);const p=project(h,200,200);assert.ok(Math.hypot(p.x,p.y)<1e-8);
assert.equal(visitResult(40,[{value:40,m:2}],true).win,true);assert.equal(visitResult(40,[{value:40,m:1}],true).bust,true);assert.equal(visitResult(40,[{value:60,m:3}],true).left,40);assert.equal(visitResult(2,[{value:1,m:1}],true).bust,true);assert.equal(visitResult(25,[{value:25,m:1}],false).win,true);assert.deepEqual(checkout(170,true),['T20','T20','Bullseye']);assert.equal(checkout(169,true),null);

assert.deepEqual(checkout(100, true, 2), ['T20', 'D20']);
assert.equal(checkout(100, true, 1), null);
assert.deepEqual(checkout(60, true, 2), ['20', 'D20']);
assert.deepEqual(checkout(40, true, 1), ['D20']);
assert.deepEqual(checkout(50, true, 1), ['Bullseye']);
assert.equal(checkout(1, true, 3), null);
assert.equal(checkout(0, true, 3), null);
assert.equal(checkout(40, true, 0), null);
assert.deepEqual(checkout(180, false, 3), ['T20', 'T20', 'T20']);
assert.deepEqual(checkout(1, false, 1), ['1']);
console.log('Scoring, bust, checkout and perspective checks passed.');

const { botLevels, botThrow } = await import('./dist/bot.mjs');
assert.equal(botThrow(40, true, 1, 'novice', () => 0).label, 'D20');
assert.equal(botThrow(50, true, 1, 'elite', () => 0).label, 'Bullseye');
assert.equal(botThrow(20, false, 1, 'club', () => 0).label, '20');

let previousMedian = Infinity;
for (const [level, settings] of Object.entries(botLevels)) {
  let seed = 57551;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const throwsToWin = [];
  for (let leg = 0; leg < 500; leg += 1) {
    let score = 501;
    let dartCount = 0;
    while (score > 0 && dartCount < 900) {
      const darts = [];
      for (let left = 3; left > 0; left -= 1) {
        const remaining = visitResult(score, darts, true).left;
        darts.push(botThrow(remaining, true, left, level, random));
        dartCount += 1;
        const visit = visitResult(score, darts, true);
        if (visit.win || visit.bust || left === 1) {
          score = visit.left;
          break;
        }
      }
    }
    assert.equal(score, 0);
    throwsToWin.push(dartCount);
  }
  throwsToWin.sort((a, b) => a - b);
  const median = throwsToWin[Math.floor(throwsToWin.length / 2)];
  assert.ok(median < previousMedian);
  assert.ok(Math.abs(median - settings.typical501) <= 8);
  previousMedian = median;
}
console.log('Bot targets, legal finishes and all six difficulty levels passed.');
