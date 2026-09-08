# App icon

`icon.svg` is built from the Lucide `book-open-text` glyph, the same icon set the
interface already uses (`lucide-react`), on the ArcLight ink tile in brand amber.
Lucide is ISC licensed. `icon.png` is the 1024px render electron-builder consumes;
regenerate it with:

    qlmanage -t -s 1024 -o build build/icon.svg && mv build/icon.svg.png build/icon.png
