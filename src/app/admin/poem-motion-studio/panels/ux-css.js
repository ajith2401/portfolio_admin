// Styles for the P7 UX layer (modal/bottom sheet, gallery, banner). UI transitions are disabled under
// prefers-reduced-motion and when the author turns on "Reduce interface motion" (data-reduce-ui on .pms).
export const UX_CSS = `
.pms-modal-scrim{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}
.pms-modal{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:16px;width:min(560px,100%);max-height:min(80dvh,720px);overflow:auto;outline:none;animation:pms-in .18s ease-out}
@media (max-width:640px){
.pms-modal-scrim{align-items:flex-end;padding:0}
.pms-modal{width:100%;max-height:85dvh;border-radius:16px 16px 0 0;padding-bottom:calc(16px + env(safe-area-inset-bottom));animation:pms-up .2s ease-out}
}
@keyframes pms-in{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:none}}
@keyframes pms-up{from{transform:translateY(24px);opacity:.6}to{transform:none;opacity:1}}
.pms-gallery{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(min(100%,140px),1fr))}
.pms-gcard{position:relative;border:1px solid var(--line);border-radius:12px;padding:6px;background:var(--card);min-width:0}
.pms-gcard[data-on=true]{outline:3px solid var(--accent);outline-offset:1px}
.pms-gcard>button.pms-gpick{display:block;width:100%;min-height:44px;text-align:left;background:none;border:0;padding:0;color:inherit;cursor:pointer}
.pms-review-tag{display:inline-block;margin-top:4px;padding:1px 6px;border-radius:999px;border:1px dashed var(--line);font-size:11px;line-height:1.5;color:var(--mute)}
.pms-gfav{position:absolute;top:8px;right:8px;min-width:44px;min-height:44px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-size:18px;line-height:1}
.pms-chips{display:flex;flex-wrap:wrap;gap:6px}
.pms-chips .pms-btn[aria-pressed=true]{background:var(--accent);color:var(--accent-ink)}
.pms-routes{display:grid;gap:6px;grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr))}
.pms-routes .pms-btn{min-height:56px;text-align:left;display:block}
.pms-routes .pms-btn[aria-pressed=true]{background:var(--accent);color:var(--accent-ink)}
.pms-kbd{font-family:ui-monospace,monospace;border:1px solid var(--line);border-radius:6px;padding:1px 6px;white-space:nowrap}
.pms[data-reduce-ui=true] *,.pms[data-reduce-ui=true] *::before{animation:none!important;transition:none!important;scroll-behavior:auto!important}
@media (prefers-reduced-motion:reduce){.pms-modal{animation:none!important}.pms *{transition:none!important}}
`;
