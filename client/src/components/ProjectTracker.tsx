import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { api, ApiError, MILESTONE_LABELS, STAGE_LABELS, STAGES, type MilestoneStatus, type Workspace } from '../api';
import { useFlipList } from '../motion';
import { Icon } from './Icon';
import { useToast } from './ui/Toast';
import './tracker.css';

/**
 * The team's tracker (FR03): where the project stands, what is being worked on, and how it got here.
 *
 *  - The stage pipeline moves the project from Idea to Launched.
 *  - The milestone board is three columns. Cards can be dragged between and within them; every card
 *    also has buttons that do the same, for keyboards and touch screens.
 *  - The timeline joins the team's written updates with the changes the tracker records itself.
 *
 * Changes show at once and are then confirmed by the server; if one fails, the board goes back to
 * what the server has.
 */

type Milestone = Workspace['milestones'][number];
const COLUMNS: MilestoneStatus[] = ['PLANNED', 'IN_PROGRESS', 'DONE'];
const DAY = 86_400_000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** Whole days from today to the date: negative when it has passed. */
const daysUntil = (iso: string) => Math.round((startOfDay(new Date(iso)) - startOfDay(new Date())) / DAY);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

function dueNote(m: Milestone): { text: string; tone: 'danger' | 'warn' | 'plain' } | null {
  if (!m.dueDate) return null;
  if (m.status === 'DONE') return { text: `Due ${shortDate(m.dueDate)}`, tone: 'plain' };
  const days = daysUntil(m.dueDate);
  if (days < 0) return { text: `Overdue by ${plural(-days, 'day')}`, tone: 'danger' };
  if (days === 0) return { text: 'Due today', tone: 'warn' };
  if (days <= 7) return { text: `Due in ${plural(days, 'day')}`, tone: 'warn' };
  return { text: `Due ${shortDate(m.dueDate)}`, tone: 'plain' };
}

function ago(iso: string): string {
  const days = -daysUntil(iso);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return shortDate(iso);
}

interface Props {
  projectId: string;
  workspace: Workspace;
  /** Reloads the workspace from the server. */
  onChanged: () => Promise<void>;
  /** The project was removed by an Admin: everything is read-only. */
  locked: boolean;
}

