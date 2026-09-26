// story.js — the opening story: four illustrated panels (images/story-intro-1..4.webp).
// Shown once when a new career starts (title → Set Sail), and told again in Pause → The Story.
export const STORY = [
  { pic: 'story-intro-1', text: 'It is 1660, the age of the buccaneers. Your family sets sail from England for a new life across the ocean.' },
  { pic: 'story-intro-2', text: 'But a terrible storm scatters them. Your sister, your uncle, your aunt and your grandfather are carried off to faraway ports, and nobody knows quite where.' },
  { pic: 'story-intro-3', text: 'Years later, old Peg Leg Ted, who once sailed with your grandfather, lends you his sloop, the Sea Hare, and one piece of advice: "Every port has a story, and every story has a clue."' },
  { pic: 'story-intro-4', text: 'Trade, fight and charm your way from port to port. Win titles, dig up treasure and bring your family home. But every year at sea makes you older, so retire a hero before age catches up with you.' },
];

/** Full-screen story panels over `parent`. Tap / Next to advance, Skip to jump out. Calls onDone() once. */
export function showStory(ctx, parent, onDone) {
  const { h } = ctx.ui;
  ctx.ui.preload(STORY.map(s => s.pic));
  let i = 0, finished = false;
  const pic = h('div', { class: 'st-pic' }), text = h('div', { class: 'st-text' }), dots = h('div', { class: 'st-dots' });
  const next = h('button', { class: 'gold-btn st-next', onTap: e => { e && e.stopPropagation && e.stopPropagation(); step(1); } }, 'Next');
  const skip = h('button', { class: 'ink-btn st-skip', onTap: () => done() }, 'Skip');
  const el = h('div', { class: 'st-back blocker' },
    h('div', { class: 'navy-frame st-frame' },
      h('div', { class: 'st-in' }, pic,
        h('div', { class: 'parchment st-cap' }, text, h('div', { class: 'st-row' }, dots, h('div', { class: 'st-btns' }, skip, next))))));
  function show() {
    const s = STORY[i];
    pic.style.backgroundImage = `url(${ctx.ui.imgUrl(s.pic)})`;
    pic.classList.remove('in'); void pic.offsetWidth; pic.classList.add('in');
    text.textContent = s.text;
    dots.replaceChildren(...STORY.map((_, k) => h('span', { class: k === i ? 'on' : '' })));
    next.textContent = i === STORY.length - 1 ? 'Set sail!' : 'Next';
  }
  function step(d) { i += d; if (i >= STORY.length) return done(); show(); ctx.audio.play('click', { caption: false }); }
  function done() { if (finished) return; finished = true; el.remove(); onDone && onDone(); }
  parent.append(el); show();
  return { close: done };
}
