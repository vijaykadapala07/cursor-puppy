# Cursor Puppy (desktop)

A tiny pet that lives in a little house at the bottom-left of your screen and trots after your
cursor while you work. It floats above every app but never gets in the way: clicks pass straight
through everything except the pet, its house, the ball and the options menu, and it never takes
your keyboard (except while you type a new name).

## Install on an Apple Silicon Mac
1. Double-click `CursorPuppy-1.2.1-mac-apple-silicon.zip`, then drag **Cursor Puppy.app** into **Applications**.
2. The app isn't notarized by Apple, so the first launch needs one extra step:
   right-click the app > **Open** > **Open**. On macOS 15 or newer, if that only offers "Done", open
   **System Settings > Privacy & Security**, scroll down and click **Open Anyway**.
   (Terminal alternative: `xattr -cr "/Applications/Cursor Puppy.app"`, then open it normally.)
3. Your pet pops out of its house and starts following the cursor.

## What it does
- **Click the house** for the options menu:
  - **Call** (pet comes out and follows your cursor again)
  - **Play ball**: the pet brings you a ball. Click the ball to throw it, or drag and fling it.
    They chase it and bring it back.
  - **Tie at home**: the pet is leashed to the post and pads around in front of the house.
  - **Bedtime**: the pet walks home, goes inside, pokes its head out of the door and falls asleep.
  - **Switch pet**: a white Morkie (Snowy), a Panda (Bao) or a Teddy bear (Honey).
  - **Name**: type a new name and press Save. It shows on the house.
- **Stop moving the mouse** (15 seconds by default) and the pet lies down and naps right where it is.
  Move the mouse and it wakes up.
- **Click the pet** for hearts.
- **Menu bar paw** (top right of the screen): click it for every option above, plus how long
  before naps, **Start when I log in** and **Quit**. On MacBooks with a notch it can be hidden when
  the menu bar is crowded, so the same menu is also on the **Dock icon** (right-click it; a plain
  click calls your pet).
- The tips card at the top right of the browser demo is only in the demo; the app doesn't show it.
- Name, pet and what it was doing are remembered between launches.

## Run from source
Needs Node.js 18 or newer.
```bash
cd desktop-app
npm install
npm start        # regenerates src/overlay.html from ../cursor-puppy.html, then runs
npm test         # smoke test: walks the pet through every action, saves test/smoke.png
```

## Build the Mac app
```bash
npm run dist:mac   # on a Mac; output in dist/
```

## Files
- `../cursor-puppy.html`: the browser demo. The pet's art, animations and behaviour all live here.
- `src/overlay.html`: generated from the demo by `npm run sync` (swaps the web font for the bundled one).
- `src/main.js`: the transparent full-screen window, cursor tracking, click-through, and the menu bar and Dock menus.
- `src/preload.js`: the small bridge between the window and main.js.

## Known limits
- The house lives on your main screen. On a second monitor the pet waits at the edge nearest your cursor.
- Ad-hoc signed but not notarized, so the first launch needs the extra step above.
