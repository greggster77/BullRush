import assert from 'node:assert/strict';
import {hit,homography,project,visitResult,checkout} from './dist/core.mjs';
assert.equal(hit(0,-.6).label,'T20');assert.equal(hit(.98,0).label,'D6');assert.equal(hit(0,0).value,50);assert.equal(hit(0,.07).value,25);assert.equal(hit(0,1.1).value,0);
const h=homography([{x:200,y:40},{x:380,y:200},{x:200,y:360},{x:20,y:200}]);const p=project(h,200,200);assert.ok(Math.hypot(p.x,p.y)<1e-8);
assert.equal(visitResult(40,[{value:40,m:2}],true).win,true);assert.equal(visitResult(40,[{value:40,m:1}],true).bust,true);assert.equal(visitResult(40,[{value:60,m:3}],true).left,40);assert.equal(visitResult(2,[{value:1,m:1}],true).bust,true);assert.equal(visitResult(25,[{value:25,m:1}],false).win,true);assert.deepEqual(checkout(170,true),['T20','T20','Bullseye']);assert.equal(checkout(169,true),null);console.log('Scoring, bust, checkout and perspective checks passed.');
