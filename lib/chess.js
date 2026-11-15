/**
 * chess.js — a small, dependency-free chess rules engine on a 0x88 board.
 *
 * Written for this project so that the same, tested rules implementation powers
 *   - the browser board in /arcade
 *   - the GitHub Issues bot (scripts/chess-bot.mjs)
 *   - the local CLI harness (scripts/chess-cli.mjs)
 *
 * Supported: full legal move generation, castling, en passant, promotion,
 * check/checkmate/stalemate, threefold repetition, insufficient material,
 * SAN in and out, FEN in and out, UCI coordinates in.
 *
 * Not supported (documented, not faked): clocks, 50-move *automatic* draw is
 * reported via isFiftyMoveRule(), variants, and draws by agreement (a social
 * convention, not a rules question).
 */

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const FILES = 'abcdefgh';

const KNIGHT_OFFSETS = [33, 31, 18, 14, -14, -18, -31, -33];
const BISHOP_OFFSETS = [17, 15, -15, -17];
const ROOK_OFFSETS = [16, 1, -1, -16];
const KING_OFFSETS = [17, 16, 15, 1, -1, -15, -16, -17];

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'];

const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

export function onBoard(index) {
  return index >= 0 && (index & 0x88) === 0;
}

export function squareToIndex(square) {
  if (typeof square !== 'string' || square.length !== 2) return -1;
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  if (file < 0 || !Number.isInteger(rank) || rank < 0 || rank > 7) return -1;
  return rank * 16 + file;
}

export function indexToSquare(index) {
  if (!onBoard(index)) return '-';
  return FILES[index & 15] + ((index >> 4) + 1);
}

export function pieceColor(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? 'w' : 'b';
}

function isWhitePiece(piece) {
  return !!piece && piece === piece.toUpperCase();
}

function opposite(color) {
  return color === 'w' ? 'b' : 'w';
}

/** Is `square` attacked by any piece of `byColor`? (Reverse ray scan.) */
export function isAttacked(board, square, byColor) {
  const white = byColor === 'w';

  // Pawns: a white pawn on s-15 / s-17 attacks s.
  for (const offset of white ? [-15, -17] : [15, 17]) {
    const from = square + offset;
    if (onBoard(from) && board[from] === (white ? 'P' : 'p')) return true;
  }

  // Knights
  for (const offset of KNIGHT_OFFSETS) {
    const from = square + offset;
    if (onBoard(from) && board[from] === (white ? 'N' : 'n')) return true;
  }

  // King (adjacency)
  for (const offset of KING_OFFSETS) {
    const from = square + offset;
    if (onBoard(from) && board[from] === (white ? 'K' : 'k')) return true;
  }

  // Sliding: rooks/queens
  for (const offset of ROOK_OFFSETS) {
    for (let from = square + offset; onBoard(from); from += offset) {
      const piece = board[from];
      if (!piece) continue;
      if (white ? (piece === 'R' || piece === 'Q') : (piece === 'r' || piece === 'q')) return true;
      break;
    }
  }

  // Sliding: bishops/queens
  for (const offset of BISHOP_OFFSETS) {
    for (let from = square + offset; onBoard(from); from += offset) {
      const piece = board[from];
      if (!piece) continue;
      if (white ? (piece === 'B' || piece === 'Q') : (piece === 'b' || piece === 'q')) return true;
      break;
    }
  }

  return false;
}

function emptyBoard() {
  return new Array(128).fill(null);
}

/** Standard material-only draw detection (K vs K, K+B vs K, K+N vs K, K+B vs K+B same colour). */
export function insufficientMaterial(board) {
  const pieces = [];
  for (let i = 0; i < 128; i++) {
    const piece = board[i];
    if (!piece || piece.toLowerCase() === 'k') continue;
    pieces.push({ piece: piece.toLowerCase(), square: i });
  }
  if (pieces.length === 0) return true;
  if (pieces.length === 1 && (pieces[0].piece === 'b' || pieces[0].piece === 'n')) return true;
  if (pieces.length === 2 && pieces.every((p) => p.piece === 'b')) {
    const colour = (sq) => ((sq >> 4) + (sq & 15)) % 2;
    return colour(pieces[0].square) === colour(pieces[1].square);
  }
  return false;
}

export class Chess {
  constructor(fen = START_FEN) {
    this.load(fen);
  }

