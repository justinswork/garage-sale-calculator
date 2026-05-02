import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Settings } from 'lucide-react';
import { useEvent } from '../contexts/EventContext.jsx';

export default function EventHeader({ title, backTo, rightSlot }) {
  const navigate = useNavigate();
  const { event, currentHost } = useEvent();
  return (
    <header className="px-3 pt-2 pb-3 flex items-center gap-2 border-b border-hairline bg-white/85 backdrop-blur-xl sticky top-0 z-10">
      {backTo !== undefined ? (
        <button
          onClick={() => (typeof backTo === 'string' ? navigate(backTo) : navigate(-1))}
          className="p-2 -ml-2 text-muted active:opacity-60"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
      ) : (
        <Link to={`/e/${event.id}/settings`} className="p-2 -ml-2 text-muted active:opacity-60" aria-label="Settings">
          <Settings size={20} />
        </Link>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[16px] font-bold truncate">{title || event.name}</div>
        {currentHost && <div className="text-[11px] text-muted truncate">Signed in as {currentHost.name}</div>}
      </div>
      {rightSlot}
    </header>
  );
}
