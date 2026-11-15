import { describe, expect, it } from "vitest";
import { approxMatrix, planRoute } from "../src/domain/optimizer.js";

// ~1 км на схід = 0.0145° довготи на широті Шостки
const START = { lat: 51.8667, lon: 33.4833 };
const east = (km, northKm = 0) => ({ lat: START.lat + northKm * 0.009, lon: START.lon + km * 0.0145 });
const stop = (id, priority, point, visitMin = null) => ({ id, priority, ...point, visitMin });

const ids = (plan) => plan.legs.map((l) => l.id);

describe("planRoute", () => {
  it("порожній список", () => {
    expect(planRoute({ start: START, stops: [], departMin: 510 })).toMatchObject({ legs: [], totalDistM: 0 });
  });

  it("точки на одній лінії обходить по порядку від старту", () => {
    const stops = [stop(3, 1, east(3)), stop(1, 1, east(1)), stop(4, 1, east(4)), stop(2, 1, east(2))];
    expect(ids(planRoute({ start: START, stops, departMin: 510 }))).toEqual([1, 2, 3, 4]);
  });

  it("усі підключення раніше за далекі ремонти", () => {
    const stops = [
      stop(10, 2, east(0.5)), // ремонт поруч зі стартом
      stop(1, 1, east(3)),
      stop(2, 1, east(4)),
      stop(11, 2, east(1)),
    ];
    const order = ids(planRoute({ start: START, stops, departMin: 510 }));
    expect(order.slice(0, 2).sort()).toEqual([1, 2]);
    expect(order.slice(2).sort()).toEqual([10, 11]);
  });

  it("ремонт поруч із підключенням робиться одразу після нього", () => {
    const stops = [
      stop(1, 1, east(2)),
      stop(2, 1, east(5)),
      stop(10, 2, east(2.15)), // 150 м від підключення 1
      stop(11, 2, east(1)),
    ];
    const plan = planRoute({ start: START, stops, departMin: 510 });
    expect(ids(plan)).toEqual([1, 10, 2, 11]);
    expect(plan.legs.find((l) => l.id === 10).nearby).toBe(true);
    expect(plan.legs.find((l) => l.id === 11).nearby).toBe(false);
  });

  it("радіус 0 вимикає кластери", () => {
    const stops = [stop(1, 1, east(2)), stop(2, 1, east(5)), stop(10, 2, east(2.15))];
    const plan = planRoute({ start: START, stops, departMin: 510, options: { nearbyRadiusM: 0 } });
    expect(ids(plan)).toEqual([1, 2, 10]);
  });

  it("час візиту впливає на порядок при великому відхиленні", () => {
    // дві точки на однаковій відстані в різні боки; дальня за часом — пізніше
    const stops = [stop(1, 1, east(1), 16 * 60), stop(2, 1, east(-1), 9 * 60)];
    expect(ids(planRoute({ start: START, stops, departMin: 510 }))).toEqual([2, 1]);
  });

  it("малі розбіжності в часі не ламають короткий маршрут", () => {
    const stops = [stop(1, 1, east(1), 9 * 60 + 30), stop(2, 1, east(2), 9 * 60)];
    expect(ids(planRoute({ start: START, stops, departMin: 510 }))).toEqual([1, 2]);
  });

  it("ETA враховує дорогу і 40 хв роботи", () => {
    const stops = [stop(1, 1, east(1)), stop(2, 1, east(2))];
    const plan = planRoute({ start: START, stops, departMin: 600 });
    const [a, b] = plan.legs;
    expect(a.etaMin).toBeCloseTo(600 + a.durS / 60, 6);
    expect(b.etaMin).toBeCloseTo(a.etaMin + 40 + b.durS / 60, 6);
    expect(plan.totalDistM).toBeCloseTo(a.distM + b.distM, 6);
  });

  it("не гірший за найближчого сусіда і детермінований на випадкових даних", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const stops = Array.from({ length: 30 }, (_, i) => stop(i + 1, rnd() < 0.4 ? 1 : 2, east(rnd() * 8 - 4, rnd() * 6 - 3)));
    const options = { nearbyRadiusM: 0, timeSlackMin: 1e9 };

    const plan = planRoute({ start: START, stops, departMin: 510, options });
    expect(ids(planRoute({ start: START, stops, departMin: 510, options }))).toEqual(ids(plan));

    const byId = new Map(stops.map((s) => [s.id, s]));
    const firstLow = plan.legs.findIndex((l) => byId.get(l.id).priority === 2);
    expect(plan.legs.slice(firstLow).every((l) => byId.get(l.id).priority === 2)).toBe(true);

    // кожна фаза не гірша за жадібний обхід з тієї ж точки старту
    const m = approxMatrix([START, ...stops]);
    const nodeOf = (id) => stops.findIndex((s) => s.id === id) + 1;
    const greedy = (from, nodes) => {
      const left = [...nodes];
      let pos = from;
      let total = 0;
      while (left.length) {
        left.sort((a, b) => m.dist[pos][a] - m.dist[pos][b]);
        const n = left.shift();
        total += m.dist[pos][n];
        pos = n;
      }
      return total;
    };
    const phase1 = plan.legs.slice(0, firstLow);
    const phase2 = plan.legs.slice(firstLow);
    const sum = (legs) => legs.reduce((s, l) => s + l.distM, 0);
    expect(sum(phase1)).toBeLessThanOrEqual(greedy(0, phase1.map((l) => nodeOf(l.id))) + 1e-6);
    expect(sum(phase2)).toBeLessThanOrEqual(greedy(nodeOf(phase1.at(-1).id), phase2.map((l) => nodeOf(l.id))) + 1e-6);
  });

  it("використовує передану матрицю", () => {
    const stops = [stop(1, 1, east(1)), stop(2, 1, east(2))];
    // «дорога» до другої точки коротша, ніж до першої
    const matrix = {
      dist: [[0, 5000, 1000], [5000, 0, 1000], [1000, 1000, 0]],
      dur: [[0, 600, 120], [600, 0, 120], [120, 120, 0]],
    };
    expect(ids(planRoute({ start: START, stops, departMin: 510, matrix }))).toEqual([2, 1]);
  });
});
