import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type Ref,
} from 'react';
import clsx from 'clsx';

export interface SuggestItem {
  key: string;
  label: string;
  desc?: string;
  icon?: string;
  onSelect: () => void;
}

export interface SuggestListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface Props {
  items: SuggestItem[];
  empty?: string;
}

function SuggestList(
  { items, empty = 'no matches' }: Props,
  ref: Ref<SuggestListHandle>,
) {
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    setSelected(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) {
        if (event.key === 'Escape') return true;
        return false;
      }
      if (event.key === 'ArrowDown') {
        setSelected((s) => (s + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setSelected((s) => (s - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const it = items[selected];
        if (it) it.onSelect();
        return true;
      }
      if (event.key === 'Escape') return true;
      return false;
    },
  }));

  return (
    <div className="suggest-popup">
      {items.length === 0 ? (
        <div className="suggest-empty">{empty}</div>
      ) : (
        items.map((it, i) => (
          <div
            key={it.key}
            className={clsx('suggest-item', i === selected && 'is-selected')}
            onMouseEnter={() => setSelected(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              it.onSelect();
            }}
          >
            {it.icon && <span className="ico">{it.icon}</span>}
            <span className="label">{it.label}</span>
            {it.desc && <span className="desc">{it.desc}</span>}
          </div>
        ))
      )}
    </div>
  );
}

export default forwardRef(SuggestList);
