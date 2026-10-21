export interface ReceiptInput {
    receiptNumber: string;
    amount: number;
    method: string;
    reference?: string;
    status: string;
    collectedAt: Date;
    notes?: string;
    client: {
        name: string;
        company?: string;
        phone?: string;
        address?: {
            line1?: string;
            line2?: string;
            city?: string;
            state?: string;
            pincode?: string;
        };
    };
    collectedBy: {
        name: string;
        code?: string;
    };
    orderNumber?: string;
}
/** "Rupees One Thousand Two Hundred Fifty and Fifty Paise Only". */
export declare function amountInWords(amount: number): string;
/** "21 Oct 2026, 10:42 am" in the business timezone. */
export declare function formatReceiptDate(d: Date): string;
export declare function renderPaymentReceipt(input: ReceiptInput): Promise<Buffer>;
//# sourceMappingURL=field-receipt-pdf.service.d.ts.map