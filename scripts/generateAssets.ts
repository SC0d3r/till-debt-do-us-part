import { createCanvas } from 'canvas'
import * as fs from 'fs'
import * as path from 'path'

const SIZE = 128

function save(dir: string, name: string, drawFn: (ctx: CanvasRenderingContext2D) => void, size = SIZE) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  drawFn(ctx)
  const buf = canvas.toBuffer('image/png')
  fs.writeFileSync(path.join('public/assets', dir, `${name}.png`), buf)
  console.log(`Generated: ${dir}/${name}.png`)
}

save('buildings', 'house', (ctx) => {
  ctx.fillStyle = '#a0522d'
  ctx.beginPath()
  ctx.moveTo(64, 20)
  ctx.lineTo(110, 45)
  ctx.lineTo(110, 90)
  ctx.lineTo(64, 115)
  ctx.lineTo(18, 90)
  ctx.lineTo(18, 45)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#7a3a1a'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#c06030'
  ctx.beginPath()
  ctx.moveTo(64, 10)
  ctx.lineTo(115, 40)
  ctx.lineTo(64, 55)
  ctx.lineTo(13, 40)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#8a4020'
  ctx.stroke()
  ctx.fillStyle = '#4a2a10'
  ctx.fillRect(52, 70, 24, 30)
  ctx.fillStyle = '#87ceeb'
  ctx.fillRect(30, 55, 14, 14)
  ctx.fillRect(84, 55, 14, 14)
  ctx.strokeStyle = '#5a3a1a'
  ctx.lineWidth = 1
  ctx.strokeRect(30, 55, 14, 14)
  ctx.strokeRect(84, 55, 14, 14)
})

save('buildings', 'shop', (ctx) => {
  ctx.fillStyle = '#4682b4'
  ctx.beginPath()
  ctx.moveTo(64, 25)
  ctx.lineTo(108, 48)
  ctx.lineTo(108, 88)
  ctx.lineTo(64, 112)
  ctx.lineTo(20, 88)
  ctx.lineTo(20, 48)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#2a5a8a'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#5a9ad4'
  ctx.beginPath()
  ctx.moveTo(64, 15)
  ctx.lineTo(112, 42)
  ctx.lineTo(64, 56)
  ctx.lineTo(16, 42)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffd700'
  ctx.font = 'bold 16px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('$', 64, 78)
  ctx.fillStyle = '#2a4a6a'
  ctx.fillRect(50, 72, 28, 28)
  ctx.fillStyle = '#87ceeb'
  ctx.fillRect(28, 58, 16, 16)
  ctx.fillRect(84, 58, 16, 16)
})

