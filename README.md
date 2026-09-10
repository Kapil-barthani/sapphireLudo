# 🎲 Ludo Royale - Local & Multiplayer Game

A real-time, feature-complete Ludo game designed to run on your local system with support for **Pass & Play (single screen)**, **Room-based Local Network / Multi-tab Multiplayer**, and **Smart AI Bots**. Includes in-game live chat and expressive emoji voice reactions!

---

## 🚀 How to Run

1. Open your terminal in this directory:
   ```bash
   npm start
   ```
2. Open your browser:
   - **On your PC**: [http://localhost:4000](http://localhost:4000)
   - **On any phone or tablet on the same Wi-Fi**: `http://<your-local-ip>:4000` (printed in the terminal upon start!)

---

## 🎮 Game Modes

1. **Pass & Play (Default)**:
   - Play with 2, 3, or 4 players on a single machine or laptop.
   - Ideal for quick games with friends or family on one screen.

2. **Create / Join Online Room**:
   - Host generates a unique 6-character room code (e.g. `ABC123`).
   - Click the room badge to copy the direct invite link (`http://localhost:4000/?room=ABC123`).
   - Friends can join from other tabs, windows, or devices on your local Wi-Fi.

3. **Play vs AI Bots**:
   - Play solo against 1 or 3 computer-controlled AI bots with intelligent move evaluation.

---

## ✨ Features & Polish

- **Classic Official Ludo Rules**:
  - Roll a `6` to release tokens from the yard to the start cell.
  - Extra bonus roll on rolling `6`, capturing an opponent, or reaching home.
  - 3 consecutive sixes penalty rule (forfeits turn to maintain balance).
  - 8 Safe spots (4 color start squares + 4 star safe cells) where tokens cannot be captured.
  - Exact roll required to enter the center victory home triangle.
- **In-Game Live Chat**:
  - Chat panel with player color badges, timestamps, and quick-chat chips (*"Good luck!"*, *"Nice roll!"*, *"Watch out!"*).
- **Emoji Voice Reactions & Taunts**:
  - Expressive floating emojis (😂, 😠, 😱, 🥳, 🎲, 😈, 👏, 😢).
  - Built-in speech synthesis that speaks taunts in character (*"Haha in your face!"*, *"You will regret that!"*, *"Let's party!"*).
- **Audio Synthesizer**:
  - Zero external downloads; generated dynamically using the Web Audio API.
  - Dice rattle, pawn hops, capture impacts, star chimes, and victory fanfares.
- **Visuals**:
  - 3D tumbling CSS dice with authentic dot pips.
  - Multi-step hop animation showing tokens walking cell-by-cell.
  - Automatic token stacking for multiple pieces on the same square.
  - Confetti particle celebration and winner ranking podium (1st, 2nd, 3rd, 4th).
