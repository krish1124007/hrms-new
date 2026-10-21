import { api } from './axios';
import type { ItemResponse } from './systemcore.api';

/** One employee's ID card, exactly as the server builds it (`buildCard`). */
export interface IdCard {
  employeeId: string;
  firstName: string;
  lastName: string;
  designation: string | null;
  department: string | null;
  profileImage: string | null;
  bloodGroup: string | null;
  joiningDate: string | null;
  validUntil: string | null;
  /** PNG data URL of the signed verify link — render straight into an <img src>. */
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
  my: async (): Promise<ItemResponse<IdCard>> => (await api.get('/id-cards/my')).data,

  /**
   * Any employee's card, for HR (`employees.view`). Same payload as `my`, so a
   * printed card and the employee's on-screen card are identical and its QR
   * verifies at `/verify/:code`.
   */
  generate: async (
    employeeId: string,
  ): Promise<ItemResponse<{ employee: IdCard; generatedAt: string }>> =>
    (await api.get(`/id-cards/generate/${employeeId}`)).data,
};
