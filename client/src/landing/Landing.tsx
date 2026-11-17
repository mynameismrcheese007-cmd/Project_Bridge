import { useRef } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { gsap, ScrollTrigger, useGSAP } from '../lib/gsap';
import { MEDIA, useMagnetic, useSplitHeadline, type MotionConditions } from '../motion';
import './landing.css';

/**
 * The landing sections Guests see above the project feed.
 *
 * "The Span": a suspension bridge is built between a bank of student projects and a bank of
 * professionals. It is built in the order a real one is: banks, towers, deck from both sides,
 * cables, hangers. Scrolling then sends a signal across the deck; when it lands, the two sides are
 * connected. "How it works" keeps a diagram in view and draws one part of it for each step.
 *
 * Held sections use CSS `position: sticky`; GSAP only reads the scroll position, so nothing is
 * pinned by script. On phones and with reduced motion everything is simply laid out, fully drawn.
 */

// ---------------------------------------------------------------- Bridge geometry (viewBox 1200 × 400)
const DECK = 300;
const ANCHOR = { left: 170, right: 1030 };
const TOWER = { left: 390, right: 810, top: 100, foot: 352 };
const MID = 600;
/** Lowest point of the main cable, at mid-span. */
const SAG = 232;

/** Height of the main cable, a parabola between the tower tops. */
const mainCableY = (x: number) => SAG - (SAG - TOWER.top) * ((x - MID) / (MID - TOWER.left)) ** 2;
/** Height of the left side span (anchor to tower top), a curve that sags below the straight line. */
function sideCableY(x: number): number {
  const [x0, cx, x2] = [ANCHOR.left, 300, TOWER.left];
  const [y0, cy, y2] = [DECK, 225, TOWER.top];
  const a = x0 - 2 * cx + x2;
  const b = 2 * (cx - x0);
  const t = (-b + Math.sqrt(b * b - 4 * a * (x0 - x))) / (2 * a);
  return (1 - t) ** 2 * y0 + 2 * t * (1 - t) * cy + t ** 2 * y2;
}
const range = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

/** Hangers from cable to deck, ordered from mid-span outwards so they can drop in that order. */
const HANGERS: Array<{ x: number; y: number }> = [
  ...range(420, 780, 30).map((x) => ({ x, y: mainCableY(x) })),
  ...range(200, 360, 32).flatMap((x) => [
    { x, y: sideCableY(x) },
    { x: 1200 - x, y: sideCableY(x) },
  ]),
].sort((p, q) => Math.abs(p.x - MID) - Math.abs(q.x - MID));

const SHEETS = [22, 68, 114];
const PEOPLE = [1086, 1132, 1178];
const HATCH = range(18, 158, 20);
const tower = (x: number) => ({
  legs: [`M${x - 8} ${TOWER.foot}V${TOWER.top - 8}`, `M${x + 8} ${TOWER.foot}V${TOWER.top - 8}`],
  ties: `M${x - 8} 140h16M${x - 8} 200h16M${x - 8} 260h16M${x - 14} ${TOWER.top - 8}h28`,
});

