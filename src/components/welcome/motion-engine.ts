import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { MODAL_EVENT } from "@/components/auth/events";

/**
 * Welcome motion, loaded only by `WelcomeMotion` through a dynamic import. Spec: docs/screens/welcome/motion.md.
 *
 * Rules kept here:
 * - The server HTML is the final state. An effect only sets a start frame on elements that are still below the fold, so nothing that is
 *   already on screen jumps back.
 * - Only transform and opacity animate (plus text of two counters). No layout property is tweened.
 * - Lenis smooths wheel input only; touch and keyboard keep native scrolling. It stops while a dialog is open and when the tab is hidden.
 * - Everything is undone by the returned cleanup (gsap.context revert, listeners, Lenis destroy).
 */

type Step = { e: number; p: number; b: number };

const below = (el: Element) => el.getBoundingClientRect().top > window.innerHeight;

export function startWelcomeMotion(root: HTMLElement): () => void {
  gsap.registerPlugin(ScrollTrigger);
  const off: (() => void)[] = [];
  const listen = <K extends keyof WindowEventMap>(target: Window | Document | HTMLElement, type: K | string, fn: (event: never) => void, opts?: AddEventListenerOptions) => {
    target.addEventListener(type, fn as EventListener, opts);
    off.push(() => target.removeEventListener(type, fn as EventListener, opts));
  };
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* Smooth wheel scrolling, synced with ScrollTrigger on one ticker. */
  const lenis = new Lenis({ lerp: 0.11, smoothWheel: true, prevent: (node: HTMLElement) => Boolean(node.closest?.("dialog, [data-lenis-prevent]")) });
  lenis.on("scroll", ScrollTrigger.update);
  const tick = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  document.documentElement.dataset.smooth = "";

  // Same-page anchors scroll through Lenis, then move focus to the target so keyboard and screen reader users arrive there too.
  listen(document, "click", (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest?.('a[href^="#"]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const id = decodeURIComponent(link.getAttribute("href")!.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    event.preventDefault();
    lenis.scrollTo(target, {
      offset: -16,
      onComplete: () => {
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
        history.replaceState(null, "", `#${id}`);
      },
    });
  });
  listen(window, MODAL_EVENT, (event: CustomEvent<boolean>) => (event.detail ? lenis.stop() : lenis.start()));
  listen(document, "visibilitychange", () => {
    if (document.hidden) {
      gsap.globalTimeline.pause();
      lenis.stop();
    } else {
      gsap.globalTimeline.resume();
      lenis.start();
    }
  });

  // Text and attributes the story rewrites, restored on cleanup so a later reduced-motion switch shows the final state again.
  const restore: (() => void)[] = [];

  const ctx = gsap.context(() => {
    /* Hero: a soft spotlight follows the pointer over the navy panel; the board leans toward it. */
    const panel = root.querySelector<HTMLElement>('[data-w="spotlight"]');
    const glow = panel?.querySelector<HTMLElement>('[data-w="glow"]');
    if (panel && glow && finePointer) {
      const x = gsap.quickTo(glow, "x", { duration: 0.6, ease: "power3.out" });
      const y = gsap.quickTo(glow, "y", { duration: 0.6, ease: "power3.out" });
      gsap.set(glow, { opacity: 0 });
      listen(panel, "pointerenter", () => gsap.to(glow, { opacity: 1, duration: 0.4 }));
      listen(panel, "pointerleave", () => gsap.to(glow, { opacity: 0, duration: 0.6 }));
      listen(panel, "pointermove", (event: PointerEvent) => {
        const box = panel.getBoundingClientRect();
        x(event.clientX - box.left - glow.offsetWidth / 2);
        y(event.clientY - box.top - glow.offsetHeight / 2);
      });
    }

    /* Tilt toward the pointer, a few degrees, fine pointers only. */
    if (finePointer) {
      root.querySelectorAll<HTMLElement>('[data-w="tilt"]').forEach((card) => {
        const max = card.closest('[data-w="hero"]') ? 5 : 3;
        gsap.set(card, { transformPerspective: 900 });
        const rx = gsap.quickTo(card, "rotationX", { duration: 0.5, ease: "power3.out" });
        const ry = gsap.quickTo(card, "rotationY", { duration: 0.5, ease: "power3.out" });
        listen(card, "pointermove", (event: PointerEvent) => {
          const box = card.getBoundingClientRect();
          ry(((event.clientX - box.left) / box.width - 0.5) * 2 * max);
          rx(-((event.clientY - box.top) / box.height - 0.5) * 2 * max);
        });
        listen(card, "pointerleave", () => { rx(0); ry(0); });
      });

      /* The primary call to action leans toward the pointer within 12px. */
      root.querySelectorAll<HTMLElement>('[data-w="magnetic-inner"]').forEach((inner) => {
        const button = inner.closest<HTMLElement>("a, button");
        if (!button) return;
        const mx = gsap.quickTo(button, "x", { duration: 0.4, ease: "power3.out" });
        const my = gsap.quickTo(button, "y", { duration: 0.4, ease: "power3.out" });
        listen(button, "pointermove", (event: PointerEvent) => {
          const box = button.getBoundingClientRect();
          mx(gsap.utils.clamp(-12, 12, (event.clientX - box.left - box.width / 2) * 0.3));
          my(gsap.utils.clamp(-12, 12, (event.clientY - box.top - box.height / 2) * 0.3));
        });
        listen(button, "pointerleave", () => { gsap.to(button, { x: 0, y: 0, duration: 0.8, ease: "elastic.out(1, 0.45)" }); });
      });
    }

    /* Hero recedes as the page scrolls on: the board drifts up and settles back a touch. Transform only. */
    const hero = root.querySelector<HTMLElement>('[data-w="hero"]');
    const board = hero?.querySelector<HTMLElement>('[data-w="board"]');
    if (hero && board) {
      gsap.to(board, { yPercent: -6, scale: 0.97, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true } });
    }

    /* Section headings rise word by word once, when they come into view. Only headings still below the fold are armed. */
    // The words are wrapped here, not on the server, to keep the HTML small. The heading keeps its text for assistive tech.
    root.querySelectorAll<HTMLElement>('[data-w="reveal"]').forEach((heading) => {
      if (!below(heading)) return;
      const text = heading.textContent ?? "";
      heading.setAttribute("aria-label", text);
      heading.innerHTML = "";
      const words = text.split(" ").map((word, i, all) => {
        const outer = document.createElement("span");
        outer.className = "w";
        outer.setAttribute("aria-hidden", "true");
        const inner = document.createElement("span");
        inner.textContent = word;
        outer.append(inner);
        heading.append(outer);
        if (i < all.length - 1) heading.append(" ");
        return inner;
      });
      restore.push(() => { heading.textContent = text; heading.removeAttribute("aria-label"); });
      gsap.from(words, { yPercent: 105, duration: 0.9, ease: "expo.out", stagger: 0.06, scrollTrigger: { trigger: heading, start: "top 88%", once: true } });
    });

    /* Area and tier cards lift in, staggered, once. */
    root.querySelectorAll<HTMLElement>("[data-w-group]").forEach((group) => {
      if (!below(group)) return;
      gsap.from(group.children, { y: 28, opacity: 0, duration: 0.8, ease: "expo.out", stagger: 0.08, scrollTrigger: { trigger: group, start: "top 85%", once: true } });
    });

    /* The rule band becomes a marquee: clone the list once (hidden from assistive tech) and start the loop. */
    const track = root.querySelector<HTMLElement>('[data-w="band-track"]');
    const list = track?.firstElementChild;
    if (track && list && !track.hasAttribute("data-loop")) {
      const copy = list.cloneNode(true) as HTMLElement;
      copy.setAttribute("aria-hidden", "true");
      track.append(copy);
      track.setAttribute("data-loop", "");
      restore.push(() => { copy.remove(); track.removeAttribute("data-loop"); });
    }

    /* Pause the marquee and the aurora while they are off screen. */
    for (const el of root.querySelectorAll<HTMLElement>('[data-w="band"], [data-w="aurora"]')) {
      ScrollTrigger.create({ trigger: el, start: "top bottom", end: "bottom top", onToggle: (self) => { el.dataset.paused = self.isActive ? "" : "1"; if (self.isActive) delete el.dataset.paused; } });
    }

    /* The story: scroll assembles the sample score rule by rule. Scrubbed, so scrolling back takes it apart again. */
    // Armed only while the rule list itself is still below the fold, so no visible rule is dimmed after the fact.
    const story = root.querySelector<HTMLElement>('[data-w="story"]');
    const storyList = story?.querySelector<HTMLElement>('[data-w="rules"]');
    if (story && storyList && below(storyList)) {
      const steps = JSON.parse(story.dataset.steps ?? "[]") as Step[];
      const rules = Array.from(story.querySelectorAll<HTMLElement>('[data-w="rule"]'));
      const fill = story.querySelector<HTMLElement>('[data-w="fill"]');
      const percent = story.querySelector<HTMLElement>('[data-w="percent"]');
      const earned = story.querySelector<HTMLElement>('[data-w="earned"]');
      const chipBox = story.querySelector<HTMLElement>('[data-w="chip"]');
      const chip = chipBox?.querySelector<HTMLElement>(".kit-chip");
      const chipLabel = chip?.querySelector<HTMLElement>(".kit-chip-label");
      const groups = Array.from(story.querySelectorAll<HTMLElement>('[data-w="group"]'));
      const list = storyList;
      if (steps.length === rules.length && fill && percent && earned && chipBox && chip && chipLabel) {
        const locale = story.dataset.locale === "sk" ? "sk-SK" : "en-GB";
        const fmt = new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
        const bands = JSON.parse(chipBox.dataset.bands ?? "[]") as string[];
        const labels = JSON.parse(chipBox.dataset.labels ?? "[]") as string[];
        const final = { percent: percent.textContent, earned: earned.textContent, state: chip.dataset.state ?? "", label: chipLabel.textContent, band: fill.dataset.band ?? "" };
        restore.push(() => {
          percent.textContent = final.percent;
          earned.textContent = final.earned;
          chip.dataset.state = final.state;
          chipLabel.textContent = final.label;
          fill.dataset.band = final.band;
          delete chipBox.dataset.scrub;
        });
        const bandAt = (p: number) => (p >= 72 ? 3 : p >= 60 ? 2 : p >= 48 ? 1 : 0);
        const state = { p: 0, e: 0 };
        let shownBand = -1;
        // While the score is assembling, the chip shows colour and label only; the final state's icon returns when it lands.
        const paint = () => {
          gsap.set(fill, { scaleX: state.p / 100 });
          percent.textContent = fmt.format(state.p / 100);
          earned.textContent = String(Math.round(state.e));
          const band = bandAt(state.p);
          if (band !== shownBand && bands[band]) {
            shownBand = band;
            chip.dataset.state = bands[band]!;
            chipLabel.textContent = labels[band] ?? "";
            fill.dataset.band = bands[band]!;
            if (bands[band] === final.state) delete chipBox.dataset.scrub;
            else chipBox.dataset.scrub = "";
          }
        };
        paint();
        // Pending rules keep full-contrast text; only the mark and the outcome wait to appear.
        const outcomes = rules.map((rule) => rule.querySelector('[data-w="outcome"]'));
        gsap.set(rules, { x: 14 });
        gsap.set(outcomes, { autoAlpha: 0 });
        gsap.set(rules.map((rule) => rule.querySelector(".kit-mark")), { scale: 0 });
        gsap.set(groups, { scaleX: 0 });

        const tl = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: list, start: "top 70%", end: "bottom 60%", scrub: 0.6 } });
        steps.forEach((step, i) => {
          tl.to(rules[i]!, { x: 0, duration: 0.5 }, i);
          tl.to(outcomes[i]!, { autoAlpha: 1, duration: 0.4 }, i + 0.1);
          tl.to(rules[i]!.querySelector(".kit-mark"), { scale: 1, duration: 0.35, ease: "back.out(2)" }, i + 0.1);
          tl.to(state, { p: step.p, e: step.e, duration: 1, onUpdate: paint }, i);
        });
        // Group bars fill across the rules of their group.
        let at = 0;
        for (const bar of groups) {
          const group = bar.dataset.group;
          const count = rules.filter((rule) => rule.closest("[data-group-id]")?.getAttribute("data-group-id") === group).length || 1;
          const final = Number(getComputedStyle(bar).getPropertyValue("--v")) || 0;
          tl.fromTo(bar, { scaleX: 0 }, { scaleX: final, duration: count }, at);
          at += count;
        }
      }
    }
  }, root);

  return () => {
    off.splice(0).forEach((fn) => fn());
    ctx.revert();
    restore.splice(0).forEach((fn) => fn());
    gsap.ticker.remove(tick);
    lenis.destroy();
    delete document.documentElement.dataset.smooth;
  };
}
