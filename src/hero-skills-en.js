// 英雄スキルの英語版（hero-skills-ja.js と同じ順番・2026-11-20）。
// ・名前はカタカナの英語名を元の英語に戻したもの。漢字の名前は意味を英語にしたもの（英語版のゲームの名前と違う場合がある）。
// ・説明は日本語版の説明を英語にしたもの。数値は日本語版と同じ（初期値 / 最大強化時 → base / max）。
// ・能力値の名前は Kingshot の英語：Attack・Lethality（殺傷力）・Defense・Health（HP）。
export const HERO_SKILL_TYPES_EN = Object.freeze({ "討伐スキル": "Conquest Skills", "遠征スキル": "Expedition Skills", "専用装備スキル": "Exclusive Gear Skill" });

export const HERO_SKILLS_EN = [
  // Alcar
  ["Glory Moment", "Becomes invincible and reduces damage taken by nearby allies for 2s. While invincible, can't move or use skills and is immune to control."],
  ["Split Lance", "Pierces enemies ahead for Attack ×70% (base) / ×98% (max) damage and increases their damage taken by 20% for 2s."],
  ["Revival Spirit", "After Glory Moment, restores Health equal to Attack ×30% (base) / ×42% (max) every second for 5s."],
  ["Assist Ally", "Every 5 turns, reduces damage taken by Infantry and Archers for 2 turns."],
  ["Champion Will", "Increases damage dealt by Infantry, Cavalry and Archers."],
  ["Chance of Fury", "Each Infantry attack deals extra damage to the target and increases the enemy's damage taken for 1 turn."],
  ["Unyielding Faith", "Allies affected by Glory Moment gain 30% (base) – 42% (max) Attack for 2.5s."],
  ["Glory Oath", "Increases garrison Health by 5% (base) – 15% (max)."],
  // Amadeus
  ["Triple Slash", "Launches enemies in an area high into the air and slashes 3 times for Attack ×160% (base) / ×224% (max) damage."],
  ["Sword Aura", "Normal attacks release a sword aura dealing Attack ×15% (base) / ×23% (max) damage in a line ahead."],
  ["Onslaught", "Increases Attack while Health is 50% or more."],
  ["Battle Ready", "Increases Lethality of all troops."],
  ["Sword Mastery", "Increases Attack of all troops."],
  ["Unrighteous Strike", "Chance to increase damage dealt by all troops by 50%."],
  ["Twin Blade Guard", "Reduces damage taken by 10% (base) – 30% (max)."],
  ["Art of Truth", "Increases rally troop Attack by 5% (base) – 15% (max)."],
  // Eric
  ["Hammer Swing", "Deals Attack ×120% (base) / ×168% (max) damage to the target ahead and reduces its attack speed by 50% for 4s."],
  ["Battle Body", "When hit, 8% chance (base) to gain 8% Defense, or 16% chance to gain 20% at max, for 2s; stacks up to 5 times."],
  ["Heavy Smash", "Deals Attack ×80% (base) / ×112% (max) damage in a cone, with a 30% chance to stun for 1s."],
  ["Purify", "Reduces Attack of all enemy troops."],
  ["Willpower", "Reduces damage taken by all troops."],
  ["Inspire", "Increases Health of all troops."],
  ["Hammer Blessing", "Increases damage dealt by 10% (base) – 30% (max)."],
  ["Hammer Defense", "Increases garrison Defense by 5% (base) – 15% (max)."],
  // Petra
  ["Judgment Card", "Deals Attack ×270% (base) / ×378% (max) damage and randomly applies −20% Attack (2s) or stun (1.5s)."],
  ["Surprise Card", "Heals the ally hero with the lowest Health ratio. Base heal is Attack ×100% (base) / ×140% (max); the amount is random from 5% to 400% of the base."],
  ["Merciless Fate", "Deals damage over time based on Attack ×50% (base) / ×70% (max); final damage is random from 5% to 600% of the base."],
  ["Doom", "When troops attack, 50% chance to increase the enemy's damage taken."],
  ["Lucky Card", "When troops attack, 50% chance to increase that attack's damage."],
  ["Guardian Card", "40% chance to reduce damage taken by all troops."],
  ["Shuffle Magic", "Raises the upper and lower limits of all \"floating\" skills by 30% (base) – 150% (max)."],
  ["Plan of Fate", "Increases rally troop Attack by 5% (base) – 15% (max)."],
  // Diego
  ["Flawless", "Creates a shield worth Attack ×220% (base) / ×380% (max) that absorbs damage first, for 5s."],
  ["Steadfast Blade", "Reduces enemy Attack and increases own Attack based on the number of intimidated enemy heroes, for 3s."],
  ["Shadow Step", "Chance to dodge enemy normal attacks and chance to land critical hits."],
  ["Defensive Command", "Increases Defense and Health of all troops."],
  ["Formless Blade", "When troops attack, 50% chance to deal extra damage: 10% (base) – 50% (max)."],
  ["Awe-Inspiring Aura", "Increases Lethality of all troops."],
  ["Heavy Blade", "Adds to Flawless's shield value; while the shield lasts, reflects part of the damage taken back to the enemy."],
  ["Masterful Simplicity", "Increases garrison Defense."],
  // Liz
  ["Big Bubble", "Disables the target for 1.5s and deals Attack ×220% (base) / ×300% (max) damage to it and nearby enemies."],
  ["Slow Potion", "Deals Attack ×100% (base) / ×140% (max) damage to one enemy and reduces nearby enemies' attack speed by 50% for 3s."],
  ["Light Potion", "Increases own attack speed."],
  ["Power Booster", "Each round, 10% to 50% chance to increase Lethality of all troops by 50%."],
  ["Energy Booster", "Increases Health of all troops."],
  ["Ride Master", "When Cavalry attack, 50% chance to deal extra damage: 30% (base) – 150% (max)."],
  ["Splash Bubble", "Increases own Attack; when Big Bubble's disable ends, deals extra damage around the target."],
  ["Hyper Booster", "Increases garrison Lethality."],
  // Luna
  ["Starfall", "Deals Attack ×220% (base) / ×300% (max) damage in an area and stuns for 1.5s."],
  ["Barrage Arrow", "Deals Attack ×100% (base) / ×140% (max) damage to enemies in an area."],
  ["Hunting Rhythm", "Each enemy unit defeated increases Attack by 0.5% (base) / 2.5% (max), stacking up to 15 times."],
  ["Moonlight Beacon", "Increases Attack of all troops."],
  ["Jungle Revenge", "Every 2 turns, reduces the Attack of all enemies for 1 turn."],
  ["Flash Arrow", "Each Archer attack deals extra damage to the target."],
  ["Starspirit Afterglow", "Summons a star spirit that draws nearby enemies' attacks."],
  ["Moonlit Power", "Increases rally troop Attack."],
  // Charles
  ["Revenger", "Deals Attack ×100% (base) / ×140% (max) damage in a cone ahead and stuns for 1s, then gains 20% (base) / 100% (max) Attack for 2s."],
  ["Farewell", "Deals Attack ×200% (base) / ×280% (max) damage to nearby enemies."],
  ["Carefree", "Chance to reduce damage taken by 50%."],
  ["Panzer Aura", "Reduces Lethality of all enemies."],
  ["Steel Body", "Reduces damage taken by all troops."],
  ["Love and Justice", "Restores Health of all troops."],
  ["Master Mechanic", "Once per battle, the first time Health drops below 50%, restores 7% (base) – 35% (max) of max Health and gains 6% (base) – 30% (max) Defense until the battle ends."],
  ["Grand Entrance", "Increases Health of all allies by 3% (base) – 15% (max)."],
  // Ava
  ["Bomber Paint", "Spreads explosive paint in a small area, dealing Attack ×50% (base) / ×70% (max) damage every 0.5s for 3s."],
  ["Spoil Paint", "Deals Attack ×25% (base) / ×35% (max) damage every 0.5s and increases the target's damage taken by 5% (base) / 25% (max) for 2s."],
  ["Fake Paint", "Increases own Defense."],
  ["Analyze", "Reduces Defense of all enemy troops."],
  ["Light & Shadow", "Every 4 turns, increases damage taken by all enemies for 2 turns."],
  ["Cool & Hot", "Increases Lethality of all allies."],
  ["Color Sense", "Increases own damage dealt by 25% and reduces Attack of targets hit by paint by 5% (base) – 25% (max)."],
  ["Chroma Storm", "When a rally starts, increases Lethality of all troops by 5% (base) – 15% (max)."],
  // Wee & Woo
  ["Sky High Shot", "Deals Attack ×300% (base) / ×420% (max) area damage."],
  ["Special Napalm", "Deals Attack ×60% (base) / ×84% (max) area damage and leaves a burning zone for 2s that deals Attack ×17% (base) / ×25% (max) every 0.5s."],
  ["Cannon Bowler", "Increases own Attack."],
  ["Artillery Corps", "Increases Attack and Lethality of all troops."],
  ["Barrage Fire", "Increases damage dealt by all troops to Archers and Infantry."],
  ["Heavy Cannon Sortie", "When troops attack, 10% to 50% chance to deal 50% extra damage."],
  ["Cool Gunner", "After Sky High Shot, increases attack speed of ally heroes and escorts by 6% (base) – 14% (max) for 5s."],
  ["Secret Powder Keg", "Increases garrison Attack by 5% (base) – 15% (max)."],
  // Helga
  ["Antler Charge", "Deals Attack ×160% (base) / ×224% (max) area damage, knocks enemies back and stuns them for 1s."],
  ["Pursuit", "Deals Attack ×150% (base) / ×210% (max) damage to the target."],
  ["Berserk", "When hit, 10% chance to gain 4% (base) / 12% (max) Attack for 3s; stacks up to 5 times."],
  ["Guardian's Oath", "Chance to reduce damage taken by all troops by 50%."],
  ["Heroic Cry", "Increases Attack of all troops."],
  ["Wilderness Balance", "Increases Lethality of all troops."],
  ["Frenzy Resonance", "Increases damage dealt by 10% (base) – 30% (max)."],
  ["Frenzy Resonance (Expedition)", "Increases rally troop Lethality by 5% (base) – 15% (max)."],
  // Jabel
  ["Lance Spike", "Deals Attack ×180% (base) / ×252% (max) damage in an area and roots targets for 1.5s."],
  ["Head-On", "Deals Attack ×150% (base) / ×210% (max) damage to the target."],
  ["Tenacity", "Increases attack speed when Health is 50% or lower."],
  ["Red Banner", "Chance to reduce damage taken by all troops by 50%."],
  ["Valor", "When troops attack, 50% chance to increase extra damage dealt."],
  ["Valkyrie", "Increases Lethality of all troops."],
  ["Crimson Will", "Increases damage dealt by 10% (base) – 30% (max)."],
  ["Trust", "Increases garrison Lethality by 5% (base) – 15% (max)."],
  // Saul
  ["Rapid Fire", "Attacks repeatedly, each hit dealing Attack ×55% (base) / ×75% (max) damage and stunning the target for 2s."],
  ["Indestructible", "Increases own Defense when Health is 50% or lower."],
  ["Improved Methods", "Increases attack speed."],
  ["Special Training", "Increases Defense and Health of all troops."],
  ["Recycle", "Increases building upgrade speed and reduces resource costs."],
  ["Siege Expert", "Increases Lethality of all troops."],
  ["Loyalty", "Increases Attack by 24%."],
  ["Best Defense Is Offense", "Increases garrison Attack by 15%."],
  // Zoe
  ["Sword Shield Assault", "Deals Attack ×60% (base) / ×84% (max) damage every 0.5s and increases the target's damage taken by 10% (base) / 30% (max) for 2s."],
  ["Pain Excitement", "When Health drops below 50%, restores 20% (base) / 40% (max) of max Health. Once per battle."],
  ["God Power", "Increases attack speed of all ally heroes."],
  ["Ridge Wound", "When troops attack, 20% chance to inflict a wound that deals extra damage each turn for 3 turns."],
  ["Emotional Control", "Increases Attack of all troops."],
  ["Infinite Technique", "When troops attack, 50% chance to increase the enemy's damage taken."],
  ["Death Fight", "After Pain Excitement, gains 8% (base) – 24% (max) Attack until the battle ends."],
  ["Unrighteous Princess", "Increases garrison Attack by 5% (base) – 15% (max)."],
  // Hilde
  ["Healing Prayer", "Restores Health to all ally heroes equal to Hilde's Attack ×200% (base) / ×280% (max)."],
  ["Atonement", "Heals the ally hero with the lowest Health ratio for Attack ×100% (base) / ×140% (max)."],
  ["Edification", "Deals Attack ×140% (base) / ×196% (max) damage to the target and disables it for 1s."],
  ["Penance", "Increases Attack and Defense of all troops."],
  ["Potion Infusion", "When troops attack, 25% chance to deal extra damage."],
  ["Trial of Will", "Chance to reduce damage taken by all troops by 50%."],
  ["Holy Prayer", "Increases Hilde's healing effects by 30% (base) – 70% (max)."],
  ["Toughness", "Increases garrison Health by 5% (base) – 15% (max)."],
  // Marlin
  ["Backwash", "Deals Attack ×200% (base) / ×280% (max) area damage and disables for 1.5s."],
  ["Drunken Mist", "Deals Attack ×50% (base) / ×70% (max) area damage."],
  ["Lucky Shot", "After a number of normal attacks, the next attack stuns the target."],
  ["Unpredictable", "Chance to increase damage dealt by all troops by 50%."],
  ["Rum", "When troops attack, 20% chance to reduce the enemy's Lethality for 2 turns."],
  ["Enhanced Gunpowder", "When troops attack, 50% chance to increase damage dealt."],
  ["Drinker", "Each normal attack restores Health equal to Attack ×15% to the ally hero with the lowest Health."],
  ["Invincible Armada", "Increases rally troop Lethality by 15%."],
  // Jaeger
  ["Death Attract", "Deals Attack ×160% (base) / ×224% (max) damage to enemies in an area and stuns for 2s."],
  ["Clumsy Act", "On success, deals Attack ×220% (base) / ×300% (max) damage to the target; on failure, restores Health equal to Attack ×50%."],
  ["Secret Story", "Increases damage dealt to enemies for 3s."],
  ["Storm Song", "20% chance to increase damage dealt by all troops by 8% (base) / 40% (max) for 3 turns."],
  ["Conflict Song", "When troops attack, 20% chance to reduce the enemy's Lethality by 10% (base) / 50% (max) for 2 turns."],
  ["Festival Song", "Increases Health of all troops by 5% (base) / 25% (max)."],
  ["Silent Silence", "Silences the target for 3s (base) / 5s (max) and deals Attack ×220% (base) / ×300% (max) damage."],
  ["Hymn", "Increases garrison Health by 15%."],
  // Margot
  ["Trick Attack", "Deals Attack ×300% (base) / ×420% (max) area damage to enemies."],
  ["Trick Through", "When hit by a normal attack, chance to parry and negate the damage."],
  ["Crash Strike", "Deals Attack ×100% (base) / ×140% (max) damage and disables for 1.5s."],
  ["Destroy", "Increases Attack of all troops by 5% (base) / 25% (max)."],
  ["Tactics", "When troops are hit by normal attacks, 4% (base) / 20% (max) chance to evade the damage."],
  ["Trick Technique", "Cavalry have a 25% chance to attack once more for 120% (base) / 200% (max) damage."],
  ["Ambush", "On normal attacks, 40% chance to attack again for Attack ×25% (base) – 45% (max) damage."],
  ["Death Match", "Increases garrison Lethality by 5% (base) – 15% (max)."],
  // Rosa
  ["Center Attention", "Removes debuffs from all allies and increases Attack; immune to debuffs for the stated duration."],
  ["Fan Dance", "Deals Attack ×220% (base) / ×300% (max) damage to enemies along its path."],
  ["Mind Shatter", "Reduces attack speed and healing of all enemies."],
  ["Noise Time", "40% chance to increase damage dealt by all allies by 10% (base) / 50% (max)."],
  ["Charm Dance", "Reduces damage dealt by all enemies by 4% (base) / 20% (max)."],
  ["Golden Rhythm", "Increases Archer Attack by 6% (base) / 30% (max)."],
  ["All-Night Festa", "After Center Attention, gains 5% (base) – 15% (max) Attack until the battle ends."],
  ["Inspire Dance", "Increases rally troop Lethality by 5% (base) – 15% (max)."],
  // Long Fei
  ["Sacred Jade Bath", "Increases attack speed for 4s and becomes immune to control."],
  ["Vanish Like Mist", "Reduces damage taken when Health is below 50%."],
  ["Overwhelming Force", "Increases Attack when Health is below 50%."],
  ["Heavenly Courage", "40% chance to reduce damage taken by all troops."],
  ["Iron Muscles", "Increases Defense of all troops."],
  ["Cup Toss Kick", "When troops attack, 25% chance to deal extra damage."],
  ["Three Hundred Cups", "Extends Sacred Jade Bath by 1.5s; during the extension, restores Health equal to 15% of damage dealt."],
  ["True and False", "Increases garrison Attack by 15%."],
  // Thrud
  ["Storm Axe", "Deals Attack ×60% (base) / ×84% (max) area damage to a random target (heroes first)."],
  ["Berserker Throw", "Deals Attack ×50% (base) / ×70% (max) damage in an area and stuns for 1.5s."],
  ["Wolf Banquet", "Increases Attack of all allies by 3% (base) / 5% (max)."],
  ["Fanatic", "Reduces damage taken by Infantry and Archers by 3% (base) / 15% (max) and increases their damage dealt by the same amount."],
  ["Reckless", "When Cavalry attack, 20% chance to deal extra damage to all enemies equal to 20% (base) / 100% (max) of Attack."],
  ["Ancestor", "Every 4 Cavalry attacks, all troops deal 5% (base) / 25% (max) more damage and take that much less, for 2 turns."],
  ["Rage Axe", "After Storm Axe, 25% (base) – 35% (max) chance to stun the target for 1s."],
  ["Wolf Kiss", "Increases rally troop Lethality by 5% (base) – 15% (max)."],
  // Vivian
  ["Golden Shot", "Deals Attack ×180% (base) / ×252% (max) area damage to a back-row target (heroes first) and reduces attack speed by 50% for 2s."],
  ["Good Luck", "Deals Attack ×100% (base) / ×140% (max) damage to an enemy (heroes first); 50% chance of a critical hit for double damage."],
  ["Gold Rush", "Deals Attack ×35% (base) / ×49% (max) damage per second to enemies in an area for 3s."],
  ["Awaiting", "When troops attack, increases the target's damage taken by 5% (base) / 25% (max)."],
  ["Barrage Shot", "Every 4 troop attacks, the next attack deals 20% (base) / 100% (max) extra damage, and the target takes 5% (base) / 15% (max) extra damage from the next hit."],
  ["Greed Trap", "Every 4 Archer attacks, triggers a trap dealing 12% (base) / 60% (max) extra damage to all enemies."],
  ["Royal Shooter", "Each skill use deals Attack ×50% (base) – 70% (max) damage to a random target (heroes first)."],
  ["Full Bounty", "Increases garrison Defense by 5% (base) – 15% (max)."],
  // Triton
  ["Will of the Tide", "Becomes invincible for 2s and charges forward, dealing Attack ×100% (base) / ×140% (max) area damage."],
  ["Wrath of Kings", "Increases own Attack by 8% (base) / 24% (max) and Defense by 16% (base) / 48% (max) for 4s."],
  ["Lethal Strike", "Each normal attack deals Attack ×20% damage (the table lists 20% base / 28% max; the meaning of the max value is unconfirmed)."],
  ["Power of Law", "Increases Defense of all troops by 5% (base) / 25% (max)."],
  ["Power of War", "Increases damage dealt by all troops by 6% (base) / 30% (max)."],
  ["Power of Oath", "Increases Infantry Health by 4% (base) / 20% (max), and Cavalry and Archer Health by 6% (base) / 30% (max)."],
  ["Crystal Modification", "Increases Triton's damage dealt by 10% (base) – 30% (max)."],
  ["True and False", "Increases garrison Defense by 5% (base) – 15% (max)."],
  // Sophia
  ["Marionette", "Deals Attack ×100% (base) / ×140% (max) damage to enemies in an area and confuses them for 1s."],
  ["Pain Mark", "Deals Attack ×50% (base) / ×70% (max) damage in an area and increases damage taken by 2% (base) / 6% (max) for 4s."],
  ["Mark Whip", "When applying Pain Mark, gains 8% (base) / 24% (max) Attack and deals 4% (base) / 12% (max) more damage to marked targets."],
  ["Contract Bind", "Each turn, 8% (base) / 40% (max) chance to reduce damage taken by all troops by 50%."],
  ["Panic Damage", "Every 2 turns, frightens enemies; the next turn adds 40% (base) / 200% (max) Cavalry attack damage. Fear lasts 1 turn."],
  ["Panic the End", "Increases troops' damage dealt to frightened enemies by 15% (base) / 75% (max)."],
  ["Overmind Eye", "On attack, 2% (base) – 8% (max) chance to confuse the target for 1s; confused enemies attack nearby targets at random."],
  ["Dark Knight Queen", "Increases garrison Lethality by 5% (base) – 15% (max)."],
  // Yang
  ["Mega Throw", "Deals Attack ×100% (base) / ×140% (max) damage in a line; the snow spirit returns and deals the same damage again."],
  ["Chain Shot", "15% (max 30%) chance to fire a combo from a special gun, dealing one extra hit to the target."],
  ["Headshot", "Chance to land a critical hit when dealing damage."],
  ["Avalanche", "Every 4 turns, all troops make one extra attack for extra damage."],
  ["Ice Zone", "Each Archer attack has a 40% chance to deal 20% (base) / 100% (max) extra damage to the target."],
  ["Ambush", "Each turn, chance to increase damage dealt by all troops; trigger rate 8% (base) – 40% (max)."],
  ["Rapid Fire", "Fires 5 shots at random enemies for Attack ×40% (base) / ×56% (max) damage each; escorts are defeated instantly."],
  ["Attack Defense", "Increases rally troop Lethality by 5% (base) / 15% (max)."],
  // Quinn
  ["Headshot", "Deals 400% (base) / 560% (max) of Attack as damage to an enemy."],
  ["Quick Shot", "Increases Quinn's attack speed by 10% (base) / 30% (max)."],
  ["Survival of the Fittest", "Increases Quinn's damage dealt by 10% (base) / 30% (max)."],
  ["Danger Sense", "Reduces damage taken by all troops by 4% (base) / 20% (max)."],
  ["Weak Spot Shot", "When troops attack, 50% chance to increase extra damage dealt by 10% (base) / 50% (max)."],
  // Howard
  ["Shield Impact", "Deals 200% (base) / 280% (max) of Attack as area damage and knocks enemies back."],
  ["Shield Wall", "Increases Defense of all ally heroes by 5% (base) / 15% (max)."],
  ["Shield Block", "Reduces own damage taken by 10% (base) / 30% (max)."],
  ["Protect", "Reduces damage taken by all troops by 4% (base) / 20% (max)."],
  ["Weakening Blow", "Reduces Attack of all enemy troops by 4% (base) / 20% (max)."],
  // Diana
  ["Explosive Arrow", "Deals 210% (base) / 290% (max) of Attack to one enemy and 70% (base) / 98% (max) to enemies in a small area around it."],
  ["Archer's Talent", "Increases attack speed by 10% (base) / 30% (max)."],
  ["Deadly", "Increases critical rate by 7% (base) / 20% (max)."],
  ["Tough Body", "Reduces governor stamina use by 10% (base) / 20% (max)."],
  ["Swift Action", "Increases march speed by 20% (base) / 100% (max)."],
  // Chenko
  ["Machine Gun Sweep", "Deals 55% (base) / 75% (max) of Attack to enemies in a cone every 0.5s for 2s."],
  ["Armor Upgrade", "Increases Defense by 25% (base) / 70% (max)."],
  ["Weapon Upgrade", "Increases Attack by 8% (base) / 24% (max)."],
  ["Fully Armed", "Increases Lethality of all troops by 5% (base) / 25% (max)."],
  ["Armor", "Reduces damage taken by all troops by 4% (base) / 20% (max)."],
  // Gordon
  ["Barbecue", "All allies restore Health equal to Gordon's Attack ×200% (base) / ×280% (max) and gain 5% (base) / 7% (max) Attack for 4s."],
  ["Storm Kitchen", "Reduces own damage taken by 10% (base) / 30% (max)."],
  ["Emergency Rations", "Restores Health equal to Attack ×50% (base) / ×70% (max) every 5s."],
  ["Happy Gourmet", "Increases Health of all troops by 5% (base) / 25% (max)."],
  ["Harsh Words", "Increases Attack of all troops by 5% (base) / 25% (max)."],
  // Olive
  ["Arrow Rain", "Deals Attack ×180% (base) / ×252% (max) damage."],
  ["Mark", "Marks the target with a hunter's mark, increasing this attack's damage by 10% (base) / 30% (max)."],
  ["Cultivation Expert", "Increases the city's mill output by 5% (base) / 25% (max)."],
  ["Food Supply", "Increases bread gathering speed on marches by 5% (base) / 25% (max)."],
  // Edwin
  ["Homemade Bomb", "Deals Attack ×140% (base) / ×196% (max) damage to the target and nearby enemies."],
  ["High-Power Bomb", "10% (base) / 20% (max) chance to stun the target for 0.5s (base) / 1.5s (max)."],
  ["Blasting Engineer", "Increases the city's stone quarry output by 5% (base) / 25% (max)."],
  ["Boulder Mining", "Increases stone gathering speed on marches by 5% (base) / 25% (max)."],
  // Seth
  ["Flame Hammer", "Deals Attack ×200% (base) / ×280% (max) damage to enemies in a cone ahead."],
  ["Armor Reinforcement", "Reduces own damage taken by 10% (base) / 30% (max)."],
  ["Strike While Hot", "Increases the city's iron mine output by 5% (base) / 25% (max)."],
  ["Blacksmith", "Increases iron gathering speed on marches by 5% (base) / 25% (max)."],
  // Forrest
  ["Axe Whirlwind", "Deals Attack ×80% (base) / ×110% (max) damage to nearby enemies every 0.5s for 3s."],
  ["Sharp Blade", "Increases damage dealt by 10% (base) / 30% (max)."],
  ["Family Secret", "Increases the city's lumber mill output by 5% (base) / 25% (max)."],
  ["Master Lumberjack", "Increases wood gathering speed on marches by 5% (base) / 25% (max)."],
  // Fahd
  ["Sandstorm", "Reduces Attack of enemies in an area by 1% (base) / 5% (max) for 2s."],
  ["Falcon's Guidance", "After Sandstorm, increases Attack of self and nearby allies by 15% (base) / 35% (max) for 2s."],
  ["Sand General", "Increases Fahd's attack speed by 10% (base) / 30% (max)."],
  ["Sand Shade", "Reduces damage dealt by all enemies by 4% (base) / 20% (max)."],
  ["Forerunner", "Increases march speed of beast-hunting troops by 20% (base) / 100% (max)."],
  // Amane
  ["Cherry Blossom Bloom", "Increases Attack of all ally heroes and escorts by 1.5% (base) / 3.5% (max) and attack speed by 2.5% (base) / 4.5% (max) for 4s."],
  ["Demon-Breaking Arrow", "Deals 150% (base) / 210% (max) of Attack as damage."],
  ["Kagura", "Every 3 normal attacks, increases own attack speed by 1% (base) / 5% (max) until the battle ends."],
  ["Three-Cloth Formation", "Increases Attack of all troops by 5% (base) / 25% (max)."],
  ["Demon-Breaking Prayer", "Increases Infirmary healing speed by 10% (base) / 50% (max)."],
  // Yeonwoo
  ["Scattered Petals", "Slashes 3 times for Attack ×100% / 125% / 150% (base) / ×100% / 175% / 210% (max); the third hit is area damage."],
  ["Flying Swallow", "Deals Attack ×100% (base) / ×140% (max) damage and reduces the target's attack speed by 30% (base) / 50% (max) for 2s."],
  ["Twin Blades", "Increases own Attack by 8% (base) / 24% (max)."],
  ["Battle Stance", "Increases Lethality of all troops by 5% (base) / 25% (max)."],
  ["Learned", "Increases research speed by 3% (base) / 15% (max)."]
];

