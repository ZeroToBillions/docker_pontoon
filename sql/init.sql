CREATE DATABASE IF NOT EXISTS pontoon_db;

USE pontoon_db;

-- 其他表（games, hands, actions, sessions）按之前样例补上

-- Players table
CREATE TABLE IF NOT EXISTS players (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    is_human BOOLEAN DEFAULT TRUE,
    chips BIGINT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Games table (each round)
CREATE TABLE IF NOT EXISTS games (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    started_at DATETIME,
    dealer_start_cards TINYINT,
    num_decks TINYINT,
    missing_t BOOLEAN,
    cycle_shuffle BOOLEAN,
    min_bet BIGINT,
    created_by INT
);

-- Hands table (one row per hand played by a player in a game)
CREATE TABLE IF NOT EXISTS hands (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    game_id BIGINT,
    player_id INT,
    hand_index INT,
    cards TEXT,
    bet_amount BIGINT,
    result ENUM(
        'win',
        'lose',
        'push',
        'blackjack',
        'bust'
    ),
    payout BIGINT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Player actions detail (for strategy logging)
CREATE TABLE IF NOT EXISTS actions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    game_id BIGINT,
    player_id INT,
    hand_id BIGINT,
    action_time DATETIME,
    action_type ENUM(
        'hit',
        'stand',
        'double',
        'split',
        'bj',
        'win',
        'lose'
    ),
    dealer_up_card VARCHAR(4),
    player_hand_value INT,
    is_soft BOOLEAN,
    cards_json TEXT
);

-- Sessions / login
CREATE TABLE IF NOT EXISTS sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    player_id INT,
    session_token VARCHAR(255),
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);