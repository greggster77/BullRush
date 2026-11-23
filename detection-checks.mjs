import assert from 'node:assert/strict';
import {AutoTracker} from './dist/detection.mjs';
import {homography} from './dist/core.mjs';
const w=200,h=200,H=homography([{x:100,y:15},{x:185,y:100},{x:100,y:185},{x:15,y:100}]);
function frame(lines=[],background=120){let f=new Uint8ClampedArray(w*h*4);for(let k=0;k<w*h;k++){f[k*4]=f[k*4+1]=f[k*4+2]=background;f[k*4+3]=255;}for(let [x1,y1,x2,y2] of lines){const length=Math.hypot(x2-x1,y2-y1);for(let t=0;t<=length;t+=.3){let x=Math.round(x1+(x2-x1)*t/length),y=Math.round(y1+(y2-y1)*t/length);for(let dx=-1;dx<=1;dx++){let k=(y*w+x+dx)*4;if(k>=0&&k<f.length)f[k]=f[k+1]=f[k+2]=230;}}}return f;}
const empty=frame(),one=frame([[100,45,103,75]]),two=frame([[100,45,103,75],[135,85,166,80]]);
function run(tracker,f,n=15){let events=[];for(let i=0;i<n;i++){let e=tracker.step(f);if(e)events.push(e);}return events;}
let t=new AutoTracker(w,h,H);assert.deepEqual(run(t,empty).map(e=>e.type),['ready']);let first=run(t,one);assert.equal(first.filter(e=>e.type==='hit').length,1);assert.ok(first[0].by<0);assert.equal(run(t,one,40).filter(e=>e.type==='hit').length,0,'A stationary dart must never be counted twice');assert.equal(run(t,two).filter(e=>e.type==='hit').length,1,'Second dart must register without re-arming');t.waitForClear();assert.equal(run(t,two).filter(e=>e.type==='clear').length,0);assert.equal(run(t,empty).filter(e=>e.type==='clear').length,1,'Clearing returns to ready without a button');assert.equal(run(t,one).filter(e=>e.type==='hit').length,1,'New visit starts automatically');t.resume();assert.equal(run(t,one).filter(e=>e.type==='hit').length,0,'Undo/resume does not redetect visible darts');let noise=new AutoTracker(w,h,H);run(noise,empty);assert.equal(run(noise,frame([],230),30).filter(e=>e.type==='hit').length,0,'Lighting shift must not count as a dart');let removed=new AutoTracker(w,h,H);run(removed,empty);run(removed,one);assert.equal(run(removed,empty).filter(e=>e.type==='removed').length,1,'Removing an incomplete visit is a removal, not a hit');console.log('Continuous detection: two successive darts, duplicate rejection, board clearing, next visit, resume and lighting rejection passed on synthetic frames.');

const pausedRemoval = new AutoTracker(w, h, H);
run(pausedRemoval, empty);
run(pausedRemoval, one);
pausedRemoval.resume();
assert.deepEqual(run(pausedRemoval, empty).map(event => event.type), ['removed', 'clear']);

const manualDart = new AutoTracker(w, h, H);
run(manualDart, empty);
manualDart.resume();
assert.deepEqual(run(manualDart, one).map(event => event.type), ['ready']);
assert.deepEqual(run(manualDart, empty).map(event => event.type), ['removed', 'clear']);
