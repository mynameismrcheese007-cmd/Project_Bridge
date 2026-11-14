import { useRef } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { gsap, useGSAP } from '../lib/gsap';
import { DURATION, EASE, MEDIA, STAGGER, useMagnetic, useSplitHeadline, type MotionConditions } from '../motion';
import './landing.css';

/** Hanger positions under the main cable: x on the deck, y where it meets the cable. */
const HANGERS: Array<[number, number]> = [
  [420, 158],
  [480, 192],
  [540, 213],
  [600, 220],
  [660, 213],
  [720, 192],
  [780, 158],
];
const STUDENTS: Array<[number, number]> = [
  [100, 205],
  [130, 240],
  [70, 272],
  [190, 276],
];
const INDUSTRY: Array<[number, number]> = [
  [1100, 205],
  [1070, 240],
  [1130, 272],
  [1010, 276],
];
/** The connections drawn as the visitor scrolls: a student node joined to an industry node. */
const LINKS = ['M100 205 C420 -20 780 -20 1100 205', 'M130 240 C430 40 770 40 1070 240', 'M190 276 C460 110 740 110 1010 276'];

const STEPS = [
  { n: '01', title: 'Post your project', text: 'A student team writes up the idea, the problem and the solution, adds screenshots, and submits it. An Admin reviews it before anything goes public.' },
  { n: '02', title: 'Get discovered', text: 'Published projects appear on Explore. Professionals search by name and filter by tags to find work in their field.' },
  { n: '03', title: 'Connect', text: 'A professional sends a contact request. When the team accepts, a private conversation opens. Email addresses are never shown.' },
  { n: '04', title: 'Collaborate', text: 'Feedback in comments, messages in private, and paid offers for the work a project needs. The bulletin shows how far it has come.' },
];

/**
 * The landing sections Guests see above the project feed.
 *
 * "The Span": a bridge draws itself between a student bank and an industry bank; scrolling draws
 * the connections between matching nodes. Then "How it works", pinned on wide screens, each step
 * drawing its part of the diagram. With reduced motion everything is simply shown.
 */
