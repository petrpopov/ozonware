import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function useRouteRefetch(refetch) {
  const location = useLocation();

  useEffect(() => {
    refetch();
  }, [location.key, refetch]);
}
