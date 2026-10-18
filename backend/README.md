# Our World backend

This service exposes every image stored under the configured spiral gallery
folder in a Backblaze B2 bucket through the native B2 API. It does not
require a photo name or filename. The frontend requests them from
`GET /api/spiral-gallery/photos`.

The backend is organized by responsibility:

- `src/config`: storage and environment configuration
- `src/models`: Backblaze data access for each API feature
- `src/controllers`: request handling and error responses for each API feature
- `src/routes`: HTTP route definitions for each API feature
- `src/app.js`: Express middleware and route registration
- `server.js`: environment loading and server startup

## Configuration

Set these environment variables before starting the server:

- `B2_KEY_ID`: Backblaze application key ID
- `B2_APPLICATION_KEY`: Backblaze application key
- `B2_BUCKET_NAME`: bucket name
- `B2_PHOTOS_PREFIX`: folder containing the gallery photos, defaults to `worldwithme`
- `FRONTEND_ORIGINS`: comma-separated allowed frontend origins, defaults to `http://localhost:5173`
- `PORT`: optional server port, defaults to `3001`

Copy `.env.example` to `.env` and replace the placeholder values with your
Backblaze credentials. Keep `.env` private and never commit it.

Run it with `pnpm dev`.

The frontend uses the Vite development proxy to forward `/api` requests to
this server. Start both services during development:

```bash
# Terminal 1
cd backend
pnpm dev

# Terminal 2
cd frontend
pnpm dev
```

The SpiralGallery requests:

```text
GET /api/spiral-gallery/photos
```

Images are served through the backend proxy to avoid browser CORS issues:

```text
GET /api/spiral-gallery/photo?key=<encoded-file-key>
```

For a deployed frontend, set `PUBLIC_API_URL` in `frontend/.env` to the
deployed backend URL. Multiple frontend origins can be allowed with a
comma-separated `FRONTEND_ORIGINS` value.