const STEPS = [
  { n: '01', label: 'Post', title: 'Post your project', text: 'A student team writes up the idea, the problem and the solution, adds screenshots, and submits it. An Admin reviews it before anything goes public.' },
  { n: '02', label: 'Find', title: 'Get discovered', text: 'Published projects appear on Explore. Professionals search by name and filter by tags to find work in their field.' },
  { n: '03', label: 'Connect', title: 'Connect', text: 'A professional sends a contact request. When the team accepts, a private conversation opens. Email addresses are never shown.' },
  { n: '04', label: 'Collaborate', title: 'Collaborate', text: 'Feedback in comments, messages in private, and paid offers for the work a project needs. The tracker shows how far it has come.' },
];

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const headline = useSplitHeadline<HTMLHeadingElement>({ delay: 0.1 });
  const cta = useMagnetic<HTMLAnchorElement>(0.2);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      // `hold`: wide enough for the two-column layouts that the held sections need.
      gsap.matchMedia().add({ ...MEDIA, hold: '(min-width: 901px)' }, (ctx) => {
        const { reduce, hold } = ctx.conditions as MotionConditions & { hold: boolean };
        // With reduced motion the finished picture is shown: bridge built, signal across, sides connected.
        if (reduce) {
          el.classList.add('is-connected');
          return () => el.classList.remove('is-connected');
        }

        // ---- On load: the bridge is built in order. About two and a half seconds, slow to settle.
        const build = gsap.timeline({ defaults: { ease: 'circ.inOut' } });
        const stages: Array<[string, gsap.TweenVars, number]> = [
          ['.span-bank', { duration: 0.7 }, 0],
          ['.span-hatch', { duration: 0.3, stagger: 0.02 }, 0.25],
          ['.span-leg', { duration: 1, stagger: 0.06 }, 0.2],
          ['.span-tie', { duration: 0.5 }, 0.95],
          ['.span-deck', { duration: 1 }, 0.55],
          ['.span-cable', { duration: 1.05, stagger: 0.05 }, 0.95],
          ['.span-water', { duration: 0.8 }, 1.3],
          ['.span-hanger', { duration: 0.5, ease: 'circ.out', stagger: { amount: 0.6 } }, 1.55],
        ];
        for (const [targets, vars, at] of stages) build.from(targets, { drawSVG: '0%', ...vars }, at);
        build
          .from('.span-sheet, .span-person', { autoAlpha: 0, y: 14, duration: 0.7, ease: 'circ.out', stagger: 0.07 }, 1.6)
          // The signal and its read-out wait until there is a bridge to cross.
          .from('.span-note, .span-traveller, .span-status', { autoAlpha: 0, duration: 0.6, ease: 'power1.out' }, 2)
          .from('.landing-side > *', { autoAlpha: 0, y: 14, duration: 0.7, ease: 'circ.out', stagger: 0.08, clearProps: 'transform,opacity,visibility' }, 0.15);

        if (!hold) {
          // No held scroll on a narrow screen: the signal simply crosses once the bridge is up.
          build.from('.span-cross', { drawSVG: '0%', duration: 1.1 }, 2.1).call(() => el.classList.add('is-connected'), [], 3.1);
          return () => el.classList.remove('is-connected');
        }
        el.classList.add('is-live');
        const nav = document.querySelector<HTMLElement>('.navbar')?.offsetHeight ?? 0;
        el.style.setProperty('--l-nav', `${nav}px`);

        // ---- On scroll: a signal crosses the deck while the hero is held. When it lands, the sides are connected.
        const status = el.querySelector<HTMLElement>('.span-status b');
        const crossing = gsap
          .timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
              trigger: '.landing-stage',
              start: `top ${nav}px`,
              end: 'bottom bottom',
              scrub: 0.6,
              onUpdate: (self) => {
                if (!status) return;
                const p = self.progress;
                status.textContent = p < 0.02 ? 'Scroll to cross' : p > 0.86 ? 'Connected' : `Crossing ${String(Math.round((p / 0.86) * 100)).padStart(2, '0')}%`;
                el.classList.toggle('is-connected', p > 0.86);
              },
            },
          })
          .fromTo('.span-cross', { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.86 }, 0)
          .fromTo('.span-traveller', { x: 0 }, { x: ANCHOR.right - ANCHOR.left, duration: 0.86 }, 0)
          .to({}, { duration: 0.14 });

        // ---- How it works: each step draws its part of the diagram as it passes, and undraws on the way back.
        const steps = gsap.utils.toArray<HTMLElement>('.how-step', el);
        const parts = gsap.utils.toArray<SVGGElement>('.how-part', el);
        const count = el.querySelector<HTMLElement>('.how-count b');
        const setActive = (index: number) => {
          steps.forEach((s, i) => s.classList.toggle('is-active', i === index));
          if (count) count.textContent = STEPS[index].n;
          el.style.setProperty('--how-p', String((index + 1) / steps.length));
        };
        setActive(0);
        steps.forEach((step, i) => {
          // The first part starts with the section itself, so the diagram is never an empty frame.
          const range = i === 0 ? { trigger: '.how', start: 'top 72%', end: 'top 22%' } : { trigger: step, start: 'top 80%', end: 'top 42%' };
          gsap
            .timeline({ defaults: { ease: 'none' }, scrollTrigger: { ...range, scrub: 0.5 } })
            .fromTo(parts[i], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12 }, 0)
            .fromTo(parts[i].querySelectorAll('.draw'), { drawSVG: '0%' }, { drawSVG: '100%', duration: 1, stagger: 0.12 }, 0)
            .fromTo(parts[i].querySelectorAll('text, .how-node'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.8);
          ScrollTrigger.create({ trigger: step, start: 'top 62%', end: 'bottom 62%', onToggle: (self) => self.isActive && setActive(i) });
        });

        // A jump past the whole section (a link, the Home key) still leaves the right step lit.
        ScrollTrigger.create({ trigger: '.how', start: 'top 62%', end: 'bottom 62%', onLeaveBack: () => setActive(0), onLeave: () => setActive(steps.length - 1) });

        return () => {
          crossing.kill();
          el.classList.remove('is-live', 'is-connected');
          el.style.removeProperty('--how-p');
          steps.forEach((s) => s.classList.remove('is-active'));
        };
      });
    },
    { scope: root },
  );

  function toFeed() {
    document.getElementById('feed')?.scrollIntoView({ behavior: window.matchMedia(MEDIA.reduce).matches ? 'auto' : 'smooth' });
  }

  const [left, right] = [tower(TOWER.left), tower(TOWER.right)];

  return (
    <div ref={root} className="landing">
      <div className="landing-stage">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-inner">
            <div className="landing-head">
              <div className="landing-copy">
                <p className="annotation">Span 01 / Students to industry</p>
                <h1 ref={headline} id="landing-title">
                  The bridge between university projects and the industry that needs them.
                </h1>
              </div>
              <div className="landing-side">
                <p className="landing-lead">Students publish what they are building. Professionals find it, give feedback, and offer real work. ProjectBridge is where the two sides meet.</p>
                <div className="landing-actions">
                  <Link ref={cta} to="/register" className="btn btn-signal btn-lg">
                    Create a free account
                  </Link>
                  <button type="button" className="btn btn-lg landing-ghost" onClick={toFeed}>
                    Browse projects <Icon name="arrow-right" />
                  </button>
                </div>
              </div>
            </div>

            <div className="span-wrap">
              <p className="span-status" aria-hidden="true">
                <i />
                <b>Scroll to cross</b>
              </p>
              <svg className="span-scene" viewBox="0 0 1200 400" role="img" aria-label="A suspension bridge joining a bank of student projects to a bank of professionals.">
                {/* The two banks, with ground hatching as on a drawing, and the water between them */}
                <path className="span-bank" d={`M0 ${DECK}H${ANCHOR.left}V${TOWER.foot}`} />
                <path className="span-bank" d={`M1200 ${DECK}H${ANCHOR.right}V${TOWER.foot}`} />
                {HATCH.map((x) => (
                  <g key={x}>
                    <path className="span-hatch" d={`M${x} ${DECK}l-10 12`} />
                    <path className="span-hatch" d={`M${1200 - x} ${DECK}l10 12`} />
                  </g>
                ))}
                <path className="span-water" d={`M${ANCHOR.left + 8} ${TOWER.foot}H${ANCHOR.right - 8}`} />

                {/* Towers: legs rise from the water, then the ties across them */}
                {[...left.legs, ...right.legs].map((d) => (
                  <path key={d} className="span-leg" d={d} />
                ))}
                <path className="span-tie" d={left.ties} />
                <path className="span-tie" d={right.ties} />

                {/* Deck, built from both banks until the halves meet */}
                <path className="span-deck" d={`M${ANCHOR.left} ${DECK}H${MID}`} />
                <path className="span-deck" d={`M${ANCHOR.right} ${DECK}H${MID}`} />

                {/* Cables: over each tower and down to mid-span */}
                <path className="span-cable" d={`M${ANCHOR.left} ${DECK}Q300 225 ${TOWER.left} ${TOWER.top}`} />
                <path className="span-cable" d={`M${ANCHOR.right} ${DECK}Q900 225 ${TOWER.right} ${TOWER.top}`} />
                <path className="span-cable" d={`M${TOWER.left} ${TOWER.top}Q495 ${SAG} ${MID} ${SAG}`} />
                <path className="span-cable" d={`M${TOWER.right} ${TOWER.top}Q705 ${SAG} ${MID} ${SAG}`} />
                {HANGERS.map(({ x, y }) => (
                  <path key={x} className="span-hanger" d={`M${x} ${y.toFixed(1)}V${DECK}`} />
                ))}

                {/* Bank A: project sheets. Bank B: the professionals. */}
                {SHEETS.map((x) => (
                  <g key={x} className="span-sheet">
                    <rect x={x} y={DECK - 44} width="30" height="42" />
                    <path d={`M${x + 6} ${DECK - 32}h18M${x + 6} ${DECK - 24}h18M${x + 6} ${DECK - 16}h11`} />
                  </g>
                ))}
                {PEOPLE.map((x) => (
                  <g key={x} className="span-person">
                    <circle cx={x} cy={DECK - 34} r="9" />
                    <path d={`M${x - 14} ${DECK - 2}v-6a14 14 0 0 1 28 0v6`} />
                  </g>
                ))}

                {/* The signal that crosses on scroll */}
                <path className="span-cross" d={`M${ANCHOR.left} ${DECK}H${ANCHOR.right}`} />
                <circle className="span-traveller" cx={ANCHOR.left} cy={DECK} r="7" />

                {/* Drawing notes */}
                <g className="span-note">
                  <text x="22" y="384">
                    BANK A / STUDENTS
                  </text>
                  <text x="1178" y="384" textAnchor="end">
                    BANK B / INDUSTRY
                  </text>
                  <path d={`M${TOWER.left} 376H${MID - 48}M${MID + 48} 376H${TOWER.right}M${TOWER.left} 370v12M${TOWER.right} 370v12`} />
                  <text x={MID} y="380" textAnchor="middle">
                    MAIN SPAN
                  </text>
                </g>
              </svg>
            </div>
          </div>
        </section>
      </div>

      <section className="how" aria-labelledby="how-title">
        <div className="landing-inner how-inner">
          <div className="how-copy">
            <p className="annotation">Span 02 / How it works</p>
            <h2 id="how-title">Four steps from an idea to a working connection</h2>
            <ol className="how-steps">
              {STEPS.map((s) => (
                <li key={s.n} className="how-step">
                  <p className="how-n">
                    <span>{s.n}</span> {s.label}
                  </p>
                  <h3>{s.title}</h3>
                  <p className="how-text">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="how-side" aria-hidden="true">
            <div className="how-sticky">
              <p className="how-count">
                <b>01</b>
                <span className="how-track">
                  <i />
                </span>
                <span>04</span>
              </p>
              <svg className="how-diagram" viewBox="0 0 520 380" focusable="false">
                {/* 01 Post: the student bank, and a project sheet placed on it */}
                <g className="how-part">
                  <path className="draw" d="M20 300h150" />
                  <path className="draw" d="M150 300V150" />
                  <path className="draw how-sheet" d="M40 170h70v92H40z" />
                  <path className="draw" d="M52 190h46M52 206h46M52 222h30" />
                  <text x="20" y="330">01 / POST</text>
                </g>
                {/* 02 Find: the deck reaches the far bank, where someone is looking */}
                <g className="how-part">
                  <path className="draw" d="M150 260h220" />
                  <path className="draw" d="M370 300V150" />
                  <path className="draw" d="M350 300h150" />
                  <path className="draw" d="M420 196a22 22 0 1 0 0 44a22 22 0 0 0 0-44m16 38 16 16" />
                  <text x="370" y="330">02 / FIND</text>
                </g>
                {/* 03 Connect: the cable between the two towers */}
                <g className="how-part">
                  <path className="draw how-signal" d="M150 150Q260 290 370 150" />
                  <circle className="how-node" cx="150" cy="150" r="7" />
                  <circle className="how-node" cx="370" cy="150" r="7" />
                  <text x="205" y="120">03 / CONNECT</text>
                </g>
                {/* 04 Collaborate: hangers carry the load, and work moves both ways */}
                <g className="how-part">
                  <path className="draw" d="M195 201V260M230 219V260M260 222V260M290 219V260M325 201V260" />
                  <path className="draw how-signal" d="M196 70h128m-12-10 12 10-12 10M324 92H196m12-10-12 10 12 10" />
                  <text x="196" y="50">04 / COLLABORATE</text>
                </g>
              </svg>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
