import express from 'express';
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
export function createApp() {
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
    app.get('/privacy-policy', (req, res) => {
        const a = req.body;
        console.log(a);
        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy - Tankar Solutions HRMS</title>
  <style>
    body{
      font-family: Arial, sans-serif;
      line-height: 1.7;
      padding: 40px;
      max-width: 900px;
      margin: auto;
      color: #222;
    }
    h1,h2{
      color: #111;
    }
  </style>
</head>
<body>

  <h1>Privacy Policy</h1>

  <p>
    Tankar Solutions HRMS ("we", "our", or "us") values your privacy.
    This Privacy Policy explains how our application collects, uses,
    and protects user information.
  </p>

  <h2>Information We Collect</h2>

  <p>Our application may collect the following information:</p>

  <ul>
    <li>Employee details such as name, email, phone number, and department</li>
    <li>Attendance and work-related information</li>
    <li>Login credentials for authentication purposes</li>
    <li>Device information for app performance and security</li>
  </ul>

  <h2>How We Use Information</h2>

  <p>The collected information is used for:</p>

  <ul>
    <li>Managing employees and HR operations</li>
    <li>Attendance and payroll management</li>
    <li>Improving application performance and security</li>
    <li>Providing customer support</li>
  </ul>

  <h2>Data Security</h2>

  <p>
    We implement appropriate security measures to protect user data
    against unauthorized access, disclosure, or misuse.
  </p>

  <h2>Data Sharing</h2>

  <p>
    We do not sell, trade, or rent users' personal information to others.
    User data is only used for application functionality and business operations.
  </p>

  <h2>Third-Party Services</h2>

  <p>
    Our application may use trusted third-party services such as cloud hosting,
    analytics, or authentication providers to improve app functionality.
  </p>

  <h2>User Rights</h2>

  <p>
    Users may request correction or deletion of their personal data by contacting us.
  </p>

  <h2>Changes to This Privacy Policy</h2>

  <p>
    We may update this Privacy Policy from time to time.
    Changes will be posted on this page.
  </p>

  <h2>Contact Us</h2>

  <p>
    If you have any questions regarding this Privacy Policy,
    please contact us at:
  </p>

  <p>
    Email: support@tankarsolutions.com
  </p>

  <p>
    Last Updated: August 2026
  </p>

</body>
</html>`);
    });
    app.use('/api/v1', apiRoutes);
    // ─── 404 + error handler ───
    app.use((req, res) => {
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
//# sourceMappingURL=app.js.map