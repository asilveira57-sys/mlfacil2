import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UploadResult {
  logoUrl: string;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
}

export function useCompanyLogoUpload() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadLogo = useCallback(async (
    file: File,
    companyId: string,
  ): Promise<UploadResult | null> => {
    setUploading(true);
    setError(null);

    try {
      // Validate file type
      const allowed = ['image/png', 'image/svg+xml'];
      if (!allowed.includes(file.type)) {
        setError('Formato não suportado. Use PNG ou SVG.');
        return null;
      }

      // Validate file size (2MB)
      if (file.size > 2 * 1024 * 1024) {
        setError('Arquivo muito grande. Máximo 2 MB.');
        return null;
      }

      // Get image dimensions
      let width = 0, height = 0;
      if (file.type === 'image/png') {
        const dims = await getImageDimensions(file);
        width = dims.width;
        height = dims.height;

        if (width < 400 || height < 120) {
          setError('Dimensões mínimas: 400 x 120 px.');
          return null;
        }
      }

      const ext = file.type === 'image/svg+xml' ? 'svg' : 'png';
      const filePath = `${companyId}/logo_original.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('company-logos')
        .getPublicUrl(filePath);

      const logoUrl = urlData.publicUrl;

      // Update company record
      await supabase
        .from('companies')
        .update({
          logo_url: logoUrl,
          logo_original_url: logoUrl,
        } as any)
        .eq('id', companyId);

      return {
        logoUrl,
        width,
        height,
        format: ext,
        sizeBytes: file.size,
      };
    } catch (err: any) {
      console.error('[LogoUpload] Error:', err);
      setError(err.message || 'Erro ao enviar logomarca.');
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  const removeLogo = useCallback(async (companyId: string): Promise<boolean> => {
    setUploading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          logo_url: null,
          logo_original_url: null,
        } as any)
        .eq('id', companyId);

      if (updateError) throw updateError;
      return true;
    } catch (err: any) {
      console.error('[LogoUpload] Remove error:', err);
      setError(err.message || 'Erro ao remover logomarca.');
      return false;
    } finally {
      setUploading(false);
    }
  }, []);

  const applyLogoToAll = useCallback(async (
    userId: string,
    logoUrl: string,
  ): Promise<boolean> => {
    setUploading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          logo_url: logoUrl,
          logo_original_url: logoUrl,
        } as any)
        .eq('user_id', userId);

      if (updateError) throw updateError;
      return true;
    } catch (err: any) {
      console.error('[LogoUpload] ApplyAll error:', err);
      setError(err.message || 'Erro ao aplicar logo.');
      return false;
    } finally {
      setUploading(false);
    }
  }, []);

  return { uploadLogo, removeLogo, applyLogoToAll, uploading, error };
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = URL.createObjectURL(file);
  });
}
