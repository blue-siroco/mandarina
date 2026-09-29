// Imitación de los Presupuestos (AC-76 a AC-81) en memoria. Sigue las reglas de
// `backend/src/application/manage-budgets.ts` y `backend/src/domain/budget.ts` sobre
// el gasto sintético del mock (no hay Transcripts): los importes son de céntimos, así
// que para ver un aviso basta con crear un Presupuesto de unos centavos.
import { randomUUID } from 'node:crypto';

const SCOPES = ['session', 'project_day', 'global_day'];
const RANK = { within: 0, near: 1, exceeded: 2 };
const SUBJECTS_LIMIT = 20;

export function normalizeBudget(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { error: 'El Presupuesto debe ser un objeto' };
  if (!SCOPES.includes(input.scope)) return { error: `El ámbito debe ser uno de: ${SCOPES.join(', ')}` };
  const project = typeof input.project === 'string' && input.project.trim() ? input.project.trim() : null;
  if (input.scope === 'project_day' && project === null) return { error: 'Un Presupuesto por Proyecto y día necesita un Proyecto' };
  if (input.scope === 'global_day' && project !== null) return { error: 'Un Presupuesto global del día no lleva Proyecto' };
  const limit = input.limit_usd;
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return { error: 'El límite debe ser un número mayor que 0' };
  const warn = input.warn_ratio === undefined ? 0.8 : input.warn_ratio;
  if (typeof warn !== 'number' || !Number.isFinite(warn) || warn <= 0 || warn > 1) return { error: 'El umbral de aviso debe ser mayor que 0 y como mucho 1' };
  const action = input.action === undefined ? 'stop' : input.action;
  if (action !== 'warn' && action !== 'stop') return { error: 'La acción debe ser warn o stop' };
  const enabled = input.enabled === undefined ? true : input.enabled;
  if (typeof enabled !== 'boolean') return { error: 'El campo activo debe ser verdadero o falso' };
  return { value: { scope: input.scope, project, limit_usd: limit, warn_ratio: warn, action, enabled } };
}

