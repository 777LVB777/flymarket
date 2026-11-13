
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

/* ---- results page: everything below reads results.json (built by tools/make_results.py) ---- */
(function(){
  if(!document.querySelector("[data-r],#t3,#t4,#c-brier"))return;
  const num=v=>(v<0?"−":v>0?"+":"")+Math.abs(v).toFixed(4);
  const F={int:v=>v.toLocaleString("en-US"),b4:num,u3:v=>v.toFixed(3),u4:v=>v.toFixed(4),text:v=>v};
  const ci=c=>`${num(c.lower)} to ${num(c.upper)}`;
  const get=(o,path)=>path.split(".").reduce((a,k)=>a==null?a:a[k],o);
  const td=(tr,txt,cls)=>{const e=document.createElement("td");if(cls)e.className=cls;e.textContent=txt;tr.appendChild(e);return e};
  fetch("results.json",{cache:"no-store"}).then(r=>r.json()).then(R=>{
    document.querySelectorAll("[data-r]").forEach(e=>{const v=get(R,e.dataset.r);if(v!=null)e.textContent=(F[e.dataset.f]||String)(v)});
    const t3=document.getElementById("t3");
    if(t3)for(const s of R.phase1.strengths){const tr=document.createElement("tr");
      td(tr,s.role==="null control"?"0 (control)":s.strength.toFixed(1));
      td(tr,`${num(s.vs_price.estimate)} (${ci(s.vs_price)})`,"n");
      td(tr,`${num(s.vs_learning_off.estimate)} (${ci(s.vs_learning_off)})`,"n");
      td(tr,s.role==="null control"?(s.passes?"Passed: pipeline problem":"No pass, as expected"):(s.passes?"Pass":"Fail"),s.role==="null control"||s.passes?"":"loss");
      t3.appendChild(tr)}
    const P=R.phase2,t4=document.getElementById("t4");
    if(t4){[["The frozen training-calibrated price",P.vs_comparator,P.vs_comparator_mde],["Learning off",P.vs_learning_off,P.vs_learning_off_mde]].forEach(([n,c,m])=>{
        const tr=document.createElement("tr");td(tr,n);td(tr,`${num(c.estimate)} (${ci(c)})`,"n");td(tr,m.toFixed(4),"n");
        td(tr,c.lower>0?"Lower bound above zero":"Fail",c.lower>0?"":"loss");t4.appendChild(tr)});
      const N=P.null_control;
      document.getElementById("t4-null").textContent=`Null control, the same circuit trained on shuffled outcomes, compared with the frozen training-calibrated price: ${num(N.vs_comparator.estimate)} (${ci(N.vs_comparator)}). `+
        (N.passes?"It passed, which would mean a pipeline problem.":"It did not pass, as expected, so the control was clean.")}
    brier(R);
  }).catch(()=>{const b=document.getElementById("c-brier");if(b)b.textContent="The results data could not be loaded."});

  /* Figure 6: Brier improvement with 95% intervals, both comparisons, Phase 1 strengths and Phase 2 */
  function brier(R){
    const box=document.getElementById("c-brier");if(!box)return;
    const rows=[{g:"Simulated markets"}];
    for(const s of R.phase1.strengths)rows.push({n:s.role==="null control"?"Signal 0 (control)":"Signal "+s.strength.toFixed(1),a:s.vs_price,b:s.vs_learning_off,ga:"Simulated markets, signal "+s.strength.toFixed(1)});
    rows.push({g:"Real markets"});
    const P=R.phase2;rows.push({n:P.n_test_markets.toLocaleString("en-US")+" markets",a:P.vs_comparator,b:P.vs_learning_off,ma:P.vs_comparator_mde,mb:P.vs_learning_off_mde,ga:"Real markets"});
    const vals=rows.flatMap(r=>r.a?[r.a.lower,r.a.upper,r.b.lower,r.b.upper,r.ma||0,r.mb||0]:[]).concat([0]);
    const u=0.01,min=Math.floor(Math.min(...vals)/u)*u,max=Math.max(u,Math.ceil(Math.max(...vals)/u)*u);
    let lastW=0;
    function draw(){
      const W=Math.round(Math.max(280,Math.min(760,box.clientWidth||760)));if(W===lastW)return;lastW=W;box.textContent="";
      const narrow=W<480,step=narrow?0.02:0.01,L=narrow?118:170,R=narrow?12:18,T=8,rowH=40,gH=26,B=34;
      const H=T+rows.reduce((a,r)=>a+(r.g?gH:rowH),0)+B;
      const svg=el("svg",{viewBox:`0 0 ${W} ${H}`,role:"img",style:"min-width:0","aria-label":"Improvement in Brier score from training with 95 percent intervals, for each simulated signal strength and for the real markets, compared with the price benchmark and with learning off"},box);
      const x=v=>L+(v-min)/(max-min)*(W-L-R),yEnd=H-B;
      for(let t=Math.ceil(min/step-1e-9)*step;t<=max+1e-9;t+=step){const tv=Math.round(t*100)/100;
        el("line",{x1:x(tv),x2:x(tv),y1:T,y2:yEnd,class:Math.abs(tv)<1e-9?"axis":"grid"},svg);
        el("text",{x:x(tv),y:yEnd+18,"text-anchor":"middle"},svg).textContent=Math.abs(tv)<1e-9?"0":(tv<0?"−":"+")+Math.abs(tv).toFixed(2)}
      el("text",{x:W-R,y:H-2,"text-anchor":"end"},svg).textContent=narrow?"Brier improvement":"Brier improvement (positive: training helped)";
      let y=T;
      for(const r of rows){
        if(r.g){const t=el("text",{x:4,y:y+gH-8},svg);t.textContent=r.g;t.style.fill="var(--blue)";
          if(y>T)el("line",{x1:0,x2:W-R,y1:y+2,y2:y+2,stroke:"var(--line)"},svg);y+=gH;continue}
        el("text",{x:L-12,y:y+rowH/2+4,"text-anchor":"end"},svg).textContent=r.n;
        [[r.a,r.ma,"var(--blue)",y+rowH/2-7,"compared with the price benchmark"],[r.b,r.mb,"var(--blue2)",y+rowH/2+7,"compared with learning off"]].forEach(([c,m,col,cy,lab])=>{
          if(m){const band=el("rect",{x:x(0),y:cy-6,width:x(m)-x(0),height:12,class:"thr"},svg);hover(band,`${r.ga}, ${lab}: smallest detectable improvement ${m.toFixed(4)}`)}
          el("line",{x1:x(c.lower),x2:x(c.upper),y1:cy,y2:cy,stroke:col,"stroke-width":2},svg);
          [c.lower,c.upper].forEach(v=>el("line",{x1:x(v),x2:x(v),y1:cy-4,y2:cy+4,stroke:col,"stroke-width":2},svg));
          const d=el("circle",{cx:x(c.estimate),cy,r:5,fill:col,stroke:"var(--bg)","stroke-width":1.5},svg);
          const hit=el("rect",{x:x(c.lower)-6,y:cy-7,width:x(c.upper)-x(c.lower)+12,height:14,fill:"transparent"},svg);
          const text=`${r.ga}, ${lab}: ${num(c.estimate)} (95% CI ${ci(c)})`;hover(hit,text);hover(d,text)});
        y+=rowH}
    }
    draw();let tm;addEventListener("resize",()=>{clearTimeout(tm);tm=setTimeout(draw,120)});
  }
})();
