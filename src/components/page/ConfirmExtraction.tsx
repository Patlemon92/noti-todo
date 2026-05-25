import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  type ItemCategory,
  type JournalSnap,
  type ProcessedExtraction,
  type ProcessedItem,
  saveExtractedItems,
} from '../../lib/journalSnaps';

interface Props {
  snap: JournalSnap;
  photoUrl: string;
  extraction: ProcessedExtraction;
  onSaved: () => void;
}

interface EditableItem {
  raw: ProcessedItem;
  enabled: boolean;
  title: string;
  category: ItemCategory;
  date: string | null; // yyyy-mm-dd or null
  hour: number | null;
  minute: number;
  flags: string[];
}

interface EditableNote {
  text: string;
  enabled: boolean;
  confidence: number;
}

/**
 * Phase 6 confirm screen. Shows what claude pulled off the page, lets the
 * user fix titles / dates / times / categories, skip bad guesses, and
 * commit the rest. Save creates task pages + reminders + a single
 * combined note page (when notes are kept).
 */
export default function ConfirmExtraction({ snap, photoUrl, extraction, onSaved }: Props) {
  const [items, setItems] = useState<EditableItem[]>(() =>
    extraction.items.map((i) => ({
      raw: i,
      enabled: !i.flags.includes('past-date'),
      title: i.title,
      category: i.category,
      date: i.resolved_date,
      hour: i.time?.hour ?? null,
      minute: i.time?.minute ?? 0,
      flags: i.flags,
    })),
  );
  const [notes, setNotes] = useState<EditableNote[]>(() =>
    extraction.notes_blocks.map((n) => ({
      text: n.text,
      enabled: true,
      confidence: n.confidence,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabledCount = useMemo(
    () =>
      items.filter((i) => i.enabled).length +
      (notes.some((n) => n.enabled && n.text.trim()) ? 1 : 0),
    [items, notes],
  );

  function updateItem(idx: number, patch: Partial<EditableItem>) {
    setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function updateNote(idx: number, patch: Partial<EditableNote>) {
    setNotes((cur) => cur.map((n, i) => (i === idx ? { ...n, ...patch } : n)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const enabledItems = items
        .filter((i) => i.enabled && i.title.trim())
        .map((i) => ({
          title: i.title.trim(),
          category: i.category,
          resolved_date: i.date,
          time: i.hour != null ? { hour: i.hour, minute: i.minute } : null,
          raw_text: i.raw.raw_text,
        }));
      const enabledNotes = notes
        .filter((n) => n.enabled && n.text.trim())
        .map((n) => ({ text: n.text.trim() }));
      await saveExtractedItems(snap, enabledItems, enabledNotes);
      onSaved();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[confirm save]', err);
      setError(err instanceof Error ? err.message : 'save failed');
      setSaving(false);
    }
  }

  const isEmpty = items.length === 0 && notes.length === 0;

  return (
    <div className="mx-3.5 mt-4">
      <div className="overflow-hidden rounded-[18px] border-2 border-ink shadow-card-lg">
        <img
          src={photoUrl}
          alt=""
          className="block max-h-[40vh] w-full object-contain bg-bg"
        />
      </div>

      {isEmpty ? (
        <div className="mt-5 rounded-[16px] border-2 border-dashed border-ink-faint bg-bg-soft px-4 py-6 text-center">
          <p className="mb-2 font-serif text-[18px] italic text-ink-soft">
            nothing came back.
          </p>
          <p className="text-[13px] text-ink-soft">
            claude couldn't pull anything off this page. retake the photo, or
            try a clearer angle.
          </p>
        </div>
      ) : (
        <>
          {items.length > 0 && (
            <section className="mt-5">
              <h2 className="mb-2 px-1 font-mono text-[11px] uppercase tracking-mono-wide text-ink-soft">
                items · {items.filter((i) => i.enabled).length} of {items.length} on
              </h2>
              <div className="space-y-2.5">
                {items.map((item, idx) => (
                  <ItemCard
                    key={idx}
                    item={item}
                    onChange={(patch) => updateItem(idx, patch)}
                  />
                ))}
              </div>
            </section>
          )}

          {notes.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 px-1 font-mono text-[11px] uppercase tracking-mono-wide text-ink-soft">
                notes · {notes.filter((n) => n.enabled).length} of {notes.length} on
              </h2>
              <div className="space-y-2.5">
                {notes.map((note, idx) => (
                  <NoteCard
                    key={idx}
                    note={note}
                    onChange={(patch) => updateNote(idx, patch)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {error && (
        <p className="mt-4 rounded-[12px] border-2 border-rose-deep bg-rose/20 px-3 py-2 text-[13px] text-ink">
          {error}
        </p>
      )}

      <div className="mt-6 mb-4 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-mono text-ink-soft">
          {enabledCount === 0 ? 'nothing to save' : `saving ${enabledCount}`}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={saving || enabledCount === 0}
          className="rounded-[14px] border-2 border-ink bg-peach-deep px-5 py-2.5 font-sans text-[15px] font-semibold text-ink shadow-card transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-card-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'saving…' : 'save'}
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// item card
// ----------------------------------------------------------------------------

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  reminder: 'reminder',
  task: 'task',
  note: 'note',
};

const CATEGORY_BG: Record<ItemCategory, string> = {
  reminder: 'bg-peach-deep',
  task: 'bg-butter',
  note: 'bg-mint',
};

function cycleCategory(cur: ItemCategory): ItemCategory {
  if (cur === 'reminder') return 'task';
  if (cur === 'task') return 'note';
  return 'reminder';
}

function ItemCard({
  item,
  onChange,
}: {
  item: EditableItem;
  onChange: (patch: Partial<EditableItem>) => void;
}) {
  const dayMismatch = item.flags.includes('day-mismatch');
  const pastDate = item.flags.includes('past-date');
  const lowConfidence = item.raw.confidence < 0.6;

  return (
    <div
      className={clsx(
        'overflow-hidden rounded-[14px] border-2 border-ink bg-surface shadow-card-sm transition-opacity',
        !item.enabled && 'opacity-50',
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b-[1.5px] border-dashed border-ink-faint bg-bg-soft px-3 py-1.5">
        <button
          type="button"
          onClick={() => onChange({ category: cycleCategory(item.category) })}
          className={clsx(
            'rounded-md border-2 border-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-mono',
            CATEGORY_BG[item.category],
          )}
          aria-label="cycle category"
        >
          {CATEGORY_LABEL[item.category]}
        </button>
        <div className="flex items-center gap-1.5">
          {lowConfidence && (
            <span
              className="rounded-md bg-butter px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-mono text-ink"
              title="low confidence — double-check this one"
            >
              guessed
            </span>
          )}
          <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] uppercase tracking-mono text-ink-soft">
            <input
              type="checkbox"
              checked={item.enabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
              className="h-4 w-4 accent-ink"
            />
            keep
          </label>
        </div>
      </div>

      <div className="space-y-2 p-3">
        <input
          type="text"
          value={item.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="what is this?"
          className="w-full border-b-2 border-dashed border-ink-faint bg-transparent pb-1 font-sans text-[15px] font-medium outline-none focus:border-ink"
        />

        {(item.category === 'reminder' || item.date || item.hour != null) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input
              type="date"
              value={item.date ?? ''}
              onChange={(e) => onChange({ date: e.target.value || null })}
              className="rounded-md border-2 border-ink bg-surface px-2 py-1 font-mono text-[12px] text-ink outline-none"
            />
            <input
              type="time"
              value={
                item.hour != null
                  ? `${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}`
                  : ''
              }
              onChange={(e) => {
                const v = e.target.value;
                if (!v) {
                  onChange({ hour: null, minute: 0 });
                  return;
                }
                const [hh, mm] = v.split(':').map((s) => parseInt(s, 10));
                onChange({ hour: hh, minute: mm || 0 });
              }}
              className="rounded-md border-2 border-ink bg-surface px-2 py-1 font-mono text-[12px] text-ink outline-none"
            />
          </div>
        )}

        {dayMismatch && item.raw.date_suggestions.length > 0 && (
          <div className="rounded-[10px] border border-dashed border-ink-faint bg-butter/40 px-2.5 py-2 text-[12px] text-ink">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-mono text-ink-soft">
              day vs date mismatch
            </div>
            <div className="mb-1 text-[12px]">
              page said "{item.raw.raw_text}" — that weekday and date don't
              line up. closest matches:
            </div>
            <div className="flex flex-wrap gap-1">
              {item.raw.date_suggestions.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onChange({ date: d })}
                  className={clsx(
                    'rounded-md border-2 border-ink px-2 py-0.5 font-mono text-[10px]',
                    item.date === d ? 'bg-peach-deep' : 'bg-surface',
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {pastDate && (
          <div className="font-mono text-[10px] uppercase tracking-mono text-ink-soft">
            heads up — date is in the past
          </div>
        )}
      </div>
    </div>
  );
}

function NoteCard({
  note,
  onChange,
}: {
  note: EditableNote;
  onChange: (patch: Partial<EditableNote>) => void;
}) {
  return (
    <div
      className={clsx(
        'overflow-hidden rounded-[14px] border-2 border-ink bg-surface shadow-card-sm transition-opacity',
        !note.enabled && 'opacity-50',
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b-[1.5px] border-dashed border-ink-faint bg-mint/60 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-mono text-ink">
          note block
        </span>
        <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] uppercase tracking-mono text-ink-soft">
          <input
            type="checkbox"
            checked={note.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            className="h-4 w-4 accent-ink"
          />
          keep
        </label>
      </div>
      <textarea
        value={note.text}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={Math.max(3, Math.min(10, note.text.split('\n').length + 1))}
        className="block w-full resize-y border-0 bg-transparent p-3 font-sans text-[14px] text-ink outline-none"
      />
    </div>
  );
}
