/*
 * Character Canvas — entry point.
 * Mounts the gallery inside SillyTavern's Character Management drawer and
 * hides the native UI underneath it. Any failure leaves the native UI
 * untouched. Direct sibling of Persona Library's index.js, pointed at
 * #right-nav-panel (SillyTavern's actual "Character Management" drawer,
 * confirmed against public/index.html) instead of #PersonaManagement.
 */

import { createCharacterCanvas } from './modules/gallery.js';
import { stAdapter, ctx } from './modules/st-adapter.js';

const HOST_ID = 'character-canvas-host';
const NATIVE_TOGGLE_ID = 'character-canvas-native-toggle';
let instance = null;
let observer = null;
let mountQueued = false;

function characterBlock() {
    // #right-nav-panel is SillyTavern's ENTIRE "Character Management" drawer
    // — confirmed against public/index.html. It holds several siblings we
    // didn't originally account for: #CharListButtonAndHotSwaps (the pin/
    // lock button + the "Characters Hotswap" favorite-portrait strip),
    // #rm_PinAndTabs (a big <h2> showing the currently-open character/group
    // name, plus a token-count bar), and only THEN, nested inside
    // .scrollableInner alongside the solo character edit form and the
    // import form, #rm_characters_block itself (the actual list). Mounting
    // one level up at #right-nav-panel and hiding every OTHER direct child
    // of THAT takes over the whole drawer in one shot — the same approach
    // Persona Library uses on #PersonaManagement — rather than chasing each
    // of those sibling bars down individually.
    return document.querySelector('#right-nav-panel')
        ?? document.querySelector('#rm_characters_block')
        ?? document.querySelector('#rm_print_characters_block')?.parentElement
        ?? null;
}

function setNativeToggleLabel(btn) {
    const showingNative = document.body.classList.contains('cc-native-override');
    btn.textContent = '';
    const icon = document.createElement('i');
    icon.className = showingNative ? 'fa-solid fa-arrow-left' : 'fa-solid fa-arrow-up-right-from-square';
    const label = document.createElement('span');
    label.textContent = showingNative ? 'Back to Character Canvas' : 'Open native Character menu';
    btn.append(icon, label);
    btn.title = showingNative
        ? 'Return to the Character Canvas gallery'
        : 'Temporarily reveal SillyTavern\'s original Character List panel (for functions Character Canvas doesn\'t cover yet, e.g. bulk edit)';
}

function ensureNativeToggle(block) {
    let btn = document.getElementById(NATIVE_TOGGLE_ID);
    if (btn) {
        if (btn.parentElement !== block) block.prepend(btn);
        return btn;
    }
    btn = document.createElement('button');
    btn.id = NATIVE_TOGGLE_ID;
    btn.type = 'button';
    btn.addEventListener('click', () => {
        document.body.classList.toggle('cc-native-override');
        setNativeToggleLabel(btn);
    });
    setNativeToggleLabel(btn);
    block.prepend(btn);
    return btn;
}

function mount() {
    if (document.getElementById(HOST_ID)) return true;
    const block = characterBlock();
    const nativeList = document.querySelector('#rm_print_characters_block');
    if (!block || !nativeList) return false;

    const host = document.createElement('div');
    host.id = HOST_ID;
    block.prepend(host);
    ensureNativeToggle(block);

    try {
        instance = createCharacterCanvas(host, stAdapter);
        document.body.classList.add('cc-active');
        return true;
    } catch (e) {
        console.error('[CharacterCanvas] mount failed, keeping the native list', e);
        host.remove();
        document.body.classList.remove('cc-active');
        instance = null;
        return false;
    }
}

function unmount() {
    try { instance?.destroy(); } catch { /* ignore */ }
    instance = null;
    document.getElementById(HOST_ID)?.remove();
    document.getElementById(NATIVE_TOGGLE_ID)?.remove();
    document.body.classList.remove('cc-active');
    document.body.classList.remove('cc-native-override');
}

function watch() {
    if (observer) return;
    observer = new MutationObserver(() => {
        if (document.getElementById(HOST_ID) || mountQueued) return;
        mountQueued = true;
        setTimeout(() => { mountQueued = false; mount(); }, 0);
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

async function boot() {
    for (let i = 0; i < 60 && !mount(); i++) {
        await new Promise((r) => setTimeout(r, 500));
    }
    if (instance) watch();
    window.addEventListener('resize', () => instance?.refresh(), { passive: true });
}

function safeBoot() {
    Promise.resolve().then(boot).catch((e) => console.error('[CharacterCanvas]', e));
}

function start() {
    try {
        const c = ctx();
        const es = c?.eventSource;
        const types = c?.eventTypes ?? c?.event_types ?? {};
        if (es?.on && types.APP_READY) es.on(types.APP_READY, safeBoot);
    } catch (e) {
        console.error('[CharacterCanvas] context unavailable at load', e);
    }
    safeBoot();
}

setTimeout(() => {
    try { start(); } catch (e) { console.error('[CharacterCanvas]', e); }
}, 0);

export async function onEnable() { safeBoot(); }
export async function onDisable() { unmount(); }
export async function onDelete() { unmount(); }
