# Transcripts

Real viral UGC transcripts that the script generator learns from.

- One transcript per file, plain text, ending in `.txt`
- Name each file `creator-topic.txt`
- Only the spoken words: no timestamps, links or view counts
- Put them directly in this folder, no subfolders
- Empty files are not counted. With none, `POST /jobs` returns 422 `no_transcripts`
- Never invent one. Delete any `local-test.txt` before committing

These files are committed and this repo is public, so leave out anything private.
They are other creators' words, to be taken down after the hackathon.

Check with `npm run inputs`.
