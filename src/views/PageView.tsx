import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePage } from '../hooks/usePage';
import PageEditor from '../components/editor/PageEditor';
import ActionRow, { type ActionKey } from '../components/page/ActionRow';
import ChecklistSection from '../components/page/ChecklistSection';
import ChildPages from '../components/page/ChildPages';
import Backlinks from '../components/page/Backlinks';
import PagePickerSheet from '../components/page/PagePickerSheet';
import TimerSheet from '../components/page/TimerSheet';
import TimerChip from '../components/page/TimerChip';
import SummaryPopup from '../components/page/SummaryPopup';
import StuckCard from '../components/page/StuckCard';
import BreakDownSheet from '../components/page/BreakDownSheet';
import ReminderSheet from '../components/page/ReminderSheet';
import RemindersStrip from '../components/page/RemindersStrip';
import SnoozeSheet from '../components/page/SnoozeSheet';
import IconButton from '../components/ui/IconButton';
import { supabase } from '../lib/supabase';
import {
  addPageLink,
  completeTask,
  deletePage,
  getPage,
  recordWin,
  updatePage,
} from '../lib/db';
import type {
  ChecklistItem,
  Page,
  TaskProperties,
  TiptapDoc,
} from '../lib/types';
import { aiPullFromPage } from '../lib/ai';
import { docToPlaintext, snippet } from '../lib/tiptap';

