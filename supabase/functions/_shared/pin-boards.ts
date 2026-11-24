// Keeps pin_boards in step with Pinterest without ever deleting a board that
// is still on Pinterest. Scheduled Pins point at pin_boards.id, so replacing
// every row (delete + insert) used to leave each Pin without its board.
//
// No network imports here on purpose: the Supabase client is passed in, so the
// tests run offline with a fake client.
import type { PinterestBoard } from './pinterest.ts';

export interface ExistingBoard {
  id: string;
  board_id: string;
}

export interface BoardRow {
  id?: string;
  account_id?: string;
  board_id: string;
  board_name: string;
  description: string | null;
  pin_count: number;
  follower_count: number;
  privacy: string;
  updated_at: string;
}

// The part of the Supabase client that syncBoards uses.
export interface BoardSyncClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): PromiseLike<{ data: ExistingBoard[] | null; error: unknown }>;
    };
    upsert(rows: BoardRow[], options: { onConflict: string }): PromiseLike<{ error: unknown }>;
    delete(): {
      in(column: string, values: string[]): PromiseLike<{ error: unknown }>;
    };
  };
}

/**
 * Decide what to write. Boards in both lists keep their row id; new boards have
 * no id (the database makes one); boards gone from Pinterest are removed.
 * An empty `fresh` list removes nothing: Pinterest errors come back as [],
 * and wiping every board on a failed fetch is the bug this prevents.
 */
export function planBoardSync(
  existing: ExistingBoard[],
  fresh: PinterestBoard[],
): { upsert: BoardRow[]; removeIds: string[] } {
  if (fresh.length === 0) return { upsert: [], removeIds: [] };

  const idByBoardId = new Map(existing.map((row) => [row.board_id, row.id]));
  const freshIds = new Set(fresh.map((board) => board.id));
  const now = new Date().toISOString();

  const upsert = fresh.map((board): BoardRow => {
    const row: BoardRow = {
      board_id: board.id,
      board_name: board.name,
      description: board.description || null,
      pin_count: board.pin_count || 0,
      follower_count: board.follower_count || 0,
      privacy: board.privacy || 'PUBLIC',
      updated_at: now,
    };
    const rowId = idByBoardId.get(board.id);
    return rowId ? { id: rowId, ...row } : row;
  });

  const removeIds = existing.filter((row) => !freshIds.has(row.board_id)).map((row) => row.id);
  return { upsert, removeIds };
}

/** Update the account's boards in place, then remove the ones Pinterest no longer has. */
export async function syncBoards(
  supabase: BoardSyncClient,
  accountId: string,
  fresh: PinterestBoard[],
): Promise<void> {
  if (fresh.length === 0) return;

  const { data: existing, error: readError } = await supabase
    .from('pin_boards')
    .select('id, board_id')
    .eq('account_id', accountId);
  if (readError) throw new Error(`Could not read existing boards: ${JSON.stringify(readError)}`);

  const { upsert, removeIds } = planBoardSync(existing ?? [], fresh);

  // The id is dropped from the write: the (account_id, board_id) conflict already
  // finds the row, keeps its id, and a batch mixing rows with and without an id
  // would send NULL ids for the new ones.
  const rows = upsert.map((row) => {
    const write = { ...row, account_id: accountId };
    delete write.id;
    return write;
  });
  const { error: upsertError } = await supabase
    .from('pin_boards')
    .upsert(rows, { onConflict: 'account_id,board_id' });
  if (upsertError) throw new Error(`Could not save boards: ${JSON.stringify(upsertError)}`);

  if (removeIds.length > 0) {
    const { error: deleteError } = await supabase.from('pin_boards').delete().in('id', removeIds);
    if (deleteError) throw new Error(`Could not remove old boards: ${JSON.stringify(deleteError)}`);
  }
}
