export interface SelectOption {
  value: string;
  label: string;
}

/**
 * The app's dropdown: a native <select> (keyboard, menus and accessibility for
 * free) drawn in theme colors, since WebKit keeps the native control light in
 * dark mode. Sized to its content, so the chevron stays next to the text.
 */
export function Select({
  value,
  options,
  onChange,
  disabled,
  title,
}: {
  value: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <span className={`select${disabled ? " disabled" : ""}`} title={title}>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="select-chevron"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
      >
        <path
          d="M2 3.5 5 6.5 8 3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
