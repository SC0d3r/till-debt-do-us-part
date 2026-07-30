import { createCanvas } from 'canvas'
import * as fs from 'fs'
import * as path from 'path'

const S = 64
const H = S / 2

function mkCanvas(s = S) { return createCanvas(s, s) }

function diamond(ctx: CanvasRenderingContext2D, color: string, border?: string) {
  ctx.clearRect(0, 0, S, S)
  ctx.beginPath()
  ctx.moveTo(H, 3); ctx.lineTo(S - 3, H); ctx.lineTo(H, S - 3); ctx.lineTo(3, H)
  ctx.closePath()
  ctx.fillStyle = color; ctx.fill()
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1.5; ctx.stroke() }
}

function noise(ctx: CanvasRenderingContext2D, amt = 15) {
  const id = ctx.getImageData(0, 0, S, S), d = id.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i+3] === 0) continue
    const n = (Math.random() - 0.5) * amt
    d[i] = Math.max(0, Math.min(255, d[i]+n))
    d[i+1] = Math.max(0, Math.min(255, d[i+1]+n))
    d[i+2] = Math.max(0, Math.min(255, d[i+2]+n))
  }
  ctx.putImageData(id, 0, 0)
}

function save(dir: string, name: string, fn: (c: CanvasRenderingContext2D) => void, size = S) {
  const cv = mkCanvas(size); const c = cv.getContext('2d'); fn(c)
  fs.writeFileSync(path.join('public/assets', dir, `${name}.png`), cv.toBuffer('image/png'))
  console.log(`  ${dir}/${name}.png`)
}

// TILES
console.log('Generating tiles...')
save('tiles', 'grass', c => { diamond(c, '#5a9e4a', '#4a8a3a'); noise(c, 12); c.fillStyle='#6ab85a'; for(let i=0;i<10;i++){c.fillRect(14+Math.random()*36,14+Math.random()*36,2,2)} })
save('tiles', 'dirt', c => { diamond(c, '#9b7930', '#8a6820'); noise(c, 18) })
save('tiles', 'tilled', c => { diamond(c, '#7b5e20', '#6a4e18'); noise(c, 8); c.strokeStyle='#5a3e10'; c.lineWidth=1; for(let i=-2;i<=2;i++){c.beginPath();c.moveTo(H+i*6-10,H+i*3-5);c.lineTo(H+i*6+10,H+i*3+5);c.stroke()} })
save('tiles', 'watered', c => { diamond(c, '#5a4418', '#4a3410'); noise(c, 6); c.fillStyle='rgba(80,140,200,0.35)'; c.beginPath();c.moveTo(H,8);c.lineTo(S-8,H);c.lineTo(H,S-8);c.lineTo(8,H);c.closePath();c.fill() })
save('tiles', 'path', c => { diamond(c, '#c8b888', '#b8a878'); noise(c, 15); c.fillStyle='#d8c898'; for(let i=0;i<6;i++){c.beginPath();c.arc(16+Math.random()*32,16+Math.random()*32,1.5,0,Math.PI*2);c.fill()} })
save('tiles', 'water', c => { diamond(c, '#4488cc', '#3377bb'); noise(c, 10); c.fillStyle='rgba(255,255,255,0.15)'; c.beginPath();c.ellipse(H,H-4,12,6,0.3,0,Math.PI*2);c.fill() })
save('tiles', 'stump', c => { diamond(c, '#6b4226','#5a3520'); noise(c,12); c.fillStyle='#8b5a36'; c.beginPath();c.ellipse(H,H-2,8,5,0,0,Math.PI*2);c.fill(); c.fillStyle='#a07050'; c.beginPath();c.ellipse(H,H-4,6,3,0,0,Math.PI*2);c.fill() })

