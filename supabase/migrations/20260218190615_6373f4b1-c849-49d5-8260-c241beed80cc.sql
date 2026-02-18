
-- Add profile_id to collaborators table
ALTER TABLE public.collaborators
ADD COLUMN profile_id UUID REFERENCES public.access_profiles(id) ON DELETE SET NULL;

-- Index for faster lookups
CREATE INDEX idx_collaborators_profile_id ON public.collaborators(profile_id);

-- Comment
COMMENT ON COLUMN public.collaborators.profile_id IS 'Reference to the access profile assigned to this collaborator';
