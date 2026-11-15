// ==UserScript==
// @name         Poe trade finer-search-options
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  enables finer search options in Path of exile official trade site, allowing filtering in/out mods directly from the current search result list
// @author       Maxime B (original), arturino009 (2.x rewrite)
// @homepageURL  https://github.com/arturino009/poe-trade-finer-search-options
// @supportURL   https://github.com/arturino009/poe-trade-finer-search-options/issues
// @updateURL    https://raw.githubusercontent.com/arturino009/poe-trade-finer-search-options/main/poe-trade-finer-search-options.user.js
// @downloadURL  https://raw.githubusercontent.com/arturino009/poe-trade-finer-search-options/main/poe-trade-finer-search-options.user.js
// @match        https://www.pathofexile.com/trade*
// @match        https://pathofexile.com/trade*
// @exclude      https://www.pathofexile.com/trade/exchange/*
// @run-at       document-idle
// @license      MIT
// @grant        none
// ==/UserScript==

/*
 * 2.0.0: rewritten for the current trade site.
 * The site moved to Vue 3 (no more $children / $vnode) and the results list is now a
 * separate Vue 3 app teleported into #vue3-portal, so walking the component tree no longer works.
 * This version talks to the legacy app's Vuex store (window.app.$store) directly instead,
 * which is the same thing the site's own "search for similar" feature does.
 */
