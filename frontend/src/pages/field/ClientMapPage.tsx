import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Map as MapIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { ClientMap } from '@/components/field/ClientMap';

/** Clients on a map, loaded for the area in view. */
export default function ClientMapPage(): ReactElement {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Client Map"
        description="Clients with a saved location — pan and zoom to load an area. Add a location to a client to see it here."
        icon={MapIcon}
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Field Sales', to: '/field' },
          { label: 'Client Map' },
        ]}
        actions={
          <Button variant="outline" asChild>
            <Link to="/field/clients">Client list</Link>
          </Button>
        }
      />
      <ClientMap />
    </div>
  );
}
