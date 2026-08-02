import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface VariantChooserProps {
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  // Підпис приходить з категорії: «Смак», «Опір», «Колір».
  label?: string | null;
}

/* ── SVG icons (inline to avoid external deps) ──────────────── */

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7.5L10 12.5L15 7.5" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M13 13L17 17" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 10.5L8 14L15.5 6.5" />
    </svg>
  );
}

/* ── Mobile detection hook ──────────────────────────────────── */

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 640px), (hover: none) and (pointer: coarse)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    handler(mql);
    mql.addEventListener('change', handler as (e: MediaQueryListEvent) => void);
    return () => mql.removeEventListener('change', handler as (e: MediaQueryListEvent) => void);
  }, []);

  return isMobile;
}

/* ── Shared options list (used by both desktop & mobile) ───── */

interface OptionsListProps {
  options: string[];
  selected: string | null;
  query: string;
  focusedIndex: number;
  onSelect: (value: string) => void;
  onFocusIndex: (index: number) => void;
  listRef: React.RefObject<HTMLDivElement | null>;
}

function OptionsList({ options, selected, query, focusedIndex, onSelect, onFocusIndex, listRef }: OptionsListProps) {
  const filtered = useMemo(() => {
    const sorted = [...options].sort((a, b) => a.localeCompare(b, 'uk'));
    if (!query.trim()) return sorted;
    const q = query.trim().toLowerCase();
    return sorted.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  // Scroll focused option into view
  useEffect(() => {
    if (focusedIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[focusedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex, listRef]);

  if (filtered.length === 0) {
    return <div className="flavor-no-results">Нічого не знайдено</div>;
  }

  return (
    <div className="flavor-options" role="listbox" ref={listRef}>
      {filtered.map((option, i) => {
        const isSelected = option === selected;
        return (
          <div
            key={option}
            role="option"
            aria-selected={isSelected}
            data-focused={i === focusedIndex ? 'true' : undefined}
            className="flavor-option"
            onMouseEnter={() => onFocusIndex(i)}
            onMouseDown={(e) => {
              e.preventDefault(); // keep search focused
              onSelect(option);
            }}
          >
            <span className="flavor-option-text">{option}</span>
            {isSelected && <CheckIcon className="flavor-option-check" />}
          </div>
        );
      })}
    </div>
  );
}

/* ── Search bar (shared) ───────────────────────────────────── */

interface SearchBarProps {
  query: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onKeyDown?: React.KeyboardEventHandler;
}

function SearchBar({ query, onChange, inputRef, onKeyDown }: SearchBarProps) {
  return (
    <div className="flavor-search-wrap">
      <div className="flavor-search-inner">
        <SearchIcon className="flavor-search-icon" />
        <input
          ref={inputRef}
          type="text"
          className="flavor-search-input"
          placeholder="Пошук..."
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

/* ── Keyboard navigation hook ──────────────────────────────── */

function useFilteredOptions(options: string[], query: string) {
  return useMemo(() => {
    const sorted = [...options].sort((a, b) => a.localeCompare(b, 'uk'));
    if (!query.trim()) return sorted;
    const q = query.trim().toLowerCase();
    return sorted.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);
}

/* ── Desktop floating dropdown ─────────────────────────────── */

interface DesktopDropdownProps {
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

function DesktopDropdown({ options, selected, onSelect, onClose, triggerRef }: DesktopDropdownProps) {
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const filtered = useFilteredOptions(options, query);

  // Compute position from trigger
  useEffect(() => {
    function update() {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.top, left: rect.left, width: rect.width });
    }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [triggerRef]);

  // Autofocus the search input
  useEffect(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, triggerRef]);

  // Keyboard navigation
  const handleKeyDown: React.KeyboardEventHandler = useCallback(
    (e) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < filtered.length) {
            onSelect(filtered[focusedIndex]);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filtered, focusedIndex, onSelect, onClose],
  );

  // Reset focused index when query changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [query]);

  function handleSelect(value: string) {
    onSelect(value);
    onClose();
  }

  if (!pos) return null;

  return createPortal(
    <div
      className="flavor-menu"
      ref={menuRef}
      style={{ top: pos.top, left: pos.left, width: pos.width }}
    >
      <SearchBar query={query} onChange={setQuery} inputRef={searchRef} onKeyDown={handleKeyDown} />
      <OptionsList
        options={options}
        selected={selected}
        query={query}
        focusedIndex={focusedIndex}
        onSelect={handleSelect}
        onFocusIndex={setFocusedIndex}
        listRef={listRef}
      />
    </div>,
    document.body,
  );
}

/* ── Mobile bottom sheet ───────────────────────────────────── */

interface MobileSheetProps {
  label: string;
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
}

function MobileSheet({ label, options, selected, onSelect, onClose }: MobileSheetProps) {
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useFilteredOptions(options, query);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Autofocus search
  useEffect(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleKeyDown: React.KeyboardEventHandler = useCallback(
    (e) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < filtered.length) {
            onSelect(filtered[focusedIndex]);
            onClose();
          }
          break;
        // Escape handled globally
      }
    },
    [filtered, focusedIndex, onSelect, onClose],
  );

  useEffect(() => {
    setFocusedIndex(-1);
  }, [query]);

  function handleSelect(value: string) {
    onSelect(value);
    onClose();
  }

  return createPortal(
    <>
      <div className="flavor-sheet-backdrop" onClick={onClose} />
      <div className="flavor-sheet" role="dialog" aria-label={label}>
        <div className="flavor-sheet-handle" />
        <div className="flavor-sheet-header">
          <div className="flavor-sheet-title">{label}</div>
        </div>
        <SearchBar query={query} onChange={setQuery} inputRef={searchRef} onKeyDown={handleKeyDown} />
        <OptionsList
          options={options}
          selected={selected}
          query={query}
          focusedIndex={focusedIndex}
          onSelect={handleSelect}
          onFocusIndex={setFocusedIndex}
          listRef={listRef}
        />
      </div>
    </>,
    document.body,
  );
}

/* ── Main component ────────────────────────────────────────── */

export function VariantChooser({ options, selected, onSelect, label }: VariantChooserProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const displayLabel = label || 'Смак';

  const close = useCallback(() => {
    setIsOpen(false);
    // Return focus to trigger
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  if (options.length === 0) return null;

  return (
    <div>
      <span className="flavor-label">{displayLabel}</span>
      <div className="flavor-menu-wrapper">
        <button
          ref={triggerRef}
          type="button"
          className="flavor-trigger"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          {selected ? (
            <span className="flavor-trigger-text">{selected}</span>
          ) : (
            <span className="flavor-trigger-placeholder">Оберіть {displayLabel.toLowerCase()}</span>
          )}
          <ChevronDown className="flavor-trigger-chevron" />
        </button>

        {isOpen && !isMobile && (
          <DesktopDropdown options={options} selected={selected} onSelect={onSelect} onClose={close} triggerRef={triggerRef} />
        )}
      </div>

      {isOpen && isMobile && (
        <MobileSheet label={displayLabel} options={options} selected={selected} onSelect={onSelect} onClose={close} />
      )}
    </div>
  );
}
