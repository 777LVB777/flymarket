
const NS="http://www.w3.org/2000/svg";
const el=(t,a={},p)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);if(p)p.appendChild(e);return e};
const tip=document.getElementById("tip");
function hover(node,text){
  node.addEventListener("pointermove",e=>{tip.textContent=text;tip.hidden=false;tip.style.left=Math.min(e.clientX+12,innerWidth-270)+"px";tip.style.top=(e.clientY+12)+"px"});
  node.addEventListener("pointerleave",()=>tip.hidden=true);
}

/* learning bars */
(function(){if(!document.getElementById("c-learn"))return;
  const data=[["Reward A (main)",154.49,"pos"],["Learning off",0.0,"ctrl"],["Reward B",-147.97,"neg"],["Punish A",-67.94,"neg"],["Reward both*",-10.51,"ctrl"]];
  const W=760,H=250,L=150,R=70,T=14,rowH=42,min=-180,max=180;
  const svg=el("svg",{viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":"Bar chart of preference change per condition"},document.getElementById("c-learn"));
  const x=v=>L+(v-min)/(max-min)*(W-L-R);
  el("rect",{x:x(-6.545),y:T-4,width:x(6.545)-x(-6.545),height:rowH*data.length+4,class:"thr"},svg);
  [-150,-100,-50,0,50,100,150].forEach(t=>{el("line",{x1:x(t),x2:x(t),y1:T-4,y2:T+rowH*data.length,class:t?"grid":"axis"},svg);el("text",{x:x(t),y:T+rowH*data.length+18,"text-anchor":"middle"},svg).textContent=(t>0?"+":"")+t});
  el("text",{x:W-R,y:H-4,"text-anchor":"end"},svg).textContent="Hz";
  data.forEach(([n,v,k],i)=>{
    const y=T+i*rowH+8,h=24;
    el("text",{x:L-12,y:y+h/2+4,"text-anchor":"end"},svg).textContent=n;
    const x0=Math.min(x(0),x(v)),w=Math.max(2,Math.abs(x(v)-x(0)));
    const col=k==="pos"?"var(--blue)":k==="neg"?"var(--blue2)":"var(--gray)";
    const b=el("rect",{x:x0,y,width:w,height:h,rx:4,fill:col},svg);
    hover(b,`${n}: ${v>0?"+":""}${v.toFixed(2)} Hz`);
    const lt=el("text",{x:v>=0?x(v)+8:x(v)-8,y:y+h/2+4,"text-anchor":v>=0?"start":"end"},svg);lt.textContent=(v>0?"+":"")+v.toFixed(1);lt.style.fill="var(--ink)";
  });
})();

/* graded encoding */
(function(){if(!document.getElementById("c-grade"))return;
  const d=[[0.56,-3.69],[0.64,-8.28],[0.73,-15.90],[0.83,-22.47],[0.94,-29.09]];
  const W=420,H=256,L=46,R=16,T=14,B=52;
  const svg=el("svg",{viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":"Line chart of circuit score versus market price"},document.getElementById("c-grade"));
  const x=v=>L+(v-0.5)/(1-0.5)*(W-L-R),y=v=>T+(0-v)/(32)*(H-T-B);
  [0,-10,-20,-30].forEach(t=>{el("line",{x1:L,x2:W-R,y1:y(t),y2:y(t),class:t?"grid":"axis"},svg);el("text",{x:L-8,y:y(t)+4,"text-anchor":"end"},svg).textContent=t});
  [0.5,0.6,0.7,0.8,0.9,1.0].forEach(t=>el("text",{x:x(t),y:H-30,"text-anchor":"middle"},svg).textContent=t.toFixed(1));
  el("text",{x:W-R,y:H-1,"text-anchor":"end"},svg).textContent="market price";
  el("polyline",{points:d.map(p=>x(p[0])+","+y(p[1])).join(" "),fill:"none",stroke:"var(--blue)","stroke-width":2},svg);
  d.forEach(p=>{const c=el("circle",{cx:x(p[0]),cy:y(p[1]),r:5,fill:"var(--blue)",stroke:"var(--bg)","stroke-width":2},svg);hover(c,`price ${p[0]}: score ${p[1]} Hz`)});
})();

/* cascades */
(function(){if(!document.getElementById("c-casc"))return;
  const d=[["Before training",0],["Learning off",0],["Punish A",0],["Reward A",2],["Reward B",4],["Reward both",6]];
  const W=420,H=240,L=112,R=34,T=8,rowH=36;
  const svg=el("svg",{viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":"Cascade counts per condition"},document.getElementById("c-casc"));
  const x=v=>L+v/8*(W-L-R);
  [0,2,4,6,8].forEach(t=>{el("line",{x1:x(t),x2:x(t),y1:T,y2:T+rowH*d.length,class:t?"grid":"axis"},svg);el("text",{x:x(t),y:T+rowH*d.length+16,"text-anchor":"middle"},svg).textContent=t});
  d.forEach(([n,v],i)=>{const y=T+i*rowH+8;
    el("text",{x:L-10,y:y+14,"text-anchor":"end"},svg).textContent=n;
    if(v){const b=el("rect",{x:x(0),y,width:x(v)-x(0),height:20,rx:4,fill:"var(--blue2)"},svg);hover(b,`${n}: ${v} of 50 test trials`)}
    const t=el("text",{x:x(v)+8,y:y+14},svg);t.textContent=v+"/50";t.style.fill="var(--ink)";
  });
})();


/* ---- trading page: DEMO placeholder data only (deterministic) ---- */
(function(){
  if(!document.getElementById("c-pnl"))return;
  let s=7;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;
  const n=180;
  // demo trades for the learning circuit: +1 win, -1 loss, 0 abstain (payoff sized by a fake price)
  const trades=Array.from({length:n},()=>{const r=rnd();if(r<0.18)return{o:0,v:0};const p=0.3+rnd()*0.4;const win=rnd()<0.56;return{o:win?1:-1,v:win?(1-p):-p}});
  const walk=(drift,vol)=>{let v=0;return Array.from({length:n},()=>v+=drift+(rnd()-0.5)*vol)};
  let c=0;const circ=trades.map(t=>c+=t.v);
  const off=walk(0,0.36),price=walk(0.02,0.3);
  const W=760,H=300,L=46,R=16,T=16,B=30;
  const all=[...circ,...off,...price,0],mn=Math.min(...all),mx=Math.max(...all);
  const svg=el("svg",{viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":"Placeholder P&L chart, demo data only"},document.getElementById("c-pnl"));
  const x=i=>L+i/(n-1)*(W-L-R),y=v=>T+(mx-v)/(mx-mn)*(H-T-B),y0=y(0);
  const defs=el("defs",{},svg);
  const ca=el("clipPath",{id:"above"},defs);el("rect",{x:0,y:0,width:W,height:y0},ca);
  const cb=el("clipPath",{id:"below"},defs);el("rect",{x:0,y:y0,width:W,height:H-y0},cb);
  const area="M"+x(0)+","+y0+" "+circ.map((v,i)=>"L"+x(i)+","+y(v)).join(" ")+" L"+x(n-1)+","+y0+"Z";
  const line=circ.map((v,i)=>x(i)+","+y(v)).join(" ");
  el("path",{d:area,fill:"var(--win)",opacity:.1,"clip-path":"url(#above)"},svg);
  el("path",{d:area,fill:"var(--loss)",opacity:.1,"clip-path":"url(#below)"},svg);
  [[off,"var(--gray)"],[price,"var(--blue2)"]].forEach(([d,col])=>el("polyline",{points:d.map((v,i)=>x(i)+","+y(v)).join(" "),fill:"none",stroke:col,"stroke-width":1.5},svg));
  el("polyline",{points:line,fill:"none",stroke:"var(--win)","stroke-width":2,"clip-path":"url(#above)"},svg);
  el("polyline",{points:line,fill:"none",stroke:"var(--loss)","stroke-width":2,"clip-path":"url(#below)"},svg);
  el("line",{x1:L,x2:W-R,y1:y0,y2:y0,class:"axis"},svg);
  el("text",{x:L-8,y:y0+4,"text-anchor":"end"},svg).textContent="0";
  [0,45,90,135,179].forEach(t=>el("text",{x:x(t),y:H-8,"text-anchor":"middle"},svg).textContent="#"+(t+1));
  el("text",{x:L+4,y:T+10},svg).textContent="DEMO · placeholder values";

  const wins=trades.filter(t=>t.o===1).length,losses=trades.filter(t=>t.o===-1).length,abst=n-wins-losses;
  const pnl=circ.at(-1),fmt=v=>(v>=0?"+":"−")+Math.abs(v).toFixed(2);
  document.getElementById("kpis").innerHTML=
    `<div class="kpi"><span class="label">Wins</span><span class="v win">${wins}</span></div>`+
    `<div class="kpi"><span class="label">Losses</span><span class="v loss">${losses}</span></div>`+
    `<div class="kpi"><span class="label">Hit rate</span><span class="v">${(100*wins/(wins+losses)).toFixed(1)}%</span></div>`+
    `<div class="kpi"><span class="label">Gross P&amp;L, units</span><span class="v ${pnl>=0?"win":"loss"}">${fmt(pnl)}</span></div>`;
  const strip=document.getElementById("strip");
  trades.forEach((t,i)=>{const e=document.createElement("i");e.style.background=t.o===1?"var(--win)":t.o===-1?"var(--loss)":"var(--line)";strip.appendChild(e);
    hover(e,`Trade #${i+1}: ${t.o===1?"win "+fmt(t.v):t.o===-1?"loss "+fmt(t.v):"abstained"}`)});
  const arms=[["Learning circuit",pnl],["Learning off",off.at(-1)],["Price-only trader",price.at(-1)]];
  document.getElementById("arms").innerHTML="<thead><tr><th>Arm</th><th class=n>Gross P&amp;L, units</th><th class=n>vs. price-only</th></tr></thead><tbody>"+
    arms.map(([a,v])=>{const d=v-price.at(-1);return `<tr><td>${a}</td><td class="n ${v>=0?"win":"loss"}">${fmt(v)}</td><td class="n ${a==="Price-only trader"?"":d>=0?"win":"loss"}">${a==="Price-only trader"?"—":fmt(d)}</td></tr>`}).join("")+"</tbody>";
})();
