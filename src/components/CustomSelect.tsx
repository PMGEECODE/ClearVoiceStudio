"use client";

import React, { useState, useRef, useEffect, useId } from "react";
import { ChevronDown, Check, Search } from "lucide-react";

export interface SelectOption<T extends string | number = string | number> {
  value: T;
  label: string;
  sublabel?: string;
  badge?: string;
  disabled?: boolean;
}

export interface CustomSelectProps<T extends string | number = string | number> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  menuMaxHeight?: number;
  id?: string;
  title?: string;
  searchable?: boolean;
  compact?: boolean;
}

export function CustomSelect<T extends string | number = string | number>({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select an option...",
  className = "",
  style,
  menuMaxHeight = 220,
  id,
  title,
  searchable,
  compact = false,
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const generatedId = useId();
  const selectId = id || generatedId;

  // Enable search automatically when more than 8 options exist
  const isSearchEnabled = searchable ?? options.length > 8;

  // Filter options if search query is present
  const filteredOptions = React.useMemo(() => {
    if (!isSearchEnabled || !searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
        (opt.badge && opt.badge.toLowerCase().includes(q))
    );
  }, [options, isSearchEnabled, searchQuery]);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && isSearchEnabled) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, isSearchEnabled]);

  // Reset highlight index when opening or filtering
  useEffect(() => {
    if (isOpen) {
      const idx = filteredOptions.findIndex((opt) => opt.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, filteredOptions, value]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || highlightedIndex < 0 || !listboxRef.current) return;
    const items = listboxRef.current.querySelectorAll("[role='option']");
    const item = items[highlightedIndex] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, isOpen]);

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
      setSearchQuery("");
    }
  };

  const handleSelect = (val: T) => {
    onChange(val);
    setIsOpen(false);
    setSearchQuery("");
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
        break;
      case "Home":
        e.preventDefault();
        setHighlightedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setHighlightedIndex(filteredOptions.length - 1);
        break;
      case "Enter":
      case " ":
        if (e.target === searchInputRef.current && e.key === " ") {
          // Allow spaces in search input
          return;
        }
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          const opt = filteredOptions[highlightedIndex];
          if (!opt.disabled) {
            handleSelect(opt.value);
          }
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery("");
        triggerRef.current?.focus();
        break;
      case "Tab":
        setIsOpen(false);
        setSearchQuery("");
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      className={`custom-select-container ${className}`}
      style={{
        position: "relative",
        width: "100%",
        zIndex: isOpen ? 50 : "auto",
        ...style,
      }}
      onKeyDown={handleKeyDown}
      title={title}
    >
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        id={selectId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${selectId}-listbox`}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={handleToggle}
        className="custom-select-trigger"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          background: "#0f1422",
          border: `1px solid ${isOpen ? "var(--border-focus)" : "var(--border-subtle)"}`,
          borderRadius: "var(--radius-sm)",
          color: disabled ? "var(--text-dim)" : "var(--text-main)",
          padding: compact ? "0.3rem 0.6rem" : "0.45rem 0.65rem",
          fontSize: compact ? "0.76rem" : "0.82rem",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          outline: "none",
          transition: "var(--transition)",
          textAlign: "left",
          boxShadow: isOpen ? "0 0 0 1px var(--border-focus)" : "none",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {selectedOption ? (
            <>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: 500,
                }}
              >
                {selectedOption.label}
              </span>
              {selectedOption.badge && (
                <span
                  style={{
                    fontSize: "0.68rem",
                    padding: "0.1rem 0.35rem",
                    borderRadius: "3px",
                    background: "rgba(45, 212, 191, 0.15)",
                    color: "var(--accent-primary)",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {selectedOption.badge}
                </span>
              )}
            </>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>{placeholder}</span>
          )}
        </span>

        <ChevronDown
          size={14}
          style={{
            flexShrink: 0,
            color: "var(--text-muted)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="custom-select-menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 9999,
            background: "#0c101c",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            boxShadow:
              "0 12px 32px -4px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06)",
            overflow: "hidden",
            animation: "selectDropdownFade 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Optional fast search filter */}
          {isSearchEnabled && (
            <div
              style={{
                padding: "0.4rem 0.5rem",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                background: "rgba(10, 14, 23, 0.7)",
              }}
            >
              <Search size={12} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                placeholder="Type to filter..."
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-main)",
                  fontSize: "0.78rem",
                  outline: "none",
                }}
              />
            </div>
          )}

          {/* Options List */}
          <ul
            ref={listboxRef}
            id={`${selectId}-listbox`}
            role="listbox"
            aria-labelledby={selectId}
            style={{
              maxHeight: `${menuMaxHeight}px`,
              overflowY: "auto",
              margin: 0,
              padding: "0.25rem 0",
              listStyle: "none",
            }}
          >
            {filteredOptions.length === 0 ? (
              <li
                style={{
                  padding: "0.6rem 0.75rem",
                  fontSize: "0.78rem",
                  color: "var(--text-dim)",
                  textAlign: "center",
                }}
              >
                No matching options
              </li>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <li
                    key={String(opt.value)}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled}
                    onClick={() => {
                      if (!opt.disabled) {
                        handleSelect(opt.value);
                      }
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    style={{
                      padding: compact ? "0.35rem 0.6rem" : "0.45rem 0.65rem",
                      fontSize: compact ? "0.75rem" : "0.8rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      cursor: opt.disabled ? "not-allowed" : "pointer",
                      background: isHighlighted
                        ? "rgba(45, 212, 191, 0.12)"
                        : isSelected
                        ? "rgba(45, 212, 191, 0.06)"
                        : "transparent",
                      color: isSelected
                        ? "var(--accent-primary)"
                        : opt.disabled
                        ? "var(--text-dim)"
                        : "var(--text-main)",
                      opacity: opt.disabled ? 0.5 : 1,
                      transition: "background 0.1s ease, color 0.1s ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.1rem",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          overflow: "hidden",
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontWeight: isSelected ? 600 : 400,
                          }}
                        >
                          {opt.label}
                        </span>
                        {opt.badge && (
                          <span
                            style={{
                              fontSize: "0.65rem",
                              padding: "0.05rem 0.3rem",
                              borderRadius: "2px",
                              background: "rgba(45, 212, 191, 0.15)",
                              color: "var(--accent-primary)",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {opt.sublabel && (
                        <span
                          style={{
                            fontSize: "0.7rem",
                            color: isSelected ? "rgba(45, 212, 191, 0.8)" : "var(--text-dim)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {opt.sublabel}
                        </span>
                      )}
                    </div>

                    {isSelected && (
                      <Check
                        size={13}
                        style={{
                          flexShrink: 0,
                          color: "var(--accent-primary)",
                        }}
                      />
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
