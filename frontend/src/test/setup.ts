import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// findBy* / waitFor give up after 1 s by default — too tight for a page whose
// queries resolve through React Query on a loaded machine.
configure({ asyncUtilTimeout: 5000 });

// Testing Library only auto-cleans when test globals are enabled; they are not.
afterEach(() => {
  cleanup();
});

// jsdom has no ResizeObserver; components that measure themselves (e.g.
// ExpandableText) only need it to exist.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}
