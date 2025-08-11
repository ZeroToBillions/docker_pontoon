// frontend/src/App.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react'
import axios from 'axios'
import { getBasicStrategy } from './strategy'

/* Utility & game logic helpers (same as before) */
const SUITS = ['♠','♥','♣','♦']
const RANKS = ['A','2','3','4','5','6','7','8','9','T','J','Q','K']
function cardNumericValue(rank){ if(rank==='A') return 1; if(['T','J','Q','K'].includes(rank)) return 10; return parseInt(rank,10) }
function makeDecks(numDecks=6, missingT=true){
  const cards=[]
  for(let d=0; d<numDecks; d++){
    for(const s of SUITS){
      for(const r of RANKS){
        if(missingT && r==='T') continue
        cards.push({suit:s, rank:r, code:`${r}${s}`})
      }
    }
  }
  return cards
}
function shuffle(arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a }

function evaluateHand(cards, {aceAsOneOnly=false} = {}) {
  let total=0, aces=0
  for(const c of (cards||[])){ if(!c) continue; if(c.rank==='A'){ aces++; total+=1 } else total += cardNumericValue(c.rank) }
  const values=[total]
  for(let i=1;i<=aces;i++) values.push(total + i*10)
  let valid = values.filter(v=>v<=21)
  if(aceAsOneOnly) valid = [total]
  const best = valid.length ? Math.max(...valid) : Math.min(...values)
  const isSoft = !aceAsOneOnly && values.includes(best) && best - total >= 10
  return { best, isSoft, values }
}
function isBlackjack(cards){ if(!cards || cards.length!==2) return false; const ranks=cards.map(c=>c.rank); return ranks.includes('A') && ranks.some(r=>['T','J','Q','K'].includes(r)) }

class Shoe{
  constructor({numDecks=6, missingT=true, cycleShuffle=true}={}){ this.numDecks=numDecks; this.missingT=missingT; this.cycleShuffle=cycleShuffle; this.reset() }
  reset(){ this.cards = shuffle(makeDecks(this.numDecks, this.missingT)); this.discard = [] }
  draw(){ if(!this.cards || this.cards.length===0){ if(this.cycleShuffle && this.discard.length>0){ this.cards = shuffle(this.discard); this.discard = [] } else this.reset() } return this.cards.pop() }
  burnOne(){ const c=this.draw(); if(c) this.discard.push(c) }
  discardCards(cards=[]){ if(Array.isArray(cards)) this.discard.push(...cards) }
}

