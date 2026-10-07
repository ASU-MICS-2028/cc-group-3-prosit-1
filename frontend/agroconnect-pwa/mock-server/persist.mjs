import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { snapshotOf } from './store.mjs'

const DATA_DIR = fileURLToPath(new URL('./.mock-data/', import.meta.url))
export const STATE_FILE = `${DATA_DIR}state.json`
export const KEYS_FILE = `${DATA_DIR}keys.json`

export async function readSnapshot(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

/** Writes the store to `file` shortly after the last change, through a temp file so a crash cannot leave half a file. */
export function createSaver(file, store, delayMs = 150) {
  let timer
  let queue = Promise.resolve()

  const write = () => {
    queue = queue.then(async () => {
      await mkdir(dirname(file), { recursive: true })
      await writeFile(`${file}.tmp`, JSON.stringify(snapshotOf(store)))
      await rename(`${file}.tmp`, file)
    })
    return queue
  }

  return {
    schedule() {
      clearTimeout(timer)
      timer = setTimeout(write, delayMs)
      timer.unref?.()
    },
    async flush() {
      clearTimeout(timer)
      await write()
    },
  }
}

export const resetData = () => rm(DATA_DIR, { recursive: true, force: true })
