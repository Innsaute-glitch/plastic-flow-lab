// Pure time model for the animation. Maps wall-clock playback seconds (at 1x) to a
// continuous frame coordinate, with a short pause after each trip day for the truck.
// Reads timeline only; computes no outcomes.

const HOURS = 24;

export function buildSchedule(timeline, totalSeconds, opts = {}) {
  const pauseMax = opts.pauseMax ?? 1.1;
  const pauseShare = opts.pauseShare ?? 0.35;
  const frameCount = timeline.frameCount ?? timeline.frames.length;
  const days = Math.round(frameCount / HOURS);
  const tripByDay = new Map();
  (timeline.trips || []).forEach((tr, i) => {
    if (!tripByDay.has(tr.day)) tripByDay.set(tr.day, i);
  });
  const nTrips = tripByDay.size;
  const pause = nTrips ? Math.min(pauseMax, (pauseShare * totalSeconds) / nTrips) : 0;
  const hourSec = (totalSeconds - nTrips * pause) / (days * HOURS);
  const hoursDur = HOURS * hourSec;
  const start = new Array(days + 1);
  let acc = 0;
  for (let d = 0; d < days; d++) {
    start[d] = acc;
    acc += hoursDur + (tripByDay.has(d) ? pause : 0);
  }
  start[days] = acc;
  const total = acc;
  const lastX = frameCount - 1;

  function dayAt(s) {
    let lo = 0, hi = days - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (start[mid] <= s) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // -> { x (frame coord 0..frameCount-1), day, tripIdx (-1 if none), p (0..1 inside pause) }
  function posAt(s) {
    s = Math.max(0, Math.min(total, s));
    const d = dayAt(s);
    const tripIdx = tripByDay.has(d) ? tripByDay.get(d) : -1;
    const local = s - start[d];
    if (local < hoursDur || tripIdx < 0) {
      const u = Math.min(1, local / hoursDur);
      const x = d * HOURS + (tripIdx >= 0 ? u * (HOURS - 1) : u * HOURS);
      return { x: Math.min(x, lastX), day: d, tripIdx: -1, p: 0 };
    }
    return { x: d * HOURS + HOURS - 1, day: d, tripIdx, p: Math.min(1, (local - hoursDur) / pause) };
  }

  // seconds at which integer frame t is shown
  function secondsOfFrame(t) {
    t = Math.max(0, Math.min(lastX, Math.round(t)));
    const d = Math.floor(t / HOURS), h = t % HOURS;
    const hasTrip = tripByDay.has(d);
    return start[d] + hoursDur * (hasTrip ? h / (HOURS - 1) : h / HOURS);
  }

  return { total, days, pause, hourSec, frameCount, nTrips, posAt, secondsOfFrame, start, tripByDay };
}
