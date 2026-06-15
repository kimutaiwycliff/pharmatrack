# ADR-003 — shadcn layering: primitives → composites → features → routes
**Status:** Accepted

`packages/ui` owns shadcn primitives (varied via cva, never forked) and composites
(DataTable, FormField, KpiCard, PageHeader, StatusBadge, Money, EmptyState).
Feature components compose composites; routes compose features. A feature is never
imported by a primitive. Theming via `--pt-*` CSS variables.
