interface VariantChooserGroupProps {
  label: string;
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
}

function VariantChooserGroup({ label, options, selected, onSelect }: VariantChooserGroupProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-500">{label}</p>
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
                  ? 'rounded-full border border-emerald-500 bg-emerald-500/90 px-4 py-2 text-sm font-semibold text-white shadow-sm'
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

interface VariantChooserProps {
  tastes: string[];
  sizes: string[];
  selectedTaste: string | null;
  selectedSize: string | null;
  onTasteChange: (taste: string) => void;
  onSizeChange: (size: string) => void;
}

export function VariantChooser({
  tastes,
  sizes,
  selectedTaste,
  selectedSize,
  onTasteChange,
  onSizeChange,
}: VariantChooserProps) {
  if (tastes.length === 0 && sizes.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {tastes.length > 0 && (
        <VariantChooserGroup
          label="Смак"
          options={tastes}
          selected={selectedTaste}
          onSelect={onTasteChange}
        />
      )}
      {sizes.length > 0 && (
        <VariantChooserGroup
          label="Об'єм / розмір"
          options={sizes}
          selected={selectedSize}
          onSelect={onSizeChange}
        />
      )}
    </div>
  );
}
