export const IDLE_WARNING_MS = 60 * 1000;
const ACTIVITY_INTERVAL_MS = 60 * 1000;

export function getSessionId(session) {
  try {
    const part = session?.access_token?.split('.')[1];
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof claims.session_id === 'string' ? claims.session_id : null;
  } catch { return null; }
}

// All deadlines come from the server. Local timers only control presentation;
// neither changing the browser clock nor forging storage events grants access.
export function createIdleSession({ client, onChange, onExpire, onActivityRecorded = () => {}, now = Date.now }) {
  let disposed = false;
  let expired = false;
  let deadline = 0;
  let lastTouch = -Infinity;
  let lastCheck = -Infinity;
  let pendingActivity = false;
  let lastInteraction = -Infinity;
  let request = null;
  let snapshot = { status: 'checking', hasAccess: false, seconds: 0 };

  function emit(status, seconds = 0) {
    const hasAccess = status === 'active' || status === 'warning' || (status === 'checking' && snapshot.hasAccess);
    if (snapshot.status === status && snapshot.hasAccess === hasAccess && snapshot.seconds === seconds) return;
    snapshot = { status, hasAccess, seconds };
    if (!disposed) onChange(snapshot);
  }
  function expire(status = 'expired') {
    if (disposed || expired) return;
    expired = true;
    emit(status);
    void onExpire();
  }
  function present() {
    const remaining = deadline - now();
    if (remaining <= 0) return false;
    emit(remaining <= IDLE_WARNING_MS ? 'warning' : 'active',
      remaining <= IDLE_WARNING_MS ? Math.ceil(remaining / 1000) : 0);
    return true;
  }
  async function call(name) {
    const { data, error } = await client.schema('app').rpc(name);
    if (error) throw error;
    return data;
  }
  function sync(touch = false, block = false) {
    if (disposed || expired) return Promise.resolve();
    if (touch) pendingActivity = true;
    if (block) emit('checking');
    if (request) return request;
    lastCheck = now();
    const touching = touch;
    if (touching) { pendingActivity = false; lastTouch = now(); }
    request = (async () => {
      try {
        let data = await call(touching ? 'touch_session' : 'session_status');
        if (disposed || expired) return;
        // Bootstrap only a new server-confirmed Auth session, never an expired one.
        if (data?.state === 'new') {
          data = await call('touch_session');
          lastTouch = now();
        }
        if (disposed || expired) return;
        if (data?.state === 'expired') { expire(); return; }
        const remaining = Date.parse(data?.expires_at) - Date.parse(data?.server_time);
        if (data?.state !== 'active' || !Number.isFinite(remaining)) {
          throw new Error('Invalid session status');
        }
        if (remaining <= 0) { expire(); return; }
        deadline = now() + remaining;
        present();
        if (touching) onActivityRecorded();
      } catch {
        if (!disposed && !expired) expire('error');
      } finally { request = null; }
    })();
    return request;
  }
  return {
    start: () => sync(false, true),
    check: (block = true) => sync(false, block),
    activity() {
      if (disposed || expired || !snapshot.hasAccess) return;
      pendingActivity = true;
      lastInteraction = now();
      if (now() - lastTouch >= ACTIVITY_INTERVAL_MS || deadline - now() <= IDLE_WARNING_MS + ACTIVITY_INTERVAL_MS) {
        void sync(true);
      }
    },
    stay() { lastInteraction = now(); return sync(true); },
    tick() {
      if (disposed || expired || request) return;
      // A suspended tab must not send an old queued interaction on wake.
      if (now() - lastInteraction > ACTIVITY_INTERVAL_MS) pendingActivity = false;
      if (pendingActivity && snapshot.hasAccess && now() - lastTouch >= ACTIVITY_INTERVAL_MS) {
        void sync(true);
      } else if (snapshot.hasAccess && !present()) {
        // Another tab may have extended the deadline. Hide data while checking.
        void sync(false, true);
      } else if (now() - lastCheck >= ACTIVITY_INTERVAL_MS) {
        void sync();
      }
    },
    stop() { disposed = true; },
  };
}
