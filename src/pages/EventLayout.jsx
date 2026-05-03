import { useEffect, useMemo, useState } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { EventProvider } from '../contexts/EventContext.jsx';
import Loader from '../components/Loader.jsx';
import JoinEventScreen from './JoinEventScreen.jsx';
import { watchEvent } from '../data/events.js';
import { watchHosts, attachDeviceToHost } from '../data/hosts.js';
import { watchSales } from '../data/sales.js';
import { watchSettlements } from '../data/settlements.js';
import { watchAudit } from '../data/audit.js';
import { buildSaleNumberMap } from '../utils/sale.js';
import {
  getDeviceHostId,
  setDeviceHostId,
  clearDeviceHostId,
  pushRecentEvent
} from '../utils/storage.js';

export default function EventLayout() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState(undefined);
  const [hosts, setHosts] = useState(undefined);
  const [sales, setSales] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [audit, setAudit] = useState([]);
  const [hostId, setHostId] = useState(() => getDeviceHostId(eventId));

  useEffect(() => {
    setHostId(getDeviceHostId(eventId));
    const unsubE = watchEvent(eventId, (e) => setEvent(e));
    const unsubH = watchHosts(eventId, (list) => setHosts(list));
    const unsubS = watchSales(eventId, (list) => setSales(list));
    const unsubT = watchSettlements(eventId, (list) => setSettlements(list));
    const unsubA = watchAudit(eventId, (list) => setAudit(list));
    return () => {
      unsubE();
      unsubH();
      unsubS();
      unsubT();
      unsubA();
    };
  }, [eventId]);

  const saleNumberMap = useMemo(() => buildSaleNumberMap(sales), [sales]);

  useEffect(() => {
    if (event) pushRecentEvent({ id: event.id, name: event.name });
  }, [event?.id, event?.name]);

  if (event === undefined || hosts === undefined) return <Loader label="Loading event…" />;

  if (event === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="font-semibold mb-2">Event not found</p>
        <p className="text-sm text-muted mb-4">The link may be wrong or the event was deleted.</p>
        <button className="btn-secondary" onClick={() => navigate('/')}>Back home</button>
      </div>
    );
  }

  const currentHost = hosts.find((h) => h.id === hostId) || null;
  const deviceMatchesHost = currentHost && currentHost.deviceUids?.includes(user.uid);

  if (!currentHost) {
    return (
      <JoinEventScreen
        event={event}
        hosts={hosts}
        uid={user.uid}
        onPicked={async (id) => {
          await attachDeviceToHost(eventId, id, user.uid).catch(() => {});
          setDeviceHostId(eventId, id);
          setHostId(id);
        }}
      />
    );
  }

  // attach this uid in the background if it isn't already on the chosen host
  if (currentHost && !deviceMatchesHost) {
    attachDeviceToHost(eventId, currentHost.id, user.uid).catch(() => {});
  }

  const switchHost = () => {
    clearDeviceHostId(eventId);
    setHostId(null);
  };

  return (
    <EventProvider value={{ event, hosts, sales, saleNumberMap, settlements, audit, currentHost, uid: user.uid, switchHost }}>
      <Outlet />
    </EventProvider>
  );
}
