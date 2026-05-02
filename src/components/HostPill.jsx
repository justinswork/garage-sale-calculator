import { hostColor } from '../utils/colors.js';

export default function HostPill({ host, hosts, you, size = 'md' }) {
  const c = hostColor(host.id, hosts);
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[12px] gap-1' : 'px-2.5 py-1 text-[13px] gap-1.5';
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  return (
    <span className={`inline-flex items-center rounded-full ${c.bg} ${c.text} ${padding} font-medium`}>
      <span className={`${dotSize} rounded-full ${c.dot} shrink-0`} />
      <span className="truncate">{host.name}{you ? ' · you' : ''}</span>
    </span>
  );
}

export function HostDot({ host, hosts }) {
  const c = hostColor(host.id, hosts);
  return <span className={`inline-block w-2 h-2 rounded-full ${c.dot} shrink-0`} aria-hidden />;
}
