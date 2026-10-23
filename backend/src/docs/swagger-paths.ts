/**
 * D-HRMS — OpenAPI 3.0 path definitions.
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
  '/auth/accept-invite': {
    post: {
      tags: ['Auth'],
      summary: 'Activate an invited account',
      description:
        'Exchanges the token from the invitation e-mail (link: /accept-invite?token=...) and a chosen password for an active account. Returns the same payload as login. A used or unknown token answers 400 INVALID_INVITE; a rejected password 400 WEAK_PASSWORD.',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token', 'password'],
              properties: {
                token: { type: 'string', minLength: 10 },
                password: { type: 'string', minLength: 8, maxLength: 128 },
              },
            },
          },
        },
      },
      responses: { ...res200('Account activated; user and tokens returned'), ...{ 400: errResponses[400] } },
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
      description: 'Returns the company-wide attendance settings (methods, geofence radius, etc.).',
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
  '/payroll/cycles/{id}/settle': {
    post: {
      tags: ['Payroll'],
      summary: 'Settle a paid cycle',
      description: 'Marks the loan instalments and expense claims the paid cycle deducted / reimbursed as paid / reimbursed. Idempotent: re-run it after a settlement that failed part-way.',
      parameters: [idParam()],
      responses: { ...res200('Instalments paid and claims reimbursed by this call') },
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
   * FIELD VISITS
   * ================================================================ */
  // Settings
  '/field/settings': {
    get: { tags: ['Field Visits'], summary: 'Field settings (selfie rule, site types, visit purposes, vehicles, checklists, …)', responses: { ...res200('Field settings') } },
    put: { tags: ['Field Visits'], summary: 'Update field settings (field.manage); any subset', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Saved settings') } },
  },
  // Sites
  '/field/sites': {
    get: { tags: ['Field Visits'], summary: 'List sites (own/team; all for field.manage); near=lat,lng sorts by distance', parameters: [...paginationParams, { name: 'search', in: 'query', schema: { type: 'string' } }, { name: 'type', in: 'query', schema: { type: 'string' } }, { name: 'assignedTo', in: 'query', schema: { type: 'string' } }, { name: 'near', in: 'query', schema: { type: 'string' } }, { name: 'radiusKm', in: 'query', schema: { type: 'number' } }], responses: { ...resList('Sites', { type: 'object' }) } },
    post: { tags: ['Field Visits'], summary: 'Pin a site (idempotent by clientRef)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'type', 'location'], properties: { clientRef: { type: 'string', format: 'uuid' }, capturedAt: { type: 'string', format: 'date-time' }, name: { type: 'string' }, type: { type: 'string' }, location: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' }, accuracy: { type: 'number' } } }, radiusM: { type: 'number' }, address: { type: 'object' }, contactName: { type: 'string' }, contactPhone: { type: 'string' }, notes: { type: 'string' }, photo: { type: 'string', description: 'Upload key' }, assignedTo: { type: 'array', items: { type: 'string' } } } } } } }, responses: { ...res201('Site created'), ...res200('Replay: the stored site') } },
  },
  '/field/sites/map': { get: { tags: ['Field Visits'], summary: 'Site pins inside a bounding box (≤ 500)', parameters: [{ name: 'bbox', in: 'query', schema: { type: 'string' }, description: 'minLng,minLat,maxLng,maxLat' }], responses: { ...res200('Pins') } } },
  '/field/sites/import': { post: { tags: ['Field Visits'], summary: 'Import sites from Excel (field.manage)', requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } }, responses: { ...res200('{ created, updated, errors }') } } },
  '/field/sites/{id}': {
    get: { tags: ['Field Visits'], summary: 'Get a site with its recent visits', parameters: [idParam()], responses: { ...res200('Site') } },
    patch: { tags: ['Field Visits'], summary: 'Update a site (creator within 24 h, or field.manage)', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Field Visits'], summary: 'Delete a site (field.manage)', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  // Uploads
  '/field/uploads/photo': { post: { tags: ['Field Visits'], summary: 'Upload a photo → { url, key }', requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { photo: { type: 'string', format: 'binary' } } } } } }, responses: { ...res201('Uploaded') } } },
  '/field/uploads/document': { post: { tags: ['Field Visits'], summary: 'Upload a document (pdf, image, doc/docx, xls/xlsx; ≤ 10 MB) → { url, key, name }', requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { document: { type: 'string', format: 'binary' } } } } } }, responses: { ...res201('Uploaded') } } },
  // Visits
  '/field/visits': {
    get: { tags: ['Field Visits'], summary: 'List visits', parameters: [...paginationParams], responses: { ...resList('Visits', { type: 'object' }) } },
    post: { tags: ['Field Visits'], summary: 'Schedule visit', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['siteId', 'scheduledDate'], properties: { siteId: { type: 'string' }, scheduledDate: { type: 'string', format: 'date-time' }, purpose: { type: 'string' } } } } } }, responses: { ...res201('Visit scheduled') } },
  },
  '/field/visits/today': { get: { tags: ['Field Visits'], summary: 'Get today\'s visits', responses: { ...res200('Today visits') } } },
  '/field/visits/timeline/{employeeId}': { get: { tags: ['Field Visits'], summary: 'Visit timeline for employee', parameters: [idParam('employeeId', 'Employee ID')], responses: { ...res200('Timeline') } } },
  '/field/visits/check-in': { post: { tags: ['Field Visits'], summary: 'Check in to visit', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['siteId', 'latitude', 'longitude'], properties: { siteId: { type: 'string' }, latitude: { type: 'number' }, longitude: { type: 'number' }, notes: { type: 'string' } } } } } }, responses: { ...res201('Checked in') } } },
  '/field/visits/{id}': {
    get: { tags: ['Field Visits'], summary: 'Get visit', parameters: [idParam()], responses: { ...res200('Visit') } },
    patch: { tags: ['Field Visits'], summary: 'Update visit', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Field Visits'], summary: 'Delete visit', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/field/visits/{id}/check-out': { post: { tags: ['Field Visits'], summary: 'Check out from visit', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'string' }, outcome: { type: 'string' } } } } } }, responses: { ...res200('Checked out') } } },
  // Tasks
  '/field/tasks': {
    get: { tags: ['Field Visits'], summary: 'List field tasks', parameters: [...paginationParams], responses: { ...resList('Tasks', { type: 'object' }) } },
    post: { tags: ['Field Visits'], summary: 'Create field task', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title', 'assigneeId'], properties: { title: { type: 'string' }, description: { type: 'string' }, assigneeId: { type: 'string' }, dueDate: { type: 'string', format: 'date' }, siteId: { type: 'string' } } } } } }, responses: { ...res201('Task created') } },
  },
  '/field/tasks/my': { get: { tags: ['Field Visits'], summary: 'My field tasks', responses: { ...res200('My tasks') } } },
  '/field/tasks/team': { get: { tags: ['Field Visits'], summary: 'Team field tasks', responses: { ...res200('Team tasks') } } },
  '/field/tasks/{id}': {
    get: { tags: ['Field Visits'], summary: 'Get task', parameters: [idParam()], responses: { ...res200('Task') } },
    patch: { tags: ['Field Visits'], summary: 'Update task', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { ...res200('Updated') } },
    delete: { tags: ['Field Visits'], summary: 'Delete task', parameters: [idParam()], responses: { ...res200('Deleted') } },
  },
  '/field/tasks/{id}/accept': { patch: { tags: ['Field Visits'], summary: 'Accept task', parameters: [idParam()], responses: { ...res200('Accepted') } } },
  '/field/tasks/{id}/complete': { patch: { tags: ['Field Visits'], summary: 'Complete task', parameters: [idParam()], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'string' }, outcome: { type: 'string' } } } } } }, responses: { ...res200('Completed') } } },
  // Tracking
  '/field/tracking/batch': { post: { tags: ['Field Visits'], summary: 'Ingest GPS batch', description: 'Upload a batch of GPS coordinates from mobile device.', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['points'], properties: { points: { type: 'array', items: { type: 'object', properties: { latitude: { type: 'number' }, longitude: { type: 'number' }, timestamp: { type: 'string', format: 'date-time' }, accuracy: { type: 'number' }, battery: { type: 'number' } } } } } } } } }, responses: { ...res200('Batch ingested') } } },
  '/field/tracking/live': { get: { tags: ['Field Visits'], summary: 'Get live locations of field employees', responses: { ...res200('Live locations') } } },
  '/field/tracking/history/{employeeId}': { get: { tags: ['Field Visits'], summary: 'Get tracking history', parameters: [idParam('employeeId', 'Employee ID')], responses: { ...res200('Tracking history') } } },

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
  '/backups/{id}/restore': { post: { tags: ['Backups'], summary: 'Restore into the scratch database (BACKUP_SCRATCH_MONGO_URI)', parameters: [idParam()], responses: { ...res200('Restore initiated') } } },
  '/backups/{id}/download': { get: { tags: ['Backups'], summary: 'Download backup tarball (backups.manage)', parameters: [idParam()], responses: { 200: { description: 'Backup tarball', content: { 'application/gzip': { schema: { type: 'string', format: 'binary' } } } } } } },

};
