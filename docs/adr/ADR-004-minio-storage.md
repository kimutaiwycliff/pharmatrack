# ADR-004 — MinIO for object storage (images + backups)
**Status:** Accepted

Self-hosted S3-compatible MinIO via `@aws-sdk/client-s3` with presigned PUT for
uploads. Buckets: products (images), backups (pgBackRest/pg_dump target).
