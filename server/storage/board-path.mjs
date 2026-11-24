import { join } from "node:path"

export function boardDatabasePath(profileDir) {
  return join(profileDir, "task-board", "board.sqlite")
}
