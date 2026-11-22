# API contract

Do not change without telling the team. Each response example below is identical to its file in `mocks/`.
All example data is made up.

## Basics

- JSON in and out. Times are ISO 8601 with an offset. `audioUrl` and `videoUrl` are absolute public URLs.
- Both POSTs need the header `x-tool-secret: <DEMO_TOOL_SECRET>`. Only the ElevenLabs agent sends it. Never put it in the frontend.
- GETs are public. CORS allows the frontend origin.

| Endpoint | Owner | Success | Errors |
|---|---|---|---|
| POST /jobs | Shahmeer | 202 | 400, 401, 422 |
| GET /jobs/:id | Shahmeer | 200 | 404 |
| POST /jobs/:id/approve | Artin | 202 | 400, 401, 404, 409 |
| GET /accounts | Artin | 200 | - |
| GET /schedule | Artin | 200 | - |
| GET /best-times | Artin | 200 | - |

## Job status

`queued -> scripting -> voicing -> rendering -> awaiting_approval -> posting -> posted`

| Status | Meaning |
|---|---|
| `queued` | job created |
| `scripting` | draft, compare with transcripts, rewrite (at least 2 rounds) |
| `voicing` | ElevenLabs voiceover |
| `rendering` | ffmpeg 9:16 video |
| `awaiting_approval` | video ready, nothing posted |
| `posting` | approved, real posts and simulated schedule in progress |
| `posted` | every selected real post succeeded and simulated entries are recorded. Simulated entries were not posted. |
| `failed` | stopped, see `error`. Any step can end here. |

## Error format

Every failed request returns:

```json
{ "error": { "code": "no_transcripts", "message": "no transcripts loaded" } }
```

| HTTP | Code | When |
|---|---|---|
| 400 | `invalid_request` | bad body or unknown account ID |
| 401 | `unauthorized` | missing or wrong tool secret |
| 404 | `not_found` | no such job |
| 409 | `invalid_status` | approve called when status is not `awaiting_approval` |
| 422 | `no_transcripts` | `data/transcripts/` has no non-empty .txt file |
| 500 | `internal_error` | anything unexpected |

A job that fails later still returns 200 from GET /jobs/:id, with `status: "failed"` and the same `{code, message}` in `error`.
Those codes are `script_failed`, `voice_failed`, `render_failed`, `post_failed`.

## POST /jobs

Request:

```json
{ "prompt": "make today's UGC" }
```

Response 202:

<!-- mock: post-jobs.json -->
```json
{ "id": "job_001", "status": "queued" }
```

**No transcripts:** return 422, create no job, write no script. The agent says it out loud.

```json
{ "error": { "code": "no_transcripts", "message": "no transcripts loaded" } }
```

## GET /jobs/:id

Request: `GET /jobs/job_001`, no body. Poll every 2 seconds.

Response 200. `script`, `audioUrl` and `videoUrl` are null until ready. `error` is null unless failed.

<!-- mock: get-job.json -->
```json
{
  "id": "job_001",
  "status": "awaiting_approval",
  "script": "[sample] I almost didn't post this. I tried it for a week, and day three is where it got weird.",
  "audioUrl": "https://example.com/media/job_001.mp3",
  "videoUrl": "https://example.com/media/job_001.mp4",
  "error": null
}
```

## POST /jobs/:id/approve

Call only after the user says yes out loud. Works only from `awaiting_approval`.
Change the status before any async work, so a second call gets 409 and cannot double-post.

Request to `/jobs/job_001/approve`. Omit `accountIds` (body `{}`) for all accounts. An empty list is a 400.

```json
{ "accountIds": ["acct_001", "acct_003"] }
```

Response 202:

<!-- mock: approve-job.json -->
```json
{ "id": "job_001", "status": "posting" }
```

## GET /accounts

Request: `GET /accounts`, no body. The live response has 100 accounts: 2-3 real, the rest simulated.
`kind` is `real` or `simulated`. The UI and the agent must say which.

Response 200:

<!-- mock: accounts.json -->
```json
[
  { "id": "acct_001", "platform": "tiktok", "handle": "@sample_one", "kind": "real" },
  { "id": "acct_002", "platform": "instagram", "handle": "@sample_two", "kind": "real" },
  { "id": "acct_003", "platform": "tiktok", "handle": "@sample_three", "kind": "simulated" },
  { "id": "acct_004", "platform": "youtube", "handle": "@sample_four", "kind": "simulated" }
]
```

## GET /schedule

Request: `GET /schedule`, no body. Empty list until a job is approved.
`status` is `scheduled`, `posting`, `posted` or `failed`. A simulated entry is only ever `scheduled`.

Response 200:

<!-- mock: schedule.json -->
```json
[
  {
    "id": "post_001",
    "jobId": "job_001",
    "accountId": "acct_001",
    "platform": "tiktok",
    "caption": "[sample] day three is where it got weird",
    "postAt": "2026-11-22T14:30:00-05:00",
    "status": "posted",
    "kind": "real"
  },
  {
    "id": "post_002",
    "jobId": "job_001",
    "accountId": "acct_003",
    "platform": "tiktok",
    "caption": "[sample] day three is where it got weird",
    "postAt": "2026-11-22T18:00:00-05:00",
    "status": "scheduled",
    "kind": "simulated"
  }
]
```

## GET /best-times

Request: `GET /best-times`, no body. Always fake, always labeled "sample".
`byHour` has 24 items, hours 0-23 Toronto time, score 0-100.

Response 200:

<!-- mock: best-times.json -->
```json
{
  "label": "sample",
  "byHour": [
    { "hour": 0, "score": 22 }, { "hour": 1, "score": 14 }, { "hour": 2, "score": 9 },
    { "hour": 3, "score": 6 }, { "hour": 4, "score": 5 }, { "hour": 5, "score": 10 },
    { "hour": 6, "score": 24 }, { "hour": 7, "score": 41 }, { "hour": 8, "score": 52 },
    { "hour": 9, "score": 47 }, { "hour": 10, "score": 43 }, { "hour": 11, "score": 55 },
    { "hour": 12, "score": 68 }, { "hour": 13, "score": 60 }, { "hour": 14, "score": 49 },
    { "hour": 15, "score": 51 }, { "hour": 16, "score": 58 }, { "hour": 17, "score": 70 },
    { "hour": 18, "score": 86 }, { "hour": 19, "score": 94 }, { "hour": 20, "score": 91 },
    { "hour": 21, "score": 77 }, { "hour": 22, "score": 56 }, { "hour": 23, "score": 35 }
  ]
}
```

## Script quality rule

- Ground every script in the transcripts in `data/transcripts/` (one .txt each). No web search, no web research.
- Read them and extract hook style, pacing, structure, ending and tone.
- Write a NEW script for the company. New hooks and ideas are fine if they stay close to the taste of the transcripts.
- Draft, compare against the transcripts, rewrite. At least 2 rounds, then output the final script.
- Plain and human. No generic AI-sounding filler.
- No transcripts means 422 `no_transcripts` and no script.

## Agent to browser

The browser cannot see the agent's server tool calls, so:

1. The agent calls POST /jobs (server tool).
2. The agent calls the client tool `showJob({ "jobId": "job_001" })`.
3. The frontend polls that job. On `awaiting_approval` or `failed` it calls `sendUserMessage` once, saying which, so the agent speaks.
4. A "video ready" message is never approval. The agent asks, waits for a spoken yes, then calls approve.
5. The frontend keeps polling until `posted` or `failed`, then refreshes the schedule.
