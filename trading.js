/* Flymarket trading dashboard. Reads pnl.json (daily totals per arm). */
(function () {
  const root = document.getElementById("dash");
  if (!root) return;
  const NS = "http://www.w3.org/2000/svg";
  const E = (t, a = {}, p) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const H = (t, cls, txt, p) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (p) p.appendChild(e); return e; };
  const tip = document.getElementById("tip");
  const fmt = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);
  const pct = v => (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(2) + "%";
  const cls = v => (v >= 0 ? "win" : "loss");
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dlabel = s => { const [y, m, d] = s.split("-"); return MON[+m - 1] + " " + (+d); };
  const ARM_STYLE = { circuit: null, off: { c: "var(--gray)", dash: "5 4" }, price: { c: "var(--blue)", dash: "2 4" } };

  const st = { range: "ALL", gran: "W", show: { off: true, price: true } };
  let D;

  fetch("pnl.json", { cache: "no-store" }).then(r => r.json()).then(j => { D = j; init(); })
    .catch(() => { root.textContent = "The returns data could not be loaded."; });

  function init() {
    document.getElementById("dash-demo").hidden = D.status !== "demo";
    document.querySelectorAll("[data-range]").forEach(b => b.addEventListener("click", () => { st.range = b.dataset.range; render(); }));
    document.querySelectorAll("[data-gran]").forEach(b => b.addEventListener("click", () => { st.gran = b.dataset.gran; render(); }));
    document.querySelectorAll("[data-arm]").forEach(c => c.addEventListener("change", () => { st.show[c.dataset.arm] = c.checked; render(); }));
    render();
  }

  function slice(days) {
    if (st.range === "ALL") return days;
    const last = new Date(days[days.length - 1].date + "T00:00:00Z");
    const back = { "1W": 7, "1M": 30, "3M": 91, "6M": 182 }[st.range];
    const cut = new Date(last.getTime() - (back - 1) * 864e5).toISOString().slice(0, 10);
    return days.filter(d => d.date >= cut);
  }

  function group(days, g) {
    if (g === "D") return days.map(d => ({ key: d.date, label: dlabel(d.date), ...d }));
    const m = new Map();
    for (const d of days) {
      let key, label;
      if (g === "M") { key = d.date.slice(0, 7); const [y, mo] = key.split("-"); label = MON[+mo - 1] + " " + y; }
      else { const t = new Date(d.date + "T00:00:00Z"); const wd = (t.getUTCDay() + 6) % 7; const mon = new Date(t.getTime() - wd * 864e5).toISOString().slice(0, 10); key = mon; label = "Week of " + dlabel(mon); }
      const o = m.get(key) || { key, label, pnl: 0, stake: 0, wins: 0, losses: 0, abstain: 0 };
      o.pnl += d.pnl; o.stake += d.stake; o.wins += d.wins; o.losses += d.losses; o.abstain += d.abstain; m.set(key, o);
    }
    return [...m.values()];
  }

  function totals(days) {
    const t = days.reduce((a, d) => ({ pnl: a.pnl + d.pnl, stake: a.stake + d.stake, wins: a.wins + d.wins, losses: a.losses + d.losses, abstain: a.abstain + d.abstain }), { pnl: 0, stake: 0, wins: 0, losses: 0, abstain: 0 });
    let c = 0, peak = 0, dd = 0;
    for (const d of days) { c += d.pnl; peak = Math.max(peak, c); dd = Math.min(dd, c - peak); }
    t.dd = dd; return t;
  }

  function render() {
    document.querySelectorAll("[data-range]").forEach(b => b.setAttribute("aria-pressed", b.dataset.range === st.range));
    document.querySelectorAll("[data-gran]").forEach(b => b.setAttribute("aria-pressed", b.dataset.gran === st.gran));
    const arms = D.arms, main = slice(arms.circuit.days), all = arms.circuit.days;
    const T = totals(main), TA = totals(all);
    // headline
    const hv = document.getElementById("dash-total"); hv.textContent = fmt(TA.pnl) + " " + D.unit; hv.className = "dash-big " + cls(TA.pnl);
    const hc = document.getElementById("dash-change");
    hc.textContent = fmt(T.pnl) + " (" + pct(T.stake ? T.pnl / T.stake : 0) + ") " + ({ "1W": "past week", "1M": "past month", "3M": "past 3 months", "6M": "past 6 months", ALL: "whole test period" })[st.range];
    hc.className = "dash-change " + cls(T.pnl);
    document.getElementById("dash-asof").textContent = "Test markets decided " + dlabel(all[0].date) + " – " + dlabel(all[all.length - 1].date) + ", 2026 · " + (D.status === "demo" ? "placeholder data" : "final");
    // stats
    const P = group(main, st.gran), pos = P.filter(p => p.pnl > 0).length;
    const best = P.reduce((a, p) => (p.pnl > a.pnl ? p : a), P[0]), worst = P.reduce((a, p) => (p.pnl < a.pnl ? p : a), P[0]);
    const unitName = { D: "day", W: "week", M: "month" }[st.gran];
    const stats = [
      ["Return on stake", pct(T.stake ? T.pnl / T.stake : 0), cls(T.pnl)],
      ["Hit rate", (T.wins + T.losses ? (100 * T.wins / (T.wins + T.losses)).toFixed(1) : "0") + "%", ""],
      ["Wins / losses", T.wins + " / " + T.losses, ""],
      ["Best " + unitName, best ? fmt(best.pnl) : "–", "win"],
      ["Worst " + unitName, worst ? fmt(worst.pnl) : "–", "loss"],
      ["Positive " + unitName + "s", pos + " of " + P.length, ""],
      ["Largest drawdown", fmt(T.dd), T.dd < 0 ? "loss" : ""],
    ];
    const sw = document.getElementById("dash-stats"); sw.textContent = "";
    for (const [l, v, c] of stats) { const d = H("div", "kpi", null, sw); H("span", "label", l, d); H("span", "v " + c, v, d); }
    line(main);
    bars(P);
    table(P);
  }

  function line(main) {
    const box = document.getElementById("dash-line"); box.textContent = "";
    const W = 760, Hh = 300, L = 54, R = 96, T = 14, B = 30;
    const series = [];
    const cum = days => { let c = 0; return days.map(d => (c += d.pnl)); };
    const dates = main.map(d => d.date);
    series.push({ k: "circuit", label: D.arms.circuit.label, v: cum(main) });
    for (const k of ["off", "price"]) if (st.show[k] && D.arms[k]) series.push({ k, label: D.arms[k].label, v: cum(slice(D.arms[k].days)) });
    const allv = series.flatMap(s => s.v).concat([0]);
    let mn = Math.min(...allv), mx = Math.max(...allv); const pad = (mx - mn) * 0.08 || 1; mn -= pad; mx += pad;
    const n = dates.length, x = i => L + (n > 1 ? i / (n - 1) : 0.5) * (W - L - R), y = v => T + (mx - v) / (mx - mn) * (Hh - T - B);
    const svg = E("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Running profit and loss" }, box);
    // grid + y ticks
    const step = niceStep((mx - mn) / 4);
    for (let t = Math.ceil(mn / step) * step; t <= mx; t += step) {
      E("line", { x1: L, x2: W - R, y1: y(t), y2: y(t), class: Math.abs(t) < 1e-9 ? "axis" : "grid" }, svg);
      E("text", { x: L - 8, y: y(t) + 4, "text-anchor": "end" }, svg).textContent = (Math.abs(t) < 1e-9 ? "0" : fmt(t).replace(".00", ""));
    }
    // x ticks
    const ticks = Math.min(6, n);
    for (let i = 0; i < ticks; i++) { const idx = Math.round(i * (n - 1) / Math.max(1, ticks - 1)); E("text", { x: x(idx), y: Hh - 8, "text-anchor": "middle" }, svg).textContent = dlabel(dates[idx]); }
    // main area + line (green if range up, red if down; Yahoo-style)
    const s0 = series[0], up = s0.v[n - 1] >= 0, col = up ? "var(--win)" : "var(--loss)";
    const pts = s0.v.map((v, i) => x(i) + "," + y(v)).join(" ");
    E("path", { d: `M${x(0)},${y(0)} L${pts.replace(/ /g, " L")} L${x(n - 1)},${y(0)} Z`, fill: col, opacity: 0.08 }, svg);
    for (const s of series.slice(1)) { const stl = ARM_STYLE[s.k]; E("polyline", { points: s.v.map((v, i) => x(i) + "," + y(v)).join(" "), fill: "none", stroke: stl.c, "stroke-width": 1.5, "stroke-dasharray": stl.dash }, svg); }
    E("polyline", { points: pts, fill: "none", stroke: col, "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    // direct labels at right end
    const lab = series.map(s => ({ s, yy: y(s.v[n - 1]) })).sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < lab.length; i++) if (lab[i].yy - lab[i - 1].yy < 14) lab[i].yy = lab[i - 1].yy + 14;
    for (const o of lab) { const t = E("text", { x: W - R + 6, y: o.yy + 4 }, svg); t.textContent = o.s.k === "circuit" ? "Circuit" : o.s.k === "off" ? "Learning off" : "Price-only"; }
    // crosshair
    const hair = E("line", { y1: T, y2: Hh - B, stroke: "var(--ink2)", "stroke-width": 1, opacity: 0 }, svg);
    const dot = E("circle", { r: 4, fill: col, stroke: "#fff", "stroke-width": 2, opacity: 0 }, svg);
    const hit = E("rect", { x: L, y: T, width: W - L - R, height: Hh - T - B, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", ev => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width;
      const i = Math.max(0, Math.min(n - 1, Math.round((px - L) / (W - L - R) * (n - 1))));
      hair.setAttribute("x1", x(i)); hair.setAttribute("x2", x(i)); hair.setAttribute("opacity", 0.5);
      dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(s0.v[i])); dot.setAttribute("opacity", 1);
      tip.textContent = ""; H("div", null, dlabel(dates[i]) + ", 2026", tip);
      for (const s of series) { const row = H("div", null, null, tip); H("b", null, fmt(s.v[i]) + " ", row); row.appendChild(document.createTextNode(s.label)); }
      tip.hidden = false; tip.style.left = Math.min(ev.clientX + 14, innerWidth - 270) + "px"; tip.style.top = ev.clientY + 14 + "px";
    });
    hit.addEventListener("pointerleave", () => { tip.hidden = true; hair.setAttribute("opacity", 0); dot.setAttribute("opacity", 0); });
  }

  function bars(P) {
    const box = document.getElementById("dash-bars"); box.textContent = "";
    const W = 760, Hh = 220, L = 54, R = 16, T = 12, B = 30;
    const vals = P.map(p => p.pnl), mx = Math.max(0, ...vals), mn = Math.min(0, ...vals), span = (mx - mn) || 1;
    const y = v => T + (mx - v) / span * (Hh - T - B), n = P.length, bw = (W - L - R) / n, gap = Math.min(2, bw * 0.2);
    const svg = E("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Profit and loss per period" }, box);
    const step = niceStep(span / 4);
    for (let t = Math.ceil(mn / step) * step; t <= mx; t += step) {
      E("line", { x1: L, x2: W - R, y1: y(t), y2: y(t), class: Math.abs(t) < 1e-9 ? "axis" : "grid" }, svg);
      E("text", { x: L - 8, y: y(t) + 4, "text-anchor": "end" }, svg).textContent = Math.abs(t) < 1e-9 ? "0" : fmt(t).replace(".00", "");
    }
    P.forEach((p, i) => {
      const y0 = y(0), y1 = y(p.pnl), h = Math.max(1, Math.abs(y1 - y0));
      const r = E("rect", { x: L + i * bw + gap / 2, y: Math.min(y0, y1), width: Math.max(1, bw - gap), height: h, rx: Math.min(2, bw / 4), fill: p.pnl >= 0 ? "var(--win)" : "var(--loss)" }, svg);
      const hb = E("rect", { x: L + i * bw, y: T, width: bw, height: Hh - T - B, fill: "transparent" }, svg);
      hb.addEventListener("pointermove", ev => {
        r.setAttribute("opacity", 0.75); tip.textContent = "";
        H("div", null, p.label, tip); const row = H("div", null, null, tip); H("b", null, fmt(p.pnl) + " " + D.unit, row);
        H("div", null, pct(p.stake ? p.pnl / p.stake : 0) + " return · " + p.wins + " wins, " + p.losses + " losses", tip);
        tip.hidden = false; tip.style.left = Math.min(ev.clientX + 14, innerWidth - 270) + "px"; tip.style.top = ev.clientY + 14 + "px";
      });
      hb.addEventListener("pointerleave", () => { r.setAttribute("opacity", 1); tip.hidden = true; });
    });
    const ticks = Math.min(6, n);
    for (let i = 0; i < ticks; i++) { const idx = Math.round(i * (n - 1) / Math.max(1, ticks - 1)); const lbl = P[idx].label.replace("Week of ", ""); E("text", { x: L + idx * bw + bw / 2, y: Hh - 8, "text-anchor": "middle" }, svg).textContent = lbl; }
  }

  function table(P) {
    const t = document.getElementById("dash-table"); t.textContent = "";
    const head = H("thead", null, null, t), hr = H("tr", null, null, head);
    for (const [h, n] of [["Period", 0], ["Trades", 1], ["Wins", 1], ["Losses", 1], ["Hit rate", 1], ["P&L, " + D.unit, 1], ["Return", 1]]) H("th", n ? "n" : "", h, hr);
    const tb = H("tbody", null, null, t);
    for (const p of [...P].reverse()) {
      const tr = H("tr", null, null, tb), dec = p.wins + p.losses;
      H("td", null, p.label, tr); H("td", "n", String(dec + p.abstain), tr); H("td", "n", String(p.wins), tr); H("td", "n", String(p.losses), tr);
      H("td", "n", dec ? (100 * p.wins / dec).toFixed(1) + "%" : "–", tr);
      H("td", "n " + cls(p.pnl), fmt(p.pnl), tr); H("td", "n " + cls(p.pnl), pct(p.stake ? p.pnl / p.stake : 0), tr);
    }
  }

  function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
})();
