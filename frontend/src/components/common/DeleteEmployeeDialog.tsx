import type { ReactElement } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDeleteEmployee } from '@/hooks/use-systemcore';

/** Just enough of an employee to name them in the prompt. */
export interface DeletableEmployee {
  _id: string;
  firstName: string;
  lastName: string;
  employeeId?: string;
}

interface DeleteEmployeeDialogProps {
  /** The employee to delete. `null` keeps the dialog closed. */
  employee: DeletableEmployee | null;
  onClose: () => void;
  /** Runs after a successful delete — e.g. navigate away from a detail page. */
  onDeleted?: () => void;
}

/**
 * Confirmation prompt for deleting an employee.
 *
 * Deleting is not reversible from the UI, so the prompt names the person and
 * spells out what actually happens: the server soft-deletes the record and
 * deactivates the linked login, while attendance/leave/payroll history stays
 * for compliance.
 */
export function DeleteEmployeeDialog({
  employee,
  onClose,
  onDeleted,
}: DeleteEmployeeDialogProps): ReactElement {
  const deleteEmployee = useDeleteEmployee();

  const confirm = (): void => {
    if (!employee) return;
    deleteEmployee.mutate(employee._id, {
      onSuccess: () => {
        onClose();
        onDeleted?.();
      },
    });
  };

  return (
    <Dialog open={!!employee} onClose={onClose} size="sm">
      <DialogHeader>
        <DialogTitle>Delete employee</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <p className="text-sm text-foreground">
          Delete{' '}
          <strong>
            {employee?.firstName} {employee?.lastName}
          </strong>
          {employee?.employeeId ? ` (${employee.employeeId})` : ''}?
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          They will be removed from the employee list and their login will be disabled.
          Attendance, leave and payroll records are kept for compliance.
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={confirm} loading={deleteEmployee.isPending}>
          <Trash2 className="size-4" /> Delete employee
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
