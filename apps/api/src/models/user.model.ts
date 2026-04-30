import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';
import { env } from '../config/env.js';

export type UserStatus = 'active' | 'inactive' | 'invited';
export type LoginMethod = 'email' | 'uid' | 'sso';

export interface IRefreshToken {
  token: string;
  device?: string;
  ip?: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface IUser extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  role: Types.ObjectId;
  customPermissions: string[];
  status: UserStatus;
  lastLogin?: Date;
  emailVerified: boolean;
  emailVerificationToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  loginMethod: LoginMethod;
  uid?: string;
  refreshTokens: IRefreshToken[];
  passwordHistory: string[];
  passwordChangedAt?: Date;
  sessionVersion: number;
  consents?: {
    termsOfService: boolean;
    privacyPolicy: boolean;
    marketing?: boolean;
    analytics?: boolean;
    recordedAt: Date;
    ip?: string;
    userAgent?: string;
    documentVersions?: Record<string, string>;
  };
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  comparePassword(candidate: string): Promise<boolean>;
  generateAccessToken(): string;
  generateRefreshToken(): string;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    token: { type: String, required: true },
    device: String,
    ip: String,
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>({
  email: { type: String, required: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  avatar: { type: String },
  role: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
  customPermissions: { type: [String], default: [] },
  status: { type: String, enum: ['active', 'inactive', 'invited'], default: 'active' },
  lastLogin: Date,
  emailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  loginMethod: { type: String, enum: ['email', 'uid', 'sso'], default: 'email' },
  uid: { type: String },
  refreshTokens: { type: [refreshTokenSchema], default: [], select: false },
  passwordHistory: { type: [String], default: [], select: false },
  passwordChangedAt: { type: Date },
  // Incremented on logout-all / password-change / revoke-all-sessions.
  // JWTs carry `sv` in payload; auth middleware rejects tokens with stale sv.
  sessionVersion: { type: Number, default: 0 },
  // Consent snapshot from signup / consent-update flow. Stored on the user
  // doc so an auditor / legal review can see what the user agreed to, when,
  // from which IP/UA, and which document versions they accepted.
  consents: {
    termsOfService: { type: Boolean },
    privacyPolicy: { type: Boolean },
    marketing: { type: Boolean, default: false },
    analytics: { type: Boolean, default: false },
    recordedAt: Date,
    ip: String,
    userAgent: String,
    documentVersions: { type: Schema.Types.Mixed, default: {} },
  },
});
userSchema.plugin(timestampPlugin);
userSchema.plugin(softDeletePlugin);
userSchema.plugin(paginatePlugin);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ uid: 1 }, { unique: true, sparse: true });
userSchema.index({ status: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.generateAccessToken = function (): string {
  return jwt.sign(
    {
      sub: String(this._id),
      role: String(this.role),
      sv: this.sessionVersion ?? 0,
      jti: randomUUID(),
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL } as jwt.SignOptions,
  );
};

userSchema.methods.generateRefreshToken = function (): string {
  return jwt.sign(
    {
      sub: String(this._id),
      type: 'refresh',
      sv: this.sessionVersion ?? 0,
      jti: randomUUID(),
    },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_TTL } as jwt.SignOptions,
  );
};

export const User = model<IUser, PaginateModel<IUser> & Model<IUser>>('User', userSchema);
