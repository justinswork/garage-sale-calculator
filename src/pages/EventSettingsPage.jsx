import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Pencil, Lock, Unlock, Copy, AlertTriangle } from 'lucide-react';
import { useEvent } from '../contexts/EventContext.jsx';
import EventHeader from '../components/EventHeader.jsx';
import { renameEvent, setEventStatus } from '../data/events.js';
import { renameHost } from '../data/hosts.js';

export default function EventSettingsPage() {
  const { event, hosts, sales, currentHost, switchHost } = useEvent();
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
      await renameEvent(event.id, name.trim());
    }
  };

  const saveHostName = async (hostId) => {
    if (hostName.trim()) {
      await renameHost(event.id, hostId, hostName.trim());
    }
    setEditingHostId(null);
    setHostName('');
  };

  const toggleStatus = async () => {
    if (blockedFromClosing) return;
    await setEventStatus(event.id, event.status === 'open' ? 'closed' : 'open');
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
                Can't close yet — {pendingCount} sale{pendingCount === 1 ? ' has' : 's have'} a pending discount allocation.
                Resolve {pendingCount === 1 ? 'it' : 'them'} from the home screen first.
              </span>
            </div>
          ) : (
            <div className="text-[12px] text-muted">
              Closing locks the event: no new sales, edits, or deletions until you reopen it.
            </div>
          )}
        </section>

        <section className="card p-4">
          <button onClick={onSwitchHost} className="flex items-center gap-2 text-red-600 font-semibold text-[14px] active:opacity-60">
            <LogOut size={16} /> Switch host on this device
          </button>
          <div className="text-[12px] text-muted pt-2">
            This forgets which host this device is signed in as. Your sales stay in place.
          </div>
        </section>
      </main>
    </div>
  );
}
