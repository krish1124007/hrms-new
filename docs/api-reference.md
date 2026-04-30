# API Reference

The DD HRMS API is a RESTful service built with Express.js 5 and TypeScript. Interactive documentation is available via Swagger UI at `/api/docs` when the API server is running.

**Base URL:** `http://localhost:4000/api/v1`

---

## Table of Contents

- [Authentication](#authentication)
- [Request Format](#request-format)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Pagination](#pagination)
- [Filtering and Sorting](#filtering-and-sorting)
- [Common Headers](#common-headers)
- [Rate Limiting](#rate-limiting)
- [Multi-Tenancy](#multi-tenancy)
- [Core Endpoints](#core-endpoints)
- [Webhooks](#webhooks)

---

## Authentication

DD HRMS uses JWT-based authentication with access and refresh tokens.

### Login

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@company.com",
  "password": "your-password"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "admin@company.com",
      "name": "Admin User",
      "role": "admin"
    }
  },
  "message": "Login successful"
}
```

### Token Lifecycle

| Token | Default TTL | Purpose |
|---|---|---|
| Access Token | 15 minutes | API request authorization |
| Refresh Token | 30 days | Obtain new access tokens |

### Refresh Token

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Using Access Tokens

Include the access token in the `Authorization` header for all authenticated requests:

```http
GET /api/v1/employees
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Logout

```http
POST /api/v1/auth/logout
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

---

## Request Format

- All request bodies must be JSON (`Content-Type: application/json`)
- All request data is validated using Zod schemas
- File uploads use `multipart/form-data`

### Creating a Resource

```http
POST /api/v1/employees
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@company.com",
  "department": "507f1f77bcf86cd799439011",
  "designation": "Software Engineer",
  "dateOfJoining": "2026-01-15"
}
```

### Updating a Resource

```http
PATCH /api/v1/employees/507f1f77bcf86cd799439011
Authorization: Bearer <token>
Content-Type: application/json

{
  "designation": "Senior Software Engineer"
}
```

### Deleting a Resource

```http
DELETE /api/v1/employees/507f1f77bcf86cd799439011
Authorization: Bearer <token>
```

All deletes are soft deletes (sets `deletedAt` timestamp). The record is excluded from normal queries but remains in the database.

---

## Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "message": "Resource created successfully"
}
```

### Success Response with Pagination

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "pages": 8
  }
}
```

---

## Error Handling

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication token |
| `FORBIDDEN` | 403 | Insufficient permissions for this action |
| `NOT_FOUND` | 404 | Resource does not exist |
| `VALIDATION_ERROR` | 400 | Request body or parameters failed validation |
| `CONFLICT` | 409 | Resource already exists (duplicate) |
| `RATE_LIMITED` | 429 | Too many requests, try again later |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `TENANT_NOT_FOUND` | 404 | Tenant (organization) does not exist |
| `TENANT_SUSPENDED` | 403 | Tenant account is suspended |
| `TOKEN_EXPIRED` | 401 | Access token has expired, use refresh token |
| `INVALID_CREDENTIALS` | 401 | Email or password is incorrect |

---

## Pagination

All list endpoints support pagination via query parameters:

```http
GET /api/v1/employees?page=2&limit=20
```

| Parameter | Default | Max | Description |
|---|---|---|---|
| `page` | 1 | -- | Page number (1-based) |
| `limit` | 20 | 100 | Items per page |

---

## Filtering and Sorting

### Search

Full-text search across relevant fields:

```http
GET /api/v1/employees?search=john
```

### Sort

Sort by any field. Prefix with `-` for descending order:

```http
GET /api/v1/employees?sort=-createdAt
GET /api/v1/employees?sort=firstName
```

### Filter by Field

Some endpoints support field-specific filters:

```http
GET /api/v1/employees?department=507f1f77bcf86cd799439011&status=active
```

### Date Range

```http
GET /api/v1/attendance?from=2026-01-01&to=2026-01-31
```

---

## Common Headers

### Request Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes (for authenticated routes) | `Bearer <access_token>` |
| `Content-Type` | Yes (for POST/PATCH) | `application/json` |
| `X-Tenant-ID` | Conditional | Tenant identifier (if not using subdomain) |
| `Accept-Language` | No | Preferred language for responses (e.g., `hi`, `es`) |

### Response Headers

| Header | Description |
|---|---|
| `X-Request-ID` | Unique request identifier for debugging |
| `X-RateLimit-Limit` | Max requests per window |
| `X-RateLimit-Remaining` | Remaining requests in window |
| `X-RateLimit-Reset` | Window reset time (Unix timestamp) |

---

## Rate Limiting

Rate limits are enforced per tenant to ensure fair usage.

| Tier | Limit | Window |
|---|---|---|
| Standard | 100 requests | 1 minute |
| Authentication | 10 requests | 1 minute |
| File Upload | 20 requests | 1 minute |
| Webhook | 50 requests | 1 minute |

When rate limited, the API returns:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests, please try again later"
  }
}
```

---

## Multi-Tenancy

Every API request is scoped to a tenant. The tenant is resolved in this order:

1. **Subdomain**: `acme.app.opencore.com` resolves to tenant `acme`
2. **Header**: `X-Tenant-ID: 507f1f77bcf86cd799439011`
3. **JWT payload**: The tenant ID embedded in the authenticated user's token

All database queries are automatically filtered by `tenantId` via Mongoose middleware. There is no way to access another tenant's data through the API.

---

## Core Endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Register new tenant and admin |
| POST | `/api/v1/auth/login` | Login and receive tokens |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Invalidate refresh token |
| POST | `/api/v1/auth/forgot-password` | Request password reset email |
| POST | `/api/v1/auth/reset-password` | Reset password with token |
| GET | `/api/v1/auth/me` | Get current user profile |

### Employees

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/employees` | List employees (paginated) |
| GET | `/api/v1/employees/:id` | Get employee details |
| POST | `/api/v1/employees` | Create employee |
| PATCH | `/api/v1/employees/:id` | Update employee |
| DELETE | `/api/v1/employees/:id` | Soft-delete employee |
| POST | `/api/v1/employees/import` | Bulk import from CSV |
| GET | `/api/v1/employees/:id/documents` | List employee documents |

### Attendance

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/attendance` | List attendance records |
| POST | `/api/v1/attendance/check-in` | Record check-in |
| POST | `/api/v1/attendance/check-out` | Record check-out |
| GET | `/api/v1/attendance/summary` | Attendance summary report |

### Leaves

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/leaves` | List leave requests |
| POST | `/api/v1/leaves` | Submit leave request |
| PATCH | `/api/v1/leaves/:id/approve` | Approve leave |
| PATCH | `/api/v1/leaves/:id/reject` | Reject leave |
| GET | `/api/v1/leaves/balance` | Get leave balances |

### Payroll

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/payroll` | List payroll runs |
| POST | `/api/v1/payroll/process` | Process payroll for a period |
| GET | `/api/v1/payroll/:id/payslips` | Get payslips for a run |
| GET | `/api/v1/payroll/payslips/:id/pdf` | Download payslip PDF |

### Billing

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/billing/subscription` | Get current subscription |
| POST | `/api/v1/billing/subscribe` | Create subscription |
| PATCH | `/api/v1/billing/subscription` | Update plan |
| GET | `/api/v1/billing/invoices` | List billing invoices |
| POST | `/api/v1/billing/webhook` | Razorpay webhook endpoint |

### Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Service health check |

---

## Webhooks

### Razorpay Webhooks

DD HRMS processes the following Razorpay webhook events:

| Event | Action |
|---|---|
| `subscription.activated` | Activate tenant subscription |
| `subscription.charged` | Record payment, extend subscription |
| `subscription.completed` | Mark subscription as completed |
| `subscription.cancelled` | Handle cancellation |
| `payment.failed` | Notify admin, retry logic |
| `payment.captured` | Confirm payment |

Webhook payloads are verified using the `RAZORPAY_WEBHOOK_SECRET` via HMAC-SHA256 signature validation.

---

## Swagger UI

For the full interactive API documentation with request/response examples, visit:

```
http://localhost:4000/api/docs
```

The Swagger UI allows you to:
- Browse all available endpoints
- View request/response schemas
- Try out API calls directly from the browser
- Download the OpenAPI specification