const stateOf = (spent, limit, warn) => (spent > limit ? 'exceeded' : spent >= warn * limit ? 'near' : 'within');
const money = (usd) => `~$${usd.toFixed(2).replace('.', ',')}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
const round = (usd) => Math.round(usd * 1e6) / 1e6;

function reasonOf(budget, spent) {
  const label = budget.scope === 'session' ? 'Presupuesto por Sesión' : budget.scope === 'project_day' ? `Presupuesto de ${budget.project} del día` : 'Presupuesto global del día';
  return `${label} superado: ${money(spent)} de ${money(budget.limit_usd)}. Amplía el límite o permite seguir en Mandarina (/presupuestos).`;
}

/**
 * @param {(model: string, usage: object) => number | null} costOf
 * @param {(event: object) => object} usageOf
 */
export function createBudgetBook(costOf, usageOf, subagentModel) {
  const budgets = [];
  let allowances = [];
  const watched = new Map();

  /** Gasto sintético de cada Sesión con actividad hoy. */
  function spending(events, now) {
    const dayStart = startOfDay(now).toISOString();
    const sessions = new Map();
    for (const e of events) {
      const s = sessions.get(e.session_id) ?? { session_id: e.session_id, project: e.project, model: 'claude-opus-5-5', lifetime_usd: 0, today_usd: 0, active: false };
      s.project = e.project;
      if (e.event_type === 'session.started' && typeof e.payload?.model === 'string') s.model = e.payload.model;
      if (e.received_at >= dayStart) s.active = true;
      if (e.event_type === 'tool.post' || e.event_type === 'turn.ended') {
        const usd = costOf(e.subagent_id ? subagentModel : s.model, usageOf(e)) ?? 0;
        s.lifetime_usd += usd;
        if (e.received_at >= dayStart) s.today_usd += usd;
      }
      sessions.set(e.session_id, s);
    }
    return [...sessions.values()].filter((s) => s.active);
  }

  const vigentes = (now) => allowances.filter((a) => a.until === null || Date.parse(a.until) > now.getTime());

  function describe(budget, sessions, now) {
    const mine = vigentes(now).filter((a) => a.budget_id === budget.id);
    const subject = (fields) => ({
      session_id: fields.session_id,
      project: fields.project,
      spent_usd: round(fields.spent),
      ratio: fields.spent / budget.limit_usd,
      state: stateOf(fields.spent, budget.limit_usd, budget.warn_ratio),
      allowed: fields.allowed,
    });
    let subjects;
    let tracked = 0;
    if (budget.scope === 'session') {
      const own = sessions.filter((s) => budget.project === null || s.project === budget.project);
      tracked = own.length;
      subjects = own
        .map((s) => subject({ session_id: s.session_id, project: s.project, spent: s.lifetime_usd, allowed: mine.some((a) => a.session_id === s.session_id || (a.project && a.project === s.project)) }))
        .filter((s) => s.state !== 'within')
        .sort((a, b) => b.ratio - a.ratio)
        .slice(0, SUBJECTS_LIMIT);
    } else if (budget.scope === 'project_day') {
      const spent = sessions.filter((s) => s.project === budget.project).reduce((n, s) => n + s.today_usd, 0);
      subjects = [subject({ session_id: null, project: budget.project, spent, allowed: mine.some((a) => a.project === budget.project) })];
    } else {
      subjects = [subject({ session_id: null, project: null, spent: sessions.reduce((n, s) => n + s.today_usd, 0), allowed: false })];
    }
    const worst = subjects.reduce((best, s) => (!best || RANK[s.state] > RANK[best.state] || (RANK[s.state] === RANK[best.state] && s.ratio > best.ratio) ? s : best), undefined);
    return { ...budget, state: worst?.state ?? 'within', spent_usd: worst?.spent_usd ?? 0, subjects, sessions_tracked: tracked, allowances: mine };
  }

  const list = (events, now = new Date()) => {
    const sessions = spending(events, now);
    return { items: budgets.map((b) => describe(b, sessions, now)), generated_at: now.toISOString() };
  };

  return {
    hasBudgets: () => budgets.length > 0,
    list,

    create(events, body, now = new Date()) {
      const parsed = normalizeBudget(body);
      if (parsed.error) return { status: 400, body: { message: parsed.error } };
      const record = { id: randomUUID(), ...parsed.value, created_at: now.toISOString(), updated_at: now.toISOString() };
      budgets.push(record);
      return { status: 201, body: describe(record, spending(events, now), now) };
    },

    update(events, id, body, now = new Date()) {
      const at = budgets.findIndex((b) => b.id === id);
      if (at === -1) return { status: 404, body: { message: `No existe el Presupuesto ${id}` } };
      const parsed = normalizeBudget(body);
      if (parsed.error) return { status: 400, body: { message: parsed.error } };
      if (parsed.value.scope !== budgets[at].scope || parsed.value.project !== budgets[at].project) allowances = allowances.filter((a) => a.budget_id !== id);
      budgets[at] = { ...budgets[at], ...parsed.value, updated_at: now.toISOString() };
      return { status: 200, body: describe(budgets[at], spending(events, now), now) };
    },

    remove(id) {
      const at = budgets.findIndex((b) => b.id === id);
      if (at === -1) return false;
      budgets.splice(at, 1);
      allowances = allowances.filter((a) => a.budget_id !== id);
      return true;
    },

    addAllowance(id, body, now = new Date()) {
      const budget = budgets.find((b) => b.id === id);
      if (!budget) return { status: 404, body: { message: `No existe el Presupuesto ${id}` } };
      const session = typeof body?.session_id === 'string' && body.session_id ? body.session_id : null;
      const project = typeof body?.project === 'string' && body.project ? body.project : null;
      if ((session === null) === (project === null)) return { status: 400, body: { message: 'Indica una Sesión o un Proyecto, no ambos ni ninguno' } };
      if (session !== null && budget.scope !== 'session') return { status: 400, body: { message: 'Una excepción de Sesión solo aplica a un Presupuesto por Sesión' } };
      if (project !== null && budget.project !== null && budget.project !== project) return { status: 400, body: { message: 'El Proyecto de la excepción no es el del Presupuesto' } };
      const record = { id: randomUUID(), budget_id: id, session_id: session, project, until: session !== null ? null : endOfDay(now).toISOString(), created_at: now.toISOString() };
      allowances.push(record);
      return { status: 201, body: record };
    },

    removeAllowance(id, allowanceId) {
      const before = allowances.length;
      allowances = allowances.filter((a) => !(a.budget_id === id && a.id === allowanceId));
      return allowances.length < before;
    },

    status(events, sessionId, project, now = new Date()) {
      const sessions = spending(events, now);
      const mine = vigentes(now);
      let worst;
      for (const budget of budgets.filter((b) => b.enabled && b.action === 'stop')) {
        const own = mine.filter((a) => a.budget_id === budget.id);
        let spent;
        if (budget.scope === 'session') {
          if (budget.project !== null && budget.project !== project) continue;
          if (own.some((a) => a.session_id === sessionId || a.project === project)) continue;
          spent = sessions.find((s) => s.session_id === sessionId)?.lifetime_usd ?? 0;
        } else if (budget.scope === 'project_day') {
          if (budget.project !== project || own.some((a) => a.project === project)) continue;
          spent = sessions.filter((s) => s.project === project).reduce((n, s) => n + s.today_usd, 0);
        } else {
          if (own.some((a) => a.project === project)) continue;
          spent = sessions.reduce((n, s) => n + s.today_usd, 0);
        }
        if (spent > budget.limit_usd && (!worst || spent / budget.limit_usd > worst.spent / worst.budget.limit_usd)) worst = { budget, spent };
      }
      const stop = worst
        ? { budget_id: worst.budget.id, scope: worst.budget.scope, reason: reasonOf(worst.budget, round(worst.spent)), spent_usd: round(worst.spent), limit_usd: worst.budget.limit_usd }
        : null;
      return { stop, checked_at: now.toISOString() };
    },

    /** Mensajes `budget.state` de las transiciones desde la última revisión (AC-81). */
    transitions(events, now = new Date()) {
      const current = new Map();
      for (const b of list(events, now).items.filter((x) => x.enabled)) {
        for (const s of b.subjects) {
          current.set(`${b.id}|${s.session_id ?? ''}|${s.project ?? ''}`, {
            state: s.allowed ? 'within' : s.state,
            message: { type: 'budget.state', budget_id: b.id, scope: b.scope, project: s.project ?? b.project, session_id: s.session_id, action: b.action, spent_usd: s.spent_usd, limit_usd: b.limit_usd },
          });
        }
      }
      const messages = [];
      for (const [key, previous] of watched) {
        if (!current.has(key) && previous.state !== 'within') messages.push({ ...previous.message, state: 'within', previous_state: previous.state });
      }
      for (const [key, now2] of current) {
        const before = watched.get(key)?.state ?? 'within';
        if (now2.state !== before) messages.push({ ...now2.message, state: now2.state, previous_state: before });
      }
      watched.clear();
      for (const [key, value] of current) if (value.state !== 'within') watched.set(key, value);
      return messages;
    },
  };
}