export function ProjectTracker({ projectId, workspace, onChanged, locked }: Props) {
  const toast = useToast();
  const [stage, setStage] = useState(workspace.project.stage);
  const [milestones, setMilestones] = useState(workspace.milestones);
  const [busy, setBusy] = useState(false);
  const [pendingStage, setPendingStage] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string; dueDate: string } | null>(null);
  const [adding, setAdding] = useState({ title: '', dueDate: '' });
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ column: MilestoneStatus; before: string | null } | null>(null);
  const [error, setError] = useState('');
  const { ref: board, capture } = useFlipList<HTMLDivElement>([milestones]);

  // The server's copy replaces the local one whenever the workspace is reloaded.
  useEffect(() => {
    setStage(workspace.project.stage);
    setMilestones(workspace.milestones);
  }, [workspace]);

  /** Shows the change, sends it, and falls back to the server's copy if it was refused. */
  async function commit(apply: () => void, send: () => Promise<unknown>, done?: string) {
    setError('');
    capture();
    apply();
    setBusy(true);
    try {
      await send();
      if (done) toast(done);
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : 'That change could not be saved. Check your connection and try again.');
    } finally {
      await onChanged();
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------- Stage
  const stageIndex = STAGES.indexOf(stage);
  const nextStage = STAGES[stageIndex + 1];
  const moveStage = (to: string) => {
    setPendingStage(null);
    void commit(
      () => setStage(to as Workspace['project']['stage']),
      () => api(`/projects/${projectId}`, { method: 'PATCH', body: { stage: to } }),
      `Stage set to ${STAGE_LABELS[to]}.`,
    );
  };

  // ---------------------------------------------------------------- Milestones
  const byColumn = useMemo(() => Object.fromEntries(COLUMNS.map((c) => [c, milestones.filter((m) => m.status === c)])) as Record<MilestoneStatus, Milestone[]>, [milestones]);
  const done = byColumn.DONE.length;
  const overdue = milestones.filter((m) => m.status !== 'DONE' && m.dueDate && daysUntil(m.dueDate) < 0);
  const upcoming = milestones
    .filter((m) => m.status !== 'DONE' && m.dueDate && daysUntil(m.dueDate) >= 0)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())[0];
  const lastActivity = [workspace.progress[0]?.createdAt, workspace.activity[0]?.at].filter(Boolean).sort().pop();
  const quietDays = lastActivity ? -daysUntil(lastActivity) : null;

  /** Moves a milestone to a column, before the given card or at the column's end. */
  function place(id: string, column: MilestoneStatus, before: string | null) {
    const moving = milestones.find((m) => m.id === id);
    if (!moving || before === id) return;
    const rest = milestones.filter((m) => m.id !== id);
    const moved = { ...moving, status: column };
    let at = before ? rest.findIndex((m) => m.id === before) : -1;
    if (at < 0) {
      // After the last card already in that column, so columns keep their own order.
      const lastInColumn = rest.map((m) => m.status).lastIndexOf(column);
      at = lastInColumn < 0 ? rest.length : lastInColumn + 1;
    }
    const next = [...rest.slice(0, at), moved, ...rest.slice(at)];
    const statusChanged = moving.status !== column;
    const orderChanged = next.some((m, i) => m.id !== milestones[i]?.id);
    if (!statusChanged && !orderChanged) return;
    void commit(
      () => setMilestones(next),
      async () => {
        if (statusChanged) await api(`/projects/${projectId}/milestones/${id}`, { method: 'PATCH', body: { status: column } });
        if (orderChanged) await api(`/projects/${projectId}/milestones/order`, { method: 'PUT', body: { ids: next.map((m) => m.id) } });
      },
      statusChanged ? `“${moving.title}” moved to ${MILESTONE_LABELS[column]}.` : undefined,
    );
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const title = adding.title.trim();
    if (!title) return;
    void commit(
      () => {
        setMilestones((list) => [...list, { id: `new-${Date.now()}`, title, status: 'PLANNED', dueDate: adding.dueDate ? new Date(adding.dueDate).toISOString() : null }]);
        setAdding({ title: '', dueDate: '' });
      },
      () => api(`/projects/${projectId}/milestones`, { body: { title, dueDate: adding.dueDate || null } }),
    );
  }

  function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing || !editing.title.trim()) return;
    const { id, title, dueDate } = editing;
    setEditing(null);
    void commit(
      () => setMilestones((list) => list.map((m) => (m.id === id ? { ...m, title: title.trim(), dueDate: dueDate ? new Date(dueDate).toISOString() : null } : m))),
      () => api(`/projects/${projectId}/milestones/${id}`, { method: 'PATCH', body: { title: title.trim(), dueDate: dueDate || null } }),
    );
  }

  function remove(m: Milestone) {
    setEditing(null);
    void commit(
      () => setMilestones((list) => list.filter((x) => x.id !== m.id)),
      () => api(`/projects/${projectId}/milestones/${m.id}`, { method: 'DELETE' }),
      `“${m.title}” removed.`,
    );
  }

  // ---------------------------------------------------------------- Dragging
  const canDrag = !locked && !busy && !editing;
  function onDragOverColumn(e: DragEvent, column: MilestoneStatus) {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-milestone]');
    let before: string | null = null;
    if (card && card.dataset.milestone !== dragId) {
      const box = card.getBoundingClientRect();
      // Above the middle of a card: drop before it. Below: before the one after it.
      if (e.clientY < box.top + box.height / 2) before = card.dataset.milestone ?? null;
      else before = (card.nextElementSibling as HTMLElement | null)?.dataset.milestone ?? null;
    }
    if (over?.column !== column || over.before !== before) setOver({ column, before });
  }
  function onDrop(e: DragEvent, column: MilestoneStatus) {
    e.preventDefault();
    const id = dragId;
    const before = over?.column === column ? over.before : null;
    setDragId(null);
    setOver(null);
    if (id) place(id, column, before);
  }

  return (
    <section className="tracker" aria-labelledby="tracker-title">
      <header className="tracker-head">
        <div>
          <p className="annotation">Tracker</p>
          <h2 id="tracker-title">Where the project stands</h2>
        </div>
        <ul className="tracker-health" aria-label="Summary">
          <li>
            <b>
              {done}/{milestones.length}
            </b>
            <span>milestones done</span>
            <i className="tracker-bar" aria-hidden="true">
              <i style={{ transform: `scaleX(${milestones.length ? done / milestones.length : 0})` }} />
            </i>
          </li>
          <li className={overdue.length ? 'is-danger' : ''}>
            <b>{overdue.length}</b>
            <span>overdue</span>
          </li>
          <li>
            <b>{upcoming ? (daysUntil(upcoming.dueDate!) === 0 ? 'Today' : `In ${plural(daysUntil(upcoming.dueDate!), 'day')}`) : '—'}</b>
            <span>{upcoming ? `next: ${upcoming.title}` : 'no upcoming due date'}</span>
          </li>
          <li className={quietDays !== null && quietDays >= 14 ? 'is-warn' : ''}>
            <b>{lastActivity ? ago(lastActivity) : '—'}</b>
            <span>last activity</span>
          </li>
        </ul>
      </header>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      {/* ---------------------------------------------------------------- Stage pipeline */}
      <div className="pipeline-wrap">
        <div className="row space-between">
          <h3 className="tracker-sub">Development stage</h3>
          <span className="muted small">
            {STAGE_LABELS[stage]}
            {workspace.stageSince ? ` since ${shortDate(workspace.stageSince)}` : ''}
          </span>
        </div>
        <ol className="pipeline" style={{ ['--pipeline-p' as string]: String(stageIndex / (STAGES.length - 1)) }}>
          {STAGES.map((s, i) => (
            <li key={s} className={i < stageIndex ? 'is-past' : i === stageIndex ? 'is-current' : ''}>
              <button
                type="button"
                className="pipeline-step"
                disabled={locked || busy || s === stage}
                aria-current={s === stage ? 'step' : undefined}
                onClick={() => setPendingStage(s)}
                title={s === stage ? 'Current stage' : `Move to ${STAGE_LABELS[s]}`}
              >
                <span className="pipeline-dot" aria-hidden="true">
                  {i < stageIndex ? <Icon name="check" /> : String(i + 1).padStart(2, '0')}
                </span>
                <span className="pipeline-name">{STAGE_LABELS[s]}</span>
              </button>
            </li>
          ))}
        </ol>
        {pendingStage ? (
          <div className="pipeline-confirm" role="group" aria-label="Confirm stage change">
            <span>
              Move from <strong>{STAGE_LABELS[stage]}</strong> to <strong>{STAGE_LABELS[pendingStage]}</strong>? Everyone who can see the project will see the new stage.
            </span>
            <div className="row">
              <button type="button" className="btn btn-signal btn-sm" onClick={() => moveStage(pendingStage)} disabled={busy}>
                Move to {STAGE_LABELS[pendingStage]}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingStage(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          nextStage &&
          !locked && (
            <button type="button" className="btn btn-secondary btn-sm pipeline-next" onClick={() => setPendingStage(nextStage)} disabled={busy}>
              Advance to {STAGE_LABELS[nextStage]} <Icon name="arrow-right" />
            </button>
          )
        )}
      </div>

      {/* ---------------------------------------------------------------- Milestone board */}
      <div className="board-wrap">
        <div className="row space-between">
          <h3 className="tracker-sub">Milestones</h3>
          {!locked && <span className="muted small">Drag a card to another column, or use its buttons.</span>}
        </div>
        <div className="board" ref={board}>
          {COLUMNS.map((column, columnIndex) => (
            <div
              key={column}
              className={`board-column board-${column.toLowerCase()}${over?.column === column ? ' is-over' : ''}`}
              onDragOver={(e) => onDragOverColumn(e, column)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
              }}
              onDrop={(e) => onDrop(e, column)}
            >
              <h4 className="board-title">
                <span>{MILESTONE_LABELS[column]}</span>
                <b>{byColumn[column].length}</b>
              </h4>
              <ul className="board-list" aria-label={`${MILESTONE_LABELS[column]} milestones`}>
                {byColumn[column].map((m) => {
                  const due = dueNote(m);
                  const isEditing = editing?.id === m.id;
                  return (
                    <li
                      key={m.id}
                      data-milestone={m.id}
                      data-flip-id={m.id}
                      className={`board-card${dragId === m.id ? ' is-dragging' : ''}${over?.column === column && over.before === m.id ? ' is-target' : ''}${due?.tone === 'danger' ? ' is-overdue' : ''}`}
                      draggable={canDrag}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', m.id);
                        setDragId(m.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                    >
                      {isEditing ? (
                        <form className="board-edit" onSubmit={saveEdit}>
                          <label className="visually-hidden" htmlFor={`title-${m.id}`}>
                            Milestone title
                          </label>
                          <input id={`title-${m.id}`} className="input" value={editing.title} maxLength={120} autoFocus onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                          <label className="visually-hidden" htmlFor={`due-${m.id}`}>
                            Due date
                          </label>
                          <input id={`due-${m.id}`} className="input" type="date" value={editing.dueDate} onChange={(e) => setEditing({ ...editing, dueDate: e.target.value })} />
                          <div className="row">
                            <button type="submit" className="btn btn-primary btn-sm" disabled={!editing.title.trim()}>
                              Save
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
                              Cancel
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm danger-text" onClick={() => remove(m)}>
                              Delete
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <p className="board-card-title">{m.title}</p>
                          {due && <p className={`board-due board-due-${due.tone}`}>{due.text}</p>}
                          {!locked && (
                            <div className="board-actions">
                              {columnIndex > 0 && (
                                <button type="button" className="board-move" disabled={busy} onClick={() => place(m.id, COLUMNS[columnIndex - 1], null)} aria-label={`Move “${m.title}” back to ${MILESTONE_LABELS[COLUMNS[columnIndex - 1]]}`}>
                                  <Icon name="arrow-left" />
                                </button>
                              )}
                              {columnIndex < COLUMNS.length - 1 && (
                                <button type="button" className="board-move board-move-next" disabled={busy} onClick={() => place(m.id, COLUMNS[columnIndex + 1], null)}>
                                  {column === 'PLANNED' ? 'Start' : 'Complete'} <Icon name="arrow-right" />
                                </button>
                              )}
                              <button type="button" className="board-move board-move-edit" disabled={busy} onClick={() => setEditing({ id: m.id, title: m.title, dueDate: dateInput(m.dueDate) })} aria-label={`Edit “${m.title}”`}>
                                <Icon name="edit" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
                {over?.column === column && over.before === null && dragId && <li className="board-drop" aria-hidden="true" />}
                {byColumn[column].length === 0 && !(over?.column === column) && <li className="board-empty">{column === 'DONE' ? 'Nothing finished yet.' : column === 'IN_PROGRESS' ? 'Nothing in progress.' : 'Nothing planned.'}</li>}
              </ul>
            </div>
          ))}
        </div>
        {!locked && (
          <form className="board-add" onSubmit={add}>
            <div className="field">
              <label htmlFor="new-milestone">New milestone</label>
              <input id="new-milestone" className="input" placeholder="For example: first working prototype" value={adding.title} maxLength={120} onChange={(e) => setAdding((a) => ({ ...a, title: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="new-milestone-due">Due date (optional)</label>
              <input id="new-milestone-due" className="input" type="date" value={adding.dueDate} onChange={(e) => setAdding((a) => ({ ...a, dueDate: e.target.value }))} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy || !adding.title.trim()}>
              <Icon name="plus" /> Add milestone
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Timeline

type Activity = Workspace['activity'][number];

function describe(e: Activity): { icon: 'flag' | 'check' | 'play' | 'plus' | 'trash' | 'clock'; text: string } {
  const title = e.title ? `“${e.title}”` : 'A milestone';
  switch (e.kind) {
    case 'STAGE_CHANGED':
      return { icon: 'flag', text: `Stage moved from ${STAGE_LABELS[e.from ?? ''] ?? e.from} to ${STAGE_LABELS[e.to ?? ''] ?? e.to}` };
    case 'MILESTONE_ADDED':
      return { icon: 'plus', text: `Milestone added: ${title}` };
    case 'MILESTONE_REMOVED':
      return { icon: 'trash', text: `Milestone removed: ${title}` };
    default:
      if (e.to === 'DONE') return { icon: 'check', text: `Milestone completed: ${title}` };
      if (e.to === 'IN_PROGRESS') return { icon: 'play', text: `Work started on ${title}` };
      return { icon: 'clock', text: `${title} moved back to planned` };
  }
}

/** Written updates and tracker changes in one line of time, newest first. */
export function ProjectTimeline({ workspace, onDeleteUpdate, busy }: { workspace: Workspace; onDeleteUpdate: (id: string) => void; busy: boolean }) {
  const [filter, setFilter] = useState<'ALL' | 'UPDATES' | 'CHANGES'>('ALL');
  const items = useMemo(() => {
    const updates = workspace.progress.map((p) => ({ key: `u-${p.id}`, at: p.createdAt, update: p, event: null as Activity | null }));
    const events = workspace.activity.map((e) => ({ key: `e-${e.id}`, at: e.at, update: null as Workspace['progress'][number] | null, event: e }));
    return [...(filter === 'CHANGES' ? [] : updates), ...(filter === 'UPDATES' ? [] : events)].sort((a, b) => b.at.localeCompare(a.at));
  }, [workspace.progress, workspace.activity, filter]);

  return (
    <div className="timeline-wrap">
      <div className="timeline-filter" role="group" aria-label="Show">
        {(['ALL', 'UPDATES', 'CHANGES'] as const).map((f) => (
          <button key={f} type="button" className="timeline-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'ALL' ? 'Everything' : f === 'UPDATES' ? 'Written updates' : 'Tracker changes'}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="muted">Nothing here yet. Post an update, add a milestone or move the stage, and it will appear on this timeline.</p>
      ) : (
        <ol className="timeline">
          {items.map(({ key, at, update, event }) => {
            const d = event ? describe(event) : null;
            return (
              <li key={key} className={`timeline-item${update ? ' is-update' : ''}`}>
                <span className="timeline-dot" aria-hidden="true">
                  <Icon name={d ? d.icon : 'comment'} />
                </span>
                <div className="timeline-body">
                  <p className="timeline-meta">
                    <time dateTime={at}>{new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
                    <span>{update ? update.authorName : event!.actorName}</span>
                  </p>
                  {update ? <p className="timeline-text pre-wrap">{update.body}</p> : <p className="timeline-event">{d!.text}</p>}
                  {update && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onDeleteUpdate(update.id)}>
                      Delete update
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
