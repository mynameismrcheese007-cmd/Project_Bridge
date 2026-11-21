import { Button } from './ui/Button';

/** The button under a paged list; nothing when the last page is shown. */
export function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <Button type="button" variant="secondary" block loading={loading} onClick={onClick}>
      Load more
    </Button>
  );
}
