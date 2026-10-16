import type { Schema, Model, Document, FilterQuery } from 'mongoose';
export declare function schemaVersionPlugin(schema: Schema, options?: {
    version: number;
}): void;
export declare function timestampPlugin(schema: Schema): void;
export declare function softDeletePlugin(schema: Schema): void;
export interface PaginateOptions {
    page?: number;
    limit?: number;
    sort?: string | Record<string, 1 | -1>;
    populate?: any;
    select?: string;
}
export interface PaginateResult<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}
export declare function paginatePlugin(schema: Schema): void;
export interface PaginateModel<T extends Document> extends Model<T> {
    paginate(filter?: FilterQuery<T>, options?: PaginateOptions): Promise<PaginateResult<T>>;
}
//# sourceMappingURL=mongoose-plugins.d.ts.map