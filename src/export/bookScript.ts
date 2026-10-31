// Livre feuilletable de la notice : les pages du fichier (couverture, étapes) présentées comme une vraie notice ouverte.
// Double page sur écran large ou en paysage, une page en portrait. La page tourne en se courbant : la feuille est découpée en
// bandes verticales, chacune un peu plus inclinée que la précédente. Elle suit le doigt, ou tourne d'elle-même (bord, flèches).
// Script fixe écrit par l'application (aucune donnée injectée) ; sans lui, le fichier reste la notice complète à faire défiler.

/** Taille de conception d'une page du livre (en pixels CSS, format A4 portrait), mise à l'échelle de l'écran. */
const PAGE_W = 560;
const PAGE_H = 792;

export function bookStyle(): string {
  return `
.book-btn{margin:12px 0 0 16px;font:inherit;font-size:15px;font-weight:600;border:3px solid var(--ink);border-radius:16px;background:var(--sun);color:var(--ink);padding:5px 14px;box-shadow:0 3px 0 var(--ink);cursor:pointer}
.page.end{display:none}
.bk-page .page.end{display:block}
#book{display:none}
body.book{overflow:hidden;overscroll-behavior:none}
body.book main,body.book .duo-box,body.book .duo-label,body.book .book-btn{display:none}
body.book #book{display:block;position:fixed;inset:0;background:#e9dcc0}
.bk-stage{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;justify-content:center;perspective:2600px;touch-action:none;user-select:none;-webkit-user-select:none}
.bk-book{position:relative;flex:none;transform-origin:center center}
.bk-slot{position:absolute;top:0;width:${PAGE_W}px;height:${PAGE_H}px}
.bk-left{left:0}
.bk-book.one .bk-left{display:none}
.bk-page,.bk-blank{position:absolute;inset:0;width:${PAGE_W}px;height:${PAGE_H}px;background:var(--cream);overflow:hidden;padding:22px 24px}
.bk-blank{background:#c9b48a}
.bk-left .bk-page,.bk-left .bk-blank{border-radius:10px 0 0 10px;box-shadow:-6px 8px 18px rgba(0,0,0,.22)}
.bk-right .bk-page,.bk-right .bk-blank,.bk-book.one .bk-page{border-radius:0 10px 10px 0;box-shadow:6px 8px 18px rgba(0,0,0,.22)}
.bk-left .bk-page::after,.bk-right .bk-page::after{content:'';position:absolute;top:0;bottom:0;width:46px;pointer-events:none}
.bk-left .bk-page::after{right:0;background:linear-gradient(to left,rgba(0,0,0,.16),transparent)}
.bk-right .bk-page::after{left:0;background:linear-gradient(to right,rgba(0,0,0,.16),transparent)}
.bk-book.one .bk-page::after{width:18px}
.bk-inner{transform-origin:top left}
.bk-page .page{margin:0;padding:0;background:none;display:block}
.bk-page .foot{margin-top:10px}
.bk-page .step .body{grid-template-columns:minmax(0,1fr);gap:14px}
.bk-page .step .parts{flex-direction:row;flex-wrap:wrap;gap:8px}
.bk-page .step .part{padding:6px 10px;font-size:15px}
.bk-page .step .part .qty{font-size:21px}
.bk-page .shot{max-height:420px;width:auto;max-width:100%;margin:0 auto}
.bk-page .cover .shot{max-height:430px}
.bk-page .cover h2,.bk-page .cover .cover-parts{display:none}
.bk-page .brand{display:block;width:150px;height:38px}
.bk-page .end h1{margin:0 0 6px;font-size:40px;font-weight:600}
.bk-page .end .card{margin:0 0 14px}
.bk-page .end .shot{max-height:260px}
.bk-page .end .parts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.bk-page .end .part{padding:6px 10px;font-size:15px}
.bk-leaf{position:absolute;top:0;left:0;width:${PAGE_W}px;height:${PAGE_H}px;transform-style:preserve-3d;pointer-events:none;z-index:3}
.bk-strip{position:absolute;top:0;height:${PAGE_H}px;transform-style:preserve-3d;transform-origin:left center}
.bk-face{position:absolute;inset:0;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;background:var(--cream)}
.bk-face.back{transform:rotateY(180deg)}
.bk-face>.bk-cut{position:absolute;top:0;width:${PAGE_W}px;height:${PAGE_H}px}
.bk-face>.bk-cut>.bk-page,.bk-face>.bk-cut>.bk-blank{border-radius:0;box-shadow:none}
.bk-face>.bk-cut>.bk-page::after{display:none}
.bk-shade{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none}
.bk-paper{position:absolute;inset:0;background:var(--cream)}
.bk-bar{position:fixed;left:0;right:0;bottom:0;display:flex;gap:10px;align-items:center;justify-content:center;padding:10px;background:var(--cream);border-top:3px solid var(--ink);z-index:6}
.bk-bar button{font:inherit;font-size:20px;font-weight:600;border:3px solid var(--ink);border-radius:18px;background:#fff;color:var(--ink);padding:10px 20px;box-shadow:0 4px 0 var(--ink);cursor:pointer;min-height:52px;white-space:nowrap}
.bk-bar #bk-next{background:var(--sun)}
.bk-bar button:disabled{opacity:.4}
.bk-bar .count{font-size:18px;font-weight:600;min-width:4.5em;text-align:center}
body.book .frise{position:fixed;left:0;right:0;top:auto;bottom:76px;border-top:3px solid var(--ink);border-bottom:0;z-index:6}
@media (max-width:760px){.bk-bar{gap:6px;padding:8px 6px}.bk-bar button{padding:8px 9px;font-size:15px;border-radius:14px}.bk-bar .count{min-width:3.4em;font-size:15px}}
@media (max-height:560px){body.book .frise{display:none}.bk-bar{padding:4px 6px;gap:8px}.bk-bar button{min-height:36px;padding:3px 14px;font-size:15px;border-width:2.5px;box-shadow:0 3px 0 var(--ink)}.bk-bar .count{font-size:15px}}
@media print{#book,.book-btn{display:none!important}body.book{overflow:visible}body.book main{display:block!important}}
`;
}

