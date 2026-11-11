import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { categorizeTransactions, fetchCategories } from '../lib/transactionCategorization';
import type { LocaleMessages } from '../locales/types';
import { getAnchoredPanelPosition } from '../lib/anchoredPanelPosition';

interface CategorizePanelProps {
  messages: LocaleMessages;
  transactionIds: string[];
  isSelection: boolean;
  anchorRow: HTMLTableRowElement;
  anchorCell: HTMLTableCellElement;
  onClose: (changed: boolean) => void;
}

export default function CategorizePanel({ messages, transactionIds, isSelection, anchorRow, anchorCell, onClose }: CategorizePanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingRef = useRef(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [categoryId, setCategoryId] = useState('');
  const [insertRule, setInsertRule] = useState(false);
  const [applyRule, setApplyRule] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    anchorRow.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });

    function positionDialog() {
      if (!dialog || !anchorRow.isConnected) return;
      const visualViewport = window.visualViewport;
      const viewport = {
        left: visualViewport?.offsetLeft ?? 0,
        top: visualViewport?.offsetTop ?? 0,
        width: visualViewport?.width ?? document.documentElement.clientWidth,
        height: visualViewport?.height ?? window.innerHeight,
      };
      // scrollIntoView does not account for the table's sticky header.
      const scroller = anchorRow.closest('.panel-scroll');
      if (scroller) {
        const bounds = scroller.getBoundingClientRect();
        const headerBottom = scroller.querySelector('thead')?.getBoundingClientRect().bottom ?? bounds.top;
        const visibleTop = Math.max(bounds.top, headerBottom, viewport.top + 12);
        const visibleBottom = Math.min(bounds.bottom, viewport.top + viewport.height - 12);
        const row = anchorRow.getBoundingClientRect();
        if (row.top < visibleTop) scroller.scrollTop += row.top - visibleTop;
        else if (row.bottom > visibleBottom) scroller.scrollTop += row.bottom - visibleBottom;
      }
      dialog.style.width = `${Math.min(480, viewport.width - 24)}px`;
      dialog.style.maxHeight = 'none';
      const row = anchorRow.getBoundingClientRect();
      const anchor = { top: row.top, bottom: row.bottom, right: anchorCell.getBoundingClientRect().right };
      const position = getAnchoredPanelPosition(anchor, dialog.getBoundingClientRect(), viewport);
      dialog.style.left = `${position.left}px`;
      dialog.style.top = `${position.top}px`;
      dialog.style.maxHeight = `${position.maxHeight}px`;
    }

    dialog.showModal();
    positionDialog();
    const observer = new ResizeObserver(positionDialog);
    observer.observe(anchorRow);
    observer.observe(anchorCell);
    if (dialog.firstElementChild) observer.observe(dialog.firstElementChild);
    const form = dialog.querySelector('form');
    if (form) observer.observe(form);
    function onScroll(event: Event) {
      if (event.target instanceof Node && dialog?.contains(event.target)) return;
      positionDialog();
    }
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', positionDialog);
    window.visualViewport?.addEventListener('resize', positionDialog);
    window.visualViewport?.addEventListener('scroll', positionDialog);
    return () => {
      observer.disconnect();
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', positionDialog);
      window.visualViewport?.removeEventListener('resize', positionDialog);
      window.visualViewport?.removeEventListener('scroll', positionDialog);
      dialog.close();
    };
  }, [anchorRow, anchorCell]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetchCategories(supabase, controller.signal).then((data) => {
      if (active) setCategories(data);
    }).catch(() => {
      if (active) setLoadError(true);
    });
    return () => { active = false; controller.abort(); };
  }, [retry]);

  async function applyCategory() {
    if (pendingRef.current || !categoryId) return;
    pendingRef.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      await categorizeTransactions(supabase, transactionIds, categoryId, insertRule, applyRule);
      onClose(true);
    } catch {
      setSaveError(true);
    } finally {
      pendingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="categorize-dialog"
      aria-labelledby="categorize-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pendingRef.current) onClose(false);
      }}
      onClose={(event) => {
        if (!event.currentTarget.open && !pendingRef.current) onClose(false);
      }}
    >
      <h2 id="categorize-title">{isSelection
        ? messages.categorizeSelected.replace('{count}', String(transactionIds.length))
        : messages.categorizeTransaction}</h2>
      <form onSubmit={(event) => { event.preventDefault(); void applyCategory(); }}>
        {loadError ? (
          <div role="alert">
            <p className="form-message form-message-error">{messages.categoriesError}</p>
            <button type="button" className="button button-secondary" onClick={() => { setLoadError(false); setRetry((value) => value + 1); }}>{messages.retry}</button>
          </div>
        ) : categories === null ? <p role="status">{messages.loadingCategories}</p>
          : categories.length === 0 ? <p>{messages.noCategories}</p> : (
            <>
              <label htmlFor="categorize-category">{messages.transactionCategory}</label>
              <select id="categorize-category" value={categoryId} disabled={saving} required autoFocus onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">{messages.chooseCategory}</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </>
          )}
        <label className="category-rule-option">
          <input type="checkbox" checked={insertRule} disabled={saving} aria-describedby="category-rule-help" onChange={(event) => {
            setInsertRule(event.target.checked);
            if (!event.target.checked) setApplyRule(false);
          }} />
          <span>{messages.saveCategoryRule}</span>
        </label>
        <p id="category-rule-help" className="category-rule-help">{messages.categoryRuleHelp}</p>
        <label className="category-rule-option">
          <input type="checkbox" checked={applyRule} disabled={saving || !insertRule} aria-describedby="apply-category-rule-help" onChange={(event) => setApplyRule(event.target.checked)} />
          <span>{messages.applyCategoryRule}</span>
        </label>
        <p id="apply-category-rule-help" className="category-rule-help">{messages.applyCategoryRuleHelp}</p>
        {saveError && <p role="alert" className="form-message form-message-error">{messages.categorySaveError}</p>}
        <div className="categorize-actions">
          <button type="button" className="button button-secondary" disabled={saving} onClick={() => onClose(false)}>{messages.cancel}</button>
          <button type="submit" className="button button-primary" disabled={saving || !categories?.length || !categoryId}>{saving ? messages.savingCategory : messages.applyCategory}</button>
        </div>
      </form>
    </dialog>
  );
}
