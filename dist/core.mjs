export const sectors=[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
export function hit(x,y){let r=Math.hypot(x,y);if(r>1)return {value:0,m:1,label:'Miss'};if(r<6.35/170)return {value:50,m:2,label:'Bullseye'};if(r<15.9/170)return {value:25,m:1,label:'Bull'};let a=(Math.atan2(x,-y)+Math.PI*2+Math.PI/20)%(Math.PI*2),n=sectors[Math.floor(a/(Math.PI/10))%20],m=r>=162/170?2:r>=99/170&&r<=107/170?3:1;return {value:n*m,m,label:(m===3?'T':m===2?'D':'')+n};}
export function visitResult(start,darts,doubleOut){let left=start;for(const d of darts){left-=d.value;if(left<0||(doubleOut&&left===1)||(left===0&&doubleOut&&d.m!==2))return {left:start,bust:true,win:false};if(left===0)return {left:0,bust:false,win:true};}return {left,bust:false,win:false};}
export function homography(points){let src=points,dst=[[0,-1],[1,0],[0,1],[-1,0]],a=[];for(let i=0;i<4;i++){let {x,y}=src[i],[u,v]=dst[i];a.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);}for(let i=0;i<8;i++){let k=i;for(let j=i+1;j<8;j++)if(Math.abs(a[j][i])>Math.abs(a[k][i]))k=j;[a[i],a[k]]=[a[k],a[i]];if(Math.abs(a[i][i])<1e-8)throw Error('Punkterna ligger för nära varandra. Kalibrera igen.');let d=a[i][i];for(let c=i;c<9;c++)a[i][c]/=d;for(let r=0;r<8;r++)if(r!==i){d=a[r][i];for(let c=i;c<9;c++)a[r][c]-=d*a[i][c];}}return a.map(row=>row[8]);}
export function project(h,x,y){let d=h[6]*x+h[7]*y+1;return {x:(h[0]*x+h[1]*y+h[2])/d,y:(h[3]*x+h[4]*y+h[5])/d};}
const setupDarts = sectors.flatMap(number => [
  { value: number, label: String(number) },
  { value: number * 3, label: 'T' + number },
]);
setupDarts.push({ value: 25, label: 'Bull' });
setupDarts.sort((a, b) => b.value - a.value || a.label.length - b.label.length);

const preferredDoubles = [20, 16, 18, 12, 10, 8];
const otherDoubles = [...sectors].sort((a, b) => b - a)
  .filter(number => !preferredDoubles.includes(number));
const doubleFinishes = [...preferredDoubles, ...otherDoubles]
  .map(number => ({ value: number * 2, label: 'D' + number }));
doubleFinishes.push({ value: 50, label: 'Bullseye' });

const straightFinishes = [...setupDarts, ...doubleFinishes];
const regularSetupByScore = new Map();
for (const dart of setupDarts) {
  if (!regularSetupByScore.has(dart.value)) regularSetupByScore.set(dart.value, dart.label);
}
const setupByScore = new Map(regularSetupByScore);
for (const dart of doubleFinishes) {
  if (!setupByScore.has(dart.value)) setupByScore.set(dart.value, dart.label);
}

function checkoutWithLength(score, dartCount, finishes, firstDarts, setup) {
  for (const finish of finishes) {
    const remainder = score - finish.value;
    if (dartCount === 2) {
      const aim = setup.get(remainder);
      if (aim) return [aim, finish.label];
      continue;
    }
    for (const first of firstDarts) {
      const second = setup.get(remainder - first.value);
      if (second) return [first.label, second, finish.label];
    }
  }
  return null;
}

export function checkout(score, doubleOut, dartsLeft = 3) {
  if (!Number.isInteger(score) || score < 1 ||
      !Number.isInteger(dartsLeft) || dartsLeft < 1 || dartsLeft > 3) return null;
  const highestCheckout = 60 * dartsLeft - (doubleOut ? 10 : 0);
  if (score > highestCheckout) return null;

  const finishes = doubleOut ? doubleFinishes : straightFinishes;
  const direct = finishes.find(dart => dart.value === score);
  if (direct) return [direct.label];

  // Use the shortest finish. Prefer setup shots in singles or triples
  // before using the narrower doubles or the inner bull as setup shots.
  for (let dartCount = 2; dartCount <= dartsLeft; dartCount += 1) {
    const regular = checkoutWithLength(score, dartCount, finishes, setupDarts, regularSetupByScore);
    if (regular) return regular;
    const all = checkoutWithLength(score, dartCount, finishes, straightFinishes, setupByScore);
    if (all) return all;
  }
  return null;
}
