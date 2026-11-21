const characterTravelMs = 240
const posterGatherMs = 900

function drawPosterPieces(ctx, poster, progress, positions)
{
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (!positions && progress === 1) ctx.clip(poster.path, 'evenodd')
  for (const [i, piece] of poster.pieces.entries())
  {
    const t = positions ? positions[i] : progress
    ctx.save()
    const slot = piece.slot
    ctx.translate(slot.x + (piece.x - slot.x) * t, slot.y + (piece.y - slot.y) * t)
    ctx.rotate(slot.angle + (piece.targetAngle - slot.angle) * t)
    const scale = piece.scatterScale + (1 - piece.scatterScale) * t
    ctx.scale(piece.stretch * scale, scale)
    ctx.fillStyle = piece.color
    ctx.font = piece.font
    ctx.fillText(piece.text, -piece.inkCenterX * (1 - t), -piece.inkCenterY * (1 - t))
    ctx.restore()
  }
}

function matchScatterSlots(pieces, previousPieces)
{
  const slots = previousPieces.map(piece => piece.slot)
  // Match every item on the shorter side. Give prominent glyphs first choice.
  const matchSlots = slots.length < pieces.length
  const fixed = matchSlots ? slots : [...pieces]
  const available = matchSlots ? [...pieces] : slots
  fixed.sort((a, b) => b.inkWidth * b.inkHeight - a.inkWidth * a.inkHeight)
  for (const item of fixed)
  {
    let best = 0, bestCost = Infinity
    for (let i = 0; i < available.length; i++)
    {
      const candidate = available[i]
      const dw = Math.log(candidate.inkWidth / item.inkWidth)
      const dh = Math.log(candidate.inkHeight / item.inkHeight)
      const cost = Math.abs(dw) + Math.abs(dh) + Math.abs(dw - dh)
      if (cost < bestCost) { best = i; bestCost = cost }
      if (cost === 0) break
    }
    const [match] = available.splice(best, 1)
    if (matchSlots) match.slot = item
    else item.slot = match
  }
}

