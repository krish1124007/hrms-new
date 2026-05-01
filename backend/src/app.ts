import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';

import { requestContextMiddleware } from './middleware/request-context.middleware.js';
import { sanitizeInputs } from './middleware/sanitize.middleware.js';
import { paginationGuard } from './middleware/pagination.middleware.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import { apiVersionMiddleware } from './middleware/api-version.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { uploadRoot } from './lib/local-storage.js';
import apiRoutes from './routes/index.js';

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: '*', credentials: true }));
  app.use(compression());

  // Static-serve user uploads (payslip PDFs, attachments, backups).
  app.use('/uploads', express.static(uploadRoot(), { maxAge: '1d' }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());
  app.use(sanitizeInputs);
  app.use(paginationGuard);
  app.use(requestContextMiddleware);
  app.use(csrfProtection);
  app.use(apiVersionMiddleware);

  app.use('/api/v1', apiRoutes);

  // ─── 404 + error handler ───
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        requestId: req.requestId,
      },
    });
  });
  app.use(errorMiddleware);

  return app;
}

/**
 * Singleton app instance — used by existing tests that import `{ app }`.
 */
export const app = createApp();
