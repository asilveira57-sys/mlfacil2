-- =============================================
-- USER ROLES TABLE FOR ROLE-BASED ACCESS CONTROL
-- Following security best practices: roles in separate table, not in profiles
-- =============================================

-- 1. Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'seller');

-- 2. Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'seller',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE (user_id, role)
);

-- 3. Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Create security definer function to check roles (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 5. Create function to get user role (returns first role, defaults to 'seller')
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role::TEXT FROM public.user_roles WHERE user_id = _user_id LIMIT 1),
    'seller'
  )
$$;

-- 6. RLS policies for user_roles table
-- Users can read their own roles
CREATE POLICY "Users can read own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Only admins can manage roles (insert/update/delete)
CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7. Update timestamp trigger for user_roles
CREATE TRIGGER update_user_roles_updated_at
BEFORE UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- BLOG TABLES RLS POLICIES
-- =============================================

-- 8. Update blog_posts RLS: public read for published, admin write
-- First drop existing policies if any
DROP POLICY IF EXISTS "Public can read published posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins can manage all posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Anyone can read published posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins can create posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins can update posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins can delete posts" ON public.blog_posts;

-- Enable RLS on blog_posts if not already
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Public can read published posts
CREATE POLICY "Anyone can read published posts"
ON public.blog_posts
FOR SELECT
USING (status = 'publicado' AND (data_publicacao IS NULL OR data_publicacao <= now()));

-- Admins can read ALL posts (including drafts)
CREATE POLICY "Admins can read all posts"
ON public.blog_posts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can insert posts
CREATE POLICY "Admins can create posts"
ON public.blog_posts
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can update posts
CREATE POLICY "Admins can update posts"
ON public.blog_posts
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can delete posts
CREATE POLICY "Admins can delete posts"
ON public.blog_posts
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 9. Update blog_categories RLS: public read, admin write
DROP POLICY IF EXISTS "Public can read categories" ON public.blog_categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON public.blog_categories;
DROP POLICY IF EXISTS "Anyone can read categories" ON public.blog_categories;
DROP POLICY IF EXISTS "Admins can create categories" ON public.blog_categories;
DROP POLICY IF EXISTS "Admins can update categories" ON public.blog_categories;
DROP POLICY IF EXISTS "Admins can delete categories" ON public.blog_categories;

-- Enable RLS on blog_categories if not already
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;

-- Anyone can read categories (for public blog filtering)
CREATE POLICY "Anyone can read categories"
ON public.blog_categories
FOR SELECT
USING (true);

-- Admins can insert categories
CREATE POLICY "Admins can create categories"
ON public.blog_categories
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can update categories
CREATE POLICY "Admins can update categories"
ON public.blog_categories
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can delete categories
CREATE POLICY "Admins can delete categories"
ON public.blog_categories
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));