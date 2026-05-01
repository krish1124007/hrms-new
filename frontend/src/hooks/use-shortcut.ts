import { useEffect } from 'react';

/**
 * Register a keyboard shortcut that's auto-cleaned on unmount.
 *
 *   useShortcut('g d', () => navigate('/dashboard'));      // two-key sequence
 *   useShortcut('mod+k', () => openCommandPalette());      // modifier (Cmd/Ctrl)
 *   useShortcut('?',    () => setHelpOpen(true));          // single key
 *
 * `mod` = ⌘ on macOS, Ctrl on Windows/Linux.
 *
 * Ignores key events originating from inputs/textareas/contenteditable,
 * UNLESS the combo uses `mod` (so Cmd+K still works in a search field).
 *
 * Also registers the combo + label in the global shortcut registry so
 * `<ShortcutHelp />` can list everything currently bound. Pass an
 * optional `label` to describe what the shortcut does.
 */

export interface ShortcutBinding {
  combo: string;
  label?: string;
  group?: string;
}

const _registry = new Set<{ combo: string; label: string; group: string }>();

export function listShortcuts(): Array<{ combo: string; label: string; group: string }> {
  return [..._registry].sort((a, b) => a.group.localeCompare(b.group));
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

function normalise(combo: string): string[] {
  return combo
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((part) =>
      part
        .replace(/\bmod\b/g, isMac ? 'meta' : 'ctrl')
        .split('+')
        .sort()
        .join('+'),
    );
}

function matches(sequence: string[], combo: string): boolean {
  const target = normalise(combo);
  if (sequence.length < target.length) return false;
  return target.every((part, i) => sequence[sequence.length - target.length + i] === part);
}

function eventSignature(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.metaKey) parts.push('meta');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey && e.key.length > 1) parts.push('shift');
  // Use actual key (lowercased). Single-char keys are themselves; named keys
  // come through as e.g. "Enter", "Escape" — we lowercase for consistency.
  parts.push(e.key.toLowerCase());
  return parts.sort().join('+');
}

const sequenceBuffer: string[] = [];
let lastKeyAt = 0;
const SEQUENCE_TIMEOUT_MS = 1200;

export function useShortcut(
  combo: string,
  handler: (e: KeyboardEvent) => void,
  options: { label?: string; group?: string } = {},
): void {
  useEffect(() => {
    // Register in the help overlay
    const entry = {
      combo,
      label: options.label ?? combo,
      group: options.group ?? 'General',
    };
    _registry.add(entry);

    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const inEditableField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      // Never steal keystrokes from editable fields unless combo uses Cmd/Ctrl
      const usesMod = /mod\+|ctrl\+|meta\+/i.test(combo);
      if (inEditableField && !usesMod) return;

      // Append to rolling buffer for multi-key sequences (`g d`)
      const now = Date.now();
      if (now - lastKeyAt > SEQUENCE_TIMEOUT_MS) sequenceBuffer.length = 0;
      sequenceBuffer.push(eventSignature(e));
      lastKeyAt = now;
      if (sequenceBuffer.length > 4) sequenceBuffer.shift();

      if (matches(sequenceBuffer, combo)) {
        e.preventDefault();
        sequenceBuffer.length = 0;
        handler(e);
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      _registry.delete(entry);
    };
  }, [combo, handler, options.label, options.group]);
}

/** Return a pretty version of the combo for display (⌘K vs Ctrl+K). */
export function displayCombo(combo: string): string {
  return combo
    .split(/\s+/)
    .map((seq) =>
      seq
        .split('+')
        .map((part) => {
          if (part === 'mod') return isMac ? '⌘' : 'Ctrl';
          if (part === 'meta') return '⌘';
          if (part === 'ctrl') return 'Ctrl';
          if (part === 'shift') return '⇧';
          if (part === 'alt') return isMac ? '⌥' : 'Alt';
          if (part === 'enter') return '↵';
          if (part === 'escape') return 'Esc';
          return part.length === 1 ? part.toUpperCase() : part;
        })
        .join(isMac ? '' : '+'),
    )
    .join(' then ');
}
