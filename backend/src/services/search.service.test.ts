/**
 * Search must never slow a write down: indexing is fire-and-forget, every
 * Meilisearch call has a short timeout, and a breaker stops calling an index
 * that keeps failing. Meilisearch is mocked — no network.
 */
import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const meili = vi.hoisted(() => ({
  createIndex: vi.fn(),
  addDocuments: vi.fn(),
  deleteDocument: vi.fn(),
  search: vi.fn(),
}));

vi.mock('meilisearch', () => ({
  MeiliSearch: class {
    createIndex = meili.createIndex;
    index() {
      return { addDocuments: meili.addDocuments, deleteDocument: meili.deleteDocument, search: meili.search };
    }
  },
}));

import { createApp } from '../app.js';
import { createUser } from '../test/factories.js';
import { Employee } from '../models/employee.model.js';
import { _resetAllBreakers } from '../lib/circuit-breaker.js';
import {
  SEARCH_BREAKER_THRESHOLD,
  SEARCH_TIMEOUT_MS,
  indexDocuments,
  search,
} from './search.service.js';

const hang = () => new Promise<never>(() => undefined);
let seq = 0;
const employeeFields = () => {
  seq += 1;
  return { firstName: 'Fast', lastName: `Write${seq}`, email: `fast.write.${seq}.${Date.now()}@test.local`, joiningDate: new Date('2024-01-15') };
};

beforeEach(() => {
  _resetAllBreakers();
  meili.createIndex.mockReset();
  meili.addDocuments.mockReset();
  meili.deleteDocument.mockReset();
  meili.search.mockReset();
});

describe('search indexing never blocks a write', () => {
  it('a create returns while Meilisearch hangs', async () => {
    meili.createIndex.mockImplementation(hang);
    meili.addDocuments.mockImplementation(hang);

    const started = Date.now();
    const emp = await Employee.create(employeeFields());
    expect(Date.now() - started).toBeLessThan(SEARCH_TIMEOUT_MS);
    expect(emp._id).toBeDefined();
  });

  it('a create over the API succeeds quickly while Meilisearch rejects', async () => {
    meili.createIndex.mockRejectedValue(new Error('connect ECONNREFUSED'));
    meili.addDocuments.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const { token } = await createUser({ roleSlug: 'admin' });

    const started = Date.now();
    const res = await request(createApp())
      .post('/api/v1/employees')
      .set({ Authorization: `Bearer ${token}` })
      .send({ ...employeeFields(), createUserAccount: false });
    expect(res.status).toBeLessThan(300);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('search client', () => {
  it('times out a hanging call, then stops calling once the breaker opens', async () => {
    meili.createIndex.mockImplementation(hang);

    for (let i = 0; i < SEARCH_BREAKER_THRESHOLD; i += 1) {
      const started = Date.now();
      // eslint-disable-next-line no-await-in-loop
      await indexDocuments('employees', [{ id: `e${i}` }]);
      expect(Date.now() - started).toBeLessThan(SEARCH_TIMEOUT_MS + 400);
    }
    expect(meili.createIndex).toHaveBeenCalledTimes(SEARCH_BREAKER_THRESHOLD);

    // Open: no call reaches Meilisearch, and nothing waits.
    const started = Date.now();
    await indexDocuments('employees', [{ id: 'later' }]);
    const result = await search('employees', 'anyone');
    expect(Date.now() - started).toBeLessThan(100);
    expect(meili.createIndex).toHaveBeenCalledTimes(SEARCH_BREAKER_THRESHOLD);
    expect(result).toEqual({ hits: [], total: 0 });
  });

  it('search answers an empty result when the index is down, and the hits when it is up', async () => {
    meili.createIndex.mockRejectedValue(new Error('down'));
    expect(await search('employees', 'asha')).toEqual({ hits: [], total: 0 });

    _resetAllBreakers();
    meili.createIndex.mockResolvedValue({ taskUid: 1 });
    meili.search.mockResolvedValue({ hits: [{ id: '1', firstName: 'Asha' }], estimatedTotalHits: 1 });
    expect(await search('employees', 'asha')).toEqual({ hits: [{ id: '1', firstName: 'Asha' }], total: 1 });
  });
});
