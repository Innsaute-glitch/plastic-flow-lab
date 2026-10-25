// Minimal pub/sub store. set() shallow-merges; subscribers fire synchronously.
export function createStore(initialState) {
  let state = initialState;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      const prev = state;
      state = { ...state, ...patch };
      for (const fn of [...subs]) {
        try {
          fn(state, prev);
        } catch (err) {
          console.error('[app] subscriber failed:', err);
        }
      }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
