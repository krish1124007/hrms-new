import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toPng, toJpeg } from 'html-to-image';
import { toast } from 'sonner';
import { CreditCard, Download, Image as ImageIcon, Printer, Search, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { IdCardView } from '@/components/employees/IdCardView';
import { cn } from '@/lib/utils';
import { idCardsApi } from '@/lib/id-cards.api';
import { employeesApi, type Employee } from '@/lib/systemcore.api';

/** A CR80 card is 53.98 mm wide; the printed image is scaled to that. */
const PRINT_WIDTH = '53.98mm';

function triggerDownload(dataUrl: string, name: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * HR's ID card generator. The card itself comes from the server
 * (`GET /id-cards/generate/:employeeId`) — the same payload and design as the
 * employee's own "My ID card" — so its QR is the signed one that verifies at
 * `/verify/:code`. This page only picks the employee and exports the card.
 */
export default function IDCardPage(): ReactElement {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: empResp, isLoading } = useQuery({
    queryKey: ['employees-id-card', debouncedSearch],
    queryFn: () =>
      employeesApi.list({
        page: 1,
        limit: 20,
        // Cards are for current staff only.
        status: 'active',
        search: debouncedSearch || undefined,
      }),
  });
  const employees: Employee[] = empResp?.data ?? [];
  const employee = employees.find((e) => e._id === selectedEmployeeId);

  const cardQ = useQuery({
    queryKey: ['id-card', 'generate', selectedEmployeeId],
    queryFn: () => idCardsApi.generate(selectedEmployeeId),
    enabled: !!selectedEmployeeId,
  });
  const card = cardQ.data?.data.employee;

  const cardRef = useRef<HTMLDivElement | null>(null);
  const [isExporting, setIsExporting] = useState<null | 'png' | 'jpg' | 'print'>(null);

  // `id-card-ada-lovelace-EMP001.png` rather than something with spaces.
  const filename = (ext: string): string => {
    if (!card) return `id-card.${ext}`;
    const slug = `${card.firstName}-${card.lastName}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `id-card-${slug}-${card.employeeId}.${ext}`;
  };

  // pixelRatio 3 ≈ 600 DPI for a card-sized element — sharp when printed.
  const captureOptions = { pixelRatio: 3, cacheBust: true };

  const exportImage = async (kind: 'png' | 'jpg'): Promise<void> => {
    if (!card || !cardRef.current) return;
    try {
      setIsExporting(kind);
      const dataUrl =
        kind === 'png'
          ? await toPng(cardRef.current, captureOptions)
          : await toJpeg(cardRef.current, { ...captureOptions, quality: 0.95, backgroundColor: '#ffffff' });
      triggerDownload(dataUrl, filename(kind));
      toast.success('ID card downloaded');
    } catch {
      toast.error('Failed to generate ID card image');
    } finally {
      setIsExporting(null);
    }
  };

  const handlePrint = async (): Promise<void> => {
    // Snapshot the rendered card and print that image — the popup has none of
    // the app's CSS, so printing the HTML would come out unstyled.
    if (!card || !cardRef.current) return;
    try {
      setIsExporting('print');
      const dataUrl = await toPng(cardRef.current, captureOptions);
      const win = window.open('', '_blank', 'width=480,height=720');
      if (!win) {
        toast.error('Pop-up blocked — allow pop-ups for this site');
        return;
      }
      const doc = win.document;
      doc.title = `ID card — ${card.firstName} ${card.lastName}`;
      const style = doc.createElement('style');
      style.textContent = `
        @page { margin: 8mm; }
        html, body { margin: 0; padding: 0; background: #fff; }
        body { display: flex; align-items: flex-start; justify-content: center; }
        img { width: ${PRINT_WIDTH}; height: auto; display: block; }`;
      doc.head.appendChild(style);
      const img = doc.createElement('img');
      img.alt = 'ID card';
      img.addEventListener('load', () => {
        win.focus();
        win.print();
      });
      win.addEventListener('afterprint', () => win.close());
      img.src = dataUrl;
      doc.body.appendChild(img);
    } catch {
      toast.error('Failed to prepare ID card for printing');
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="ID Cards"
        description="Print or download an employee's official ID card"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'ID Cards' }]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Employee selection */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Select employee</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, employee ID, or email"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : employees.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No active employees found{debouncedSearch ? ` for "${debouncedSearch}"` : ''}
            </p>
          ) : (
            <div className="max-h-[28rem] space-y-2 overflow-y-auto">
              {employees.map((emp) => (
                <button
                  key={emp._id}
                  type="button"
                  onClick={() => setSelectedEmployeeId(emp._id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                    selectedEmployeeId === emp._id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                  )}
                >
                  <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                    <User className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {emp.firstName} {emp.lastName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {emp.employeeId} · {emp.designation?.name ?? '—'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Card preview */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Card preview</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={!card || isExporting !== null}
                loading={isExporting === 'png'}
                onClick={() => void exportImage('png')}
              >
                <Download className="size-4" /> PNG
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!card || isExporting !== null}
                loading={isExporting === 'jpg'}
                onClick={() => void exportImage('jpg')}
              >
                <ImageIcon className="size-4" /> JPG
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!card || isExporting !== null}
                loading={isExporting === 'print'}
                onClick={() => void handlePrint()}
              >
                <Printer className="size-4" /> Print
              </Button>
            </div>
          </div>

          <div className="flex justify-center">
            {!selectedEmployeeId ? (
              <EmptyState
                icon={CreditCard}
                title="No employee selected"
                description="Pick an employee on the left to load their card."
              />
            ) : cardQ.isLoading ? (
              <Skeleton className="h-[480px] w-72 rounded-2xl" />
            ) : cardQ.isError || !card ? (
              <EmptyState
                icon={CreditCard}
                title="Card unavailable"
                description={`Could not load the card for ${employee ? `${employee.firstName} ${employee.lastName}` : 'this employee'}.`}
              />
            ) : (
              <IdCardView ref={cardRef} card={card} />
            )}
          </div>

          {card && (
            <p className="text-center text-xs text-muted-foreground">
              The QR code opens the public verification page, which confirms the holder is a current employee.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
