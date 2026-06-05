-- PharmaTrack — Category subcategories
-- Migration: 003_category_subcategories.sql
--
-- Adds a self-referential parent_id to categories so an organization can model
-- a two-level taxonomy: top-level categories (parent_id IS NULL) and their
-- subcategories (parent_id = a top-level category id). Two-level depth is
-- enforced in the API layer. Deleting a parent orphans its children to the
-- top level (ON DELETE SET NULL).

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id) WHERE parent_id IS NOT NULL;
