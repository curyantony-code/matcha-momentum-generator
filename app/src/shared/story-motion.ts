// The film's motion: a tiny seek-driven runtime, our own. Every animated element gets keys (prop, t0 → t1, v0 → v1,
// easing); the page's __seek(t) computes each element's style from t alone, so a frame depends only on its time
// (no CSS transitions or animations, no timers, no randomness). The same easings exist here and in the page script.

/** x, y: px · s: scale · sx/sy: scale on one axis · r: degrees · o: opacity · b: blur px ·
 *  ct/cr/cb/cl: clip inset % from each side · iris: clip circle radius % (100 = off) */
export type Prop = 'x' | 'y' | 's' | 'sx' | 'sy' | 'r' | 'o' | 'b' | 'ct' | 'cr' | 'cb' | 'cl' | 'iris'

export const EASES = ['linear', 'outCubic', 'outExpo', 'inOutSine', 'outBack', 'inCubic', 'inOutCubic', 'outQuint'] as const
export type Ease = (typeof EASES)[number]

/** The easing functions, as source: the page script and the tests both use exactly this text. */
export const EASE_SOURCE = `[
function(u){return u},
function(u){return 1-Math.pow(1-u,3)},
function(u){return u>=1?1:1-Math.pow(2,-10*u)},
function(u){return -(Math.cos(Math.PI*u)-1)/2},
function(u){var c=1.5,d=c+1;return 1+d*Math.pow(u-1,3)+c*Math.pow(u-1,2)},
function(u){return u*u*u},
function(u){return u<0.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2},
function(u){return 1-Math.pow(1-u,5)}
]`

/** One key: [element id, prop, t0, t1, v0, v1, ease index]. Compact because a film has a few thousand. */
export type KeyRow = [string, Prop, number, number, number, number, number]

export interface Motion {
  /** A new element id, unique in this film ("e0", "e1" …). */
  id: () => string
  /** Animate `prop` of element `id` from v0 at t0 to v1 at t1 (before t0 it holds v0, after t1 it holds v1). */
  key: (id: string, prop: Prop, t0: number, t1: number, v0: number, v1: number, ease?: Ease) => void
  /** Hold a value from t on (a key of no length). */
  set: (id: string, prop: Prop, t: number, v: number) => void
  rows: () => KeyRow[]
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000

/** A collector for one film's keys (local to one storyHtml call). */
export function createMotion(): Motion {
  let n = 0
  const rows: KeyRow[] = []
  const key: Motion['key'] = (id, prop, t0, t1, v0, v1, ease = 'outCubic') => {
    rows.push([id, prop, r3(t0), r3(Math.max(t0, t1)), r3(v0), r3(v1), EASES.indexOf(ease)])
  }
  return {
    id: () => `e${n++}`,
    key,
    set: (id, prop, t, v) => key(id, prop, t, t, v, v, 'linear'),
    rows: () => rows.map((r) => [...r] as KeyRow)
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Common moves (each one call = one gesture of the MG V3 look)

/** A word lands on its onset: blur 10 → 0 and fade in over 0.16 s, a short rise. */
export function land(m: Motion, id: string, t: number, from: 'rise' | 'left' | 'right' | 'slam' | 'pop' = 'rise'): void {
  m.key(id, 'o', t, t + 0.16, 0, 1, 'outCubic')
  m.key(id, 'b', t, t + 0.16, 10, 0, 'outCubic')
  if (from === 'rise') m.key(id, 'y', t, t + 0.34, 26, 0, 'outExpo')
  if (from === 'left') m.key(id, 'x', t, t + 0.4, -90, 0, 'outExpo')
  if (from === 'right') m.key(id, 'x', t, t + 0.4, 90, 0, 'outExpo')
  if (from === 'slam') m.key(id, 's', t, t + 0.32, 1.4, 1, 'outExpo')
  if (from === 'pop') m.key(id, 's', t, t + 0.4, 0.55, 1, 'outBack')
}

/** Shown from t (no motion): a quick fade for garnish. */
export function appear(m: Motion, id: string, t: number, dur = 0.24): void {
  m.key(id, 'o', t, t + dur, 0, 1, 'outCubic')
}

/** The page script: reads the keys, defines __duration and __seek(t), answers {type:'seek', t} messages. */
export function runtimeScript(data: { duration: number; scenes: [string, number, number][]; keys: KeyRow[] }): string {
  // JSON in a <script>: "<" escaped so no text can ever close the tag (there is no person's text in it anyway).
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return `(function(){
var D=${json};
var E=${EASE_SOURCE};
var DEF={x:0,y:0,s:1,sx:1,sy:1,r:0,o:1,b:0,ct:0,cr:0,cb:0,cl:0,iris:100};
var els=[],byId={};
D.keys.forEach(function(k){var e=byId[k[0]];if(!e){var n=document.getElementById(k[0]);if(!n)return;e=byId[k[0]]={n:n,p:{}};els.push(e)}(e.p[k[1]]=e.p[k[1]]||[]).push(k)});
els.forEach(function(e){for(var p in e.p)e.p[p].sort(function(a,b){return a[2]-b[2]||a[3]-b[3]});e.t=!!(e.p.x||e.p.y||e.p.s||e.p.sx||e.p.sy||e.p.r)});
var scenes=D.scenes.map(function(s){return{n:document.getElementById(s[0]),a:s[1],z:s[2]}});
function val(ks,t){var v=ks[0][4];for(var i=0;i<ks.length;i++){var k=ks[i];if(t>=k[3]){v=k[5];continue}if(t>=k[2]){var u=(t-k[2])/(k[3]-k[2]);v=k[4]+(k[5]-k[4])*E[k[6]](u)}break}return v}
function get(e,p,t){return e.p[p]?val(e.p[p],t):DEF[p]}
function apply(e,t){
var st=e.n.style;
if(e.t){var x=get(e,'x',t),y=get(e,'y',t),s=get(e,'s',t),sx=get(e,'sx',t),sy=get(e,'sy',t),r=get(e,'r',t);
st.transform='translate('+x.toFixed(2)+'px,'+y.toFixed(2)+'px) rotate('+r.toFixed(3)+'deg) scale('+(s*sx).toFixed(4)+','+(s*sy).toFixed(4)+')'}
if(e.p.o)st.opacity=Math.max(0,Math.min(1,get(e,'o',t))).toFixed(3);
if(e.p.b){var b=get(e,'b',t);st.filter=b>0.05?'blur('+b.toFixed(2)+'px)':'none'}
if(e.p.iris){var c=get(e,'iris',t);st.clipPath=c>=99.9?'none':'circle('+c.toFixed(2)+'% at 50% 50%)'}
else if(e.p.ct||e.p.cr||e.p.cb||e.p.cl){st.clipPath='inset('+get(e,'ct',t).toFixed(2)+'% '+get(e,'cr',t).toFixed(2)+'% '+get(e,'cb',t).toFixed(2)+'% '+get(e,'cl',t).toFixed(2)+'%)'}
}
function seek(t){
t=Number(t);if(!isFinite(t))t=0;t=Math.max(0,Math.min(D.duration,t));
for(var i=0;i<scenes.length;i++){var s=scenes[i];if(s.n)s.n.style.display=(t>=s.a&&t<s.z)?'block':'none'}
for(var j=0;j<els.length;j++)apply(els[j],t);
}
window.__duration=D.duration;
window.__seek=seek;
window.addEventListener('message',function(e){var d=e.data;if(d&&d.type==='seek'&&typeof d.t==='number')seek(d.t)});
seek(0);
})();`
}
