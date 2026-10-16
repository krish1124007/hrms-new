import { type ReactElement } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { BadgeCheck, Building2, ShieldX, User } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';

interface VerifiedEmployee {
  valid: boolean;
  status: 'active' | 'inactive';
  employeeId: string;
  firstName: string;
  lastName: string;
  designation: string | null;
  department: string | null;
  profileImage: string | null;
  joiningDate: string | null;
}

/**
 * Public landing page for an ID-card QR scan.
 *
 * Whoever scans is not logged in, so this uses a bare axios call rather than
 * the authenticated client — no token, no refresh interceptor, no redirect to
 * /login. It shows only what a person checking an ID needs to see.
 */
export default function VerifyIDPage(): ReactElement {
  const { code } = useParams<{ code: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['verify-id', code],
    queryFn: async (): Promise<VerifiedEmployee> => {
      const res = await axios.get<{ success: boolean; data: VerifiedEmployee }>(
        `${API_BASE_URL}/id-cards/verify/${code}`,
      );
      return res.data.data;
    },
    enabled: !!code,
    retry: false,
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Checking card…</div>
        ) : isError || !data ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
              <ShieldX className="size-7 text-destructive" />
            </div>
            <p className="text-lg font-semibold text-foreground">Not a valid ID card</p>
            <p className="text-sm text-muted-foreground">
              This code was not issued by us, or the card no longer exists.
            </p>
          </div>
        ) : (
          <>
            <div
              className={`flex flex-col items-center gap-1 px-6 py-5 text-white ${
                data.valid ? 'bg-emerald-600' : 'bg-amber-600'
              }`}
            >
              {data.valid ? <BadgeCheck className="size-8" /> : <ShieldX className="size-8" />}
              <p className="text-base font-bold">
                {data.valid ? 'Verified employee' : 'No longer employed'}
              </p>
              <p className="text-[11px] uppercase tracking-widest opacity-90">DD HRMS</p>
            </div>

            <div className="flex flex-col items-center px-6 py-6">
              <div className="flex size-24 items-center justify-center overflow-hidden rounded-full bg-muted">
                {data.profileImage ? (
                  <img
                    src={data.profileImage}
                    alt={`${data.firstName} ${data.lastName}`}
                    className="size-full object-cover"
                  />
                ) : (
                  <User className="size-10 text-muted-foreground" />
                )}
              </div>

              <p className="mt-3 text-center text-lg font-bold text-foreground">
                {data.firstName} {data.lastName}
              </p>
              {data.designation && (
                <p className="text-center text-sm text-muted-foreground">{data.designation}</p>
              )}
              {data.department && (
                <p className="flex items-center gap-1 text-center text-xs text-muted-foreground">
                  <Building2 className="size-3" /> {data.department}
                </p>
              )}

              <div className="my-4 h-px w-full bg-border" />

              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Employee ID
              </p>
              <p className="font-mono text-base font-semibold tracking-widest text-foreground">
                {data.employeeId}
              </p>

              {!data.valid && (
                <p className="mt-4 rounded-md bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-700 dark:text-amber-400">
                  This person is not a currently active employee. Do not accept this card as
                  valid identification.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
