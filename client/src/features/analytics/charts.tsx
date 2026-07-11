import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useTheme } from '@/theme/ThemeProvider';
import { formatEur, cn } from '@/lib/utils';

// Categorical palette — validated with the dataviz script for CVD + contrast in
// both modes (see palette validation in the build log). Fixed order: color
// follows the entity, never its rank.
const PALETTE_LIGHT = ['#009e73', '#0072b2', '#d55e00', '#cc79a7', '#5a3fbf', '#b8860b'];
const PALETTE_DARK = ['#1f9d84', '#3d8fd0', '#e06a2a', '#c96aa2', '#8f74e0', '#b8891f'];

const TOKENS = {
  light: { muted: '#5c6b67', border: '#e0e6e3', surface: '#ffffff', fg: '#12201d', primary: '#0e7c6b' },
  dark: { muted: '#98a5a0', border: '#24312d', surface: '#121b19', fg: '#e8eeeb', primary: '#2fb39b' },
};

function usePalette() {
  const { theme } = useTheme();
  return { series: theme === 'dark' ? PALETTE_DARK : PALETTE_LIGHT, tk: TOKENS[theme] };
}

function ChartTooltip({ active, payload, label, tk }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{ background: tk.surface, borderColor: tk.border, color: tk.fg }}
    >
      {label && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="tabular-nums">
          {formatEur(p.value)}
        </p>
      ))}
    </div>
  );
}

// Single-measure over time -> one hue (magnitude, not identity).
export function MonthlyRevenueChart({ data }: { data: { month: string; revenue: number }[] }) {
  const { tk } = usePalette();
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={tk.border} vertical={false} />
          <XAxis dataKey="month" tick={{ fill: tk.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: tk.border }} />
          <YAxis
            tick={{ fill: tk.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(v) => new Intl.NumberFormat('hr-HR', { notation: 'compact' }).format(v)}
          />
          <Tooltip cursor={{ fill: tk.border, opacity: 0.3 }} content={<ChartTooltip tk={tk} />} />
          <Bar dataKey="revenue" fill={tk.primary} radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Payment method -> categorical identity. Donut + legend + direct % + a table
// (secondary encoding required because a CVD pair sits in the floor band).
export function PaymentDonut({ data }: { data: { method: string; revenue: number; label: string }[] }) {
  const { series, tk } = usePalette();
  const total = data.reduce((s, d) => s + d.revenue, 0) || 1;
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative h-44 w-44 shrink-0 self-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="revenue" innerRadius={52} outerRadius={80} paddingAngle={2} stroke={tk.surface} strokeWidth={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={series[i % series.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip tk={tk} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] text-muted">Ukupno</span>
          <span className="text-sm font-semibold text-foreground tnum">{formatEur(total)}</span>
        </div>
      </div>
      <div className="flex-1 space-y-1.5">
        {data.map((d, i) => (
          <div key={d.method} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: series[i % series.length] }} />
            <span className="flex-1 text-foreground">{d.label}</span>
            <span className="tnum text-muted">{Math.round((d.revenue / total) * 100)}%</span>
            <span className="w-20 text-right tnum font-medium text-foreground">{formatEur(d.revenue)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Magnitude ranking -> single hue horizontal bars with direct value labels.
export function HBarList({
  data,
  emptyLabel = 'Nema podataka',
}: {
  data: { label: string; value: number; sub?: string }[];
  emptyLabel?: string;
}) {
  const { tk } = usePalette();
  const max = Math.max(...data.map((d) => d.value), 1);
  if (data.length === 0) return <p className="py-4 text-center text-sm text-muted">{emptyLabel}</p>;
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-foreground">
              {d.label}
              {d.sub && <span className="ml-1 text-xs text-muted">{d.sub}</span>}
            </span>
            <span className="tnum shrink-0 font-medium text-foreground">{formatEur(d.value)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: tk.border }}>
            <div
              className={cn('h-full rounded-full')}
              style={{ width: `${Math.max(3, (d.value / max) * 100)}%`, background: tk.primary }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
