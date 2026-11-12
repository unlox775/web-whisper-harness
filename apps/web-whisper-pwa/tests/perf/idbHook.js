/**
 * Playwright addInitScript: mark the page as a perf-harness run before modules
 * evaluate, so perfIdbProbe.ts wraps IndexedDB ahead of session-store init.
 */
window.__wwPerfHarness = true;
try {
  new PerformanceObserver((list) => {
    const w = window;
    w.__wwLongTasks = w.__wwLongTasks || [];
    for (const entry of list.getEntries()) {
      w.__wwLongTasks.push({
        duration: entry.duration,
        startTime: entry.startTime,
        name: entry.name,
      });
    }
  }).observe({ type: 'longtask', buffered: true });
} catch {
  window.__wwLongTasks = [];
}
