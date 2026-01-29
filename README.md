# Social Media Scheduler

A React + TypeScript app for planning and managing Instagram content. It includes a calendar with weekly/monthly views, an Instagram-style grid, a media library backed by Supabase Storage, and AI-assisted captions/hashtags via Gemini.

## Highlights
- Calendar (month/week/day) with rich event cards and detailed post modal
- Instagram grid view with drag-and-drop scheduling for scheduled posts
- Media library with upload, preview, and signed URL access (private bucket)
- Post composer with reels, carousel support, and cover selection
- AI caption + hashtag generation using Google Gemini

## Tech Stack
- **Frontend:** React 19, TypeScript, Vite, MUI
- **Data/Auth/Storage:** Supabase (Postgres + Storage + Edge Functions)
- **DnD:** @hello-pangea/dnd
- **AI:** Google Gemini (Generative Language API)

## Project Structure
```
src/
  components/
    calendar/           Calendar UI (react-big-calendar)
    grid/               Instagram grid view + filters
    posts/              Post composer, details modal, media uploader
  hooks/                Data hooks (posts, instagram, grid reordering)
  services/             Supabase + AI + Instagram service wrappers
  utils/                Grid helpers, formatters
supabase/
  migrations/            Postgres schema
```

## Features
### Scheduling & Views
- **Calendar:** Month/Week/Day views
- **Weekly view cards:** image + caption + type/status
- **Monthly view cards:** compact, two-line summary
- **Grid view:** drag-and-drop ordering for scheduled posts

### Post Composer
- Supports **feed**, **story**, **reel**, **carousel**
- Media validation (size/type)
- Media library selection
- Reel cover selection
- AI caption + hashtag generation

### Media Library
- Private Supabase Storage bucket
- Signed URL access for previews/download
- Upload/remove media with metadata stored in `sch_media_library`

## Setup
### Prerequisites
- Node.js 18+
- Supabase project
- (Optional) Google Gemini API key

### Environment Variables
Create a `.env` file in the repo root:
```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_GEMINI_API_KEY=your-gemini-api-key
VITE_GEMINI_MODEL=gemini-2.5-flash
```

### Supabase Setup
1. **Create tables** by running the migration:
   - `supabase/migrations/001_initial_schema.sql`
2. **Storage bucket**
   - Create a bucket named `media`
   - Bucket should be **private** (signed URLs are used)
3. **Edge Functions** (if using publish/insights)
   - Functions called by the app: `publish-post-now`, `refresh-instagram-token`,
     `get-post-insights`, `get-account-insights`, `validate-instagram-connection`

### Install & Run
```
npm install
npm run dev
```

### Build
```
npm run build
npm run preview
```

## Usage
1. **Connect Instagram account** (via your backend/edge flow).
2. **Create a post** in the composer, upload media or select from the library.
3. **Schedule** the post time, view it on the calendar or grid.
4. **Reorder** scheduled posts in grid view via drag-and-drop.
5. **Edit or delete** via the post details modal.

## Data Model (Summary)
Core tables (see `supabase/migrations/001_initial_schema.sql`):
- `sch_users`
- `ig_accounts`
- `sch_scheduled_posts`
- `sch_media_library`

Key storage bucket:
- `media`

## Notes
- Signed URLs are generated for media access (private buckets).
- AI features require a valid Gemini API key.
- Instagram API calls should be routed through Supabase Edge Functions.

## Scripts
- `npm run dev` - start dev server
- `npm run build` - build production assets
- `npm run lint` - run lint
- `npm run preview` - preview production build

## License
Private project. Add a license if you plan to distribute.
