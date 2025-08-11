
// ================================
// File: server/routes.players.js  (add/register these routes into your backend)
// Put this alongside your existing routes.js (or merge). Requires bcrypt.
// Endpoints:
//   GET  /api/players         -> list players (id,username,display_name)
//   POST /api/players         -> create player { username, password, display_name }
//   POST /api/login           -> login { username, password } -> { ok, player }
// ================================

/* Example ESM-compatible Express route file */

// server/routes.players.js
import express from 'express'
import pool from './db.js'
import bcrypt from 'bcryptjs'

const router = express.Router()

router.get('/players', async (req, res) => {
  try{
    const [rows] = await pool.query('SELECT id, username, display_name, chips FROM players ORDER BY id ASC')
    res.json({ ok:true, players: rows })
  }catch(err){ console.error('players list error', err); res.status(500).json({ ok:false, error: err.message }) }
})

router.post('/players', async (req, res) => {
  const { username, password, display_name } = req.body || {}
  if(!username || !password) return res.status(400).json({ ok:false, error:'username/password required' })
  try{
    // check exists
    const [exists] = await pool.query('SELECT id FROM players WHERE username = ?', [username])
    if(exists.length) return res.status(400).json({ ok:false, error:'username exists' })
    const hash = await bcrypt.hash(password, 10)
    const [r] = await pool.query('INSERT INTO players (username, display_name, is_human, chips, created_at) VALUES (?, ?, ?, ?, NOW())', [username, display_name||username, 1, 10000])
    // store password in separate auth table or players.password_hash (for demo we'll store into players.password_hash if exists)
    // try to store into players_auth table
    try{
      await pool.query('INSERT INTO players_auth (player_id, password_hash, created_at) VALUES (?, ?, NOW())', [r.insertId, hash])
    }catch(e){
      // fallback: if no players_auth table, try to update players (if players has password_hash column)
      try{ await pool.query('ALTER TABLE players ADD COLUMN password_hash VARCHAR(255) NULL') }catch(_){ }
      await pool.query('UPDATE players SET password_hash = ? WHERE id = ?', [hash, r.insertId])
    }
    const player = { id: r.insertId, username, display_name: display_name||username, chips: 10000 }
    res.json({ ok:true, player })
  }catch(err){ console.error('create player error', err); res.status(500).json({ ok:false, error: err.message }) }
})

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {}
  if(!username || !password) return res.status(400).json({ ok:false, error:'username/password required' })
  try{
    const [rows] = await pool.query('SELECT p.id, p.username, p.display_name, p.chips, pa.password_hash FROM players p LEFT JOIN players_auth pa ON pa.player_id = p.id WHERE p.username = ? LIMIT 1', [username])
    if(!rows.length) return res.status(400).json({ ok:false, error:'unknown user' })
    const row = rows[0]
    const hash = row.password_hash
    if(!hash) return res.status(400).json({ ok:false, error:'no password set for user' })
    const ok = await bcrypt.compare(password, hash)
    if(!ok) return res.status(400).json({ ok:false, error:'invalid credentials' })
    const player = { id: row.id, username: row.username, display_name: row.display_name, chips: row.chips }
    res.json({ ok:true, player })
  }catch(err){ console.error('login error', err); res.status(500).json({ ok:false, error: err.message }) }
})

export default router