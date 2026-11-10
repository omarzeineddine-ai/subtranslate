# Subtranslate

AI subtitle translation that keeps every cue on its original timing. Upload an `.srt` or `.vtt` file, pick a target language, and download a translated `.srt` with the same number of cues and the same timestamps as the source.

Hosted at [subtranslate.xyz](https://subtranslate.xyz), or run it yourself with the instructions below.

## What it does

- **Translate** (`/translate`): batched translation with drift detection and automatic repair, streamed back cue by cue. See [How translation works](#how-translation-works).
- **Title lookup**: fills in a synopsis and character list from the filename, so the model can get gender and formality right.
- **Review**: after a run, flagged cues can be edited, split, inserted or deleted before download, with undo.
- **Clean** (`/clean`): strips formatting tags, bracketed sound cues, speaker labels, URLs and duplicate cues. It runs entirely in the browser and uses no AI.

## Configuration

Every environment variable is optional. Copy `.env.example` to `.env.local` to set them.

| Variable | Effect |
| --- | --- |
| `OPENAI_API_KEY` | When set, the server pays for every translation. When empty, the form asks each visitor for their own OpenAI key, which is sent with their request and never stored on the server. |
| `TMDB_API_KEY` | Title lookup works from Wikipedia with no key. A [TMDB key](https://www.themoviedb.org/settings/api) adds character genders and fills in whatever Wikipedia lacked. |
| `SITE_URL` | The public address of your deployment, such as `https://example.com`. Used for canonical URLs, the sitemap, and the User-Agent sent to Wikipedia. Defaults to the project's production domain on Vercel and to `http://localhost:3000` elsewhere. Read at build time. |
| `GOOGLE_SITE_VERIFICATION` | Your Google Search Console verification token. Read at build time. |

## Running locally

Requires Node.js 20.9 or later.

```bash
npm install
npm run dev
```

The app is then at <http://localhost:3000>.

| Command | Purpose |
| --- | --- |
| `npm test` | Run the test suite (Vitest) |
| `npm run typecheck` | Type-check with `tsc` |
| `npm run lint` | Lint with ESLint |
| `npm run build` | Production build |

## Running with Docker

With Compose, which builds the image and reads `.env.local`:

```bash
cp .env.example .env.local
docker compose up --build
```

Or with plain Docker:

```bash
docker build -t subtranslate .
docker run -p 3000:3000 -e OPENAI_API_KEY=<your_api_key> subtranslate
```

Leave out `-e OPENAI_API_KEY` to have visitors bring their own keys.

`SITE_URL` and `GOOGLE_SITE_VERIFICATION` are baked in when the image is built, so pass them as build arguments: `docker build --build-arg SITE_URL=https://example.com -t subtranslate .`. With Compose, export them in your shell before `docker compose up --build`.

## How translation works

The pipeline is optimized for speed *and* timing safety — the number one failure mode of LLM subtitle translation is segment drift (translations sliding onto the wrong timestamps), so everything is built around keeping a strict 1:1 input/output alignment:

1. **Decode.** The uploaded file is read in the browser with encoding detection: a BOM wins, then strict UTF-8, then a legacy Windows code page for the many older files that would otherwise decode to replacement characters: Windows-1251 when the bytes read as Cyrillic, Windows-1250 when they read as Central European (Polish, Czech, Slovak), otherwise Windows-1252. The form says when a fallback kicked in and which one.
2. **Parse + batch.** The SRT is parsed into segments (a WebVTT `.vtt` file is read the same way: its header, notes and VTT-only tags are dropped, and a `<v Name>` voice becomes a `NAME:` label; every download is `.srt`), which are grouped into batches of ~800 tokens (`js-tiktoken`). Up to 6 batches are in flight at once in a sliding window, and results stream back to the browser in original order as they complete.
3. **Batch translation with structured output.** Each batch goes to `gpt-5-nano` via a structured-output call whose schema enforces "an array of strings" at the protocol layer. The system prompt pins the exact item count, forbids splitting/merging segments, and swaps embedded newlines for a sentinel character (`⏎`) so two-line cues can't be mistaken for two items. Retries with exponential backoff handle rate limits and transient errors.
4. **Drift + quality detection.** Every batch result is checked heuristically: count mismatches, suspected splits (a complete source sentence whose translation is cut off mid-sentence; a missing full stop is not counted against Japanese, Chinese, Korean or Thai, whose subtitles end lines without one), suspected merges (one slot absorbing its neighbor's content), blank slots (no text where the source had some, usually the visible half of a merge), untranslated pass-throughs (output identical to input), and English drift (a line written in English when the target is another language).
5. **Repair.** A suspect region is first asked for again as one smaller batch, and whatever part of that answer lines up is kept. What still looks shifted is re-translated one segment at a time — a 1-input/1-output call cannot drift by construction. If everything fails, the original text is kept for the failing slots so timing stays intact; the output always has exactly as many segments as the input.

### Context from the title

Subtitle text alone often can't resolve speaker gender (Polish past-tense endings, French adjective agreement) or formality. The form has a free-text context field for that, and the "Look up" button fills it automatically: the filename is parsed into a title and episode (`Breaking.Bad.S01E01.720p.srt` → *Breaking Bad*, S1E1), and the result is trimmed to a compact block that rides along in every batch's system prompt. The user can edit it before translating.

Two sources feed the lookup:

- **Wikipedia** is always queried and needs no key. The client guesses the page that holds the episode table (`<Show> season N`, then `List of <Show> episodes`, then the main article) and reads the episode's summary, the cast list, and for films the plot section, using [`wtf_wikipedia`](https://github.com/spencermountain/wtf_wikipedia) to turn wikitext into prose. Wikipedia's per-episode summaries are far richer than any database's overview, which is why it is the default.
- **TMDB** joins in when `TMDB_API_KEY` is set. Wikipedia records no genders, so TMDB supplies them for the character names, along with genres and a series synopsis when the Wikipedia page lacked them. Anime and other animation is covered too, but genders are omitted there: TMDB records the voice actor's gender, and boys are routinely voiced by women.

The form says which sources contributed. If a source is unreachable the other still answers on its own.

Batching is what makes it fast (and cheap): one LLM call translates dozens of segments with shared context, instead of one call per segment or a slow agent loop. The repair path only pays the per-segment cost for the small fraction of batches that misbehave.

## License

[MIT](LICENSE)
