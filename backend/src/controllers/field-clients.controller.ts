import type { Request, Response } from 'express';
import { z } from 'zod';
import { Client } from '../models/client.model.js';
import { NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';

const addressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
});

const locationSchema = z
  .object({
    lat: z.coerce.number(),
    lng: z.coerce.number(),
  })
  .transform((v) => ({
    type: 'Point' as const,
    coordinates: [v.lng, v.lat] as [number, number],
  }));

export const createClientSchema = z.object({
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  company: z.string().optional(),
  category: z.enum(['A', 'B', 'C']).default('C'),
  tags: z.array(z.string()).optional(),
  address: addressSchema.optional(),
  location: locationSchema.optional(),
  assignedTo: z.string().optional(),
  territory: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  customFields: z.record(z.unknown()).optional(),
});

export const updateClientSchema = createClientSchema.partial();

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
  category: z.enum(['A', 'B', 'C']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  assignedTo: z.string().optional(),
  territory: z.string().optional(),
  search: z.string().optional(),
  sort: z.string().optional(),
});

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  radius: z.coerce.number().positive().default(5000), // meters
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const addNoteSchema = z.object({
  text: z.string().min(1),
});

export async function listClients(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.category) filter.category = q.category;
  if (q.status) filter.status = q.status;
  if (q.assignedTo) filter.assignedTo = q.assignedTo;
  if (q.territory) filter.territory = q.territory;
  if (q.search) {
    filter.$or = [
      { name: { $regex: q.search, $options: 'i' } },
      { phone: { $regex: q.search, $options: 'i' } },
      { email: { $regex: q.search, $options: 'i' } },
      { company: { $regex: q.search, $options: 'i' } },
    ];
  }
  const result = await Client.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: q.sort ?? '-createdAt',
    populate: [{ path: 'assignedTo', select: 'firstName lastName email avatar' }],
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function nearbyClients(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  const docs = await Client.find({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [q.lng, q.lat] },
        $maxDistance: q.radius,
      },
    },
  })
    .limit(q.limit)
    .exec();
  res.json({ success: true, data: docs });
}

export async function clientsMap(_req: Request, res: Response): Promise<void> {
  const docs = await Client.find({ location: { $exists: true, $ne: null } })
    .select('name category status location address assignedTo')
    .populate('assignedTo', 'firstName lastName')
    .exec();
  res.json({ success: true, data: docs });
}

export async function createClient(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createClientSchema>;
  const doc = await Client.create(body);
  void audit({ action: 'create', entity: 'Client', entityId: String(doc._id) });
  res.status(201).json({ success: true, data: doc });
}

export async function getClient(req: Request, res: Response): Promise<void> {
  const doc = await Client.findById(String(req.params.id))
    .populate('assignedTo', 'firstName lastName email avatar')
    .exec();
  if (!doc) throw new NotFoundError('Client not found');
  res.json({ success: true, data: doc });
}

export async function updateClient(req: Request, res: Response): Promise<void> {
  const doc = await Client.findByIdAndUpdate(String(req.params.id), req.body, {
    new: true,
  }).exec();
  if (!doc) throw new NotFoundError('Client not found');
  void audit({ action: 'update', entity: 'Client', entityId: String(doc._id) });
  res.json({ success: true, data: doc });
}

export async function deleteClient(req: Request, res: Response): Promise<void> {
  const doc = await Client.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Client not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (doc as any).softDelete();
  void audit({ action: 'delete', entity: 'Client', entityId: String(doc._id) });
  res.json({ success: true, message: 'Client deleted' });
}

export async function addClientNote(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof addNoteSchema>;
  const doc = await Client.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Client not found');
  const userId = getUserId();
  doc.notes.push({
    text: body.text,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    by: userId as any,
    at: new Date(),
  });
  await doc.save();
  res.json({ success: true, data: doc });
}

export const importSchema = z.object({
  clients: z.array(createClientSchema).min(1).max(1000),
});

export async function importClients(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof importSchema>;
  if (!body.clients?.length) throw new ValidationAppError('No clients to import');
  const docs = await Client.insertMany(body.clients);
  res.status(201).json({ success: true, data: { inserted: docs.length } });
}
