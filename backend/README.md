# Our World backend

This service is intentionally small in the first milestone. The birthday experience
does not need authentication or a database: the frontend can use curated local data
and public Google Drive image links.

The service gives us a clean extension point for:

- serving journey configuration without rebuilding the frontend
- generating Google Drive thumbnail URLs
- uploading and resizing photos later
- protecting private content if the gift becomes more than a static site

Run it with `pnpm dev:backend`.