(function () {
    'use strict';

    const LOG = '[finer-search]';
    const STEP = 10;

    const PSEUDO = {
        life: 'pseudo.pseudo_total_life',
        cold: 'pseudo.pseudo_total_cold_resistance',
        fire: 'pseudo.pseudo_total_fire_resistance',
        ligt: 'pseudo.pseudo_total_lightning_resistance',
        chaos: 'pseudo.pseudo_total_chaos_resistance',
        allR: 'pseudo.pseudo_total_elemental_resistance',
        move: 'pseudo.pseudo_increased_movement_speed',
    };

    const GLOBAL_BUTTONS = [
        { type: 'life,cold,fire,ligt', label: 'all res & life' },
        { type: 'allR', label: 'elemental resistances' },
        { type: 'life', label: 'life' },
        { type: 'cold', label: 'cold res' },
        { type: 'fire', label: 'fire res' },
        { type: 'ligt', label: 'lightning res' },
        { type: 'chaos', label: 'chaos res' },
        { type: 'move', label: 'movement speed' },
    ];

    //---------STYLE---------//
    const css = `
        .finer-mod { position: relative; }
        .finer-mod.finer-filterable:hover { background: rgba(255, 255, 255, 0.12); }
        .finer-mod.finer-filtered-and { box-shadow: inset 0 0 0 999px rgba(0, 136, 0, .25); }
        .finer-mod.finer-filtered-not { box-shadow: inset 0 0 0 999px rgba(136, 0, 0, .25); }
        .finer-btns { position: absolute; left: 2px; top: 50%; transform: translateY(-50%); display: none; z-index: 5; }
        .finer-mod:hover > .finer-btns { display: inline-flex; }
        .finer-btn { padding: 0 7px; margin-right: 2px; color: #fff; outline: solid 1px grey; cursor: pointer; font-weight: bold; line-height: 1.3; user-select: none; }
        .finer-btn.add { background: rgba(2, 93, 34, 0.9); }
        .finer-btn.rmv { background: rgba(93, 2, 2, 0.9); }
        .finer-btn:hover { filter: brightness(140%); }

        #finer-search-global { color: #fff; width: 13em; background: rgba(0, 0, 0, 0.8); position: fixed; right: 10px; top: 50px; z-index: 1001; font-size: 13px; user-select: none; font-family: inherit; }
        #finer-search-global .hidden { display: none !important; }
        #finer-search-global-title { outline: 1px solid rgb(138, 86, 9); background-color: rgb(90, 56, 6); display: block; text-align: center; text-transform: capitalize; font-size: 115%; cursor: move; padding: 1px 20px; }
        .finer-toggle { position: absolute; right: 5px; top: 4px; width: 15px; height: 15px; background: rgb(56, 35, 4); cursor: pointer; text-align: center; line-height: 15px; font-size: 11px; }
        .finer-toggle:hover { filter: brightness(130%); }
        .finer-section { padding: 5px 4px 4px; position: relative; }
        .finer-section + .finer-section { border-top: solid 1px #777; }
        .finer-section-title { text-align: center; display: block; }
        .finer-global-btn { background: rgb(15, 48, 77); outline: solid 1px rgb(76, 76, 125); margin-top: 6px; padding: 1px 2px 1px .4em; display: grid; grid-gap: 3px; grid-template-columns: auto 1.2em 1.2em; text-transform: capitalize; align-items: center; }
        .finer-global-btn .finer-value { color: #bbb; font-size: 90%; margin-left: 4px; text-transform: none; }
        .finer-pm { height: 1.2em; border: 1px inset rgba(255, 255, 255, 0.45); display: flex; justify-content: center; align-items: center; cursor: pointer; }
        .finer-pm.plus { background: rgb(29, 139, 53); }
        .finer-pm.minus { background: rgb(139, 28, 28); }
        .finer-pm:hover { filter: brightness(140%); }
    `;

    //---------SITE ACCESS---------//
    const app = () => window.app;
    const store = () => app() && app().$store;
    const ready = () => !!(store() && store().state && store().state.persistent);
    const stats = () => store().state.persistent.stats;

    const groupIndex = type => stats().findIndex(g => g.type === type);

    const ensureGroup = type => {
        let i = groupIndex(type);
        if (i === -1) {
            store().commit('pushStatGroup', { type, filters: [] });
            i = stats().length - 1;
        }
        return i;
    };

    // returns 'and' | 'not' | other group type | null
    const filterTypeOf = id => {
        for (const g of stats()) {
            if ((g.filters || []).some(f => f && f.id === id)) return g.type;
        }
        return null;
    };

    const findFilter = (id, type) => {
        for (let gi = 0; gi < stats().length; gi++) {
            const g = stats()[gi];
            if (type && g.type !== type) continue;
            const fi = (g.filters || []).findIndex(f => f && f.id === id);
            if (fi !== -1) return { group: gi, index: fi, filter: g.filters[fi] };
        }
        return null;
    };

    const toast = msg => {
        try {
            app().$refs.toastr.Add({ msg, progressbar: false, timeout: 3000 });
        } catch (e) {
            console.log(LOG, msg);
        }
    };

    const commitAndSearch = () => {
        app().save(true);
        const btn = document.querySelector('.btn.search-btn');
        if (btn) btn.click();
        // results will re-render; refresh our marks once they do
        setTimeout(markAll, 50);
    };

    //---------PER-MOD BUTTONS---------//
    const statIdOf = modEl => {
        const field = modEl.querySelector('[data-field^="stat."]');
        return field ? field.getAttribute('data-field').slice(5) : null;
    };

    const markMod = modEl => {
        const id = statIdOf(modEl);
        if (!id) return;
        modEl.classList.add('finer-mod');
        const type = filterTypeOf(id);
        modEl.classList.toggle('finer-filtered-and', type === 'and');
        modEl.classList.toggle('finer-filtered-not', type === 'not');
        modEl.classList.toggle('finer-filterable', !type);

        let btns = modEl.querySelector(':scope > .finer-btns');
        if (type) {
            if (btns) btns.remove();
            return;
        }
        if (!btns) {
            btns = document.createElement('span');
            btns.className = 'finer-btns';
            btns.innerHTML =
                '<span class="finer-btn add" title="add this mod to your search filters">+</span>' +
                '<span class="finer-btn rmv" title="exclude this mod from your search results">-</span>';
            modEl.appendChild(btns);
        }
    };

    const markAll = () => {
        if (!ready()) return;
        document.querySelectorAll('.resultset .item-mod').forEach(markMod);
    };

    const addModFilter = (modEl, type) => {
        const id = statIdOf(modEl);
        if (!id) return;
        if (filterTypeOf(id)) {
            toast(`the stat ${id} is already in your filters.`);
            return;
        }
        const group = ensureGroup(type);
        store().commit('setStatFilter', { group, value: { id, value: {}, disabled: false } });
        store().commit('showAdvancedSearch', true);
        toast(`the stat ${id} has been ${type === 'and' ? 'added to' : 'excluded from'} your stat filters.`);
        commitAndSearch();
    };

    //---------GLOBAL PANEL---------//
    const buildPanel = () => {
        const panel = document.createElement('div');
        panel.id = 'finer-search-global';
        panel.innerHTML = `
            <span id="finer-search-global-title">add to filters</span>
            <div class="finer-toggle" data-target="finer-body">&#9656;</div>
            <div class="finer-body hidden">
                <div class="finer-section mods">
                    <span class="finer-section-title">- Modifiers (min ±${STEP}) -</span>
                    ${GLOBAL_BUTTONS.map(b => `
                        <div class="finer-global-btn" data-type="${b.type}">
                            <span class="mod-name">${b.label}<span class="finer-value"></span></span>
                            <span title="decrease min value by ${STEP}" class="finer-pm minus">-</span>
                            <span title="increase min value by ${STEP}" class="finer-pm plus">+</span>
                        </div>`).join('')}
                </div>
                <div class="finer-section misc">
                    <span class="finer-section-title">- Miscellaneous -</span>
                    <div class="finer-global-btn" data-type="price">
                        <span class="mod-name">buyout max<span class="finer-value"></span></span>
                        <span title="decrease max price by 1" class="finer-pm minus">-</span>
                        <span title="increase max price by 1" class="finer-pm plus">+</span>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(panel);
        restorePosition(panel);
        return panel;
    };

    const priceFilter = () => {
        const f = store().state.persistent.filters;
        return (f && f.trade_filters && f.trade_filters.filters && f.trade_filters.filters.price) || {};
    };

    const refreshPanelValues = () => {
        const panel = document.getElementById('finer-search-global');
        if (!panel || !ready()) return;
        panel.querySelectorAll('.finer-global-btn').forEach(btn => {
            const out = btn.querySelector('.finer-value');
            const type = btn.dataset.type;
            let text = '';
            if (type === 'price') {
                const p = priceFilter();
                text = p.max != null ? `≤ ${p.max}` : '';
            } else if (!type.includes(',')) {
                const hit = findFilter(PSEUDO[type], 'and');
                if (hit) text = `≥ ${(hit.filter.value && hit.filter.value.min) || 0}`;
            }
            out.textContent = text ? ` (${text})` : '';
        });
    };

    const changePseudo = (typeList, more) => {
        let changed = false;
        typeList.split(',').forEach(t => {
            const id = PSEUDO[t];
            if (!id) return;
            const hit = findFilter(id, 'and');
            if (hit) {
                const value = Object.assign({}, hit.filter.value || {});
                const min = value.min || 0;
                if (more || min > STEP) {
                    value.min = min + (more ? STEP : -STEP);
                    store().commit('setStatFilter', { group: hit.group, index: hit.index, value: Object.assign({}, hit.filter, { value }) });
                } else {
                    store().commit('removeStatFilter', { group: hit.group, index: hit.index });
                }
                changed = true;
            } else if (more) {
                const group = ensureGroup('and');
                store().commit('setStatFilter', { group, value: { id, value: { min: STEP }, disabled: false } });
                changed = true;
            }
        });
        if (changed) {
            store().commit('showAdvancedSearch', true);
            commitAndSearch();
        }
    };

    const changePrice = more => {
        const current = priceFilter();
        const value = Object.assign({}, current);
        const max = current.max || 0;
        if (more) value.max = (max || 4) + 1;
        else if (max > 1) value.max = max - 1;
        else delete value.max;
        store().commit('setPropertyFilter', { group: 'trade_filters', index: 'price', value });
        commitAndSearch();
    };

    //---------DRAGGING---------//
    const POS_KEY = 'finer-search-global-pos';
    let drag = null;

    const clamp = (panel, left, top) => ({
        left: Math.max(0, Math.min(left, window.innerWidth - panel.offsetWidth)),
        top: Math.max(0, Math.min(top, window.innerHeight - panel.offsetHeight)),
    });

    const place = (panel, pos) => {
        const p = clamp(panel, pos.left, pos.top);
        panel.style.left = p.left + 'px';
        panel.style.top = p.top + 'px';
        panel.style.right = 'auto';
    };

    const restorePosition = panel => {
        try {
            const pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
            if (pos) place(panel, pos);
        } catch (e) { /* ignore */ }
    };

    //---------EVENTS---------//
    document.addEventListener('click', e => {
        if (!ready()) return;
        const t = e.target;

        const modBtn = t.closest('.finer-btn');
        if (modBtn) {
            e.preventDefault();
            e.stopPropagation();
            addModFilter(modBtn.closest('.item-mod'), modBtn.classList.contains('add') ? 'and' : 'not');
            return;
        }

        const pm = t.closest('#finer-search-global .finer-pm');
        if (pm) {
            const type = pm.closest('.finer-global-btn').dataset.type;
            const more = pm.classList.contains('plus');
            if (type === 'price') changePrice(more);
            else changePseudo(type, more);
            return;
        }

        const toggle = t.closest('#finer-search-global .finer-toggle');
        if (toggle) {
            const body = toggle.parentElement.querySelector('.finer-body');
            const hidden = body.classList.toggle('hidden');
            toggle.innerHTML = hidden ? '&#9656;' : '&#9662;';
        }
    }, true);

    document.addEventListener('mousedown', e => {
        if (e.target.id !== 'finer-search-global-title') return;
        const panel = e.target.parentElement;
        const r = panel.getBoundingClientRect();
        drag = { panel, dx: e.clientX - r.left, dy: e.clientY - r.top };
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (drag) place(drag.panel, { left: e.clientX - drag.dx, top: e.clientY - drag.dy });
    });
    document.addEventListener('mouseup', () => {
        if (!drag) return;
        const r = drag.panel.getBoundingClientRect();
        try { localStorage.setItem(POS_KEY, JSON.stringify({ left: r.left, top: r.top })); } catch (e) { /* ignore */ }
        drag = null;
    });
    window.addEventListener('resize', () => {
        const panel = document.getElementById('finer-search-global');
        if (panel && panel.style.left) {
            const r = panel.getBoundingClientRect();
            place(panel, { left: r.left, top: r.top });
        }
    });

    //---------INIT---------//
    const init = () => {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
        buildPanel();

        let scheduled = false;
        const schedule = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                markAll();
                refreshPanelValues();
            });
        };
        new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });

        // re-mark when filters change without a DOM mutation of the results
        try {
            store().subscribe(m => {
                if (/Stat|Filter|clearSearchForm/.test(m.type)) schedule();
            });
        } catch (e) { /* ignore */ }

        schedule();
    };

    // wait for the trade app (and its store) to exist
    const start = Date.now();
    (function waitForApp() {
        if (ready()) return init();
        if (Date.now() - start > 30000) return console.warn(LOG, 'trade app not found, giving up');
        setTimeout(waitForApp, 200);
    })();
})();
