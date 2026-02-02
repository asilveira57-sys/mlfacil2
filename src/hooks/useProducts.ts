import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/useWorkspace';
import {
  importListingFromUrl,
  getLearnedListings,
  getLearnedListing,
  deleteLearnedListing,
  createProductRecord,
  getProductRecords,
  getProductRecord,
  updateProductRecord,
  deleteProductRecord,
  validateProductRecord,
  publishToMl,
  getPublicationJobs,
  updateProductAttribute,
  updateProductVariant,
  type LearnedListing,
  type ProductRecord,
  type PublicationJob,
} from '@/lib/products/api';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export function useLearnedListings() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  return useQuery({
    queryKey: ['learned-listings', workspaceId],
    queryFn: () => getLearnedListings(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useLearnedListing(id: string | undefined) {
  return useQuery({
    queryKey: ['learned-listing', id],
    queryFn: () => getLearnedListing(id!),
    enabled: !!id,
  });
}

export function useImportListing() {
  const { t } = useTranslation('products');
  const queryClient = useQueryClient();
  const { currentWorkspace } = useWorkspace();

  return useMutation({
    mutationFn: async (url: string) => {
      if (!currentWorkspace?.id) throw new Error('No workspace');
      return importListingFromUrl(url, currentWorkspace.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learned-listings'] });
      toast.success(t('import_success'));
    },
    onError: (error: any) => {
      toast.error(error.message || t('import_error'));
    },
  });
}

export function useDeleteLearnedListing() {
  const { t } = useTranslation('products');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteLearnedListing,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learned-listings'] });
      toast.success(t('delete_success'));
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
}

export function useProductRecords() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  return useQuery({
    queryKey: ['product-records', workspaceId],
    queryFn: () => getProductRecords(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useProductRecord(id: string | undefined) {
  return useQuery({
    queryKey: ['product-record', id],
    queryFn: () => getProductRecord(id!),
    enabled: !!id,
  });
}

export function useCreateProductRecord() {
  const { t } = useTranslation('products');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ learnedListingId, nameInternal }: { learnedListingId: string; nameInternal?: string }) => {
      return createProductRecord(learnedListingId, nameInternal);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-records'] });
      toast.success(t('create_product') + ' ✓');
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateProductRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ProductRecord> }) => {
      return updateProductRecord(id, updates);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['product-record', id] });
      queryClient.invalidateQueries({ queryKey: ['product-records'] });
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteProductRecord() {
  const { t } = useTranslation('products');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProductRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-records'] });
      toast.success(t('delete_success'));
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
}

export function useValidateProductRecord() {
  const { t } = useTranslation('products');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: validateProductRecord,
    onSuccess: (data, productRecordId) => {
      queryClient.invalidateQueries({ queryKey: ['product-record', productRecordId] });
      queryClient.invalidateQueries({ queryKey: ['product-records'] });
      
      if (data.isValid) {
        toast.success(t('validation_ok'));
      } else {
        toast.warning(t('validation_errors', { count: data.errors }));
      }
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
}

export function usePublishToMl() {
  const { t } = useTranslation('products');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productRecordId, mlAccountId, listingType }: { 
      productRecordId: string; 
      mlAccountId: string; 
      listingType?: string;
    }) => {
      return publishToMl(productRecordId, mlAccountId, listingType);
    },
    onSuccess: (data, { productRecordId }) => {
      queryClient.invalidateQueries({ queryKey: ['product-record', productRecordId] });
      queryClient.invalidateQueries({ queryKey: ['product-records'] });
      queryClient.invalidateQueries({ queryKey: ['publication-jobs', productRecordId] });
      
      if (data.success) {
        toast.success(t('publish_success'));
      } else {
        toast.error(data.error || t('publish_error'));
      }
    },
    onError: (error: any) => {
      toast.error(error.message || t('publish_error'));
    },
  });
}

export function usePublicationJobs(productRecordId: string | undefined) {
  return useQuery({
    queryKey: ['publication-jobs', productRecordId],
    queryFn: () => getPublicationJobs(productRecordId!),
    enabled: !!productRecordId,
  });
}

export function useUpdateProductAttribute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      return updateProductAttribute(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-record'] });
    },
  });
}

export function useUpdateProductVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      return updateProductVariant(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-record'] });
    },
  });
}
