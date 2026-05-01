import { useState, type ReactElement } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useSalaryComponents,
  useCreateComponent,
  useUpdateComponent,
  useDeleteComponent,
} from '@/hooks/use-payroll';
import type {
  SalaryComponent,
  ComponentType,
  CalculationType,
  StatutoryType,
  SalaryComponentInput,
} from '@/lib/payroll.api';

const TYPE_LABEL: Record<ComponentType, string> = {
  earning: 'Earning',
  deduction: 'Deduction',
  employer_contribution: 'Employer',
};

interface FormState extends SalaryComponentInput {}

const blank: FormState = {
  name: '',
  code: '',
  type: 'earning',
  calculationType: 'fixed',
  defaultValue: 0,
  isTaxable: false,
  isStatutory: false,
  order: 0,
  isActive: true,
};

export default function SalaryComponentsPage(): ReactElement {
  const { data, isLoading } = useSalaryComponents({ limit: 200 });
  const create = useCreateComponent();
  const update = useUpdateComponent();
  const remove = useDeleteComponent();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blank);

  const startCreate = (): void => {
    setEditingId(null);
    setForm(blank);
    setOpen(true);
  };

  const startEdit = (c: SalaryComponent): void => {
    setEditingId(c._id);
    setForm({
      name: c.name,
      code: c.code,
      type: c.type,
      calculationType: c.calculationType,
      defaultValue: c.defaultValue,
      isTaxable: c.isTaxable,
      isStatutory: c.isStatutory,
      statutoryType: c.statutoryType,
      order: c.order,
      isActive: c.isActive,
    });
    setOpen(true);
  };

  const submit = (): void => {
    if (editingId) {
      update.mutate(
        { id: editingId, input: form },
        { onSuccess: () => setOpen(false) },
      );
    } else {
      create.mutate(form, { onSuccess: () => setOpen(false) });
    }
  };

  const columns: DataTableColumn<SalaryComponent>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (r) => (
        <div>
          <div className="font-medium">{r.name}</div>
          <div className="text-xs text-muted-foreground">{r.code}</div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (r) => (
        <Badge
          variant={
            r.type === 'earning'
              ? 'success'
              : r.type === 'deduction'
                ? 'destructive'
                : 'secondary'
          }
        >
          {TYPE_LABEL[r.type]}
        </Badge>
      ),
    },
    {
      key: 'calc',
      header: 'Calculation',
      cell: (r) => <span className="text-xs">{r.calculationType.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'value',
      header: 'Default',
      cell: (r) =>
        r.calculationType === 'fixed' ? `₹${r.defaultValue}` : `${r.defaultValue}%`,
    },
    {
      key: 'flags',
      header: 'Flags',
      cell: (r) => (
        <div className="flex gap-1">
          {r.isTaxable && <Badge variant="outline">Taxable</Badge>}
          {r.isStatutory && <Badge variant="warning">Statutory</Badge>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '110px',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <button onClick={() => startEdit(r)} className="rounded p-1.5 hover:bg-muted">
            <Pencil className="size-4" />
          </button>
          <button
            onClick={() => remove.mutate(r._id)}
            className="rounded p-1.5 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salary Components"
        description="Define earnings, deductions and employer contribution heads"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Payroll', to: '/payroll' },
          { label: 'Components' },
        ]}
        actions={
          <Button onClick={startCreate}>
            <Plus className="mr-2 size-4" />
            New Component
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No salary components"
        emptyDescription="Create one to start building salary structures"
      />

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>{editingId ? 'Edit component' : 'New component'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="code">Code *</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="type">Type</Label>
              <Select
                id="type"
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as ComponentType })
                }
              >
                <option value="earning">Earning</option>
                <option value="deduction">Deduction</option>
                <option value="employer_contribution">Employer Contribution</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="calc">Calculation</Label>
              <Select
                id="calc"
                value={form.calculationType}
                onChange={(e) =>
                  setForm({ ...form, calculationType: e.target.value as CalculationType })
                }
              >
                <option value="fixed">Fixed</option>
                <option value="percentage_of_basic">% of Basic</option>
                <option value="percentage_of_gross">% of Gross</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="value">Default value</Label>
            <Input
              id="value"
              type="number"
              value={form.defaultValue}
              onChange={(e) => setForm({ ...form, defaultValue: Number(e.target.value) })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isTaxable}
              onChange={(e) => setForm({ ...form, isTaxable: e.target.checked })}
            />
            Taxable
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isStatutory}
              onChange={(e) => setForm({ ...form, isStatutory: e.target.checked })}
            />
            Statutory
          </label>
          {form.isStatutory && (
            <div>
              <Label htmlFor="stat">Statutory type</Label>
              <Select
                id="stat"
                value={form.statutoryType ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    statutoryType: (e.target.value || undefined) as StatutoryType | undefined,
                  })
                }
              >
                <option value="">—</option>
                <option value="pf_employee">PF (Employee)</option>
                <option value="pf_employer">PF (Employer)</option>
                <option value="esic_employee">ESIC (Employee)</option>
                <option value="esic_employer">ESIC (Employer)</option>
                <option value="professional_tax">Professional Tax</option>
                <option value="tds">TDS</option>
              </Select>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending || update.isPending}
            disabled={!form.name || !form.code}
          >
            {editingId ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
