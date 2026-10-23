import { useState, type ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { buildRule, describeRule, emptyRuleDraft, ruleError, type RuleDraft } from '@/lib/field-schedule';
import { ScheduleRuleEditor } from './ScheduleRuleEditor';

function Harness({ onDraft }: { onDraft: (d: RuleDraft) => void }): ReactElement {
  const [draft, setDraft] = useState<RuleDraft>(() => emptyRuleDraft('2026-11-02'));
  return (
    <ScheduleRuleEditor
      value={draft}
      onChange={(next) => {
        setDraft(next);
        onDraft(next);
      }}
    />
  );
}

describe('ScheduleRuleEditor', () => {
  it('builds the rule for "every Mon and Thu"', async () => {
    const onDraft = vi.fn<(d: RuleDraft) => void>();
    const user = userEvent.setup();
    render(<Harness onDraft={onDraft} />);

    await user.selectOptions(screen.getByLabelText('Repeats'), 'weekly');
    // Thu first on purpose: the rule lists weekdays Mon → Sun.
    await user.click(screen.getByRole('button', { name: 'Thu' }));
    await user.click(screen.getByRole('button', { name: 'Mon' }));

    expect(screen.getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Thu' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tue' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/every mon and thu/i)).toBeInTheDocument();

    const draft = onDraft.mock.calls.at(-1)?.[0] as RuleDraft;
    expect(ruleError(draft)).toBeNull();
    expect(buildRule(draft)).toEqual({ freq: 'weekly', weekdays: [1, 4], startDate: '2026-11-02' });
  });

  it('builds a monthly rule with an end date, and refuses a weekly rule without days', async () => {
    const onDraft = vi.fn<(d: RuleDraft) => void>();
    const user = userEvent.setup();
    render(<Harness onDraft={onDraft} />);

    await user.selectOptions(screen.getByLabelText('Repeats'), 'monthly');
    const day = screen.getByLabelText('Day of the month');
    await user.clear(day);
    await user.type(day, '15');
    await user.type(screen.getByLabelText(/ends on/i), '2027-03-31');

    const draft = onDraft.mock.calls.at(-1)?.[0] as RuleDraft;
    expect(buildRule(draft)).toEqual({ freq: 'monthly', dayOfMonth: 15, startDate: '2026-11-02', endDate: '2027-03-31' });
    expect(describeRule(buildRule(draft))).toMatch(/monthly on day 15/i);

    expect(ruleError({ ...emptyRuleDraft('2026-11-02'), freq: 'weekly', weekdays: [] })).toMatch(/pick at least one day/i);
    expect(ruleError({ ...draft, endDate: '2026-10-01' })).toMatch(/end/i);
  });
});
