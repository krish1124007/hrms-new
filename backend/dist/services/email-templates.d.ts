/**
 * Email templates — renders common transactional emails as inline HTML.
 *
 * No template engine, just tagged templates for simplicity + compile-time
 * safety. For rich HTML campaigns, consider MJML or React Email later.
 */
export declare function sendWelcomeEmail(to: string, firstName: string, tenantSlug: string): Promise<void>;
export declare function sendTrialExpiringEmail(to: string, firstName: string, daysLeft: number): Promise<void>;
export declare function sendPaymentFailedEmail(to: string, firstName: string, amount: number): Promise<void>;
export declare function sendInvoiceEmail(to: string, firstName: string, invoiceNumber: string, pdfUrl: string, amount: number): Promise<void>;
export declare function sendPasswordResetEmail(to: string, resetLink: string): Promise<void>;
export declare function sendTicketUpdateEmail(to: string, ticketNumber: string, subject: string, agentReply: string): Promise<void>;
export declare function sendAnnouncementEmail(to: string, title: string, bodyHtml: string): Promise<void>;
//# sourceMappingURL=email-templates.d.ts.map