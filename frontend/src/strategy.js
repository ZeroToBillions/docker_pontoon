// frontend/src/strategy.js
// Basic strategy lookup tables (hard, soft, pair).
// Tables store codes: 'H' (hit), 'S' (stand), 'D' (double), 'P' (split)
// getBasicStrategy returns 'hit'|'stand'|'double'|'split'

export const hardTable = {
  4:  {2:'H',3:'H',4:'H',5:'H',6:'H',7:'H',8:'H',9:'H',10:'H',11:'H'},
  5:  {2:'H',3:'H',4:'H',5:'H',6:'H',7:'H',8:'H',9:'H',10:'H',11:'H'},
  6:  {2:'H',3:'H',4:'H',5:'H',6:'H',7:'H',8:'H',9:'H',10:'H',11:'H'},
  7:  {2:'H',3:'H',4:'H',5:'H',6:'H',7:'H',8:'H',9:'H',10:'H',11:'H'},
  8:  {2:'H',3:'H',4:'H',5:'H',6:'H',7:'H',8:'H',9:'H',10:'H',11:'H'},
  9:  {2:'H',3:'H',4:'D',5:'D',6:'D',7:'H',8:'H',9:'H',10:'H',11:'H'},
  10: {2:'D',3:'D',4:'D',5:'D',6:'D',7:'D',8:'D',9:'D',10:'H',11:'H'},
  11: {2:'D',3:'D',4:'D',5:'D',6:'D',7:'D',8:'D',9:'D',10:'D',11:'H'},
  12: {2:'H',3:'H',4:'S',5:'S',6:'S',7:'H',8:'H',9:'H',10:'H',11:'H'},
  13: {2:'H',3:'H',4:'S',5:'S',6:'S',7:'H',8:'H',9:'H',10:'H',11:'H'},
  14: {2:'S',3:'S',4:'S',5:'S',6:'S',7:'H',8:'H',9:'H',10:'H',11:'H'},
  15: {2:'S',3:'S',4:'S',5:'S',6:'S',7:'H',8:'H',9:'H',10:'H',11:'H'},
  16: {2:'S',3:'S',4:'S',5:'S',6:'S',7:'H',8:'H',9:'H',10:'H',11:'H'},
  17: {2:'S',3:'S',4:'S',5:'S',6:'S',7:'S',8:'S',9:'S',10:'S',11:'H'},
  18: {2:'S',3:'S',4:'S',5:'S',6:'S',7:'S',8:'S',9:'S',10:'S',11:'S'},
  19: {2:'S',3:'S',4:'S',5:'S',6:'S',7:'S',8:'S',9:'S',10:'S',11:'S'},
  20: {2:'S',3:'S',4:'S',5:'S',6:'S',7:'S',8:'S',9:'S',10:'S',11:'S'},
}

export const softTable = {
  12: {2:'H',3:'H',4:'H',5:'H',6:'H',7:'H',8:'H',9:'H',10:'H',11:'H'},
  13: {2:'H',3:'H',4:'H',5:'H',6:'H',7:'H',8:'H',9:'H',10:'H',11:'H'},
  14: {2:'H',3:'H',4:'H',5:'H',6:'H',7:'H',8:'H',9:'H',10:'H',11:'H'},
  15: {2:'H',3:'H',4:'H',5:'H',6:'H',7:'H',8:'H',9:'H',10:'H',11:'H'},
  16: {2:'H',3:'H',4:'H',5:'H',6:'H',7:'H',8:'H',9:'H',10:'H',11:'H'},
  17: {2:'H',3:'H',4:'H',5:'H',6:'H',7:'H',8:'H',9:'H',10:'H',11:'H'},
  18: {2:'S',3:'S',4:'S',5:'S',6:'S',7:'S',8:'S',9:'H',10:'H',11:'H'},
  19: {2:'S',3:'S',4:'S',5:'S',6:'S',7:'S',8:'S',9:'S',10:'S',11:'S'},
  20: {2:'S',3:'S',4:'S',5:'S',6:'S',7:'S',8:'S',9:'S',10:'S',11:'S'},
}

