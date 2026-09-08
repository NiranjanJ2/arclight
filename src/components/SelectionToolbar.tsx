import { AlignLeft, CircleHelp, Highlighter, List, Sprout } from 'lucide-react'
import type { SerializedSelection } from '../types/paper'

export type SelectionAction = 'highlight' | 'summarize' | 'bullets' | 'simplify' | 'ask'

export interface ActiveSelection extends SerializedSelection {
  x: number
  y: number
}

interface SelectionToolbarProps {
  selection: ActiveSelection
  onAction: (action: SelectionAction, selection: ActiveSelection) => void
}

export function SelectionToolbar({ selection, onAction }: SelectionToolbarProps) {
  const items: Array<{ action: SelectionAction; label: string; accessibleLabel: string; icon: typeof Highlighter }> = [
    { action: 'highlight', label: 'Highlight', accessibleLabel: 'Keep highlight', icon: Highlighter },
    { action: 'summarize', label: 'Summarize', accessibleLabel: 'Summarize selection', icon: AlignLeft },
    { action: 'bullets', label: 'Bullets', accessibleLabel: 'Turn selection into bullets', icon: List },
    { action: 'simplify', label: 'Simplify', accessibleLabel: 'Explain selection simply', icon: Sprout },
    { action: 'ask', label: 'Ask Arc', accessibleLabel: 'Ask Arc about selection', icon: CircleHelp },
  ]
  return (
    <div className="selection-toolbar" role="toolbar" aria-label="Selection actions" style={{ left: selection.x, top: selection.y }}>
      {items.map(({ action, label, accessibleLabel, icon: Icon }) => (
        <button key={action} aria-label={accessibleLabel} onClick={() => onAction(action, selection)}>
          <Icon size={16} /> <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
