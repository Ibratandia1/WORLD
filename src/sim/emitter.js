// Mini système d'événements, sans dépendance (la simulation doit pouvoir tourner hors navigateur).
export class Emitter {
  constructor() { this._handlers = {}; }
  on(name, fn) { (this._handlers[name] ||= []).push(fn); return this; }
  off(name, fn) { this._handlers[name] = (this._handlers[name] || []).filter(f => f !== fn); return this; }
  emit(name, data) { (this._handlers[name] || []).slice().forEach(fn => fn(data)); }
}
