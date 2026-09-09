# App icon

`icon.svg` is built from the Lucide `book-open-text` glyph — the same icon set the
interface uses via `lucide-react` — on the ArcLight ink tile in brand amber. Lucide
is ISC licensed.

`icon.png` is the 1024px render electron-builder consumes. Regenerate it with:

    sips -s format png build/icon.svg --out build/icon.png

Use `sips`, not `qlmanage -t`. qlmanage renders thumbnails onto a white document
background, so the transparent margin came out opaque white and the Dock showed the
dark tile framed inside a white one.
