import { Link } from 'react-router-dom';
import { CalendarClock, Clock, Globe, MapPin } from 'lucide-react';
import type { Offer } from '../lib/types';
import { fmtDateTime, fullName, levelLabel, modeLabel } from '../lib/format';
import { Avatar, Pill, Stars } from './ui';

export default function OfferCard({ offer }: { offer: Offer }) {
  const next = offer.slots.find((s) => s.status === 'AVAILABLE');
  const availableCount = offer.slots.filter((s) => s.status === 'AVAILABLE').length;
  return (
    <Link to={`/offers/${offer.id}`} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-pop">
      <div className="flex items-start justify-between gap-3">
        <Pill tone="brand">{offer.category.name}</Pill>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{offer.cost} crédit{offer.cost > 1 ? 's' : ''}</span>
      </div>
      <h3 className="mt-3 text-base font-bold leading-snug text-ink-900 group-hover:text-brand-700">{offer.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-ink-500">{offer.description}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Pill>{offer.skill}</Pill>
        <Pill>{levelLabel[offer.level]}</Pill>
        <Pill>{offer.mode === 'REMOTE' ? <Globe className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}{modeLabel[offer.mode]}</Pill>
        <Pill><Clock className="h-3 w-3" />{offer.durationHours} h</Pill>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-4 mt-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar person={offer.teacher} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900">{fullName(offer.teacher)}</p>
            <Stars value={offer.teacherRating?.avg ?? null} />
          </div>
        </div>
        {next && (
          <div className="flex items-center gap-1 text-right text-xs text-ink-500">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            <span>{fmtDateTime(next.startsAt)}{availableCount > 1 && <span className="font-semibold text-brand-600"> +{availableCount - 1}</span>}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
