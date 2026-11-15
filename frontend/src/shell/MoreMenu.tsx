import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";

export type MoreLink = { href: string; name: string; hint: string; current: boolean; divider?: boolean };

/**
 * The More disclosure in the header. A button opens a panel of links; Escape
 * closes it and returns focus to the button, as does a click or focus outside
 * it. Arrow keys, Home and End move between the links. The panel is fixed to
 * the viewport, so a scrolling tab row on narrow screens never clips it.
 */
export function MoreMenu({ links }: { links: readonly MoreLink[] }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const measure = () => {
      const rect = button.current!.getBoundingClientRect();
      setPlace({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      const target = event.target as Node | null;
      if (target && (panel.current?.contains(target) || button.current?.contains(target))) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);

  const items = () => [...(panel.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close(true);
      return;
    }
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLAnchorElement);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = open ? (at + 1) % list.length : 0;
    else if (event.key === "ArrowUp") next = open ? (at <= 0 ? list.length - 1 : at - 1) : list.length - 1;
    else if (open && event.key === "Home") next = 0;
    else if (open && event.key === "End") next = list.length - 1;
    if (next === null) return;
    event.preventDefault();
    if (!open) {
      setOpen(true);
      requestAnimationFrame(() => items()[next as number]?.focus());
    } else list[next]?.focus();
  };

  const current = links.some((link) => link.current);
  return (
    <div className="more-menu" onKeyDown={onKey}>
      <button
        ref={button}
        type="button"
        className={`more-toggle${current ? " current" : ""}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        More <ChevronDown size={13} aria-hidden="true" />
      </button>
      <div
        ref={panel}
        id={id}
        className="more-menu-panel"
        hidden={!open}
        style={place ? { top: place.top, right: place.right } : undefined}
        role="group"
        aria-label="More sections"
      >
        {links.map((link) => (
          <div key={link.href + link.name}>
            {link.divider && <hr />}
            <a href={link.href} aria-current={link.current ? "page" : undefined} onClick={() => close(false)}>
              {link.name}
              <small>{link.hint}</small>
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