// ── 英語ページでの置き換え（i18n-en.js が EARLY として登録する）──
// スキル名は短い漢字（「信頼」「浄化」など）が多く、ほかのページの文を書き換えないように、
// スキルカードの中（<h4>・説明の <p>・初期／最大の値）だけで置き換える。
import { HERO_SKILLS_JA } from "./hero-skills-ja.js";

const escHtml = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const typo = s => String(s).replace(/'/g, "’").replace(/"([^"]*)"/g, "“$1”");
const NAME = new Map();
const DESC = new Map();
Object.values(HERO_SKILLS_JA).flatMap(h => (h.groups || []).flatMap(g => g.skills || [])).forEach((s, i) => {
  const en = HERO_SKILLS_EN[i];
  if (!en) return;
  if (!NAME.has(escHtml(s.name))) NAME.set(escHtml(s.name), escHtml(typo(en[0])));
  if (!DESC.has(escHtml(s.description))) DESC.set(escHtml(s.description), escHtml(typo(en[1])));
});

// 初期／最大の欄の値（例：「集結部隊の攻撃力+5%」→「Rally Attack+5%」）。
const VALUE_RULES = [
  [/星霊HPは初期HPの(\d+)%、(\d+)秒存在/g, "Star spirit HP $1% of base, lasts $2s"],
  [/HP50%未満で最大HP(\d+)%回復/g, "Below 50% HP: heal $1% max HP"],
  [/自身\+敵英雄数×(\d+)%/g, "self +$1% per enemy hero"],
  [/被ダメージの(\d+)%反射/g, "reflects $1% of damage taken"],
  [/毎ターン(\d+)%ダメージ/g, "$1% damage per turn"],
  [/被ダメージ(\d+)%軽減/g, "damage taken −$1%"],
  [/(\d+)回ごと/g, "every $1 hits"],
  [/([\d.]+)秒眩暈/g, "$1s stun"],
  [/沈黙(\d+)秒/g, "silence $1s"],
  [/([\d.]+)秒/g, "$1s"]
];
const VALUE_TERMS = [
  ["浮動効果の上限・下限", "Floating effect limits "], ["護衛対象は即時撃破", "escorts defeated instantly"],
  ["英雄・護衛の攻撃速度", "Hero & escort attack speed "], ["追加範囲ダメージ攻撃力", "extra area damage Attack "],
  ["追加シールド攻撃力", "Extra shield Attack "], ["味方全部隊の", "All troops "], ["味方全体の", "All allies "],
  ["集結部隊の", "Rally "], ["集結部隊", "Rally "], ["防衛部隊の", "Garrison "], ["防衛部隊", "Garrison "],
  ["自身の被ダメージ", "Own damage taken "], ["自身攻撃力", "Own Attack "], ["敵攻撃力", "Enemy Attack "], ["対象攻撃力", "Target Attack "],
  ["与ダメージ", "Damage dealt "], ["被ダメージ", "Damage taken "], ["発動率", "Trigger rate "],
  ["総殺傷力", "Total Lethality "], ["総防御力", "Total Defense "], ["総攻撃力", "Total Attack "], ["総HP", "Total Health "],
  ["回避", "Dodge "], ["会心", "Crit "], ["ダメージ", "Damage "], ["殺傷力", "Lethality "], ["防御力", "Defense "], ["攻撃力", "Attack "], ["HP", "Health "],
  ["、", ", "], ["（", " ("], ["）", ")"]
];
export function heroSkillValueEn(value) {
  let s = String(value);
  if (!/[぀-ヿ一-鿿]/.test(s)) return s;
  for (const [re, to] of VALUE_RULES) s = s.replace(re, to);
  for (const [ja, en] of VALUE_TERMS) s = s.split(ja).join(en);
  return s.replace(/ +([+\-−×%])/g, "$1").replace(/ +([,):])/g, "$1").replace(/ {2,}/g, " ").trim();
}

export const HERO_SKILL_EARLY = [
  [/<h4>([^<]+)<\/h4>/g, (m, n) => NAME.has(n) ? "<h4>" + NAME.get(n) + "</h4>" : m],
  [/(<\/div><\/div><p>)([^<]+)(<\/p><\/article>)/g, (m, a, d, c) => DESC.has(d) ? a + DESC.get(d) + c : m],
  [/(<small>(?:初期|最大)<\/small><b>)([^<]*)(<\/b>)/g, (m, a, v, c) => a + escHtml(heroSkillValueEn(v)) + c]
];
