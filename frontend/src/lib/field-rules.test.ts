import { describe, expect, it } from 'vitest';
import { allowedOrderActions, allowedPaymentActions } from './field-rules';

const rep = { canManage: false, myEmployeeId: 'e1' };
const manager = { canManage: true, myEmployeeId: 'm1' };
const ref = (id: string) => ({ _id: id, firstName: 'A', lastName: 'B' });

describe('allowedOrderActions', () => {
  it('lets only a field manager confirm and deliver', () => {
    expect(allowedOrderActions({ status: 'pending', employeeId: 'e1', paymentStatus: 'pending' }, rep)).toEqual(['cancelled']);
    expect(allowedOrderActions({ status: 'pending', employeeId: 'e1', paymentStatus: 'pending' }, manager)).toEqual([
      'confirmed',
      'cancelled',
    ]);
    expect(allowedOrderActions({ status: 'confirmed', employeeId: 'e1', paymentStatus: 'pending' }, rep)).toEqual([]);
    expect(allowedOrderActions({ status: 'confirmed', employeeId: 'e1', paymentStatus: 'partial' }, manager)).toEqual([
      'delivered',
      'cancelled',
    ]);
    expect(allowedOrderActions({ status: 'delivered', employeeId: 'e1', paymentStatus: 'paid' }, manager)).toEqual([]);
    expect(allowedOrderActions({ status: 'cancelled', employeeId: 'e1', paymentStatus: 'pending' }, manager)).toEqual([]);
  });

  it('never offers a manager confirm or deliver on their own order (SELF_APPROVAL)', () => {
    expect(allowedOrderActions({ status: 'pending', employeeId: 'm1', paymentStatus: 'pending' }, manager)).toEqual(['cancelled']);
    expect(allowedOrderActions({ status: 'confirmed', employeeId: ref('m1'), paymentStatus: 'pending' }, manager)).toEqual([
      'cancelled',
    ]);
  });

  it('lets a rep cancel their own pending order only while nothing is paid against it (ORDER_HAS_PAYMENTS)', () => {
    expect(allowedOrderActions({ status: 'pending', employeeId: 'e1', paymentStatus: 'partial' }, rep)).toEqual([]);
    expect(allowedOrderActions({ status: 'pending', employeeId: 'e1', paymentStatus: 'paid' }, rep)).toEqual([]);
    // A manager may still cancel it.
    expect(allowedOrderActions({ status: 'pending', employeeId: 'e1', paymentStatus: 'partial' }, manager)).toEqual([
      'confirmed',
      'cancelled',
    ]);
  });

  it("does not let a rep cancel a colleague's order, and reads legacy statuses", () => {
    expect(allowedOrderActions({ status: 'pending', employeeId: ref('e2'), paymentStatus: 'pending' }, rep)).toEqual([]);
    expect(allowedOrderActions({ status: 'draft', employeeId: ref('e1'), paymentStatus: 'pending' }, rep)).toEqual(['cancelled']);
    expect(allowedOrderActions({ status: 'shipped', employeeId: 'e1', paymentStatus: 'pending' }, manager)).toEqual([
      'delivered',
      'cancelled',
    ]);
  });
});

describe('allowedPaymentActions — collected → verified → deposited', () => {
  it('lets only a manager verify a collected payment', () => {
    expect(allowedPaymentActions({ status: 'collected', employeeId: 'e1' }, rep)).toEqual([]);
    expect(allowedPaymentActions({ status: 'collected', employeeId: 'e1' }, manager)).toEqual(['verify', 'bounce', 'delete']);
  });

  it('lets the collector or a manager deposit a verified payment', () => {
    expect(allowedPaymentActions({ status: 'verified', employeeId: 'e1' }, rep)).toEqual(['deposit']);
    expect(allowedPaymentActions({ status: 'verified', employeeId: 'e2' }, rep)).toEqual([]);
    expect(allowedPaymentActions({ status: 'verified', employeeId: 'e1' }, manager)).toEqual(['deposit', 'bounce', 'delete']);
  });

  it('leaves a deposited payment final but for a manager bounce or delete', () => {
    expect(allowedPaymentActions({ status: 'deposited', employeeId: 'e1' }, rep)).toEqual([]);
    expect(allowedPaymentActions({ status: 'deposited', employeeId: 'e1' }, manager)).toEqual(['bounce', 'delete']);
  });

  it('lets only a manager take a bounce back (bounced → collected)', () => {
    expect(allowedPaymentActions({ status: 'bounced', employeeId: 'e1' }, manager)).toEqual(['unbounce', 'delete']);
    expect(allowedPaymentActions({ status: 'bounced', employeeId: 'e1' }, rep)).toEqual([]);
  });
});
