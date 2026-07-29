interface VariantChooserProps {
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  // Підпис приходить з категорії: «Смак», «Опір», «Колір».
  label?: string | null;
}

export function VariantChooser({ options, selected, onSelect, label }: VariantChooserProps) {
  if (options.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-500">{label || 'Смак'}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = option === selected;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onSelect(option)}
              aria-pressed={isSelected}
              className={
                isSelected
                  ? 'rounded-full border border-teal-500 bg-teal-500/90 px-4 py-2 text-sm font-semibold text-white shadow-sm'
                  : 'rounded-full border border-white/60 bg-white/40 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md transition hover:bg-white/65'
              }
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
