// Порядок об'їзду заявок. Чиста детермінована функція без I/O.
//
// Правило (див. CLAUDE.md → «Порядок об'їзду»):
//   фаза 1 — заявки пріоритету 1; ремонт у радіусі nearbyRadiusM від підключення робиться одразу після нього;
//   фаза 2 — решта, починаючи з точки, де закінчилась фаза 1.
// Усередині фази мінімізуємо: метри за кермом + м'який штраф за відхилення від часу візиту.

import { haversineM } from "./geo.js";

export const ROUTE_DEFAULTS = {
  serviceMin: 40,
  nearbyRadiusM: 300,
  timeSlackMin: 60,
  // 1 хв відхилення понад timeSlackMin «коштує» стільки ж, скільки 20 м дороги
  timePenaltyMPerMin: 20,
  // обмеження CPU (Workers Free — 10 мс): ліміт «кроків» (точка × оцінка) на один локальний пошук
  // (40 точок ≈ 5 мс на сучасному CPU, 20 точок < 1 мс)
  maxWork: 100_000,
};

const ROAD_FACTOR = 1.3;
const CITY_SPEED_MPS = 30 / 3.6;
const EPS = 1e-6;

/** Матриця «по прямій × 1.3» при 30 км/год — запасний варіант, коли сервіс карт недоступний. */
export function approxMatrix(points) {
  const n = points.length;
  const dist = Array.from({ length: n }, () => new Array(n).fill(0));
  const dur = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      dist[i][j] = haversineM(points[i], points[j]) * ROAD_FACTOR;
      dur[i][j] = dist[i][j] / CITY_SPEED_MPS;
    }
  }
  return { dist, dur };
}

/**
 * @param {object} input
 * @param {{lat:number, lon:number}} input.start
 * @param {{id:number, priority:number, lat:number, lon:number, visitMin:number|null}[]} input.stops
 * @param {number} input.departMin час виїзду, хвилини від півночі
 * @param {{dist:number[][], dur:number[][]}} [input.matrix] індекс 0 — старт, i — stops[i-1]; метри / секунди
 * @param {Partial<typeof ROUTE_DEFAULTS>} [input.options]
 */
export function planRoute({ start, stops, departMin, matrix, options = {} }) {
  const o = { ...ROUTE_DEFAULTS, ...options };
  const points = [start, ...stops];
  const m = matrix ?? approxMatrix(points);
  const ctx = { m, stops, o };

  const high = [];
  const low = [];
  stops.forEach((s, i) => (s.priority <= 1 ? high : low).push(i + 1));

  const attached = new Map(high.map((h) => [h, []]));
  const rest = [];
  for (const l of low) {
    let best = -1;
    let bestD = Infinity;
    for (const h of high) {
      const d = haversineM(points[l], points[h]);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    if (best !== -1 && bestD <= o.nearbyRadiusM) attached.get(best).push(l);
    else rest.push(l);
  }
  const nearby = new Set([...attached.values()].flat());

  const phase1 = solvePhase(
    high.map((h) => clusterUnit(h, attached.get(h), m)),
    { pos: 0, t: departMin },
    ctx,
  );
  const phase2 = solvePhase(
    rest.map((l) => [l]),
    phase1.end,
    ctx,
  );

  return describe([...phase1.nodes, ...phase2.nodes], departMin, nearby, ctx);
}

/** Підключення + прив'язані ремонти поруч (найближчий сусід від підключення). */
function clusterUnit(head, members, m) {
  const unit = [head];
  const left = [...members];
  while (left.length) {
    const last = unit[unit.length - 1];
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (m.dist[last][left[i]] < m.dist[last][left[bi]]) bi = i;
    unit.push(left.splice(bi, 1)[0]);
  }
  return unit;
}

function solvePhase(units, state, ctx) {
  if (units.length === 0) return { nodes: [], end: state };

  const evalOrder = (order, bound = Infinity) => {
    const { m, stops, o } = ctx;
    let pos = state.pos;
    let t = state.t;
    let cost = 0;
    for (let i = 0; i < order.length; i++) {
      const unit = units[order[i]];
      for (let j = 0; j < unit.length; j++) {
        const node = unit[j];
        cost += m.dist[pos][node];
        t += m.dur[pos][node] / 60;
        const visit = stops[node - 1].visitMin;
        if (visit != null) {
          const off = Math.abs(t - visit) - o.timeSlackMin;
          if (off > 0) cost += off * o.timePenaltyMPerMin;
        }
        t += o.serviceMin;
        pos = node;
      }
      if (cost >= bound) return Infinity;
    }
    return cost;
  };

  let best = null;
  for (const initial of [nearestNeighbour(units, state.pos, ctx.m), byVisitTime(units, ctx.stops)]) {
    const r = localSearch(initial, evalOrder, Math.ceil(ctx.o.maxWork / units.length));
    if (!best || r.cost < best.cost - EPS) best = r;
  }

  const nodes = best.order.flatMap((u) => units[u]);
  return { nodes, end: simulate(nodes, state, ctx).end };
}

function nearestNeighbour(units, fromPos, m) {
  const left = units.map((_, i) => i);
  const order = [];
  let pos = fromPos;
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (m.dist[pos][units[left[i]][0]] < m.dist[pos][units[left[bi]][0]]) bi = i;
    const u = left.splice(bi, 1)[0];
    order.push(u);
    pos = units[u][units[u].length - 1];
  }
  return order;
}

