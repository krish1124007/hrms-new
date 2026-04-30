import { useEffect, useState, type ReactElement } from 'react';
import { Plus, Trash2, Maximize2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQRCodes, useCreateQRCode, useDeleteQRCode } from '@/hooks/use-attendance';
import { attendanceApi, type QRCodeRecord } from '@/lib/attendance.api';

export default function QRCodesPage(): ReactElement {
  const { data, isLoading } = useQRCodes({ limit: 100 });
  const create = useCreateQRCode();
  const remove = useDeleteQRCode();

  const [fullscreen, setFullscreen] = useState(false);
  const [dynamicCode, setDynamicCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Rotate dynamic QR every 30s when fullscreen is active
  useEffect(() => {
    if (!fullscreen) return;
    let cancelled = false;
    const rotate = async (): Promise<void> => {
      const res = await attendanceApi.rotateDynamicQR();
      if (!cancelled) {
        setDynamicCode({ code: res.data.code, expiresAt: res.data.expiresAt });
        setSecondsLeft(res.data.ttlSeconds);
      }
    };
    void rotate();
    const interval = setInterval(() => void rotate(), 30_000);
    const tick = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(tick);
    };
  }, [fullscreen]);

  const columns: DataTableColumn<QRCodeRecord>[] = [
    { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
    {
      key: 'type',
      header: 'Type',
      cell: (r) => <Badge variant={r.type === 'dynamic' ? 'warning' : 'outline'}>{r.type}</Badge>,
    },
    {
      key: 'expires',
      header: 'Expires',
      cell: (r) => (r.expiresAt ? new Date(r.expiresAt).toLocaleString() : 'Never'),
    },
    {
      key: 'created',
      header: 'Created',
      cell: (r) => new Date(r.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      width: '60px',
      cell: (r) => (
        <button
          onClick={() => remove.mutate(r._id)}
          className="rounded p-1.5 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4" />
        </button>
      ),
    },
  ];

  if (fullscreen && dynamicCode) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background p-8">
        <button
          onClick={() => setFullscreen(false)}
          className="absolute right-6 top-6 rounded-md border border-border px-3 py-1 text-sm"
        >
          Close
        </button>
        <h1 className="mb-4 text-3xl font-bold">Scan to Check In</h1>
        <div className="rounded-2xl border-4 border-primary bg-white p-8">
          <img
            alt="dynamic qr"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(dynamicCode.code)}`}
          />
        </div>
        <p className="mt-6 text-2xl font-mono">Refreshing in {secondsLeft}s</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="QR Codes"
        description="Generate static and dynamic check-in QR codes"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Attendance', to: '/attendance' },
          { label: 'QR Codes' },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setFullscreen(true)}>
              <Maximize2 className="mr-2 size-4" />
              Display Dynamic QR
            </Button>
            <Button onClick={() => create.mutate({ type: 'static' })}>
              <Plus className="mr-2 size-4" />
              New Static QR
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Static QR:</strong> Generate once, print and post at the office
            entrance.
          </p>
          <p>
            <strong className="text-foreground">Dynamic QR:</strong> Display on a screen — code rotates every 45
            seconds for security.
          </p>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No QR codes generated"
        emptyDescription="Create one to allow QR-based check-ins"
      />
    </div>
  );
}
