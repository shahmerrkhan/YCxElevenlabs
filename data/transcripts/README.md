# Transcripts

Real viral UGC transcripts that the script generator learns from.

- One transcript per file, plain text, ending in `.txt`
- Name each file `reel_NN.txt`
- Line 1 is `source: <url>`, line 2 is `views: <number or unknown>`. The loader drops both before the model sees them
- After that, only the spoken words: no timestamps
- `INDEX.md` lists every file with views, length and hook style
- To add one, put its URL in `SOURCES` in `scripts/collect_transcripts.py` and run `uv run scripts/collect_transcripts.py`
- Put them directly in this folder, no subfolders
- Empty files are not counted. With none, `POST /jobs` returns 422 `no_transcripts`
- Never invent one. Delete any `local-test.txt` before committing

These files are committed and this repo is public, so leave out anything private.
They are other creators' words, to be taken down after the hackathon.

Check with `npm run inputs`.
