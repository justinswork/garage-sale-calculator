import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Pencil, Lock, Unlock, Copy, AlertTriangle, Home, Trash2 } from 'lucide-react';
import { useEvent } from '../contexts/EventContext.jsx';
import EventHeader from '../components/EventHeader.jsx';
import { renameEvent, setEventStatus, deleteEvent } from '../data/events.js';
import { renameHost } from '../data/hosts.js';
import { recordAudit } from '../data/audit.js';
import { removeRecentEvent } from '../utils/storage.js';

export default function EventSettingsPage() {
  const { event, hosts, sales, currentHost, uid, switchHost } = useEvent();
  const navigate = useNavigate();
  const pendingCount = useMemo(
    () => (sales || []).filter((s) => !s.deletedAt && s.status === 'pending-discount').length,
    [sales]
  );
  const blockedFromClosing = event.status === 'open' && pendingCount > 0;
  const [name, setName] = useState(event.name);
  const [editingHostId, setEditingHostId] = useState(null);
  const [hostName, setHostName] = useState('');
  const [copied, setCopied] = useState(false);

  const saveName = async () => {
    if (name.trim() && name !== event.name) {
      const newName = name.trim();
      const oldName = event.name;
      await renameEvent(event.id, newName);
      recordAudit(event.id, {
        type: 'event.renamed',
        summary: `Renamed event from "${oldName}" to "${newName}"`,
        byUid: uid,
        byHostId: currentHost.id,
        meta: { previous: oldName, current: newName }
      });
    }
  };

  const saveHostName = async (hostId) => {
    const trimmed = hostName.trim();
    const target = hosts.find((h) => h.id === hostId);
    if (trimmed && target && trimmed !== target.name) {
      const oldName = target.name;
      await renameHost(event.id, hostId, trimmed);
      recordAudit(event.id, {
        type: 'host.renamed',
        summary: `Renamed host "${oldName}" to "${trimmed}"`,
        byUid: uid,
        byHostId: currentHost.id,
        meta: { hostId, previous: oldName, current: trimmed }
      });
    }
    setEditingHostId(null);
    setHostName('');
  };

  const toggleStatus = async () => {
    if (blockedFromClosing) return;
    const newStatus = event.status === 'open' ? 'closed' : 'open';
    await setEventStatus(event.id, newStatus);
    recordAudit(event.id, {
      type: newStatus === 'closed' ? 'event.closed' : 'event.opened',
      summary: newStatus === 'closed' ? 'Closed the event' : 'Reopened the event',
      byUid: uid,
      byHostId: currentHost.id,
      meta: {}
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/e/${event.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const onSwitchHost = () => {
    navigate(`/e/${event.id}`);
    switchHost();
  };

  const isCreator = event.createdByUid === uid;
  const [deleting, setDeleting] = useState(false);

  const onDeleteEvent = async () => {
    if (!isCreator || deleting) return;
    const ok = confirm(
      `Permanently delete "${event.name}"?\n\n` +
      `This deletes all transactions, items, settlements, hosts, and audit history. ` +
      `Cannot be undone.`
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteEvent(event.id);
      removeRecentEvent(event.id);
      navigate('/');
    } catch (err) {
      setDeleting(false);
      alert(err?.message || 'Could not delete the event.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <EventHeader title="Settings" backTo={`/e/${event.id}`} />
      <main className="flex-1 px-4 py-4 flex flex-col gap-4">
        <section className="card p-4 flex flex-col gap-3">
          <h3 className="text-[12px] uppercase tracking-wide text-muted">Event name</h3>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
          />
          <div className="flex items-center justify-between text-[12px] text-muted">
            <span>Event ID</span>
            <button onClick={copyLink} className="font-mono text-ink active:opacity-60 flex items-center gap-1">
              {event.id} <Copy size={12} />
            </button>
          </div>
          {copied && <div className="text-[12px] text-emerald-700">Link copied</div>}
        </section>

        <section className="card p-4 flex flex-col gap-2">
          <h3 className="text-[12px] uppercase tracking-wide text-muted">Hosts</h3>
          {hosts.map((h) => (
            <div key={h.id} className="flex items-center gap-2 py-1">
              {editingHostId === h.id ? (
                <>
                  <input
                    className="input flex-1"
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    autoFocus
                  />
                  <button onClick={() => saveHostName(h.id)} className="text-accent font-semibold text-[14px] px-2">Save</button>
                </>
              ) : (
                <>
                  <span className="flex-1">{h.name}{h.id === currentHost.id ? ' (you)' : ''}</span>
                  <button
                    onClick={() => { setEditingHostId(h.id); setHostName(h.name); }}
                    className="text-muted active:opacity-60 p-1"
                    aria-label="Rename host"
                  >
                    <Pencil size={16} />
                  </button>
                </>
              )}
            </div>
          ))}
          <div className="text-[12px] text-muted pt-1">
            New hosts join via the event link.
          </div>
        </section>

        <section className="card p-4 flex flex-col gap-3">
          <h3 className="text-[12px] uppercase tracking-wide text-muted">Event status</h3>
          <div className="flex items-center justify-between">
            <span className="text-[14px]">{event.status === 'open' ? 'Open' : 'Closed'}</span>
            <button
              onClick={toggleStatus}
              disabled={blockedFromClosing}
              className="btn-secondary py-2 px-4 flex items-center gap-2 text-[14px] disabled:opacity-50"
            >
              {event.status === 'open' ? <><Lock size={16} /> Close event</> : <><Unlock size={16} /> Reopen event</>}
            </button>
          </div>
          {blockedFromClosing ? (
            <div className="flex items-start gap-2 text-amber-700 text-[12px] bg-amber-50 rounded-xl p-3">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Can't close yet — {pendingCount} transaction{pendingCount === 1 ? ' has' : 's have'} a pending discount allocation.
                Resolve {pendingCount === 1 ? 'it' : 'them'} from the home screen first.
              </span>
            </div>
          ) : (
            <div className="text-[12px] text-muted">
              Closing locks the event: no new transactions, edits, or deletions until you reopen it.
            </div>
          )}
        </section>

        <section className="card p-4 flex flex-col gap-2">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-accent-deep font-semibold text-[14px] active:opacity-60"
          >
            <Home size={16} /> Back to my events
          </button>
          <div className="text-[12px] text-muted">
            Returns to the app home, where you can create or open another event.
          </div>
        </section>

        <section className="card p-4">
          <button onClick={onSwitchHost} className="flex items-center gap-2 text-red-600 font-semibold text-[14px] active:opacity-60">
            <LogOut size={16} /> Switch host on this device
          </button>
          <div className="text-[12px] text-muted pt-2">
            This forgets which host this device is signed in as. Your transactions stay in place.
          </div>
        </section>

        {isCreator && (
          <section className="card p-4 border border-red-200 bg-red-50/50">
            <button
              onClick={onDeleteEvent}
              disabled={deleting}
              className="flex items-center gap-2 text-red-700 font-semibold text-[14px] active:opacity-60 disabled:opacity-50"
            >
              <Trash2 size={16} /> {deleting ? 'Deleting…' : 'Delete this event'}
            </button>
            <div className="text-[12px] text-red-700/80 pt-2">
              Removes the event and every transaction, item, settlement, host, and audit entry. Only the creator (you) can do this. Cannot be undone.
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
