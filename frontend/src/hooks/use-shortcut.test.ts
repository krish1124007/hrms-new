import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { listShortcuts, useShortcut } from './use-shortcut';

function press(...keys: string[]): void {
  for (const key of keys) {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }
}

describe('useShortcut', () => {
  it('fires a two-key sequence when several shortcuts are registered', () => {
    const help = vi.fn();
    const dashboard = vi.fn();
    const employees = vi.fn();
    const { unmount } = renderHook(() => {
      useShortcut('?', help);
      useShortcut('g d', dashboard);
      useShortcut('g e', employees);
    });

    press('g', 'e');
    expect(employees).toHaveBeenCalledTimes(1);
    press('g', 'd');
    expect(dashboard).toHaveBeenCalledTimes(1);
    expect(help).not.toHaveBeenCalled();
    unmount();
  });

  it('binds and lists nothing when enabled is false', () => {
    const settings = vi.fn();
    const { unmount } = renderHook(() => {
      useShortcut('?', vi.fn());
      useShortcut('g s', settings, { label: 'Go to settings', enabled: false });
    });

    press('g', 's');
    expect(settings).not.toHaveBeenCalled();
    expect(listShortcuts().map((s) => s.combo)).not.toContain('g s');
    unmount();
  });
});