export const pairTable = {
  'A': {2:'P',3:'P',4:'P',5:'P',6:'P',7:'P',8:'P',9:'P',10:'P',11:'P'},
  'K': {2:'S',3:'S',4:'S',5:'S',6:'S',7:'S',8:'S',9:'S',10:'S',11:'S'},
  'Q': {2:'S',3:'S',4:'S',5:'S',6:'S',7:'S',8:'S',9:'S',10:'S',11:'S'},
  'J': {2:'S',3:'S',4:'S',5:'S',6:'S',7:'S',8:'S',9:'S',10:'S',11:'S'},
  'T': {2:'S',3:'S',4:'S',5:'S',6:'S',7:'S',8:'S',9:'S',10:'S',11:'S'},
  '9': {2:'S',3:'P',4:'P',5:'P',6:'P',7:'S',8:'P',9:'P',10:'S',11:'S'},
  '8': {2:'P',3:'P',4:'P',5:'P',6:'P',7:'P',8:'P',9:'P',10:'P',11:'H'},
  '7': {2:'P',3:'P',4:'P',5:'P',6:'P',7:'P',8:'H',9:'H',10:'H',11:'H'},
  '6': {2:'H',3:'H',4:'P',5:'P',6:'P',7:'H',8:'H',9:'H',10:'H',11:'H'},
  '5': {2:'D',3:'D',4:'D',5:'D',6:'D',7:'D',8:'D',9:'H',10:'H',11:'H'},
  '4': {2:'H',3:'H',4:'P',5:'P',6:'P',7:'P',8:'H',9:'H',10:'H',11:'H'},
  '3': {2:'P',3:'P',4:'P',5:'P',6:'P',7:'P',8:'P',9:'H',10:'H',11:'H'},
  '2': {2:'P',3:'P',4:'P',5:'P',6:'P',7:'P',8:'P',9:'P',10:'H',11:'H'},
}

/**
 * Normalize dealer up-rank to table column index:
 * 'A' -> 11, 'T','J','Q','K' -> 10, '2'..'9' -> number
 */
function dealerRankToCol(dealerUpRank){
  if(!dealerUpRank) return 10
  if(typeof dealerUpRank === 'number') return dealerUpRank
  const r = String(dealerUpRank).toUpperCase()
  if(r === 'A') return 11
  if(r === 'T' || r === 'J' || r === 'Q' || r === 'K' || r === '10') return 10
  const n = parseInt(r, 10)
  if(Number.isFinite(n) && n >= 2 && n <= 11) return n
  // fallback to 10
  return 10
}

/**
 * getBasicStrategy
 * playerHand: array of card objects {rank: 'A'|'2'..|'T'|'J'|'Q'|'K'}
 * dealerUpRank: same rank string as above
 * canDouble, canSplit: booleans
 *
 * returns: 'hit' | 'stand' | 'double' | 'split'
 */
export function getBasicStrategy(playerHand, dealerUpRank, canDouble=true, canSplit=true){
  const ranks = (playerHand || []).map(c => c && c.rank ? String(c.rank).toUpperCase() : null).filter(Boolean)

  // resolve dealer column
  const dealerCol = dealerRankToCol(dealerUpRank)

  // Pair decision: only when exactly 2 cards and same rank
  if(ranks.length === 2 && ranks[0] === ranks[1] && canSplit){
  // if(ranks.length === 2 && canSplit){
    const pairRank = ranks[0]
    const rule = pairTable[pairRank]?.[dealerCol]
    if(rule === 'P') return 'split'
    if(rule === 'D') return canDouble ? 'double' : 'hit'
    if(rule === 'S') return 'stand'
    if(rule === 'H') return 'hit'
  }

  // compute best and isSoft
  let total = 0, aces = 0
  for(const r of ranks){
    if(r === 'A'){ aces++; total += 1 }
    else if(r === 'T' || r === 'J' || r === 'Q' || r === 'K' || r === '10'){ total += 10 }
    else {
      const n = parseInt(r, 10)
      total += Number.isFinite(n) ? n : 0
    }
  }
  const vals = [total]
  for(let i=1;i<=aces;i++) vals.push(total + i*10)
  const valid = vals.filter(v => v <= 21)
  const best = valid.length ? Math.max(...valid) : Math.min(...vals)
  const isSoft = (valid.length ? (Math.max(...valid) - total >= 10) : false)

  // choose table
  if(isSoft){
    const row = softTable[best]
    const code = row?.[dealerCol]
    if(code === 'S') return 'stand'
    if(code === 'H') return 'hit'
    if(code === 'D') return canDouble ? 'double' : 'hit'
  } else {
    const row = hardTable[best]
    const code = row?.[dealerCol]
    if(code === 'S') return 'stand'
    if(code === 'H') return 'hit'
    if(code === 'D') return canDouble ? 'double' : 'hit'
  }

  return 'hit'
}

export default { hardTable, softTable, pairTable, getBasicStrategy }