// TREE (tall sprite, 64x96)
console.log('Generating trees...')
save('tiles', 'tree', c => {
  // Trunk
  c.fillStyle = '#6b4226'
  c.fillRect(26, 50, 12, 40)
  c.fillStyle = '#5a3520'
  c.fillRect(28, 50, 4, 40)
  // Canopy layers
  const greens = ['#2d7a2d', '#3a8e3a', '#4aa04a', '#3a8e3a']
  for (let i = 0; i < 4; i++) {
    c.fillStyle = greens[i]
    c.beginPath()
    c.ellipse(32, 20 + i * 10, 22 - i * 2, 14 - i, 0, 0, Math.PI * 2)
    c.fill()
  }
  // Highlights
  c.fillStyle = '#5ab85a'
  c.globalAlpha = 0.4
  c.beginPath(); c.ellipse(26, 18, 8, 5, -0.3, 0, Math.PI*2); c.fill()
  c.globalAlpha = 1
}, 64)

save('tiles', 'tree_small', c => {
  c.fillStyle = '#6b4226'
  c.fillRect(28, 40, 8, 24)
  c.fillStyle = '#3a8e3a'
  c.beginPath(); c.ellipse(32, 28, 16, 18, 0, 0, Math.PI*2); c.fill()
  c.fillStyle = '#4aa04a'
  c.beginPath(); c.ellipse(30, 24, 10, 12, 0, 0, Math.PI*2); c.fill()
}, 64)

// STONE
console.log('Generating stones...')
save('tiles', 'stone', c => {
  diamond(c, '#888888', '#666666'); noise(c, 20)
  c.fillStyle = '#aaaaaa'
  c.beginPath(); c.ellipse(H-6, H-4, 10, 7, -0.2, 0, Math.PI*2); c.fill()
  c.fillStyle = '#999999'
  c.beginPath(); c.ellipse(H+5, H+3, 8, 6, 0.3, 0, Math.PI*2); c.fill()
  c.fillStyle = '#777777'
  c.beginPath(); c.ellipse(H-2, H+6, 6, 4, 0, 0, Math.PI*2); c.fill()
  // Cracks
  c.strokeStyle = '#555555'; c.lineWidth = 1
  c.beginPath(); c.moveTo(H-8,H-2); c.lineTo(H+4,H+4); c.stroke()
})

save('tiles', 'rock', c => {
  diamond(c, '#777777', '#555555'); noise(c, 22)
  c.fillStyle = '#999999'
  c.beginPath(); c.arc(H, H-2, 8, 0, Math.PI*2); c.fill()
  c.fillStyle = '#666666'
  c.beginPath(); c.arc(H+6, H+4, 5, 0, Math.PI*2); c.fill()
})

// WEED
save('tiles', 'weed', c => {
  diamond(c, '#3a6e2a', '#2a5e1a'); noise(c, 10)
  c.strokeStyle = '#4a8e3a'; c.lineWidth = 2
  for (let i = 0; i < 6; i++) {
    const bx = H + (Math.random()-0.5)*20, by = H + (Math.random()-0.5)*10
    c.beginPath(); c.moveTo(bx, by+5)
    c.quadraticCurveTo(bx+(Math.random()-0.5)*8, by-8, bx+(Math.random()-0.5)*6, by-14)
    c.stroke()
  }
})

