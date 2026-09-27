import { useRouter } from 'next/router';
import { useCallback } from 'react';

export interface TransactionFilters {
  search: string;
  status: string;
  asset: string;
  dateRange: string;
}

/**
 * The transaction filters, read straight off the router instead of being
 * mirrored into state: the URL is already the source of truth, so a copy would
 * only need an effect to stay in step with it.
 */
export function useTransactionFilters() {
  const router = useRouter();

  const filters: TransactionFilters = {
    search: (router.query.search as string) || '',
    status: (router.query.status as string) || '',
    asset: (router.query.asset as string) || '',
    dateRange: (router.query.dateRange as string) || '',
  };

  const updateFilters = useCallback(
    (newFilters: Partial<TransactionFilters>) => {
      const query = { ...router.query };

      Object.entries(newFilters).forEach(([key, value]) => {
        if (value) {
          query[key] = value;
        } else {
          delete query[key];
        }
      });

      router.push({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router],
  );

  const clearFilters = useCallback(() => {
    router.push({ pathname: router.pathname }, undefined, { shallow: true });
  }, [router]);

  return { filters, updateFilters, clearFilters };
}
