/*
 * Character Canvas — gallery renderer.
 *
 * A CharacterCanvas-style gallery grid pointed at SillyTavern's native
 * character cards. Every native field (Description, Personality, Scenario,
 * First Message, Example Dialogue, Creator's Notes, System Prompt,
 * Post-History Instructions, Depth Prompt, Tags, Creator, Character Version,
 * Talkativeness, Alternate Greetings) is its own always-present box — this
 * is the one deliberate difference from Persona Library, which collapses a
 * persona down to a single description field. "Sections" (see
 * modules/st-adapter.js) is the one piece of that design kept here: extra
 * labeled blocks that compose together with the Description box specifically
 * and get written into the character's real, native description field.
 *
 * Adapter contract — see modules/st-adapter.js's stAdapter export.
 */

const el = (tag, props = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of [].concat(children)) if (c) node.append(c);
    return node;
};

function charImg(props, avatar, adapter) {
    const img = el('img', props);
    if (typeof adapter.fallbackImage === 'function') {
        img.addEventListener('error', () => { img.src = adapter.fallbackImage(avatar); }, { once: true });
    }
    return img;
}

const norm = (s) => (s ?? '').toString().toLowerCase();

// Ready-made multi-field character-sheet categories — identical set to
// Persona Library's own Sections templates. Each field is its own labeled
// input in the editor, but folds into one "Label: value" line per field when
// composed into the Description box, same as a freeform section.
const SECTION_TEMPLATES = [
    { name: 'Common Characteristics', fields: ['Name', 'Species', 'Nationality', 'Sex', 'Gender', 'Age', 'Birthdate', 'Languages'] },
    { name: 'Appearance Overview', fields: ['Eyes', 'Hair', 'Height', 'Weight', 'Skin Tone', 'Tattoos', 'Physique', 'Birthmarks', 'Detailed Appearance'] },
    { name: 'Mentality', fields: ['Intelligence', 'Personality', 'Sexuality', 'Notable Habits', 'Personal Motto', 'Quirks', 'Voice', 'Speech', 'Fears', 'Desires', 'Likes', 'Dislikes'] },
    { name: 'Character Lore', fields: ['Background', 'Education', 'Career/Job', 'Reputation', 'Goals', 'Motivations', 'Secrets', 'Titles', 'Epithets', 'Nicknames'] },
    { name: 'Beliefs & Values', fields: ['Ethics', 'Morals', 'Worldview', 'Spirituality', 'Superstitions', 'Religion/Faith', 'Political Ideology', 'Cultural Traditions', 'Personal Principles', 'Personal Philosophy'] },
    { name: 'Character Statistics', fields: ['Skills', 'Talents', 'Powers', 'Special Traits', 'Drawbacks', 'Weaknesses'] },
    { name: 'Equipment Statistics', fields: ['Clothing', 'Artifacts', 'Weapons', 'Miscellaneous Items'] },
    { name: 'Social Relationships', fields: ['Family', 'Children', 'Spouse', 'Marital Status', 'Romantically Involved', 'Friends', 'Allies', 'Enemies'] },
    { name: 'Lewd Info', fields: ['Virginity', 'Fetishes', 'Sex Experience', 'Lewdity/Promiscuity', 'Pectoral Size', 'Breast Size', 'Pussy', 'Ass', 'Penis Size (Flaccid)', 'Penis Size (Erect)', 'Semen Production', 'Squirt Production'] },
];

function fieldsToContent(fields) {
    return (fields ?? [])
        .filter((f) => (f.value ?? '').trim())
        .map((f) => `${f.label}: ${f.value.trim()}`)
        .join('\n');
}

const ROLES = [['system', 'System'], ['user', 'User'], ['assistant', 'Assistant']];

