# Character-Canvas
This is A Sibling extension to Persona Library which was Inspired By Character Library. Character Canvas does much less than Character Library And I Would Highly Recommend using that over this Or Like i chose to do Use them In Conjunction. Character Library adds its own Whole menu Character Canvas Overtakes The Native Character Menu. (Written By Maxwell) 

A full-bleed gallery grid for your characters, replacing SillyTavern's native Character Management list — with every native character field kept as its own real, editable box, plus one custom feature layered on top: Sections.

Sibling extension to Persona Library, same visual language, pointed at characters instead of personas.
<img width="1918" height="917" alt="Screenshot 2026-09-08 003356" src="https://github.com/user-attachments/assets/1d989647-c8b4-41ae-969b-3bccad1b176b" />
<img width="1918" height="912" alt="Screenshot 2026-09-08 003426" src="https://github.com/user-attachments/assets/bd1cc846-ae39-4694-a7a4-67b946865ce3" />
<img width="1918" height="912" alt="Screenshot 2026-09-08 003630" src="https://github.com/user-attachments/assets/8fb807ed-68f0-47fb-956d-bd6f00dc96e0" />
<img width="1918" height="921" alt="Screenshot 2026-09-08 010306" src="https://github.com/user-attachments/assets/d88292a4-34b7-4c20-a476-abe9562b4da4" />
<img width="1918" height="917" alt="Screenshot 2026-09-08 010328" src="https://github.com/user-attachments/assets/8689bfea-e4be-4919-a289-320c447cd0fe" />
<img width="1918" height="917" alt="Screenshot 2026-09-08 010335" src="https://github.com/user-attachments/assets/bdb766e8-45a3-4013-b102-cd4b0bd5ca5a" />
<img width="1918" height="918" alt="Screenshot 2026-09-08 010423" src="https://github.com/user-attachments/assets/50dc0c45-d7d4-417f-9cc5-713c9d108870" />
<img width="1918" height="912" alt="Screenshot 2026-09-08 010456" src="https://github.com/user-attachments/assets/ba7819c6-09d1-4c29-9e3f-c441c15b49c6" />




The gallery
Grid of portraits instead of the default list — search, sort, and a tile-size slider all live in one toolbar above the grid.
Search matches against name, description, and tags as you type.
Sort: Name A–Z, Name Z–A, Recently created, Favorites first.
Full-resolution images, not SillyTavern's own downscaled thumbnails — the grid loads each character's actual portrait file, so nothing looks soft or blurry even at large tile sizes. Lazy-loaded, so this stays fast even with a couple hundred characters in the list.
Currently active character gets a highlighted border in the grid; a gold star badge marks favorites.
+ New Character creates a blank card and drops you straight into it.
A Worlds/Lorebooks shortcut button in the toolbar opens SillyTavern's own World Info drawer directly.
Open native Character menu toggle is always available above the gallery — instantly swap back to SillyTavern's stock character list for anything this extension doesn't cover (bulk operations, import/export flows, etc.), then swap back with the same button.
Opening a character

Click a tile to open it in a full detail view with three tabs:

Details

A clean, read-only read-through of everything written for that character — Description, Personality, Scenario, First Message, Example Dialogue, Alternate Greetings, Creator's Notes, System Prompt, Post-History Instructions, Depth Prompt, Tags, Creator, Character Version, and the linked Lorebook, each in its own labeled block. Any field left empty just doesn't show up, so this stays a genuine "does this card have anything in it" view for characters you didn't write yourself.

Edit

Every native field as its own real box — nothing is collapsed or merged into a single text blob:

Name (in the header, editable from any tab)
Description (see Sections, below)
Personality, Scenario, First Message, Example Dialogue
Alternate Greetings (add/remove as many as you want)
Creator's Notes, System Prompt, Post-History Instructions
Depth Prompt (its own prompt text, plus Depth and Role)
Tags, Creator, Character Version, Talkativeness, Favorite

Any text box can be popped into a full-screen focused view via the little expand icon in its corner — useful for a long Description or Example Dialogue on a smaller screen.

Hit Save and it writes straight to the character's real card data — this isn't a shadow copy; the character works identically with this extension disabled.

Preview

Shows exactly what will be written into the Description field when you save — the core text plus every enabled Section, composed together in order — with a live token-count estimate. Nothing else changes here; it's a "check before you commit" view specifically for Sections.

