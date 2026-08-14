/* ===========================================================================
   RUSKO'S RIOT  --  config.js
   Every tunable number lives here. Nothing in game.js should be a magic
   number; if you want to change how the game feels, change it in this file.

   DESIGN UNITS
   ------------
   All world measurements are in "design units", the coordinate space of the
   1084 x 2340 background plate. The canvas always renders at that internal
   resolution and is CSS-scaled to fit whatever screen it lands on, so these
   numbers never change no matter the device.
   =========================================================================== */
window.RR = window.RR || {};

RR.CFG = {

  /* --- canvas ----------------------------------------------------------- */
  W: 1084,
  H: 2340,
  CX: 542,                    // horizontal centre line of the room

  /* --- perspective ------------------------------------------------------
     The background is drawn in "cartoon perspective": the true vanishing
     point solves to y=1184, but the artist drew the back-wall door about 4x
     larger than real geometry would allow. So the scale ramp below is
     calibrated to the ARTWORK (a kid at the back reads ~350px, up close
     ~750px), not to the geometric VP. Straight line, easy to reason about.

        scale(floorY) = (floorY - HORIZON) / SPAN                          */
  HORIZON: 927,
  SPAN: 1413,
  FLOOR_TOP: 1300,            // back wall: nothing stands behind this
  FLOOR_BOT: 2340,            // camera plane

  /* --- cover slots ------------------------------------------------------
     floorY  = where the feet/legs meet the floor (drives scale + z-order)
     wx      = lateral offset from centre, in design units (scaled on draw)
     prop    = which cover sprite fronts this slot
     Zig-zag on purpose: no two props stack badly, and the eye gets variety. */
  SLOTS: [
    { id: 'FL', floorY: 1450, wx: -780, prop: 'table'      },
    { id: 'FR', floorY: 1450, wx:  780, prop: 'divider'    },
    { id: 'ML', floorY: 1680, wx: -600, prop: 'steamtable' },
    { id: 'MR', floorY: 1680, wx:  640, prop: 'table'      },
    { id: 'NC', floorY: 1900, wx:    0, prop: 'table'      }
  ],

  /* --- ballistics -------------------------------------------------------
     The ball tracks (fy, h, wx): the floor point it is currently over, its
     height above that point, and its lateral offset. Screen position is
     derived, so the arc automatically shrinks as it travels into the room.

     Height on arrival at distance D works out to
        h = H0 + (VH*D/VFY) - (0.5*G*D^2)/(p^2 * VFY^2)
     i.e. more power => flatter/higher at the same distance. Numbers below
     give roughly:  near tier p>=0.52,  mid p 0.63-0.97,  far p 0.73-0.97.  */
  LAUNCH_FY: 2260,            // ball starts just in front of the tray
  H0:  300,                   // release height above the floor
  VH:  2100,                  // vertical launch speed at full power
  VFY: 1000,                  // into-the-room speed at full power
  G:   2600,                  // gravity
  LAT_K: 4.0,                 // px of sideways drag -> lateral velocity
  LAT_MAX: 1400,
  MAX_DRAG: 620,             // px of pull for 100% power (~26% of screen height)
  MIN_DRAG: 34,               // below this a release is an abort, not a shot

  /* --- hit boxes (design units) ----------------------------------------- */
  HIT_HALF_W: 210,            // lateral tolerance on a body hit
  HEAD_FRAC: 0.26,            // top 26% of the exposed band counts as a head shot
  PEEL_SNAP: 130,             // a miss within this of a slot leaves a peel there

  /* --- ammo -------------------------------------------------------------
     Only the banana is wired up for this pass. The other three are defined
     so level 2-4 can be dropped in without touching the engine.            */
  AMMO: {
    banana: {
      label: 'Banana',  sprite: 'banana',  splat: 'banana_splat',
      dmg: 1, count: Infinity, leavesPeel: true,
      blurb: 'Fast and flat. A miss drops a peel - somebody will find it.'
    },
    cookie: {
      label: 'Cookie',  sprite: 'cookie',  splat: 'cookie_splat',
      dmg: 2, count: 8, ricochet: true,
      blurb: 'Flies like a discus and banks off cover.'
    },
    tomato: {
      label: 'Tomato',  sprite: 'tomato',  splat: 'tomato_splat',
      dmg: 3, count: 5, splash: 340,
      blurb: 'Heavy arc, wide splatter.'
    },
    watermelon: {
      label: 'Melon',   sprite: 'watermelon', splat: 'watermelon_splat',
      dmg: 5, count: 3, breaksCover: true,
      blurb: 'Slow, enormous, and it takes the furniture with it.'
    }
  },

  /* --- levels -----------------------------------------------------------
     signature = that character's own food. From level 2 on, hitting an enemy
     with their signature food is the "Own Medicine" double. Level 1 is
     banana-vs-Billy, so the bonus is switched off to keep the fight honest. */
  LEVELS: [
    {
      id: 1, char: 'billy', name: 'Billy the Bully',
      subtitle: 'Bag of Bananas',
      hp: 6, signature: 'banana', ownMedicine: false,
      unlocked: ['banana'],
      aimArc: 0.28,             // fraction of the flight the aim arrow reveals
                                // L1 .28 -> L2 .45 -> L3 .65 -> L4 .90
      hideTime: [0.45, 1.05],   // seconds out of sight between pop-ups
      idleTime: [1.15, 1.85],   // seconds standing there before winding up
      readyTime: 0.95,          // the tell: GET DOWN window
      throwFlight: 0.78,        // seconds for his banana to reach the camera
      dodgeChance: 0.30,        // chance he bobs down mid-idle
      rageScale: 0.55           // timings multiply toward this as his HP drops
    }
    // levels 2-4 (Mrs. Gabel / Coach Ken / Principal Dan) drop in here
  ],

  /* --- player ------------------------------------------------------------ */
  SHIRTS: 3,                  // clean shirts == lives
  RESPAWN_DELAY: 1.9,         // just longer than SHIRT_SHOW, so play resumes
                              // as the shirt card clears rather than under it

  /* --- the shirt card ----------------------------------------------------
     Every time you get splatted, all three shirts fill the screen with the
     ruined ones wearing the food that actually hit them. Hits 1 and 2 flash
     past; hit 3 holds and offers the laundry.                              */
  SHIRT_SHOW: 1.7,            // seconds the card is up on hits 1 and 2
  SHIRT_FADE: 0.28,           // fade in / fade out
  LAUNDRY_RESTORES: 3,        // clean shirts a trip to the laundry gives back

  /* --- the tray shield ---------------------------------------------------
     Tray up = safe, tray down = you can shoot and you can be hit. It drops
     quickly because you commit to a shot, and comes back up slowly -- that
     lag is the entire risk of taking a shot. TRAY_SAFE is where the tray
     stops counting as cover, so what you see is exactly what protects you. */
  TRAY_DOWN: 0.13,            // seconds to drop the tray and draw
  TRAY_UP:   0.34,            // seconds to get it back up (the risk window)
  TRAY_SAFE: 0.55,            // raise value at or above which you are covered

  /* --- scoring ----------------------------------------------------------- */
  SCORE: {
    hit: 100,
    depthMul: { 1450: 2.0, 1680: 1.5, 1900: 1.0 },  // farther == worth more
    headshot: 2.0,
    quickDraw: 250,           // hit within QUICK_WINDOW of the pop-up
    quickWindow: 1.2,
    ownMedicine: 300,
    peelSlip: 500,
    bankShot: 750,
    doubleDip: 600,
    rindBreaker: 1000,
    comboStep: 0.10,          // +10% per consecutive hit
    comboMax: 3.0,
    flawless: 5000,           // cleared with zero misses
    untouched: 2500,          // cleared without ever being forced down
    timeBonus: 10             // per second remaining on the clock
  },
  LEVEL_TIME: 90,

  /* --- the slingshot -----------------------------------------------------
     anchorL / anchorR are the two prong knobs expressed as a fraction of the
     sprite, solved off the artwork's alpha channel rather than eyeballed. If
     you re-export slingshot_alpha.png with different framing, re-solve these
     two pairs and the rubber will still land exactly on the knobs.           */
  SLING: {
    prongY:  2062,            // screen y the band anchor line sits at
    anchorL: [0.111, 0.072],
    anchorR: [0.883, 0.072],
    pullMax: 152,             // pouch travel at full draw
    pullSide: 150,            // pouch sideways travel at full lateral aim
    tiltMax: 0.075            // radians the whole rig leans into the shot
  },

  /* --- feel -------------------------------------------------------------- */
  SHAKE_HIT: 9,
  SHAKE_SPLAT: 34,
  POP_TIME: 0.32,             // rise/descend animation length
  DEBUG_KEY: 'd'
};
