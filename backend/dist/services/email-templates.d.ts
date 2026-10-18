export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}
export declare const escapeHtml: (value: string) => string;
/** "Your overtime request was approved" — the title is the subject, `body` the sentence under it. */
export declare function decisionEmail(input: {
    title: string;
    body: string;
    link: string;
}): RenderedEmail;
/** "Your payslip for October 2026 is ready" — `month` is 1-12. */
export declare function payslipReadyEmail(input: {
    month: number;
    year: number;
    link: string;
}): RenderedEmail;
//# sourceMappingURL=email-templates.d.ts.map