import { format } from 'date-fns';
import IconButton from './IconButton';

interface Props {
  onAdd?: () => void;
  onProgress?: () => void;
  right?: 'default' | 'minimal';
}

export default function TopStrip({ onAdd, onProgress, right = 'default' }: Props) {
  const now = new Date();
  const stamp = format(now, 'EEE d MMM · h:mma').toUpperCase();
  return (
    <div className="flex items-center justify-between px-3.5 pb-3.5 pt-3">
      <span className="font-mono text-[13px] uppercase tracking-mono text-ink-soft">
        {stamp}
      </span>
      {right === 'default' && (
        <div className="flex gap-1.5">
          {onProgress && (
            <IconButton aria-label="progress" onClick={onProgress}>
              ▲
            </IconButton>
          )}
          {onAdd && (
            <IconButton aria-label="add" onClick={onAdd}>
              +
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}
