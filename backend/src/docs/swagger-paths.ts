/**
 * DD HRMS — Comprehensive OpenAPI 3.0 path definitions.
 *
 * Organised by tag / module.  Every path is relative to the server URL
 * configured in swagger.ts (`/api/v1`).
 */

/* ──────────────────────────── helpers ──────────────────────────── */

const paginationParams = [
  { name: 'page', in: 'query' as const, schema: { type: 'integer', default: 1 }, description: 'Page number' },
  { name: 'limit', in: 'query' as const, schema: { type: 'integer', default: 20 }, description: 'Items per page' },
  { name: 'sort', in: 'query' as const, schema: { type: 'string' }, description: 'Sort field (prefix with - for desc)' },
  { name: 'search', in: 'query' as const, schema: { type: 'string' }, description: 'Search keyword' },
];

const idParam = (name = 'id', description = 'Resource ID') => ({
  name,
  in: 'param' as const,
  required: true,
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
  description,
});

const ref = (schema: string) => ({ $ref: `#/components/schemas/${schema}` });

const res200 = (description: string, dataSchema?: Record<string, unknown>) => ({
  200: {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: dataSchema ?? { type: 'object' },
          },
        },
      },
    },
  },
});

const res201 = (description: string, dataSchema?: Record<string, unknown>) => ({
  201: {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: dataSchema ?? { type: 'object' },
          },
        },
      },
    },
  },
});

const resList = (description: string, itemSchema: Record<string, unknown>) => ({
  200: {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: itemSchema },
            pagination: ref('Pagination'),
          },
        },
      },
    },
  },
});

const errResponses = {
  400: { description: 'Validation error', content: { 'application/json': { schema: ref('Error') } } },
  401: { description: 'Unauthorized — missing or invalid JWT', content: { 'application/json': { schema: ref('Error') } } },
  403: { description: 'Forbidden — insufficient permissions', content: { 'application/json': { schema: ref('Error') } } },
  404: { description: 'Resource not found', content: { 'application/json': { schema: ref('Error') } } },
  500: { description: 'Internal server error', content: { 'application/json': { schema: ref('Error') } } },
};

/* ──────────────────────────── PATHS ──────────────────────────── */

