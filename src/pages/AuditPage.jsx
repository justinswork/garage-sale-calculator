import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Check, Trash2, RotateCcw, Pencil, X, AlertTriangle,
  ArrowRight, Wallet, Lock, Unlock, Users, ChevronDown
} from 'lucide-react';
import { useEvent } from '../contexts/EventContext.jsx';
import EventHeader from '../components/EventHeader.jsx';
import HostPill from '../components/HostPill.jsx';
import { formatTime, localDayKey, formatDayLabel } from '../utils/dates.js';
import { formatMoney } from '../utils/money.js';

// Style descriptors for each audit event type. Driving the icon + tint from
// here keeps the row component compact.
const TYPE_STYLES = {
  'transaction.created':         { icon: Plus,           bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  'transaction.completed':       { icon: Check,          bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  'transaction.pending':         { icon: AlertTriangle,  bg: 'bg-amber-100',   fg: 'text-amber-700' },
  'transaction.edited':          { icon: Pencil,         bg: 'bg-sky-100',     fg: 'text-sky-700' },
  'transaction.item.added':      { icon: Plus,           bg: 'bg-emerald-50',  fg: 'text-emerald-600' },
  'transaction.item.removed':    { icon: X,              bg: 'bg-rose-50',     fg: 'text-rose-600' },
  'transaction.deleted':         { icon: Trash2,         bg: 'bg-rose-100',    fg: 'text-rose-700' },
  'transaction.restored':        { icon: RotateCcw,      bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  'transaction.draft.discarded': { icon: X,              bg: 'bg-slate-100',   fg: 'text-slate-600' },
  'settlement.recorded':         { icon: ArrowRight,     bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  'settlement.undone':           { icon: RotateCcw,      bg: 'bg-amber-100',   fg: 'text-amber-700' },
  'event.renamed':               { icon: Pencil,         bg: 'bg-sky-100',     fg: 'text-sky-700' },
  'event.details.changed':       { icon: Pencil,         bg: 'bg-sky-100',     fg: 'text-sky-700' },
  'event.closed':                { icon: Lock,           bg: 'bg-slate-100',   fg: 'text-slate-700' },
  'event.opened':                { icon: Unlock,         bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  'host.added':                  { icon: Users,          bg: 'bg-violet-100',  fg: 'text-violet-700' },
  'host.renamed':                { icon: Pencil,         bg: 'bg-violet-100',  fg: 'text-violet-700' },
  'daycash.set':                 { icon: Wallet,         bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  'daycash.cleared':             { icon: Wallet,         bg: 'bg-slate-100',   fg: 'text-slate-600' }
};

const FALLBACK_STYLE = { icon: Pencil, bg: 'bg-slate-100', fg: 'text-slate-600' };

const TX_LINK_TYPES = new Set([
  'transaction.created',
  'transaction.completed',
  'transaction.pending',
  'transaction.edited',
  'transaction.item.added',
  'transaction.item.removed',
  'transaction.deleted',
  'transaction.restored'
]);

export default function AuditPage() {
  const { event, hosts, audit } = useEvent();

  // Group entries by local calendar day for readability. Entries without a
  // resolved timestamp (just created, server hasn't returned yet) bucket as
  // "now".
  const byDay = useMemo(() => {
    const map = {};
    for (const entry of audit) {
      const ts = entry.at?.toDate ? entry.at.toDate() : new Date();
      const key = localDayKey(ts);
      if (!map[key]) map[key] = { dayKey: key, entries: [] };
      map[key].entries.push({ ...entry, _ts: ts });
    }
    return Object.values(map).sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
  }, [audit]);

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <EventHeader title="Audit log" backTo={`/e/${event.id}`} />
      <main className="flex-1 px-4 py-4 flex flex-col gap-4">
        {audit.length === 0 ? (
          <div className="card p-6 text-center text-muted text-[14px]">
            No activity recorded yet.
          </div>
        ) : (
          byDay.map((day) => (
            <section key={day.dayKey} className="flex flex-col gap-2">
              <h3 className="text-[12px] uppercase tracking-wide text-muted px-2">
                {formatDayLabel(day.dayKey)}
              </h3>
              <div className="flex flex-col gap-2">
                {day.entries.map((entry) => (
                  <AuditEntryRow
                    key={entry.id}
                    entry={entry}
                    hosts={hosts}
                    eventId={event.id}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        <div className="text-[11px] text-muted text-center pt-2">
          The audit log is append-only — entries can't be edited or removed.
        </div>
      </main>
    </div>
  );
}

function AuditEntryRow({ entry, hosts, eventId }) {
  const style = TYPE_STYLES[entry.type] || FALLBACK_STYLE;
  const Icon = style.icon;
  const actor = entry.byHostId ? hosts.find((h) => h.id === entry.byHostId) : null;
  const time = entry._ts;

  const saleId = entry.meta?.saleId;
  const linkable = saleId && TX_LINK_TYPES.has(entry.type);
  const changes = entry.meta?.changes;
  const hasMultipleChanges = Array.isArray(changes) && changes.length > 1;

  const headBody = (
    <>
      <div className={`w-9 h-9 rounded-xl ${style.bg} ${style.fg} flex items-center justify-center shrink-0`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-ink">{entry.summary || entry.type}</div>
        <div className="text-[11px] text-muted flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span>{formatTime(time)}</span>
          {actor && (
            <>
              <span>·</span>
              <HostPill host={actor} hosts={hosts} size="sm" />
            </>
          )}
        </div>
      </div>
    </>
  );

  const head = linkable ? (
    <Link
      to={`/e/${eventId}/sale/${saleId}`}
      className="flex items-center gap-3 p-3 active:opacity-70"
    >
      {headBody}
    </Link>
  ) : (
    <div className="flex items-center gap-3 p-3">{headBody}</div>
  );

  return (
    <div className="card">
      {head}
      {hasMultipleChanges && (
        <details className="group border-t border-hairline">
          <summary className="cursor-pointer list-none px-3 py-2 flex items-center gap-1 text-[12px] text-accent active:opacity-60">
            <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
            See {changes.length} changes
          </summary>
          <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
            {changes.map((c, i) => (
              <ChangeLine key={i} change={c} hosts={hosts} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ChangeLine({ change, hosts }) {
  if (change.kind === 'item.host.changed') {
    const fromHost = hosts.find((h) => h.id === change.from);
    const toHost = hosts.find((h) => h.id === change.to);
    const label = change.itemName?.trim()
      || `untitled ${formatMoney(change.itemSubtotal || 0)} item`;
    return (
      <div className="flex items-center gap-1.5 text-[12px] flex-wrap">
        <span>Reassigned</span>
        <span className="font-semibold">"{label}"</span>
        <span>from</span>
        {fromHost ? <HostPill host={fromHost} hosts={hosts} size="sm" /> : <span className="text-muted">unknown</span>}
        <span>to</span>
        {toHost ? <HostPill host={toHost} hosts={hosts} size="sm" /> : <span className="text-muted">unknown</span>}
      </div>
    );
  }
  if (change.kind === 'recipient.changed') {
    const fromHost = hosts.find((h) => h.id === change.from);
    const toHost = hosts.find((h) => h.id === change.to);
    return (
      <div className="flex items-center gap-1.5 text-[12px] flex-wrap">
        <span>Reassigned Venmo payment from</span>
        {fromHost ? <HostPill host={fromHost} hosts={hosts} size="sm" /> : <span className="text-muted">unknown</span>}
        <span>to</span>
        {toHost ? <HostPill host={toHost} hosts={hosts} size="sm" /> : <span className="text-muted">unknown</span>}
      </div>
    );
  }
  if (change.kind === 'item.name.changed') {
    return (
      <div className="text-[12px]">
        Renamed <span className="text-muted line-through">"{change.from || 'untitled'}"</span>{' '}
        → <span className="font-semibold">"{change.to || 'untitled'}"</span>
      </div>
    );
  }
  if (change.kind === 'notes.changed') {
    return (
      <div className="flex flex-col gap-1 text-[12px]">
        <span>{change.text}</span>
        {(change.from || change.to) && (
          <div className="bg-canvas border border-hairline rounded-lg p-2 text-[11px] flex flex-col gap-1">
            {change.from && (
              <div>
                <span className="text-muted text-[10px] uppercase tracking-wide">Before</span>
                <div className="line-through text-muted">{change.from}</div>
              </div>
            )}
            {change.to && (
              <div>
                <span className="text-muted text-[10px] uppercase tracking-wide">After</span>
                <div>{change.to}</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  return <div className="text-[12px]">{change.text}</div>;
}
