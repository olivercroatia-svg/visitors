import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Notification {
  id: number;
  severity: 'info' | 'warning' | 'danger';
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: number;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data } = useQuery<{ unread: number; items: Notification[] }>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications'),
    refetchInterval: 5 * 60_000,
  });
  const unread = data?.unread ?? 0;

  const markRead = useMutation({
    mutationFn: (id?: number) => api.post('/notifications/read', id ? { id } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  async function openPanel() {
    setOpen(true);
    // Refresh reminders on demand (scheduler also runs them daily).
    try {
      await api.post('/notifications/generate');
      qc.invalidateQueries({ queryKey: ['notifications'] });
    } catch {
      /* non-blocking */
    }
  }

  function onItem(n: Notification) {
    markRead.mutate(n.id);
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  }

  return (
    <>
      <button
        onClick={openPanel}
        aria-label="Obavijesti"
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Obavijesti"
        footer={
          <button
            onClick={() => markRead.mutate(undefined)}
            disabled={unread === 0}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary disabled:opacity-40"
          >
            <CheckCheck className="h-4 w-4" /> Označi sve pročitano
          </button>
        }
      >
        {!data?.items.length ? (
          <p className="py-8 text-center text-sm text-muted">Nema obavijesti.</p>
        ) : (
          <div className="space-y-2">
            {data.items.map((n) => (
              <button
                key={n.id}
                onClick={() => onItem(n)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-surface-2',
                  n.is_read ? 'border-border opacity-60' : 'border-border',
                )}
              >
                <SeverityIcon severity={n.severity} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  {n.body && <p className="text-xs text-muted">{n.body}</p>}
                </div>
                {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

function SeverityIcon({ severity }: { severity: Notification['severity'] }) {
  if (severity === 'danger') return <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />;
  if (severity === 'warning') return <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />;
  return <Info className="mt-0.5 h-5 w-5 shrink-0 text-info" />;
}
