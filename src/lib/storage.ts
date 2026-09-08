import type { PaperWorkspace } from '../types/paper'

const keyForPaper = (paperId: string) => `arclight:paper:${encodeURIComponent(paperId)}`

export function emptyWorkspace(): PaperWorkspace {
  return { version: 1, highlights: [], transforms: [], chat: [] }
}

export function loadWorkspace(paperId: string): PaperWorkspace {
  try {
    const parsed = JSON.parse(localStorage.getItem(keyForPaper(paperId)) ?? 'null')
    // A record written before summaries moved inline still carries `notes`; it is
    // simply ignored rather than treated as invalid.
    if (parsed?.version !== 1 || !Array.isArray(parsed.highlights) || !Array.isArray(parsed.chat)) {
      return emptyWorkspace()
    }
    return {
      version: 1,
      highlights: parsed.highlights,
      // Only finished transforms are restored: a pending one would sit forever
      // saying "condensing", and a failed one has nothing to show.
      transforms: Array.isArray(parsed.transforms)
        ? parsed.transforms.filter((entry: { status?: unknown }) => entry?.status === 'complete')
        : [],
      chat: parsed.chat,
    }
  } catch {
    return emptyWorkspace()
  }
}

export function saveWorkspace(paperId: string, workspace: PaperWorkspace): boolean {
  try {
    localStorage.setItem(keyForPaper(paperId), JSON.stringify(workspace))
    return true
  } catch {
    return false
  }
}