// ITEMS
console.log('Generating items...')
const items: [string, string, (c: CanvasRenderingContext2D) => void][] = [
  ['wood', '#8b5a36', c => { c.fillStyle='#8b5a36'; c.fillRect(16,20,32,24); c.fillStyle='#a07050'; c.fillRect(18,22,28,8); c.strokeStyle='#6b4226'; c.lineWidth=2; c.strokeRect(16,20,32,24); c.beginPath();c.moveTo(20,32);c.lineTo(44,32);c.stroke() }],
  ['stone_item', '#888888', c => { c.fillStyle='#999'; c.beginPath();c.ellipse(32,32,14,10,0,0,Math.PI*2);c.fill(); c.fillStyle='#aaa'; c.beginPath();c.ellipse(28,28,8,5,0,0,Math.PI*2);c.fill(); c.strokeStyle='#666';c.lineWidth=2;c.beginPath();c.ellipse(32,32,14,10,0,0,Math.PI*2);c.stroke() }],
  ['ore_copper', '#b87333', c => { c.fillStyle='#b87333'; c.beginPath();c.moveTo(32,12);c.lineTo(50,24);c.lineTo(44,48);c.lineTo(20,48);c.lineTo(14,24);c.closePath();c.fill(); c.fillStyle='#d4944a'; c.beginPath();c.moveTo(28,20);c.lineTo(38,20);c.lineTo(36,34);c.lineTo(26,34);c.closePath();c.fill(); c.strokeStyle='#8a5520';c.lineWidth=2;c.beginPath();c.moveTo(32,12);c.lineTo(50,24);c.lineTo(44,48);c.lineTo(20,48);c.lineTo(14,24);c.closePath();c.stroke() }],
  ['ore_iron', '#c0c0c0', c => { c.fillStyle='#c0c0c0'; c.beginPath();c.moveTo(32,12);c.lineTo(50,24);c.lineTo(44,48);c.lineTo(20,48);c.lineTo(14,24);c.closePath();c.fill(); c.fillStyle='#e0e0e0'; c.beginPath();c.moveTo(28,20);c.lineTo(38,20);c.lineTo(36,34);c.lineTo(26,34);c.closePath();c.fill(); c.strokeStyle='#888';c.lineWidth=2;c.beginPath();c.moveTo(32,12);c.lineTo(50,24);c.lineTo(44,48);c.lineTo(20,48);c.lineTo(14,24);c.closePath();c.stroke() }],
  ['ore_gold', '#ffd700', c => { c.fillStyle='#ffd700'; c.beginPath();c.moveTo(32,12);c.lineTo(50,24);c.lineTo(44,48);c.lineTo(20,48);c.lineTo(14,24);c.closePath();c.fill(); c.fillStyle='#ffe84d'; c.beginPath();c.moveTo(28,20);c.lineTo(38,20);c.lineTo(36,34);c.lineTo(26,34);c.closePath();c.fill(); c.strokeStyle='#cc9900';c.lineWidth=2;c.beginPath();c.moveTo(32,12);c.lineTo(50,24);c.lineTo(44,48);c.lineTo(20,48);c.lineTo(14,24);c.closePath();c.stroke() }],
  ['gem_ruby', '#e0115f', c => { c.fillStyle='#e0115f'; c.beginPath();c.moveTo(32,10);c.lineTo(52,28);c.lineTo(32,54);c.lineTo(12,28);c.closePath();c.fill(); c.fillStyle='#ff4488'; c.globalAlpha=0.5; c.beginPath();c.moveTo(32,16);c.lineTo(42,28);c.lineTo(32,40);c.lineTo(22,28);c.closePath();c.fill(); c.globalAlpha=1; c.strokeStyle='#aa0044';c.lineWidth=2;c.beginPath();c.moveTo(32,10);c.lineTo(52,28);c.lineTo(32,54);c.lineTo(12,28);c.closePath();c.stroke() }],
  ['gem_sapphire', '#0f52ba', c => { c.fillStyle='#0f52ba'; c.beginPath();c.moveTo(32,10);c.lineTo(52,28);c.lineTo(32,54);c.lineTo(12,28);c.closePath();c.fill(); c.fillStyle='#4488dd'; c.globalAlpha=0.5; c.beginPath();c.moveTo(32,16);c.lineTo(42,28);c.lineTo(32,40);c.lineTo(22,28);c.closePath();c.fill(); c.globalAlpha=1; c.strokeStyle='#0a3388';c.lineWidth=2;c.beginPath();c.moveTo(32,10);c.lineTo(52,28);c.lineTo(32,54);c.lineTo(12,28);c.closePath();c.stroke() }],
  ['fossil', '#d2b48c', c => { c.fillStyle='#d2b48c'; c.beginPath();c.ellipse(32,32,18,12,0.2,0,Math.PI*2);c.fill(); c.strokeStyle='#b8956a';c.lineWidth=2;c.beginPath();c.ellipse(32,32,18,12,0.2,0,Math.PI*2);c.stroke(); c.strokeStyle='#c4a87a';c.lineWidth=1; for(let i=0;i<5;i++){c.beginPath();c.moveTo(20+i*5,24);c.lineTo(18+i*5,40);c.stroke()} }],
  ['seed_star', '#90e0ff', c => { c.fillStyle='#90e0ff'; c.beginPath(); for(let i=0;i<5;i++){const a=i*Math.PI*2/5-Math.PI/2;const b=a+Math.PI/5;c.lineTo(32+Math.cos(a)*18,32+Math.sin(a)*18);c.lineTo(32+Math.cos(b)*8,32+Math.sin(b)*8)} c.closePath();c.fill(); c.strokeStyle='#60b0dd';c.lineWidth=2;c.stroke() }],
]
for (const [id, , fn] of items) save('items', id, fn)

