import { Schema, model, type Document, type Model } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type IDCardOrientation = 'portrait' | 'landscape';

export interface IIDCardField {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style?: Record<string, unknown>;
}

export interface IIDCardLayout {
  background?: string;
  fields: IIDCardField[];
}

export interface IIDCardTemplate extends Document {
  name: string;
  layout: IIDCardLayout;
  orientation: IDCardOrientation;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const idCardFieldSchema = new Schema<IIDCardField>(
  {
    type: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    style: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const idCardLayoutSchema = new Schema<IIDCardLayout>(
  {
    background: { type: String },
    fields: { type: [idCardFieldSchema], default: [] },
  },
  { _id: false },
);

const idCardTemplateSchema = new Schema<IIDCardTemplate>({
  name: { type: String, required: true, trim: true },
  layout: { type: idCardLayoutSchema, default: () => ({}) },
  orientation: {
    type: String,
    enum: ['portrait', 'landscape'],
    default: 'landscape',
  },
  isDefault: { type: Boolean, default: false },
});
idCardTemplateSchema.plugin(timestampPlugin);
idCardTemplateSchema.plugin(softDeletePlugin);
idCardTemplateSchema.plugin(paginatePlugin);

export const IDCardTemplate = model<IIDCardTemplate, PaginateModel<IIDCardTemplate> & Model<IIDCardTemplate>>(
  'IDCardTemplate',
  idCardTemplateSchema,
);
