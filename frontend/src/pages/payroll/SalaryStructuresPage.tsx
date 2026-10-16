import { useState, type ReactElement } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useSalaryComponents,
  useSalaryStructures,
  useCreateStructure,
  useUpdateStructure,
  useDeleteStructure,
} from '@/hooks/use-payroll';
import type {
  CalculationType,
  SalaryStructure,
  SalaryStructureInput,
} from '@/lib/payroll.api';

interface FormLine {
  componentId: string;
  calculationType: CalculationType;
  value: number;
}

const blank: SalaryStructureInput = {
  name: '',
  components: [],
  isDefault: false,
  isActive: true,
};

export default function SalaryStructuresPage(): ReactElement {
  const { data: structuresData, isLoading } = useSalaryStructures();
  const { data: componentsData } = useSalaryComponents({ limit: 200 });
  const create = useCreateStructure();
  const update = useUpdateStructure();
  const remove = useDeleteStructure();

  const components = componentsData?.data ?? [];
  const structures = structuresData?.data ?? [];

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SalaryStructureInput>(blank);

  const startCreate = (): void => {
    setEditingId(null);
    setForm(blank);
    setOpen(true);
  };

  const startEdit = (s: SalaryStructure): void => {
    setEditingId(s._id);
    setForm({
      name: s.name,
      isDefault: s.isDefault,
      isActive: s.isActive,
      components: s.components.map((c) => ({
        componentId: typeof c.componentId === 'object' ? c.componentId._id : c.componentId,
        calculationType: c.calculationType,
        value: c.value,
      })),
    });
    setOpen(true);
  };

  const addLine = (): void => {
    if (components.length === 0) return;
    setForm((f) => ({
      ...f,
      components: [
        ...f.components,
        {
          componentId: components[0]._id,
          calculationType: 'fixed',
          value: 0,
        },
      ],
    }));
  };

  const updateLine = (idx: number, patch: Partial<FormLine>): void => {
    setForm((f) => ({
      ...f,
      components: f.components.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  };

  const removeLine = (idx: number): void => {
    setForm((f) => ({
      ...f,
      components: f.components.filter((_, i) => i !== idx),
    }));
  };

  const submit = (): void => {
    if (editingId) {
      update.mutate({ id: editingId, input: form }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(form, { onSuccess: () => setOpen(false) });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salary Structures"
        description="Group components into reusable salary structures"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Payroll', to: '/payroll' },
          { label: 'Structures' },
        ]}
        actions={
          <Button onClick={startCreate}>
            <Plus className="mr-2 size-4" />
            New Structure
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : structures.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No salary structures yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {structures.map((s) => (
            <Card key={s._id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{s.name}</CardTitle>
                    {s.isDefault && (
                      <Badge variant="success" className="mt-1">
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(s)}
                      className="rounded p-1.5 hover:bg-muted"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => remove.mutate(s._id)}
                      className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {s.components.map((c, i) => {
                    const comp =
                      typeof c.componentId === 'object' ? c.componentId : undefined;
                    return (
                      <li key={i} className="flex justify-between">
                        <span>{comp?.name ?? '—'}</span>
                        <span className="text-muted-foreground">
                          {c.calculationType === 'fixed' ? `₹${c.value}` : `${c.value}%`}
                        </span>
                      </li>
                    );
                  })}
                  {s.components.length === 0 && (
                    <li className="text-muted-foreground">No components</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} size="lg">
        <DialogHeader>
          <DialogTitle>{editingId ? 'Edit structure' : 'New structure'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="sname">Name *</Label>
            <Input
              id="sname"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            Set as default
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-medium">Components</h4>
              <Button size="sm" variant="outline" onClick={addLine}>
                <Plus className="mr-1 size-3" />
                Add line
              </Button>
            </div>
            {form.components.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Add at least one component to this structure.
              </p>
            )}
            <div className="space-y-2">
              {form.components.map((line, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 items-center gap-2 rounded-md border border-border p-2"
                >
                  <Select
                    className="col-span-5"
                    value={line.componentId}
                    onChange={(e) => updateLine(idx, { componentId: e.target.value })}
                  >
                    {components.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </Select>
                  <Select
                    className="col-span-4"
                    value={line.calculationType}
                    onChange={(e) =>
                      updateLine(idx, {
                        calculationType: e.target.value as CalculationType,
                      })
                    }
                  >
                    <option value="fixed">Fixed</option>
                    <option value="percentage_of_basic">% of Basic</option>
                    <option value="percentage_of_gross">% of Gross</option>
                  </Select>
                  <Input
                    className="col-span-2"
                    type="number"
                    value={line.value}
                    onChange={(e) => updateLine(idx, { value: Number(e.target.value) })}
                  />
                  <button
                    onClick={() => removeLine(idx)}
                    className="col-span-1 rounded p-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending || update.isPending}
            disabled={!form.name}
          >
            {editingId ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