function byVisitTime(units, stops) {
  const key = (u) => Math.min(...units[u].map((n) => stops[n - 1].visitMin ?? Infinity));
  return units.map((_, i) => i).sort((a, b) => key(a) - key(b) || a - b);
}

/** 2-opt + Or-opt (сегменти 1–3): покращення застосовується одразу, перебір триває далі. */
function localSearch(initial, evalOrder, maxEvals) {
  let order = initial.slice();
  let best = evalOrder(order);
  const k = order.length;
  const cand = new Array(k);
  let evals = 1;

  const tryCandidate = () => {
    evals++;
    const c = evalOrder(cand, best - EPS);
    if (c < best - EPS) {
      best = c;
      order = cand.slice();
      return true;
    }
    return false;
  };

  let improved = true;
  while (improved && evals < maxEvals) {
    improved = false;

    for (let i = 0; i < k - 1 && evals < maxEvals; i++) {
      for (let j = i + 1; j < k && evals < maxEvals; j++) {
        for (let p = 0; p < k; p++) cand[p] = p < i || p > j ? order[p] : order[i + j - p];
        if (tryCandidate()) improved = true;
      }
    }

    for (let len = 1; len <= Math.min(3, k - 1); len++) {
      for (let i = 0; i + len <= k && evals < maxEvals; i++) {
        for (let j = 0; j <= k - len && evals < maxEvals; j++) {
          if (j === i) continue;
          let c = 0;
          for (let p = 0; p < j; p++) cand[c++] = order[p < i ? p : p + len];
          for (let p = 0; p < len; p++) cand[c++] = order[i + p];
          for (let p = j; p < k - len; p++) cand[c++] = order[p < i ? p : p + len];
          if (tryCandidate()) improved = true;
        }
      }
    }
  }
  return { order, cost: best };
}

function simulate(nodes, state, ctx) {
  const { m, o } = ctx;
  let pos = state.pos;
  let t = state.t;
  const legs = [];
  for (const node of nodes) {
    const distM = m.dist[pos][node];
    const durS = m.dur[pos][node];
    t += durS / 60;
    legs.push({ node, etaMin: t, distM, durS });
    t += o.serviceMin;
    pos = node;
  }
  return { legs, end: { pos, t } };
}

function describe(nodes, departMin, nearby, ctx) {
  const { legs, end } = simulate(nodes, { pos: 0, t: departMin }, ctx);
  return {
    legs: legs.map((l) => ({
      id: ctx.stops[l.node - 1].id,
      etaMin: l.etaMin,
      distM: l.distM,
      durS: l.durS,
      nearby: nearby.has(l.node),
    })),
    totalDistM: legs.reduce((s, l) => s + l.distM, 0),
    totalDriveS: legs.reduce((s, l) => s + l.durS, 0),
    endMin: end.t,
  };
}
