/*
 * Character Canvas — SillyTavern data adapter.
 * Reads and writes character state through SillyTavern's own context and
 * REST endpoints (/api/characters/*), confirmed directly against ST's
 * server source (src/endpoints/characters.js) and st-context.js, so nothing
 * here relies on guessed internals.
 *
 * Reverse-engineered as a character-facing sibling of Persona Library:
 * same gallery/grid/detail-modal shell and the same "Sections" concept,
 * pointed at SillyTavern's native character cards instead of personas, with
 * every native character field (Description, Personality, Scenario, First
 * Message, Example Dialogue, Creator's Notes, System Prompt, Post-History
 * Instructions, Depth Prompt, Tags, Creator, Character Version, Talkativeness,
 * Alternate Greetings) kept as its own separate, always-present box — nothing
 * is collapsed into one field the way Persona Library does for personas.
 * Variants (the character/chat-aware dynamic-block system) are deliberately
 * NOT ported here — this extension is characters editing themselves, so
 * "only active for a specific character" doesn't apply the same way.
 */

const SETTINGS_KEY = 'characterCanvas';
const SECTIONS_KEY = 'characterCanvasSections';
const DEFAULTS = { sort: 'name', tile: 150, query: '' };

export const ctx = () => globalThis.SillyTavern?.getContext?.() ?? null;

async function headers(json = true) {
    const c = ctx();
    let h = {};
    try { h = { ...(c?.getRequestHeaders?.() ?? {}) }; } catch { /* ignore */ }
    if (!h['X-CSRF-Token']) {
        try {
            const res = await fetch('/csrf-token');
            if (res.ok) h['X-CSRF-Token'] = (await res.json()).token;
        } catch { /* ignore */ }
    }
    if (json) h['Content-Type'] = 'application/json';
    else delete h['Content-Type'];
    return h;
}

