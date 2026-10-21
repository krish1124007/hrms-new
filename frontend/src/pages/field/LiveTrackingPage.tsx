import type { ReactElement } from 'react';
import { Radar } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { LiveMap } from '@/components/field/LiveMap';

/** The team map: every visible rep's latest position, live over the socket. */
export default function LiveTrackingPage(): ReactElement {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Map"
        description="Field reps' latest positions — updates arrive live, or every 30 s when the live connection is unavailable"
        icon={Radar}
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Field Sales', to: '/field' },
          { label: 'Live Map' },
        ]}
      />
      <LiveMap />
    </div>
  );
}
