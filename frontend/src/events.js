const listeners = {}

export function subscribe(event, callback) {
  if (!listeners[event]) listeners[event] = []
  listeners[event].push(callback)
  return () => {
    listeners[event] = listeners[event].filter(cb => cb !== callback)
  }
}

export function emit(event, payload) {
  if (listeners[event]) {
    for (const callback of listeners[event]) {
      callback(payload)
    }
  }
}
