import type { IUser } from '../models/user.model.js';
import type { IRole } from '../models/role.model.js';

declare global {
  namespace Express {
    interface Request {
      user?: IUser & { role: IRole };
      requestId?: string;
    }
  }
}

export {};