save('buildings', 'mine', (ctx) => {
  ctx.fillStyle = '#2f2f2f'
  ctx.beginPath()
  ctx.moveTo(64, 30)
  ctx.lineTo(105, 52)
  ctx.lineTo(105, 92)
  ctx.lineTo(64, 114)
  ctx.lineTo(23, 92)
  ctx.lineTo(23, 52)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#1a1a1a'
  ctx.beginPath()
  ctx.ellipse(64, 75, 22, 16, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#444'
  ctx.beginPath()
  ctx.moveTo(42, 52)
  ctx.lineTo(64, 30)
  ctx.lineTo(86, 52)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#666'
  for (let i = 0; i < 6; i++) {
    const x = 30 + Math.random() * 68
    const y = 55 + Math.random() * 40
    ctx.beginPath()
    ctx.arc(x, y, 2 + Math.random() * 3, 0, Math.PI * 2)
    ctx.fill()
  }
})

const cropColors: Record<string, { base: string; leaf: string; ripe: string }> = {
  turnip: { base: '#e8d8f0', leaf: '#4a8e3a', ripe: '#d0b8e0' },
  potato: { base: '#c8a86e', leaf: '#3a7e2a', ripe: '#b89858' },
  tomato: { base: '#e84040', leaf: '#3a8e2a', ripe: '#ff3030' },
  corn: { base: '#f0d040', leaf: '#4a9e3a', ripe: '#ffe030' },
  flower: { base: '#d070e0', leaf: '#3a7e3a', ripe: '#e080f0' },
  rare: { base: '#70d0ff', leaf: '#2a6e4a', ripe: '#90e0ff' },
}

for (const [cropId, colors] of Object.entries(cropColors)) {
  for (let stage = 0; stage < 4; stage++) {
    save('crops', `${cropId}_${stage}`, (ctx) => {
      const cx = 64, cy = 90
      if (stage === 0) {
        ctx.fillStyle = colors.leaf
        ctx.beginPath()
        ctx.ellipse(cx, cy - 5, 4, 6, 0, 0, Math.PI * 2)
        ctx.fill()
      } else if (stage === 1) {
        ctx.fillStyle = colors.leaf
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.quadraticCurveTo(cx - 10, cy - 20, cx - 6, cy - 30)
        ctx.quadraticCurveTo(cx, cy - 25, cx + 6, cy - 30)
        ctx.quadraticCurveTo(cx + 10, cy - 20, cx, cy)
        ctx.fill()
      } else if (stage === 2) {
        ctx.fillStyle = colors.leaf
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath()
          ctx.moveTo(cx + i * 8, cy)
          ctx.quadraticCurveTo(cx + i * 14, cy - 25, cx + i * 10, cy - 40)
          ctx.quadraticCurveTo(cx + i * 4, cy - 30, cx + i * 8, cy)
          ctx.fill()
        }
        ctx.fillStyle = colors.base
        ctx.globalAlpha = 0.5
        ctx.beginPath()
        ctx.arc(cx, cy - 20, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      } else {
        ctx.fillStyle = colors.leaf
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath()
          ctx.moveTo(cx + i * 10, cy)
          ctx.quadraticCurveTo(cx + i * 18, cy - 30, cx + i * 12, cy - 48)
          ctx.quadraticCurveTo(cx + i * 4, cy - 35, cx + i * 10, cy)
          ctx.fill()
        }
        ctx.fillStyle = colors.ripe
        ctx.beginPath()
        ctx.arc(cx, cy - 25, 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.globalAlpha = 0.3
        ctx.beginPath()
        ctx.arc(cx - 3, cy - 28, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }, SIZE)
  }
}

save('player', 'character', (ctx) => {
  const cx = 64, by = 110
  ctx.fillStyle = '#3366cc'
  ctx.fillRect(cx - 10, by - 30, 20, 20)
  ctx.fillStyle = '#ffcc99'
  ctx.beginPath()
  ctx.arc(cx, by - 38, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#663300'
  ctx.beginPath()
  ctx.arc(cx, by - 42, 10, Math.PI, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#222'
  ctx.beginPath()
  ctx.arc(cx - 3, by - 38, 1.5, 0, Math.PI * 2)
  ctx.arc(cx + 3, by - 38, 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffcc99'
  ctx.fillRect(cx - 16, by - 28, 6, 14)
  ctx.fillRect(cx + 10, by - 28, 6, 14)
  ctx.fillStyle = '#4444aa'
  ctx.fillRect(cx - 8, by - 10, 7, 12)
  ctx.fillRect(cx + 1, by - 10, 7, 12)
  ctx.fillStyle = '#553311'
  ctx.fillRect(cx - 9, by, 8, 4)
  ctx.fillRect(cx + 1, by, 8, 4)
}, SIZE)

const items = [
  { id: 'ore_copper', color: '#b87333', label: 'Cu' },
  { id: 'ore_iron', color: '#c0c0c0', label: 'Fe' },
  { id: 'ore_gold', color: '#ffd700', label: 'Au' },
  { id: 'gem_ruby', color: '#e0115f', label: '♦' },
  { id: 'gem_sapphire', color: '#0f52ba', label: '♦' },
  { id: 'fossil', color: '#d2b48c', label: '🦴' },
  { id: 'seed_star', color: '#90e0ff', label: '★' },
]

for (const item of items) {
  save('items', item.id, (ctx) => {
    const cx = 64, cy = 64
    ctx.fillStyle = item.color
    ctx.beginPath()
    ctx.arc(cx, cy, 18, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.4
    ctx.beginPath()
    ctx.arc(cx - 5, cy - 5, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 14px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(item.label, cx, cy + 1)
  }, SIZE)
}

console.log('All assets generated!')