  load(fen) {
    const parsed = Chess.parseFen(fen);
    if (!parsed) throw new Error(`Invalid FEN: ${fen}`);
    this._board = parsed.board;
    this._turn = parsed.turn;
    this._castling = parsed.castling;
    this._ep = parsed.ep;
    this._halfmove = parsed.halfmove;
    this._fullmove = parsed.fullmove;
    this._history = [];
    this._positionCounts = new Map();
    this._positionCounts.set(this._positionKey(), 1);
    return this;
  }

  static parseFen(fen) {
    if (typeof fen !== 'string') return null;
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) return null;
    const [placement, turn, castling, epRaw, halfRaw = '0', fullRaw = '1'] = parts;
    if (turn !== 'w' && turn !== 'b') return null;

    const board = emptyBoard();
    const rows = placement.split('/');
    if (rows.length !== 8) return null;
    for (let r = 0; r < 8; r++) {
      let file = 0;
      for (const ch of rows[r]) {
        if (/[1-8]/.test(ch)) {
          file += Number(ch);
        } else if (/[prnbqkPRNBQK]/.test(ch)) {
          if (file > 7) return null;
          board[(7 - r) * 16 + file] = ch;
          file += 1;
        } else {
          return null;
        }
      }
      if (file !== 8) return null;
    }

    for (const color of ['w', 'b']) {
      const king = color === 'w' ? 'K' : 'k';
      let count = 0;
      for (let i = 0; i < 128; i++) if (board[i] === king) count++;
      if (count !== 1) return null;
    }

    let castlingFlags = '-';
    if (castling && castling !== '-') {
      castlingFlags = [...new Set(castling.split('').filter((c) => 'KQkq'.includes(c)))].join('');
      if (!castlingFlags) castlingFlags = '-';
    }

    let ep = null;
    if (epRaw && epRaw !== '-') {
      ep = squareToIndex(epRaw);
      if (!onBoard(ep)) return null;
    }

    const halfmove = Number.parseInt(halfRaw, 10);
    const fullmove = Number.parseInt(fullRaw, 10);

