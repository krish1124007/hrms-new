import swaggerJsdoc from 'swagger-jsdoc';
import { swaggerPaths } from '../docs/swagger-paths.js';
import { getRegisteredSchemas } from '../lib/openapi-registry.js';
const options = {
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'D-HRMS API',
            version: '1.0.0',
            description: 'REST API of D-HRMS (Dharmesh Deshani Group of Companies): employees, attendance, ' +
                'leave, payroll, expenses and field visits. ' +
                'Authentication is JWT-based; include the token in the `Authorization: Bearer <token>` header.',
            license: { name: 'Proprietary' },
        },
        servers: [{ url: '/api/v1', description: 'API v1' }],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT token obtained from POST /api/v1/auth/login',
                },
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        error: {
                            type: 'object',
                            properties: {
                                code: { type: 'string', example: 'VALIDATION_ERROR' },
                                message: { type: 'string', example: 'Invalid request body' },
                                details: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            field: { type: 'string' },
                                            message: { type: 'string' },
                                        },
                                    },
                                },
                            },
                            required: ['code', 'message'],
                        },
                    },
                    required: ['success', 'error'],
                },
                Pagination: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer', example: 1 },
                        limit: { type: 'integer', example: 20 },
                        total: { type: 'integer', example: 150 },
                        pages: { type: 'integer', example: 8 },
                    },
                },
                SuccessResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        data: { type: 'object' },
                        message: { type: 'string' },
                        pagination: { $ref: '#/components/schemas/Pagination' },
                    },
                    required: ['success'],
                },
                ObjectId: {
                    type: 'string',
                    pattern: '^[a-fA-F0-9]{24}$',
                    example: '507f1f77bcf86cd799439011',
                },
                Timestamps: {
                    type: 'object',
                    properties: {
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                        deletedAt: { type: 'string', format: 'date-time', nullable: true },
                    },
                },
                // ─── Auth ───
                LoginRequest: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: { type: 'string', format: 'email', example: 'john@acme.com' },
                        password: { type: 'string', example: 'Str0ng!Pass' },
                    },
                },
                AuthTokens: {
                    type: 'object',
                    properties: {
                        accessToken: { type: 'string' },
                        refreshToken: { type: 'string' },
                        expiresIn: { type: 'integer', example: 3600 },
                    },
                },
                User: {
                    type: 'object',
                    properties: {
                        _id: { $ref: '#/components/schemas/ObjectId' },
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        role: { type: 'string' },
                        status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    },
                },
                // ─── Employee ───
                Employee: {
                    type: 'object',
                    properties: {
                        _id: { $ref: '#/components/schemas/ObjectId' },
                        employeeId: { type: 'string', example: 'EMP-001' },
                        userId: { $ref: '#/components/schemas/ObjectId' },
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        phone: { type: 'string' },
                        departmentId: { $ref: '#/components/schemas/ObjectId' },
                        designationId: { $ref: '#/components/schemas/ObjectId' },
                        status: { type: 'string', enum: ['active', 'inactive', 'on-leave', 'terminated'] },
                        dateOfBirth: { type: 'string', format: 'date' },
                        dateOfJoining: { type: 'string', format: 'date' },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    },
                },
                CreateEmployeeRequest: {
                    type: 'object',
                    required: ['firstName', 'lastName', 'email', 'departmentId', 'designationId', 'dateOfJoining'],
                    properties: {
                        firstName: { type: 'string', example: 'Jane' },
                        lastName: { type: 'string', example: 'Smith' },
                        email: { type: 'string', format: 'email' },
                        phone: { type: 'string' },
                        departmentId: { $ref: '#/components/schemas/ObjectId' },
                        designationId: { $ref: '#/components/schemas/ObjectId' },
                        dateOfBirth: { type: 'string', format: 'date' },
                        dateOfJoining: { type: 'string', format: 'date' },
                    },
                },
                // ─── Department ───
                Department: {
                    type: 'object',
                    properties: {
                        _id: { $ref: '#/components/schemas/ObjectId' },
                        name: { type: 'string' },
                        code: { type: 'string' },
                        parentId: { $ref: '#/components/schemas/ObjectId' },
                        headId: { $ref: '#/components/schemas/ObjectId' },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    },
                },
                // ─── Attendance ───
                AttendanceRecord: {
                    type: 'object',
                    properties: {
                        _id: { $ref: '#/components/schemas/ObjectId' },
                        employeeId: { $ref: '#/components/schemas/ObjectId' },
                        date: { type: 'string', format: 'date' },
                        checkIn: { type: 'string', format: 'date-time' },
                        checkOut: { type: 'string', format: 'date-time', nullable: true },
                        status: { type: 'string', enum: ['present', 'absent', 'half-day', 'on-leave', 'holiday'] },
                        method: { type: 'string', enum: ['manual', 'biometric', 'geofence', 'qr', 'face', 'ip', 'selfie'] },
                        workHours: { type: 'number', example: 8.5 },
                    },
                },
                CheckInRequest: {
                    type: 'object',
                    properties: {
                        method: { type: 'string', enum: ['manual', 'biometric', 'geofence', 'qr', 'face', 'ip', 'selfie'] },
                        location: {
                            type: 'object',
                            properties: {
                                latitude: { type: 'number', example: 23.0225 },
                                longitude: { type: 'number', example: 72.5714 },
                            },
                        },
                        notes: { type: 'string' },
                    },
                },
                // ─── Leave ───
                LeaveType: {
                    type: 'object',
                    properties: {
                        _id: { $ref: '#/components/schemas/ObjectId' },
                        name: { type: 'string', example: 'Casual Leave' },
                        code: { type: 'string', example: 'CL' },
                        defaultBalance: { type: 'number', example: 12 },
                        carryForward: { type: 'boolean' },
                    },
                },
                LeaveRequest: {
                    type: 'object',
                    properties: {
                        _id: { $ref: '#/components/schemas/ObjectId' },
                        employeeId: { $ref: '#/components/schemas/ObjectId' },
                        leaveTypeId: { $ref: '#/components/schemas/ObjectId' },
                        startDate: { type: 'string', format: 'date' },
                        endDate: { type: 'string', format: 'date' },
                        days: { type: 'number' },
                        reason: { type: 'string' },
                        status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'cancelled'] },
                    },
                },
                // ─── Payroll ───
                SalaryComponent: {
                    type: 'object',
                    properties: {
                        _id: { $ref: '#/components/schemas/ObjectId' },
                        name: { type: 'string', example: 'Basic Salary' },
                        type: { type: 'string', enum: ['earning', 'deduction'] },
                        calculationType: { type: 'string', enum: ['fixed', 'percentage'] },
                    },
                },
                PayrollCycle: {
                    type: 'object',
                    properties: {
                        _id: { $ref: '#/components/schemas/ObjectId' },
                        month: { type: 'integer', minimum: 1, maximum: 12 },
                        year: { type: 'integer' },
                        status: { type: 'string', enum: ['draft', 'processing', 'processed', 'locked', 'paid'] },
                        totalEarnings: { type: 'number' },
                        totalDeductions: { type: 'number' },
                        netPayable: { type: 'number' },
                    },
                },
                // ─── Health ───
                HealthCheck: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', enum: ['ok', 'degraded'] },
                        uptime: { type: 'number' },
                        timestamp: { type: 'string', format: 'date-time' },
                        memory: {
                            type: 'object',
                            properties: {
                                rss: { type: 'integer' },
                                heapUsed: { type: 'integer' },
                                heapTotal: { type: 'integer' },
                            },
                        },
                        services: {
                            type: 'object',
                            properties: {
                                database: { type: 'string', enum: ['connected', 'disconnected'] },
                                redis: { type: 'string', enum: ['connected', 'disconnected'] },
                            },
                        },
                        version: { type: 'string' },
                    },
                },
            },
        },
        security: [{ bearerAuth: [] }],
        tags: [
            { name: 'Auth', description: 'Authentication & authorization' },
            { name: 'Users', description: 'User management' },
            { name: 'Roles', description: 'Role & permission management' },
            { name: 'Employees', description: 'Employee management' },
            { name: 'Departments', description: 'Department management' },
            { name: 'Designations', description: 'Designation / job-title management' },
            { name: 'Shifts', description: 'Work shift management' },
            { name: 'Holidays', description: 'Holiday calendar management' },
            { name: 'Attendance', description: 'Attendance tracking (7 methods: manual, biometric, geofence, QR, face, IP, selfie)' },
            { name: 'Leaves', description: 'Leave management (types, balances, requests)' },
            { name: 'Payroll', description: 'Payroll processing (components, structures, cycles, payslips)' },
            { name: 'Expense Claims', description: 'Employee expense claim management' },
            { name: 'Projects', description: 'Project management with milestones, tasks, and time entries' },
            { name: 'Timesheets', description: 'Employee timesheet views' },
            { name: 'Field Visits', description: 'Field visits (sites, check-in/out, work reports, planning, tasks, routes, travel allowance, reports)' },
            { name: 'Documents', description: 'Document management & versioning' },
            { name: 'Tasks', description: 'Standalone task management' },
            { name: 'Calendar', description: 'Calendar & events' },
            { name: 'Notices', description: 'Company notice board' },
            { name: 'Approvals', description: 'Approval workflows' },
            { name: 'Locations', description: 'Office / branch location management' },
            { name: 'Import/Export', description: 'Bulk data import & export' },
            { name: 'ID Cards', description: 'Employee ID card templates & generation' },
            { name: 'Backups', description: 'Database backup & restore' },
            { name: 'System', description: 'Health checks & Prometheus metrics' },
        ],
        paths: swaggerPaths,
    },
    apis: [], // paths defined inline via swaggerPaths
};
const baseSpec = swaggerJsdoc(options);
/**
 * Merge handwritten schemas with auto-generated Zod conversions. Handwritten
 * takes precedence on key collisions — so teams migrating incrementally
 * can register a Zod schema AND keep the handwritten one until they're ready
 * to delete the handwritten version.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const spec = baseSpec;
spec.components = spec.components ?? {};
spec.components.schemas = {
    ...getRegisteredSchemas(),
    ...(spec.components.schemas ?? {}),
};
export const swaggerSpec = spec;
//# sourceMappingURL=swagger.js.map