export function bookScript(): string {
  return `(function(){
var PW=${PAGE_W},PH=${PAGE_H},PAD=22,N=10;
var b=document.body,view=document.getElementById('book'),stage=view.querySelector('.bk-stage'),book=view.querySelector('.bk-book'),
L=view.querySelector('.bk-left'),R=view.querySelector('.bk-right'),bar=view.querySelector('.bk-bar'),
prev=document.getElementById('bk-prev'),next=document.getElementById('bk-next'),count=document.getElementById('bk-count'),
fr=document.querySelector('.frise'),ths=[].slice.call(document.querySelectorAll('.th'));
var src=[].slice.call(document.querySelectorAll('main .page')),tpl=null,dbl=false,pos=0,busy=false,scale=1,ctx=null;
var still=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function total(){return dbl?Math.floor(src.length/2)+1:src.length}
function firstPage(p){return dbl?Math.max(0,2*p-1):p}
function spreadOf(k){return dbl?Math.floor((k+1)/2):k}
function el(tag,cls){var e=document.createElement(tag);if(cls)e.className=cls;return e}
/* Pages du livre : copie de chaque page du fichier, réduite si elle dépasse la hauteur d'une page. */
function build(){
  var meas=el('div');meas.style.cssText='position:absolute;left:-99999px;top:0;visibility:hidden';
  var holder=el('div','bk-book');meas.appendChild(holder);view.appendChild(meas);
  var made=src.map(function(s){
    var p=el('div','bk-page'),inner=s.cloneNode(true);inner.removeAttribute('id');inner.classList.add('bk-inner');
    p.appendChild(inner);holder.appendChild(p);return p});
  var imgs=[].slice.call(holder.querySelectorAll('img'));
  return Promise.all(imgs.map(function(i){return i.decode?i.decode().catch(function(){}):null})).then(function(){
    made.forEach(function(p){var inner=p.firstChild,room=PH-2*PAD,h=inner.scrollHeight;
      if(h>room){var k=room/h;inner.style.transform='scale('+k+')';inner.style.width=(100/k)+'%'}});
    view.removeChild(meas);tpl=made})}
function page(i){if(i===null||i<0||i>=tpl.length)return el('div','bk-blank');return tpl[i].cloneNode(true)}
function put(slot,i){slot.innerHTML='';slot.appendChild(page(i))}
function show(p){
  pos=Math.max(0,Math.min(total()-1,p));
  if(dbl){put(L,pos===0?null:2*pos-1);put(R,2*pos<src.length?2*pos:null)}else put(R,pos);
  status()}
function status(){
  prev.disabled=pos===0;next.disabled=pos>=total()-1;
  count.textContent=count.dataset.fmt.replace('{n}',pos+1).replace('{total}',total());
  var a=firstPage(pos),z=dbl&&pos>0?a+1:a;
  ths.forEach(function(t,j){t.classList.toggle('cur',j>=a&&j<=z)});
  if(fr&&ths[a])fr.scrollLeft=ths[a].offsetLeft-fr.clientWidth/2+ths[a].clientWidth/2}
function layout(){
  var keep=tpl?firstPage(pos):0;
  dbl=innerWidth>innerHeight*1.05&&innerWidth>=560;
  book.classList.toggle('one',!dbl);
  var cols=dbl?2:1,bottom=bar.offsetHeight+(fr?fr.offsetHeight:0);
  stage.style.height=(innerHeight-bottom)+'px';
  scale=Math.min((innerWidth-24)/(cols*PW),(innerHeight-bottom-24)/PH);
  book.style.width=(cols*PW)+'px';book.style.height=PH+'px';book.style.transform='scale('+scale+')';
  R.style.left=dbl?PW+'px':'0';
  if(tpl)show(spreadOf(keep))}
/* Feuille qui tourne : N bandes emboîtées, chacune tournée de l'écart d'angle avec la précédente (la page se courbe). */
function leaf(front,back){
  var lf=el('div','bk-leaf'),parent=lf,w=PW/N,strips=[];
  for(var k=0;k<N;k++){
    var s=el('div','bk-strip');s.style.width=w+'px';s.style.left=(k===0?0:w)+'px';
    var f=el('div','bk-face front'),bk=el('div','bk-face back');
    f.appendChild(cut(front,k,w));bk.appendChild(cut(back,N-1-k,w));
    var fs=el('div','bk-shade'),bs=el('div','bk-shade');f.appendChild(fs);bk.appendChild(bs);
    s.appendChild(f);s.appendChild(bk);parent.appendChild(s);parent=s;strips.push({s:s,f:fs,b:bs})}
  lf.style.left=(dbl?PW:0)+'px';book.appendChild(lf);
  return {el:lf,strips:strips}}
function cut(i,k,w){var c=el('div','bk-cut');c.style.left=(-k*w)+'px';c.appendChild(i===null?el('div','bk-paper'):page(i));return c}
function bend(lf,phi){
  var bow=38*Math.sin(phi*Math.PI/180),last=0;
  for(var k=0;k<N;k++){
    var a=Math.max(0,Math.min(180,phi-bow/2+bow*k/(N-1))),st=lf.strips[k],c=Math.cos(a*Math.PI/180);
    st.s.style.transform='rotateY('+(-(a-last))+'deg)';last=a;
    st.f.style.opacity=((1-c)/2*0.32).toFixed(3);st.b.style.opacity=((1+c)/2*0.32).toFixed(3)}}
function animate(lf,from,to,done){
  if(still){bend(lf,to);done();return}
  var t0=performance.now(),d=Math.max(160,Math.abs(to-from)/180*560);
  (function step(now){var u=Math.min(1,(now-t0)/d),e=1-Math.pow(1-u,3);bend(lf,from+(to-from)*e);
    if(u<1)requestAnimationFrame(step);else done()})(t0)}
function rustle(){try{var C=window.AudioContext||window.webkitAudioContext;if(!C)return;ctx=ctx||new C();
  var n=Math.floor(ctx.sampleRate*0.28),buf=ctx.createBuffer(1,n,ctx.sampleRate),d=buf.getChannelData(0);
  for(var i=0;i<n;i++){var t=i/n;d[i]=(Math.random()*2-1)*Math.pow(1-t,2)*Math.min(1,t*12)}
  var s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();f.type='bandpass';f.frequency.value=2600;f.Q.value=0.6;g.gain.value=0.22;
  s.buffer=buf;s.connect(f);f.connect(g);g.connect(ctx.destination);s.start()}catch(e){}}
/* Prépare un tour de page : pages fixes dessous, feuille au-dessus. dir = 1 (suivante) ou -1 (précédente). */
function begin(dir){
  if(busy)return null;
  if(dir>0&&pos>=total()-1)return null;if(dir<0&&pos<=0)return null;
  busy=true;var lf;
  if(dbl){
    if(dir>0){put(L,pos===0?null:2*pos-1);put(R,2*pos+2<src.length?2*pos+2:null);lf=leaf(2*pos,2*pos+1<src.length?2*pos+1:null)}
    else{put(L,pos-1===0?null:2*pos-3);put(R,2*pos<src.length?2*pos:null);lf=leaf(2*pos-2,2*pos-1)}}
  else{if(dir>0){put(R,pos+1);lf=leaf(pos,null)}else{put(R,pos);lf=leaf(pos-1,null)}}
  bend(lf,dir>0?0:180);return lf}
function finish(lf,dir,done){
  var target=done?(dir>0?180:0):(dir>0?0:180);
  return function(){animate(lf,lf.phi,target,function(){book.removeChild(lf.el);busy=false;show(done?pos+dir:pos)})}}
function turn(dir){var lf=begin(dir);if(!lf)return;lf.phi=dir>0?0:180;rustle();finish(lf,dir,true)()}
function jump(p){if(busy)return;show(p)}
/* Au doigt (ou à la souris) : la page suit le geste ; un simple toucher tourne la page entière. */
var drag=null;
stage.addEventListener('pointerdown',function(e){
  if(busy||e.button>0)return;var r=book.getBoundingClientRect(),x=(e.clientX-r.left)/scale;
  var dir=dbl?(x>=PW?1:-1):(x>=PW/2?1:-1);
  drag={id:e.pointerId,x0:e.clientX,t0:performance.now(),dir:dir,lf:null};
  try{stage.setPointerCapture(e.pointerId)}catch(err){}});
stage.addEventListener('pointermove',function(e){
  if(!drag||drag.id!==e.pointerId)return;var dx=(e.clientX-drag.x0)/scale;
  if(!drag.lf){if(Math.abs(dx)<10)return;drag.lf=begin(drag.dir);if(!drag.lf){drag=null;return}rustle()}
  var phi=drag.dir>0?Math.max(0,Math.min(180,-dx/PW*180)):Math.max(0,Math.min(180,180-dx/PW*180));
  drag.lf.phi=phi;bend(drag.lf,phi)});
function release(e){
  if(!drag||drag.id!==e.pointerId)return;var d=drag;drag=null;
  if(!d.lf){turn(d.dir);return}
  var dx=(e.clientX-d.x0)/scale,fast=Math.abs(dx)/Math.max(1,performance.now()-d.t0)>0.6&&(d.dir>0?dx<0:dx>0);
  var ok=fast||(d.dir>0?d.lf.phi>55:d.lf.phi<125);
  finish(d.lf,d.dir,ok)()}
stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);
prev.onclick=function(){turn(-1)};next.onclick=function(){turn(1)};
document.getElementById('bk-exit').onclick=stop;
document.addEventListener('keydown',function(e){if(!b.classList.contains('book'))return;
  if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){e.preventDefault();turn(1)}
  else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();turn(-1)}
  else if(e.key==='Escape')stop()});
ths.forEach(function(t,k){t.onclick=function(){if(b.classList.contains('book'))jump(spreadOf(k));else src[k].scrollIntoView({behavior:'smooth',block:'start'})}});
if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting&&!b.classList.contains('book')){var k=src.indexOf(e.target);ths.forEach(function(t,j){t.classList.toggle('cur',j===k)})}})},{threshold:.5});src.forEach(function(p){if(!p.classList.contains('end'))io.observe(p)})}
ths.forEach(function(t,j){t.classList.toggle('cur',j===0)});
addEventListener('resize',function(){if(b.classList.contains('book')&&!busy)layout()});
function start(k){
  b.classList.add('book');window.scrollTo(0,0);
  (tpl?Promise.resolve():build()).then(function(){layout();show(spreadOf(k||0))})}
function stop(){b.classList.remove('book')}
window.startBook=start;
document.getElementById('play').onclick=function(){start(0)};
})();`;
}
