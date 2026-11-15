import { approxMatrix } from "../domain/optimizer.js";
import { ORS_MATRIX_MAX_POINTS, orsMatrix } from "./ors.js";

/**
 * Матриця відстаней для авто. Якщо ORS недоступний — оцінка «по прямій».
 * @returns {Promise<{ matrix: {dist:number[][], dur:number[][]}, source: 'ors'|'approx' }>}
 */
export async function getMatrix(env, points) {
  const approx = approxMatrix(points);
  if (env.ORS_API_KEY && points.length <= ORS_MATRIX_MAX_POINTS) {
    try {
      const m = await orsMatrix(env.ORS_API_KEY, points);
      // null — ORS не знайшов дорогу між точками; підставляємо оцінку
      const fill = (rows, fallback) => rows.map((row, i) => row.map((v, j) => (Number.isFinite(v) ? v : fallback[i][j])));
      return { matrix: { dist: fill(m.dist, approx.dist), dur: fill(m.dur, approx.dur) }, source: "ors" };
    } catch (err) {
      console.warn(`ORS matrix failed: ${err.message}`);
    }
  }
  return { matrix: approx, source: "approx" };
}
