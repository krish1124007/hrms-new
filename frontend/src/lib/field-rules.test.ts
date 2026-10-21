import { describe, expect, it } from 'vitest';
import { allowedOrderActions, allowedPaymentActions } from './field-rules';

const rep = { canManage: false, myEmployeeId: 'e1' };
const manager = { canManage: true, myEmployeeId: 'm1' };

describe('allowedOrderActions', () => {
  it('lets only a field manager confirm and deliver', () => {
    expect(allowedOrderActions({ status: 'pending', employeeId: 'e1' }, rep)).toEqual(['cancelled']);
    expect(allowedOrderActions({ status: 'pending', employeeId: 'e1' }, manager)).toEqual(['confirmed', 'cancelled']);
    expect(allowedOrderActions({ status: 'confirmed', employeeId: 'e1' }, rep)).toEqual([]);
    expect(allowedOrderActions({ status: 'confirmed', employeeId: 'e1' }, manager)).toEqual(['delivered', 'cancelled']);
    expect(allowedOrderActions({ status: 'delivered', employeeId: 'e1' }, manager)).toEqual([]);
    expect(allowedOrderActions({ status: 'cancelled', employeeId: 'e1' }, manager)).toEqual([]);
  });

  it("does not let a rep cancel a colleague's order, and reads legacy statuses", () => {
    expect(allowedOrderActions({ status: 'pending', employeeId: { _id: 'e2', firstName: 'A', lastName: 'B' } }, rep)).toEqual([]);
    expect(allowedOrderActions({ status: 'draft', employeeId: { _id: 'e1', firstName: 'A', lastName: 'B' } }, rep)).toEqual(['cancelled']);
    expect(allowedOrderActions({ status: 'shipped', employeeId: 'e1' }, manager)).toEqual(['delivered', 'cancelled']);
  });
});

describe('allowedPaymentActions', () => {
  it('lets the collector deposit and only a manager verify, bounce or delete', () => {
    expect(allowedPaymentActions({ status: 'collected', employeeId: 'e1' }, rep)).toEqual(['deposit']);
    expect(allowedPaymentActions({ status: 'collected', employeeId: 'e2' }, rep)).toEqual([]);
    expect(allowedPaymentActions({ status: 'deposited', employeeId: 'e1' }, manager)).toEqual(['verify', 'bounce', 'delete']);
    expect(allowedPaymentActions({ status: 'verified', employeeId: 'e1' }, manager)).toEqual(['bounce', 'delete']);
  });
});
