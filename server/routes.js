// backend/routes.js
import express from 'express';
import pool from './db.js';

const router = express.Router();

router.get('/status', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT VERSION() AS version');
    res.json({ ok: true, version: rows[0].version });
  } catch (err) {
    console.error('DB status error', err);
    res.status(500).json({ ok:false, error: err.message });
  }
});

router.post('/start_game', async (req, res) => {
  const { created_by, settings } = req.body || {};
  try {
    const [result] = await pool.query('INSERT INTO games (started_at, dealer_start_cards, num_decks, missing_t, cycle_shuffle, min_bet, created_by) VALUES (NOW(), ?, ?, ?, ?, ?, ?)', [
      settings?.dealer_start_cards || 1,
      settings?.num_decks || 6,
      settings?.missing_t ? 1 : 0,
      settings?.cycle_shuffle ? 1 : 0,
      settings?.min_bet || 100,
      created_by || null
    ]);
    console.log('Inserted game id=', result.insertId);
    res.json({ ok: true, gameId: result.insertId });
  } catch (err) {
    console.error('start_game error', err);
    res.status(500).json({ ok:false, error: err.message });
  }
});

router.post('/submit_action', async (req, res) => {
  const { game_id, player_id, hand_index, action_type, dealer_up_card, player_hand_value, is_soft, cards } = req.body || {};
  try {
    const [result] = await pool.query(
      'INSERT INTO actions (game_id, player_id, hand_id, action_time, action_type, dealer_up_card, player_hand_value, is_soft, cards_json) VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?)',
      [game_id, player_id || null, null, action_type, dealer_up_card || null, player_hand_value || null, is_soft ? 1 : 0, JSON.stringify(cards || [])]
    );
    res.json({ ok: true, actionId: result.insertId });
  } catch (err) {
    console.error('submit_action error', err);
    res.status(500).json({ ok:false, error: err.message });
  }
});

router.post('/end_game', async (req, res) => {
  const { game_id, hands } = req.body || {};
  if (!game_id || !Array.isArray(hands)) return res.status(400).json({ ok:false, error:'invalid payload' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const h of hands) {
      const { player_id, hand_index, cards, bet_amount, result, payout } = h;
      await conn.query(
        'INSERT INTO hands (game_id, player_id, hand_index, cards, bet_amount, result, payout, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
        [game_id, player_id || null, hand_index || 0, JSON.stringify(cards||[]), bet_amount || 0, result || null, payout || 0]
      );
    }
    await conn.commit();
    res.json({ ok:true });
  } catch (err) {
    await conn.rollback();
    console.error('end_game error', err);
    res.status(500).json({ ok:false, error: err.message });
  } finally {
    conn.release();
  }
});

export default router;
