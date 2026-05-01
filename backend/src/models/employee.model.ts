import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type Gender = 'male' | 'female' | 'other';
export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed';
export type EmploymentType = 'full-time' | 'part-time' | 'contract' | 'intern';
export type EmployeeStatus =
  | 'active'
  | 'inactive'
  | 'terminated'
  | 'resigned'
  | 'onNotice';

export interface IAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
}

export interface ISalary {
  basic: number;
  hra: number;
  da: number;
  specialAllowance: number;
  otherAllowances: Record<string, number>;
  grossSalary: number;
}

export interface IBankDetails {
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  panNumber?: string;
}

export interface IEmployeeDocument {
  _id?: Types.ObjectId;
  type: string;
  name: string;
  fileUrl: string;
  uploadedAt: Date;
}

export interface IEmergencyContact {
  name?: string;
  relation?: string;
  phone?: string;
}

export interface IEmployee extends Document {
  userId?: Types.ObjectId;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: Date;
  gender?: Gender;
  maritalStatus?: MaritalStatus;
  bloodGroup?: string;
  profileImage?: string;
  address: { current?: IAddress; permanent?: IAddress };
  department?: Types.ObjectId;
  designation?: Types.ObjectId;
  shift?: Types.ObjectId;
  reportingManager?: Types.ObjectId;
  joiningDate: Date;
  confirmationDate?: Date;
  employmentType: EmploymentType;
  workLocation?: string;
  salary: ISalary;
  bankDetails: IBankDetails;
  documents: IEmployeeDocument[];
  emergencyContact: IEmergencyContact;
  status: EmployeeStatus;
  exitDate?: Date;
  exitReason?: string;
  probationEndDate?: Date;
  noticePeriod?: number;
  fullName: string;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<IAddress>(
  {
    line1: String,
    line2: String,
    city: String,
    state: String,
    country: String,
    zip: String,
  },
  { _id: false },
);

const salarySchema = new Schema<ISalary>(
  {
    basic: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    da: { type: Number, default: 0 },
    specialAllowance: { type: Number, default: 0 },
    otherAllowances: { type: Schema.Types.Mixed, default: {} },
    grossSalary: { type: Number, default: 0 },
  },
  { _id: false },
);

/**
 * Bank details — PII + financial. Encrypted at rest with AES-256-GCM.
 *
 * `accountNumber`, `ifscCode`, `panNumber` are stored as ciphertext. Mongoose
 * getters transparently decrypt when reading. Controllers / frontends that
 * consume these fields should NEVER log the cleartext — use `maskKey()`.
 */
import { encryptString, decryptString } from '../lib/crypto.js';

function encField(v?: string): string | undefined {
  if (!v) return v;
  // Already encrypted? Our payloads are base64 with iv+tag+ct (min 40 bytes);
  // unencrypted account numbers are usually numeric strings < 25 chars, so we
  // detect heuristically and skip double-encryption on re-save.
  try {
    decryptString(v);
    return v; // already ciphertext
  } catch {
    return encryptString(v);
  }
}
function decField(v?: string): string | undefined {
  if (!v) return v;
  try {
    return decryptString(v);
  } catch {
    return v; // legacy plaintext row — leave alone so a migration can fix it
  }
}

const bankSchema = new Schema<IBankDetails>(
  {
    bankName: String,
    accountNumber: { type: String, set: encField, get: decField },
    ifscCode: { type: String, set: encField, get: decField },
    panNumber: { type: String, set: encField, get: decField },
  },
  { _id: false, toJSON: { getters: true }, toObject: { getters: true } },
);

const documentSchema = new Schema<IEmployeeDocument>(
  {
    type: { type: String, required: true },
    name: { type: String, required: true },
    fileUrl: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const emergencySchema = new Schema<IEmergencyContact>(
  {
    name: String,
    relation: String,
    phone: String,
  },
  { _id: false },
);

const employeeSchema = new Schema<IEmployee>({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  employeeId: { type: String, trim: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: String,
  dateOfBirth: Date,
  gender: { type: String, enum: ['male', 'female', 'other'] },
  maritalStatus: { type: String, enum: ['single', 'married', 'divorced', 'widowed'] },
  bloodGroup: String,
  profileImage: String,
  address: {
    current: addressSchema,
    permanent: addressSchema,
  },
  department: { type: Schema.Types.ObjectId, ref: 'Department' },
  designation: { type: Schema.Types.ObjectId, ref: 'Designation' },
  shift: { type: Schema.Types.ObjectId, ref: 'Shift' },
  reportingManager: { type: Schema.Types.ObjectId, ref: 'Employee' },
  joiningDate: { type: Date, required: true },
  confirmationDate: Date,
  employmentType: {
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'intern'],
    default: 'full-time',
  },
  workLocation: String,
  salary: { type: salarySchema, default: () => ({}) },
  bankDetails: { type: bankSchema, default: () => ({}) },
  documents: { type: [documentSchema], default: [] },
  emergencyContact: { type: emergencySchema, default: () => ({}) },
  status: {
    type: String,
    enum: ['active', 'inactive', 'terminated', 'resigned', 'onNotice'],
    default: 'active',
  },
  exitDate: Date,
  exitReason: String,
  probationEndDate: Date,
  noticePeriod: Number,
});
employeeSchema.plugin(timestampPlugin);
employeeSchema.plugin(softDeletePlugin);
employeeSchema.plugin(paginatePlugin);

employeeSchema.index({ employeeId: 1 }, { unique: true });
employeeSchema.index({ userId: 1 }, { unique: true, sparse: true });
employeeSchema.index({ department: 1 });
employeeSchema.index({ status: 1 });
employeeSchema.index({ email: 1 });

employeeSchema.virtual('fullName').get(function (this: IEmployee) {
  return `${this.firstName} ${this.lastName}`.trim();
});

employeeSchema.set('toJSON', { virtuals: true });
employeeSchema.set('toObject', { virtuals: true });

// Auto-generate employeeId on first save
employeeSchema.pre('save', async function (next) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = this as any;
  if (doc.employeeId) return next();
  try {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const count = await Employee.countDocuments({});
    const seq = count + 1;
    doc.employeeId = `EMP-${String(seq).padStart(4, '0')}`;
    next();
  } catch (err) {
    next(err as Error);
  }
});

// Auto-compute grossSalary
employeeSchema.pre('save', function (next) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = this as any;
  if (doc.salary && doc.isModified('salary')) {
    const s = doc.salary;
    const others = s.otherAllowances
      ? Object.values(s.otherAllowances as Record<string, number>).reduce(
          (a, b) => a + (Number(b) || 0),
          0,
        )
      : 0;
    s.grossSalary =
      (Number(s.basic) || 0) +
      (Number(s.hra) || 0) +
      (Number(s.da) || 0) +
      (Number(s.specialAllowance) || 0) +
      others;
  }
  next();
});

// Meilisearch index sync — bank + PAN are intentionally OMITTED so the
// search index never holds PII that the schema has encrypted at rest.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { searchIndexer } from '../lib/search-indexer.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
employeeSchema.plugin(searchIndexer as any, {
  entity: 'employees',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project: (doc: any) => ({
    id: String(doc._id),
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email,
    employeeId: doc.employeeId,
    department: doc.department ? String(doc.department) : undefined,
    designation: doc.designation ? String(doc.designation) : undefined,
    status: doc.status,
  }),
});

export const Employee = model<IEmployee, PaginateModel<IEmployee> & Model<IEmployee>>(
  'Employee',
  employeeSchema,
);
