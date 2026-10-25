// Truck routing: the truck starts and ends at the facility and visits the given stops.
// <= 8 stops: exact (depth-first search with pruning, lexicographic order, strict improvement => ties go to
// the earliest order). More: nearest-neighbour + 2-opt. Deterministic.
const EPS = 1e-9;

// pts[0] = facility, pts[1..] = stops (in scenario order). Returns indices of stops in visiting order (1-based into pts).
export function bestOrder(pts) {
  const n = pts.length - 1;
  if (n <= 0) return [];
  const d = pts.map((a) => pts.map((b) => Math.hypot(a.x - b.x, a.y - b.y)));
  return n <= 8 ? exact(d, n) : heuristic(d, n);
}

function exact(d, n) {
  let best = Infinity;
  let bestPath = [];
  const path = [];
  const used = new Array(n + 1).fill(false);
  function go(last, len) {
    if (len >= best - EPS) return;
    if (path.length === n) {
      const total = len + d[last][0];
      if (total < best - EPS) { best = total; bestPath = path.slice(); }
      return;
    }
    for (let i = 1; i <= n; i++) {
      if (used[i]) continue;
      used[i] = true; path.push(i);
      go(i, len + d[last][i]);
      path.pop(); used[i] = false;
    }
  }
  go(0, 0);
  return bestPath;
}

function heuristic(d, n) {
  const order = [];
  const used = new Array(n + 1).fill(false);
  let cur = 0;
  for (let k = 0; k < n; k++) {
    let pick = -1;
    for (let i = 1; i <= n; i++) if (!used[i] && (pick < 0 || d[cur][i] < d[cur][pick] - EPS)) pick = i;
    used[pick] = true; order.push(pick); cur = pick;
  }
  const tour = [0, ...order, 0];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < tour.length - 2; i++) {
      for (let j = i + 1; j < tour.length - 1; j++) {
        const delta = d[tour[i - 1]][tour[j]] + d[tour[i]][tour[j + 1]] - d[tour[i - 1]][tour[i]] - d[tour[j]][tour[j + 1]];
        if (delta < -EPS) {
          const seg = tour.slice(i, j + 1).reverse();
          tour.splice(i, j - i + 1, ...seg);
          improved = true;
        }
      }
    }
  }
  return tour.slice(1, -1);
}