// CROPS (4 stages each)
console.log('Generating crops...')
const crops: Record<string, {leaf:string, base:string, ripe:string}> = {
  turnip: {leaf:'#4a8e3a', base:'#e8d8f0', ripe:'#d0b8e0'},
  potato: {leaf:'#3a7e2a', base:'#c8a86e', ripe:'#b89858'},
  tomato: {leaf:'#3a8e2a', base:'#e84040', ripe:'#ff3030'},
  corn:   {leaf:'#4a9e3a', base:'#f0d040', ripe:'#ffe030'},
  flower: {leaf:'#3a7e3a', base:'#d070e0', ripe:'#e080f0'},
  rare:   {leaf:'#2a6e4a', base:'#70d0ff', ripe:'#90e0ff'},
}
for (const [cid, col] of Object.entries(crops)) {
  for (let st = 0; st < 4; st++) {
    save('crops', `${cid}_${st}`, c => {
      const cx=32, cy=52
      if (st===0) { c.fillStyle=col.leaf; c.beginPath();c.ellipse(cx,cy-4,3,5,0,0,Math.PI*2);c.fill() }
      else if (st===1) { c.fillStyle=col.leaf; c.beginPath();c.moveTo(cx,cy);c.quadraticCurveTo(cx-10,cy-18,cx-5,cy-28);c.quadraticCurveTo(cx,cy-22,cx+5,cy-28);c.quadraticCurveTo(cx+10,cy-18,cx,cy);c.fill() }
      else if (st===2) { c.fillStyle=col.leaf; for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(cx+i*7,cy);c.quadraticCurveTo(cx+i*12,cy-22,cx+i*9,cy-36);c.quadraticCurveTo(cx+i*3,cy-26,cx+i*7,cy);c.fill()} c.fillStyle=col.base;c.globalAlpha=0.5;c.beginPath();c.arc(cx,cy-18,5,0,Math.PI*2);c.fill();c.globalAlpha=1 }
      else { c.fillStyle=col.leaf; for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(cx+i*9,cy);c.quadraticCurveTo(cx+i*16,cy-28,cx+i*11,cy-44);c.quadraticCurveTo(cx+i*3,cy-32,cx+i*9,cy);c.fill()} c.fillStyle=col.ripe;c.beginPath();c.arc(cx,cy-22,9,0,Math.PI*2);c.fill(); c.fillStyle='#fff';c.globalAlpha=0.3;c.beginPath();c.arc(cx-3,cy-25,3,0,Math.PI*2);c.fill();c.globalAlpha=1 }
    })
  }
}

// BUILDINGS
console.log('Generating buildings...')
save('buildings', 'house', c => {
  c.fillStyle='#a0522d'; c.beginPath();c.moveTo(64,20);c.lineTo(110,45);c.lineTo(110,90);c.lineTo(64,115);c.lineTo(18,90);c.lineTo(18,45);c.closePath();c.fill()
  c.strokeStyle='#7a3a1a';c.lineWidth=2;c.stroke()
  c.fillStyle='#c06030'; c.beginPath();c.moveTo(64,10);c.lineTo(115,40);c.lineTo(64,55);c.lineTo(13,40);c.closePath();c.fill()
  c.fillStyle='#4a2a10'; c.fillRect(52,70,24,30)
  c.fillStyle='#87ceeb'; c.fillRect(30,55,14,14); c.fillRect(84,55,14,14)
  c.strokeStyle='#5a3a1a';c.lineWidth=1;c.strokeRect(30,55,14,14);c.strokeRect(84,55,14,14)
}, 128)

