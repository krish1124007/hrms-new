import { type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { User } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { IdCardView } from '@/components/employees/IdCardView';
import { idCardsApi } from '@/lib/id-cards.api';

/**
 * The signed-in employee's own ID card — display only, nothing to download.
 *
 * Everything comes from `/id-cards/my`, which takes no id and resolves the
 * employee from the session, so this page cannot show anyone else's card.
 * HR's generator renders the same component from the same payload.
 */
export default function MyIDCardPage(): ReactElement {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['id-card', 'my'],
    queryFn: () => idCardsApi.my(),
  });
  const card = data?.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My ID card"
        description="Your employee identification — show this screen when asked"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'My ID card' }]}
      />

      {isLoading ? (
        <Skeleton className="mx-auto h-[480px] w-72 rounded-2xl" />
      ) : isError || !card ? (
        <EmptyState
          icon={User}
          title="Card unavailable"
          description="We could not load your ID card. This usually means your login is not linked to an employee profile yet — please contact HR."
        />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <IdCardView card={card} />
          <p className="text-center text-xs text-muted-foreground">
            This card is issued to you and shows your details only.
          </p>
        </div>
      )}
    </div>
  );
}
