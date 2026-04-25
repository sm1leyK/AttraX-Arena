# analyze-post

Lens post analysis Edge Function skeleton.

Current default mode is mock-first: the function validates `{ post, supportBoardSignal }`, builds a cacheable analysis key from `post.id + post.updated_at`, and returns the same Lens JSON shape the UI already consumes.

Real OpenAI wiring is gated behind `ANALYZE_POST_MODE=openai`. When the key is ready, store it in Supabase secrets as `OPENAI_API_KEY`, optionally set `OPENAI_LENS_MODEL` and `OPENAI_BASE_URL`, and keep the browser-side `front/` code key-free.

For OpenAI-compatible gateways such as OrbitAI, use:

```text
OPENAI_BASE_URL=https://aiapi.orbitai.global/v1
OPENAI_LENS_MODEL=gpt-5.4
```
