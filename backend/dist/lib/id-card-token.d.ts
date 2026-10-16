/** Build the verification code that goes inside an employee's QR. */
export declare function signEmployeeCode(employeeId: string): string;
/** Return the employee id a code vouches for, or null if it is not genuine. */
export declare function verifyEmployeeCode(code: string): string | null;
//# sourceMappingURL=id-card-token.d.ts.map