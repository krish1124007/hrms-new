import { useState, type ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from './dialog';

function ConfirmHarness({ loading = false, onClose = vi.fn() }: { loading?: boolean; onClose?: () => void }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Lock cycle</button>
      <ConfirmDialog
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        onConfirm={vi.fn()}
        loading={loading}
        title="Lock the September payroll?"
        description="Locked payslips can no longer be edited."
        confirmLabel="Lock"
      />
    </>
  );
}

describe('Dialog accessibility', () => {
  it('is a named, described modal dialog that opens with focus on Cancel', async () => {
    const user = userEvent.setup();
    render(<ConfirmHarness />);
    await user.click(screen.getByRole('button', { name: 'Lock cycle' }));

    const dialog = await screen.findByRole('dialog', { name: 'Lock the September payroll?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Locked payslips can no longer be edited.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('keeps Tab inside the dialog and gives focus back to the trigger on close', async () => {
    const user = userEvent.setup();
    render(<ConfirmHarness />);
    const trigger = screen.getByRole('button', { name: 'Lock cycle' });
    await user.click(trigger);
    await screen.findByRole('dialog');

    // Cancel → Lock → (wraps to) × Close → Cancel …
    await user.tab();
    expect(screen.getByRole('button', { name: 'Lock' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Lock' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('ignores Esc, × and a click outside while the action is running', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ConfirmHarness loading onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Lock cycle' }));
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes only the innermost of two stacked dialogs on Esc', async () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <Dialog open onClose={outerClose}>
          <DialogHeader>
            <DialogTitle>Order ORD-1</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <input aria-label="Notes" />
          </DialogBody>
          <DialogFooter>
            <button>Close order</button>
          </DialogFooter>
        </Dialog>
        <Dialog open onClose={innerClose} size="sm">
          <DialogHeader>
            <DialogTitle>Cancel order ORD-1?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <button>Keep order</button>
          </DialogFooter>
        </Dialog>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Keep order' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
  });
});