Header actions

Sitting above the tabs, next to the character's name:

Back to grid (the 4-square icon) — closes this character, returns to the gallery grid, keeps the whole panel open
Open chat — jumps straight into a conversation with this character
Duplicate
Character Lore — opens SillyTavern's native "Link to World Info" popup for this specific character (note: this briefly switches your active chat to the character first, since that's how the native button itself works)
Delete (asks for confirmation first)
Save (only shown on the Edit tab)
X — closes the entire panel, collapsing it the same way clicking the native drawer icon would. This is deliberately different from "Back to grid": one keeps you in the extension, the other backs all the way out.

Use the ◀ ▶ arrows on either side of the portrait to flip to the previous/next character in your current filtered/sorted list without closing the detail view.

If you have unsaved edits, closing (either way) asks you to confirm before discarding them.

Sections — the one custom feature

Everything above just exposes SillyTavern's own native fields. Sections is the actual custom addition: extra labeled blocks that live inside the Description box specifically, and only that box.

+ Add custom section — a freeform title + paragraph block, for anything that reads better as prose than a list of fields.
+ Add category — nine ready-made character-sheet categories, each with its own set of labeled fields you fill in individually:
Common Characteristics (Species, Nationality, Sex, Gender, Age, ...)
Appearance Overview (Eyes, Hair, Height, Weight, Physique, ...)
Mentality (Intelligence, Personality, Habits, Fears, Desires, ...)
Character Lore (Background, Education, Career, Goals, Secrets, ...)
Beliefs & Values (Ethics, Morals, Worldview, Religion, Politics, ...)
Character Statistics (Skills, Talents, Powers, Weaknesses, ...)
Equipment Statistics (Clothing, Artifacts, Weapons, ...)
Social Relationships (Family, Spouse, Friends, Allies, Enemies, ...)
Lewd Info (Fetishes, sexual stats/experience-related fields, ...)
Every section can be toggled on/off (an unchecked section is kept but left out when composed), reordered, or removed (asks for confirmation, since this deletes everything typed into it).
Reordering works two ways: drag the handle on desktop, or use the ▲/▼ buttons — native drag-and-drop simply doesn't fire on touch devices at all, so the arrow buttons are there specifically for phones/tablets.

On Save, the Description box's own text (the "core") plus every enabled section gets composed together — [Section Title: content] per section — and that combined result is what actually gets written to the character's real description field. The Sections breakdown itself (which parts are which) is remembered separately so you can keep editing them individually next time, but the character card itself only ever contains the final, composed text — so the character behaves completely normally even without this extension installed.

Compatibility notes
Works with or without PTMT (ProbablyTooManyTabs). Without it, the panel now renders as a full, centered pane matching SillyTavern's main chat width — not the narrow default side-drawer — on desktop. With PTMT managing this drawer as a pane/tab, Character Canvas gets out of the way entirely and lets PTMT control sizing. (NOTE I HIGHLY RECOMENDED USING PTMT WITH Character CANVAS there is some slight sizing issues going on with the editor without using PTMT but it still functional over all just a tad cramped so dealers choice I guess Written by Maxwell)

Mobile-safe: layout stacks vertically below ~620px, section reordering has the up/down button fallback mentioned above, and the panel already goes full-width on any screen under 1000px regardless of the desktop-only pane-width fix.
Every mutating action (Save, Duplicate, Delete, Replace Image) shows both a toast notification and a small inline confirmation line in the Edit tab itself, so it's harder to miss whether something actually worked.
What this deliberately doesn't do
No Variants. Persona Library's Variants system (making a persona's description change depending on which character/chat is active) isn't ported here — it doesn't map cleanly onto characters editing themselves.
No lorebook/World Info editor. You get a read-only "linked lorebook" line and a shortcut button into SillyTavern's own World Info drawer; actually editing entries still happens there, not in this extension.

Disclaimer 
==================================================================================
Entirely Vibe coded. Unlike Persona Library that is mostly vibe codded with the help of some human coding this doesn't have that added luxury i had it made in some of my spare time just because i Could there was some interest expressed in something like this and i wanted something slightly less featureful than character Library to use in Conjunction with character library. Most of this read Me was Composed by Claude as well. However this section i completely typed up myself. anywhere where i added my own two cents has a note denoting it was written by me (Written By Maxwell) like such and Like wise the few screenshots were taken by me as well. 
