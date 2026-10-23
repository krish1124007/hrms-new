import { describe, expect, it } from 'vitest';
import { canEditSite, canManageTask } from './field-visits';

const HOUR = 3600_000;

describe('canEditSite', () => {
  // `createdBy` is the creator's login (a User id), as the server serialises it.
  const site = (createdById: string, ageHours: number) => ({
    createdBy: { _id: createdById, firstName: 'Ravi', lastName: 'Kumar' },
    createdAt: new Date(Date.now() - ageHours * HOUR).toISOString(),
  });

  it('lets the user who added the site edit it for 24 hours, by their user id', () => {
    expect(canEditSite(site('u1', 2), { canManage: false, myUserId: 'u1' })).toBe(true);
    expect(canEditSite(site('u1', 25), { canManage: false, myUserId: 'u1' })).toBe(false);
  });

  it('never matches someone else, or an unknown user', () => {
    expect(canEditSite(site('u1', 2), { canManage: false, myUserId: 'u2' })).toBe(false);
    expect(canEditSite(site('u1', 2), { canManage: false })).toBe(false);
    expect(canEditSite({ createdBy: null, createdAt: undefined }, { canManage: false, myUserId: 'u1' })).toBe(false);
  });

  it('lets a field manager edit any site at any time', () => {
    expect(canEditSite(site('u9', 500), { canManage: true, myUserId: 'u1' })).toBe(true);
  });
});

describe('canManageTask', () => {
  const me = { canManage: false, myUserId: 'u1', myEmployeeId: 'e1' };

  it('lets a field manager manage every task', () => {
    expect(canManageTask({ assignedTo: 'e1', createdBy: 'u9' }, { ...me, canManage: true })).toBe(true);
  });

  it('lets the creator manage the task, even one assigned to themselves', () => {
    expect(canManageTask({ assignedTo: 'e1', createdBy: 'u1' }, me)).toBe(true);
  });

  it("lets the assignee's manager manage their direct report's task", () => {
    expect(
      canManageTask({ assignedTo: { _id: 'e2', firstName: 'Asha', lastName: 'Rao' }, createdBy: 'u9' }, me),
    ).toBe(true);
  });

  it('does not let the assignee manage a task someone else gave them', () => {
    expect(canManageTask({ assignedTo: 'e1', createdBy: 'u9' }, me)).toBe(false);
  });

  it('decides nothing for the team before the own employee record is known', () => {
    expect(canManageTask({ assignedTo: 'e2', createdBy: 'u9' }, { canManage: false, myUserId: 'u1' })).toBe(false);
  });
});
