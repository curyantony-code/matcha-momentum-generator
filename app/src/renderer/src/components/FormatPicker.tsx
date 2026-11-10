import { FORMAT_OPTIONS, formatOption, type VideoFormat } from '../../../shared/formats'

interface FormatPickerProps {
  value: VideoFormat
  onChange: (format: VideoFormat) => void
  disabled?: boolean
  testid?: string
}

/** What kind of video it is: a vertical short, a horizontal short or long-form, with what that means under it. */
export function FormatPicker({ value, onChange, disabled, testid = 'format-picker' }: FormatPickerProps) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="seg" role="group" aria-label="What kind of video" data-testid={testid}>
        {FORMAT_OPTIONS.map((f) => (
          <button
            key={f.key}
            className={f.key === value ? 'on' : undefined}
            aria-pressed={f.key === value}
            disabled={disabled}
            onClick={() => f.key !== value && onChange(f.key)}
            data-testid={`${testid}-${f.key}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="muted-sm" data-testid={`${testid}-hint`}>
        {formatOption(value).hint}
      </p>
    </div>
  )
}
