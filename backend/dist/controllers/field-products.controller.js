import { z } from 'zod';
import { Product, GST_RATES } from '../models/product.model.js';
import { AppError, NotFoundError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { escapeRegex, pageParams, setAndUnset, sortParam } from '../lib/field-utils.js';
/*
 * The product catalogue. Everyone with `field-sales.view` browses it (the
 * order form); `field-sales.manage` maintains it. A product is soft-deleted;
 * its SKU becomes free for a new product.
 */
const gstRate = z.coerce
    .number()
    .refine((v) => GST_RATES.includes(v), `gstRate must be one of ${GST_RATES.join(', ')}`);
const productFields = {
    name: z.string().trim().min(1).max(200),
    sku: z.string().trim().min(1).max(64),
    category: z.string().trim().min(1).max(100),
    unit: z.string().trim().min(1).max(20).default('pcs'),
    price: z.coerce.number().min(0).max(1e9),
    gstRate: gstRate.optional(),
    /** The mobile app's name for gstRate. */
    taxRate: gstRate.optional(),
    hsnCode: z.string().trim().max(20).optional(),
    description: z.string().trim().max(2000).optional(),
    isActive: z.boolean().default(true),
};
export const createProductSchema = z
    .object(productFields)
    .transform(({ taxRate, gstRate: rate, ...rest }) => ({ ...rest, gstRate: rate ?? taxRate ?? 18 }));
/** A partial product; `null` clears the HSN code or the description (name, SKU, category, price stay required). */
export const updateProductSchema = z
    .object(productFields)
    .partial()
    .extend({
    hsnCode: productFields.hsnCode.unwrap().nullable().optional(),
    description: productFields.description.unwrap().nullable().optional(),
})
    .transform(({ taxRate, gstRate: rate, ...rest }) => {
    const out = { ...rest };
    const resolved = rate ?? taxRate;
    if (resolved !== undefined)
        out.gstRate = resolved;
    return out;
});
export const listQuerySchema = z.object({
    ...pageParams,
    limit: z.coerce.number().int().positive().max(100).default(50),
    search: z.string().trim().max(100).optional(),
    category: z.string().trim().max(100).optional(),
    /** `true` (default) active only, `false` inactive only, `all` both. */
    active: z.enum(['true', 'false', 'all']).default('true'),
    sort: sortParam(['name', 'price', 'createdAt', 'sku']).optional(),
});
const skuTaken = () => new AppError('Another product already uses this SKU', 409, 'SKU_EXISTS');
const isDuplicateKey = (err) => typeof err === 'object' && err !== null && err.code === 11000;
/** 409 when a live product other than `exceptId` already has `sku` (case-insensitive). */
async function assertSkuFree(sku, exceptId) {
    const filter = { sku: sku.trim().toUpperCase() };
    if (exceptId)
        filter._id = { $ne: exceptId };
    if (await Product.exists(filter).exec())
        throw skuTaken();
}
async function loadProduct(id) {
    const doc = await Product.findById(id).exec();
    if (!doc)
        throw new NotFoundError('Product not found');
    return doc;
}
export async function listProducts(req, res) {
    const q = req.query;
    const filter = {};
    if (q.active !== 'all')
        filter.isActive = q.active === 'true';
    if (q.category)
        filter.category = q.category;
    if (q.search) {
        const pattern = { $regex: escapeRegex(q.search), $options: 'i' };
        filter.$or = [{ name: pattern }, { sku: pattern }, { hsnCode: pattern }];
    }
    const result = await Product.paginate(filter, { page: q.page, limit: q.limit, sort: q.sort ?? 'name' });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
/** Distinct categories of active products, sorted. */
export async function listCategories(_req, res) {
    const categories = (await Product.distinct('category', { isActive: true, isDeleted: { $ne: true } }).exec());
    res.json({
        success: true,
        data: categories.filter(Boolean).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
    });
}
export async function getProduct(req, res) {
    res.json({ success: true, data: await loadProduct(String(req.params.id)) });
}
export async function createProduct(req, res) {
    const body = req.body;
    await assertSkuFree(body.sku);
    let doc;
    try {
        doc = await Product.create(body);
    }
    catch (err) {
        if (isDuplicateKey(err))
            throw skuTaken(); // a concurrent create won the SKU
        throw err;
    }
    void audit({ action: 'create', entity: 'Product', entityId: String(doc._id), after: { sku: doc.sku, price: doc.price, gstRate: doc.gstRate } });
    res.status(201).json({ success: true, data: doc });
}
export async function updateProduct(req, res) {
    const body = req.body;
    const before = await loadProduct(String(req.params.id));
    if (typeof body.sku === 'string')
        await assertSkuFree(body.sku, before._id);
    if (typeof body.sku === 'string')
        body.sku = body.sku.toUpperCase();
    let doc;
    try {
        doc = await Product.findByIdAndUpdate(before._id, setAndUnset(body), { new: true, runValidators: true }).exec();
    }
    catch (err) {
        if (isDuplicateKey(err))
            throw skuTaken();
        throw err;
    }
    if (!doc)
        throw new NotFoundError('Product not found');
    void audit({
        action: 'update',
        entity: 'Product',
        entityId: String(doc._id),
        before: { sku: before.sku, price: before.price, gstRate: before.gstRate, isActive: before.isActive },
        after: { sku: doc.sku, price: doc.price, gstRate: doc.gstRate, isActive: doc.isActive },
    });
    res.json({ success: true, data: doc });
}
export async function deleteProduct(req, res) {
    const doc = await loadProduct(String(req.params.id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await doc.softDelete({ by: req.user?._id });
    void audit({ action: 'delete', entity: 'Product', entityId: String(doc._id) });
    res.json({ success: true, message: 'Product deleted' });
}
//# sourceMappingURL=field-products.controller.js.map