export const swaggerPaths: Record<string, unknown> = {

  /* ================================================================
   * SYSTEM — Health & Metrics (mounted at /api, not /api/v1)
   * Note: These are documented here but the actual base is /api.
   * The servers[0].url is /api/v1 so we use a relative trick.
   * In practice the Swagger UI server selector can be toggled.
   * We document them under a different base for completeness.
   * ================================================================ */

  // These endpoints are actually at /api/health and /api/metrics,
  // outside the /api/v1 prefix. We document them with a note.

  /* ================================================================
   * AUTH
   * ================================================================ */
  '/auth/register': {
    post: {
      tags: ['Auth'],
      summary: 'Register a new tenant & admin user',
      description: 'Creates a new tenant organisation and the first admin user. Returns JWT tokens.',
      security: [],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: ref('RegisterRequest') } },
      },
      responses: {
        ...res201('Registration successful', ref('AuthTokens')),
        ...{ 400: errResponses[400] },
        ...{ 500: errResponses[500] },
      },
    },
  },
  '/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Login with email & password',
      description: 'Authenticates a user and returns access & refresh tokens.',
      security: [],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: ref('LoginRequest') } },
      },
      responses: {
        ...res200('Login successful', {
          type: 'object',
          properties: {
            user: ref('User'),
            tokens: ref('AuthTokens'),
          },
        }),
        ...{ 401: errResponses[401] },
        ...{ 500: errResponses[500] },
      },
    },
  },
  '/auth/refresh-token': {
    post: {
      tags: ['Auth'],
      summary: 'Refresh access token',
      description: 'Exchanges a valid refresh token for a new access token.',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['refreshToken'],
              properties: { refreshToken: { type: 'string' } },
            },
          },
        },
      },
      responses: {
        ...res200('Token refreshed', ref('AuthTokens')),
        ...{ 401: errResponses[401] },
      },
    },
  },
  '/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Logout (invalidate refresh token)',
      description: 'Invalidates the current refresh token so it cannot be reused.',
      responses: { ...res200('Logged out'), ...{ 500: errResponses[500] } },
    },
  },
  '/auth/forgot-password': {
    post: {
      tags: ['Auth'],
      summary: 'Request password reset email',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email'],
              properties: { email: { type: 'string', format: 'email' } },
            },
          },
        },
      },
      responses: { ...res200('Reset email sent if account exists'), ...{ 400: errResponses[400] } },
    },
  },
  '/auth/reset-password': {
    post: {
      tags: ['Auth'],
      summary: 'Reset password with token',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token', 'password'],
              properties: {
                token: { type: 'string' },
                password: { type: 'string', minLength: 8 },
              },
            },
          },
        },
      },
      responses: { ...res200('Password reset successful'), ...{ 400: errResponses[400] } },
    },
  },
  '/auth/verify-email/{token}': {
    get: {
      tags: ['Auth'],
      summary: 'Verify email address',
      security: [],
      parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' }, description: 'Email verification token' }],
      responses: { ...res200('Email verified'), ...{ 400: errResponses[400] } },
    },
  },
  '/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'Get current authenticated user',
      description: 'Returns the profile of the currently authenticated user.',
      responses: { ...res200('Current user', ref('User')), ...{ 401: errResponses[401] } },
    },
  },

  /* ================================================================
   * USERS
   * ================================================================ */
  '/users': {
    get: {
      tags: ['Users'],
      summary: 'List users',
      parameters: [...paginationParams],
      responses: { ...resList('Paginated list of users', ref('User')), ...{ 401: errResponses[401], 403: errResponses[403] } },
    },
    post: {
      tags: ['Users'],
      summary: 'Invite a new user',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'name', 'roleId'],
              properties: {
                email: { type: 'string', format: 'email' },
                name: { type: 'string' },
                roleId: { $ref: '#/components/schemas/ObjectId' },
              },
            },
          },
        },
      },
      responses: { ...res201('User invited'), ...{ 400: errResponses[400], 401: errResponses[401], 403: errResponses[403] } },
    },
  },
  '/users/{id}': {
    get: {
      tags: ['Users'],
      summary: 'Get user by ID',
      parameters: [idParam()],
      responses: { ...res200('User details', ref('User')), ...{ 401: errResponses[401], 404: errResponses[404] } },
    },
    patch: {
      tags: ['Users'],
      summary: 'Update user',
      parameters: [idParam()],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', properties: { name: { type: 'string' }, roleId: { type: 'string' } } },
          },
        },
      },
      responses: { ...res200('User updated'), ...{ 400: errResponses[400], 401: errResponses[401], 403: errResponses[403], 404: errResponses[404] } },
    },
    delete: {
      tags: ['Users'],
      summary: 'Delete user (soft delete)',
      parameters: [idParam()],
      responses: { ...res200('User deleted'), ...{ 401: errResponses[401], 403: errResponses[403], 404: errResponses[404] } },
    },
  },
  '/users/{id}/status': {
    patch: {
      tags: ['Users'],
      summary: 'Update user status',
      parameters: [idParam()],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: { status: { type: 'string', enum: ['active', 'inactive', 'suspended'] } },
            },
          },
        },
      },
      responses: { ...res200('Status updated'), ...{ 400: errResponses[400], 401: errResponses[401], 403: errResponses[403] } },
    },
  },

  /* ================================================================
   * ROLES & PERMISSIONS
   * ================================================================ */
  '/roles': {
    get: {
      tags: ['Roles'],
      summary: 'List roles',
      responses: { ...resList('List of roles', { type: 'object' }), ...{ 401: errResponses[401], 403: errResponses[403] } },
    },
    post: {
      tags: ['Roles'],
      summary: 'Create role',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'permissions'],
              properties: {
                name: { type: 'string', example: 'Manager' },
                description: { type: 'string' },
                permissions: { type: 'array', items: { type: 'string' }, example: ['employees.view', 'employees.create'] },
              },
            },
          },
        },
      },
      responses: { ...res201('Role created'), ...{ 400: errResponses[400], 401: errResponses[401], 403: errResponses[403] } },
    },
  },
  '/roles/{id}': {
    get: {
      tags: ['Roles'],
      summary: 'Get role by ID',
      parameters: [idParam()],
      responses: { ...res200('Role details'), ...{ 401: errResponses[401], 404: errResponses[404] } },
    },
    patch: {
      tags: ['Roles'],
      summary: 'Update role',
      parameters: [idParam()],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, permissions: { type: 'array', items: { type: 'string' } } } } } } },
      responses: { ...res200('Role updated'), ...{ 400: errResponses[400], 401: errResponses[401], 403: errResponses[403] } },
    },
    delete: {
      tags: ['Roles'],
      summary: 'Delete role',
      parameters: [idParam()],
      responses: { ...res200('Role deleted'), ...{ 401: errResponses[401], 403: errResponses[403], 404: errResponses[404] } },
    },
  },
  '/permissions': {
    get: {
      tags: ['Roles'],
      summary: 'List all available permissions',
      responses: { ...res200('List of permission strings', { type: 'array', items: { type: 'string' } }), ...{ 401: errResponses[401] } },
    },
  },

  /* ================================================================
   * EMPLOYEES
   * ================================================================ */
  '/employees': {
    get: {
      tags: ['Employees'],
      summary: 'List employees',
      description: 'Returns a paginated list of employees with optional search and filters.',
      parameters: [
        ...paginationParams,
        { name: 'departmentId', in: 'query', schema: { type: 'string' }, description: 'Filter by department' },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive', 'on-leave', 'terminated'] } },
      ],
      responses: { ...resList('Paginated employee list', ref('Employee')), ...{ 401: errResponses[401], 403: errResponses[403] } },
    },
    post: {
      tags: ['Employees'],
      summary: 'Create employee',
      requestBody: { required: true, content: { 'application/json': { schema: ref('CreateEmployeeRequest') } } },
      responses: { ...res201('Employee created', ref('Employee')), ...{ 400: errResponses[400], 401: errResponses[401], 403: errResponses[403] } },
    },
  },
  '/employees/stats': {
    get: {
      tags: ['Employees'],
      summary: 'Get employee statistics',
      description: 'Returns counts by status, department, etc.',
      responses: { ...res200('Employee stats'), ...{ 401: errResponses[401], 403: errResponses[403] } },
    },
  },
  '/employees/birthdays': {
    get: {
      tags: ['Employees'],
      summary: 'Get upcoming birthdays',
      responses: { ...res200('Upcoming birthdays list'), ...{ 401: errResponses[401], 403: errResponses[403] } },
    },
  },
  '/employees/export': {
    get: {
      tags: ['Employees'],
      summary: 'Export employees to CSV/Excel',
      responses: {
        200: { description: 'File download', content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } },
        ...{ 401: errResponses[401], 403: errResponses[403] },
      },
    },
  },
  '/employees/import': {
    post: {
      tags: ['Employees'],
      summary: 'Import employees from CSV/Excel',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['employees'],
              properties: {
                employees: { type: 'array', items: ref('CreateEmployeeRequest') },
              },
            },
          },
        },
      },
      responses: { ...res201('Import results'), ...{ 400: errResponses[400], 401: errResponses[401], 403: errResponses[403] } },
    },
  },
  '/employees/{id}': {
    get: {
      tags: ['Employees'],
      summary: 'Get employee by ID',
      parameters: [idParam()],
      responses: { ...res200('Employee details', ref('Employee')), ...{ 401: errResponses[401], 404: errResponses[404] } },
    },
    patch: {
      tags: ['Employees'],
      summary: 'Update employee',
      parameters: [idParam()],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, phone: { type: 'string' }, departmentId: { type: 'string' }, designationId: { type: 'string' } } } } } },
      responses: { ...res200('Employee updated'), ...{ 400: errResponses[400], 401: errResponses[401], 404: errResponses[404] } },
    },
    delete: {
      tags: ['Employees'],
      summary: 'Delete employee (soft delete)',
      parameters: [idParam()],
      responses: { ...res200('Employee deleted'), ...{ 401: errResponses[401], 403: errResponses[403], 404: errResponses[404] } },
    },
  },
  '/employees/{id}/status': {
    patch: {
      tags: ['Employees'],
      summary: 'Update employee status',
      parameters: [idParam()],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['active', 'inactive', 'on-leave', 'terminated'] } } } } } },
      responses: { ...res200('Status updated'), ...{ 400: errResponses[400], 401: errResponses[401] } },
    },
  },
  '/employees/{id}/documents': {
    post: {
      tags: ['Employees'],
      summary: 'Add document to employee',
      parameters: [idParam()],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'type', 'fileUrl'], properties: { name: { type: 'string' }, type: { type: 'string' }, fileUrl: { type: 'string' }, expiryDate: { type: 'string', format: 'date' } } } } } },
      responses: { ...res201('Document added'), ...{ 400: errResponses[400], 401: errResponses[401] } },
    },
  },
  '/employees/{id}/documents/{docId}': {
    delete: {
      tags: ['Employees'],
      summary: 'Delete employee document',
      parameters: [idParam(), idParam('docId', 'Document ID')],
      responses: { ...res200('Document deleted'), ...{ 401: errResponses[401], 404: errResponses[404] } },
    },
  },

  /* ================================================================
   * DEPARTMENTS
   * ================================================================ */
  '/departments': {
    get: {
      tags: ['Departments'],
      summary: 'List departments',
      parameters: [...paginationParams],
      responses: { ...resList('Paginated departments', ref('Department')), ...{ 401: errResponses[401], 403: errResponses[403] } },
    },
    post: {
      tags: ['Departments'],
      summary: 'Create department',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, code: { type: 'string' }, parentId: { type: 'string' }, headId: { type: 'string' } } } } } },
      responses: { ...res201('Department created'), ...{ 400: errResponses[400], 401: errResponses[401] } },
    },
  },
  '/departments/tree': {
    get: {
      tags: ['Departments'],
      summary: 'Get department hierarchy tree',
      responses: { ...res200('Department tree'), ...{ 401: errResponses[401] } },
    },
  },
  '/departments/{id}': {
    get: {
      tags: ['Departments'],
      summary: 'Get department by ID',
      parameters: [idParam()],
      responses: { ...res200('Department details', ref('Department')), ...{ 401: errResponses[401], 404: errResponses[404] } },
    },
    patch: {
      tags: ['Departments'],
      summary: 'Update department',
      parameters: [idParam()],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, code: { type: 'string' }, parentId: { type: 'string' }, headId: { type: 'string' } } } } } },
      responses: { ...res200('Department updated'), ...{ 400: errResponses[400], 401: errResponses[401], 404: errResponses[404] } },
    },
    delete: {
      tags: ['Departments'],
      summary: 'Delete department',
      parameters: [idParam()],
      responses: { ...res200('Department deleted'), ...{ 401: errResponses[401], 404: errResponses[404] } },
    },
  },

  /* ================================================================
   * DESIGNATIONS
   * ================================================================ */
  '/designations': {
    get: {
      tags: ['Designations'],
      summary: 'List designations',
      parameters: [...paginationParams],
      responses: { ...resList('Designations', { type: 'object' }), ...{ 401: errResponses[401], 403: errResponses[403] } },
    },
    post: {
      tags: ['Designations'],
      summary: 'Create designation',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, departmentId: { type: 'string' } } } } } },
      responses: { ...res201('Designation created'), ...{ 400: errResponses[400], 401: errResponses[401] } },
    },
  },
  '/designations/{id}': {
    get: { tags: ['Designations'], summary: 'Get designation', parameters: [idParam()], responses: { ...res200('Designation details'), ...{ 404: errResponses[404] } } },
    patch: { tags: ['Designations'], summary: 'Update designation', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } } }, responses: { ...res200('Updated'), ...{ 400: errResponses[400] } } },
    delete: { tags: ['Designations'], summary: 'Delete designation', parameters: [idParam()], responses: { ...res200('Deleted'), ...{ 404: errResponses[404] } } },
  },

  /* ================================================================
   * SHIFTS
   * ================================================================ */
  '/shifts': {
    get: {
      tags: ['Shifts'],
      summary: 'List shifts',
      parameters: [...paginationParams],
      responses: { ...resList('Shifts', { type: 'object' }), ...{ 401: errResponses[401] } },
    },
    post: {
      tags: ['Shifts'],
      summary: 'Create shift',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'startTime', 'endTime'], properties: { name: { type: 'string' }, startTime: { type: 'string', example: '09:00' }, endTime: { type: 'string', example: '18:00' }, graceMinutes: { type: 'integer' } } } } } },
      responses: { ...res201('Shift created'), ...{ 400: errResponses[400] } },
    },
  },
  '/shifts/{id}': {
    get: { tags: ['Shifts'], summary: 'Get shift', parameters: [idParam()], responses: { ...res200('Shift'), ...{ 404: errResponses[404] } } },
    patch: { tags: ['Shifts'], summary: 'Update shift', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, startTime: { type: 'string' }, endTime: { type: 'string' } } } } } }, responses: { ...res200('Updated'), ...{ 400: errResponses[400] } } },
    delete: { tags: ['Shifts'], summary: 'Delete shift', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/shifts/{id}/assign': {
    post: {
      tags: ['Shifts'],
      summary: 'Assign shift to employees',
      parameters: [idParam()],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['employeeIds'], properties: { employeeIds: { type: 'array', items: { type: 'string' } } } } } } },
      responses: { ...res200('Shift assigned'), ...{ 400: errResponses[400] } },
    },
  },

  /* ================================================================
   * HOLIDAYS
   * ================================================================ */
  '/holidays': {
    get: {
      tags: ['Holidays'],
      summary: 'List holidays',
      parameters: [...paginationParams, { name: 'year', in: 'query', schema: { type: 'integer' }, description: 'Filter by year' }],
      responses: { ...resList('Holidays', { type: 'object' }), ...{ 401: errResponses[401] } },
    },
    post: {
      tags: ['Holidays'],
      summary: 'Create holiday',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'date'], properties: { name: { type: 'string' }, date: { type: 'string', format: 'date' }, type: { type: 'string', enum: ['national', 'regional', 'optional'] } } } } } },
      responses: { ...res201('Holiday created'), ...{ 400: errResponses[400] } },
    },
  },
  '/holidays/upcoming': {
    get: { tags: ['Holidays'], summary: 'Get upcoming holidays', responses: { ...res200('Upcoming holidays') } },
  },
  '/holidays/import-calendar': {
    post: {
      tags: ['Holidays'],
      summary: 'Import holidays from a calendar (e.g. country-specific)',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['country', 'year'], properties: { country: { type: 'string', example: 'IN' }, year: { type: 'integer', example: 2026 } } } } } },
      responses: { ...res201('Holidays imported'), ...{ 400: errResponses[400] } },
    },
  },
  '/holidays/{id}': {
    get: { tags: ['Holidays'], summary: 'Get holiday', parameters: [idParam()], responses: { ...res200('Holiday'), ...{ 404: errResponses[404] } } },
    patch: { tags: ['Holidays'], summary: 'Update holiday', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, date: { type: 'string', format: 'date' } } } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Holidays'], summary: 'Delete holiday', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },

  /* ================================================================
   * ATTENDANCE
   * ================================================================ */
  '/attendance/config': {
    get: {
      tags: ['Attendance'],
      summary: 'Get attendance configuration',
      description: 'Returns the tenant-level attendance settings (methods, geofence radius, etc.).',
      responses: { ...res200('Attendance config'), ...{ 401: errResponses[401] } },
    },
    put: {
      tags: ['Attendance'],
      summary: 'Update attendance configuration',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                enabledMethods: { type: 'array', items: { type: 'string', enum: ['manual', 'biometric', 'geofence', 'qr', 'face', 'ip', 'selfie'] } },
                geofenceRadius: { type: 'integer', description: 'Radius in meters', example: 200 },
                autoCheckoutTime: { type: 'string', example: '23:59' },
                halfDayThresholdHours: { type: 'number', example: 4 },
              },
            },
          },
        },
      },
      responses: { ...res200('Config updated'), ...{ 400: errResponses[400], 401: errResponses[401], 403: errResponses[403] } },
    },
  },
  '/attendance/check-in': {
    post: {
      tags: ['Attendance'],
      summary: 'Check in',
      description: 'Records employee check-in with optional location, method and notes.',
      requestBody: { required: true, content: { 'application/json': { schema: ref('CheckInRequest') } } },
      responses: { ...res201('Checked in', ref('AttendanceRecord')), ...{ 400: errResponses[400], 401: errResponses[401] } },
    },
  },
  '/attendance/check-out': {
    post: {
      tags: ['Attendance'],
      summary: 'Check out',
      description: 'Records employee check-out. Calculates total work hours.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                notes: { type: 'string' },
                location: { type: 'object', properties: { latitude: { type: 'number' }, longitude: { type: 'number' } } },
              },
            },
          },
        },
      },
      responses: { ...res200('Checked out', ref('AttendanceRecord')), ...{ 400: errResponses[400], 401: errResponses[401] } },
    },
  },
  '/attendance/breaks/start': {
    post: {
      tags: ['Attendance'],
      summary: 'Start break',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { type: { type: 'string', enum: ['lunch', 'tea', 'personal'] } } } } } },
      responses: { ...res200('Break started'), ...{ 400: errResponses[400] } },
    },
  },
  '/attendance/breaks/end': {
    post: {
      tags: ['Attendance'],
      summary: 'End break',
      responses: { ...res200('Break ended'), ...{ 400: errResponses[400] } },
    },
  },
  '/attendance/records': {
    get: {
      tags: ['Attendance'],
      summary: 'List attendance records',
      parameters: [
        ...paginationParams,
        { name: 'employeeId', in: 'query', schema: { type: 'string' } },
        { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['present', 'absent', 'half-day', 'on-leave', 'holiday'] } },
      ],
      responses: { ...resList('Attendance records', ref('AttendanceRecord')), ...{ 401: errResponses[401], 403: errResponses[403] } },
    },
  },
  '/attendance/my': {
    get: {
      tags: ['Attendance'],
      summary: 'Get my attendance records',
      description: 'Returns attendance records for the authenticated employee.',
      responses: { ...res200('My attendance'), ...{ 401: errResponses[401] } },
    },
  },
  '/attendance/today': {
    get: {
      tags: ['Attendance'],
      summary: 'Get today\'s attendance status',
      responses: { ...res200('Today attendance'), ...{ 401: errResponses[401] } },
    },
  },
  '/attendance/monthly': {
    get: {
      tags: ['Attendance'],
      summary: 'Get monthly attendance summary',
      parameters: [
        { name: 'month', in: 'query', required: true, schema: { type: 'integer', minimum: 1, maximum: 12 } },
        { name: 'year', in: 'query', required: true, schema: { type: 'integer' } },
        { name: 'employeeId', in: 'query', schema: { type: 'string' } },
      ],
      responses: { ...res200('Monthly summary'), ...{ 401: errResponses[401] } },
    },
  },
  '/attendance/regularize': {
    post: {
      tags: ['Attendance'],
      summary: 'Request attendance regularization',
      description: 'Allows an employee to request correction of a past attendance record.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['date', 'reason'],
              properties: {
                date: { type: 'string', format: 'date' },
                checkIn: { type: 'string', format: 'date-time' },
                checkOut: { type: 'string', format: 'date-time' },
                reason: { type: 'string' },
              },
            },
          },
        },
      },
      responses: { ...res201('Regularization requested'), ...{ 400: errResponses[400] } },
    },
  },
  '/attendance/regularize/{id}': {
    patch: {
      tags: ['Attendance'],
      summary: 'Approve or reject regularization',
      parameters: [idParam()],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['action'],
              properties: {
                action: { type: 'string', enum: ['approve', 'reject'] },
                remarks: { type: 'string' },
              },
            },
          },
        },
      },
      responses: { ...res200('Regularization decided'), ...{ 400: errResponses[400], 403: errResponses[403] } },
    },
  },
  '/attendance/dashboard': {
    get: { tags: ['Attendance'], summary: 'Attendance dashboard stats', responses: { ...res200('Dashboard stats'), ...{ 401: errResponses[401] } } },
  },
  '/attendance/report': {
    get: {
      tags: ['Attendance'],
      summary: 'Generate attendance report',
      parameters: [
        { name: 'startDate', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        { name: 'endDate', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        { name: 'departmentId', in: 'query', schema: { type: 'string' } },
      ],
      responses: { ...res200('Attendance report') },
    },
  },
  // Attendance — Sites
  '/attendance/sites': {
    get: { tags: ['Attendance'], summary: 'List attendance sites', parameters: [...paginationParams], responses: { ...resList('Sites', { type: 'object' }) } },
    post: { tags: ['Attendance'], summary: 'Create attendance site', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'latitude', 'longitude', 'radius'], properties: { name: { type: 'string' }, latitude: { type: 'number' }, longitude: { type: 'number' }, radius: { type: 'integer', description: 'meters' } } } } } }, responses: { ...res201('Site created'), ...{ 400: errResponses[400] } } },
  },
  '/attendance/sites/{id}': {
    get: { tags: ['Attendance'], summary: 'Get site', parameters: [idParam()], responses: { ...res200('Site details') } },
    patch: { tags: ['Attendance'], summary: 'Update site', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, latitude: { type: 'number' }, longitude: { type: 'number' }, radius: { type: 'integer' } } } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Attendance'], summary: 'Delete site', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/attendance/sites/{id}/assign': {
    post: { tags: ['Attendance'], summary: 'Assign employees to site', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['employeeIds'], properties: { employeeIds: { type: 'array', items: { type: 'string' } } } } } } }, responses: { ...res200('Employees assigned') } },
  },
  // Attendance — Geofences
  '/attendance/geofences': {
    get: { tags: ['Attendance'], summary: 'List geofence zones', parameters: [...paginationParams], responses: { ...resList('Geofences', { type: 'object' }) } },
    post: { tags: ['Attendance'], summary: 'Create geofence zone', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'coordinates', 'radius'], properties: { name: { type: 'string' }, coordinates: { type: 'object', properties: { latitude: { type: 'number' }, longitude: { type: 'number' } } }, radius: { type: 'integer' } } } } } }, responses: { ...res201('Geofence created') } },
  },
  '/attendance/geofences/{id}': {
    get: { tags: ['Attendance'], summary: 'Get geofence zone', parameters: [idParam()], responses: { ...res200('Geofence') } },
    patch: { tags: ['Attendance'], summary: 'Update geofence', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Attendance'], summary: 'Delete geofence', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  // Attendance — QR Codes
  '/attendance/qr-codes': {
    get: { tags: ['Attendance'], summary: 'List QR codes', parameters: [...paginationParams], responses: { ...resList('QR codes', { type: 'object' }) } },
    post: { tags: ['Attendance'], summary: 'Create QR code for attendance', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['siteId'], properties: { siteId: { type: 'string' }, isDynamic: { type: 'boolean' } } } } } }, responses: { ...res201('QR code created') } },
  },
  '/attendance/qr-codes/rotate': {
    post: { tags: ['Attendance'], summary: 'Rotate dynamic QR code', responses: { ...res200('QR rotated') } },
  },
  '/attendance/qr-codes/{id}': {
    delete: { tags: ['Attendance'], summary: 'Delete QR code', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  // Attendance — Allowed IPs
  '/attendance/allowed-ips': {
    get: { tags: ['Attendance'], summary: 'List allowed IPs', parameters: [...paginationParams], responses: { ...resList('Allowed IPs', { type: 'object' }) } },
    post: { tags: ['Attendance'], summary: 'Add allowed IP', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['ip', 'label'], properties: { ip: { type: 'string', example: '203.0.113.0/24' }, label: { type: 'string' } } } } } }, responses: { ...res201('IP added') } },
  },
  '/attendance/allowed-ips/{id}': {
    patch: { tags: ['Attendance'], summary: 'Update allowed IP', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { ip: { type: 'string' }, label: { type: 'string' } } } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Attendance'], summary: 'Delete allowed IP', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },

  /* ================================================================
   * LEAVES
   * ================================================================ */
  // Leave Types
  '/leaves/types': {
    get: {
      tags: ['Leaves'],
      summary: 'List leave types',
      parameters: [...paginationParams],
      responses: { ...resList('Leave types', ref('LeaveType')), ...{ 401: errResponses[401] } },
    },
    post: {
      tags: ['Leaves'],
      summary: 'Create leave type',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'code', 'defaultBalance'],
              properties: {
                name: { type: 'string', example: 'Sick Leave' },
                code: { type: 'string', example: 'SL' },
                defaultBalance: { type: 'number', example: 10 },
                carryForward: { type: 'boolean' },
                maxCarryForward: { type: 'number' },
                isPaid: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: { ...res201('Leave type created'), ...{ 400: errResponses[400] } },
    },
  },
  '/leaves/types/{id}': {
    get: { tags: ['Leaves'], summary: 'Get leave type', parameters: [idParam()], responses: { ...res200('Leave type', ref('LeaveType')) } },
    patch: { tags: ['Leaves'], summary: 'Update leave type', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, defaultBalance: { type: 'number' }, carryForward: { type: 'boolean' } } } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Leaves'], summary: 'Delete leave type', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  // Leave Balances
  '/leaves/balances': {
    get: {
      tags: ['Leaves'],
      summary: 'List leave balances (all employees)',
      parameters: [...paginationParams, { name: 'employeeId', in: 'query', schema: { type: 'string' } }],
      responses: { ...resList('Leave balances', { type: 'object' }) },
    },
  },
  '/leaves/balances/my': {
    get: { tags: ['Leaves'], summary: 'Get my leave balances', responses: { ...res200('My balances') } },
  },
  '/leaves/balances/allocate': {
    post: {
      tags: ['Leaves'],
      summary: 'Allocate leave balances',
      description: 'Bulk allocate leave balances for employees (e.g. at start of year).',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['leaveTypeId', 'employeeIds', 'balance'], properties: { leaveTypeId: { type: 'string' }, employeeIds: { type: 'array', items: { type: 'string' } }, balance: { type: 'number' } } } } } },
      responses: { ...res201('Balances allocated') },
    },
  },
  '/leaves/balances/{id}/adjust': {
    patch: {
      tags: ['Leaves'],
      summary: 'Adjust leave balance',
      parameters: [idParam()],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['adjustment', 'reason'], properties: { adjustment: { type: 'number' }, reason: { type: 'string' } } } } } },
      responses: { ...res200('Balance adjusted') },
    },
  },
  // Leave Reports
  '/leaves/reports': {
    get: { tags: ['Leaves'], summary: 'Leave reports', responses: { ...res200('Leave report data') } },
  },
  // Leave Requests
  '/leaves/requests': {
    get: {
      tags: ['Leaves'],
      summary: 'List leave requests',
      parameters: [...paginationParams, { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected', 'cancelled'] } }, { name: 'employeeId', in: 'query', schema: { type: 'string' } }],
      responses: { ...resList('Leave requests', ref('LeaveRequest')) },
    },
    post: {
      tags: ['Leaves'],
      summary: 'Apply for leave',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['leaveTypeId', 'startDate', 'endDate', 'reason'],
              properties: {
                leaveTypeId: { type: 'string' },
                startDate: { type: 'string', format: 'date' },
                endDate: { type: 'string', format: 'date' },
                reason: { type: 'string' },
                isHalfDay: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: { ...res201('Leave applied', ref('LeaveRequest')), ...{ 400: errResponses[400] } },
    },
  },
  '/leaves/requests/my': { get: { tags: ['Leaves'], summary: 'Get my leave requests', responses: { ...res200('My leave requests') } } },
  '/leaves/requests/team': { get: { tags: ['Leaves'], summary: 'Get team leave requests', responses: { ...res200('Team leave requests') } } },
  '/leaves/requests/calendar': { get: { tags: ['Leaves'], summary: 'Leave calendar view', responses: { ...res200('Leave calendar data') } } },
  '/leaves/requests/{id}': {
    get: { tags: ['Leaves'], summary: 'Get leave request', parameters: [idParam()], responses: { ...res200('Leave request', ref('LeaveRequest')) } },
  },
  '/leaves/requests/{id}/approve': {
    patch: { tags: ['Leaves'], summary: 'Approve leave request', parameters: [idParam()], responses: { ...res200('Leave approved'), ...{ 403: errResponses[403] } } },
  },
  '/leaves/requests/{id}/reject': {
    patch: {
      tags: ['Leaves'],
      summary: 'Reject leave request',
      parameters: [idParam()],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } },
      responses: { ...res200('Leave rejected'), ...{ 403: errResponses[403] } },
    },
  },
  '/leaves/requests/{id}/cancel': {
    patch: { tags: ['Leaves'], summary: 'Cancel leave request', parameters: [idParam()], responses: { ...res200('Leave cancelled') } },
  },

  /* ================================================================
   * PAYROLL
   * ================================================================ */
  // Components
  '/payroll/components': {
    get: {
      tags: ['Payroll'],
      summary: 'List salary components',
      parameters: [...paginationParams],
      responses: { ...resList('Salary components', ref('SalaryComponent')) },
    },
    post: {
      tags: ['Payroll'],
      summary: 'Create salary component',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'type', 'calculationType'],
              properties: {
                name: { type: 'string', example: 'HRA' },
                type: { type: 'string', enum: ['earning', 'deduction'] },
                calculationType: { type: 'string', enum: ['fixed', 'percentage'] },
                percentage: { type: 'number' },
                isTaxable: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: { ...res201('Component created'), ...{ 400: errResponses[400] } },
    },
  },
  '/payroll/components/{id}': {
    get: { tags: ['Payroll'], summary: 'Get component', parameters: [idParam()], responses: { ...res200('Component', ref('SalaryComponent')) } },
    patch: { tags: ['Payroll'], summary: 'Update component', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, calculationType: { type: 'string' } } } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Payroll'], summary: 'Delete component', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  // Structures
  '/payroll/structures': {
    get: { tags: ['Payroll'], summary: 'List salary structures', responses: { ...resList('Structures', { type: 'object' }) } },
    post: {
      tags: ['Payroll'],
      summary: 'Create salary structure',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'components'], properties: { name: { type: 'string' }, components: { type: 'array', items: { type: 'object', properties: { componentId: { type: 'string' }, value: { type: 'number' } } } } } } } } },
      responses: { ...res201('Structure created') },
    },
  },
  '/payroll/structures/{id}': {
    get: { tags: ['Payroll'], summary: 'Get structure', parameters: [idParam()], responses: { ...res200('Structure') } },
    patch: { tags: ['Payroll'], summary: 'Update structure', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Payroll'], summary: 'Delete structure', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/payroll/structures/{id}/assign': {
    post: {
      tags: ['Payroll'],
      summary: 'Assign structure to employees',
      parameters: [idParam()],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['employeeIds'], properties: { employeeIds: { type: 'array', items: { type: 'string' } }, ctc: { type: 'number' } } } } } },
      responses: { ...res200('Structure assigned') },
    },
  },
  // Self-service
  '/payroll/my-payslips': {
    get: { tags: ['Payroll'], summary: 'Get my payslips', responses: { ...res200('Payslips') } },
  },
  // Reports
  '/payroll/reports/monthly': {
    get: {
      tags: ['Payroll'],
      summary: 'Monthly payroll report',
      parameters: [{ name: 'month', in: 'query', required: true, schema: { type: 'integer' } }, { name: 'year', in: 'query', required: true, schema: { type: 'integer' } }],
      responses: { ...res200('Monthly report') },
    },
  },
  '/payroll/reports/yearly': {
    get: {
      tags: ['Payroll'],
      summary: 'Yearly payroll report',
      parameters: [{ name: 'year', in: 'query', required: true, schema: { type: 'integer' } }],
      responses: { ...res200('Yearly report') },
    },
  },
  '/payroll/reports/statutory': {
    get: { tags: ['Payroll'], summary: 'Statutory compliance report', responses: { ...res200('Statutory report') } },
  },
  // Cycles
  '/payroll/cycles': {
    get: {
      tags: ['Payroll'],
      summary: 'List payroll cycles',
      parameters: [...paginationParams],
      responses: { ...resList('Payroll cycles', ref('PayrollCycle')) },
    },
    post: {
      tags: ['Payroll'],
      summary: 'Create payroll cycle',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['month', 'year'],
              properties: { month: { type: 'integer', minimum: 1, maximum: 12 }, year: { type: 'integer' } },
            },
          },
        },
      },
      responses: { ...res201('Cycle created', ref('PayrollCycle')) },
    },
  },
  '/payroll/cycles/{id}': {
    get: { tags: ['Payroll'], summary: 'Get payroll cycle', parameters: [idParam()], responses: { ...res200('Cycle', ref('PayrollCycle')) } },
  },
  '/payroll/cycles/{id}/process': {
    post: { tags: ['Payroll'], summary: 'Process payroll cycle', description: 'Calculates salary for all employees in the cycle.', parameters: [idParam()], responses: { ...res200('Cycle processed') } },
  },
  '/payroll/cycles/{id}/records': {
    get: { tags: ['Payroll'], summary: 'List payroll records for cycle', parameters: [idParam()], responses: { ...resList('Payroll records', { type: 'object' }) } },
  },
  '/payroll/cycles/{id}/records/{recordId}': {
    patch: {
      tags: ['Payroll'],
      summary: 'Update payroll record',
      parameters: [idParam(), idParam('recordId', 'Payroll record ID')],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { adjustments: { type: 'array', items: { type: 'object', properties: { componentId: { type: 'string' }, value: { type: 'number' } } } } } } } } },
      responses: { ...res200('Record updated') },
    },
  },
  '/payroll/cycles/{id}/generate-payslips': {
    post: { tags: ['Payroll'], summary: 'Generate payslips for cycle', parameters: [idParam()], responses: { ...res200('Payslips generated') } },
  },
  '/payroll/cycles/{id}/lock': {
    post: { tags: ['Payroll'], summary: 'Lock payroll cycle', description: 'Prevents further modifications to the cycle.', parameters: [idParam()], responses: { ...res200('Cycle locked') } },
  },
  '/payroll/cycles/{id}/mark-paid': {
    post: {
      tags: ['Payroll'],
      summary: 'Mark payroll cycle as paid',
      parameters: [idParam()],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { paymentDate: { type: 'string', format: 'date' }, transactionRef: { type: 'string' } } } } } },
      responses: { ...res200('Marked as paid') },
    },
  },
  // Records
  '/payroll/records/{id}': {
    get: { tags: ['Payroll'], summary: 'Get payroll record', parameters: [idParam()], responses: { ...res200('Payroll record') } },
  },
  '/payroll/records/{id}/payslip': {
    get: {
      tags: ['Payroll'],
      summary: 'Download payslip PDF',
      parameters: [idParam()],
      responses: { 200: { description: 'PDF file', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } } },
    },
  },

  /* ================================================================
   * EXPENSE CLAIMS
   * ================================================================ */
  '/expense-claims/categories': {
    get: { tags: ['Expense Claims'], summary: 'List expense categories', parameters: [...paginationParams], responses: { ...resList('Categories', { type: 'object' }) } },
    post: { tags: ['Expense Claims'], summary: 'Create expense category', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, maxAmount: { type: 'number' } } } } } }, responses: { ...res201('Created') } },
  },
  '/expense-claims/categories/{id}': {
    get: { tags: ['Expense Claims'], summary: 'Get category', parameters: [idParam()], responses: { ...res200('Category') } },
    patch: { tags: ['Expense Claims'], summary: 'Update category', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Expense Claims'], summary: 'Delete category', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/expense-claims/reports': { get: { tags: ['Expense Claims'], summary: 'Expense reports', responses: { ...res200('Report data') } } },
  '/expense-claims/requests': {
    get: { tags: ['Expense Claims'], summary: 'List expense claims', parameters: [...paginationParams], responses: { ...resList('Claims', { type: 'object' }) } },
    post: { tags: ['Expense Claims'], summary: 'Submit expense claim', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['categoryId', 'amount', 'description', 'date'], properties: { categoryId: { type: 'string' }, amount: { type: 'number' }, description: { type: 'string' }, date: { type: 'string', format: 'date' }, attachments: { type: 'array', items: { type: 'string' } } } } } } }, responses: { ...res201('Claim submitted') } },
  },
  '/expense-claims/requests/my': { get: { tags: ['Expense Claims'], summary: 'My expense claims', responses: { ...res200('My claims') } } },
  '/expense-claims/requests/team': { get: { tags: ['Expense Claims'], summary: 'Team expense claims', responses: { ...res200('Team claims') } } },
  '/expense-claims/requests/{id}': {
    get: { tags: ['Expense Claims'], summary: 'Get claim', parameters: [idParam()], responses: { ...res200('Claim') } },
    patch: { tags: ['Expense Claims'], summary: 'Update claim', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Expense Claims'], summary: 'Delete claim', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/expense-claims/requests/{id}/approve': { patch: { tags: ['Expense Claims'], summary: 'Approve claim', parameters: [idParam()], responses: { ...res200('Approved') } } },
  '/expense-claims/requests/{id}/reject': { patch: { tags: ['Expense Claims'], summary: 'Reject claim', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } } } } }, responses: { ...res200('Rejected') } } },
  '/expense-claims/requests/{id}/reimburse': { patch: { tags: ['Expense Claims'], summary: 'Mark claim as reimbursed', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { transactionRef: { type: 'string' }, paidOn: { type: 'string', format: 'date' } } } } } }, responses: { ...res200('Reimbursed') } } },

  /* ================================================================
   * CRM
   * ================================================================ */
  // Customers
  '/crm/customers': {
    get: { tags: ['CRM'], summary: 'List customers', parameters: [...paginationParams], responses: { ...resList('Customers', ref('Customer')) } },
    post: { tags: ['CRM'], summary: 'Create customer', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'email'], properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, phone: { type: 'string' }, company: { type: 'string' } } } } } }, responses: { ...res201('Customer created', ref('Customer')) } },
  },
  '/crm/customers/{id}': {
    get: { tags: ['CRM'], summary: 'Get customer', parameters: [idParam()], responses: { ...res200('Customer', ref('Customer')) } },
    patch: { tags: ['CRM'], summary: 'Update customer', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['CRM'], summary: 'Delete customer', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  // Leads
  '/crm/leads': {
    get: { tags: ['CRM'], summary: 'List leads', parameters: [...paginationParams], responses: { ...resList('Leads', ref('Lead')) } },
    post: { tags: ['CRM'], summary: 'Create lead', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, source: { type: 'string' }, assignedTo: { type: 'string' } } } } } }, responses: { ...res201('Lead created', ref('Lead')) } },
  },
  '/crm/leads/stats': { get: { tags: ['CRM'], summary: 'Lead statistics', responses: { ...res200('Lead stats') } } },
  '/crm/leads/{id}': {
    get: { tags: ['CRM'], summary: 'Get lead', parameters: [idParam()], responses: { ...res200('Lead', ref('Lead')) } },
    patch: { tags: ['CRM'], summary: 'Update lead', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['CRM'], summary: 'Delete lead', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/crm/leads/{id}/score': { patch: { tags: ['CRM'], summary: 'Update lead score', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['score'], properties: { score: { type: 'integer' } } } } } }, responses: { ...res200('Score updated') } } },
  '/crm/leads/{id}/convert': { patch: { tags: ['CRM'], summary: 'Convert lead to customer/deal', parameters: [idParam()], responses: { ...res200('Lead converted') } } },
  // Deals
  '/crm/deals': {
    get: { tags: ['CRM'], summary: 'List deals', parameters: [...paginationParams], responses: { ...resList('Deals', ref('Deal')) } },
    post: { tags: ['CRM'], summary: 'Create deal', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title', 'value', 'pipelineId', 'stage'], properties: { title: { type: 'string' }, value: { type: 'number' }, currency: { type: 'string' }, pipelineId: { type: 'string' }, stage: { type: 'string' }, customerId: { type: 'string' }, expectedCloseDate: { type: 'string', format: 'date' } } } } } }, responses: { ...res201('Deal created', ref('Deal')) } },
  },
  '/crm/deals/pipeline': { get: { tags: ['CRM'], summary: 'Get pipeline view (kanban)', responses: { ...res200('Pipeline view') } } },
  '/crm/deals/forecast': { get: { tags: ['CRM'], summary: 'Get sales forecast', responses: { ...res200('Forecast data') } } },
  '/crm/deals/reorder': { patch: { tags: ['CRM'], summary: 'Reorder deals in pipeline', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Reordered') } } },
  '/crm/deals/{id}': {
    get: { tags: ['CRM'], summary: 'Get deal', parameters: [idParam()], responses: { ...res200('Deal', ref('Deal')) } },
    patch: { tags: ['CRM'], summary: 'Update deal', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['CRM'], summary: 'Delete deal', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/crm/deals/{id}/stage': { patch: { tags: ['CRM'], summary: 'Update deal stage', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['stage'], properties: { stage: { type: 'string' } } } } } }, responses: { ...res200('Stage updated') } } },
  // Activities
  '/crm/activities': {
    get: { tags: ['CRM'], summary: 'List activities', parameters: [...paginationParams], responses: { ...resList('Activities', { type: 'object' }) } },
    post: { tags: ['CRM'], summary: 'Create activity', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['type', 'subject'], properties: { type: { type: 'string', enum: ['call', 'email', 'meeting', 'task'] }, subject: { type: 'string' }, relatedTo: { type: 'string' }, relatedId: { type: 'string' }, dueDate: { type: 'string', format: 'date-time' } } } } } }, responses: { ...res201('Activity created') } },
  },
  '/crm/activities/upcoming': { get: { tags: ['CRM'], summary: 'Upcoming activities', responses: { ...res200('Upcoming') } } },
  '/crm/activities/overdue': { get: { tags: ['CRM'], summary: 'Overdue activities', responses: { ...res200('Overdue') } } },
  '/crm/activities/{id}': {
    get: { tags: ['CRM'], summary: 'Get activity', parameters: [idParam()], responses: { ...res200('Activity') } },
    patch: { tags: ['CRM'], summary: 'Update activity', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['CRM'], summary: 'Delete activity', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  // Pipelines
  '/crm/pipelines': {
    get: { tags: ['CRM'], summary: 'List pipelines', responses: { ...resList('Pipelines', { type: 'object' }) } },
    post: { tags: ['CRM'], summary: 'Create pipeline', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'stages'], properties: { name: { type: 'string' }, stages: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, probability: { type: 'number' } } } } } } } } }, responses: { ...res201('Pipeline created') } },
  },
  '/crm/pipelines/{id}': {
    get: { tags: ['CRM'], summary: 'Get pipeline', parameters: [idParam()], responses: { ...res200('Pipeline') } },
    patch: { tags: ['CRM'], summary: 'Update pipeline', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['CRM'], summary: 'Delete pipeline', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  // Analytics
  '/crm/analytics': { get: { tags: ['CRM'], summary: 'CRM analytics dashboard', responses: { ...res200('Analytics data') } } },

  /* ================================================================
   * PROJECTS
   * ================================================================ */
  '/projects': {
    get: { tags: ['Projects'], summary: 'List projects', parameters: [...paginationParams], responses: { ...resList('Projects', { type: 'object' }) } },
    post: { tags: ['Projects'], summary: 'Create project', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' }, startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' }, status: { type: 'string', enum: ['planning', 'active', 'on-hold', 'completed', 'cancelled'] } } } } } }, responses: { ...res201('Project created') } },
  },
  '/projects/{id}': {
    get: { tags: ['Projects'], summary: 'Get project', parameters: [idParam()], responses: { ...res200('Project') } },
    patch: { tags: ['Projects'], summary: 'Update project', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Projects'], summary: 'Delete project', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/projects/{id}/dashboard': { get: { tags: ['Projects'], summary: 'Project dashboard', parameters: [idParam()], responses: { ...res200('Dashboard data') } } },
  '/projects/{id}/members': {
    post: { tags: ['Projects'], summary: 'Add project member', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['userId', 'role'], properties: { userId: { type: 'string' }, role: { type: 'string' } } } } } }, responses: { ...res201('Member added') } },
  },
  '/projects/{id}/members/{userId}': {
    delete: { tags: ['Projects'], summary: 'Remove project member', parameters: [idParam(), idParam('userId', 'User ID')], responses: { ...res200('Member removed') } },
  },
  // Milestones
  '/projects/{projectId}/milestones': {
    get: { tags: ['Projects'], summary: 'List milestones', parameters: [idParam('projectId', 'Project ID')], responses: { ...resList('Milestones', { type: 'object' }) } },
    post: { tags: ['Projects'], summary: 'Create milestone', parameters: [idParam('projectId', 'Project ID')], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'dueDate'], properties: { name: { type: 'string' }, dueDate: { type: 'string', format: 'date' } } } } } }, responses: { ...res201('Milestone created') } },
  },
  '/projects/{projectId}/milestones/{id}': {
    patch: { tags: ['Projects'], summary: 'Update milestone', parameters: [idParam('projectId', 'Project ID'), idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Projects'], summary: 'Delete milestone', parameters: [idParam('projectId', 'Project ID'), idParam()], responses: { ...res200('Deleted') } },
  },
  // Tasks (project-scoped)
  '/projects/{projectId}/tasks': {
    get: { tags: ['Projects'], summary: 'List project tasks', parameters: [idParam('projectId', 'Project ID')], responses: { ...resList('Tasks', { type: 'object' }) } },
    post: { tags: ['Projects'], summary: 'Create project task', parameters: [idParam('projectId', 'Project ID')], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, description: { type: 'string' }, assigneeId: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] }, dueDate: { type: 'string', format: 'date' } } } } } }, responses: { ...res201('Task created') } },
  },
  '/projects/{projectId}/tasks/reorder': { patch: { tags: ['Projects'], summary: 'Reorder tasks (kanban)', parameters: [idParam('projectId', 'Project ID')], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Reordered') } } },
  '/projects/{projectId}/tasks/{id}': {
    get: { tags: ['Projects'], summary: 'Get task', parameters: [idParam('projectId', 'Project ID'), idParam()], responses: { ...res200('Task') } },
    patch: { tags: ['Projects'], summary: 'Update task', parameters: [idParam('projectId', 'Project ID'), idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Projects'], summary: 'Delete task', parameters: [idParam('projectId', 'Project ID'), idParam()], responses: { ...res200('Deleted') } },
  },
  '/projects/{projectId}/tasks/{id}/status': { patch: { tags: ['Projects'], summary: 'Update task status', parameters: [idParam('projectId', 'Project ID'), idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string' } } } } } }, responses: { ...res200('Status updated') } } },
  // Time Entries (project-scoped)
  '/projects/{projectId}/time-entries': {
    get: { tags: ['Projects'], summary: 'List time entries', parameters: [idParam('projectId', 'Project ID')], responses: { ...resList('Time entries', { type: 'object' }) } },
    post: { tags: ['Projects'], summary: 'Create time entry', parameters: [idParam('projectId', 'Project ID')], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['taskId', 'hours', 'date'], properties: { taskId: { type: 'string' }, hours: { type: 'number' }, date: { type: 'string', format: 'date' }, description: { type: 'string' } } } } } }, responses: { ...res201('Time entry created') } },
  },
  '/projects/{projectId}/time-entries/summary': { get: { tags: ['Projects'], summary: 'Time entry summary', parameters: [idParam('projectId', 'Project ID')], responses: { ...res200('Summary') } } },
  '/projects/{projectId}/time-entries/{id}': {
    patch: { tags: ['Projects'], summary: 'Update time entry', parameters: [idParam('projectId', 'Project ID'), idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Projects'], summary: 'Delete time entry', parameters: [idParam('projectId', 'Project ID'), idParam()], responses: { ...res200('Deleted') } },
  },

  /* ================================================================
   * TIMESHEETS
   * ================================================================ */
  '/timesheets/my': { get: { tags: ['Timesheets'], summary: 'Get my timesheets', responses: { ...res200('My timesheets') } } },
  '/timesheets/weekly': { get: { tags: ['Timesheets'], summary: 'Get weekly timesheet view', responses: { ...res200('Weekly timesheet') } } },

  /* ================================================================
   * ACCOUNTING
   * ================================================================ */
  // Accounts
  '/accounting/accounts': {
    get: { tags: ['Accounting'], summary: 'List chart of accounts', parameters: [...paginationParams], responses: { ...resList('Accounts', ref('Account')) } },
    post: { tags: ['Accounting'], summary: 'Create account', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'code', 'type'], properties: { name: { type: 'string' }, code: { type: 'string' }, type: { type: 'string', enum: ['asset', 'liability', 'equity', 'income', 'expense'] }, parentId: { type: 'string' } } } } } }, responses: { ...res201('Account created', ref('Account')) } },
  },
  '/accounting/accounts/tree': { get: { tags: ['Accounting'], summary: 'Get account hierarchy tree', responses: { ...res200('Account tree') } } },
  '/accounting/accounts/balances': { get: { tags: ['Accounting'], summary: 'Get account balances', responses: { ...res200('Account balances') } } },
  '/accounting/accounts/{id}': {
    get: { tags: ['Accounting'], summary: 'Get account', parameters: [idParam()], responses: { ...res200('Account', ref('Account')) } },
    patch: { tags: ['Accounting'], summary: 'Update account', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Accounting'], summary: 'Delete account', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  // Journal Entries
  '/accounting/journal-entries': {
    get: { tags: ['Accounting'], summary: 'List journal entries', parameters: [...paginationParams], responses: { ...resList('Journal entries', { type: 'object' }) } },
    post: { tags: ['Accounting'], summary: 'Create journal entry', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['date', 'lines'], properties: { date: { type: 'string', format: 'date' }, reference: { type: 'string' }, memo: { type: 'string' }, lines: { type: 'array', items: { type: 'object', properties: { accountId: { type: 'string' }, debit: { type: 'number' }, credit: { type: 'number' }, description: { type: 'string' } } } } } } } } }, responses: { ...res201('Entry created') } },
  },
  '/accounting/journal-entries/{id}': {
    get: { tags: ['Accounting'], summary: 'Get journal entry', parameters: [idParam()], responses: { ...res200('Journal entry') } },
    patch: { tags: ['Accounting'], summary: 'Update journal entry', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
  },
  '/accounting/journal-entries/{id}/post': { post: { tags: ['Accounting'], summary: 'Post journal entry', parameters: [idParam()], responses: { ...res200('Posted') } } },
  '/accounting/journal-entries/{id}/void': { post: { tags: ['Accounting'], summary: 'Void journal entry', parameters: [idParam()], responses: { ...res200('Voided') } } },
  // Income
  '/accounting/income': {
    get: { tags: ['Accounting'], summary: 'List income records', parameters: [...paginationParams], responses: { ...resList('Income', { type: 'object' }) } },
    post: { tags: ['Accounting'], summary: 'Create income', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['accountId', 'amount', 'date'], properties: { accountId: { type: 'string' }, amount: { type: 'number' }, date: { type: 'string', format: 'date' }, description: { type: 'string' }, customerId: { type: 'string' } } } } } }, responses: { ...res201('Income created') } },
  },
  '/accounting/income/summary': { get: { tags: ['Accounting'], summary: 'Income summary', responses: { ...res200('Summary') } } },
  '/accounting/income/{id}': {
    get: { tags: ['Accounting'], summary: 'Get income', parameters: [idParam()], responses: { ...res200('Income') } },
    patch: { tags: ['Accounting'], summary: 'Update income', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Accounting'], summary: 'Delete income', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  // Expenses
  '/accounting/expenses': {
    get: { tags: ['Accounting'], summary: 'List expense records', parameters: [...paginationParams], responses: { ...resList('Expenses', { type: 'object' }) } },
    post: { tags: ['Accounting'], summary: 'Create expense', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['accountId', 'amount', 'date'], properties: { accountId: { type: 'string' }, amount: { type: 'number' }, date: { type: 'string', format: 'date' }, description: { type: 'string' }, vendorName: { type: 'string' } } } } } }, responses: { ...res201('Expense created') } },
  },
  '/accounting/expenses/summary': { get: { tags: ['Accounting'], summary: 'Expense summary', responses: { ...res200('Summary') } } },
  '/accounting/expenses/{id}': {
    get: { tags: ['Accounting'], summary: 'Get expense', parameters: [idParam()], responses: { ...res200('Expense') } },
    patch: { tags: ['Accounting'], summary: 'Update expense', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Accounting'], summary: 'Delete expense', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  // Reports
  '/accounting/reports/profit-loss': { get: { tags: ['Accounting'], summary: 'Profit & Loss report', responses: { ...res200('P&L report') } } },
  '/accounting/reports/balance-sheet': { get: { tags: ['Accounting'], summary: 'Balance Sheet report', responses: { ...res200('Balance sheet') } } },
  '/accounting/reports/cash-flow': { get: { tags: ['Accounting'], summary: 'Cash Flow report', responses: { ...res200('Cash flow') } } },
  '/accounting/reports/trial-balance': { get: { tags: ['Accounting'], summary: 'Trial Balance report', responses: { ...res200('Trial balance') } } },

  /* ================================================================
   * INVENTORY
   * ================================================================ */
  // Products
  '/inventory/products': {
    get: { tags: ['Inventory'], summary: 'List products', parameters: [...paginationParams], responses: { ...resList('Products', { type: 'object' }) } },
    post: { tags: ['Inventory'], summary: 'Create product', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'sku'], properties: { name: { type: 'string' }, sku: { type: 'string' }, description: { type: 'string' }, price: { type: 'number' }, unit: { type: 'string' } } } } } }, responses: { ...res201('Product created') } },
  },
  '/inventory/products/{id}': {
    get: { tags: ['Inventory'], summary: 'Get product', parameters: [idParam()], responses: { ...res200('Product') } },
    patch: { tags: ['Inventory'], summary: 'Update product', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Inventory'], summary: 'Delete product', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  // Warehouses
  '/inventory/warehouses': {
    get: { tags: ['Inventory'], summary: 'List warehouses', parameters: [...paginationParams], responses: { ...resList('Warehouses', { type: 'object' }) } },
    post: { tags: ['Inventory'], summary: 'Create warehouse', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, address: { type: 'string' } } } } } }, responses: { ...res201('Warehouse created') } },
  },
  '/inventory/warehouses/{id}': {
    get: { tags: ['Inventory'], summary: 'Get warehouse', parameters: [idParam()], responses: { ...res200('Warehouse') } },
    patch: { tags: ['Inventory'], summary: 'Update warehouse', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Inventory'], summary: 'Delete warehouse', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/inventory/warehouses/{id}/stock': { get: { tags: ['Inventory'], summary: 'Get warehouse stock levels', parameters: [idParam()], responses: { ...res200('Stock levels') } } },
  // Stock
  '/inventory/stock': { get: { tags: ['Inventory'], summary: 'List stock across warehouses', parameters: [...paginationParams], responses: { ...resList('Stock', { type: 'object' }) } } },
  '/inventory/stock/low-stock': { get: { tags: ['Inventory'], summary: 'Get low-stock alerts', responses: { ...res200('Low stock items') } } },
  '/inventory/stock/adjustment': { post: { tags: ['Inventory'], summary: 'Create stock adjustment', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['productId', 'warehouseId', 'quantity', 'reason'], properties: { productId: { type: 'string' }, warehouseId: { type: 'string' }, quantity: { type: 'number' }, reason: { type: 'string' } } } } } }, responses: { ...res201('Adjustment created') } } },
  // Transfers
  '/inventory/transfers': {
    get: { tags: ['Inventory'], summary: 'List stock transfers', parameters: [...paginationParams], responses: { ...resList('Transfers', { type: 'object' }) } },
    post: { tags: ['Inventory'], summary: 'Create stock transfer', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['fromWarehouseId', 'toWarehouseId', 'items'], properties: { fromWarehouseId: { type: 'string' }, toWarehouseId: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { productId: { type: 'string' }, quantity: { type: 'number' } } } } } } } } }, responses: { ...res201('Transfer created') } },
  },
  '/inventory/transfers/{id}': {
    get: { tags: ['Inventory'], summary: 'Get transfer', parameters: [idParam()], responses: { ...res200('Transfer') } },
    patch: { tags: ['Inventory'], summary: 'Update transfer', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Inventory'], summary: 'Delete transfer', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/inventory/transfers/{id}/dispatch': { patch: { tags: ['Inventory'], summary: 'Dispatch transfer', parameters: [idParam()], responses: { ...res200('Dispatched') } } },
  '/inventory/transfers/{id}/receive': { patch: { tags: ['Inventory'], summary: 'Receive transfer', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { receivedItems: { type: 'array', items: { type: 'object', properties: { productId: { type: 'string' }, receivedQuantity: { type: 'number' } } } } } } } } }, responses: { ...res200('Received') } } },
  // Movements & Reports
  '/inventory/movements': { get: { tags: ['Inventory'], summary: 'List stock movements', parameters: [...paginationParams], responses: { ...resList('Movements', { type: 'object' }) } } },
  '/inventory/reports/valuation': { get: { tags: ['Inventory'], summary: 'Stock valuation report', responses: { ...res200('Valuation report') } } },
  '/inventory/reports/movement': { get: { tags: ['Inventory'], summary: 'Stock movement report', responses: { ...res200('Movement report') } } },

  /* ================================================================
   * FIELD SALES
   * ================================================================ */
  '/field/dashboard': { get: { tags: ['Field Sales'], summary: 'Field sales dashboard', responses: { ...res200('Dashboard data') } } },
  // Clients
  '/field/clients': {
    get: { tags: ['Field Sales'], summary: 'List field clients', parameters: [...paginationParams], responses: { ...resList('Clients', { type: 'object' }) } },
    post: { tags: ['Field Sales'], summary: 'Create field client', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, address: { type: 'string' }, latitude: { type: 'number' }, longitude: { type: 'number' } } } } } }, responses: { ...res201('Client created') } },
  },
  '/field/clients/nearby': { get: { tags: ['Field Sales'], summary: 'Find nearby clients', parameters: [{ name: 'latitude', in: 'query', required: true, schema: { type: 'number' } }, { name: 'longitude', in: 'query', required: true, schema: { type: 'number' } }, { name: 'radius', in: 'query', schema: { type: 'number' } }], responses: { ...res200('Nearby clients') } } },
  '/field/clients/map': { get: { tags: ['Field Sales'], summary: 'Get clients for map view', responses: { ...res200('Map data') } } },
  '/field/clients/import': { post: { tags: ['Field Sales'], summary: 'Import clients', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res201('Imported') } } },
  '/field/clients/{id}': {
    get: { tags: ['Field Sales'], summary: 'Get client', parameters: [idParam()], responses: { ...res200('Client') } },
    patch: { tags: ['Field Sales'], summary: 'Update client', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Field Sales'], summary: 'Delete client', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/field/clients/{id}/notes': { post: { tags: ['Field Sales'], summary: 'Add note to client', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' } } } } } }, responses: { ...res201('Note added') } } },
  // Visits
  '/field/visits': {
    get: { tags: ['Field Sales'], summary: 'List visits', parameters: [...paginationParams], responses: { ...resList('Visits', { type: 'object' }) } },
    post: { tags: ['Field Sales'], summary: 'Schedule visit', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['clientId', 'scheduledDate'], properties: { clientId: { type: 'string' }, scheduledDate: { type: 'string', format: 'date-time' }, purpose: { type: 'string' } } } } } }, responses: { ...res201('Visit scheduled') } },
  },
  '/field/visits/today': { get: { tags: ['Field Sales'], summary: 'Get today\'s visits', responses: { ...res200('Today visits') } } },
  '/field/visits/timeline/{employeeId}': { get: { tags: ['Field Sales'], summary: 'Visit timeline for employee', parameters: [idParam('employeeId', 'Employee ID')], responses: { ...res200('Timeline') } } },
  '/field/visits/check-in': { post: { tags: ['Field Sales'], summary: 'Check in to visit', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['clientId', 'latitude', 'longitude'], properties: { clientId: { type: 'string' }, latitude: { type: 'number' }, longitude: { type: 'number' }, notes: { type: 'string' } } } } } }, responses: { ...res201('Checked in') } } },
  '/field/visits/{id}': {
    get: { tags: ['Field Sales'], summary: 'Get visit', parameters: [idParam()], responses: { ...res200('Visit') } },
    patch: { tags: ['Field Sales'], summary: 'Update visit', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Field Sales'], summary: 'Delete visit', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/field/visits/{id}/check-out': { post: { tags: ['Field Sales'], summary: 'Check out from visit', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'string' }, outcome: { type: 'string' } } } } } }, responses: { ...res200('Checked out') } } },
  // Tasks
  '/field/tasks': {
    get: { tags: ['Field Sales'], summary: 'List field tasks', parameters: [...paginationParams], responses: { ...resList('Tasks', { type: 'object' }) } },
    post: { tags: ['Field Sales'], summary: 'Create field task', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title', 'assigneeId'], properties: { title: { type: 'string' }, description: { type: 'string' }, assigneeId: { type: 'string' }, dueDate: { type: 'string', format: 'date' }, clientId: { type: 'string' } } } } } }, responses: { ...res201('Task created') } },
  },
  '/field/tasks/my': { get: { tags: ['Field Sales'], summary: 'My field tasks', responses: { ...res200('My tasks') } } },
  '/field/tasks/team': { get: { tags: ['Field Sales'], summary: 'Team field tasks', responses: { ...res200('Team tasks') } } },
  '/field/tasks/{id}': {
    get: { tags: ['Field Sales'], summary: 'Get task', parameters: [idParam()], responses: { ...res200('Task') } },
    patch: { tags: ['Field Sales'], summary: 'Update task', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Field Sales'], summary: 'Delete task', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/field/tasks/{id}/accept': { patch: { tags: ['Field Sales'], summary: 'Accept task', parameters: [idParam()], responses: { ...res200('Accepted') } } },
  '/field/tasks/{id}/complete': { patch: { tags: ['Field Sales'], summary: 'Complete task', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'string' }, outcome: { type: 'string' } } } } } }, responses: { ...res200('Completed') } } },
  // Targets
  '/field/targets': {
    get: { tags: ['Field Sales'], summary: 'List targets', parameters: [...paginationParams], responses: { ...resList('Targets', { type: 'object' }) } },
    post: { tags: ['Field Sales'], summary: 'Create target', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['employeeId', 'type', 'value', 'period'], properties: { employeeId: { type: 'string' }, type: { type: 'string', enum: ['revenue', 'visits', 'orders'] }, value: { type: 'number' }, period: { type: 'string', enum: ['daily', 'weekly', 'monthly'] } } } } } }, responses: { ...res201('Target created') } },
  },
  '/field/targets/my': { get: { tags: ['Field Sales'], summary: 'My targets', responses: { ...res200('My targets') } } },
  '/field/targets/leaderboard': { get: { tags: ['Field Sales'], summary: 'Sales leaderboard', responses: { ...res200('Leaderboard') } } },
  '/field/targets/team-summary': { get: { tags: ['Field Sales'], summary: 'Team target summary', responses: { ...res200('Team summary') } } },
  '/field/targets/{id}': {
    get: { tags: ['Field Sales'], summary: 'Get target', parameters: [idParam()], responses: { ...res200('Target') } },
    patch: { tags: ['Field Sales'], summary: 'Update target', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Field Sales'], summary: 'Delete target', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  // Orders
  '/field/orders': {
    get: { tags: ['Field Sales'], summary: 'List field orders', parameters: [...paginationParams], responses: { ...resList('Orders', { type: 'object' }) } },
    post: { tags: ['Field Sales'], summary: 'Create field order', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['clientId', 'items'], properties: { clientId: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { productId: { type: 'string' }, quantity: { type: 'number' }, price: { type: 'number' } } } }, notes: { type: 'string' } } } } } }, responses: { ...res201('Order created') } },
  },
  '/field/orders/my': { get: { tags: ['Field Sales'], summary: 'My orders', responses: { ...res200('My orders') } } },
  '/field/orders/reports': { get: { tags: ['Field Sales'], summary: 'Order reports', responses: { ...res200('Reports') } } },
  '/field/orders/{id}': {
    get: { tags: ['Field Sales'], summary: 'Get order', parameters: [idParam()], responses: { ...res200('Order') } },
    patch: { tags: ['Field Sales'], summary: 'Update order', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Field Sales'], summary: 'Delete order', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/field/orders/{id}/status': { patch: { tags: ['Field Sales'], summary: 'Update order status', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['pending', 'confirmed', 'dispatched', 'delivered', 'cancelled'] } } } } } }, responses: { ...res200('Status updated') } } },
  // Payments
  '/field/payments': {
    get: { tags: ['Field Sales'], summary: 'List field payments', parameters: [...paginationParams], responses: { ...resList('Payments', { type: 'object' }) } },
    post: { tags: ['Field Sales'], summary: 'Record field payment', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['clientId', 'amount', 'method'], properties: { clientId: { type: 'string' }, orderId: { type: 'string' }, amount: { type: 'number' }, method: { type: 'string', enum: ['cash', 'upi', 'cheque', 'bank-transfer'] }, reference: { type: 'string' } } } } } }, responses: { ...res201('Payment recorded') } },
  },
  '/field/payments/my': { get: { tags: ['Field Sales'], summary: 'My collected payments', responses: { ...res200('My payments') } } },
  '/field/payments/reports/daily': { get: { tags: ['Field Sales'], summary: 'Daily payment report', responses: { ...res200('Daily report') } } },
  '/field/payments/reports/outstanding': { get: { tags: ['Field Sales'], summary: 'Outstanding payments report', responses: { ...res200('Outstanding report') } } },
  '/field/payments/{id}': {
    get: { tags: ['Field Sales'], summary: 'Get payment', parameters: [idParam()], responses: { ...res200('Payment') } },
    patch: { tags: ['Field Sales'], summary: 'Update payment', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Field Sales'], summary: 'Delete payment', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/field/payments/{id}/verify': { patch: { tags: ['Field Sales'], summary: 'Verify payment', parameters: [idParam()], responses: { ...res200('Verified') } } },
  // Tracking
  '/field/tracking/batch': { post: { tags: ['Field Sales'], summary: 'Ingest GPS batch', description: 'Upload a batch of GPS coordinates from mobile device.', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['points'], properties: { points: { type: 'array', items: { type: 'object', properties: { latitude: { type: 'number' }, longitude: { type: 'number' }, timestamp: { type: 'string', format: 'date-time' }, accuracy: { type: 'number' }, battery: { type: 'number' } } } } } } } } }, responses: { ...res200('Batch ingested') } } },
  '/field/tracking/live': { get: { tags: ['Field Sales'], summary: 'Get live locations of field employees', responses: { ...res200('Live locations') } } },
  '/field/tracking/history/{employeeId}': { get: { tags: ['Field Sales'], summary: 'Get tracking history', parameters: [idParam('employeeId', 'Employee ID')], responses: { ...res200('Tracking history') } } },

  /* ================================================================
   * AI
   * ================================================================ */
  // Providers
  '/ai/providers': {
    get: { tags: ['AI'], summary: 'List AI providers', responses: { ...resList('Providers', { type: 'object' }) } },
    post: { tags: ['AI'], summary: 'Add AI provider', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'type', 'apiKey'], properties: { name: { type: 'string' }, type: { type: 'string', enum: ['openai', 'gemini', 'ollama'] }, apiKey: { type: 'string' }, baseUrl: { type: 'string' }, models: { type: 'array', items: { type: 'string' } } } } } } }, responses: { ...res201('Provider added') } },
  },
  '/ai/providers/test': { post: { tags: ['AI'], summary: 'Test AI provider connection', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['type', 'apiKey'], properties: { type: { type: 'string' }, apiKey: { type: 'string' }, baseUrl: { type: 'string' } } } } } }, responses: { ...res200('Connection test result') } } },
  '/ai/providers/{id}': {
    patch: { tags: ['AI'], summary: 'Update AI provider', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['AI'], summary: 'Delete AI provider', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  // Chat
  '/ai/chat/conversations': {
    get: { tags: ['AI'], summary: 'List AI conversations', responses: { ...resList('Conversations', { type: 'object' }) } },
  },
  '/ai/chat/conversations/{id}': {
    get: { tags: ['AI'], summary: 'Get AI conversation', parameters: [idParam()], responses: { ...res200('Conversation with messages') } },
    delete: { tags: ['AI'], summary: 'Delete AI conversation', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/ai/chat/message': {
    post: { tags: ['AI'], summary: 'Send message to AI', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['message'], properties: { message: { type: 'string' }, conversationId: { type: 'string' }, model: { type: 'string' } } } } } }, responses: { ...res200('AI response') } },
  },
  // Assistants
  '/ai/reporting/query': { post: { tags: ['AI'], summary: 'AI reporting query', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } } } }, responses: { ...res200('Report result') } } },
  '/ai/hr-assistant/query': { post: { tags: ['AI'], summary: 'HR AI assistant', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } } } }, responses: { ...res200('HR assistant response') } } },
  '/ai/finance-assistant/query': { post: { tags: ['AI'], summary: 'Finance AI assistant', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } } } }, responses: { ...res200('Finance assistant response') } } },
  '/ai/sales-assistant/query': { post: { tags: ['AI'], summary: 'Sales AI assistant', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } } } }, responses: { ...res200('Sales assistant response') } } },
  // Document AI
  '/ai/document/extract': { post: { tags: ['AI'], summary: 'Extract data from document', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['documentUrl'], properties: { documentUrl: { type: 'string' }, extractionType: { type: 'string' } } } } } }, responses: { ...res200('Extracted data') } } },
  '/ai/document/classify': { post: { tags: ['AI'], summary: 'Classify document', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['documentUrl'], properties: { documentUrl: { type: 'string' } } } } } }, responses: { ...res200('Classification result') } } },
  '/ai/auto-description/generate': { post: { tags: ['AI'], summary: 'Generate description with AI', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['context'], properties: { context: { type: 'string' }, type: { type: 'string' } } } } } }, responses: { ...res200('Generated description') } } },
  // Usage
  '/ai/usage/dashboard': { get: { tags: ['AI'], summary: 'AI usage dashboard', responses: { ...res200('Usage stats') } } },
  '/ai/usage/by-user': { get: { tags: ['AI'], summary: 'AI usage by user', responses: { ...res200('Per-user usage') } } },
  '/ai/usage/logs': { get: { tags: ['AI'], summary: 'AI usage logs', responses: { ...resList('Usage logs', { type: 'object' }) } } },
  '/ai/budget': {
    get: { tags: ['AI'], summary: 'Get AI budget', responses: { ...res200('Budget') } },
    patch: { tags: ['AI'], summary: 'Update AI budget', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { monthlyLimit: { type: 'number' }, alertThreshold: { type: 'number' } } } } } }, responses: { ...res200('Budget updated') } },
  },

  /* ================================================================
   * CHAT (Real-time messaging)
   * ================================================================ */
  '/chat/channels': {
    get: { tags: ['Chat'], summary: 'Get my channels', responses: { ...resList('Channels', { type: 'object' }) } },
    post: { tags: ['Chat'], summary: 'Create channel', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'type'], properties: { name: { type: 'string' }, type: { type: 'string', enum: ['group', 'direct'] }, memberIds: { type: 'array', items: { type: 'string' } } } } } } }, responses: { ...res201('Channel created') } },
  },
  '/chat/channels/direct/{userId}': { get: { tags: ['Chat'], summary: 'Get or create direct channel', parameters: [idParam('userId', 'User ID')], responses: { ...res200('Direct channel') } } },
  '/chat/channels/{id}': {
    get: { tags: ['Chat'], summary: 'Get channel', parameters: [idParam()], responses: { ...res200('Channel') } },
    patch: { tags: ['Chat'], summary: 'Update channel', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Chat'], summary: 'Delete channel', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/chat/channels/{id}/members': { post: { tags: ['Chat'], summary: 'Add member to channel', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['userId'], properties: { userId: { type: 'string' } } } } } }, responses: { ...res201('Member added') } } },
  '/chat/channels/{id}/members/{userId}': { delete: { tags: ['Chat'], summary: 'Remove member', parameters: [idParam(), idParam('userId', 'User ID')], responses: { ...res200('Member removed') } } },
  '/chat/channels/{id}/messages': {
    get: { tags: ['Chat'], summary: 'Get messages', parameters: [idParam(), { name: 'before', in: 'query', schema: { type: 'string' }, description: 'Cursor for pagination' }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }], responses: { ...resList('Messages', { type: 'object' }) } },
    post: { tags: ['Chat'], summary: 'Send message', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' }, attachments: { type: 'array', items: { type: 'string' } } } } } } }, responses: { ...res201('Message sent') } },
  },
  '/chat/messages/{id}': {
    patch: { tags: ['Chat'], summary: 'Edit message', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' } } } } } }, responses: { ...res200('Message edited') } },
    delete: { tags: ['Chat'], summary: 'Delete message', parameters: [idParam()], responses: { ...res200('Message deleted') } },
  },
  '/chat/messages/{id}/reactions': {
    post: { tags: ['Chat'], summary: 'Add reaction', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['emoji'], properties: { emoji: { type: 'string', example: '👍' } } } } } }, responses: { ...res201('Reaction added') } },
    delete: { tags: ['Chat'], summary: 'Remove reaction', parameters: [idParam()], responses: { ...res200('Reaction removed') } },
  },
  '/chat/messages/{id}/read': { post: { tags: ['Chat'], summary: 'Mark message as read', parameters: [idParam()], responses: { ...res200('Marked') } } },
  '/chat/search': { get: { tags: ['Chat'], summary: 'Search messages', parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }], responses: { ...resList('Search results', { type: 'object' }) } } },

  /* ================================================================
   * CALLS
   * ================================================================ */
  '/calls/token': { post: { tags: ['Calls'], summary: 'Generate call token', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['channelName'], properties: { channelName: { type: 'string' }, role: { type: 'string', enum: ['publisher', 'subscriber'] } } } } } }, responses: { ...res200('Token generated') } } },
  '/calls/initiate': { post: { tags: ['Calls'], summary: 'Initiate call', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['targetUserId', 'type'], properties: { targetUserId: { type: 'string' }, type: { type: 'string', enum: ['voice', 'video'] } } } } } }, responses: { ...res201('Call initiated') } } },
  '/calls/{id}/status': { patch: { tags: ['Calls'], summary: 'Update call status', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ringing', 'answered', 'ended', 'missed', 'rejected'] } } } } } }, responses: { ...res200('Status updated') } } },
  '/calls/history': { get: { tags: ['Calls'], summary: 'Get call history', parameters: [...paginationParams], responses: { ...resList('Call history', { type: 'object' }) } } },

  /* ================================================================
   * DOCUMENTS
   * ================================================================ */
  '/documents': {
    get: { tags: ['Documents'], summary: 'List documents', parameters: [...paginationParams, { name: 'folderId', in: 'query', schema: { type: 'string' } }], responses: { ...resList('Documents', { type: 'object' }) } },
    post: { tags: ['Documents'], summary: 'Create document', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, content: { type: 'string' }, folderId: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } } } } } }, responses: { ...res201('Document created') } },
  },
  '/documents/{id}': {
    get: { tags: ['Documents'], summary: 'Get document', parameters: [idParam()], responses: { ...res200('Document') } },
    patch: { tags: ['Documents'], summary: 'Update document', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } } } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Documents'], summary: 'Delete document', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/documents/{id}/share': { post: { tags: ['Documents'], summary: 'Share document', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['userIds'], properties: { userIds: { type: 'array', items: { type: 'string' } }, permission: { type: 'string', enum: ['view', 'edit'] } } } } } }, responses: { ...res200('Shared') } } },
  '/documents/{id}/versions': { get: { tags: ['Documents'], summary: 'Get document versions', parameters: [idParam()], responses: { ...resList('Versions', { type: 'object' }) } } },

  /* ================================================================
   * FORMS
   * ================================================================ */
  '/forms': {
    get: { tags: ['Forms'], summary: 'List forms', responses: { ...resList('Forms', { type: 'object' }) } },
    post: { tags: ['Forms'], summary: 'Create form', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title', 'fields'], properties: { title: { type: 'string' }, description: { type: 'string' }, fields: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, type: { type: 'string', enum: ['text', 'number', 'email', 'select', 'checkbox', 'date', 'file'] }, required: { type: 'boolean' }, options: { type: 'array', items: { type: 'string' } } } } } } } } } }, responses: { ...res201('Form created') } },
  },
  '/forms/{id}': {
    get: { tags: ['Forms'], summary: 'Get form', parameters: [idParam()], responses: { ...res200('Form') } },
    patch: { tags: ['Forms'], summary: 'Update form', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Forms'], summary: 'Delete form', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/forms/{id}/submissions': { get: { tags: ['Forms'], summary: 'List form submissions', parameters: [idParam(), ...paginationParams], responses: { ...resList('Submissions', { type: 'object' }) } } },
  '/forms/{id}/submit': { post: { tags: ['Forms'], summary: 'Submit form', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['data'], properties: { data: { type: 'object', description: 'Key-value pairs matching form field IDs' } } } } } }, responses: { ...res201('Form submitted') } } },

  /* ================================================================
   * CALENDAR
   * ================================================================ */
  '/calendar/events': {
    get: { tags: ['Calendar'], summary: 'List events', parameters: [{ name: 'start', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'end', in: 'query', schema: { type: 'string', format: 'date' } }], responses: { ...resList('Events', { type: 'object' }) } },
    post: { tags: ['Calendar'], summary: 'Create event', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title', 'start', 'end'], properties: { title: { type: 'string' }, start: { type: 'string', format: 'date-time' }, end: { type: 'string', format: 'date-time' }, allDay: { type: 'boolean' }, attendees: { type: 'array', items: { type: 'string' } }, recurrence: { type: 'string' } } } } } }, responses: { ...res201('Event created') } },
  },
  '/calendar/events/{id}': {
    get: { tags: ['Calendar'], summary: 'Get event', parameters: [idParam()], responses: { ...res200('Event') } },
    patch: { tags: ['Calendar'], summary: 'Update event', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Calendar'], summary: 'Delete event', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },

  /* ================================================================
   * NOTES
   * ================================================================ */
  '/notes': {
    get: { tags: ['Notes'], summary: 'List notes', responses: { ...resList('Notes', { type: 'object' }) } },
    post: { tags: ['Notes'], summary: 'Create note', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, color: { type: 'string' } } } } } }, responses: { ...res201('Note created') } },
  },
  '/notes/{id}': {
    get: { tags: ['Notes'], summary: 'Get note', parameters: [idParam()], responses: { ...res200('Note') } },
    patch: { tags: ['Notes'], summary: 'Update note', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Notes'], summary: 'Delete note', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/notes/{id}/pin': { patch: { tags: ['Notes'], summary: 'Toggle pin status', parameters: [idParam()], responses: { ...res200('Pin toggled') } } },

  /* ================================================================
   * NOTICES
   * ================================================================ */
  '/notices': {
    get: { tags: ['Notices'], summary: 'List notices', responses: { ...resList('Notices', { type: 'object' }) } },
    post: { tags: ['Notices'], summary: 'Create notice', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title', 'content'], properties: { title: { type: 'string' }, content: { type: 'string' }, priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] }, departmentIds: { type: 'array', items: { type: 'string' } }, expiresAt: { type: 'string', format: 'date-time' } } } } } }, responses: { ...res201('Notice created') } },
  },
  '/notices/{id}': {
    get: { tags: ['Notices'], summary: 'Get notice', parameters: [idParam()], responses: { ...res200('Notice') } },
    patch: { tags: ['Notices'], summary: 'Update notice', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Notices'], summary: 'Delete notice', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/notices/{id}/acknowledge': { post: { tags: ['Notices'], summary: 'Acknowledge notice', parameters: [idParam()], responses: { ...res200('Acknowledged') } } },

  /* ================================================================
   * LOCATIONS
   * ================================================================ */
  '/locations': {
    get: { tags: ['Locations'], summary: 'List office locations', responses: { ...resList('Locations', { type: 'object' }) } },
    post: { tags: ['Locations'], summary: 'Create location', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'address'], properties: { name: { type: 'string' }, address: { type: 'string' }, city: { type: 'string' }, state: { type: 'string' }, country: { type: 'string' }, latitude: { type: 'number' }, longitude: { type: 'number' } } } } } }, responses: { ...res201('Location created') } },
  },
  '/locations/{id}': {
    get: { tags: ['Locations'], summary: 'Get location', parameters: [idParam()], responses: { ...res200('Location') } },
    patch: { tags: ['Locations'], summary: 'Update location', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Locations'], summary: 'Delete location', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/locations/{id}/employees': { post: { tags: ['Locations'], summary: 'Assign employees to location', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['employeeIds'], properties: { employeeIds: { type: 'array', items: { type: 'string' } } } } } } }, responses: { ...res200('Employees assigned') } } },

  /* ================================================================
   * ID CARDS
   * ================================================================ */
  '/id-cards/templates': {
    get: { tags: ['ID Cards'], summary: 'List ID card templates', responses: { ...resList('Templates', { type: 'object' }) } },
    post: { tags: ['ID Cards'], summary: 'Create template', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'layout'], properties: { name: { type: 'string' }, layout: { type: 'object' } } } } } }, responses: { ...res201('Template created') } },
  },
  '/id-cards/templates/{id}': { patch: { tags: ['ID Cards'], summary: 'Update template', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } } },
  '/id-cards/generate/{employeeId}': { get: { tags: ['ID Cards'], summary: 'Generate ID card for employee', parameters: [idParam('employeeId', 'Employee ID')], responses: { 200: { description: 'ID card image/PDF', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } } } } },

  /* ================================================================
   * BACKUPS
   * ================================================================ */
  '/backups': {
    get: { tags: ['Backups'], summary: 'List backups', responses: { ...resList('Backups', { type: 'object' }) } },
    post: { tags: ['Backups'], summary: 'Create backup', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { type: { type: 'string', enum: ['full', 'incremental'] }, description: { type: 'string' } } } } } }, responses: { ...res201('Backup started') } },
  },
  '/backups/{id}': {
    delete: { tags: ['Backups'], summary: 'Delete backup', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/backups/{id}/restore': { post: { tags: ['Backups'], summary: 'Restore from backup', parameters: [idParam()], responses: { ...res200('Restore initiated') } } },

};
