CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



SET default_table_access_method = heap;

--
-- Name: analyzed_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analyzed_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ml_account_id uuid,
    item_id text NOT NULL,
    title text,
    category_id text,
    price numeric(15,2),
    available_quantity integer,
    sold_quantity integer,
    status text,
    permalink text,
    thumbnail text,
    raw_data jsonb,
    analyzed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: item_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analyzed_item_id uuid NOT NULL,
    visits_total integer,
    visits_7d integer,
    visits_30d integer,
    sold_quantity_7d integer,
    sold_quantity_30d integer,
    conversion_rate numeric(5,2),
    photo_count integer,
    has_video boolean DEFAULT false,
    has_clips boolean DEFAULT false,
    title_length integer,
    description_length integer,
    listing_type text,
    shipping_type text,
    collected_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: keywords_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.keywords_tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analyzed_item_id uuid NOT NULL,
    keyword text NOT NULL,
    search_position integer,
    search_page integer,
    in_ads boolean DEFAULT false,
    checked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ml_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ml_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ml_user_id text NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    token_expires_at timestamp with time zone NOT NULL,
    nickname text,
    email text,
    country_id text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    company_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: analyzed_items analyzed_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analyzed_items
    ADD CONSTRAINT analyzed_items_pkey PRIMARY KEY (id);


--
-- Name: item_metrics item_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_metrics
    ADD CONSTRAINT item_metrics_pkey PRIMARY KEY (id);


--
-- Name: keywords_tracking keywords_tracking_analyzed_item_id_keyword_checked_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keywords_tracking
    ADD CONSTRAINT keywords_tracking_analyzed_item_id_keyword_checked_at_key UNIQUE (analyzed_item_id, keyword, checked_at);


--
-- Name: keywords_tracking keywords_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keywords_tracking
    ADD CONSTRAINT keywords_tracking_pkey PRIMARY KEY (id);


--
-- Name: ml_accounts ml_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_accounts
    ADD CONSTRAINT ml_accounts_pkey PRIMARY KEY (id);


--
-- Name: ml_accounts ml_accounts_user_id_ml_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_accounts
    ADD CONSTRAINT ml_accounts_user_id_ml_user_id_key UNIQUE (user_id, ml_user_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: idx_analyzed_items_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analyzed_items_item_id ON public.analyzed_items USING btree (item_id);


--
-- Name: idx_analyzed_items_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analyzed_items_user_id ON public.analyzed_items USING btree (user_id);


--
-- Name: idx_ml_accounts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_accounts_user_id ON public.ml_accounts USING btree (user_id);


--
-- Name: analyzed_items analyzed_items_ml_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analyzed_items
    ADD CONSTRAINT analyzed_items_ml_account_id_fkey FOREIGN KEY (ml_account_id) REFERENCES public.ml_accounts(id) ON DELETE SET NULL;


--
-- Name: analyzed_items analyzed_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analyzed_items
    ADD CONSTRAINT analyzed_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: item_metrics item_metrics_analyzed_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_metrics
    ADD CONSTRAINT item_metrics_analyzed_item_id_fkey FOREIGN KEY (analyzed_item_id) REFERENCES public.analyzed_items(id) ON DELETE CASCADE;


--
-- Name: keywords_tracking keywords_tracking_analyzed_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keywords_tracking
    ADD CONSTRAINT keywords_tracking_analyzed_item_id_fkey FOREIGN KEY (analyzed_item_id) REFERENCES public.analyzed_items(id) ON DELETE CASCADE;


--
-- Name: ml_accounts ml_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_accounts
    ADD CONSTRAINT ml_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: analyzed_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.analyzed_items ENABLE ROW LEVEL SECURITY;

--
-- Name: analyzed_items analyzed_items_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY analyzed_items_all ON public.analyzed_items USING ((auth.uid() = user_id));


--
-- Name: item_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: item_metrics item_metrics_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_metrics_insert ON public.item_metrics FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.analyzed_items
  WHERE ((analyzed_items.id = item_metrics.analyzed_item_id) AND (analyzed_items.user_id = auth.uid())))));


--
-- Name: item_metrics item_metrics_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_metrics_select ON public.item_metrics FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.analyzed_items
  WHERE ((analyzed_items.id = item_metrics.analyzed_item_id) AND (analyzed_items.user_id = auth.uid())))));


--
-- Name: keywords_tracking keywords_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY keywords_all ON public.keywords_tracking USING ((EXISTS ( SELECT 1
   FROM public.analyzed_items
  WHERE ((analyzed_items.id = keywords_tracking.analyzed_item_id) AND (analyzed_items.user_id = auth.uid())))));


--
-- Name: keywords_tracking; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.keywords_tracking ENABLE ROW LEVEL SECURITY;

--
-- Name: ml_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ml_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: ml_accounts ml_accounts_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ml_accounts_all ON public.ml_accounts USING ((auth.uid() = user_id));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: profiles profiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- PostgreSQL database dump complete
--




COMMIT;