/**
 * One-shot importer for the DDOPC employee CSV.
 *
 *   npx tsx apps/api/src/scripts/seed-employees-csv.ts
 *
 * Reads /tmp/employees.json (produced by /tmp/parse-employees.py) and:
 *  - Creates the "Urban Policies" department if missing
 *  - Auto-creates any missing designations under their department
 *  - Creates a User account for each row using the password from the CSV
 *  - Creates the Employee record linked to the User
 *
 * Idempotent: skips employees whose email already exists.
 */
import { readFileSync } from 'node:fs';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { Department } from '../models/department.model.js';
import { Designation } from '../models/designation.model.js';
import { Employee } from '../models/employee.model.js';
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js';
async function ensureDepartment(name, code) {
    const existing = await Department.findOne({ name }).exec();
    if (existing)
        return String(existing._id);
    const created = await Department.create({ name, code, status: 'active' });
    logger.info(`  + Created department: ${name} (${code})`);
    return String(created._id);
}
async function ensureDesignation(name, departmentId, level) {
    const existing = await Designation.findOne({
        name,
        department: departmentId,
    }).exec();
    if (existing)
        return String(existing._id);
    const created = await Designation.create({ name, department: departmentId, level });
    logger.info(`  + Created designation: ${name} (lvl ${level})`);
    return String(created._id);
}
async function nextDesignationLevel(deptId) {
    const top = await Designation.findOne({ department: deptId })
        .sort({ level: -1 })
        .select('level')
        .lean()
        .exec();
    return (top?.level ?? 0) + 1;
}
async function run() {
    const path = '/tmp/employees.json';
    const rows = JSON.parse(readFileSync(path, 'utf8'));
    logger.info(`Loaded ${rows.length} rows from ${path}`);
    await connectDatabase();
    let employeeRole = await Role.findOne({ slug: 'employee' }).exec();
    if (!employeeRole) {
        employeeRole = await Role.create({
            name: 'Employee',
            slug: 'employee',
            description: 'Standard employee — self-service only',
            permissions: ['employees.view', 'attendance.view', 'leaves.view'],
            isSystem: true,
        });
        logger.info('  + Created system role "employee"');
    }
    // Resolve departments referenced by the CSV
    const deptCodes = {
        Engineering: 'ENG',
        Operations: 'OPS',
        'Urban Policies': 'URP',
        Planning: 'PLN',
        Projects: 'PRJ',
    };
    const deptIds = new Map();
    const deptsInCsv = new Set(rows.map((r) => r.department));
    for (const name of deptsInCsv) {
        const code = deptCodes[name] ?? name.slice(0, 3).toUpperCase();
        deptIds.set(name, await ensureDepartment(name, code));
    }
    // Resolve designations (auto-create missing ones)
    const desigCache = new Map(); // key: `${deptId}::${name}`
    for (const r of rows) {
        const deptId = deptIds.get(r.department);
        const key = `${deptId}::${r.designation}`;
        if (desigCache.has(key))
            continue;
        const existing = await Designation.findOne({
            name: r.designation,
            department: deptId,
        }).exec();
        if (existing) {
            desigCache.set(key, String(existing._id));
        }
        else {
            const level = await nextDesignationLevel(deptId);
            desigCache.set(key, await ensureDesignation(r.designation, deptId, level));
        }
    }
    // Stats
    let created = 0;
    let skipped = 0;
    const failures = [];
    for (const r of rows) {
        try {
            // Skip if employee or user already exists
            const existingEmp = await Employee.findOne({ email: r.email }).exec();
            const existingUser = await User.findOne({ email: r.email }).exec();
            if (existingEmp || existingUser) {
                skipped++;
                logger.info(`  ↻ skipped (exists): ${r.email}`);
                continue;
            }
            // Create user account with the CSV-provided password
            const user = await User.create({
                email: r.email,
                password: r.password,
                firstName: r.firstName,
                lastName: r.lastName,
                role: employeeRole._id,
                status: 'active',
                emailVerified: true,
            });
            const deptId = deptIds.get(r.department);
            const desigId = desigCache.get(`${deptId}::${r.designation}`);
            // Stash CSV-only payroll components in otherAllowances so we don't lose
            // them. The Employee schema doesn't model PF/ESIC/PT/CTC/netPay, so we
            // park them under named keys until a payroll feature uses them properly.
            const otherAllowances = {};
            if (r.salary.employeePf)
                otherAllowances.employeePf = r.salary.employeePf;
            if (r.salary.employeeEsic)
                otherAllowances.employeeEsic = r.salary.employeeEsic;
            if (r.salary.employerPf)
                otherAllowances.employerPf = r.salary.employerPf;
            if (r.salary.employerEsic)
                otherAllowances.employerEsic = r.salary.employerEsic;
            if (r.salary.professionalTax)
                otherAllowances.professionalTax = r.salary.professionalTax;
            if (r.salary.netPay)
                otherAllowances.netPay = r.salary.netPay;
            if (r.salary.ctc)
                otherAllowances.ctc = r.salary.ctc;
            // Build the employee doc. Use the CSV-provided employeeId (EMP000001 etc.)
            // so they line up with the customer's existing records.
            const empDoc = {
                userId: user._id,
                employeeId: r.employeeIdProvided,
                firstName: r.firstName,
                lastName: r.lastName,
                email: r.email,
                phone: r.phone || undefined,
                dateOfBirth: r.dateOfBirth ? new Date(r.dateOfBirth) : undefined,
                gender: r.gender ?? undefined,
                department: deptId,
                designation: desigId,
                joiningDate: r.joiningDate ? new Date(r.joiningDate) : new Date(),
                employmentType: r.employmentType,
                status: r.status,
                workLocation: r.workLocation || undefined,
                address: {
                    current: {
                        line1: r.address.line1,
                        city: r.address.city,
                        state: r.address.state,
                        country: r.address.country,
                        zip: r.address.zip,
                    },
                    permanent: {
                        line1: r.address.line1,
                        city: r.address.city,
                        state: r.address.state,
                        country: r.address.country,
                        zip: r.address.zip,
                    },
                },
                emergencyContact: {
                    name: r.emergencyContact.name || undefined,
                    relation: r.emergencyContact.relation || undefined,
                    phone: r.emergencyContact.phone || undefined,
                },
                bankDetails: {
                    bankName: r.bankDetails.bankName || undefined,
                    accountNumber: r.bankDetails.accountNumber || undefined,
                    ifscCode: r.bankDetails.ifscCode || undefined,
                    panNumber: r.bankDetails.panNumber || undefined,
                },
                salary: {
                    basic: r.salary.basic,
                    hra: r.salary.hra,
                    da: 0,
                    specialAllowance: r.salary.otherAllowance,
                    otherAllowances,
                    grossSalary: r.salary.gross,
                },
            };
            await Employee.create(empDoc);
            created++;
            logger.info(`  ✓ ${r.employeeIdProvided} ${r.fullName} (${r.email})`);
        }
        catch (err) {
            failures.push({
                email: r.email,
                reason: err.message,
            });
            logger.error({ err }, `  ✗ Failed: ${r.email}`);
        }
    }
    logger.info('─────────────────────────────────────');
    logger.info(`Created: ${created} | Skipped: ${skipped} | Failed: ${failures.length}`);
    if (failures.length) {
        for (const f of failures) {
            logger.warn(`  ✗ ${f.email}: ${f.reason}`);
        }
    }
    logger.info('─────────────────────────────────────');
    await disconnectDatabase();
}
run().catch((err) => {
    logger.error({ err }, 'seed-employees-csv failed');
    process.exit(1);
});
//# sourceMappingURL=seed-employees-csv.js.map