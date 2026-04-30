import { useState, type ReactElement } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useExpenseReports } from '@/hooks/use-expense-claims';

const fmtINR = (n: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];

export default function ExpenseReportPage(): ReactElement {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data } = useExpenseReports(year);
  const r = data?.data;

  const monthData = MONTHS.map((m, i) => ({
    month: m,
    amount: r?.byMonth.find((x) => x.month === i + 1)?.amount ?? 0,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense Reports"
        description="Analytics on expense claims"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Expenses' },
          { label: 'Reports' },
        ]}
      />

      <div className="flex items-center gap-3">
        <Label htmlFor="rep-year">Year</Label>
        <Input
          id="rep-year"
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="w-32"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4 shadow-card">
          <p className="text-sm font-medium text-muted-foreground">Total Approved</p>
          <p className="mt-1 text-2xl font-semibold">{fmtINR(r?.totalApproved ?? 0)}</p>
        </div>
        {(r?.byStatus ?? []).map((s) => (
          <div key={s._id} className="rounded-lg border border-border bg-card p-4 shadow-card">
            <p className="text-sm font-medium capitalize text-muted-foreground">{s._id}</p>
            <p className="mt-1 text-2xl font-semibold">{s.n}</p>
            <p className="text-xs text-muted-foreground">{fmtINR(s.amount)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip formatter={(v: number) => fmtINR(v)} />
                <Bar dataKey="amount" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={r?.byCategory ?? []}
                  dataKey="amount"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {(r?.byCategory ?? []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtINR(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
