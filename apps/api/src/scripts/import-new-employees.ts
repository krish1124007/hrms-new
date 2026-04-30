/**
 * One-shot importer for the requested 4 employees.
 * 
 * Run with:
 * npx tsx apps/api/src/scripts/import-new-employees.ts
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { Department } from '../models/department.model.js';
import { Designation } from '../models/designation.model.js';
import { Employee } from '../models/employee.model.js';
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js';

async function ensureDepartment(name: string, code: string): Promise<string> {
  const existing = await Department.findOne({ name }).exec();
  if (existing) return String(existing._id);
  const created = await Department.create({ name, code, status: 'active' });
  logger.info(`  + Created department: ${name} (${code})`);
  return String(created._id);
}

async function ensureDesignation(name: string, departmentId: string): Promise<string> {
  const existing = await Designation.findOne({ name, department: departmentId }).exec();
  if (existing) return String(existing._id);
  const created = await Designation.create({ name, department: departmentId, level: 1 });
  logger.info(`  + Created designation: ${name}`);
  return String(created._id);
}

const EMPLOYEES = [
  {
    fullName: 'Himali Parekh',
    firstName: 'Himali',
    lastName: 'Parekh',
    employeeId: 'EMP000027',
    email: 'hemaliparekh1997@gmail.com',
    password: 'Himali@ddopc',
    phone: '9925615998',
    dob: '1998-09-15',
    gender: 'female',
    dept: 'Planning',
    desig: 'Senior Urban Planner',
    doj: '2026-04-01',
    salary: { gross: 58333, basic: 29167, hra: 17500, other: 11666, pt: 200, net: 58133 },
    bank: { name: 'Kotak', account: '4245692501', ifsc: 'KKBK0002750', branch: 'Vadodara' }
  },
  {
    fullName: 'Ankul ramanju',
    firstName: 'Ankul',
    lastName: 'ramanju',
    employeeId: 'EMP000028',
    email: 'ankulramanuj@gmail.com',
    password: 'Ankul@ddopc',
    phone: '8128232229',
    dob: null,
    gender: 'male',
    dept: 'Engineering',
    desig: 'Project Manager',
    doj: '2026-04-01',
    salary: { gross: 65000, basic: 32500, hra: 19500, other: 13000, pt: 200, net: 64800 },
    bank: { name: 'IDBI', account: '1643104000020332', ifsc: '', branch: 'Ahmedabad' }
  },
  {
    fullName: 'Jitendra Chadwa',
    firstName: 'Jitendra',
    lastName: 'Chadwa',
    employeeId: 'EMP000029',
    email: 'jitendra.chadwa@ddopc.com',
    password: 'Jitendra@ddopc',
    phone: '8306496278',
    dob: '1997-01-09',
    gender: 'male',
    dept: 'Operations',
    desig: 'Office Boy',
    doj: '2026-04-01',
    salary: { gross: 16000, basic: 8000, hra: 4800, other: 3200, pt: 200, net: 15800 },
    bank: { name: 'Axis Bank', account: '92201003355171', ifsc: 'UTIB0000032', branch: 'Ahmedabad' }
  },
  {
    fullName: 'Zubin Kadri',
    firstName: 'Zubin',
    lastName: 'Kadri',
    employeeId: 'EMP000030',
    email: 'Zubindd10@gmail.com',
    password: 'Zubin@ddopc',
    phone: '9904092811',
    dob: '2003-11-28',
    gender: 'female',
    dept: 'Operations',
    desig: 'Associate',
    doj: '2026-04-09',
    salary: { gross: 15000, basic: 7500, hra: 4500, other: 3000, pt: 200, net: 14800 },
    bank: { name: 'SBI', account: '44968741395', ifsc: 'SBIN0004320', branch: 'Ahmedabad' }
  }
];

async function run() {
  await connectDatabase();
  const role = await Role.findOne({ slug: 'employee' });
  if (!role) throw new Error('Employee role not found');

  for (const r of EMPLOYEES) {
    try {
      const existing = await User.findOne({ email: r.email.toLowerCase() });
      if (existing) {
        logger.warn(`Skipping ${r.fullName} - email already exists`);
        continue;
      }

      const user = await User.create({
        email: r.email,
        password: r.password,
        firstName: r.firstName,
        lastName: r.lastName,
        role: role._id,
        status: 'active',
        emailVerified: true
      });

      const deptId = await ensureDepartment(r.dept, r.dept.slice(0, 3).toUpperCase());
      const desigId = await ensureDesignation(r.desig, deptId);

      await Employee.create({
        userId: user._id,
        employeeId: r.employeeId,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        dateOfBirth: r.dob ? new Date(r.dob) : undefined,
        gender: r.gender,
        department: deptId,
        designation: desigId,
        joiningDate: new Date(r.doj),
        employmentType: 'full-time',
        status: 'active',
        bankDetails: {
          bankName: r.bank.name,
          accountNumber: r.bank.account,
          ifscCode: r.bank.ifsc,
          bankBranch: r.bank.branch
        },
        salary: {
          basic: r.salary.basic,
          hra: r.salary.hra,
          specialAllowance: r.salary.other,
          otherAllowances: { pt: r.salary.pt, net: r.salary.net },
          grossSalary: r.salary.gross
        }
      });

      logger.info(`Successfully created employee: ${r.fullName}`);
    } catch (err) {
      logger.error(`Failed to create ${r.fullName}: ${(err as Error).message}`);
    }
  }

  await disconnectDatabase();
}

run();