function makeTypePoster(shape, passage, palette, keywords, terms, title, language, previousPieces = [])
{
  const width = 240, height = 300
  const mask = document.createElement('canvas')
  mask.width = width
  mask.height = height
  const ink = mask.getContext('2d', { willReadFrequently: true })
  const path = new Path2D(shape)
  ink.fill(path, 'evenodd')
  const pixels = ink.getImageData(0, 0, width, height).data
  const inside = (x, y) => pixels[(y * width + x) * 4 + 3] >= 128
  const pieces = []
  const segmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(language, { granularity: 'grapheme' }) : null

  function addWord(text, cx, cy, size, font, color, angle, keyword, stretch = 1)
  {
    ink.font = font
    const metrics = ink.measureText(text)
    const baseline = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2
    const chars = segmenter ? Array.from(segmenter.segment(text), part => part.segment) : Array.from(text.normalize('NFC'))
    let prefix = ''
    for (const char of chars)
    {
      prefix += char
      if (char === ' ') continue
      const glyph = ink.measureText(char)
      const advance = glyph.width * stretch
      const along = (ink.measureText(prefix).width - metrics.width / 2) * stretch - advance / 2
      pieces.push({
        text: char, font, color, size, advance, stretch, keyword, targetAngle: angle,
        inkWidth: Math.max(1, glyph.actualBoundingBoxLeft + glyph.actualBoundingBoxRight) * stretch,
        inkHeight: Math.max(1, glyph.actualBoundingBoxAscent + glyph.actualBoundingBoxDescent),
        inkCenterX: (glyph.actualBoundingBoxRight - glyph.actualBoundingBoxLeft - glyph.width) / 2,
        inkCenterY: (glyph.actualBoundingBoxDescent - glyph.actualBoundingBoxAscent) / 2,
        x: cx + along * Math.cos(angle) - baseline * Math.sin(angle),
        y: cy + along * Math.sin(angle) + baseline * Math.cos(angle)
      })
    }
  }

  // Each cell covers 2 × 2 poster pixels. The summed-area table checks that the
  // entire word fits inside the silhouette and clears all previously set type.
  const cell = 2, cols = width / cell, rows = height / cell, stride = cols + 1
  const blocked = new Uint8Array(cols * rows)
  const sums = new Uint32Array(stride * (rows + 1))
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      blocked[y * cols + x] = !(inside(x * cell, y * cell) && inside(x * cell + 1, y * cell) &&
                                 inside(x * cell, y * cell + 1) && inside(x * cell + 1, y * cell + 1))

  function updateSums()
  {
    for (let y = 0; y < rows; y++)
    {
      let sum = 0
      for (let x = 0; x < cols; x++)
      {
        sum += blocked[y * cols + x]
        sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + sum
      }
    }
  }
  updateSums()

  function reserve(left, top, w, h)
  {
    for (let y = top; y < top + h; y++)
      blocked.fill(1, y * cols + left, y * cols + left + w)
  }

  function placeBox(w, h, anchorX, anchorY)
  {
    let bestX = -1, bestY = 0, bestDistance = Infinity
    for (let top = 0; top + h <= rows; top++)
    {
      const dy = top + h / 2 - anchorY
      if (dy * dy >= bestDistance) continue
      const upper = top * stride, lower = (top + h) * stride
      for (let left = 0; left + w <= cols; left++)
      {
        const right = left + w
        if (sums[lower + right] - sums[lower + left] - sums[upper + right] + sums[upper + left]) continue
        const distance = (left + w / 2 - anchorX) ** 2 + dy * dy
        if (distance < bestDistance) { bestX = left; bestY = top; bestDistance = distance }
      }
    }
    if (bestX < 0) return null
    reserve(bestX, bestY, w, h)
    updateSums()
    return { x: (bestX + w / 2) * cell, y: (bestY + h / 2) * cell }
  }

  function pack(text, size, font, color, vertical, anchorX, anchorY, keyword)
  {
    ink.font = font
    const m = ink.measureText(text)
    const wordW = Math.ceil((Math.max(m.width, m.actualBoundingBoxRight) + Math.max(0, m.actualBoundingBoxLeft) + 1) / cell)
    const wordH = Math.ceil((m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + 2) / cell)
    const w = vertical ? wordH : wordW, h = vertical ? wordW : wordH
    const spot = placeBox(w, h, anchorX, anchorY)
    if (!spot) return false
    addWord(text, spot.x, spot.y, size, font, color,
            vertical ? -Math.PI / 2 : 0, keyword)
    return true
  }

  ink.textBaseline = 'middle'
  const korean = language === 'ko'
  const displayFace = korean ? 'Jua, sans-serif' : '"Press Start 2P", monospace'
  const bodyFace = korean ? '"Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif' : displayFace
  const bodyWeight = korean ? 600 : 400
  // Fit the complete title first. Keeping its lines together makes the name
  // readable even in a narrow silhouette, such as the pendulum or tunnel.
  const lines = title.split('\n')
  const layouts = lines.length > 1 ? [[lines.join(' ')], lines] : [lines]
  function placeTitle()
  {
    const ax = cols * (0.25 + 0.5 * Math.random()), ay = rows * (0.25 + 0.5 * Math.random())
    for (let size = 27 + Math.floor(8 * Math.random()); size >= 8; size--)
    {
      const font = `400 ${size}px ${displayFace}`
      ink.font = font
      const lineHeight = size * 1.05
      for (const layout of layouts)
      {
        const textWidth = Math.max(...layout.map(line => ink.measureText(line).width))
        const w = Math.ceil((textWidth + 4) / cell)
        const h = Math.ceil((lineHeight * layout.length + 2) / cell)
        const spot = placeBox(w, h, ax, ay)
        if (!spot) continue
        layout.forEach((line, i) => addWord(line, spot.x, spot.y + (i - (layout.length - 1) / 2) * lineHeight,
                                            size, font, palette[0], 0, false))
        return
      }
    }
  }
  placeTitle()
  for (const [i, text] of keywords.entries())
  {
    const ax = cols * Math.random(), ay = rows * Math.random()
    const vertical = Math.random() < 0.3
    for (let size = (i ? 29 : 37) + Math.floor(6 * Math.random()); size >= 10; size -= 1)
    {
      const font = `400 ${size}px ${displayFace}`
      if (pack(text, size, font, palette[0], vertical, ax, ay, true) ||
          pack(text, size, font, palette[0], !vertical, ax, ay, true)) break
    }
  }

  for (const [i, text] of terms.entries())
  {
    const ax = Math.random() * cols, ay = Math.random() * rows
    const vertical = Math.random() < 0.35
    const serif = korean && i % 2 === 1
    const termFace = serif ? '"AppleMyungjo", "Batang", serif' : displayFace
    for (let size = 22 - i; size >= 12; size -= 2)
    {
      const font = `${serif ? 700 : 400} ${size}px ${termFace}`
      if (pack(text, size, font, palette[1], vertical, ax, ay, false) ||
          pack(text, size, font, palette[1], !vertical, ax, ay, false)) break
    }
  }

  // Fit complete README words in the remaining pockets, including vertical gaps.
  const words = [...new Set(passage.match(/[\p{L}\p{N}]+/gu) || [])]
  for (const size of [14, 11])
  {
    for (const [i, text] of words.entries())
    {
      const vertical = Math.random() < 0.35
      const font = `${bodyWeight} ${size}px ${bodyFace}`
      const color = palette[i % 3 === 0 ? 1 : 2]
      const ax = Math.random() * cols, ay = Math.random() * rows
      if (!pack(text, size, font, color, vertical, ax, ay, false))
        pack(text, size, font, color, !vertical, ax, ay, false)
    }
  }

  const copy = passage.trim().replace(/\s+/g, ' ') + ' '
  const letters = segmenter ? Array.from(segmenter.segment(copy), part => part.segment) : Array.from(copy)
  let cursor = 0
  const smallSize = 8
  const smallFont = `${bodyWeight} ${smallSize}px ${bodyFace}`
  const band = Math.ceil((smallSize + 1) / cell)
  const nextChar = () => letters[cursor % letters.length]

  function freeColumns(left, top)
  {
    let x = left
    for (; x < cols; x++)
    {
      let y = top
      while (y < top + band && !blocked[y * cols + x]) y++
      if (y < top + band) break
    }
    return x - left
  }

  ink.font = smallFont
  // Flow consecutive phrases through the remaining interior pockets in reading order.
  for (let top = 0; copy.length > 1 && top + band <= rows; top++)
  {
    for (let left = 0; left < cols;)
    {
      const span = freeColumns(left, top)
      if (span > 0)
      {
        if (nextChar() === ' ') cursor++
        let line = ''
        while (ink.measureText(line + nextChar()).width + 1 <= span * cell)
        {
          line += nextChar()
          cursor++
        }
        line = line.trimEnd()
        if (line)
        {
          const w = Math.ceil((ink.measureText(line).width + 1) / cell)
          reserve(left, top, w, band)
          addWord(line, (left + w / 2) * cell, (top + band / 2) * cell, smallSize, smallFont, palette[2], 0, false)
        }
      }
      left += span + 1
    }
  }

  // Reuse the packing grid for the scattered view, reserving shared slots first.
  matchScatterSlots(pieces, previousPieces)
  blocked.fill(0)
  for (const { slot } of pieces)
  {
    if (slot) reserve(slot.x / cell - slot.w / 2, slot.y / cell - slot.h / 2, slot.w, slot.h)
  }
  updateSums()
  const extra = pieces.filter(piece => !piece.slot)
  extra.sort((a, b) => b.inkWidth * b.inkHeight - a.inkWidth * a.inkHeight)
  for (const piece of extra)
  {
    const angle = (Math.random() - 0.5) * 0.5
    const cos = Math.cos(angle), sin = Math.abs(Math.sin(angle))
    const boxWidth = piece.inkWidth * cos + piece.inkHeight * sin
    const boxHeight = piece.inkWidth * sin + piece.inkHeight * cos
    const ax = Math.random() * cols, ay = Math.random() * rows
    for (let scale = 1; ; scale *= 0.85)
    {
      const w = Math.ceil((boxWidth + 3) * scale / cell)
      const h = Math.ceil((boxHeight + 3) * scale / cell)
      const spot = placeBox(w, h, ax, ay)
      if (!spot)
      {
        if (w === 1 && h === 1) throw new RangeError('Scattered glyphs exceed the poster grid')
        continue
      }
      piece.slot = { ...spot, w, h, angle, inkWidth: piece.inkWidth * scale, inkHeight: piece.inkHeight * scale }
      break
    }
  }
  for (const piece of pieces)
    piece.scatterScale = Math.min(piece.slot.inkWidth / piece.inkWidth, piece.slot.inkHeight / piece.inkHeight)

  // Shuffle the motion separately from the reading order used to draw the poster.
  const motionOrder = [...pieces]
  for (let i = motionOrder.length - 1; i > 0; i--)
  {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = motionOrder[i]
    motionOrder[i] = motionOrder[j]
    motionOrder[j] = swap
  }
  const launchWindowMs = posterGatherMs - characterTravelMs
  const intervals = Math.max(1, motionOrder.length - 1)
  motionOrder.forEach((piece, i) => { piece.startMs = launchWindowMs * i / intervals })
  const poster = { path, pieces }
  function snapshot(progress)
  {
    const surface = document.createElement('canvas')
    surface.width = width * 2
    surface.height = height * 2
    const ctx = surface.getContext('2d')
    ctx.scale(2, 2)
    drawPosterPieces(ctx, poster, progress)
    return surface
  }
  poster.scattered = snapshot(0)
  poster.assembled = snapshot(1)
  return poster
}
