export type ThemeName = 'dark' | 'dim' | 'light'

export interface PaperMetadata {
  id: string
  title: string
  authors: string[]
  abstract: string
  published?: string
  categories: string[]
  sourceUrl: string
  pdfUrl: string
}

export interface PaperSection {
  id: string
  title: string
  depth: number
}

export interface AcronymDefinition {
  acronym: string
  expansion: string
}

export interface PaperDocument {
  id: string
  metadata: PaperMetadata
  html: string
  outline: PaperSection[]
  plainText: string
  acronyms: AcronymDefinition[]
  importedAt: string
  isSample?: boolean
}

export interface SerializedSelection {
  start: number
  end: number
  quote: string
  sectionId?: string
  sectionTitle?: string
}

export interface SavedHighlight extends SerializedSelection {
  id: string
  createdAt: string
}

// A summary or bullet list rendered in place of the passage it condenses, saved with
// the paper so it is still there next time it is opened.
export interface InlineTransform {
  id: string
  kind: 'summarize' | 'bullets' | 'simplify'
  start: number
  end: number
  quote: string
  sectionTitle?: string
  answer: string
  status: 'pending' | 'complete' | 'error'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  contextQuote?: string
  contextSectionTitle?: string
  status?: 'complete' | 'error'
  // A passage Arc cited, which the reader can jump to in the article.
  showQuote?: string
}

export interface PaperWorkspace {
  version: 1
  highlights: SavedHighlight[]
  transforms: InlineTransform[]
  chat: ChatMessage[]
}

export interface AIRequest {
  action: 'summarize' | 'bullets' | 'simplify' | 'chat'
  paper: {
    id: string
    title: string
    abstract: string
    plainText: string
  }
  selection?: {
    quote: string
    sectionTitle?: string
  }
  question?: string
  history?: Pick<ChatMessage, 'role' | 'content'>[]
}
