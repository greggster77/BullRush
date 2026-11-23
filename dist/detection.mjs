import {project} from './core.mjs';
// Classical image differencing; this is an unvalidated single-camera heuristic,
// not a trained dart model. Camera frames stay on the device.
export class AutoTracker {
  constructor(w,h,H){this.w=w;this.h=h;this.H=H;this.roi=new Uint8Array(w*h);this.coords=new Float32Array(w*h*2);this.size=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=project(H,x,y),k=y*w+x;this.coords[k*2]=p.x;this.coords[k*2+1]=p.y;if(Math.hypot(p.x,p.y)<=1.08){this.roi[k]=1;this.size++;}}this.restart();}
  restart(){this.base=null;this.empty=null;this.last=null;this.stable=0;this.candidate=null;this.matches=0;this.phase='baseline';this.clearFrames=0;this.rebase=false;}
  gray(rgba){let g=new Uint8Array(this.w*this.h);for(let k=0;k<g.length;k++)g[k]=(rgba[k*4]*.299+rgba[k*4+1]*.587+rgba[k*4+2]*.114)|0;return g;}
  count(a,b){let n=0;for(let k=0;k<a.length;k++)if(this.roi[k]&&Math.abs(a[k]-b[k])>30)n++;return n;}
  waitForClear(){this.phase='clear';this.clearFrames=0;this.candidate=null;this.matches=0;}
  // Resume against the visible board so an undone or manually entered dart
  // is never added a second time. Preserve the original empty-board reference.
  resume(){this.last=null;this.stable=0;this.candidate=null;this.matches=0;if(this.phase!=='clear'){this.phase='baseline';this.rebase=true;}}
  isEmpty(frame) {
    return this.empty !== null &&
      this.count(frame, this.empty) < Math.max(12, this.size * .0004);
  }
  wasCleared(frame) {
    return this.base !== null && this.isEmpty(frame) && !this.isEmpty(this.base);
  }
  step(rgba){const g=this.gray(rgba);let motion=0,n=0;if(this.last)for(let k=0;k<g.length;k+=3)if(this.roi[k]){motion+=Math.abs(g[k]-this.last[k]);n++;}motion=this.last&&n?motion/n:999;this.last=g;if(motion<2.5)this.stable++;else this.stable=0;if(this.stable<4){this.candidate=null;this.matches=0;return null;}
    if(this.phase==='baseline'){
      if (this.rebase && this.wasCleared(g)) {
        this.waitForClear();
        return {type:'removed'};
      }
      this.base=g;if(!this.empty)this.empty=g;this.phase='watch';this.stable=0;this.rebase=false;return {type:'ready'};}
    if(this.phase==='clear'){if(this.isEmpty(g))this.clearFrames++;else this.clearFrames=0;if(this.clearFrames>=4){this.base=g;this.empty=g;this.phase='watch';this.stable=0;return {type:'clear'};}return null;}
    // Check removal before rejecting large changes from several darts.
    if (this.wasCleared(g)) {
      this.waitForClear();
      return {type:'removed'};
    }
    const changed=this.count(this.base,g);if(changed<12){this.candidate=null;this.matches=0;return null;}if(changed>this.size*.10){this.candidate=null;this.matches=0;return null;}
    const tip=detectTip(this.base,g,this.w,this.h,this.roi,this.coords);if(!tip){this.candidate=null;this.matches=0;return null;}
    if(this.candidate&&Math.hypot(tip.x-this.candidate.x,tip.y-this.candidate.y)<5)this.matches++;else{this.candidate=tip;this.matches=1;}
    if(this.matches<3)return null;this.base=g;this.candidate=null;this.matches=0;this.stable=0;return {type:'hit',...tip};
  }
}
export function detectTip(before,after,w,h,roi,coords){let mask=new Uint8Array(w*h),components=[];for(let k=0;k<mask.length;k++)if(roi[k]&&Math.abs(after[k]-before[k])>30)mask[k]=1;for(let k=0;k<mask.length;k++)if(mask[k]){let q=[k];mask[k]=0;for(let z=0;z<q.length;z++){let at=q[z],x=at%w,y=Math.floor(at/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){let xx=x+dx,yy=y+dy,j=yy*w+xx;if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[j]){mask[j]=0;q.push(j);}}}if(q.length>=12)components.push(q);}components.sort((a,b)=>b.length-a.length);let c=components[0];if(!c||c.length>w*h*.012)return null;let cx=0,cy=0;for(let k of c){cx+=k%w;cy+=Math.floor(k/w);}cx/=c.length;cy/=c.length;let xx=0,yy=0,xy=0;for(let k of c){let x=k%w-cx,y=Math.floor(k/w)-cy;xx+=x*x;yy+=y*y;xy+=x*y;}let disc=Math.hypot(xx-yy,2*xy),major=(xx+yy+disc)/2,minor=(xx+yy-disc)/2;if(major/Math.max(1,minor)<3)return null;let angle=.5*Math.atan2(2*xy,xx-yy),vx=Math.cos(angle),vy=Math.sin(angle),lo=Infinity,hi=-Infinity,ends=[];for(let k of c){let x=k%w,y=Math.floor(k/w),t=(x-cx)*vx+(y-cy)*vy;if(t<lo){lo=t;ends[0]={x,y,k};}if(t>hi){hi=t;ends[1]={x,y,k};}}if(hi-lo<11)return null;ends.sort((a,b)=>Math.hypot(coords[a.k*2],coords[a.k*2+1])-Math.hypot(coords[b.k*2],coords[b.k*2+1]));let p=ends[0];return {x:p.x,y:p.y,bx:coords[p.k*2],by:coords[p.k*2+1]};}
