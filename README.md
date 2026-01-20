# Bomberman Co-op - 3 Spelers

Een multiplayer Bomberman spel voor 3 spelers met Node.js server en browser-gebaseerde client.

## Features

- **3 Spelers Co-op Gameplay**: Totaal co-op ervaring voor 3 menselijke spelers
- **Realtime Multiplayer**: Socket.io voor naadloze synchronisatie tussen spelers
- **Grid-Based Map**: 13×11 speelveld met destructible en indestructible blokken
- **Bomb Mechanics**: Bommen die ontploffen na 2 seconden in kruisvorm
- **Power-ups**: 
  - Extra bommen
  - Grotere explosieradius
  - Snellere beweging
- **Friendly Fire**: Alle spelers kunnen elkaar raken, inclusief de plaatser van de bom
- **Duidelijke Controls**: Elk player heeft eigen controls
- **Game State Management**: Server beheert alle game logic

## Installatie

1. **Clone of download het project**
   ```bash
   cd bomberman\ af
   ```

2. **Installeer dependencies**
   ```bash
   npm install
   ```

3. **Start de server**
   ```bash
   npm start
   # of
   node server.js
   ```

4. **Open de browser**
   - Ga naar: `http://localhost:3000`
   - Open 3 keer deze URL (in verschillende browser windows/tabs of op verschillende computers op hetzelfde netwerk)

## Controls

### Speler 1 (Rood)
- **Beweging**: W (up), A (left), S (down), D (right)
- **Bom plaatsen**: SPATIE

### Speler 2 (Cyaan)
- **Beweging**: ↑ ↓ ← →
- **Bom plaatsen**: ENTER

### Speler 3 (Geel)
- **Beweging**: I (up), J (left), K (down), L (right)
- **Bom plaatsen**: SHIFT

## Gameplay

1. **Spelers verbinden**: Wacht tot 3 spelers verbonden zijn
2. **Spel start**: Zodra 3 spelers verbonden zijn, start het spel automatisch
3. **Beweging**: Beweeg rond op het speelveld
4. **Bommen**: Plaats bommen met je control toets
5. **Explosies**: Bommen explodeer na 2 seconden in een kruisvorm
6. **Power-ups**: Verzamel power-ups uit vernietigde blokken
7. **Gewinnen**: Laatste overgebleven speler wint!

## Game Mechanics

- **Grid**: 13×11 speelveld
- **Unbreakable Walls**: Checkerboard patroon, kan niet verwoest worden
- **Breakable Blocks**: Kunnen vernietigd worden met explosies
- **Explosions**: Gaan 4 richtingen (omhoog, omlaag, links, rechts)
- **Collision Detection**: Spelers kunnen niet door muren, blokken of bommen
- **Power-ups**: 30% kans om te spawnen uit vernietigd blok
- **Bomb Radius**: Standaard 2, kan vergroot worden tot 10
- **Max Bombs**: Standaard 1, kan tot 10 worden
- **Speed**: Standaard 150, max 300

## Project Structuur

```
bomberman af/
├── server.js           # Express server + Socket.io + Game logic
├── package.json        # Node.js dependencies
├── README.md          # Dit bestand
└── public/
    ├── index.html     # HTML client
    ├── style.css      # Styling met animations
    └── client.js      # Client game logic + Input handling
```

## Technische Details

### Server (server.js)
- Express.js voor web server
- Socket.io voor realtime communicatie
- Complete game state management
- Bomb detonation logic
- Player movement validation
- Collision detection
- Power-up spawning

### Client (public/)
- HTML5 DOM grid rendering
- CSS3 animations voor explosies en power-ups
- JavaScript event handling
- Socket.io client side

## Socket Events

### Client → Server
- `join_game`: Speler verbindt zich
- `move`: Speler beweegt (direction: up/down/left/right)
- `bomb`: Speler plaatst bom

### Server → Client
- `game_start`: Spel begint, stuur game state
- `player_joined`: Andere speler verbonden
- `player_moved`: Speler beweging
- `bomb_placed`: Bom geplaatst
- `bomb_exploded`: Bom explodeer met explosies en dode spelers
- `game_over`: Spel voorbij met winnaar

## Troubleshooting

### Spelers kunnen niet verbinden
- Check of server draait: `http://localhost:3000`
- Check console voor errors
- Port 3000 moet beschikbaar zijn

### Spel start niet
- Wacht tot 3 spelers verbonden zijn
- Check browser console voor errors

### Controls werken niet
- Zorg dat het juiste speler nummer is (weergegeven in status)
- Zorg dat je de juiste toetsen gebruikt voor je speler

## Uitbreidingsmogelijkheden

- Meerdere rooms/lobbies
- AI tegenstanders
- Leaderboards
- Verschillende mapvarianten
- Special bommen (remote detonation, etc.)
- Sound effects
- Custom player skins

## Licentie

Dit project is vrij om te gebruiken en aan te passen.
