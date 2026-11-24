"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { STAGES, stageByKey } from "@/lib/stages";

/* ---------------- types & date helpers ---------------- */

interface Activity { _id: string; date: string; note: string; stage?: string }
interface LeadT {
  _id: string;
  name: string;
  business: string;
  phone: string;
  email: string;
  social: string;
  stage: string;
  hasSocialMedia: boolean | null;
  hasOrderProblem: boolean | null;
  wantsSocialManager: boolean;
  lastContactDate: string | null;
  nextAction: string;
  followUpDate: string | null;
  notes: string;
  activity: Activity[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dayPart = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const addDays = (s: string, n: number) => {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diffDays = (a: string, b: string) =>
  Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000);
const fmt = (s: string) =>
  s
    ? new Date(s + "T00:00:00Z").toLocaleDateString(undefined, {
        timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
      })
    : "—";
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type DueFilter = "all" | "overdue" | "today" | "week";

function dueInfo(lead: LeadT, today: string) {
  const closed = stageByKey(lead.stage).closed;
  const f = dayPart(lead.followUpDate);
  if (closed || !f) return { kind: "none" as const, label: closed ? "Closed" : "Not set" };
  const d = diffDays(f, today);
  if (d < 0) return { kind: "over" as const, label: `${-d}d overdue` };
  if (d === 0) return { kind: "today" as const, label: "Today" };
  if (d <= 7) return { kind: "soon" as const, label: `In ${d}d` };
  return { kind: "ok" as const, label: fmt(f) };
}

/* ---------------- theme ---------------- */

type Theme = "light" | "dark" | "night" | "system";

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      setTheme((localStorage.getItem("oh-theme") as Theme) || "system");
    } catch {}
  }, []);
  const apply = (t: Theme) => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("oh-theme", t); } catch {}
  };
  return (
    <div className="seg" role="group" aria-label="Theme">
      {(["light", "dark", "night", "system"] as Theme[]).map((t) => (
        <button key={t} aria-pressed={theme === t} onClick={() => apply(t)}>
          {t[0].toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );
}

/* ---------------- lead form modal ---------------- */

interface FormState {
  name: string; business: string; phone: string; email: string; social: string;
  stage: string; hasSocialMedia: "" | "yes" | "no"; hasOrderProblem: "" | "yes" | "no";
  wantsSocialManager: boolean; lastContactDate: string; nextAction: string;
  followUpDate: string; notes: string; logNote: string;
}

const triToForm = (v: boolean | null): "" | "yes" | "no" => (v === null ? "" : v ? "yes" : "no");
const formToTri = (v: string) => (v === "" ? null : v === "yes");

function emptyForm(): FormState {
  const s = stageByKey("prospect");
  return {
    name: "", business: "", phone: "", email: "", social: "", stage: s.key,
    hasSocialMedia: "", hasOrderProblem: "", wantsSocialManager: false,
    lastContactDate: "", nextAction: s.next, followUpDate: todayStr(), notes: "", logNote: "",
  };
}

function leadToForm(l: LeadT, log: boolean): FormState {
  const today = todayStr();
  return {
    name: l.name, business: l.business, phone: l.phone, email: l.email, social: l.social,
    stage: l.stage, hasSocialMedia: triToForm(l.hasSocialMedia), hasOrderProblem: triToForm(l.hasOrderProblem),
    wantsSocialManager: l.wantsSocialManager,
    lastContactDate: log ? today : dayPart(l.lastContactDate),
    nextAction: l.nextAction,
    followUpDate: log ? addDays(today, 3) : dayPart(l.followUpDate),
    notes: l.notes, logNote: "",
  };
}

function LeadModal({
  lead, log, onClose, onSave, onDelete,
}: {
  lead: LeadT | null;
  log: boolean;
  onClose: () => void;
  onSave: (f: FormState) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [f, setF] = useState<FormState>(() => (lead ? leadToForm(lead, log) : emptyForm()));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const changeStage = (key: string) => {
    const st = stageByKey(key);
    setF((p) => ({ ...p, stage: key, nextAction: st.closed ? "" : st.next, followUpDate: st.closed ? "" : p.followUpDate }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(f); } finally { setSaving(false); }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-modal="true">
        <header>
          <h2>{!lead ? "New lead" : log ? `Log contact: ${lead.name}` : `Edit: ${lead.name}`}</h2>
          <button type="button" className="btn sm" onClick={onClose}>Close</button>
        </header>
        <div className="body">
          {log && (
            <label className="full">
              What happened?
              <textarea rows={2} autoFocus value={f.logNote} onChange={(e) => set("logNote", e.target.value)}
                placeholder="e.g. Sent demo link, they will watch tonight" />
            </label>
          )}
          <label>Name *
            <input required value={f.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <label>Business
            <input value={f.business} onChange={(e) => set("business", e.target.value)} />
          </label>
          <label>Phone / Telegram
            <input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
          </label>
          <label>Email
            <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
          </label>
          <label className="full">Social media page / handle
            <input value={f.social} onChange={(e) => set("social", e.target.value)} />
          </label>
          <label className="full">Stage
            <select value={f.stage} onChange={(e) => changeStage(e.target.value)}>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label>Uses social media?
            <select value={f.hasSocialMedia} onChange={(e) => set("hasSocialMedia", e.target.value as FormState["hasSocialMedia"])}>
              <option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          </label>
          <label>Order collection is a problem?
            <select value={f.hasOrderProblem} onChange={(e) => set("hasOrderProblem", e.target.value as FormState["hasOrderProblem"])}>
              <option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          </label>
          <div className="full checks">
            <label>
              <input type="checkbox" checked={f.wantsSocialManager} onChange={(e) => set("wantsSocialManager", e.target.checked)} />
              Wants a social media manager (transfer to partner)
            </label>
          </div>
          <label>Last contact date
            <input type="date" value={f.lastContactDate} onChange={(e) => set("lastContactDate", e.target.value)} />
          </label>
          <label>Follow-up date
            <input type="date" value={f.followUpDate} onChange={(e) => set("followUpDate", e.target.value)} />
          </label>
          <label className="full">Next action
            <input value={f.nextAction} onChange={(e) => set("nextAction", e.target.value)} />
          </label>
          <label className="full">Notes
            <textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </label>
          {lead && lead.activity.length > 0 && (
            <div className="full">
              <div className="muted" style={{ marginBottom: 6 }}>Activity</div>
              <div className="log">
                {lead.activity.map((a) => (
                  <div key={a._id}>
                    <div className="when">{fmtTime(a.date)}{a.stage ? ` · ${stageByKey(a.stage).label}` : ""}</div>
                    {a.note || "(no note)"}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <footer>
          <button className="btn primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <span className="spacer" style={{ flex: 1 }} />
          {onDelete && (
            <button type="button" className="btn danger" onClick={onDelete}>Delete</button>
          )}
        </footer>
      </form>
    </div>
  );
}

/* ---------------- page ---------------- */

export default function Page() {
  const [leads, setLeads] = useState<LeadT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [due, setDue] = useState<DueFilter>("all");
  const [modal, setModal] = useState<{ lead: LeadT | null; log: boolean } | null>(null);
  const [today, setToday] = useState("");

  useEffect(() => setToday(todayStr()), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/leads", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setLeads(data);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const api = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  const save = async (f: FormState) => {
    const payload = {
      name: f.name, business: f.business, phone: f.phone, email: f.email, social: f.social,
      stage: f.stage,
      hasSocialMedia: formToTri(f.hasSocialMedia),
      hasOrderProblem: formToTri(f.hasOrderProblem),
      wantsSocialManager: f.wantsSocialManager,
      lastContactDate: f.lastContactDate || null,
      nextAction: f.nextAction,
      followUpDate: f.followUpDate || null,
      notes: f.notes,
    };
    try {
      if (!modal?.lead) {
        await api("/api/leads", "POST", payload);
      } else {
        const body: Record<string, unknown> = { ...payload };
        const stageChanged = modal.lead.stage !== f.stage;
        if (f.logNote.trim() || modal.log) {
          body.logNote = f.logNote.trim() || "Contacted";
        } else if (stageChanged) {
          body.logNote = `Moved to ${stageByKey(f.stage).label}`;
        }
        await api(`/api/leads/${modal.lead._id}`, "PATCH", body);
      }
      setModal(null);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const remove = async () => {
    if (!modal?.lead || !confirm(`Delete ${modal.lead.name}? This cannot be undone.`)) return;
    try {
      await api(`/api/leads/${modal.lead._id}`, "DELETE");
      setModal(null);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const quickStage = async (lead: LeadT, key: string) => {
    const st = stageByKey(key);
    const body: Record<string, unknown> = {
      stage: key,
      nextAction: st.closed ? "" : st.next,
      logNote: `Moved to ${st.label}`,
    };
    if (st.closed) body.followUpDate = null;
    else if (!lead.followUpDate) body.followUpDate = addDays(todayStr(), 2);
    try {
      await api(`/api/leads/${lead._id}`, "PATCH", body);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  /* derived */
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    leads.forEach((l) => { c[l.stage] = (c[l.stage] || 0) + 1; });
    return c;
  }, [leads]);

  const stats = useMemo(() => {
    if (!today) return { active: 0, over: 0, due: 0, customers: 0 };
    let over = 0, dueToday = 0, active = 0, customers = 0;
    const custStart = STAGES.findIndex((s) => s.key === "registered");
    leads.forEach((l) => {
      const st = stageByKey(l.stage);
      if (!st.closed) active++;
      const idx = STAGES.findIndex((s) => s.key === l.stage);
      if (!st.closed && idx >= custStart && idx <= STAGES.findIndex((s) => s.key === "advocate")) customers++;
      const info = dueInfo(l, today);
      if (info.kind === "over") over++;
      if (info.kind === "today") dueToday++;
    });
    return { active, over, due: dueToday, customers };
  }, [leads, today]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (stageFilter !== "all" && l.stage !== stageFilter) return false;
      if (needle) {
        const hay = [l.name, l.business, l.phone, l.email, l.social, l.nextAction, l.notes].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (due !== "all" && today) {
        if (stageByKey(l.stage).closed || !l.followUpDate) return false;
        const d = diffDays(dayPart(l.followUpDate), today);
        if (due === "overdue" && d >= 0) return false;
        if (due === "today" && d !== 0) return false;
        if (due === "week" && (d < 0 || d > 7)) return false;
      }
      return true;
    });
  }, [leads, q, stageFilter, due, today]);

  const toggleDue = (v: DueFilter) => setDue((p) => (p === v ? "all" : v));

  return (
    <main className="wrap">
      <div className="top">
        <div className="logo" aria-hidden>OH</div>
        <div>
          <h1>Orders Hub CRM</h1>
          <div className="sub">Customer life cycle tracker</div>
        </div>
        <div className="spacer" />
        <ThemeToggle />
        <button className="btn primary" onClick={() => setModal({ lead: null, log: false })}>+ New lead</button>
      </div>

      {error && <div className="err">{error}</div>}

      <div className="stats">
        <div className="stat" style={{ cursor: "default" }}>
          <div className="n">{stats.active}</div><div className="l">Active leads</div>
        </div>
        <button className="stat over" aria-pressed={due === "overdue"} onClick={() => toggleDue("overdue")}>
          <div className="n">{stats.over}</div><div className="l">Overdue follow-ups</div>
        </button>
        <button className="stat today" aria-pressed={due === "today"} onClick={() => toggleDue("today")}>
          <div className="n">{stats.due}</div><div className="l">Due today</div>
        </button>
        <div className="stat" style={{ cursor: "default" }}>
          <div className="n">{stats.customers}</div><div className="l">Registered customers</div>
        </div>
      </div>

      <div className="pipeline" role="group" aria-label="Filter by stage">
        <button className="chip" aria-pressed={stageFilter === "all"} onClick={() => setStageFilter("all")}>
          All<b>{leads.length}</b>
        </button>
        {STAGES.map((s) => (
          <button key={s.key} className="chip" aria-pressed={stageFilter === s.key}
            onClick={() => setStageFilter(stageFilter === s.key ? "all" : s.key)}>
            {s.label}<b>{counts[s.key] || 0}</b>
          </button>
        ))}
      </div>

      <div className="filters">
        <input type="search" placeholder="Search name, business, phone, notes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search leads" />
        <select value={due} onChange={(e) => setDue(e.target.value as DueFilter)} aria-label="Follow-up filter">
          <option value="all">Any follow-up date</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="week">Next 7 days</option>
        </select>
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Stage</th>
                <th>Last contact</th>
                <th>Next action</th>
                <th>Follow-up</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => {
                const info = today ? dueInfo(l, today) : { kind: "none" as const, label: "" };
                const closed = stageByKey(l.stage).closed;
                return (
                  <tr key={l._id}>
                    <td>
                      <button className="name" onClick={() => setModal({ lead: l, log: false })}>{l.name}</button>
                      <div className="muted">{[l.business, l.phone].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td>
                      <select className="stage-select" value={l.stage} onChange={(e) => quickStage(l, e.target.value)} aria-label={`Stage for ${l.name}`}>
                        {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </td>
                    <td>
                      {l.lastContactDate ? fmt(dayPart(l.lastContactDate)) : <span className="muted">Never</span>}
                      {l.lastContactDate && today && (
                        <div className="muted">{diffDays(today, dayPart(l.lastContactDate)) <= 0 ? "today" : `${diffDays(today, dayPart(l.lastContactDate))}d ago`}</div>
                      )}
                    </td>
                    <td>{l.nextAction || <span className="muted">{closed ? "—" : "Not set"}</span>}</td>
                    <td>
                      <span className={`badge ${info.kind === "none" ? "" : info.kind}`} style={info.kind === "none" ? { color: "var(--muted)" } : undefined}>
                        {info.label}
                      </span>
                      {l.followUpDate && !closed && <div className="muted">{fmt(dayPart(l.followUpDate))}</div>}
                    </td>
                    <td>
                      <div className="actions">
                        {!closed && <button className="btn sm primary" onClick={() => setModal({ lead: l, log: true })}>Log contact</button>}
                        <button className="btn sm" onClick={() => setModal({ lead: l, log: false })}>Edit</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && visible.length === 0 && (
          <div className="empty">
            {leads.length === 0 ? "No leads yet. Add your first prospect to start the life cycle." : "No leads match these filters."}
          </div>
        )}
        {loading && <div className="empty">Loading…</div>}
      </div>

      {modal && (
        <LeadModal
          key={modal.lead?._id ?? "new"}
          lead={modal.lead}
          log={modal.log}
          onClose={() => setModal(null)}
          onSave={save}
          onDelete={modal.lead ? remove : undefined}
        />
      )}
    </main>
  );
}