function makeId() {
  return (
    crypto.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}

export default function PageView() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { page, save } = usePage(id);
  const [parent, setParent] = useState<Page | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const titleTimer = useRef<number | null>(null);

  const [timerOpen, setTimerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [breakDownOpen, setBreakDownOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [remindersVersion, setRemindersVersion] = useState(0);
  const [childrenVersion, setChildrenVersion] = useState(0);
  const [pullToast, setPullToast] = useState<string | null>(null);
  const [activeTimer, setActiveTimer] = useState<{
    minutes: number;
    countUp: boolean;
    notify: boolean;
  } | null>(null);

  const [sessionStart] = useState<number>(Date.now());
  const [sessionTicks, setSessionTicks] = useState<Array<{ id: string; text: string }>>([]);
  const [summary, setSummary] = useState(false);
  const [pulling, setPulling] = useState(false);

  // load parent for breadcrumb
  useEffect(() => {
    if (!page?.parent_id) {
      setParent(null);
      return;
    }
    let cancelled = false;
    getPage(page.parent_id).then((p) => {
      if (!cancelled) setParent(p);
    });
    return () => {
      cancelled = true;
    };
  }, [page?.parent_id]);

  // hydrate title draft when page loads / changes
  useEffect(() => {
    if (page) setTitleDraft(page.title);
  }, [page?.id]);

  const isTask = page?.type === 'task';
  const taskProps = (page?.properties as TaskProperties | undefined) ?? {};
  const checklist: ChecklistItem[] = taskProps.checklist ?? [];

  const onTitleChange = (val: string) => {
    setTitleDraft(val);
    if (!id) return;
    if (titleTimer.current) window.clearTimeout(titleTimer.current);
    titleTimer.current = window.setTimeout(() => {
      void save({ title: val });
    }, 500);
  };

  const onBodySave = useCallback(
    async (body: TiptapDoc) => {
      if (!id) return;
      await updatePage(id, { body });
    },
    [id],
  );

  const onChecklistChange = async (next: ChecklistItem[], toggled?: ChecklistItem) => {
    if (!page) return;
    const nextProps = { ...taskProps, checklist: next };
    await save({ properties: nextProps });
    if (toggled?.done) {
      setSessionTicks((cur) => [...cur, { id: toggled.id, text: toggled.text }]);
      void recordWin({
        source_type: 'checklist_item',
        source_id: page.id,
        text: toggled.text,
      }).catch(() => {});
    } else if (toggled && !toggled.done) {
      setSessionTicks((cur) => cur.filter((c) => c.id !== toggled.id));
    }
  };

  const onAction = async (key: ActionKey) => {
    if (key === 'timer') setTimerOpen(true);
    if (key === 'page-link') setPickerOpen(true);
    if (key === 'reminder') setReminderOpen(true);
    if (key === 'snooze') setSnoozeOpen(true);
  };

  const onPickPageToLink = async (target: Page) => {
    if (!page) return;
    try {
      await supabase.from('page_actions').insert({
        page_id: page.id,
        type: 'url_link',
        payload: { page_id: target.id, title: target.title },
      });
      await addPageLink(page.id, target.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[link page]', err);
    }
  };

  const close = () => {
    if (sessionTicks.length > 0) {
      setSummary(true);
    } else {
      nav(-1);
    }
  };

  const onSummaryMarkDone = async () => {
    if (page) await completeTask(page.id, page.title || 'untitled task');
    setSummary(false);
    nav(-1);
  };

  const handleBreakDownAccept = async (steps: string[]) => {
    if (!page) return;
    const newItems: ChecklistItem[] = steps.map((text) => ({
      id: makeId(),
      text,
      done: false,
    }));
    const next = [...checklist, ...newItems];
    await save({ properties: { ...taskProps, checklist: next } });
  };

  const pullFromPage = async () => {
    if (!page) return;
    setPulling(true);
    setPullToast(null);
    try {
      const r = await aiPullFromPage(page.id);
      if (!r.tasks || r.tasks.length === 0) {
        setPullToast('no tasks found in this page');
        return;
      }
      let inserted = 0;
      let failed = 0;
      for (const t of r.tasks) {
        const { error } = await supabase.from('pages').insert({
          owner_id: page.owner_id,
          parent_id: page.id,
          type: 'task',
          title: t.title,
          body: {
            type: 'doc',
            content: t.body_text
              ? [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: t.body_text }],
                  },
                ]
              : [],
          },
          properties: { status: 'today' },
        });
        if (error) {
          failed += 1;
          // eslint-disable-next-line no-console
          console.error('[pull tasks insert]', error);
        } else {
          inserted += 1;
        }
      }
      if (inserted > 0) {
        setChildrenVersion((v) => v + 1);
        setPullToast(
          `✓ added ${inserted} task${inserted === 1 ? '' : 's'}${failed ? ` · ${failed} failed` : ''}`,
        );
      } else if (failed > 0) {
        setPullToast(`✕ ${failed} task${failed === 1 ? '' : 's'} failed to save`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[pull tasks]', err);
      setPullToast(`✕ ai error: ${msg.slice(0, 80)}`);
    } finally {
      setPulling(false);
      // auto-clear toast after a beat
      window.setTimeout(() => setPullToast(null), 4500);
    }
  };

  const onDelete = async () => {
    if (!page) return;
    if (!window.confirm('delete this page? this can\'t be undone yet.')) return;
    await deletePage(page.id);
    nav(-1);
  };

  const ctxLabel = useMemo(() => {
    if (parent) return parent.title || 'untitled';
    if (page?.type === 'task') return 'inbox';
    return page?.type ?? '';
  }, [parent, page?.type]);

  if (!page) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <span className="font-mono text-sm uppercase tracking-mono text-ink-soft">
          loading page…
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] animate-pageIn pb-24 pt-3">
      <div className="view-mid">
      {/* top bar */}
      <div className="flex items-center justify-between px-3.5 pb-3">
        <button
          onClick={close}
          className="flex items-center gap-1.5 rounded-[11px] border-2 border-ink bg-surface px-3 py-1.5 font-mono text-[13px] uppercase tracking-mono shadow-card-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
        >
          ←
        </button>
        <Link
          to={parent ? `/page/${parent.id}` : '/focus'}
          className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-mono text-ink-soft"
        >
          <span className="block h-[9px] w-[9px] rounded-full border-[1.5px] border-ink bg-sky-deep" />
          <span>{ctxLabel}</span>
        </Link>
        <IconButton aria-label="page menu" onClick={onDelete} title="delete page">
          ⋯
        </IconButton>
      </div>

      {/* title */}
      <TitleInput value={titleDraft} onChange={onTitleChange} />

      {/* task-only stuff */}
      {isTask && (
        <>
          <ActionRow onAction={onAction} />
          <RemindersStrip pageId={page.id} refreshKey={remindersVersion} />
          {activeTimer && (
            <TimerChip
              minutes={activeTimer.minutes}
              countUp={activeTimer.countUp}
              notify={activeTimer.notify}
              taskTitle={page.title}
              parentLabel={parent?.title}
              onStop={() => setActiveTimer(null)}
            />
          )}
          <StuckCard
            pageId={page.id}
            onAddToChecklist={async (text) => {
              const next: ChecklistItem[] = [
                ...checklist,
                { id: makeId(), text, done: false },
              ];
              await save({ properties: { ...taskProps, checklist: next } });
            }}
          />
          {checklist.length === 0 && (
            <div className="mx-3.5 mb-3">
              <button
                onClick={() => setBreakDownOpen(true)}
                className="pill-action"
              >
                <span className="text-coral">✦</span> break this down
              </button>
            </div>
          )}
        </>
      )}

      {/* body editor */}
      <div className="mb-4 px-3.5">
        <PageEditor
          pageId={page.id}
          initialBody={page.body}
          onSave={onBodySave}
          placeholder={
            page.type === 'note'
              ? 'capture the thought…'
              : 'any notes, links, plans, anything…'
          }
        />
      </div>

      {isTask && checklist.length > 0 && (
        <ChecklistSection items={checklist} onChange={onChecklistChange} />
      )}

      {/* pull tasks from page (works on any page type) */}
      {(page.type === 'note' || page.type === 'plain' || isTask) && (
        <div className="mx-3.5 mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={pullFromPage}
            disabled={pulling}
            className="pill-action"
          >
            <span className="text-coral">✦</span>
            {pulling ? 'pulling…' : 'pull tasks from this'}
          </button>
          {pullToast && (
            <span
              className={
                'inline-flex items-center rounded-pill border-[1.5px] border-ink px-3 py-1 text-[12px] font-medium shadow-card-sm transition-opacity ' +
                (pullToast.startsWith('✓') ? 'bg-mint' : pullToast.startsWith('no ') ? 'bg-bg-soft' : 'bg-rose')
              }
            >
              {pullToast}
            </span>
          )}
        </div>
      )}

      <ChildPages parentId={page.id} parentType={page.type} refreshKey={childrenVersion} />
      <Backlinks pageId={page.id} />

      {/* close fab */}
      <button
        onClick={close}
        className="fixed bottom-[18px] right-[18px] z-[81] rounded-[14px] border-2 border-ink bg-ink px-5 py-3 font-sans text-[14px] font-bold text-bg shadow-mint active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
      >
        close ✓
      </button>

      {/* sheets / popups */}
      <TimerSheet
        open={timerOpen}
        onClose={() => setTimerOpen(false)}
        onStart={(opts) => setActiveTimer(opts)}
      />
      <ReminderSheet
        open={reminderOpen}
        pageId={page.id}
        pageTitle={page.title}
        onClose={() => setReminderOpen(false)}
        onSaved={() => setRemindersVersion((v) => v + 1)}
      />
      <SnoozeSheet
        open={snoozeOpen}
        page={page}
        onClose={() => setSnoozeOpen(false)}
        onSnoozed={() => {
          // refresh page so the snoozed_until shows in subsequent loads
          void save({});
        }}
      />
      <PagePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={onPickPageToLink}
        excludeId={page.id}
      />
      {breakDownOpen && (
        <BreakDownSheet
          open={breakDownOpen}
          pageId={page.id}
          onClose={() => setBreakDownOpen(false)}
          onAccept={handleBreakDownAccept}
        />
      )}
      <SummaryPopup
        open={summary}
        items={sessionTicks}
        durationMin={Math.max(1, Math.round((Date.now() - sessionStart) / 60000))}
        onDismiss={() => {
          setSummary(false);
          nav(-1);
        }}
        onKeepOpen={() => {
          setSummary(false);
          nav(-1);
        }}
        onMarkDone={onSummaryMarkDone}
      />
      </div>
    </div>
  );
}

function TitleInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(56, el.scrollHeight) + 'px';
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="untitled"
      className="mx-3.5 mb-5 block w-[calc(100%-28px)] resize-none overflow-hidden border-none bg-transparent p-0 font-serif text-[34px] font-semibold leading-tight tracking-[-0.015em] text-ink outline-none placeholder:text-ink-faint"
    />
  );
}

// silence unused import warning if docToPlaintext/snippet end up not used here
void docToPlaintext;
void snippet;
