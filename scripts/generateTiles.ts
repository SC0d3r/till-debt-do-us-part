import { createCanvas } from 'canvas'
import * as fs from 'fs'
import * as path from 'path'

const SIZE = 64
const HALF = SIZE / 2

function createIsoCanvas(): ReturnType<typeof createCanvas> {
  return createCanvas(SIZE, SIZE)
}

function drawDiamond(ctx: CanvasRenderingContext2D, color: string, borderColor?: string) {
  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.beginPath()
  ctx.moveTo(HALF, 4)
  ctx.lineTo(SIZE - 4, HALF)
  ctx.lineTo(HALF, SIZE - 4)
  ctx.lineTo(4, HALF)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  if (borderColor) {
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

function addNoise(ctx: CanvasRenderingContext2D, intensity = 20) {
  const imageData = ctx.getImageData(0, 0, SIZE, SIZE)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const noise = (Math.random() - 0.5) * intensity
    data[i] = Math.max(0, Math.min(255, data[i] + noise))
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise))
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise))
  }
  ctx.putImageData(imageData, 0, 0)
}

function saveTile(name: string, drawFn: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = createIsoCanvas()
  const ctx = canvas.getContext('2d')
  drawFn(ctx)
  const buf = canvas.toBuffer('image/png')
  fs.writeFileSync(path.join('public/assets/tiles', `${name}.png`), buf)
  console.log(`Generated: tiles/${name}.png`)
}

saveTile('grass', (ctx) => {
  drawDiamond(ctx, '#4a7c3f', '#3a6830')
  addNoise(ctx, 15)
  ctx.fillStyle = '#5a9050'
  for (let i = 0; i < 8; i++) {
    const x = 15 + Math.random() * 34
    const y = 15 + Math.random() * 34
    ctx.fillRect(x, y, 2, 2)
  }
})

saveTile('dirt', (ctx) => {
  drawDiamond(ctx, '#8b6914', '#7a5a10')
  addNoise(ctx, 20)
})

saveTile('tilled', (ctx) => {
  drawDiamond(ctx, '#6b4e1a', '#5a4015')
  addNoise(ctx, 10)
  ctx.strokeStyle = '#5a3e10'
  ctx.lineWidth = 1
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath()
    ctx.moveTo(HALF + i * 6 - 10, HALF + i * 3 - 5)
    ctx.lineTo(HALF + i * 6 + 10, HALF + i * 3 + 5)
    ctx.stroke()
  }
})

saveTile('watered', (ctx) => {
  drawDiamond(ctx, '#4a3a10', '#3a2a08')
  addNoise(ctx, 8)
  ctx.fillStyle = 'rgba(100,150,200,0.3)'
  ctx.beginPath()
  ctx.moveTo(HALF, 10)
  ctx.lineTo(SIZE - 10, HALF)
  ctx.lineTo(HALF, SIZE - 10)
  ctx.lineTo(10, HALF)
  ctx.closePath()
  ctx.fill()
})

saveTile('rock', (ctx) => {
  drawDiamond(ctx, '#888888', '#666666')
  addNoise(ctx, 25)
  ctx.fillStyle = '#aaaaaa'
  ctx.beginPath()
  ctx.arc(HALF - 5, HALF - 3, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#777777'
  ctx.beginPath()
  ctx.arc(HALF + 4, HALF + 2, 5, 0, Math.PI * 2)
  ctx.fill()
})

saveTile('weed', (ctx) => {
  drawDiamond(ctx, '#3a6e2a', '#2a5e1a')
  addNoise(ctx, 12)
  ctx.strokeStyle = '#4a8e3a'
  ctx.lineWidth = 2
  for (let i = 0; i < 5; i++) {
    const bx = HALF + (Math.random() - 0.5) * 20
    const by = HALF + (Math.random() - 0.5) * 10
    ctx.beginPath()
    ctx.moveTo(bx, by + 5)
    ctx.quadraticCurveTo(bx + (Math.random() - 0.5) * 8, by - 8, bx + (Math.random() - 0.5) * 6, by - 12)
    ctx.stroke()
  }
})

saveTile('stump', (ctx) => {
  drawDiamond(ctx, '#6b4226', '#5a3520')
  addNoise(ctx, 15)
  ctx.fillStyle = '#8b5a36'
  ctx.beginPath()
  ctx.ellipse(HALF, HALF - 2, 8, 5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#a07050'
  ctx.beginPath()
  ctx.ellipse(HALF, HALF - 4, 6, 3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#5a3520'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.ellipse(HALF, HALF - 4, 3, 1.5, 0, 0, Math.PI * 2)
  ctx.stroke()
})

saveTile('path', (ctx) => {
  drawDiamond(ctx, '#c2b280', '#b0a070')
  addNoise(ctx, 18)
  ctx.fillStyle = '#d0c090'
  for (let i = 0; i < 5; i++) {
    const x = 18 + Math.random() * 28
    const y = 18 + Math.random() * 28
    ctx.beginPath()
    ctx.arc(x, y, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
})

console.log('All tiles generated!')