save('buildings', 'shop', c => {
  c.fillStyle='#4682b4'; c.beginPath();c.moveTo(64,25);c.lineTo(108,48);c.lineTo(108,88);c.lineTo(64,112);c.lineTo(20,88);c.lineTo(20,48);c.closePath();c.fill()
  c.strokeStyle='#2a5a8a';c.lineWidth=2;c.stroke()
  c.fillStyle='#5a9ad4'; c.beginPath();c.moveTo(64,15);c.lineTo(112,42);c.lineTo(64,56);c.lineTo(16,42);c.closePath();c.fill()
  c.fillStyle='#ffd700';c.font='bold 16px monospace';c.textAlign='center';c.fillText('$',64,78)
  c.fillStyle='#2a4a6a'; c.fillRect(50,72,28,28)
}, 128)

save('buildings', 'mine', c => {
  c.fillStyle='#2f2f2f'; c.beginPath();c.moveTo(64,30);c.lineTo(105,52);c.lineTo(105,92);c.lineTo(64,114);c.lineTo(23,92);c.lineTo(23,52);c.closePath();c.fill()
  c.strokeStyle='#1a1a1a';c.lineWidth=2;c.stroke()
  c.fillStyle='#1a1a1a'; c.beginPath();c.ellipse(64,75,22,16,0,0,Math.PI*2);c.fill()
  c.fillStyle='#444'; c.beginPath();c.moveTo(42,52);c.lineTo(64,30);c.lineTo(86,52);c.closePath();c.fill()
}, 128)

save('buildings', 'well', c => {
  // Stone base
  c.fillStyle='#888'; c.beginPath();c.ellipse(64,80,28,16,0,0,Math.PI*2);c.fill()
  c.strokeStyle='#666';c.lineWidth=2;c.stroke()
  // Water inside
  c.fillStyle='#4488cc'; c.beginPath();c.ellipse(64,76,20,10,0,0,Math.PI*2);c.fill()
  // Posts
  c.fillStyle='#6b4226'; c.fillRect(40,40,6,40); c.fillRect(82,40,6,40)
  // Roof
  c.fillStyle='#8b5a36'; c.beginPath();c.moveTo(36,40);c.lineTo(64,24);c.lineTo(92,40);c.closePath();c.fill()
  // Rope
  c.strokeStyle='#c8a86e';c.lineWidth=2; c.beginPath();c.moveTo(64,30);c.lineTo(64,65);c.stroke()
  // Bucket
  c.fillStyle='#8b5a36'; c.fillRect(58,62,12,10)
}, 128)

// PLAYER
console.log('Generating player...')
save('player', 'character', c => {
  const cx=32, by=58
  c.fillStyle='#3366cc'; c.fillRect(cx-8,by-24,16,16) // body
  c.fillStyle='#ffcc99'; c.beginPath();c.arc(cx,by-30,8,0,Math.PI*2);c.fill() // head
  c.fillStyle='#663300'; c.beginPath();c.arc(cx,by-34,8,Math.PI,Math.PI*2);c.fill() // hair
  c.fillStyle='#222'; c.beginPath();c.arc(cx-3,by-30,1.2,0,Math.PI*2);c.arc(cx+3,by-30,1.2,0,Math.PI*2);c.fill() // eyes
  c.fillStyle='#ffcc99'; c.fillRect(cx-13,by-22,5,12); c.fillRect(cx+8,by-22,5,12) // arms
  c.fillStyle='#4444aa'; c.fillRect(cx-6,by-8,6,10); c.fillRect(cx,by-8,6,10) // legs
  c.fillStyle='#553311'; c.fillRect(cx-7,by+2,7,3); c.fillRect(cx,by+2,7,3) // boots
}, 64)

console.log('All assets generated!')