export default function App(){
  // Settings
  const [numPlayers, setNumPlayers] = useState(3)
  const [humanSeats, setHumanSeats] = useState([2])
  const [maxSplitHands, setMaxSplitHands] = useState(3)
  const [startingChips, setStartingChips] = useState(10000)
  const [minBet, setMinBet] = useState(100)
  const [numDecks, setNumDecks] = useState(6)
  const [missingT, setMissingT] = useState(true)
  const [cycleShuffle, setCycleShuffle] = useState(true)
  const [dealerStartCards, setDealerStartCards] = useState(1)

  // runtime
  const [shoe, setShoe] = useState(()=> new Shoe({numDecks, missingT, cycleShuffle}))
  useEffect(()=> setShoe(new Shoe({numDecks, missingT, cycleShuffle})), [numDecks, missingT, cycleShuffle])

  const initPlayers = ()=> {
    const arr=[]
    for(let i=0;i<numPlayers;i++){
      const isHuman = humanSeats.includes(i+1)
      // add handsMeta array to track per-hand rules (canHit, isSplitAces, resolved, payout ...)
      arr.push({ id:i+1, name:`Player ${i+1}`, isHuman, chips: startingChips, hands: [], handsMeta: [] })
    }
    return arr
  }
  const initStats = (n)=>{
    const s={}
    for(let i=0;i<n;i++){ const id = i+1; s[id] = { rounds:0, wins:0, losses:0, pushes:0, netTotal:0 } }
    return s
  }

  const [players, setPlayers] = useState(()=> initPlayers())
  useEffect(()=> setPlayers(initPlayers()), [numPlayers, humanSeats, startingChips])

  const [dealer, setDealer] = useState({ cards: [], checkedBlackjack:false })
  const [currentBets, setCurrentBets] = useState({})
  const [phase, setPhase] = useState('settings')
  const [activePlayerIndex, setActivePlayerIndex] = useState(0)
  const [activeHandIndex, setActiveHandIndex] = useState(0)
  const [log, setLog] = useState([])
  const [gameId, setGameId] = useState(null)
  const [dbStatus, setDbStatus] = useState({ ok: null, msg: 'unknown' })

  // stats: rounds total and per-player stats
  const [roundsTotal, setRoundsTotal] = useState(0)
  const [playerStats, setPlayerStats] = useState(()=> initStats(numPlayers))
  useEffect(()=> setPlayerStats(initStats(numPlayers)), [numPlayers])

  // refs for AI and latest-state access
  const aiRunningRef = useRef(false)
  const playersRef = useRef(players); useEffect(()=>{ playersRef.current = players }, [players])
  const currentBetsRef = useRef(currentBets); useEffect(()=>{ currentBetsRef.current = currentBets }, [currentBets])
  const dealerRef = useRef(dealer); useEffect(()=>{ dealerRef.current = dealer }, [dealer])
  const shoeRef = useRef(shoe); useEffect(()=>{ shoeRef.current = shoe }, [shoe])

  // resolved hands ref to avoid double-paying due to race conditions
  // key: `${playerId}_${handIndex}` => { resolved:true, payout: <net> }
  const resolvedHandsRef = useRef({})

  // API
  const api = useMemo(()=> axios.create({ baseURL: `${window.location.protocol}//${window.location.hostname}:4000/api` }), [])
  const logAdd = (t)=> setLog(l=>[...l, t])

  async function fetchDbStatus(){
    try{ const r = await api.get('/status'); setDbStatus({ ok:true, info:r.data }) }catch(e){ setDbStatus({ ok:false, msg: e.message }) }
  }
  useEffect(()=> { fetchDbStatus() }, [])

  async function startGameOnServer(){
    try{
      const settings = { dealer_start_cards: dealerStartCards, num_decks: numDecks, missing_t: missingT, cycle_shuffle: cycleShuffle, min_bet: minBet }
      const res = await api.post('/start_game', { created_by:null, settings })
      if(!res?.data?.gameId){ logAdd('start_game: bad response'); return null }
      setGameId(res.data.gameId); logAdd(`Game created id=${res.data.gameId}`); fetchDbStatus(); return res.data.gameId
    }catch(err){ console.error('start_game error', err); logAdd('start_game failed: '+(err.response?.data||err.message)); return null }
  }

async function submitActionToServer(action){
  if(!gameId) { console.warn('no gameId, skip submit', action); logAdd('submit_action skipped: no gameId'); return }
  try{
    // Normalize action_type to short codes to avoid DB truncation errors.
    // 如果后端有其他预期值，请在这里补充映射。
    const actionTypeMap = {
      blackjack: 'bj',   // -> 前端发送短码 'bj' 代替 'blackjack'
      // 如果后端还需要其他缩写，可以在这里加上。例如:
      double: 'double', // 6 chars，通常 OK
      split: 'split',
      stand: 'stand',
      hit: 'hit',
      win: 'win',
      lose: 'lose'
    }
    const mappedType = actionTypeMap[action?.action_type] || action?.action_type

    // Build a copy so we don't mutate caller object
    const payload = { game_id: gameId, ...action, action_type: mappedType }

    // Optional: include original action_type for debugging (remove if backend rejects extra keys)
    payload.orig_action_type = action?.action_type

    const res = await api.post('/submit_action', payload)
    return res.data
  }catch(err){
    console.error('submit_action error', err.response?.data || err.message);
    logAdd('submit_action ERROR: '+(err.response?.data?.error||err.message));
    return false
  }
}

  async function endGameOnServer(hands){
    if(!gameId){ console.warn('no gameId, skip endGame', hands); logAdd('end_game skipped: no gameId'); return }
    try{ const res = await api.post('/end_game', { game_id: gameId, hands }); logAdd('Round saved to server'); return res.data }catch(err){ console.error('end_game error', err.response?.data || err.message); logAdd('end_game ERROR: '+(err.response?.data?.error||err.message)); return false }
  }

  /* -----------------------
     Helper: immediate payout
     - explicitBet (optional) is used when currentBetsRef may not reflect an immediately-updated bet (e.g. after double).
     - IMPORTANT: no longer mutates player.chips here — we only mark resolved & record payout (net).
     - settleBets will perform actual chips changes centrally to avoid double-pay.
  ------------------------*/
  async function awardImmediateWin(playerIndex, handIndex, explicitBet = null){
    const latestPlayers = playersRef.current || []
    const player = latestPlayers[playerIndex]
    if(!player) return
    const pid = player.id
    const cards = (player.hands && player.hands[handIndex]) ? player.hands[handIndex].slice() : []
    if(!cards) return
    const bet = (explicitBet !== null) ? explicitBet : ((currentBetsRef.current[pid] && currentBetsRef.current[pid][handIndex]) || 0)
    if(bet <= 0) {
      // nothing to pay — mark resolved to avoid future double-handling
      resolvedHandsRef.current[`${pid}_${handIndex}`] = { resolved:true, payout: 0 }
      updatePlayersCopy(copy=>{ if(copy[playerIndex] && copy[playerIndex].handsMeta){ copy[playerIndex].handsMeta[handIndex] = { ...(copy[playerIndex].handsMeta[handIndex]||{}), resolved:true, payout:0, canHit:false } } })
      return
    }

    const bj = isBlackjack(cards)
    let payoutNet = 0
    if(bj && cards.length===2){
      payoutNet = Math.floor(bet * 1.5) // net
      // DO NOT add chips here; mark resolved and store payout
      updatePlayersCopy(copy=>{
        const p = copy[playerIndex]
        if(p){
          p.handsMeta = p.handsMeta || []
          p.handsMeta[handIndex] = { ...(p.handsMeta[handIndex]||{}), canHit:false, resolved:true, payout: payoutNet }
        }
      })
      resolvedHandsRef.current[`${pid}_${handIndex}`] = { resolved:true, payout: payoutNet }
      logAdd(`Player ${pid} BLACKJACK immediate mark: net ${payoutNet}`)
      await submitActionToServer({ player_id: pid, hand_index: handIndex, action_type: 'blackjack', dealer_up_card: dealerRef.current.cards[0]?.rank||null, player_hand_value: 21, is_soft:true, cards })
    } else {
      // normal 21 -> mark resolved & store net payout
      payoutNet = bet
      updatePlayersCopy(copy=>{
        const p = copy[playerIndex]
        if(p){
          p.handsMeta = p.handsMeta || []
          p.handsMeta[handIndex] = { ...(p.handsMeta[handIndex]||{}), canHit:false, resolved:true, payout: payoutNet }
        }
      })
      resolvedHandsRef.current[`${pid}_${handIndex}`] = { resolved:true, payout: payoutNet }
      logAdd(`Player ${pid} reached 21 immediate mark: net ${payoutNet}`)
      await submitActionToServer({ player_id: pid, hand_index: handIndex, action_type: 'win', dealer_up_card: dealerRef.current.cards[0]?.rank||null, player_hand_value: 21, is_soft: evaluateHand(cards).isSoft, cards })
    }
  }

  /* --- Start round & dealing --- */
  async function startRound(){
    if(!gameId){ const created = await startGameOnServer(); if(!created){ logAdd('startRound aborted: failed to create game on server'); return } }

    // clear resolvedHandsRef from previous rounds
    resolvedHandsRef.current = {}

    const bets = {}
    const pls = players.map(p=>{
      const bet = p.chips < minBet ? p.chips : Math.min(minBet, p.chips)
      bets[p.id] = [bet]
      return { ...p, chips: p.chips - bet, hands: [[]], handsMeta: [{ canHit:true, isSplitAces:false, resolved:false }] }
    })

    const newDealer = { cards: [], checkedBlackjack:false }
    shoe.burnOne()

    // deal two rounds to players and dealer as configured
    for(let r=0;r<2;r++){
      for(let i=0;i<pls.length;i++){
        const c = shoe.draw(); if(c) pls[i].hands[0].push(c)
      }
      if(dealerStartCards===2 && r<2){ const c = shoe.draw(); if(c) newDealer.cards.push(c) }
    }
    if(dealerStartCards===1){ const c = shoe.draw(); if(c) newDealer.cards.push(c) }

    // AFTER dealing, handle immediate player blackjack / 21 rule FOR ALL PLAYERS (human + AI)
    for(let i=0;i<pls.length;i++){
      const p = pls[i]
      const h = p.hands[0]
      const bet = bets[p.id]?.[0] || 0
      if(isBlackjack(h)){
        // mark immediate blackjack (do NOT change chips here)
        p.handsMeta = p.handsMeta || []
        p.handsMeta[0] = { ...p.handsMeta[0], canHit:false, isSplitAces:false, resolved:true, payout: Math.floor(bet*1.5) }
        resolvedHandsRef.current[`${p.id}_0`] = { resolved:true, payout: Math.floor(bet*1.5) }
        logAdd(`Player ${p.id} BLACKJACK on initial deal - marked for payout`)
        submitActionToServer({ player_id: p.id, hand_index: 0, action_type: 'blackjack', dealer_up_card: newDealer.cards[0]?.rank||null, player_hand_value: 21, is_soft:true, cards: h })
      } else if(evaluateHand(h).best === 21){
        // non-blackjack 21 immediate - mark (includes soft 21)
        p.handsMeta = p.handsMeta || []
        p.handsMeta[0] = { ...p.handsMeta[0], canHit:false, isSplitAces:false, resolved:true, payout: bet }
        resolvedHandsRef.current[`${p.id}_0`] = { resolved:true, payout: bet }
        logAdd(`Player ${p.id} initial 21 (non-blackjack) - marked for payout`)
        submitActionToServer({ player_id: p.id, hand_index: 0, action_type: 'win', dealer_up_card: newDealer.cards[0]?.rank||null, player_hand_value: 21, is_soft: evaluateHand(h).isSoft, cards: h })
      }
    }

    setPlayers([...pls]); setCurrentBets(bets); setDealer(newDealer); setPhase('dealing')

    // check dealer blackjack if dealer had 2 cards
    if(dealerStartCards===2 && isBlackjack(newDealer.cards)){
      setDealer(d=>({...d, checkedBlackjack:true}))
      resolveDealerBlackjack(bets)
      return
    }

    setPhase('play'); setActivePlayerIndex(0); setActiveHandIndex(0); logAdd('Round started')

    // Auto-advance active player index to skip resolved initial hands
    setTimeout(()=>{
      let pi = 0
      while(pi < pls.length){
        const p = pls[pi]
        const h = p.hands[0]
        const meta = p.handsMeta?.[0]
        if(meta?.resolved || (p.isHuman && evaluateHand(h).best === 21)){
          pi++
          continue
        }
        break
      }
      setActivePlayerIndex(pi)
      setActiveHandIndex(0)
    }, 80)
  }

  function resolveDealerBlackjack(bets){
    setPhase('results')
    logAdd('Dealer Blackjack - resolving')
    const handsData=[]
    players.forEach(p=> p.hands.forEach((h,hi)=>{ handsData.push({ player_id:p.id, hand_index:hi, cards:h, bet_amount: bets[p.id]?.[hi]||0, result: isBlackjack(h)?'push':'lose', payout: isBlackjack(h)?0: - (bets[p.id]?.[hi]||0) }) }))
    endGameOnServer(handsData)
  }

  /* --- Helpers: safe split helper (now handles handsMeta) --- */
  function performSplitOnCopy(copy, pi, hi){
    const player = copy[pi]; const hand = player.hands[hi]; if(!hand || hand.length!==2) return false
    const left=[hand[0]]; const right=[hand[1]]
    const before = player.hands.slice(0, hi)
    const after = player.hands.slice(hi+1)
    player.hands = [...before, left, right, ...after]

    // adjust handsMeta in parallel (create if missing)
    const hasMeta = Array.isArray(player.handsMeta)
    const metaBefore = hasMeta ? player.handsMeta.slice(0, hi) : []
    const metaAfter = hasMeta ? player.handsMeta.slice(hi+1) : []
    const isAcePair = hand[0].rank === 'A' && hand[1].rank === 'A'
    // For Ace splits: created hands are 'split aces' and by rule cannot hit further (until potentially resplit).
    const leftMeta = isAcePair ? { canHit:false, isSplitAces:true, resolved:false } : { canHit:true, isSplitAces:false, resolved:false }
    const rightMeta = isAcePair ? { canHit:false, isSplitAces:true, resolved:false } : { canHit:true, isSplitAces:false, resolved:false }
    player.handsMeta = [...metaBefore, leftMeta, rightMeta, ...metaAfter]
    return true
  }

  function updatePlayersCopy(mutator){
    setPlayers(prev=>{
      const copy = prev.map(p=> ({ ...p, hands: p.hands.map(h=> h.slice()), handsMeta: (p.handsMeta||[]).map(m=> ({...(m||{canHit:true})})) }))
      mutator(copy)
      return copy
    })
  }

  /* --- Player actions (user-driven) --- */
  function playerActionHit(playerIndex, handIndex){
    // check allowed
    const meta = players[playerIndex]?.handsMeta?.[handIndex]
    if(meta && meta.canHit === false){ logAdd('Hit not allowed on this hand'); return }

    // draw card
    updatePlayersCopy(copy=>{ const c = shoe.draw(); if(c) copy[playerIndex].hands[handIndex].push(c) })

    const pl = players[playerIndex] || {}
    const handSnapshot = (pl.hands && pl.hands[handIndex]) ? pl.hands[handIndex].slice() : []
    // report hit
    submitActionToServer({ player_id: pl.id, hand_index: handIndex, action_type: 'hit', dealer_up_card: dealer.cards[0]?.rank || null, player_hand_value: evaluateHand(handSnapshot).best, is_soft: evaluateHand(handSnapshot).isSoft, cards: handSnapshot })

    // after small delay, check for bust or auto-stand on 21 (including soft 21)
    setTimeout(()=>{
      setPlayers(prev=>{
        const h = prev[playerIndex]?.hands?.[handIndex] || [];
        const val = evaluateHand(h).best
        if(val > 21){
          logAdd(`Player ${prev[playerIndex].id} hand #${handIndex+1} BUST`)
          advanceTurn(playerIndex, handIndex)
        } else if(val === 21){
          // immediate payout for any 21 (blackjack 2-card pays 1.5x)
          // ensure hand is locked from further hits for human as well
          updatePlayersCopy(copy=>{
            const P = copy[playerIndex]
            P.handsMeta = P.handsMeta || []
            P.handsMeta[handIndex] = { ...(P.handsMeta[handIndex]||{}), canHit:false }
          })
          awardImmediateWin(playerIndex, handIndex)
          // also submit a stand action for clarity
          submitActionToServer({ player_id: pl.id, hand_index: handIndex, action_type: 'stand', dealer_up_card: dealer.cards[0]?.rank || null, player_hand_value: val, is_soft: evaluateHand(h).isSoft, cards: h })
          advanceTurn(playerIndex, handIndex)
        }
        return prev
      })
    }, 80)
  }

  function playerActionStand(playerIndex, handIndex){
    submitActionToServer({ player_id: players[playerIndex].id, hand_index: handIndex, action_type: 'stand', dealer_up_card: dealer.cards[0]?.rank || null, player_hand_value: evaluateHand(players[playerIndex].hands[handIndex]).best, is_soft: evaluateHand(players[playerIndex].hands[handIndex]).isSoft, cards: players[playerIndex].hands[handIndex] })
    advanceTurn(playerIndex, handIndex)
  }

  function playerActionDouble(playerIndex, handIndex){
    // enforce double only on exactly 2 cards
    const curHand = players[playerIndex].hands[handIndex] || []
    if(curHand.length !== 2){ logAdd('Double only allowed on first two cards'); return }

    // compute bet/add in local variables so we can award immediately later
    const playerLocal = players[playerIndex]
    const betBefore = (currentBets[playerLocal.id] && currentBets[playerLocal.id][handIndex]) || 0
    const add = playerLocal.chips >= betBefore ? betBefore : playerLocal.chips
    const newBet = betBefore + add

    // deduct add, update bet, draw one card, mark doubled and lock hand (no further hits)
    updatePlayersCopy(copy=>{
      const player = copy[playerIndex]
      player.chips -= add
      setCurrentBets(cb=>{ const nb = {...cb}; nb[player.id] = nb[player.id] ? nb[player.id].slice() : []; nb[player.id][handIndex] = (nb[player.id][handIndex]||0) + add; return nb })
      const c = shoe.draw(); if(c) player.hands[handIndex].push(c)
      player.handsMeta = player.handsMeta || []
      player.handsMeta[handIndex] = { ...(player.handsMeta[handIndex]||{}), doubled:true, canHit:false }
    })
    const handAfter = players[playerIndex]?.hands?.[handIndex] || []
    submitActionToServer({ player_id: players[playerIndex].id, hand_index: handIndex, action_type: 'double', dealer_up_card: dealer.cards[0]?.rank||null, player_hand_value: evaluateHand(handAfter, {aceAsOneOnly:true}).best, is_soft: false, cards: handAfter })

    // if this resulted in 21 -> immediate mark using newBet
    setTimeout(()=>{
      const pl = playersRef.current[playerIndex]
      const h = pl?.hands?.[handIndex] || []
      if(evaluateHand(h).best === 21){
        awardImmediateWin(playerIndex, handIndex, newBet)
      }
      advanceTurn(playerIndex, handIndex)
    }, 120)
  }

  function playerActionSplit(playerIndex, handIndex){
    // note: allow resplitting up to maxSplitHands
    let bothLockedAfter = false
    updatePlayersCopy(copy=>{
      const player = copy[playerIndex]
      const hand = player.hands[handIndex]
      if(!hand || hand.length!==2) return
      const v0 = cardNumericValue(hand[0].rank)
      const v1 = cardNumericValue(hand[1].rank)
      const samePoint = (hand[0].rank===hand[1].rank) || (v0===v1)
      if(!samePoint) return
      const bet = currentBets[player.id]?.[handIndex]||0
      if(player.chips < bet) return
      if(player.hands.length >= maxSplitHands) return

      // perform split (this will set hands & handsMeta)
      const ok = performSplitOnCopy(copy, playerIndex, handIndex)
      if(!ok) return

      // adjust bets array to insert bet,bet at handIndex position
      player.chips -= bet
      setCurrentBets(cb=>{ const nb = {...cb}; nb[player.id] = nb[player.id] ? nb[player.id].slice() : []; nb[player.id] = [...(nb[player.id].slice(0, handIndex)), bet, bet, ...(nb[player.id].slice(handIndex+1))]; return nb })

      // draw one card for each new hand
      const leftCard = shoe.draw(); const rightCard = shoe.draw()
      if(leftCard) player.hands[handIndex].push(leftCard)
      if(rightCard) player.hands[handIndex+1].push(rightCard)

      // compute whether both new hands are locked (cannot hit)
      const metaLeft = player.handsMeta?.[handIndex] || { canHit:true }
      const metaRight = player.handsMeta?.[handIndex+1] || { canHit:true }
      bothLockedAfter = (metaLeft.canHit === false) && (metaRight.canHit === false)
    })

    // submit split action to server
    const pl = players[playerIndex] || {}
    submitActionToServer({ player_id: pl.id, hand_index: handIndex, action_type: 'split', dealer_up_card: dealer.cards[0]?.rank||null, player_hand_value: evaluateHand(players[playerIndex].hands[handIndex]).best, is_soft: evaluateHand(players[playerIndex].hands[handIndex]).isSoft, cards: players[playerIndex].hands[handIndex] })

    // After split, check new hands for immediate 21 and award if needed
    setTimeout(()=>{
      const latest = playersRef.current[playerIndex]
      if(!latest) return
      const betArray = currentBetsRef.current[latest.id] || []
      const h0 = latest.hands[handIndex] || []
      const h1 = latest.hands[handIndex+1] || []
      if(evaluateHand(h0).best === 21){
        const bet0 = betArray[handIndex] || 0
        awardImmediateWin(playerIndex, handIndex, bet0)
      }
      if(evaluateHand(h1).best === 21){
        const bet1 = betArray[handIndex+1] || 0
        awardImmediateWin(playerIndex, handIndex+1, bet1)
      }
      // If both resulting hands are locked (e.g. split aces), auto-stand both and advance
      if(bothLockedAfter){
        if(latest){
          logAdd(`Player ${latest.id} split result: both hands auto-stand (split aces rule)`)
          // move turn forward: skip the two hands
          advanceTurn(playerIndex, handIndex)
          advanceTurn(playerIndex, handIndex+1)
        }
      }
    }, 90)
  }

  function advanceTurn(playerIndex, handIndex){
    const p = players[playerIndex]
    if(!p) return

    if(p.hands.length > handIndex + 1){
      setActivePlayerIndex(playerIndex)
      setActiveHandIndex(handIndex + 1)
      logAdd(`Player ${p.id} now plays hand #${handIndex+2}`)
      return
    }

    if(playerIndex + 1 < players.length){
      setActivePlayerIndex(playerIndex + 1)
      setActiveHandIndex(0)
      logAdd(`Now Player ${players[playerIndex + 1].id} turn`)
      return
    }

    setPhase('dealer')
    setTimeout(()=> playDealer(), 80)
  }

  /* Dealer */
  function playDealer(){ const d = {...dealer, cards: dealer.cards.slice()}; if(dealerStartCards===1){ const c = shoe.draw(); if(c) d.cards.push(c) } let inf = evaluateHand(d.cards); while(inf.best < 17 || (inf.best===17 && inf.isSoft)){ const c = shoe.draw(); if(c) d.cards.push(c); inf = evaluateHand(d.cards) } setDealer(d); setPhase('results'); settleBets(d) }

  function settleBets(dealerState){
    const dInfo = evaluateHand(dealerState.cards)
    const handsToSend = []

    // Use current bets snapshot to avoid stale closure issues
    const betsSnapshot = currentBetsRef.current || {}

    // We'll accumulate per-player net for this round
    const perPlayerNet = {}

    // Build updated players array and collect handsToSend simultaneously
    setPlayers(prev => {
      const updated = prev.map(p => {
        const newP = { ...p }
        newP.hands = newP.hands.map((h, hi) => {
          const bet = (betsSnapshot[p.id] && (betsSnapshot[p.id][hi] || 0)) || 0
          const hInfo = evaluateHand(h)

          // Prefer authoritative resolved info from resolvedHandsRef (set by awardImmediateWin)
          const resolvedKey = `${p.id}_${hi}`
          const resolvedEntry = resolvedHandsRef.current[resolvedKey]
          const metaFromState = (p.handsMeta && p.handsMeta[hi]) || {}
          const metaResolved = (resolvedEntry && resolvedEntry.resolved) || !!metaFromState.resolved
          const metaPayout = (resolvedEntry && typeof resolvedEntry.payout === 'number') ? resolvedEntry.payout : (typeof metaFromState.payout === 'number' ? metaFromState.payout : undefined)

          let result = null
          let payout = 0

          if (hInfo.best > 21) {
            result = 'bust'
            payout = -bet
            // chips already deducted earlier; no extra chip change
          } else {
            const playerBJ = isBlackjack(h)
            const dealerBJ = isBlackjack(dealerState.cards)

            if(metaResolved){
              // If this hand was already marked resolved (immediate award), apply centralized chips change here
              // metaPayout is the net payout (e.g. blackjack net = floor(bet*1.5), non-bj 21 net = bet, push net = 0)
              const payoutNetFinal = (typeof metaPayout === 'number') ? metaPayout : (playerBJ ? Math.floor(bet*1.5) : (hInfo.best === 21 ? bet : 0))
              payout = payoutNetFinal
              // result determine: if blackjack, label it; else compare to dealer
              if(playerBJ) result = 'blackjack'
              else if (hInfo.best > dInfo.best || dInfo.best > 21) result = 'win'
              else if (hInfo.best === dInfo.best) result = 'push'
              else result = 'lose'

              // apply chips change centrally: return bet + payoutNetFinal (push -> payoutNetFinal likely 0, so returns bet)
              newP.chips += (bet + (payoutNetFinal || 0))
            } else {
              // Normal awarding (only if not already resolved)
              if (playerBJ) {
                if (dealerStartCards === 1) {
                  result = 'blackjack'
                  payout = Math.floor(bet * 1.5)
                  newP.chips += Math.floor(bet * 2.5)
                } else {
                  if (dealerBJ) {
                    result = 'push'
                    payout = 0
                    newP.chips += bet
                  } else {
                    result = 'blackjack'
                    payout = Math.floor(bet * 1.5)
                    newP.chips += Math.floor(bet * 2.5)
                  }
                }
              } else {
                if (dInfo.best > 21) {
                  result = 'win'
                  payout = bet
                  newP.chips += bet * 2
                } else {
                  if (hInfo.best > dInfo.best) {
                    result = 'win'
                    payout = bet
                    newP.chips += bet * 2
                  } else if (hInfo.best === dInfo.best) {
                    result = 'push'
                    payout = 0
                    newP.chips += bet
                  } else {
                    result = 'lose'
                    payout = -bet
                  }
                }
              }
            }
          }

          // save per-player net for this round
          perPlayerNet[p.id] = (perPlayerNet[p.id] || 0) + payout

          // push record for server
          handsToSend.push({
            player_id: p.id,
            hand_index: hi,
            cards: h,
            bet_amount: bet,
            result,
            payout
          })

          return h
        })
        return newP
      })

      return updated
    })

    // discard cards into shoe discard pile (use playersRef.current snapshot to ensure we discard actual cards used)
    const playersSnapshot = playersRef.current || []
    playersSnapshot.forEach(p => {
      (p.hands || []).forEach(h => shoe.discardCards(h))
    })
    shoe.discardCards(dealerState.cards)

    // send results to backend
    endGameOnServer(handsToSend)

    // update stats: roundsTotal and per-player stats aggregation
    setRoundsTotal(rt => rt + 1)
    setPlayerStats(prevStats => {
      const next = { ...prevStats }
      Object.keys(perPlayerNet).forEach(pidStr=>{
        const pid = Number(pidStr)
        const net = perPlayerNet[pid] || 0
        const s = next[pid] ? { ...next[pid] } : { rounds:0, wins:0, losses:0, pushes:0, netTotal:0 }
        s.rounds = (s.rounds || 0) + 1
        if(net > 0) s.wins = (s.wins || 0) + 1
        else if(net < 0) s.losses = (s.losses || 0) + 1
        else s.pushes = (s.pushes || 0) + 1
        s.netTotal = (s.netTotal || 0) + net
        next[pid] = s
      })
      return next
    })

    // clear resolvedHandsRef entries for this round (they were used to prevent double-pay)
    resolvedHandsRef.current = {}

    logAdd(`Dealer ${dInfo.best}${dInfo.isSoft? ' (soft)':''}`)
  }

  /* AI loop - STRICTLY use getBasicStrategy and report every action to backend
     Rewritten inner loop to dynamically read playersRef.current[pi].hands so splits won't skip hands.
     Fixed: when split happens, ensure AI processes the newly-created left hand (same index) before incrementing to the next hand.
  */
  useEffect(() => {
    if (phase !== 'play') return;
    const startIndex = activePlayerIndex;
    if (startIndex == null || startIndex < 0 || startIndex >= playersRef.current.length) return;

    // if current seat is human, return — human interacts via UI
    if (playersRef.current[startIndex] && playersRef.current[startIndex].isHuman) return;

    if (aiRunningRef.current) return;
    aiRunningRef.current = true;

    (async () => {
      try {
        for (let pi = startIndex; pi < playersRef.current.length; pi++) {
          // re-check player each iteration
          const p0 = playersRef.current[pi];
          if (!p0) continue;
          if (p0.isHuman) { setActivePlayerIndex(pi); setActiveHandIndex(0); aiRunningRef.current = false; return; }

          // iterate hands dynamically so splits (which increase hands length) are included
          let hi = 0;
          let splitOccurred = false; // <-- track whether we just performed a split so we don't skip the newly-created left hand
          while (true) {
            const pcur = playersRef.current[pi];
            if (!pcur) break;
            const hands = pcur.hands || []
            if (hi >= hands.length) break

            setActivePlayerIndex(pi); setActiveHandIndex(hi);

            let done = false;
            splitOccurred = false; // reset for each hand iteration
            while (!done) {
              const hand = playersRef.current[pi]?.hands?.[hi];
              const meta = playersRef.current[pi]?.handsMeta?.[hi] || { canHit:true }
              if (!hand) { done = true; break; }
              const handInfo = evaluateHand(hand);

              // if busted -> stop and log
              if (handInfo.best > 21) { logAdd(`Player ${playersRef.current[pi].id} hand #${hi+1} BUST`); done = true; break; }

              // if 21 -> immediate payout (AI too), report and stop
              if (handInfo.best === 21) {
                await awardImmediateWin(pi, hi)
                done = true; break;
              }

              // if this hand is a 'split ace' locked (no hit allowed) -> auto-stand
              if (meta && meta.canHit === false){
                await submitActionToServer({ player_id: pcur.id, hand_index: hi, action_type: 'stand', dealer_up_card: dealerRef.current.cards[0]?.rank||null, player_hand_value: handInfo.best, is_soft: handInfo.isSoft, cards: hand.slice() })
                done = true; break
              }

              // call strategy strictly: pass canDouble/canSplit flags
              const dealerUp = dealerRef.current.cards[0]?.rank || 'T';
              const canDouble = (hand.length === 2) && ((currentBetsRef.current[playersRef.current[pi].id]?.[hi] || 0) > 0) && (playersRef.current[pi].chips > 0);
              const canSplit = hand.length === 2 && playersRef.current[pi].chips >= (currentBetsRef.current[playersRef.current[pi].id]?.[hi]||0) && playersRef.current[pi].hands.length < maxSplitHands;
              let move = 'stand';
              try {
                move = getBasicStrategy(hand.slice(), dealerUp, canDouble, canSplit); // returns 'hit'|'stand'|'double'|'split'
              } catch (e) {
                console.error('strategy error', e);
                move = 'stand';
              }

              // If strategy requests impossible action, downgrade safely (double->hit, split->stand)
              if (move === 'double' && !canDouble) move = 'hit';
              if (move === 'split' && !canSplit) move = 'stand';

              // Execute move and REPORT each action to backend
              if (move === 'hit') {
                updatePlayersCopy(copy => { const c = shoeRef.current.draw(); if (c) copy[pi].hands[hi].push(c); });
                await submitActionToServer({ player_id: pcur.id, hand_index: hi, action_type: 'hit', dealer_up_card: dealerUp, player_hand_value: evaluateHand(playersRef.current[pi]?.hands?.[hi]||hand).best, is_soft: evaluateHand(playersRef.current[pi]?.hands?.[hi]||hand).isSoft, cards: (playersRef.current[pi]?.hands?.[hi]||hand) });
                await new Promise(r=>setTimeout(r,60));
                if (evaluateHand(playersRef.current[pi].hands[hi]).best > 21) { logAdd(`Player ${playersRef.current[pi].id} hand #${hi+1} BUST`); done = true; }
                // if reached 21 it'll be handled at top of loop (we will next iteration do awardImmediateWin)
              } else if (move === 'stand') {
                await submitActionToServer({ player_id: pcur.id, hand_index: hi, action_type: 'stand', dealer_up_card: dealerUp, player_hand_value: handInfo.best, is_soft: handInfo.isSoft, cards: hand.slice() });
                done = true;
              } else if (move === 'double') {
                const bet = currentBetsRef.current[pcur.id]?.[hi] || 0;
                const add = playersRef.current[pi].chips >= bet ? bet : playersRef.current[pi].chips
                const newBet = bet + add
                updatePlayersCopy(copy=>{ const player = copy[pi]; player.chips -= add; setCurrentBets(cb=>{ const nb={...cb}; nb[player.id]= nb[player.id]? nb[player.id].slice():[]; nb[player.id][hi] = (nb[player.id][hi]||0)+add; return nb }); const c = shoeRef.current.draw(); if(c) player.hands[hi].push(c); 
                  // mark doubled & lock hand
                  player.handsMeta = player.handsMeta || []
                  player.handsMeta[hi] = { ...(player.handsMeta[hi]||{}), doubled:true, canHit:false }
                });
                await submitActionToServer({ player_id: pcur.id, hand_index: hi, action_type: 'double', dealer_up_card: dealerUp, player_hand_value: evaluateHand(playersRef.current[pi]?.hands?.[hi]||hand, {aceAsOneOnly:true}).best, is_soft: false, cards: playersRef.current[pi]?.hands?.[hi]||hand });
                await new Promise(r=>setTimeout(r,80));
                // after double, if reached 21 -> immediate mark
                if(evaluateHand(playersRef.current[pi]?.hands?.[hi]||hand).best === 21){
                  await awardImmediateWin(pi, hi, newBet)
                }
                done = true;
              } else if (move === 'split') {
                const bet = currentBetsRef.current[pcur.id]?.[hi] || 0;
                updatePlayersCopy(copy => {
                  const ok = performSplitOnCopy(copy, pi, hi);
                  if (!ok) return;
                  const player = copy[pi];
                  player.chips -= bet;
                  setCurrentBets(cb=>{ const nb={...cb}; nb[player.id]= nb[player.id] ? nb[player.id].slice():[]; nb[player.id] = [...(nb[player.id].slice(0,hi)), bet, bet, ...(nb[player.id].slice(hi+1))]; return nb });
                  const c1 = shoeRef.current.draw(); const c2 = shoeRef.current.draw(); if(c1) player.hands[hi].push(c1); if(c2) player.hands[hi+1].push(c2);
                });
                await submitActionToServer({ player_id: pcur.id, hand_index: hi, action_type: 'split', dealer_up_card: dealerUp, player_hand_value: evaluateHand(playersRef.current[pi]?.hands?.[hi]||hand).best, is_soft: evaluateHand(playersRef.current[pi]?.hands?.[hi]||hand).isSoft, cards: playersRef.current[pi]?.hands?.[hi]||hand });
                await new Promise(r=>setTimeout(r,140));
                // after split, check new hands for 21 and mark immediately
                const latest = playersRef.current[pi]
                if(latest){
                  const newLeft = latest.hands[hi] || []
                  const newRight = latest.hands[hi+1] || []
                  const betArr = currentBetsRef.current[latest.id] || []
                  if(evaluateHand(newLeft).best === 21){
                    await awardImmediateWin(pi, hi, betArr[hi] || 0)
                  }
                  if(evaluateHand(newRight).best === 21){
                    await awardImmediateWin(pi, hi+1, betArr[hi+1] || 0)
                  }
                }
                // to avoid skipping the newly created left hand (which sits at same index hi),
                // set splitOccurred so outer loop WILL NOT increment hi this turn.
                splitOccurred = true
                done = true;
              } else {
                // fallback - treat as stand
                await submitActionToServer({ player_id: pcur.id, hand_index: hi, action_type: 'stand', dealer_up_card: dealerUp, player_hand_value: handInfo.best, is_soft: handInfo.isSoft, cards: hand.slice() });
                done = true;
              }

              // UI snapshot update
              setPlayers(prev => prev.map(x => ({ ...x, hands: x.hands.map(h => h.slice()), handsMeta: (x.handsMeta||[]).map(m=>({...(m||{canHit:true})})) })));
              setCurrentBets(cb => ({ ...cb }));

              await new Promise(r => setTimeout(r, 60));
            } // end while for this hand

            // move to next hand for the same player (this will reflect newly added hands too)
            if(splitOccurred){
              // we just split: we want to process the newly created left hand (which is at same index),
              // so DO NOT increment hi (stay on current index)
              splitOccurred = false
            } else {
              hi++
            }
            await new Promise(r => setTimeout(r, 20))
          } // end while hands

          // move to next player
          setActivePlayerIndex(pi + 1);
          setActiveHandIndex(0);
          await new Promise(r => setTimeout(r, 120));
        } // end players loop

        aiRunningRef.current = false;
        setPhase('dealer');
        setTimeout(()=> playDealer(), 80);
      } catch (err) {
        console.error('AI loop error', err);
        aiRunningRef.current = false;
      }
    })();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, activePlayerIndex]);

  /* Render UI (Double disabled unless exactly 2 cards; Hit disabled when handsMeta.canHit === false) */
  return (
    <div className="p-6 min-h-screen bg-green-50">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Pontoon / Pontoon Casino (Pontoon rules)</h1>
          <div className="text-sm text-gray-600">GameId: {gameId || 'not started'}</div>
        </header>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-white rounded shadow">
            <h2 className="font-semibold">Settings</h2>
            <div className="mt-2">Players (1-6): <input type="number" min={1} max={6} value={numPlayers} onChange={e=>setNumPlayers(Math.max(1,Math.min(6,parseInt(e.target.value||3))))} className="ml-2 w-20" /></div>
            <div className="mt-2">Human seats (comma): <input value={humanSeats.join(',')} onChange={e=>setHumanSeats(e.target.value.split(',').map(s=>parseInt(s)).filter(Boolean))} className="block w-full mt-1"/></div>
            <div className="mt-2">Starting chips (50 step): <input type="number" min={50} step={50} value={startingChips} onChange={e=>setStartingChips(Math.max(50,parseInt(e.target.value||10000)))} className="ml-2 w-32"/></div>
            <div className="mt-2">Min bet (100 step): <input type="number" min={100} step={100} value={minBet} onChange={e=>setMinBet(Math.max(100,parseInt(e.target.value||100)))} className="ml-2 w-32"/></div>
            <div className="mt-2">Decks (1-10): <input type="number" min={1} max={10} value={numDecks} onChange={e=>setNumDecks(Math.max(1,Math.min(10,parseInt(e.target.value||6))))} className="ml-2 w-20"/></div>
            <div className="mt-2"><label className="mr-2">Missing T</label><input type="checkbox" checked={missingT} onChange={e=>setMissingT(e.target.checked)} /></div>
            <div className="mt-2"><label className="mr-2">Cycle shuffle</label><input type="checkbox" checked={cycleShuffle} onChange={e=>setCycleShuffle(e.target.checked)} /></div>
            <div className="mt-2">Dealer start cards: <select value={dealerStartCards} onChange={e=>setDealerStartCards(parseInt(e.target.value))} className="ml-2"><option value={1}>1</option><option value={2}>2</option></select></div>
            <div className="mt-3 flex gap-2"><button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={()=>{ setPlayers(initPlayers()); setPlayerStats(initStats(numPlayers)); setRoundsTotal(0); setShoe(new Shoe({numDecks,missingT,cycleShuffle})); setPhase('betting') }}>Apply & Start Betting</button></div>

            <div className="mt-4 p-2 border rounded bg-gray-50">
              <div className="text-sm font-medium">DB Status</div>
              <div className="text-xs mt-1">{ dbStatus.ok === null ? 'Checking...' : (dbStatus.ok ? `OK - ${JSON.stringify(dbStatus.info)}` : `ERROR - ${dbStatus.msg}`) }</div>
              <div className="mt-2"><button className="px-2 py-1 border rounded text-sm" onClick={fetchDbStatus}>Refresh DB Status</button></div>
            </div>

          </div>

          <div className="col-span-2 p-4 bg-white rounded shadow">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Table</h2>
              <div className="flex gap-2"><button className="px-3 py-1 bg-green-600 text-white rounded" onClick={()=>startRound()}>Deal / Start Round</button><button className="px-3 py-1 bg-gray-300 rounded" onClick={()=>{ setPhase('settings'); setPlayers(initPlayers()); setPlayerStats(initStats(numPlayers)); setRoundsTotal(0); setDealer({cards:[]}); setCurrentBets({}); setGameId(null) }}>Reset</button></div>
            </div>

            <div className="mt-4">
              <div className="p-2 border rounded bg-gray-50">Dealer: {dealer.cards.map((c,i)=>(<span key={i} className="mx-1">{c.code}</span>))} <span className="ml-4">Value: {dealer.cards.length? evaluateHand(dealer.cards).best : '-'}</span></div>

              {players.map((p,pi)=> (
                <div key={p.id} className={`mt-3 p-2 border rounded ${p.isHuman? 'bg-white':''}`}>
                  <div className="flex justify-between"><div className="font-medium">{p.name} {p.isHuman? '(Human)':''}</div><div>Chips: {p.chips}</div></div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {p.hands.map((h,hi)=> {
                      const meta = p.handsMeta?.[hi] || { canHit:true }
                      const valInfo = evaluateHand(h)
                      return (
                      <div key={hi} className="p-2 border rounded">
                        <div>Hand #{hi+1} Bet: {currentBets[p.id]?.[hi] || 0}</div>
                        <div className="mt-1">{h.map((c,ci)=>(<span key={ci} className="mx-1">{c.code}</span>))}</div>
                        <div className="mt-1">
                          Value: {h.length? valInfo.best : '-'} {h.length? (valInfo.isSoft? ' (soft)':''):''}
                          { meta.doubled ? <span className="ml-2 text-sm font-medium">[Double]</span> : null }
                        </div>
                        {phase==='play' && p.isHuman && activePlayerIndex===pi && activeHandIndex===hi && (
                          <div className="mt-2 flex gap-2">
                            <button onClick={()=>playerActionHit(pi,hi)} className="px-2 py-1 border rounded" disabled={!meta.canHit || valInfo.best>=21}>Hit</button>
                            <button onClick={()=>playerActionStand(pi,hi)} className="px-2 py-1 border rounded">Stand</button>
                            <button onClick={()=>playerActionDouble(pi,hi)} className="px-2 py-1 border rounded" disabled={h.length !== 2}>Double</button>
                            <button onClick={()=>playerActionSplit(pi,hi)} className="px-2 py-1 border rounded">Split</button>
                          </div>
                        )}
                      </div>
                    )})}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>

        <div className="mt-6 p-3 bg-white rounded shadow">
          <h3 className="font-semibold">Round Log & Stats</h3>

          <div className="mt-3 mb-3 grid grid-cols-2 gap-4">
            <div className="p-2 border rounded bg-gray-50">
              <div className="text-sm font-medium mb-2">Game Rounds</div>
              <div>Total rounds played (this game): <strong>{roundsTotal}</strong></div>
            </div>

            <div className="p-2 border rounded bg-gray-50">
              <div className="text-sm font-medium mb-2">Player Statistics</div>
              <div className="text-xs">
                <table className="table-auto w-full text-left text-sm">
                  <thead><tr><th>Player</th><th>Rounds</th><th>Wins</th><th>Win %</th><th>Net</th><th>Chips</th></tr></thead>
                  <tbody>
                    {players.map(p=>{
                      const s = playerStats[p.id] || { rounds:0, wins:0, losses:0, pushes:0, netTotal:0 }
                      const winRate = s.rounds ? Math.round((s.wins / s.rounds) * 10000)/100 : 0
                      return (<tr key={p.id}><td>{p.name}</td><td>{s.rounds}</td><td>{s.wins}</td><td>{winRate}%</td><td>{s.netTotal}</td><td>{p.chips}</td></tr>)
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-2 h-48 overflow-auto p-2 bg-gray-50">{log.map((l,i)=>(<div key={i}>{l}</div>))}</div>
        </div>
      </div>
    </div>
  )
}
