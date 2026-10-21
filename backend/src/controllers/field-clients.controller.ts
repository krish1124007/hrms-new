import type { Request, Response } from 'express';
import { z } from 'zod';
import { Client } from '../models/client.model.js';
import { NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';
import { canManageField, requireOwnEmployeeId } from '../lib/field-access.js';
import { escapeRegex, objectIdString, pageParams, setAndUnset, sortParam } from '../lib/field-utils.js';

const addressSchema = z.object({
  line1: z.string().trim().max(300).optional(),
  line2: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  pincode: z.string().trim().max(20).optional(),
});

/** `{ lat, lng }` → GeoJSON; the mobile app's `{ 0, 0 }` "no fix" placeholder → no location. */
const locationSchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  })
  .transform((v) =>
    v.lat === 0 && v.lng === 0
      ? undefined
      : { type: 'Point' as const, coordinates: [v.lng, v.lat] as [number, number] },
  );

const contactSchema = z.object({
  name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
});

const clientFields = {
  name: z.string().trim().min(1).max(200),
  contactPerson: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  company: z.string().trim().max(200).optional(),
  category: z.enum(['A', 'B', 'C']).default('C'),
  tags: z.array(z.string().trim().max(50)).max(50).optional(),
  /** An object, or the mobile app's single address line (with flat city/state/pincode). */
  address: z.union([addressSchema, z.string().trim().max(300)]).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  pincode: z.string().trim().max(20).optional(),
  /** Mobile app: `contacts[0]` fills contactPerson/phone/email when those are absent. */
  contacts: z.array(contactSchema).max(20).optional(),
  location: locationSchema.optional(),
  assignedTo: objectIdString.optional(),
  territory: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  customFields: z.record(z.unknown()).optional(),
};

type ClientInput = Partial<z.infer<z.ZodObject<typeof clientFields>>>;

/** Fold the accepted aliases into the stored shape. Ledger fields are never accepted. */
function normaliseClient(body: ClientInput): Record<string, unknown> {
  const { contacts, city, state, pincode, address, ...rest } = body;
  const out: Record<string, unknown> = { ...rest };
  const first = contacts?.[0];
  if (first) {
    if (out.contactPerson === undefined && first.name) out.contactPerson = first.name;
    if (out.phone === undefined && first.phone) out.phone = first.phone;
    if (out.email === undefined && first.email) out.email = first.email;
  }
  if (address !== undefined || city !== undefined || state !== undefined || pincode !== undefined) {
    const base = typeof address === 'string' ? { line1: address } : (address ?? {});
    out.address = {
      ...base,
      ...(city !== undefined ? { city } : {}),
      ...(state !== undefined ? { state } : {}),
      ...(pincode !== undefined ? { pincode } : {}),
    };
  }
  if ('location' in body && body.location === undefined) delete out.location;
  return out;
}

export const createClientSchema = z.object(clientFields);
/** A partial client; `null` clears an optional field (pin, assigned rep, contact details, territory). */
export const updateClientSchema = z
  .object(clientFields)
  .partial()
  .extend({
    location: locationSchema.nullable().optional(),
    assignedTo: objectIdString.nullable().optional(),
    contactPerson: clientFields.contactPerson.unwrap().nullable().optional(),
    phone: clientFields.phone.unwrap().nullable().optional(),
    email: z.string().trim().email().or(z.literal('')).nullable().optional(),
    company: clientFields.company.unwrap().nullable().optional(),
    territory: clientFields.territory.unwrap().nullable().optional(),
  });

export const listQuerySchema = z.object({
  ...pageParams,
  category: z.enum(['A', 'B', 'C']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  assignedTo: objectIdString.optional(),
  territory: z.string().trim().max(100).optional(),
  search: z.string().trim().max(100).optional(),
  sort: sortParam(['name', 'createdAt', 'outstandingAmount', 'lastVisitDate']).optional(),
});

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().positive().max(100_000).default(5000), // metres
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const addNoteSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export async function listClients(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof listQuerySchema>;
  const filter: Record<string, unknown> = {};
  if (q.category) filter.category = q.category;
  if (q.status) filter.status = q.status;
  if (q.assignedTo) filter.assignedTo = q.assignedTo;
  if (q.territory) filter.territory = q.territory;
  if (q.search) {
    const pattern = { $regex: escapeRegex(q.search), $options: 'i' };
    filter.$or = [{ name: pattern }, { phone: pattern }, { email: pattern }, { company: pattern }];
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
  const q = req.query as unknown as z.infer<typeof nearbyQuerySchema>;
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

/**
 * Field managers add any client; a rep (`field-sales.view`) adds a client
 * found in the field, which is assigned to them.
 */
export async function createClient(req: Request, res: Response): Promise<void> {
  const body = normaliseClient(req.body as ClientInput);
  if (!canManageField(req)) body.assignedTo = await requireOwnEmployeeId(req);
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
  const update = normaliseClient(req.body as ClientInput);
  // Address parts are set one by one, so editing the city keeps the street.
  if (update.address && typeof update.address === 'object') {
    for (const [key, value] of Object.entries(update.address)) update[`address.${key}`] = value;
    delete update.address;
  }
  // `null` clears (e.g. `location: null` removes the pin, `assignedTo: null` unassigns).
  const doc = await Client.findByIdAndUpdate(String(req.params.id), setAndUnset(update), { new: true }).exec();
  if (!doc) throw new NotFoundError('Client not found');
  void audit({ action: 'update', entity: 'Client', entityId: String(doc._id) });
  res.json({ success: true, data: doc });
}

export async function deleteClient(req: Request, res: Response): Promise<void> {
  const doc = await Client.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Client not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (doc as any).softDelete({ by: req.user?._id });
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
  const docs = await Client.insertMany(body.clients.map((c) => normaliseClient(c)));
  res.status(201).json({ success: true, data: { inserted: docs.length } });
}
