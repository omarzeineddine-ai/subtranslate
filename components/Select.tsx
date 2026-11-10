"use client";

import React, { useState, useRef, useEffect, useCallback, useId } from "react";

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  ariaLabelledBy?: string;
  /** Placeholder of the search box; "Search…" by default. */
  searchPlaceholder?: string;
  /** Shown in place of the list when the search matches nothing; "No matches" by default. */
  emptyMessage?: string;
  /** Name of the list for screen readers; "Options" by default. */
  listLabel?: string;
}

/** Options a Page Up or Page Down press moves by; the list shows about that many. */
const PAGE_STEP = 10;

export function Select({
  value, onChange, options, placeholder = "Select…", ariaLabelledBy,
  searchPlaceholder = "Search…", emptyMessage = "No matches", listLabel = "Options",
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** False while the pointer is what moved the active option. Scrolling then
   * would shift the list under a still pointer, which enters the next option
   * and scrolls again, so only a keyboard move scrolls the option into view. */
  const scrollToActive = useRef(true);

  const selectedOption = options.find((opt) => opt.value === value);
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false); setSearch(""); setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => { if (isOpen && inputRef.current) inputRef.current.focus(); }, [isOpen]);
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current && scrollToActive.current) {
      listRef.current.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, isOpen]);

  // Open with the current choice active, as a native select does: the arrow
  // keys move on from it and the effect above scrolls it into view. The
  // search starts empty, so its index in the full list is its index here.
  const open = () => {
    scrollToActive.current = true;
    setIsOpen(true); setSearch("");
    setActiveIndex(options.findIndex((opt) => opt.value === value));
  };

  // Picking an option or pressing Escape unmounts the search box that holds
  // focus; hand focus back to the trigger so Tab carries on from the picker
  // instead of from the top of the page.
  const closeToTrigger = useCallback(() => {
    setIsOpen(false); setSearch(""); setActiveIndex(-1);
    triggerRef.current?.focus();
  }, []);

  const handleSelect = useCallback((v: string) => {
    onChange(v); closeToTrigger();
  }, [onChange, closeToTrigger]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    scrollToActive.current = true;
    // On the closed trigger, Enter and the arrows open the list, as a
    // native select does; open, Home, End and the Page keys move through it
    // as they do in one.
    if (!isOpen && (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); open(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((p) => Math.min(p + 1, filteredOptions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((p) => Math.max(p - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setActiveIndex(filteredOptions.length ? 0 : -1); }
    else if (e.key === "End") { e.preventDefault(); setActiveIndex(filteredOptions.length - 1); }
    else if (e.key === "PageDown") { e.preventDefault(); setActiveIndex((p) => Math.min(p + PAGE_STEP, filteredOptions.length - 1)); }
    else if (e.key === "PageUp") { e.preventDefault(); setActiveIndex((p) => Math.max(p - PAGE_STEP, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (activeIndex >= 0 && activeIndex < filteredOptions.length) handleSelect(filteredOptions[activeIndex].value); }
    else if (e.key === "Escape") { e.preventDefault(); closeToTrigger(); }
  };

  // Close once focus leaves the picker (Tab out of the search box), so the
  // list does not stay open over the fields below.
  const handleBlur = (e: React.FocusEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
      setIsOpen(false); setSearch(""); setActiveIndex(-1);
    }
  };

  // While open, a press on the trigger or in the list keeps focus in the
  // search box. Safari does not focus a clicked button, so without this the
  // blur above would close the list before an option's click could land.
  const keepFocus = (e: React.MouseEvent) => {
    if (isOpen) e.preventDefault();
  };

  // Ids unique to this picker, so two on one page do not point their
  // combobox at each other's list.
  const listboxId = useId();
  const triggerId = `${listboxId}-trigger`;
  const activeOptionId = activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined;

  return (
    <div ref={containerRef} className="relative w-full">
      {/* The key, blur and press handlers sit on the controls that take
          focus, the trigger and the search box, rather than on the wrapper. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onMouseDown={keepFocus}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        // The label and then the trigger itself, so the name a screen reader
        // reads is "Target language Spanish": with the label alone the
        // current choice, which is the button's text, was not announced.
        id={triggerId}
        aria-labelledby={ariaLabelledBy ? `${ariaLabelledBy} ${triggerId}` : undefined}
        className={`
          w-full flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm text-left
          ring-1 transition-colors duration-200
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50
          ${isOpen ? "ring-[var(--border-hover)] bg-card" : "ring-[var(--ring)] bg-card hover:ring-[var(--border-hover)]"}
          ${value ? "text-primary" : "text-muted"}
        `}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <svg className={`w-4 h-4 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 rounded-xl ring-1 ring-[var(--ring)] bg-card shadow-thick overflow-hidden">
          <div className="p-2 border-b border-[var(--border)]">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                // Typing puts the first match under Enter, as a native select
                // does when its options are typed at; clearing the search goes
                // back to the current choice, as opening does.
                const next = e.target.value;
                scrollToActive.current = true;
                setSearch(next);
                const lower = next.toLowerCase();
                setActiveIndex(
                  !next ? options.findIndex((opt) => opt.value === value)
                  : options.some((opt) => opt.label.toLowerCase().includes(lower)) ? 0
                  : -1,
                );
              }}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              placeholder={searchPlaceholder}
              // A placeholder is not a name: without this the box announced
              // as an unlabelled edit field, and the list it filters was the
              // only clue to what it is for.
              aria-label={searchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              aria-autocomplete="list"
              className="w-full px-3 py-2 text-sm bg-elevated rounded-lg text-primary placeholder:text-muted border-0 focus:outline-none focus:ring-1 focus:ring-[var(--border-hover)]"
            />
          </div>
          <div ref={listRef} id={listboxId} role="listbox" aria-label={listLabel} onMouseDown={keepFocus} className="max-h-60 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted">{emptyMessage}</div>
            ) : (
              filteredOptions.map((option, i) => {
                const isSelected = option.value === value;
                const isActive = i === activeIndex;
                return (
                  <button
                    key={option.value}
                    id={`${listboxId}-opt-${i}`}
                    data-index={i}
                    type="button"
                    role="option"
                    // Out of the Tab order: the search box owns the keyboard
                    // through aria-activedescendant, and Tab leaves the picker.
                    tabIndex={-1}
                    aria-selected={isSelected}
                    onClick={() => handleSelect(option.value)}
                    onMouseEnter={() => { scrollToActive.current = false; setActiveIndex(i); }}
                    className={`
                      w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-left transition-colors
                      ${isSelected ? "bg-blue-500 text-white" : isActive ? "bg-elevated text-primary" : "text-secondary hover:bg-elevated hover:text-primary"}
                    `}
                  >
                    {isSelected ? (
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="w-4 flex-shrink-0" />
                    )}
                    <span>{option.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
