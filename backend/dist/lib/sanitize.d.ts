/** Strip all HTML — output is plain text only. Use for names, codes, single-line fields. */
export declare function sanitizeStrict(input: string | undefined | null): string;
/** Allow basic inline formatting. Use for short descriptions, one-line messages. */
export declare function sanitizeBasic(input: string | undefined | null): string;
/** Allow full rich-text editor output. Use for notices, announcements, blog posts, notes. */
export declare function sanitizeRich(input: string | undefined | null): string;
/**
 * Remove common NoSQL injection operators from any user-supplied input.
 * Apply to request body before passing to mongo queries — even though Mongoose
 * sanitizes most cases, some $-operators can still leak through object inputs.
 */
export declare function stripMongoOperators(input: any): any;
//# sourceMappingURL=sanitize.d.ts.map