    return {
      board,
      turn,
      castling: castlingFlags,
      ep,
      halfmove: Number.isFinite(halfmove) ? halfmove : 0,
      fullmove: Number.isFinite(fullmove) ? fullmove : 1,
    };
  }

  clone() {
    const copy = new Chess(this.fen());
    copy._history = this._history.map((entry) => ({ ...entry, move: entry.move && { ...entry.move } }));
    copy._positionCounts = new Map(this._positionCounts);
    return copy;
  }

  board() {
    const rows = [];
    for (let rank = 7; rank >= 0; rank--) {
      const row = [];
      for (let file = 0; file < 8; file++) {
        row.push(this._board[rank * 16 + file] || null);
      }
      rows.push(row);
    }
    return rows;
  }

  /** Raw 0x88 array (read-only by convention) — used by the UI renderer. */
  rawBoard() {
    return this._board;
  }

  turn() {
    return this._turn;
  }

  fen() {
    const rows = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = '';
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this._board[rank * 16 + file];
        if (piece) {
          if (empty) { row += empty; empty = 0; }
          row += piece;
        } else {
          empty++;
        }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    return [
      rows.join('/'),
      this._turn,
      this._castling,
      this._ep == null ? '-' : indexToSquare(this._ep),
      String(this._halfmove),
      String(this._fullmove),
    ].join(' ');
  }

  kingSquare(color = this._turn) {
    const king = color === 'w' ? 'K' : 'k';
    for (let i = 0; i < 128; i++) if (this._board[i] === king) return i;
    return -1;
  }

  isCheck() {
    const square = this.kingSquare(this._turn);
    return square >= 0 && isAttacked(this._board, square, opposite(this._turn));
  }

  isCheckmate() {
    return this.isCheck() && this._legalMoves().length === 0;
  }

  isStalemate() {
    return !this.isCheck() && this._legalMoves().length === 0;
  }

  isInsufficientMaterial() {
    return insufficientMaterial(this._board);
  }

  isFiftyMoveRule() {
    return this._halfmove >= 100;
  }

  isThreefoldRepetition() {
    return (this._positionCounts.get(this._positionKey()) || 0) >= 3;
  }

  isDraw() {
    return this.isStalemate() || this.isInsufficientMaterial() || this.isFiftyMoveRule() || this.isThreefoldRepetition();
  }

  isGameOver() {
    return this.isCheckmate() || this.isDraw();
  }

  _positionKey() {
    // Piece placement + side + rights + ep file is enough for repetition in practice.
    return this.fen().split(' ').slice(0, 4).join(' ');
  }

  /** Verbose legal moves. */
  moves(options = {}) {
    let moves = this._legalMoves();
    if (options.square) {
      const from = squareToIndex(options.square);
      moves = moves.filter((m) => m.from === from);
    }
    if (options.verbose) return moves;
    return moves.map((m) => this._moveToSan(m, moves));
  }

  _legalMoves() {
    if (this._legalCache) return this._legalCache;
    const pseudo = this._pseudoMoves();
    const legal = [];
    for (const move of pseudo) {
      const undo = this._apply(move);
      const king = this.kingSquare(move.color);
      const inCheck = king >= 0 && isAttacked(this._board, king, opposite(move.color));
      this._revert(undo);
      if (!inCheck) legal.push(move);
    }
    this._legalCache = legal;
    return legal;
  }

  _pseudoMoves() {
    const moves = [];
    const white = this._turn === 'w';
    const dir = white ? 16 : -16;
    const startRank = white ? 1 : 6;
    const promoRank = white ? 7 : 0;

    const push = (move) => moves.push(move);

    for (let from = 0; from < 128; from++) {
      const piece = this._board[from];
      if (!piece || isWhitePiece(piece) !== white) continue;
      const type = piece.toLowerCase();

      if (type === 'p') {
        const one = from + dir;
        if (onBoard(one) && !this._board[one]) {
          this._pushPawn(push, from, one, null, (one >> 4) === promoRank);
          const two = from + dir * 2;
          if ((from >> 4) === startRank && !this._board[two]) {
            push({ from, to: two, piece, color: this._turn, captured: null, promotion: null, castle: null, ep: false, double: true });
          }
        }
        for (const side of [-1, 1]) {
          const to = from + dir + side;
          if (!onBoard(to)) continue;
          const target = this._board[to];
          if (target && isWhitePiece(target) !== white) {
            this._pushPawn(push, from, to, target, (to >> 4) === promoRank);
          } else if (!target && to === this._ep) {
            push({ from, to, piece, color: this._turn, captured: white ? 'p' : 'P', promotion: null, castle: null, ep: true, double: false });
          }
        }
        continue;
      }

      const offsets = type === 'n' ? KNIGHT_OFFSETS
        : type === 'b' ? BISHOP_OFFSETS
          : type === 'r' ? ROOK_OFFSETS
            : type === 'q' ? [...ROOK_OFFSETS, ...BISHOP_OFFSETS]
              : KING_OFFSETS;

      const sliding = type === 'b' || type === 'r' || type === 'q';
      for (const offset of offsets) {
        for (let to = from + offset; onBoard(to); to += offset) {
          const target = this._board[to];
          if (target && isWhitePiece(target) === white) break;
          push({ from, to, piece, color: this._turn, captured: target || null, promotion: null, castle: null, ep: false, double: false });
          if (!sliding) break;
          if (target) break;
        }
      }
    }

    // Castling
    const kingFrom = squareToIndex(white ? 'e1' : 'e8');
    if (this._board[kingFrom] === (white ? 'K' : 'k')) {
      const enemy = opposite(this._turn);
      const kingSafe = !isAttacked(this._board, kingFrom, enemy);
      const rights = this._castling;
      if (kingSafe) {
        if (rights.includes(white ? 'K' : 'k')) {
          const f = squareToIndex(white ? 'f1' : 'f8');
          const g = squareToIndex(white ? 'g1' : 'g8');
          if (!this._board[f] && !this._board[g]
            && !isAttacked(this._board, f, enemy) && !isAttacked(this._board, g, enemy)) {
            push({ from: kingFrom, to: g, piece: white ? 'K' : 'k', color: this._turn, captured: null, promotion: null, castle: 'k', ep: false, double: false });
          }
        }
        if (rights.includes(white ? 'Q' : 'q')) {
          const d = squareToIndex(white ? 'd1' : 'd8');
          const c = squareToIndex(white ? 'c1' : 'c8');
          const b = squareToIndex(white ? 'b1' : 'b8');
          if (!this._board[d] && !this._board[c] && !this._board[b]
            && !isAttacked(this._board, d, enemy) && !isAttacked(this._board, c, enemy)) {
            push({ from: kingFrom, to: c, piece: white ? 'K' : 'k', color: this._turn, captured: null, promotion: null, castle: 'q', ep: false, double: false });
          }
        }
      }
    }

    return moves;
  }

  _pushPawn(push, from, to, captured, promote) {
    if (!promote) {
      push({ from, to, piece: this._turn === 'w' ? 'P' : 'p', color: this._turn, captured, promotion: null, castle: null, ep: false, double: false });
      return;
    }
    for (const promotion of PROMOTION_PIECES) {
      push({
        from,
        to,
        piece: this._turn === 'w' ? 'P' : 'p',
        color: this._turn,
        captured,
        promotion: this._turn === 'w' ? promotion.toUpperCase() : promotion,
        castle: null,
        ep: false,
        double: false,
      });
    }
  }

  _apply(move) {
    const undo = {
      move,
      board: this._board.slice(),
      turn: this._turn,
      castling: this._castling,
      ep: this._ep,
      halfmove: this._halfmove,
      fullmove: this._fullmove,
    };

    this._board[move.to] = move.promotion || move.piece;
    this._board[move.from] = null;

    if (move.ep) {
      const capturedSquare = move.to + (move.color === 'w' ? -16 : 16);
      this._board[capturedSquare] = null;
    }

    if (move.castle) {
      const white = move.color === 'w';
      if (move.castle === 'k') {
        const rookFrom = squareToIndex(white ? 'h1' : 'h8');
        const rookTo = squareToIndex(white ? 'f1' : 'f8');
        this._board[rookTo] = this._board[rookFrom];
        this._board[rookFrom] = null;
      } else {
        const rookFrom = squareToIndex(white ? 'a1' : 'a8');
        const rookTo = squareToIndex(white ? 'd1' : 'd8');
        this._board[rookTo] = this._board[rookFrom];
        this._board[rookFrom] = null;
      }
    }

    // Castling rights
    let rights = this._castling === '-' ? '' : this._castling;
    if (move.piece.toLowerCase() === 'k') {
      rights = rights.replace(move.color === 'w' ? /[KQ]/g : /[kq]/g, '');
    }
    const corners = [
      { square: squareToIndex('h1'), flag: 'K' },
      { square: squareToIndex('a1'), flag: 'Q' },
      { square: squareToIndex('h8'), flag: 'k' },
      { square: squareToIndex('a8'), flag: 'q' },
    ];
    for (const { square, flag } of corners) {
      if (move.from === square || move.to === square) rights = rights.replace(flag, '');
    }
    this._castling = rights || '-';

    this._ep = move.double ? move.from + (move.color === 'w' ? 16 : -16) : null;
    this._halfmove = (move.piece.toLowerCase() === 'p' || move.captured) ? 0 : this._halfmove + 1;
    if (move.color === 'b') this._fullmove += 1;
    this._turn = opposite(this._turn);
    this._legalCache = null;
    return undo;
  }

  _revert(undo) {
    this._board = undo.board;
    this._turn = undo.turn;
    this._castling = undo.castling;
    this._ep = undo.ep;
    this._halfmove = undo.halfmove;
    this._fullmove = undo.fullmove;
    this._legalCache = null;
  }

  _moveToSan(move, legalMoves, resolved) {
    if (move.castle === 'k') return 'O-O';
    if (move.castle === 'q') return 'O-O-O';

    const type = move.piece.toLowerCase();
    const destination = indexToSquare(move.to);
    const isCapture = !!move.captured;
    let san = '';

    if (type === 'p') {
      if (isCapture) san += FILES[move.from & 15] + 'x';
      san += destination;
      if (move.promotion) san += '=' + move.promotion.toUpperCase();
    } else {
      san += type.toUpperCase();

      const rivals = legalMoves.filter((candidate) => candidate !== move
        && candidate.to === move.to
        && candidate.piece.toLowerCase() === type
        && candidate.from !== move.from);

      if (rivals.length > 0) {
        const sameFile = rivals.some((candidate) => (candidate.from & 15) === (move.from & 15));
        const sameRank = rivals.some((candidate) => (candidate.from >> 4) === (move.from >> 4));
        if (!sameFile) san += FILES[move.from & 15];
        else if (!sameRank) san += String((move.from >> 4) + 1);
        else san += indexToSquare(move.from);
      }

      if (isCapture) san += 'x';
      san += destination;
    }

    if (resolved) {
      san += resolved.suffix || '';
    }
    return san;
  }

  /**
   * Play a move. Accepts SAN ("Nf3", "O-O", "exd8=Q"), UCI ("g1f3", "e7e8q"),
   * or an object {from:'e2', to:'e4', promotion:'q'}.
   * Returns the played move (with .san) or null when illegal. Illegal input
   * never mutates the position.
   */
  move(input) {
    const legal = this._legalMoves();
    const match = this._findLegalMove(input, legal);
    if (!match) return null;

    const sanBase = this._moveToSan(match, legal);
    const undo = this._apply(match);

    const suffix = this.isCheckmate() ? '#' : this.isCheck() ? '+' : '';
    const san = sanBase + suffix;

    const recorded = { ...match, san, fromSquare: indexToSquare(match.from), toSquare: indexToSquare(match.to) };
    this._history.push({ ...undo, move: recorded });
    const key = this._positionKey();
    this._positionCounts.set(key, (this._positionCounts.get(key) || 0) + 1);
    return recorded;
  }

  _findLegalMove(input, legal) {
    if (!input) return null;

    if (typeof input === 'object' && input.from && input.to) {
      const from = squareToIndex(input.from);
      const to = squareToIndex(input.to);
      const promotion = (input.promotion || '').toLowerCase() || null;
      return legal.find((m) => m.from === from && m.to === to
        && (promotion ? m.promotion && m.promotion.toLowerCase() === promotion : true)) || null;
    }

    if (typeof input !== 'string') return null;
    let text = input.trim().replace(/\s+/g, '');
    if (!text) return null;

    // Castling with zeros (common in PGN exports)
    text = text.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');

    // UCI coordinates
    const uci = text.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
    if (uci) {
      const from = squareToIndex(uci[1].toLowerCase());
      const to = squareToIndex(uci[2].toLowerCase());
      const promotion = uci[3] ? uci[3].toLowerCase() : null;
      return legal.find((m) => m.from === from && m.to === to
        && (promotion ? m.promotion && m.promotion.toLowerCase() === promotion : true)) || null;
    }

    // SAN: compare against generated SAN for every legal move (no check suffix).
    const normalized = text.replace(/[+#!?]+$/, '').replace(/[^a-zA-Z0-9=x-]/g, '');
    for (const candidate of legal) {
      const san = this._moveToSan(candidate, legal);
      if (san.replace(/[+#]$/, '') === normalized) return candidate;
    }
    return null;
  }

  undo() {
    const last = this._history.pop();
    if (!last) return null;
    const key = this._positionKey();
    const count = (this._positionCounts.get(key) || 1) - 1;
    if (count <= 0) this._positionCounts.delete(key);
    else this._positionCounts.set(key, count);

    this._board = last.board;
    this._turn = last.turn;
    this._castling = last.castling;
    this._ep = last.ep;
    this._halfmove = last.halfmove;
    this._fullmove = last.fullmove;
    this._legalCache = null;
    return last.move;
  }

  history(options = {}) {
    const entries = this._history.map((entry) => ({ ...entry.move }));
    if (options.verbose) return entries;
    return entries.map((entry) => entry.san);
  }

  /** Move list as ["1. e4 e5", "2. Nf3 ..."] pairs. */
  pgnMoves() {
    const sans = this.history();
    const pairs = [];
    for (let i = 0; i < sans.length; i += 2) {
      const number = Math.floor(i / 2) + 1;
      pairs.push(`${number}. ${sans[i]}${sans[i + 1] ? ' ' + sans[i + 1] : ''}`);
    }
    return pairs;
  }

  status() {
    if (this.isCheckmate()) return { over: true, result: this._turn === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
    if (this.isStalemate()) return { over: true, result: '1/2-1/2', reason: 'stalemate' };
    if (this.isInsufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'insufficient material' };
    if (this.isFiftyMoveRule()) return { over: true, result: '1/2-1/2', reason: 'fifty-move rule' };
    if (this.isThreefoldRepetition()) return { over: true, result: '1/2-1/2', reason: 'threefold repetition' };
    return { over: false, result: '*', reason: this.isCheck() ? 'check' : null };
  }

  ascii() {
    const lines = ['  +------------------------+'];
    for (let rank = 7; rank >= 0; rank--) {
      const cells = [];
      for (let file = 0; file < 8; file++) {
        const piece = this._board[rank * 16 + file];
        cells.push(piece || '.');
      }
      lines.push(`${rank + 1} | ${cells.join('  ')} |`);
    }
    lines.push('  +------------------------+');
    lines.push('    a  b  c  d  e  f  g  h');
    return lines.join('\n');
  }

  /** Static evaluation in centipawns, positive = white better. Material + piece-square tables. */
  evaluate() {
    let score = 0;
    let whiteBishops = 0;
    let blackBishops = 0;

    for (let i = 0; i < 128; i++) {
      const piece = this._board[i];
      if (!piece) continue;
      const type = piece.toLowerCase();
      const white = isWhitePiece(piece);
      const file = i & 15;
      const rank = i >> 4;
      const tableIndex = white ? (7 - rank) * 8 + file : rank * 8 + file;
      const bonus = PIECE_SQUARE[type] ? PIECE_SQUARE[type][tableIndex] : 0;

      if (type === 'b') white ? whiteBishops++ : blackBishops++;
      score += (white ? 1 : -1) * (PIECE_VALUE[type] + bonus);
    }

    if (whiteBishops >= 2) score += 30;
    if (blackBishops >= 2) score -= 30;
    return score;
  }
}

// Tables are written rank-8-first (index 0 = a8); evaluate() mirrors them for black.
const PIECE_SQUARE = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

/**
 * Minimal alpha-beta engine, strong enough to be a fair "play against the
 * profile owner" opponent without shipping a native Stockfish binary.
 * Deterministic; callers can add randomness for variety.
 */
export function findBestMove(chess, { depth = 3, random = null } = {}) {
  const legal = chess._legalMoves();
  if (legal.length === 0) return null;

  const ordered = [...legal].sort((a, b) => captureScore(b) - captureScore(a));
  const maximize = chess.turn() === 'w';
  let best = ordered[0];
  let bestScore = maximize ? -Infinity : Infinity;

  for (const move of ordered) {
    const undo = chess._apply(move);
    // Noise breaks ties so repeat visits are not identical games. Mean zero,
    // so it never systematically weakens the chosen move.
    const noise = random ? (random() - 0.5) * 6 : 0;
    const score = -negamax(chess, depth - 1, -Infinity, Infinity) + noise;
    chess._revert(undo);

    if (maximize ? score > bestScore : score < bestScore) {
      bestScore = score;
      best = move;
    }
  }

  const legalAgain = chess._legalMoves();
  return legalAgain.find((m) => m.from === best.from && m.to === best.to
    && (m.promotion || '') === (best.promotion || '')) || legalAgain[0] || null;
}

function captureScore(move) {
  if (!move.captured) return move.promotion ? 800 : 0;
  return PIECE_VALUE[move.captured.toLowerCase()] * 10 - PIECE_VALUE[move.piece.toLowerCase()];
}

function negamax(chess, depth, alpha, beta) {
  const legal = chess._legalMoves();
  if (legal.length === 0) {
    // Mate or stalemate. Prefer faster mates when winning, slower mates when losing.
    return chess.isCheck() ? -100000 + (10 - depth) : 0;
  }
  if (depth <= 0) return quiesce(chess, alpha, beta, 0);

  const ordered = [...legal].sort((a, b) => captureScore(b) - captureScore(a));
  let bestScore = -Infinity;
  for (const move of ordered) {
    const undo = chess._apply(move);
    const score = -negamax(chess, depth - 1, -beta, -alpha);
    chess._revert(undo);
    if (score > bestScore) bestScore = score;
    if (bestScore > alpha) alpha = bestScore;
    if (alpha >= beta) break;
  }
  return bestScore;
}

/** Capture-only search so the engine does not stop counting right after a trade. */
function quiesce(chess, alpha, beta, depth) {
  const standPat = chess.turn() === 'w' ? chess.evaluate() : -chess.evaluate();
  if (depth > 4) return standPat;
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;

  const tactical = chess._legalMoves()
    .filter((move) => move.captured || move.promotion)
    .sort((a, b) => captureScore(b) - captureScore(a));

  for (const move of tactical) {
    const undo = chess._apply(move);
    const score = -quiesce(chess, -beta, -alpha, depth + 1);
    chess._revert(undo);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

/** Play a full game between the engine and itself — used by the test-suite as a sanity check. */
export function selfPlay({ plies = 40, depth = 2 } = {}) {
  const chess = new Chess();
  const moves = [];
  for (let i = 0; i < plies && !chess.isGameOver(); i++) {
    const best = findBestMove(chess, { depth });
    if (!best) break;
    const played = chess.move({ from: indexToSquare(best.from), to: indexToSquare(best.to), promotion: best.promotion });
    if (!played) break;
    moves.push(played.san);
  }
  return { chess, moves };
}
