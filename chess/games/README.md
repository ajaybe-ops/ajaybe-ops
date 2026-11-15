# Chess games

One JSON file per issue, written by `.github/workflows/chess-bot.yml`. The file
name is `issue-<number>.json`, and the repository is the database.

The shape (values shortened for readability — this is a schema example, not a
real game):

```json
{
  "version": 1,
  "issue": 42,
  "playerColor": "w",
  "engineColor": "b",
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "moves": ["e4", "e5", "Nf3"],
  "status": "active",
  "createdAt": "2026-11-14T10:00:00.000Z",
  "updatedAt": "2026-11-14T10:01:12.000Z"
}
```

| field | meaning |
| :--- | :--- |
| `version` | schema version; currently `1` |
| `issue` | GitHub issue number, duplicated for human readers |
| `playerColor` / `engineColor` | `w` or `b`; the bot only moves for its own colour |
| `fen` | the authoritative position, including castling rights, en passant and the halfmove clock |
| `moves` | SAN history recorded by the bot, in order |
| `status` | `active`, `checkmate`, `draw`, or `resigned` |
| `createdAt` / `updatedAt` | ISO timestamps |

## How it changes

- The bot reads the file, validates the comment as a legal move, applies it, asks
  the engine for a reply, and writes the new position back with the file's
  current blob SHA.
- A mismatched SHA means another run won the race. The bot refuses the write and
  asks the visitor to post again rather than merging two histories.
- `/new` resets the position and empties `moves`; `/resign` sets `status`.
- The file is committed by the Actions token, so it appears in `git log` like any
  other change.

## Limits worth knowing

- **Threefold repetition is not detected across comments.** Each run reloads the
  FEN, which carries the current position but not the full repetition history.
  The in-browser game keeps one `Chess` instance and does detect it.
- **The 50-move clock survives** because the halfmove counter is part of the FEN
  and is adjudicated by `status()`.
- **Editing an old comment** does not replay history. The JSON and the bot's
  replies are the record.
- **Deleting a file** starts a fresh game the next time someone posts `/new`.
  Do not delete a file mid-game unless you intend to reset it.

The protocol itself lives in [`scripts/lib/chess-issue.mjs`](../../scripts/lib/chess-issue.mjs)
and is covered by `tests/bot.test.js`. The rules engine is
[`lib/chess.js`](../../lib/chess.js), validated by perft in
`tests/chess.test.js`.