async function postJSON(url, body) {
    const res = await fetch(url, { method: 'POST', headers: await headers(true), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
    return res;
}

/**
 * Re-reads the character list from the server and repopulates SillyTavern's
 * OWN in-memory `characters` array (and re-renders the native, CSS-hidden
 * `#rm_print_characters_block` list) — the exact same function ST's own
 * create/edit/rename/delete/duplicate flows call afterward. Confirmed
 * directly against script.js: every native mutating flow ends with this.
 * Our own writes go straight to the REST endpoints (bypassing those native
 * flows entirely, same reasoning as Persona Library bypassing personas.js's
 * higher-level helpers), so nothing else would ever tell ST's in-memory
 * array to catch up otherwise — this gallery would keep reading stale data
 * from ctx().characters until an unrelated native action happened to
 * refresh it, or a full page reload.
 */
async function refreshNativeCharacterList() {
    try { await ctx()?.getCharacters?.(); } catch (e) { console.warn('[CharacterCanvas] getCharacters() (native list refresh) failed', e); }
}

// Cache-busting tokens, keyed by avatar filename. imageUrl()/thumbUrl() below
// consult this on every call so a re-render right after a replace still
// fetches the new file instead of a cached copy of the old one.
const cacheBust = {};

export function imageUrl(avatar) {
    const v = cacheBust[avatar];
    return `/characters/${encodeURIComponent(avatar)}${v ? `?v=${v}` : ''}`;
}

export function thumbUrl(avatar) {
    const c = ctx();
    const v = cacheBust[avatar];
    const base = typeof c?.getThumbnailUrl === 'function'
        ? c.getThumbnailUrl('avatar', avatar)
        : `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`;
    return v ? `${base}&v=${v}` : base;
}

/*
 * Sections — an extensible layer on top of a character's real Description
 * field: a "core" block (the Description text itself) plus any number of
 * labeled, toggleable blocks (Outfit, Scene Details, Lore, Mood, or a
 * ready-made character-sheet category), composed together and written back
 * into the SAME native `description` field on save. This is the one piece
 * of Persona Library's design this extension deliberately keeps, per how it
 * was asked to be ported: every other native field stays exactly as its own
 * separate box, untouched by Sections.
 *
 * The core/sections breakdown itself lives only in this extension's own
 * settings, keyed by avatar filename — the composed RESULT is what's written
 * into the character's real description, so the character works normally
 * (with the fully composed text) even without this extension installed.
 */
function sectionsStore() {
    const c = ctx();
    if (!c?.extensionSettings) return {};
    c.extensionSettings[SECTIONS_KEY] = c.extensionSettings[SECTIONS_KEY] ?? {};
    return c.extensionSettings[SECTIONS_KEY];
}

export function getCharacterSections(avatar, liveDescription) {
    const store = sectionsStore();
    if (store[avatar]) return structuredClone(store[avatar]);
    // First time we've touched this character: treat the existing native
    // description as the "core" text, with no extra sections yet.
    return { core: liveDescription ?? '', sections: [] };
}

export function composeDescription(core, sections) {
    const parts = [(core ?? '').trim()];
    for (const s of sections ?? []) {
        if (!s.enabled || !(s.content ?? '').trim()) continue;
        parts.push(`[${s.title || 'Section'}: ${s.content.trim()}]`);
    }
    return parts.filter(Boolean).join('\n\n');
}

/** Renames a character's Sections entry after a real rename changed its avatar filename. */
function migrateSections(oldAvatar, newAvatar) {
    if (oldAvatar === newAvatar) return;
    const store = sectionsStore();
    if (store[oldAvatar] !== undefined) {
        store[newAvatar] = store[oldAvatar];
        delete store[oldAvatar];
    }
}

function findCharacter(avatar) {
    const list = ctx()?.characters ?? [];
    const index = list.findIndex((c) => c?.avatar === avatar);
    return index === -1 ? null : { index, character: list[index] };
}

function toArray(tags) {
    if (Array.isArray(tags)) return tags;
    if (typeof tags === 'string') return tags.split(',').map((x) => x.trim()).filter(Boolean);
    return [];
}

function toGreetingsArray(g) {
    if (Array.isArray(g)) return g.filter((x) => typeof x === 'string');
    if (typeof g === 'string' && g) return [g];
    return [];
}

export function getCharacters() {
    const list = ctx()?.characters ?? [];
    const sections = sectionsStore();
    return list.map((c, index) => {
        const d = c.data ?? {};
        const depth = d.extensions?.depth_prompt ?? {};
        const core = sections[c.avatar]?.core;
        return {
            id: c.avatar,
            avatar: c.avatar,
            index,
            name: c.name ?? '',
            image: thumbUrl(c.avatar),
            // Prefer the clean "core" text for grid previews, so composed
            // section markup ([Outfit: ...] etc.) doesn't clutter the grid —
            // same reasoning Persona Library uses for its own preview text.
            description: core ?? c.description ?? d.description ?? '',
            personality: c.personality ?? d.personality ?? '',
            scenario: c.scenario ?? d.scenario ?? '',
            first_mes: c.first_mes ?? d.first_mes ?? '',
            mes_example: c.mes_example ?? d.mes_example ?? '',
            creator_notes: d.creator_notes ?? c.creatorcomment ?? '',
            system_prompt: d.system_prompt ?? '',
            post_history_instructions: d.post_history_instructions ?? '',
            alternate_greetings: toGreetingsArray(d.alternate_greetings),
            tags: toArray(d.tags ?? c.tags),
            creator: d.creator ?? '',
            character_version: d.character_version ?? '',
            talkativeness: Number(d.extensions?.talkativeness ?? c.talkativeness ?? 0.5),
            favorite: !!(d.extensions?.fav ?? c.fav),
            world: d.extensions?.world ?? '',
            depthPrompt: {
                prompt: depth.prompt ?? '',
                depth: Number.isFinite(depth.depth) ? depth.depth : 4,
                role: depth.role ?? 'system',
            },
            created: Date.parse(c.create_date ?? '') || index,
        };
    });
}

export function getActiveId() {
    const c = ctx();
    const idx = c?.characterId;
    if (idx === undefined || idx === null || idx === '') return null;
    return c?.characters?.[idx]?.avatar ?? null;
}

export function getSettings() {
    const c = ctx();
    const stored = c?.extensionSettings?.[SETTINGS_KEY] ?? {};
    return { ...DEFAULTS, ...stored };
}

export function saveSettings(patch) {
    const c = ctx();
    if (!c?.extensionSettings) return;
    c.extensionSettings[SETTINGS_KEY] = { ...getSettings(), ...patch };
    c.saveSettingsDebounced?.();
}

export function subscribe(cb) {
    const c = ctx();
    const es = c?.eventSource;
    const types = c?.eventTypes ?? c?.event_types ?? {};
    if (!es?.on) return () => {};
    const names = [
        types.APP_READY, types.CHAT_CHANGED, types.CHARACTER_PAGE_LOADED,
        types.CHARACTER_EDITED, types.CHARACTER_DELETED, types.CHARACTER_DUPLICATED,
        types.CHARACTER_RENAMED,
    ].filter(Boolean);
    for (const n of names) es.on(n, cb);
    return () => { for (const n of names) es.removeListener?.(n, cb); };
}

export async function getTokenCount(text) {
    const t = text ?? '';
    if (!t.trim()) return 0;
    try {
        const c = ctx();
        if (typeof c?.getTokenCountAsync === 'function') return await c.getTokenCountAsync(t);
    } catch (e) {
        console.warn('[CharacterCanvas] getTokenCountAsync failed, falling back to an estimate', e);
    }
    return Math.ceil(t.length / 4);
}

/** Opens this character's chat (SillyTavern's own native "select a character" action). */
export async function setActive(avatar) {
    const found = findCharacter(avatar);
    if (!found) throw new Error('Character not found.');
    await ctx()?.selectCharacterById?.(found.index, { switchMenu: false });
}

/**
 * Writes a patch of native character fields through the real, documented
 * `/api/characters/merge-attributes` endpoint — a plain deep-merge-and-
 * validate against the character's existing card, confirmed directly
 * against ST's server source. Both the legacy v1 top-level fields (name,
 * description, personality, scenario, first_mes, mes_example, creatorcomment,
 * talkativeness, fav, tags) and the v2 `data.*` mirror are set together,
 * exactly like ST's own /edit handler (charaFormatData) does, so nothing
 * reading either spec version ever sees the two drift apart.
 */
export async function updateCharacter(avatar, patch) {
    const found = findCharacter(avatar);
    if (!found) throw new Error('Character not found.');
    const merge = { avatar };
    const set = (v1key, v2key, value) => {
        if (value === undefined) return;
        merge[v1key] = value;
        merge.data = merge.data ?? {};
        merge.data[v2key ?? v1key] = value;
    };
    if (patch.name !== undefined) set('name', 'name', patch.name);
    if (patch.description !== undefined) set('description', undefined, patch.description);
    if (patch.personality !== undefined) set('personality', undefined, patch.personality);
    if (patch.scenario !== undefined) set('scenario', undefined, patch.scenario);
    if (patch.first_mes !== undefined) set('first_mes', undefined, patch.first_mes);
    if (patch.mes_example !== undefined) set('mes_example', undefined, patch.mes_example);
    if (patch.creator_notes !== undefined) set('creatorcomment', 'creator_notes', patch.creator_notes);
    if (patch.talkativeness !== undefined) set('talkativeness', undefined, patch.talkativeness);
    if (patch.tags !== undefined) set('tags', undefined, toArray(patch.tags));
    if (patch.system_prompt !== undefined) { merge.data = merge.data ?? {}; merge.data.system_prompt = patch.system_prompt; }
    if (patch.post_history_instructions !== undefined) { merge.data = merge.data ?? {}; merge.data.post_history_instructions = patch.post_history_instructions; }
    if (patch.creator !== undefined) { merge.data = merge.data ?? {}; merge.data.creator = patch.creator; }
    if (patch.character_version !== undefined) { merge.data = merge.data ?? {}; merge.data.character_version = patch.character_version; }
    if (patch.alternate_greetings !== undefined) { merge.data = merge.data ?? {}; merge.data.alternate_greetings = toGreetingsArray(patch.alternate_greetings); }
    if (patch.favorite !== undefined) { merge.data = merge.data ?? {}; merge.data.extensions = { ...(merge.data.extensions ?? {}), fav: !!patch.favorite }; }
    if (patch.depthPrompt !== undefined) {
        merge.data = merge.data ?? {};
        merge.data.extensions = {
            ...(merge.data.extensions ?? {}),
            depth_prompt: {
                prompt: patch.depthPrompt.prompt ?? '',
                depth: Number.isFinite(Number(patch.depthPrompt.depth)) ? Number(patch.depthPrompt.depth) : 4,
                role: patch.depthPrompt.role ?? 'system',
            },
        };
    }

    await postJSON('/api/characters/merge-attributes', merge);
    await refreshNativeCharacterList();
}

export async function saveCharacterSections(avatar, { core, sections }) {
    const store = sectionsStore();
    store[avatar] = { core, sections };
    ctx()?.saveSettingsDebounced?.();
    await updateCharacter(avatar, { description: composeDescription(core, sections) });
}

export async function replaceAvatar(avatar, file) {
    const form = new FormData();
    form.append('avatar', file);
    form.append('avatar_url', avatar);
    const res = await fetch('/api/characters/edit-avatar', {
        method: 'POST',
        headers: await headers(false),
        cache: 'no-cache',
        body: form,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    cacheBust[avatar] = Date.now();
    await refreshNativeCharacterList();
}

export async function createCharacter(name) {
    const trimmed = (name ?? '').trim();
    if (!trimmed) throw new Error('A name is required.');
    const form = new FormData();
    form.append('ch_name', trimmed);
    const res = await fetch('/api/characters/create', {
        method: 'POST',
        headers: await headers(false),
        cache: 'no-cache',
        body: form,
    });
    if (!res.ok) throw new Error(`Create failed: ${res.status}`);
    const avatar = (await res.text()).trim();
    await refreshNativeCharacterList();
    return avatar;
}

export async function renameCharacter(avatar, newName) {
    const trimmed = (newName ?? '').trim();
    if (!trimmed) throw new Error('A name is required.');
    const res = await fetch('/api/characters/rename', {
        method: 'POST',
        headers: await headers(true),
        body: JSON.stringify({ avatar_url: avatar, new_name: trimmed }),
    });
    if (!res.ok) throw new Error(`Rename failed: ${res.status}`);
    const { avatar: newAvatar } = await res.json().catch(() => ({}));
    const finalAvatar = newAvatar || avatar;
    migrateSections(avatar, finalAvatar);
    ctx()?.saveSettingsDebounced?.();
    await refreshNativeCharacterList();
    return finalAvatar;
}

export async function duplicateCharacter(avatar) {
    const res = await fetch('/api/characters/duplicate', {
        method: 'POST',
        headers: await headers(true),
        body: JSON.stringify({ avatar_url: avatar }),
    });
    if (!res.ok) throw new Error(`Duplicate failed: ${res.status}`);
    const { path: newAvatar } = await res.json().catch(() => ({}));
    await refreshNativeCharacterList();
    return newAvatar ?? null;
}

export async function deleteCharacter(avatar, deleteChats = false) {
    const res = await fetch('/api/characters/delete', {
        method: 'POST',
        headers: await headers(true),
        body: JSON.stringify({ avatar_url: avatar, delete_chats: deleteChats }),
    });
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    const store = sectionsStore();
    delete store[avatar];
    ctx()?.saveSettingsDebounced?.();
    await refreshNativeCharacterList();
}

export async function confirmDialog(message) {
    const c = ctx();
    if (typeof c?.callGenericPopup === 'function' && c?.POPUP_TYPE?.CONFIRM !== undefined) {
        return Boolean(await c.callGenericPopup(message, c.POPUP_TYPE.CONFIRM));
    }
    return window.confirm(message);
}

export async function promptText(message, defaultValue = '') {
    const c = ctx();
    if (typeof c?.callGenericPopup === 'function' && c?.POPUP_TYPE?.INPUT !== undefined) {
        const result = await c.callGenericPopup(message, c.POPUP_TYPE.INPUT, defaultValue);
        return typeof result === 'string' ? result : null;
    }
    return window.prompt(message, defaultValue);
}

/**
 * Passthrough to native's own per-character "Character Lore" (World Info)
 * link button — mirrors Persona Library's "Persona Lore" passthrough. Native
 * `#world_button` acts on whichever character is currently open in the
 * (CSS-hidden) native edit panel, so this selects the character first, then
 * dispatches a synthetic shift-click, which native's own tooltip documents
 * as always opening the "Link to World Info" picker regardless of state.
 */
export async function openCharacterLore(avatar) {
    await setActive(avatar);
    setTimeout(() => {
        const btn = document.querySelector('#world_button');
        if (!btn) {
            console.warn('[CharacterCanvas] passthrough "Character Lore": #world_button not found in the DOM.');
            globalThis.toastr?.warning?.('Couldn\u2019t find the native Character Lore button \u2014 see console.', 'Character Canvas');
            return;
        }
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, shiftKey: true }));
    }, 50);
}

export const stAdapter = {
    getCharacters,
    getActiveId,
    getSettings,
    saveSettings,
    subscribe,
    setActive,
    updateCharacter,
    replaceAvatar,
    createCharacter,
    renameCharacter,
    duplicateCharacter,
    deleteCharacter,
    confirm: confirmDialog,
    promptText,
    fallbackImage: thumbUrl,
    imageUrl,
    getCharacterSections,
    saveCharacterSections,
    composeDescription,
    getTokenCount,
    openCharacterLore,
};
