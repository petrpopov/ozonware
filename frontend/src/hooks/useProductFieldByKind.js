import { useQuery } from '@tanstack/react-query';
import { services } from '../api/services.js';

/**
 * Returns the product field definition whose `kind` matches the given value,
 * or null if not found / still loading.
 */
export function useProductFieldByKind(kind) {
  return useQuery({
    queryKey: ['product-fields'],
    queryFn: () => services.getProductFields(),
    select: (fields) => fields.find((f) => f.kind === kind) ?? null,
  });
}
