import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableColumn } from './data-table';

interface Row {
  id: string;
  name: string;
}

const columns: DataTableColumn<Row>[] = [{ key: 'name', header: 'Name', cell: (r) => r.name }];

function httpError(status: number, message: string): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, null, {
    status,
    statusText: '',
    headers: {},
    config,
    data: { success: false, error: { code: 'FORBIDDEN', message } },
  });
}

describe('DataTable', () => {
  it('renders the error message, not the empty state, when the load failed', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        error={httpError(403, 'You do not have permission to view employees')}
        emptyTitle="No employees found"
      />,
    );

    expect(screen.getByText('You do not have permission to view employees')).toBeInTheDocument();
    expect(screen.queryByText('No employees found')).not.toBeInTheDocument();
  });

  it('offers a retry that calls onRetry', async () => {
    const onRetry = vi.fn();
    render(<DataTable columns={columns} data={[]} error={new Error('Network down')} onRetry={onRetry} />);

    expect(screen.getByText('Network down')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when the load succeeded with no rows', () => {
    render(<DataTable columns={columns} data={[]} emptyTitle="No employees found" />);
    expect(screen.getByText('No employees found')).toBeInTheDocument();
  });
});
