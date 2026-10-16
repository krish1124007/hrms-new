import { api } from './axios';
import type { ItemResponse } from './systemcore.api';

export interface MyIdCard {
  employeeId: string;
  firstName: string;
  lastName: string;
  designation: string | null;
  department: string | null;
  profileImage: string | null;
  bloodGroup: string | null;
  joiningDate: string | null;
  validUntil: string | null;
  /** PNG data URL — render straight into an <img src>. */
  qr: string;
  /** The public verify link the QR points at. */
  verifyUrl: string;
}

export const idCardsApi = {
  /**
   * The signed-in employee's own card. The endpoint takes no id — the server
   * resolves the employee from the session — so it can only ever return the
   * caller's card, whatever the client asks for.
   */
  my: async (): Promise<ItemResponse<MyIdCard>> => (await api.get('/id-cards/my')).data,
};