export function createCharacterCanvas(container, adapter) {
    const settings = Object.assign({ sort: 'name', tile: 150, query: '' }, adapter.getSettings?.() ?? {});

    let selectedId = null;
    let dirty = false;
    let note = '';
    // Working copy of { core, sections } for the open character's Description.
    let sectionsDraft = null;
    // Working copy of every OTHER native field, as its own plain object.
    let fieldsDraft = null;
    let detailTab = 'details'; // 'details' | 'edit' | 'preview'

    const root = el('div', { class: 'cc-root', 'data-character-canvas': '' });
    container.append(root);

    function clickThrough(candidates, label) {
        for (const sel of candidates) {
            const target = document.querySelector(sel);
            if (target) { target.click(); return true; }
        }
        console.warn(`[CharacterCanvas] passthrough "${label}": none of these selectors matched anything \u2014`, candidates);
        globalThis.toastr?.warning?.(`Couldn't find the native "${label}" button \u2014 see console for how to fix this.`, 'Character Canvas');
        return false;
    }

    const loreBtn = el('button', {
        class: 'cc-icon-btn', type: 'button', title: 'Open Worlds/Lorebooks (native)',
        onclick: () => clickThrough(['#WIDrawerIcon', '#WorldInfo', '#world_info_button', '.drawer-icon[data-target="#WorldInfo"]', '#world-info-button'], 'Worlds/Lorebooks'),
    }, [el('i', { class: 'fa-solid fa-book' })]);

    const newBtn = adapter.createCharacter && el('button', {
        class: 'cc-btn cc-primary cc-new-btn', type: 'button',
        onclick: async () => {
            const name = (await (adapter.promptText?.('Enter a name for this character:', '') ?? Promise.resolve(window.prompt('Enter a name for this character:', '')))) ?? '';
            const trimmed = name.trim();
            if (!trimmed) return;
            try {
                const avatar = await adapter.createCharacter(trimmed);
                globalThis.toastr?.success?.('Character created.', 'Character Canvas');
                refresh();
                select(avatar);
            } catch (e) {
                console.error('[CharacterCanvas] create failed', e);
                globalThis.toastr?.error?.('Could not create character.', 'Character Canvas');
            }
        },
    }, [el('i', { class: 'fa-solid fa-plus' }), el('span', { text: 'New Character' })]);

    const search = el('input', {
        class: 'cc-search', type: 'search', placeholder: 'Search characters\u2026', value: settings.query,
        oninput: () => { persist({ query: search.value }); renderGrid(); },
    });

    const sort = el('select', {
        class: 'cc-select', onchange: () => { persist({ sort: sort.value }); renderGrid(); },
    }, [
        el('option', { value: 'name', text: 'Name (A\u2013Z)' }),
        el('option', { value: 'name-desc', text: 'Name (Z\u2013A)' }),
        el('option', { value: 'created', text: 'Recently created' }),
        el('option', { value: 'favorite', text: 'Favorites first' }),
    ]);
    sort.value = settings.sort;

    const size = el('input', {
        class: 'cc-size', type: 'range', min: '90', max: '260', step: '1', value: String(settings.tile), title: 'Tile size',
        oninput: () => { persist({ tile: Number(size.value) }); root.style.setProperty('--cc-tile', `${settings.tile}px`); },
    });

    const count = el('span', { class: 'cc-count' });

    const grid = el('div', { class: 'cc-grid' });
    const gridWrap = el('div', { class: 'cc-grid-wrap' }, [grid]);
    const detail = el('div', { class: 'cc-detail cc-root', hidden: true });

    function nearestScrollContainer(node) {
        while (node && node !== detail) {
            const style = getComputedStyle(node);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
            node = node.parentElement;
        }
        return null;
    }
    detail.addEventListener('wheel', (e) => { if (!nearestScrollContainer(e.target)) e.stopPropagation(); }, { passive: true });
    detail.addEventListener('touchmove', (e) => { if (!nearestScrollContainer(e.target)) e.stopPropagation(); }, { passive: true });

    function closeDetail(afterClose) {
        const proceed = () => { dirty = false; selectedId = null; renderGrid(); renderDetail(); afterClose?.(); };
        if (!dirty) { proceed(); return; }
        const ask = adapter.confirm ?? (async (m) => window.confirm(m));
        Promise.resolve(ask('You have unsaved changes. Discard them?')).then((ok) => { if (ok) proceed(); });
    }
    detail.addEventListener('click', (e) => { if (e.target === detail) closeDetail(); });

    // -- click-to-enlarge lightbox for the hero image --
    const lightboxImg = el('img', { class: 'cc-lightbox-img', alt: '' });
    const lightboxClose = el('button', { class: 'cc-lightbox-close', type: 'button', title: 'Close', onclick: () => closeLightbox() }, [el('i', { class: 'fa-solid fa-xmark' })]);
    const lightbox = el('div', { class: 'cc-lightbox cc-root', hidden: true }, [lightboxClose, lightboxImg]);
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
    function openLightbox(src, alt) { lightboxImg.src = src; lightboxImg.alt = alt ?? ''; lightbox.hidden = false; }
    function closeLightbox() { lightbox.hidden = true; lightboxImg.src = ''; }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !lightbox.hidden) closeLightbox(); });

    // -- "expand to full screen" overlay for a cramped text field --
    let textFocusTarget = null;
    const textFocusTitle = el('div', { class: 'cc-text-focus-title' });
    const textFocusArea = el('textarea', {
        class: 'cc-text-focus-area', spellcheck: 'false',
        oninput: () => {
            if (!textFocusTarget) return;
            dirty = true;
            textFocusTarget.setValue(textFocusArea.value);
            textFocusTarget.compactEl.value = textFocusArea.value;
        },
    });
    const textFocusClose = el('button', { class: 'cc-lightbox-close', type: 'button', title: 'Done', onclick: () => closeTextFocus() }, [el('i', { class: 'fa-solid fa-xmark' })]);
    const textFocus = el('div', { class: 'cc-text-focus-overlay cc-root', hidden: true }, [el('div', { class: 'cc-text-focus-bar' }, [textFocusTitle, textFocusClose]), textFocusArea]);
    textFocus.addEventListener('click', (e) => { if (e.target === textFocus) closeTextFocus(); });
    function openTextFocus({ value, setValue, compactEl, title, editable }) {
        textFocusTarget = { setValue, compactEl };
        textFocusTitle.textContent = title || 'Field';
        textFocusArea.value = value ?? '';
        textFocusArea.disabled = !editable;
        textFocus.hidden = false;
        textFocusArea.focus();
    }
    function closeTextFocus() { textFocus.hidden = true; textFocusTarget = null; }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !textFocus.hidden) closeTextFocus(); });

    root.style.setProperty('--cc-tile', `${settings.tile}px`);
    container.appendChild(detail);
    container.appendChild(lightbox);
    container.appendChild(textFocus);

    root.append(
        el('div', { class: 'cc-toolbar' }, [newBtn, search, sort, size, count, loreBtn].filter(Boolean)),
        el('div', { class: 'cc-body' }, [gridWrap]),
    );

    function persist(patch) {
        Object.assign(settings, patch);
        try { adapter.saveSettings?.(patch); } catch (e) { console.warn('[CharacterCanvas] saveSettings failed', e); }
    }

    function visibleCharacters() {
        const all = adapter.getCharacters() ?? [];
        const q = norm(settings.query).trim();
        let list = all.filter((c) => {
            if (!q) return true;
            return norm(c.name).includes(q) || norm(c.description).includes(q) || norm(c.tags?.join(' ')).includes(q);
        });
        const by = {
            'name': (a, b) => norm(a.name).localeCompare(norm(b.name)),
            'name-desc': (a, b) => norm(b.name).localeCompare(norm(a.name)),
            'created': (a, b) => (b.created ?? 0) - (a.created ?? 0),
            'favorite': (a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || norm(a.name).localeCompare(norm(b.name)),
        }[settings.sort] ?? (() => 0);
        return list.slice().sort(by);
    }

    function renderGrid() {
        const list = visibleCharacters();
        const activeId = adapter.getActiveId?.() ?? null;
        const scrollTop = gridWrap.scrollTop;
        grid.replaceChildren();
        count.textContent = `${list.length} character${list.length === 1 ? '' : 's'}`;

        if (!list.length) {
            gridWrap.replaceChildren(el('div', {
                class: 'cc-empty',
                text: (adapter.getCharacters() ?? []).length ? 'No characters match your filters.' : 'No characters yet.',
            }));
            return;
        }
        if (!gridWrap.contains(grid)) gridWrap.replaceChildren(grid);

        for (const c of list) {
            const tile = el('button', {
                class: `cc-tile${c.id === selectedId ? ' cc-selected' : ''}${c.id === activeId ? ' cc-active' : ''}`,
                type: 'button', title: c.name, onclick: () => select(c.id), ondblclick: () => use(c.id),
            }, [
                charImg({ alt: c.name, loading: 'lazy', decoding: 'async', src: adapter.imageUrl ? adapter.imageUrl(c.id) : c.image }, c.id, adapter),
                el('span', { class: 'cc-tile-name', text: c.name }),
                c.favorite ? el('i', { class: 'fa-solid fa-star cc-tile-favorite', title: 'Favorite' }) : null,
            ].filter(Boolean));
            grid.append(tile);
        }
        gridWrap.scrollTop = scrollTop;
    }

    function select(id) {
        if (dirty && id !== selectedId) dirty = false; // unsaved edits are discarded on switch
        selectedId = id;
        sectionsDraft = null;
        fieldsDraft = null;
        detailTab = 'details';
        note = '';
        renderGrid();
        renderDetail();
    }

    function step(delta) {
        const list = visibleCharacters();
        if (!list.length) return;
        const idx = list.findIndex((c) => c.id === selectedId);
        const next = list[(idx + delta + list.length) % list.length];
        if (next) select(next.id);
    }

    // Shared wrapper for every mutating action (chat/duplicate/delete/
    // replace-image/save): sets both a toastr popup AND the small inline
    // `note` line shown right in the Edit tab. The inline note matters
    // separately from the toast — a toast can get missed or dismissed
    // before it's read, especially on mobile where it may render at a
    // screen edge outside the visible viewport at the time; the inline
    // note stays put until the next action, which is a more reliable
    // "did that actually work" signal on any screen size.
    async function run(fn, ok, fail) {
        try {
            const result = await fn();
            note = ok;
            dirty = false;
            globalThis.toastr?.success?.(ok, 'Character Canvas');
            refresh();
            return result;
        } catch (e) {
            console.error('[CharacterCanvas]', e);
            note = fail;
            globalThis.toastr?.error?.(fail, 'Character Canvas');
            refresh();
            return undefined;
        }
    }

    async function use(id) {
        try {
            await adapter.setActive(id);
            note = 'Chat opened.';
            globalThis.toastr?.success?.(note, 'Character Canvas');
        } catch (e) {
            console.error('[CharacterCanvas] setActive failed', e);
            note = 'Could not open this character.';
            globalThis.toastr?.error?.(note, 'Character Canvas');
        }
        renderGrid();
    }

    /** Editable list of Sections, folded into the Description box on save. Same drag-reorder UX as Persona Library's own Sections editor. */
    function buildSectionsEditor(draft, canEdit) {
        const wrap = el('div', { class: 'cc-sections' });
        const list = el('div', { class: 'cc-sections-list' });
        let dragIndex = null;

        function renderList() {
            list.replaceChildren();
            draft.sections.forEach((s, i) => {
                const handle = el('span', {
                    class: 'cc-drag-handle', title: 'Drag to reorder', draggable: canEdit ? 'true' : 'false',
                    ondragstart: () => { dragIndex = i; handle.closest('.cc-section-row')?.classList.add('cc-dragging'); },
                    ondragend: () => { dragIndex = null; list.querySelectorAll('.cc-dragging').forEach((n) => n.classList.remove('cc-dragging')); },
                }, [el('i', { class: 'fa-solid fa-grip-vertical' })]);

                // Native HTML5 drag-and-drop (the handle above) simply
                // doesn't fire at all on touch devices — no mobile browser
                // implements it without an extra pointer-events polyfill
                // neither this codebase nor Persona Library's own Sections
                // editor carries. These two buttons are the reorder path
                // for anyone on a phone or tablet; on desktop they're just
                // a second way to do the same thing the handle already
                // does. Disabled rather than hidden at the ends of the
                // list, so the row height (and everything below it) stays
                // stable as sections move past each other.
                const moveUpBtn = el('button', {
                    class: 'cc-icon-btn cc-move-btn', type: 'button', title: 'Move up',
                    onclick: () => {
                        if (i === 0) return;
                        dirty = true;
                        [draft.sections[i - 1], draft.sections[i]] = [draft.sections[i], draft.sections[i - 1]];
                        renderList();
                    },
                }, [el('i', { class: 'fa-solid fa-chevron-up' })]);
                const moveDownBtn = el('button', {
                    class: 'cc-icon-btn cc-move-btn', type: 'button', title: 'Move down',
                    onclick: () => {
                        if (i === draft.sections.length - 1) return;
                        dirty = true;
                        [draft.sections[i], draft.sections[i + 1]] = [draft.sections[i + 1], draft.sections[i]];
                        renderList();
                    },
                }, [el('i', { class: 'fa-solid fa-chevron-down' })]);
                if (i === 0) moveUpBtn.setAttribute('disabled', '');
                if (i === draft.sections.length - 1) moveDownBtn.setAttribute('disabled', '');
                if (!canEdit) { moveUpBtn.setAttribute('disabled', ''); moveDownBtn.setAttribute('disabled', ''); }

                const titleInput = el('input', {
                    class: 'cc-section-title', type: 'text', value: s.title,
                    oninput: () => { dirty = true; s.title = titleInput.value; },
                });
                const enabledBox = el('input', { type: 'checkbox', title: 'Include in Description', oninput: () => { dirty = true; s.enabled = enabledBox.checked; } });
                enabledBox.checked = s.enabled !== false;
                const removeBtn = el('button', {
                    class: 'cc-icon-btn cc-icon-danger', type: 'button', title: 'Remove section',
                    onclick: async () => {
                        // Removing a whole section (all its fields/content in
                        // one go) used to fire instantly on click — a single
                        // misclick next to the enabled-checkbox or title
                        // could silently wipe an entire category with no way
                        // back except re-typing it, which is exactly the
                        // "sections vanished" complaint this class of bug
                        // produces. A confirmation here doesn't fix a data
                        // bug (there isn't one to find), it just removes the
                        // one-misclick failure mode.
                        const ask = adapter.confirm ?? (async (m) => window.confirm(m));
                        if (!await ask(`Remove the "${s.title || 'Untitled'}" section? This can't be undone once you save.`)) return;
                        dirty = true; draft.sections.splice(i, 1); renderList();
                    },
                }, [el('i', { class: 'fa-solid fa-xmark' })]);
                const head = el('div', { class: 'cc-section-row-head' }, [handle, moveUpBtn, moveDownBtn, enabledBox, titleInput, removeBtn]);

                let body;
                if (Array.isArray(s.fields)) {
                    const fieldsWrap = el('div', { class: 'cc-section-fields' });
                    const renderFields = () => {
                        fieldsWrap.replaceChildren(...s.fields.map((f, fi) => {
                            const labelInput = el('input', {
                                class: 'cc-field-label', type: 'text', value: f.label,
                                oninput: () => { dirty = true; f.label = labelInput.value; s.content = fieldsToContent(s.fields); },
                            });
                            const valueInput = el('input', {
                                class: 'cc-field-value', type: 'text', value: f.value ?? '', placeholder: '\u2014',
                                oninput: () => { dirty = true; f.value = valueInput.value; s.content = fieldsToContent(s.fields); },
                            });
                            const expandFieldBtn = el('button', {
                                class: 'cc-icon-btn cc-field-expand', type: 'button', title: 'Expand to full screen',
                                onclick: () => openTextFocus({
                                    value: f.value, setValue: (v) => { f.value = v; s.content = fieldsToContent(s.fields); },
                                    compactEl: valueInput, title: `${titleInput.value || s.title || 'Section'} \u2014 ${labelInput.value || f.label || 'Field'}`, editable: canEdit,
                                }),
                            }, [el('i', { class: 'fa-solid fa-up-right-and-down-left-from-center' })]);
                            const removeFieldBtn = el('button', {
                                class: 'cc-icon-btn cc-icon-danger cc-field-remove', type: 'button', title: 'Remove field',
                                onclick: () => { dirty = true; s.fields.splice(fi, 1); s.content = fieldsToContent(s.fields); renderFields(); },
                            }, [el('i', { class: 'fa-solid fa-xmark' })]);
                            if (!canEdit) { for (const f2 of [labelInput, valueInput]) f2.setAttribute('disabled', ''); removeFieldBtn.setAttribute('disabled', ''); }
                            return el('div', { class: 'cc-field-row' }, [labelInput, valueInput, expandFieldBtn, removeFieldBtn]);
                        }));
                    };
                    renderFields();
                    const addFieldBtn = el('button', { class: 'cc-btn cc-add-field', type: 'button', text: '+ Field', onclick: () => { dirty = true; s.fields.push({ label: '', value: '' }); renderFields(); } });
                    body = el('div', {}, canEdit ? [fieldsWrap, addFieldBtn] : [fieldsWrap]);
                } else {
                    const contentInput = el('textarea', {
                        class: 'cc-section-content', spellcheck: 'false', placeholder: 'Details for this section\u2026',
                        oninput: () => { dirty = true; s.content = contentInput.value; },
                    });
                    contentInput.value = s.content ?? '';
                    if (!canEdit) contentInput.setAttribute('disabled', '');
                    const expandBtn = el('button', {
                        class: 'cc-section-expand-btn', type: 'button', title: 'Expand to full screen',
                        onclick: () => openTextFocus({ value: s.content, setValue: (v) => { s.content = v; }, compactEl: contentInput, title: titleInput.value || s.title || 'Section', editable: canEdit }),
                    }, [el('i', { class: 'fa-solid fa-up-right-and-down-left-from-center' })]);
                    body = el('div', { class: 'cc-section-content-wrap' }, [contentInput, expandBtn]);
                }

                if (!canEdit) { for (const f of [titleInput, enabledBox]) f.setAttribute('disabled', ''); removeBtn.setAttribute('disabled', ''); }

                list.append(el('div', {
                    class: 'cc-section-row',
                    ondragover: (e) => { if (dragIndex === null || !canEdit) return; e.preventDefault(); },
                    ondrop: (e) => {
                        e.preventDefault();
                        if (dragIndex === null || dragIndex === i) return;
                        const [moved] = draft.sections.splice(dragIndex, 1);
                        draft.sections.splice(dragIndex < i ? i - 1 : i, 0, moved);
                        dragIndex = null; dirty = true; renderList();
                    },
                }, [head, body]));
            });
        }
        renderList();

        const addBtn = el('button', { class: 'cc-btn', type: 'button', text: '+ Add custom section', onclick: () => { dirty = true; draft.sections.push({ title: 'Custom', content: '', enabled: true }); renderList(); } });
        const templateSelect = el('select', { class: 'cc-select' }, SECTION_TEMPLATES.map((t) => el('option', { value: t.name, text: t.name })));
        const addTemplateBtn = el('button', {
            class: 'cc-btn', type: 'button', text: '+ Add category',
            onclick: () => {
                dirty = true;
                const tpl = SECTION_TEMPLATES.find((t) => t.name === templateSelect.value);
                if (!tpl) return;
                const fields = tpl.fields.map((label) => ({ label, value: '' }));
                draft.sections.push({ title: tpl.name, enabled: true, fields, content: fieldsToContent(fields) });
                renderList();
            },
        });

        wrap.append(
            el('h4', { text: 'Additional Sections' }),
            el('div', { class: 'cc-sections-hint', text: 'These fold into the Description box above (and only that box) when you save. Pick a character-sheet category for labeled fields, or add a custom freeform block.' }),
            list,
            el('div', { class: 'cc-sections-hint', text: 'Ready-made character-sheet category:' }),
            el('div', { class: 'cc-sections-add' }, canEdit ? [templateSelect, addTemplateBtn] : []),
            el('div', { class: 'cc-sections-add' }, canEdit ? [addBtn] : []),
        );
        return wrap;
    }

    function detailBlock(title, bodyText) {
        if (!bodyText || !bodyText.trim()) return null;
        return el('div', { class: 'cc-detail-block' }, [
            el('div', { class: 'cc-detail-block-title', text: title }),
            el('div', { class: 'cc-detail-block-body', text: bodyText }),
        ]);
    }

    function labeledRow(label, inputEl, expandable) {
        const row = el('div', { class: 'cc-field-row' }, [
            el('span', { class: 'cc-field-label', text: label }),
            inputEl,
        ]);
        if (expandable) row.append(expandable);
        return row;
    }

    function renderDetailsTab(c, sections) {
        const wrap = el('div', { class: 'cc-details-view' });
        const blocks = [
            detailBlock('Description', sections.core),
            ...sections.sections.filter((s) => s.enabled !== false && (s.content ?? '').trim()).map((s) => detailBlock(s.title || 'Section', s.content)),
            detailBlock('Personality', c.personality),
            detailBlock('Scenario', c.scenario),
            detailBlock('First Message', c.first_mes),
            detailBlock('Example Dialogue', c.mes_example),
            ...c.alternate_greetings.map((g, i) => detailBlock(`Alternate Greeting ${i + 1}`, g)),
            detailBlock('Creator\u2019s Notes', c.creator_notes),
            detailBlock('System Prompt', c.system_prompt),
            detailBlock('Post-History Instructions', c.post_history_instructions),
            detailBlock('Depth Prompt', c.depthPrompt.prompt ? `${c.depthPrompt.prompt}\n(depth ${c.depthPrompt.depth}, role: ${c.depthPrompt.role})` : ''),
            detailBlock('Tags', c.tags.join(', ')),
            detailBlock('Creator', c.creator),
            detailBlock('Character Version', c.character_version),
            detailBlock('Linked Lorebook', c.world),
        ].filter(Boolean);
        if (!blocks.length) wrap.append(el('div', { class: 'cc-details-empty', text: 'Nothing written for this character yet \u2014 switch to the Edit tab to get started.' }));
        else wrap.append(el('div', { class: 'cc-detail-fields' }, blocks));
        return wrap;
    }

    function renderEditTab(c, sections, fields, noteEl) {
        const wrap = el('div', { class: 'cc-details-view' });
        const canEdit = !!adapter.updateCharacter;

        const descArea = el('textarea', { class: 'cc-section-content', rows: '5', spellcheck: 'false', oninput: () => { dirty = true; sections.core = descArea.value; } });
        descArea.value = sections.core;
        const descExpand = el('button', { class: 'cc-icon-btn', type: 'button', title: 'Expand to full screen', onclick: () => openTextFocus({ value: sections.core, setValue: (v) => { sections.core = v; }, compactEl: descArea, title: 'Description', editable: canEdit }) }, [el('i', { class: 'fa-solid fa-up-right-and-down-left-from-center' })]);

        function textField(label, key, rows = 4) {
            const area = el('textarea', { class: 'cc-section-content', rows: String(rows), spellcheck: 'false', oninput: () => { dirty = true; fields[key] = area.value; } });
            area.value = fields[key] ?? '';
            const expand = el('button', { class: 'cc-icon-btn', type: 'button', title: 'Expand to full screen', onclick: () => openTextFocus({ value: fields[key], setValue: (v) => { fields[key] = v; }, compactEl: area, title: label, editable: canEdit }) }, [el('i', { class: 'fa-solid fa-up-right-and-down-left-from-center' })]);
            if (!canEdit) area.setAttribute('disabled', '');
            return el('div', { class: 'cc-detail-block' }, [el('div', { class: 'cc-detail-block-title', text: label }), el('div', { class: 'cc-section-content-wrap' }, [area, expand])]);
        }

        // -- Alternate Greetings: repeatable list --
        const greetWrap = el('div', { class: 'cc-sections-list' });
        function renderGreetings() {
            greetWrap.replaceChildren(...fields.alternate_greetings.map((g, i) => {
                const area = el('textarea', { class: 'cc-section-content', rows: '3', spellcheck: 'false', oninput: () => { dirty = true; fields.alternate_greetings[i] = area.value; } });
                area.value = g;
                const removeBtn = el('button', { class: 'cc-icon-btn cc-icon-danger', type: 'button', title: 'Remove', onclick: () => { dirty = true; fields.alternate_greetings.splice(i, 1); renderGreetings(); } });
                return el('div', { class: 'cc-section-row' }, [el('div', { class: 'cc-section-row-head' }, [el('span', { class: 'cc-section-title', text: `Greeting ${i + 1}` }), removeBtn]), el('div', { class: 'cc-section-content-wrap' }, [area])]);
            }));
        }
        renderGreetings();
        const addGreetBtn = el('button', { class: 'cc-btn', type: 'button', text: '+ Add alternate greeting', onclick: () => { dirty = true; fields.alternate_greetings.push(''); renderGreetings(); } });

        const tagsInput = el('input', { class: 'cc-field-value', type: 'text', value: fields.tags.join(', '), placeholder: 'comma, separated, tags', oninput: () => { dirty = true; fields.tags = tagsInput.value.split(',').map((x) => x.trim()).filter(Boolean); } });
        const creatorInput = el('input', { class: 'cc-field-value', type: 'text', value: fields.creator, oninput: () => { dirty = true; fields.creator = creatorInput.value; } });
        const versionInput = el('input', { class: 'cc-field-value', type: 'text', value: fields.character_version, oninput: () => { dirty = true; fields.character_version = versionInput.value; } });
        const talkInput = el('input', { class: 'cc-size', type: 'range', min: '0', max: '1', step: '0.05', value: String(fields.talkativeness), oninput: () => { dirty = true; fields.talkativeness = Number(talkInput.value); } });
        const favInput = el('input', { type: 'checkbox' }); favInput.checked = !!fields.favorite;
        favInput.addEventListener('change', () => { dirty = true; fields.favorite = favInput.checked; });

        const depthPromptArea = el('textarea', { class: 'cc-section-content', rows: '3', spellcheck: 'false', oninput: () => { dirty = true; fields.depthPrompt.prompt = depthPromptArea.value; } });
        depthPromptArea.value = fields.depthPrompt.prompt ?? '';
        const depthInput = el('input', { type: 'number', min: '0', max: '9999', value: String(fields.depthPrompt.depth), oninput: () => { dirty = true; fields.depthPrompt.depth = Number(depthInput.value); } });
        const roleSelect = el('select', {}, ROLES.map(([v, label]) => el('option', { value: v, text: label })));
        roleSelect.value = fields.depthPrompt.role;
        roleSelect.addEventListener('change', () => { dirty = true; fields.depthPrompt.role = roleSelect.value; });

        if (!canEdit) for (const f of [descArea, tagsInput, creatorInput, versionInput, talkInput, favInput, depthPromptArea, depthInput, roleSelect]) f.setAttribute('disabled', '');

        wrap.append(
            el('div', { class: 'cc-detail-sub', text: c.id }),
            el('div', { class: 'cc-detail-block' }, [el('div', { class: 'cc-detail-block-title', text: 'Description' }), el('div', { class: 'cc-section-content-wrap' }, [descArea, descExpand])]),
            buildSectionsEditor(sections, canEdit),
            textField('Personality', 'personality'),
            textField('Scenario', 'scenario'),
            textField('First Message', 'first_mes'),
            textField('Example Dialogue', 'mes_example', 5),
            el('div', { class: 'cc-detail-block' }, [el('div', { class: 'cc-detail-block-title', text: 'Alternate Greetings' }), greetWrap, canEdit ? addGreetBtn : null].filter(Boolean)),
            textField('Creator\u2019s Notes', 'creator_notes'),
            textField('System Prompt', 'system_prompt'),
            textField('Post-History Instructions', 'post_history_instructions'),
            el('div', { class: 'cc-detail-block' }, [
                el('div', { class: 'cc-detail-block-title', text: 'Depth Prompt' }),
                el('div', { class: 'cc-section-content-wrap' }, [depthPromptArea]),
                el('div', { class: 'cc-row' }, [
                    el('div', { class: 'cc-field' }, [el('label', { text: 'Depth' }), depthInput]),
                    el('div', { class: 'cc-field' }, [el('label', { text: 'Role' }), roleSelect]),
                ]),
            ]),
            labeledRow('Tags', tagsInput),
            labeledRow('Creator', creatorInput),
            labeledRow('Character Version', versionInput),
            el('div', { class: 'cc-field-row' }, [el('span', { class: 'cc-field-label', text: `Talkativeness (${fields.talkativeness})` }), talkInput]),
            el('div', { class: 'cc-field-row' }, [el('span', { class: 'cc-field-label', text: 'Favorite' }), favInput]),
            el('div', { class: 'cc-meta' }, [el('b', { text: 'Linked Lorebook: ' }), document.createTextNode(c.world || 'none')]),
            noteEl,
        );
        // keep the talkativeness label live
        talkInput.addEventListener('input', () => { talkInput.previousElementSibling && (talkInput.previousElementSibling.textContent = `Talkativeness (${fields.talkativeness})`); });
        return wrap;
    }

    function renderPreviewTab(c, sections) {
        const wrap = el('div', { class: 'cc-preview-view' });
        const composed = adapter.composeDescription(sections.core, sections.sections);
        const output = el('div', { class: 'cc-preview-output', text: composed || '(empty)' });
        const tokenBadge = el('span', { class: 'cc-token-badge', text: '\u2026' });
        adapter.getTokenCount?.(composed).then((n) => { tokenBadge.textContent = `~${n} tokens`; });
        const expandBtn = el('button', { class: 'cc-btn', type: 'button', title: 'Toggle a larger preview box', text: 'Expand' });
        expandBtn.addEventListener('click', () => {
            const nowExpanded = output.classList.toggle('cc-expanded');
            expandBtn.textContent = nowExpanded ? 'Collapse' : 'Expand';
        });
        wrap.append(
            el('div', { class: 'cc-preview-info', text: 'Exactly what gets written into this character\u2019s real Description field when you save \u2014 the core text above plus every enabled Section, in order.' }),
            el('div', { class: 'cc-preview-toolbar' }, [tokenBadge, expandBtn]),
            output,
        );
        return wrap;
    }

    async function save() {
        if (!selectedId) return;
        const c = (adapter.getCharacters() ?? []).find((x) => x.id === selectedId);
        if (!c) return;
        await run(async () => {
            let currentId = selectedId;
            if (fieldsDraft.name !== undefined && fieldsDraft.name !== c.name && adapter.renameCharacter) {
                currentId = await adapter.renameCharacter(currentId, fieldsDraft.name);
                selectedId = currentId;
            }
            await adapter.saveCharacterSections(currentId, sectionsDraft);
            const { name, ...rest } = fieldsDraft;
            await adapter.updateCharacter(currentId, rest);
        }, 'Saved \u2713', 'Could not save this character.');
    }

    function renderDetail() {
        detail.replaceChildren();
        if (!selectedId) { detail.hidden = true; return; }
        const c = (adapter.getCharacters() ?? []).find((x) => x.id === selectedId);
        if (!c) { detail.hidden = true; selectedId = null; return; }
        detail.hidden = false;
        const activeId = adapter.getActiveId?.() ?? null;

        if (!sectionsDraft) sectionsDraft = adapter.getCharacterSections(c.id, c.description) ?? { core: c.description ?? '', sections: [] };
        if (!fieldsDraft) {
            fieldsDraft = {
                name: c.name, personality: c.personality, scenario: c.scenario, first_mes: c.first_mes, mes_example: c.mes_example,
                alternate_greetings: [...c.alternate_greetings], creator_notes: c.creator_notes, system_prompt: c.system_prompt,
                post_history_instructions: c.post_history_instructions, tags: [...c.tags], creator: c.creator, character_version: c.character_version,
                talkativeness: c.talkativeness, favorite: c.favorite, depthPrompt: { ...c.depthPrompt },
            };
        }

        const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            await run(() => adapter.replaceAvatar(c.id, file), 'Image replaced.', 'Could not replace the image.');
        });

        const noteEl = el('div', { class: 'cc-note', text: note });

        // -- header: name (always editable, matching Persona Library) + icon actions + close --
        const nameInput = el('input', {
            class: 'cc-name-input', type: 'text', value: c.name,
            oninput: () => { dirty = true; fieldsDraft.name = nameInput.value; },
        });
        if (!adapter.updateCharacter) nameInput.setAttribute('disabled', '');

        // Icon-only, same 34x34 square as every other header icon button —
        // see the CSS comment on .cc-back-to-grid for why a text label here
        // breaks that uniformity. Hand-drawn inline SVG (a 4-square grid +
        // a small back-arrow badge), not a single Font Awesome glyph,
        // matching Persona Library's own back-to-grid button exactly. Built
        // via innerHTML rather than the el() helper because el() uses
        // document.createElement, which can't create namespaced SVG/path
        // elements correctly — they need to come from parsed markup that
        // already contains the <svg> tag. Grouped into headerActions below
        // (as its first icon), not as a separate leading header element —
        // matching Persona Library's own layout exactly.
        const backToGrid = el('button', { class: 'cc-icon-btn cc-back-to-grid', type: 'button', title: 'Back to grid', onclick: () => closeDetail() });
        backToGrid.innerHTML = `
            <span class="cc-back-to-grid-icon-stack">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="2" y="2" width="9" height="9" rx="2"></rect>
                    <rect x="13" y="2" width="9" height="9" rx="2"></rect>
                    <rect x="2" y="13" width="9" height="9" rx="2"></rect>
                    <rect x="13" y="13" width="9" height="9" rx="2"></rect>
                </svg>
                <span class="cc-back-to-grid-icon-badge">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M17 4 L5 12 L17 20 Z"></path>
                    </svg>
                </span>
            </span>
        `;

        const headerActions = el('div', { class: 'cc-header-actions' }, [
            backToGrid,
            el('button', { class: 'cc-icon-btn', type: 'button', title: 'Open chat with this character', onclick: () => use(c.id) }, [el('i', { class: 'fa-solid fa-comment' })]),
            adapter.duplicateCharacter && el('button', {
                class: 'cc-icon-btn', type: 'button', title: 'Duplicate', onclick: async () => {
                    const newId = await run(() => adapter.duplicateCharacter(c.id), 'Character duplicated.', 'Could not duplicate.');
                    if (newId) select(newId);
                },
            }, [el('i', { class: 'fa-solid fa-copy' })]),
            adapter.openCharacterLore && el('button', { class: 'cc-icon-btn', type: 'button', title: 'Character Lore (native)', onclick: () => adapter.openCharacterLore(c.id) }, [el('i', { class: 'fa-solid fa-book-bookmark' })]),
            adapter.deleteCharacter && el('button', {
                class: 'cc-icon-btn cc-icon-danger', type: 'button', title: 'Delete', onclick: async () => {
                    const ask = adapter.confirm ?? (async (m) => window.confirm(m));
                    if (!await ask(`Delete "${c.name}"? This cannot be undone.`)) return;
                    selectedId = null;
                    await run(() => adapter.deleteCharacter(c.id), 'Character deleted.', 'Could not delete.');
                },
            }, [el('i', { class: 'fa-solid fa-trash' })]),
            detailTab === 'edit' && adapter.updateCharacter && el('button', { class: 'cc-btn cc-primary', type: 'button', text: 'Save', onclick: save }),
            el('button', {
                class: 'cc-detail-close', type: 'button', title: 'Close',
                // Reset our own state back to the grid first (so if the
                // native toggle below doesn't fire for some reason, or the
                // person reopens the tab, they land on the grid rather than
                // back inside whatever detail view they were just in) —
                // then click SillyTavern's own drawer-icon toggle to
                // actually close the whole panel. That's the real, separate
                // control for that (title="Character Management", confirmed
                // against the live DOM, not a guess) — Back to Grid already
                // covers "just go back to the grid," so X closing the panel
                // entirely instead is what actually makes the two buttons
                // do two different things. Routed through closeDetail() so
                // an unsaved-changes prompt still gets a chance to fire
                // first; the native-panel-close only happens once that's
                // resolved (or wasn't needed).
                onclick: () => closeDetail(() => document.querySelector('.drawer-icon[title="Character Management"]')?.click()),
            }, [el('i', { class: 'fa-solid fa-xmark' })]),
        ].filter(Boolean));

        const header = el('div', { class: 'cc-detail-header' }, [
            el('div', { class: 'cc-detail-header-title' }, [
                c.id === activeId ? el('span', { class: 'cc-active-pill', text: 'ACTIVE' }) : null,
                nameInput,
            ].filter(Boolean)),
            headerActions,
        ]);

        // -- tabs (Details / Edit / Preview) --
        const tabBar = el('div', { class: 'cc-detail-tabs' }, [
            el('button', { class: `cc-detail-tab${detailTab === 'details' ? ' active' : ''}`, type: 'button', text: 'Details', onclick: () => { detailTab = 'details'; renderDetail(); } }),
            adapter.updateCharacter && el('button', { class: `cc-detail-tab${detailTab === 'edit' ? ' active' : ''}`, type: 'button', text: 'Edit', onclick: () => { detailTab = 'edit'; renderDetail(); } }),
            el('button', { class: `cc-detail-tab${detailTab === 'preview' ? ' active' : ''}`, type: 'button', text: 'Preview', title: 'Exactly what gets written into Description', onclick: () => { detailTab = 'preview'; renderDetail(); } }),
        ].filter(Boolean));

        // -- hero image column: photo, then a nav bar (prev / replace / next) below it, not overlaid on top --
        const heroImg = charImg({ class: 'cc-detail-hero', alt: c.name, title: 'Click to enlarge', src: adapter.imageUrl ? adapter.imageUrl(c.id) : c.image }, c.id, adapter);
        heroImg.addEventListener('click', () => openLightbox(heroImg.src, c.name));
        const heroImgArea = el('div', { class: 'cc-hero-img-area' }, [heroImg]);

        const list = visibleCharacters();
        const canNav = list.length > 1;
        const navPrev = canNav && el('button', { class: 'cc-hero-nav-btn', type: 'button', title: 'Previous character', onclick: () => step(-1) }, [el('i', { class: 'fa-solid fa-chevron-left' })]);
        const navNext = canNav && el('button', { class: 'cc-hero-nav-btn', type: 'button', title: 'Next character', onclick: () => step(1) }, [el('i', { class: 'fa-solid fa-chevron-right' })]);
        const changeImageBtn = adapter.replaceAvatar && el('button', { class: 'cc-hero-nav-btn', type: 'button', title: 'Replace image', onclick: () => fileInput.click() }, [el('i', { class: 'fa-solid fa-image' })]);
        const navBar = (canNav || changeImageBtn) && el('div', { class: 'cc-hero-nav-bar' }, [navPrev, changeImageBtn, navNext].filter(Boolean));

        const heroWrap = el('div', { class: 'cc-detail-hero-wrap' }, [heroImgArea, navBar].filter(Boolean));

        // -- tab content --
        let tabContent;
        if (detailTab === 'details') tabContent = renderDetailsTab(c, sectionsDraft);
        else if (detailTab === 'edit' && adapter.updateCharacter) tabContent = renderEditTab(c, sectionsDraft, fieldsDraft, noteEl);
        else tabContent = renderPreviewTab(c, sectionsDraft);

        const body = el('div', { class: 'cc-detail-body' }, [heroWrap, tabContent]);

        // Size the hero column to the image's OWN aspect ratio via JS
        // measurement, since flexbox alone hits a circular-sizing case here
        // (the wrap's width would depend on the image's rendered width,
        // which itself depends on the wrap's height) that otherwise leaves
        // either a stretched/blurry image or a black margin. Skipped
        // entirely on the stacked (narrow-screen) layout, where CSS already
        // makes the hero column full-width.
        function syncHeroWidth() {
            if (!heroImg.naturalWidth || !heroImg.naturalHeight) return;
            const stacked = getComputedStyle(body).flexDirection === 'column';
            if (stacked) { heroWrap.style.flex = ''; heroWrap.style.width = ''; return; }
            const h = heroImgArea.clientHeight;
            if (!h) return;
            const maxW = (heroWrap.parentElement?.clientWidth ?? 0) * 0.45;
            const w = Math.round((heroImg.naturalWidth / heroImg.naturalHeight) * h);
            heroWrap.style.flex = '0 0 auto';
            heroWrap.style.width = `${maxW ? Math.min(w, maxW) : w}px`;
        }
        if (heroImg.complete && heroImg.naturalWidth) requestAnimationFrame(syncHeroWidth);
        else heroImg.addEventListener('load', () => requestAnimationFrame(syncHeroWidth), { once: true });

        detail.append(el('div', { class: 'cc-detail-modal' }, [header, fileInput, tabBar, body]));
        requestAnimationFrame(syncHeroWidth);
    }

    function refresh() { renderGrid(); if (selectedId) renderDetail(); }

    let unsubscribe = null;
    try { unsubscribe = adapter.subscribe?.(() => refresh()) ?? null; } catch (e) { console.warn('[CharacterCanvas] subscribe failed', e); }

    renderGrid();

    return {
        refresh,
        destroy() {
            try { unsubscribe?.(); } catch { /* ignore */ }
            container.replaceChildren();
        },
    };
}