export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const headline = useSplitHeadline<HTMLHeadingElement>({ delay: 0.15 });
  const cta = useMagnetic<HTMLAnchorElement>(0.2);

  useGSAP(
    () => {
      gsap.matchMedia().add(MEDIA, (ctx) => {
        const { reduce, wide } = ctx.conditions as MotionConditions;
        if (reduce) {
          gsap.from('.landing-copy > *, .span-scene', { autoAlpha: 0, duration: DURATION.fade, stagger: 0.05, clearProps: 'opacity,visibility' });
          return;
        }

        // On load: the structure draws, then the nodes take their places. About 1.4s in all.
        gsap
          .timeline({ defaults: { ease: EASE.travel } })
          .from('.span-stroke', { drawSVG: '0%', duration: DURATION.draw, stagger: { amount: 0.5 } })
          .from('.span-node', { scale: 0, autoAlpha: 0, transformOrigin: '50% 50%', duration: 0.4, ease: EASE.lock, stagger: 0.04 }, '-=0.45')
          .from('.span-label', { autoAlpha: 0, y: 10, duration: 0.5, ease: EASE.enter, stagger: STAGGER.list, clearProps: 'transform,opacity,visibility' }, '<')
          // The words come first and are never held back by the drawing: they are what people came to read.
          .from('.landing-copy > :not(h1)', { autoAlpha: 0, y: 10, duration: 0.4, ease: EASE.enter, stagger: STAGGER.list, clearProps: 'transform,opacity,visibility' }, 0);

        // On scroll: cables connect matching nodes. The scroll position is the timeline.
        gsap.from('.span-link', {
          drawSVG: '0%',
          ease: 'none',
          stagger: 0.25,
          scrollTrigger: { trigger: '.landing-hero', start: 'top top', end: 'bottom 45%', scrub: 0.6 },
        });

        // How it works: pinned, one step at a time, each drawing its part. Wide screens only.
        if (!wide) return;
        const steps = gsap.utils.toArray<HTMLElement>('.how-step');
        const parts = gsap.utils.toArray<SVGGElement>('.how-part');
        gsap.set(steps, { autoAlpha: 0.4 });
        gsap.set(parts, { autoAlpha: 0 });
        const tl = gsap.timeline({
          defaults: { ease: EASE.enter },
          scrollTrigger: { trigger: '.how', start: 'top top+=72', end: '+=220%', pin: true, scrub: 0.5, anticipatePin: 1 },
        });
        steps.forEach((step, i) => {
          tl.to(step, { autoAlpha: 1, duration: 0.3 }, i)
            .set(parts[i], { autoAlpha: 1 }, i)
            .from(parts[i].querySelectorAll('.draw'), { drawSVG: '0%', duration: 0.7, stagger: 0.08 }, i);
          if (i > 0) tl.to(steps[i - 1], { autoAlpha: 0.4, duration: 0.3 }, i);
        });
        tl.to({}, { duration: 0.4 });
      });
    },
    { scope: root },
  );

  function toFeed() {
    document.getElementById('feed')?.scrollIntoView({ behavior: window.matchMedia(MEDIA.reduce).matches ? 'auto' : 'smooth' });
  }

  return (
    <div ref={root} className="landing">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-inner">
          <div className="landing-copy">
            <p className="annotation">Span 01 / Students to industry</p>
            <h1 ref={headline} id="landing-title">
              The bridge between university projects and the industry that needs them.
            </h1>
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

          <svg className="span-scene" viewBox="0 0 1200 380" role="img" aria-label="A bridge joining a group of students on one bank to a group of professionals on the other.">
            {/* Banks and water */}
            <path className="span-stroke span-ground" d="M0 330h250" />
            <path className="span-stroke span-ground" d="M950 330h250" />
            <path className="span-water" d="M262 344h676" />
            {/* Structure */}
            <path className="span-stroke" d="M120 300h960" />
            <path className="span-stroke" d="M360 300V104M840 300V104" />
            <path className="span-stroke span-cable" d="M120 300Q240 150 360 110Q600 330 840 110Q960 150 1080 300" />
            {HANGERS.map(([x, y]) => (
              <path key={x} className="span-stroke span-hanger" d={`M${x} ${y}V300`} />
            ))}
            {/* Connections, drawn by scrolling */}
            {LINKS.map((d) => (
              <path key={d} className="span-link" d={d} />
            ))}
            {STUDENTS.map(([x, y]) => (
              <circle key={`s${x}`} className="span-node span-node-student" cx={x} cy={y} r="9" />
            ))}
            {INDUSTRY.map(([x, y]) => (
              <circle key={`i${x}`} className="span-node span-node-industry" cx={x} cy={y} r="9" />
            ))}
            <text className="span-label" x="20" y="362">
              BANK A / STUDENTS
            </text>
            <text className="span-label" x="1180" y="362" textAnchor="end">
              BANK B / INDUSTRY
            </text>
          </svg>
        </div>
      </section>

      <section className="how" aria-labelledby="how-title">
        <div className="landing-inner how-inner">
          <div className="how-copy">
            <p className="annotation">Span 02 / How it works</p>
            <h2 id="how-title">Four steps from an idea to a working connection</h2>
            <ol className="how-steps">
              {STEPS.map((s) => (
                <li key={s.n} className="how-step">
                  <span className="how-n">{s.n}</span>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <svg className="how-diagram" viewBox="0 0 520 380" aria-hidden="true" focusable="false">
            {/* 01 Post: the student bank, and a project sheet placed on it */}
            <g className="how-part">
              <path className="draw" d="M20 300h150" />
              <path className="draw" d="M150 300V150" />
              <path className="draw how-sheet" d="M40 170h70v92H40z" />
              <path className="draw" d="M52 190h46M52 206h46M52 222h30" />
              <text x="20" y="330">01 / POST</text>
            </g>
            {/* 02 Discovered: the deck reaches the far bank */}
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
            {/* 04 Collaborate: hangers carry the load both ways */}
            <g className="how-part">
              <path className="draw" d="M195 201V260M230 219V260M260 222V260M290 219V260M325 201V260" />
              <path className="draw how-signal" d="M196 70h128m-12-10 12 10-12 10M324 92H196m12-10-12 10 12 10" />
              <text x="196" y="50">04 / COLLABORATE</text>
            </g>
          </svg>
        </div>
      </section>
    </div>
  );
}
