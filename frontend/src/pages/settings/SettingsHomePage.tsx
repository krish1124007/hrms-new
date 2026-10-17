import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Database,
  FileClock,
  ChevronRight,
  ScrollText,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { NAV_ACCESS } from '@/config/navigation';
import { usePermissions } from '@/hooks/use-permissions';

interface SettingGroup {
  title: string;
  description: string;
  items: {
    title: string;
    description: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    /** Same any-of list as the card's route guard; omitted = self-service, shown to all. */
    anyOf?: string[];
  }[];
}

const GROUPS: SettingGroup[] = [
  {
    title: 'Security & Access',
    description: 'Control who can access what in your workspace',
    items: [
      {
        title: 'Roles & Permissions',
        description: 'Define custom roles and assign granular permissions',
        href: '/settings/roles',
        icon: ShieldCheck,
        anyOf: NAV_ACCESS.roles,
      },
      {
        title: 'Audit Logs',
        description: 'Review every change made across the workspace',
        href: '/settings/audit',
        icon: FileClock,
        anyOf: NAV_ACCESS.audit,
      },
      {
        title: 'Privacy & Compliance',
        description: 'Data retention, GDPR/DPDP requests, and consent records',
        href: '/settings/privacy',
        icon: ScrollText,
      },
    ],
  },
  {
    title: 'Data & Infrastructure',
    description: 'Backups and recovery',
    items: [
      {
        title: 'Backups',
        description: 'Download and schedule automated database backups',
        href: '/backups',
        icon: Database,
        anyOf: NAV_ACCESS.backups,
      },
    ],
  },
];

export default function SettingsHomePage(): ReactElement {
  const { hasAny } = usePermissions();
  // Only cards whose page the user can open; drop sections left empty.
  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.anyOf || hasAny(item.anyOf)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Configure security, infrastructure, and workspace preferences"
      />

      <div className="flex flex-col gap-8">
        {groups.map((group) => (
          <section key={group.title} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{group.title}</h2>
              <p className="text-sm text-muted-foreground">{group.description}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <Link key={item.href} to={item.href} className="group block">
                  <Card className="h-full transition-all hover:border-primary/30 hover:shadow-sm">
                    <CardContent className="flex items-start gap-3 p-4">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <item.icon className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="truncate font-medium text-foreground">{item.title}</h3>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
